import { requireAuth } from '../../../utils/auth-guard'
import { prisma } from '../../../utils/db'
import {
  syncPlannedWorkoutToIntervals,
  autoUploadPlannedWorkoutToIntervalsIfEnabled
} from '../../../utils/intervals-sync'
import { isIntervalsEventId } from '../../../utils/intervals'
import { validateRecommendationAcceptanceTarget } from '../../../utils/recommendation-guardrails'
import { enqueuePlannedWorkoutStructureGeneration } from '../../../utils/planned-workout-structure-trigger'

defineRouteMeta({
  openAPI: {
    tags: ['Recommendations'],
    summary: 'Accept recommendation',
    description: 'Accepts the suggested modifications and updates the planned workout.',
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                message: { type: 'string' }
              }
            }
          }
        }
      },
      401: { description: 'Unauthorized' },
      404: { description: 'Recommendation not found' },
      400: { description: 'Invalid recommendation state' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event, ['recommendation:read'])
  const userId = user.id
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: 'Missing recommendation ID' })
  }

  // Fetch the recommendation with the user check
  const recommendation = await prisma.activityRecommendation.findUnique({
    where: { id },
    include: { plannedWorkout: { include: { completedWorkouts: true } } }
  })

  if (!recommendation || recommendation.userId !== userId) {
    throw createError({ statusCode: 404, message: 'Recommendation not found' })
  }

  if (recommendation.userAccepted) {
    throw createError({ statusCode: 400, message: 'Recommendation already accepted' })
  }

  const analysis = recommendation.analysisJson as any
  const modifications = analysis?.suggested_modifications
  const targetSnapshot = analysis?.guardrails?.targetPlannedWorkout

  if (!modifications) {
    throw createError({ statusCode: 400, message: 'No suggested modifications found' })
  }

  // Older recommendations may have a target snapshot but no persisted relation.
  // Recover only the exact, owned target recorded at generation time; the normal
  // guardrail validation below still rejects a changed, completed, or ambiguous workout.
  const targetWorkout =
    recommendation.plannedWorkout ||
    (targetSnapshot?.id
      ? await prisma.plannedWorkout.findFirst({
          where: { id: targetSnapshot.id, userId },
          include: { completedWorkouts: true }
        })
      : null)

  // Prepare the new description (completely replacing the old one)
  const newDescription = `${modifications.description || ''}${modifications.zone_adjustments ? `\n\nZone Adjustments: ${modifications.zone_adjustments}` : ''}`
  const type =
    modifications.new_type === 'Gym' ? 'WeightTraining' : modifications.new_type || 'Ride'
  const title =
    modifications.new_title?.trim() ||
    (type === 'Rest' ? 'Rest Day' : targetWorkout?.title || 'Updated Workout')
  const durationSec =
    modifications.new_duration_min !== undefined && modifications.new_duration_min !== null
      ? Math.round(modifications.new_duration_min * 60)
      : undefined

  const activeWorkoutCountForDate = await prisma.plannedWorkout.count({
    where: {
      userId,
      date: recommendation.date,
      completed: { not: true },
      completedWorkouts: { none: {} }
    }
  })

  const canCreateWorkoutFromUntargetedRecommendation =
    !recommendation.plannedWorkoutId && !targetSnapshot?.id && activeWorkoutCountForDate === 0

  if (!canCreateWorkoutFromUntargetedRecommendation) {
    const validation = validateRecommendationAcceptanceTarget({
      recommendationDate: recommendation.date,
      currentWorkout: targetWorkout,
      targetSnapshot,
      activeWorkoutCountForDate
    })

    if (!validation.ok) {
      throw createError({
        statusCode: 409,
        message: validation.message
      })
    }
  }

  let targetPlannedWorkoutId = targetWorkout?.id || recommendation.plannedWorkoutId
  const nextSyncStatus = (syncStatus: string | null | undefined) =>
    syncStatus === 'LOCAL_ONLY' ? 'LOCAL_ONLY' : 'PENDING'

  let updatedWorkout

  if (targetPlannedWorkoutId) {
    updatedWorkout = await prisma.plannedWorkout.update({
      where: { id: targetPlannedWorkoutId },
      data: {
        title,
        type,
        durationSec,
        tss: modifications.new_tss,
        description: newDescription,
        modifiedLocally: true,
        syncStatus: nextSyncStatus(targetWorkout?.syncStatus),
        syncError: null
      }
    })
  } else {
    updatedWorkout = await prisma.plannedWorkout.create({
      data: {
        userId,
        externalId: `recommendation-${id}`,
        date: recommendation.date,
        title,
        description: newDescription,
        type,
        durationSec,
        tss: modifications.new_tss,
        completed: false,
        modifiedLocally: true,
        syncStatus: 'LOCAL_ONLY',
        syncError: null,
        rawJson: {},
        managedBy: 'COACH_WATTS'
      }
    })
    targetPlannedWorkoutId = updatedWorkout.id
  }

  const requiresStructure = updatedWorkout.type !== 'Rest'

  // For newly created local workouts, publish the shell first when auto-upload is enabled
  // so the background structure generation can sync the final intervals back to the same event.
  const isLocal =
    updatedWorkout.syncStatus === 'LOCAL_ONLY' || !isIntervalsEventId(updatedWorkout.externalId)
  if (requiresStructure && isLocal) {
    await autoUploadPlannedWorkoutToIntervalsIfEnabled({
      id: updatedWorkout.id,
      userId,
      externalId: updatedWorkout.externalId,
      date: updatedWorkout.date,
      startTime: updatedWorkout.startTime,
      title: updatedWorkout.title,
      description: updatedWorkout.description,
      type: updatedWorkout.type,
      durationSec: updatedWorkout.durationSec,
      tss: updatedWorkout.tss,
      managedBy: updatedWorkout.managedBy
    })

    updatedWorkout =
      (await prisma.plannedWorkout.findUnique({
        where: { id: updatedWorkout.id }
      })) || updatedWorkout
  }

  // Trigger regeneration of structured workout based on the new description/title/params.
  // The generation task is responsible for syncing the final structure to Intervals.
  if (requiresStructure) {
    const queued = await enqueuePlannedWorkoutStructureGeneration({
      userId,
      plannedWorkoutId: targetPlannedWorkoutId!,
      source: 'recommendation'
    })
    if (queued.status !== 'queued') {
      console.error(
        'Failed to trigger structure generation after recommendation accept:',
        queued.error
      )
    }
  } else if (!isLocal) {
    // Rest-day or metadata-only updates can sync immediately because no structured steps are pending.
    await syncPlannedWorkoutToIntervals(
      'UPDATE',
      {
        id: updatedWorkout.id,
        externalId: updatedWorkout.externalId,
        date: updatedWorkout.date,
        title: updatedWorkout.title,
        description: updatedWorkout.description,
        type: updatedWorkout.type,
        durationSec: updatedWorkout.durationSec,
        tss: updatedWorkout.tss,
        managedBy: updatedWorkout.managedBy
      },
      userId
    )
  }

  // Mark recommendation as accepted
  await prisma.activityRecommendation.update({
    where: { id },
    data: {
      userAccepted: true,
      plannedWorkoutId: targetPlannedWorkoutId
    }
  })

  return {
    success: true,
    message: 'Workout updated successfully'
  }
})
