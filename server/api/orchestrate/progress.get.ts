import { defineEventHandler, setHeader } from 'h3'
import { getServerSession } from '../../utils/session'
import { activeSyncs } from './full-sync.post'

defineRouteMeta({
  openAPI: {
    tags: ['Orchestration'],
    summary: 'Get orchestration progress',
    description: 'Streams Server-Sent Events (SSE) for tracking background sync progress.',
    responses: {
      200: {
        description: 'Success',
        content: {
          'text/event-stream': {
            schema: { type: 'string' }
          }
        }
      },
      401: { description: 'Unauthorized' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!session?.user?.email) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const userId = session.user.email

  // Set SSE headers
  setHeader(event, 'Content-Type', 'text/event-stream')
  setHeader(event, 'Cache-Control', 'no-cache')
  setHeader(event, 'Connection', 'keep-alive')

  // Create a response stream
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()

      // Function to send data
      const sendData = (data: any) => {
        const message = `data: ${JSON.stringify(data)}\n\n`
        controller.enqueue(encoder.encode(message))
      }

      // Get sync state if it exists
      const syncState = activeSyncs.get(userId)

      if (syncState) {
        // Send current state
        sendData({
          type: 'init',
          states: syncState.states,
          startTime: syncState.startTime
        })

        // Add this connection as a subscriber
        syncState.subscribers.add(sendData)

        // Clean up on close
        event.node.req.on('close', () => {
          syncState.subscribers.delete(sendData)
          controller.close()
        })
      } else {
        // No active sync
        sendData({
          type: 'no_sync',
          message: 'No active sync in progress'
        })
        controller.close()
      }

      // Keep-alive ping every 30 seconds
      const keepAlive = setInterval(() => {
        try {
          sendData({ type: 'ping' })
        } catch (error) {
          clearInterval(keepAlive)
        }
      }, 30000)

      // Clean up keep-alive on close
      event.node.req.on('close', () => {
        clearInterval(keepAlive)
      })
    }
  })

  return stream
})
