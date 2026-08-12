import { prisma } from './db'
import {
  syncPlannedWorkoutToIntervals,
  autoUploadPlannedWorkoutToIntervalsIfEnabled
} from './intervals-sync'
import { isIntervalsEventId } from './intervals'
import { validateRecommendationAcceptanceTarget } from './recommendation-guardrails'
import { enqueuePlannedWorkoutStructureGeneration } from './planned-workout-structure-trigger'
import { recommendationRepository } from './repositories/recommendationRepository'
import { activityRecommendationRepository } from './repositories/activityRecommendationRepository'
import { athleteMetricsService } from './athleteMetricsService'

export async function acceptActivityRecommendation(userId: string, recommendationId: string) {
  const recommendation = await prisma.activityRecommendation.findUnique({
    where: { id: recommendationId },
    include: { plannedWorkout: { include: { completedWorkouts: true } } }
  })

  if (!recommendation || recommendation.userId !== userId) {
    return { error: 'Recommendation not found' }
  }

  if (recommendation.userAccepted) {
    return { error: 'Recommendation already accepted' }
  }

  const analysis = recommendation.analysisJson as any
  const modifications = analysis?.suggested_modifications
  const targetSnapshot = analysis?.guardrails?.targetPlannedWorkout

  if (!modifications) {
    return { error: 'No suggested modifications found' }
  }

  // Recommendations created before the planned-workout relation was persisted
  // can still carry an exact guardrail snapshot. Resolve that owned target and
  // let the existing guardrails decide whether it remains safe to change.
  const targetWorkout =
    recommendation.plannedWorkout ||
    (targetSnapshot?.id
      ? await prisma.plannedWorkout.findFirst({
          where: { id: targetSnapshot.id, userId },
          include: { completedWorkouts: true }
        })
      : null)

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
      return { error: validation.message, code: 'conflict' }
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
        externalId: `recommendation-${recommendationId}`,
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

  let structureGenerationRunId: string | undefined

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
    } else if (queued.status === 'queued') {
      structureGenerationRunId = queued.generationRunId
    }
  } else if (!isLocal) {
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

  await prisma.activityRecommendation.update({
    where: { id: recommendationId },
    data: {
      userAccepted: true,
      plannedWorkoutId: targetPlannedWorkoutId,
      status: 'COMPLETED'
    }
  })

  return {
    success: true,
    message: 'Recommendation accepted and workout updated',
    source: 'activity_recommendation' as const,
    planned_workout_id: targetPlannedWorkoutId,
    generation_run_id: structureGenerationRunId
  }
}

export async function dismissRecommendation(
  userId: string,
  recommendationId: string,
  source: 'activity' | 'profile' = 'profile'
) {
  if (source === 'activity') {
    const rec = await activityRecommendationRepository.findById(recommendationId, userId)
    if (!rec) return { error: 'Recommendation not found' }

    await activityRecommendationRepository.update(recommendationId, userId, {
      status: 'DISMISSED',
      userAccepted: false
    })

    return {
      success: true,
      message: 'Activity recommendation dismissed',
      source: 'activity_recommendation' as const
    }
  }

  const rec = await recommendationRepository.findById(recommendationId, userId)
  if (!rec) return { error: 'Recommendation not found' }

  await recommendationRepository.update(recommendationId, userId, {
    status: 'DISMISSED'
  })

  return {
    success: true,
    message: 'Recommendation dismissed',
    source: 'profile_recommendation' as const
  }
}

export async function completeProfileRecommendation(userId: string, recommendationId: string) {
  const rec = await recommendationRepository.findById(recommendationId, userId)
  if (!rec) return { error: 'Recommendation not found' }

  await athleteMetricsService.applyThresholdRecommendation(rec)
  await recommendationRepository.update(recommendationId, userId, {
    status: 'COMPLETED',
    completedAt: new Date()
  })

  return {
    success: true,
    message: 'Recommendation completed',
    source: 'profile_recommendation' as const
  }
}
