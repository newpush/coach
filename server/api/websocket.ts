import { defineWebSocketHandler } from 'h3'
import { runs } from '@trigger.dev/sdk/v3'

// Map to store active subscriptions cancel functions per peer
const subscriptions = new Map<any, Set<() => void>>()

export default defineWebSocketHandler({
  open(peer) {
    console.log('[ws] open', peer)
    peer.send(JSON.stringify({ type: 'welcome', message: 'Connected to Coach Watts WebSocket' }))
    subscriptions.set(peer, new Set())
  },

  async message(peer, message) {
    const text = message.text()

    if (text === 'ping') {
      peer.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }))
      return
    }

    try {
      const data = JSON.parse(text)

      if (data.type === 'subscribe_run') {
        const runId = data.runId
        if (!runId) return

        console.log(`[ws] Subscribing to run ${runId}`)
        startSubscription(peer, () => runs.subscribeToRun(runId), runId)
      }

      if (data.type === 'subscribe_user') {
        const userId = data.userId
        if (!userId) return

        console.log(`[ws] Subscribing to user runs ${userId}`)
        const tag = `user:${userId}`
        startSubscription(peer, () => runs.subscribeToRunsWithTag(tag), `tag:${tag}`)
      }
    } catch (e) {
      // Ignore JSON parse errors
    }
  },

  close(peer, event) {
    console.log('[ws] close', peer, event)
    const peerSubs = subscriptions.get(peer)
    if (peerSubs) {
      peerSubs.forEach((cancel) => cancel())
      subscriptions.delete(peer)
    }
  },

  error(peer, error) {
    console.log('[ws] error', peer, error)
  }
})

// Helper to handle subscription loops
function startSubscription(peer: any, iteratorFn: () => AsyncIterable<any>, subId: string) {
  let isSubscribed = true
  const cancel = () => {
    console.log(`[ws] Cancelling subscription ${subId}`)
    isSubscribed = false
  }

  const peerSubs = subscriptions.get(peer)
  if (peerSubs) peerSubs.add(cancel)
  ;(async () => {
    try {
      console.log(`[ws] Starting subscription loop for ${subId}`)
      // @ts-expect-error - Types might be missing for async iterators in some setups
      for await (const run of iteratorFn()) {
        if (!isSubscribed) break

        console.log(`[ws] Sending update for ${subId}: ${run.id} (${run.status})`)
        peer.send(
          JSON.stringify({
            type: 'run_update',
            runId: run.id,
            taskIdentifier: run.taskIdentifier,
            status: run.status,
            output: run.output,
            error: run.error,
            tags: run.tags,
            startedAt: run.startedAt,
            finishedAt: run.finishedAt
          })
        )
      }
      console.log(`[ws] Subscription loop ended for ${subId}`)
    } catch (err) {
      console.error(`[ws] Error in subscription ${subId}:`, err)
    } finally {
      if (peerSubs) peerSubs.delete(cancel)
    }
  })()
}
