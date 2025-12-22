import { getServerSession } from '#auth'
import { tasks } from "@trigger.dev/sdk/v3";

defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'Analyze workout',
    description: 'Triggers AI analysis for a specific workout.',
    parameters: [
      {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' }
      }
    ],
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                workoutId: { type: 'string' },
                jobId: { type: 'string' },
                status: { type: 'string' },
                message: { type: 'string' }
              }
            }
          }
        }
      },
      401: { description: 'Unauthorized' },
      404: { description: 'Workout not found' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  
  if (!session?.user) {
    throw createError({ 
      statusCode: 401,
      message: 'Unauthorized' 
    })
  }
  
  const id = getRouterParam(event, 'id')
  
  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Workout ID is required'
    })
  }
  
  // Fetch the workout
  const workout = await workoutRepository.getById(id, (session.user as any).id)
  
  if (!workout) {
    throw createError({
      statusCode: 404,
      message: 'Workout not found'
    })
  }
  
  // Check if already processing (prevent duplicate concurrent analyses)
  if (workout.aiAnalysisStatus === 'PROCESSING') {
    return {
      success: true,
      workoutId: id,
      status: 'PROCESSING',
      message: 'Analysis is currently being generated'
    }
  }
  
  try {
    // Update status to PENDING
    await workoutRepository.updateStatus(id, 'PENDING')
    
    // Trigger background job with per-user concurrency
    const handle = await tasks.trigger('analyze-workout', {
      workoutId: id
    }, {
      concurrencyKey: (session.user as any).id
    })
    
    return {
      success: true,
      workoutId: id,
      jobId: handle.id,
      status: 'PENDING',
      message: 'Workout analysis started'
    }
  } catch (error) {
    // Update status to failed
    await workoutRepository.updateStatus(id, 'FAILED')
    
    throw createError({
      statusCode: 500,
      message: `Failed to trigger workout analysis: ${error instanceof Error ? error.message : 'Unknown error'}`
    })
  }
})