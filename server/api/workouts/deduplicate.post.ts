import { defineEventHandler } from 'h3'
import { getServerSession } from '#auth'
import { tasks } from '@trigger.dev/sdk/v3'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  
  if (!session || !session.user?.email) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  try {
    const handle = await tasks.trigger(
      'deduplicate-workouts',
      { userId: session.user.email }
    )

    return {
      success: true,
      taskId: handle.id
    }
  } catch (error) {
    console.error('Error triggering workout deduplication:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to trigger workout deduplication'
    })
  }
})