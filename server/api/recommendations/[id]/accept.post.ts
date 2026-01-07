import { getServerSession } from '../../../utils/session'
import { prisma } from '../../../utils/db'
import { tasks } from '@trigger.dev/sdk/v3'

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
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const userId = (session.user as any).id
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: 'Missing recommendation ID' })
  }

  // Fetch the recommendation with the user check
  const recommendation = await prisma.activityRecommendation.findUnique({
    where: { id },
    include: { plannedWorkout: true }
  })

  if (!recommendation || recommendation.userId !== userId) {
    throw createError({ statusCode: 404, message: 'Recommendation not found' })
  }

  if (!recommendation.plannedWorkoutId) {
    throw createError({
      statusCode: 400,
      message: 'No planned workout linked to this recommendation'
    })
  }

  if (recommendation.userAccepted) {
    throw createError({ statusCode: 400, message: 'Recommendation already accepted' })
  }

  const analysis = recommendation.analysisJson as any
  const modifications = analysis?.suggested_modifications

  if (!modifications) {
    throw createError({ statusCode: 400, message: 'No suggested modifications found' })
  }

  // Prepare the new description (completely replacing the old one)
  const newDescription = `${modifications.description}${modifications.zone_adjustments ? `\n\nZone Adjustments: ${modifications.zone_adjustments}` : ''}`

  // Update Planned Workout
  await prisma.plannedWorkout.update({
    where: { id: recommendation.plannedWorkoutId },
    data: {
      title: modifications.new_title,
      durationSec: modifications.new_duration_min
        ? Math.round(modifications.new_duration_min * 60)
        : undefined,
      tss: modifications.new_tss,
      description: newDescription,
      modifiedLocally: true
      // We explicitly DO NOT clear structuredWorkout here because we want the user to see the old one
      // while the new one generates in the background. The generation task will overwrite it.
    }
  })

  // Trigger regeneration of structured workout based on the new description/title/params
  await tasks.trigger('generate-structured-workout', {
    plannedWorkoutId: recommendation.plannedWorkoutId
  })

  // Mark recommendation as accepted
  await prisma.activityRecommendation.update({
    where: { id },
    data: {
      userAccepted: true
    }
  })

  return {
    success: true,
    message: 'Workout updated successfully'
  }
})
