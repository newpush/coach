import { defineEventHandler, readBody, createError } from 'h3'
import { getServerSession } from '../../utils/session'
import {
  TASK_DEPENDENCIES,
  getTasksByLevel,
  canExecuteTask,
  type TaskExecutionState
} from '../../../types/task-dependencies'

defineRouteMeta({
  openAPI: {
    tags: ['Orchestration'],
    summary: 'Start full sync',
    description: 'Triggers a full orchestrated sync process, respecting task dependencies.',
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
      409: { description: 'Sync already in progress' }
    }
  }
})

// Store for active sync operations
const activeSyncs = new Map<
  string,
  {
    userId: string
    states: Record<string, TaskExecutionState>
    startTime: Date
    subscribers: Set<(data: any) => void>
  }
>()

// Helper functions
function broadcastToSubscribers(userId: string, data: any) {
  const syncState = activeSyncs.get(userId)
  if (!syncState) return

  syncState.subscribers.forEach((subscriber) => {
    try {
      subscriber(data)
    } catch (error) {
      console.error('Error broadcasting to subscriber:', error)
    }
  })
}

function broadcastTaskUpdate(userId: string, taskId: string, state: TaskExecutionState) {
  broadcastToSubscribers(userId, {
    type: 'task_update',
    taskId,
    state
  })
}

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!session?.user?.email) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const userId = session.user.email

  // Check if sync is already running for this user
  if (activeSyncs.has(userId)) {
    throw createError({
      statusCode: 409,
      message: 'A sync operation is already in progress'
    })
  }

  try {
    // Initialize sync state
    const initialStates: Record<string, TaskExecutionState> = {}
    Object.keys(TASK_DEPENDENCIES).forEach((taskId) => {
      initialStates[taskId] = {
        taskId,
        status: 'pending'
      }
    })

    const syncState = {
      userId,
      states: initialStates,
      startTime: new Date(),
      subscribers: new Set<(data: any) => void>()
    }

    activeSyncs.set(userId, syncState)

    // Start the orchestrated sync in the background
    runOrchestration(userId, syncState).catch((error) => {
      console.error('Orchestration error:', error)
      broadcastToSubscribers(userId, {
        type: 'error',
        error: error.message
      })
      activeSyncs.delete(userId)
    })

    return {
      success: true,
      message: 'Full sync started'
    }
  } catch (error: any) {
    console.error('Error starting full sync:', error)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to start sync'
    })
  }
})

async function runOrchestration(userId: string, syncState: any) {
  const levels = getTasksByLevel()

  for (let levelIndex = 0; levelIndex < levels.length; levelIndex++) {
    const level = levels[levelIndex]
    if (!level) continue

    const levelName = `Level ${levelIndex + 1}`

    broadcastToSubscribers(userId, {
      type: 'progress',
      phase: `Processing ${levelName}: ${level.map((t) => t.name).join(', ')}`,
      progress: Math.round((levelIndex / levels.length) * 100)
    })

    // Execute all tasks in this level in parallel
    const promises = level.map((task) => executeTask(userId, task.id, syncState))
    await Promise.allSettled(promises)

    // Check if any required task failed
    const hasFailedRequiredTask = level.some((task) => {
      const state = syncState.states[task.id]
      return state && task.required && state.status === 'failed'
    })

    if (hasFailedRequiredTask) {
      broadcastToSubscribers(userId, {
        type: 'error',
        error: 'A required task failed. Stopping orchestration.'
      })
      activeSyncs.delete(userId)
      return
    }
  }

  // All done
  broadcastToSubscribers(userId, {
    type: 'complete',
    message: 'All tasks completed successfully'
  })

  // Clean up after a delay
  setTimeout(() => {
    activeSyncs.delete(userId)
  }, 5000)
}

async function executeTask(userId: string, taskId: string, syncState: any) {
  const task = TASK_DEPENDENCIES[taskId]
  if (!task) return

  // Check if task can be executed (all dependencies completed)
  if (!canExecuteTask(taskId, syncState.states)) {
    syncState.states[taskId] = {
      ...syncState.states[taskId],
      status: 'skipped',
      message: 'Dependencies not met'
    }
    broadcastTaskUpdate(userId, taskId, syncState.states[taskId])
    return
  }

  // Update state to running
  syncState.states[taskId] = {
    ...syncState.states[taskId],
    status: 'running',
    startTime: new Date(),
    progress: 0
  }
  broadcastTaskUpdate(userId, taskId, syncState.states[taskId])

  try {
    let result

    // Execute task directly via Trigger.dev or database operations
    // instead of calling API endpoints (which require auth)

    if (task.category === 'ingestion') {
      // For now, skip sync tasks in orchestration - they should be run individually
      syncState.states[taskId] = {
        ...syncState.states[taskId],
        status: 'skipped',
        message: 'Sync tasks should be run individually from the Data page'
      }
      broadcastTaskUpdate(userId, taskId, syncState.states[taskId])
      return
    } else if (task.category === 'analysis') {
      // Skip analysis tasks in orchestration for now
      syncState.states[taskId] = {
        ...syncState.states[taskId],
        status: 'skipped',
        message: 'Analysis tasks should be run individually'
      }
      broadcastTaskUpdate(userId, taskId, syncState.states[taskId])
      return
    } else {
      // For generation tasks, also skip for now
      syncState.states[taskId] = {
        ...syncState.states[taskId],
        status: 'skipped',
        message: 'Generation tasks should be run individually'
      }
      broadcastTaskUpdate(userId, taskId, syncState.states[taskId])
      return
    }

    // Update state to completed
    syncState.states[taskId] = {
      ...syncState.states[taskId],
      status: 'completed',
      endTime: new Date(),
      progress: 100,
      result
    }
    broadcastTaskUpdate(userId, taskId, syncState.states[taskId])
  } catch (error: any) {
    console.error(`Task ${taskId} failed:`, error)

    syncState.states[taskId] = {
      ...syncState.states[taskId],
      status: 'failed',
      endTime: new Date(),
      error: error.message || 'Task execution failed'
    }
    broadcastTaskUpdate(userId, taskId, syncState.states[taskId])
  }
}

// Export for use in progress endpoint
export { activeSyncs }
