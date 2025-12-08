import { getServerSession } from '#auth'
import { prisma } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  
  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }
  
  const userId = (session.user as any).id
  const plannedWorkoutId = event.context.params?.id
  const body = await readBody(event)
  
  if (!plannedWorkoutId) {
    throw createError({
      statusCode: 400,
      message: 'Planned workout ID is required'
    })
  }
  
  if (!body.workoutId) {
    throw createError({
      statusCode: 400,
      message: 'Workout ID is required to mark as complete'
    })
  }
  
  try {
    // Check if planned workout exists and belongs to user
    const plannedWorkout = await prisma.plannedWorkout.findUnique({
      where: { id: plannedWorkoutId }
    })
    
    if (!plannedWorkout) {
      throw createError({
        statusCode: 404,
        message: 'Planned workout not found'
      })
    }
    
    if (plannedWorkout.userId !== userId) {
      throw createError({
        statusCode: 403,
        message: 'Not authorized to update this planned workout'
      })
    }
    
    // Check if workout exists and belongs to user
    const workout = await prisma.workout.findUnique({
      where: { id: body.workoutId }
    })
    
    if (!workout) {
      throw createError({
        statusCode: 404,
        message: 'Workout not found'
      })
    }
    
    if (workout.userId !== userId) {
      throw createError({
        statusCode: 403,
        message: 'Not authorized to link to this workout'
      })
    }
    
    // Update planned workout to mark as completed
    const updatedPlannedWorkout = await prisma.plannedWorkout.update({
      where: { id: plannedWorkoutId },
      data: {
        completed: true
      }
    })
    
    // Update workout to link to planned workout
    const updatedWorkout = await prisma.workout.update({
      where: { id: body.workoutId },
      data: {
        plannedWorkoutId: plannedWorkoutId
      }
    })
    
    return {
      success: true,
      plannedWorkout: updatedPlannedWorkout,
      workout: updatedWorkout
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }
    console.error('Error marking planned workout complete:', error)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to mark planned workout complete'
    })
  }
})