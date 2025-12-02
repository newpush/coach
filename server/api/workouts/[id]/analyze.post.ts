import { getServerSession } from '#auth'
import { tasks } from "@trigger.dev/sdk/v3";

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
  const workout = await prisma.workout.findUnique({
    where: { id }
  })
  
  if (!workout) {
    throw createError({
      statusCode: 404,
      message: 'Workout not found'
    })
  }
  
  // Ensure the workout belongs to the authenticated user
  if (workout.userId !== (session.user as any).id) {
    throw createError({
      statusCode: 403,
      message: 'Forbidden: You do not have access to this workout'
    })
  }
  
  // Check if already completed
  if (workout.aiAnalysisStatus === 'COMPLETED' && workout.aiAnalysis) {
    return {
      success: true,
      workoutId: id,
      status: 'COMPLETED',
      analysis: workout.aiAnalysis,
      analyzedAt: workout.aiAnalyzedAt,
      message: 'Analysis already exists'
    }
  }
  
  // Check if already processing
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
    await prisma.workout.update({
      where: { id },
      data: { aiAnalysisStatus: 'PENDING' }
    })
    
    // Trigger background job
    const handle = await tasks.trigger('analyze-workout', {
      workoutId: id
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
    await prisma.workout.update({
      where: { id },
      data: { aiAnalysisStatus: 'FAILED' }
    })
    
    throw createError({
      statusCode: 500,
      message: `Failed to trigger workout analysis: ${error instanceof Error ? error.message : 'Unknown error'}`
    })
  }
})