import { ref, onMounted, onUnmounted, computed, watch } from 'vue'

export interface TriggerRun {
  id: string
  taskIdentifier: string
  status: string
  startedAt: string
  finishedAt?: string
  output?: any
  error?: any
  isTest?: boolean
}

// Global Singleton State
const runs = ref<TriggerRun[]>([])
const isConnected = ref(false)
const isLoading = ref(false)
let ws: WebSocket | null = null
let activeSubscribers = 0
let initPromise: Promise<void> | null = null
let pollInterval: NodeJS.Timeout | null = null
let pingInterval: NodeJS.Timeout | null = null

export const ACTIVE_STATUSES = [
  'EXECUTING',
  'QUEUED',
  'WAITING_FOR_DEPLOY',
  'REATTEMPTING',
  'FROZEN',
  'PENDING_VERSION',
  'DELAYED'
]

export function useUserRuns() {
  const { data: session } = useAuth()

  // --- Initial Fetch ---
  const fetchActiveRuns = async () => {
    if (isLoading.value && !pollInterval) return

    isLoading.value = true
    try {
      const data = await $fetch<TriggerRun[]>('/api/runs/active')

      // Start with a map of existing runs to facilitate merging
      const mergedRunsMap = new Map<string, TriggerRun>()
      runs.value.forEach((r) => mergedRunsMap.set(r.id, r))

      // Update/Add with new data from API
      data.forEach((run) => {
        const existing = mergedRunsMap.get(run.id)
        if (existing) {
          // Check existing runs for any local final states we want to preserve
          // (e.g. if API is slightly behind and says EXECUTING but we know it's COMPLETED via WS)
          const isLocalFinal = ['COMPLETED', 'FAILED', 'CANCELED', 'TIMED_OUT'].includes(
            existing.status
          )
          const isApiFinal = ['COMPLETED', 'FAILED', 'CANCELED', 'TIMED_OUT'].includes(run.status)

          if (isLocalFinal && !isApiFinal) {
            // Overwrite API run status with local final status
            mergedRunsMap.set(run.id, { ...run, ...existing, status: existing.status })
          } else {
            // Regular update
            mergedRunsMap.set(run.id, { ...existing, ...run })
          }
        } else {
          // New run found in API
          mergedRunsMap.set(run.id, run)
        }
      })

      const finalRuns = Array.from(mergedRunsMap.values())
      finalRuns.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())

      // Keep only the last 50 runs to avoid memory bloat
      runs.value = finalRuns.slice(0, 50)
    } catch (e) {
      // Failed to fetch active runs
    } finally {
      isLoading.value = false
    }
  }

  // --- Polling ---
  const startPolling = () => {
    if (pollInterval) return
    pollInterval = setInterval(() => {
      if (!isConnected.value && activeSubscribers > 0) {
        fetchActiveRuns()
      }
    }, 5000)
  }

  const stopPolling = () => {
    if (pollInterval) {
      clearInterval(pollInterval)
      pollInterval = null
    }
  }

  const stopPing = () => {
    if (pingInterval) {
      clearInterval(pingInterval)
      pingInterval = null
    }
  }

  const startPing = () => {
    stopPing()
    // Send a ping every 30 seconds to keep the connection alive
    // This prevents Nginx/Cloudflare/Browsers from closing idle connections
    pingInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send('ping')
      }
    }, 30000)
  }

  // --- WebSocket ---
  const connectWebSocket = () => {
    if (ws) return
    if (!session.value?.user || !(session.value.user as any).id) {
      return
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/api/websocket`

    ws = new WebSocket(url)

    ws.onopen = async () => {
      isConnected.value = true
      stopPolling()
      startPing()
      if (session.value?.user && (session.value.user as any).id) {
        try {
          const { token } = await $fetch<{ token: string }>('/api/websocket-token')
          ws?.send(JSON.stringify({ type: 'authenticate', token }))
          ws?.send(JSON.stringify({ type: 'subscribe_user' }))
        } catch (e) {
          console.error('WS Auth failed', e)
        }
      }
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'run_update') {
          handleRunUpdate(data)
        }
      } catch (e) {
        // Ignore
      }
    }

    ws.onclose = () => {
      isConnected.value = false
      ws = null
      stopPing()
      startPolling()
      if (activeSubscribers > 0) {
        setTimeout(connectWebSocket, 3000)
      }
    }
  }

  const handleRunUpdate = (update: any) => {
    const existingIndex = runs.value.findIndex((r) => r.id === update.runId)
    const existing = existingIndex !== -1 ? runs.value[existingIndex] : null

    // Don't update if we already have a final status and the update is non-final (out of order WS messages)
    const isLocalFinal =
      existing && ['COMPLETED', 'FAILED', 'CANCELED', 'TIMED_OUT'].includes(existing.status)
    const isUpdateFinal = ['COMPLETED', 'FAILED', 'CANCELED', 'TIMED_OUT'].includes(update.status)
    if (isLocalFinal && !isUpdateFinal) {
      return
    }

    const updatedRun: TriggerRun = {
      id: update.runId,
      taskIdentifier: update.taskIdentifier || existing?.taskIdentifier || 'Unknown Task',
      status: update.status,
      startedAt: update.startedAt || existing?.startedAt || new Date().toISOString(),
      finishedAt: update.finishedAt || existing?.finishedAt,
      output: update.output !== undefined ? update.output : existing?.output,
      error: update.error !== undefined ? update.error : existing?.error
    }

    const newRuns = [...runs.value]
    if (existingIndex !== -1) {
      newRuns[existingIndex] = updatedRun
    } else {
      newRuns.unshift(updatedRun)
      // Re-sort if it's a new run to ensure correct order
      newRuns.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    }
    runs.value = newRuns.slice(0, 50)
  }

  const cancelRun = async (runId: string) => {
    await $fetch(`/api/runs/${runId}`, { method: 'DELETE' as any })
  }

  const init = async () => {
    if (!initPromise) {
      initPromise = fetchActiveRuns()
    }
    await initPromise
    connectWebSocket()
    if (!isConnected.value) {
      startPolling()
    }
  }

  if (import.meta.client) {
    watch(
      () => (session.value?.user as any)?.id,
      (newId) => {
        if (newId && !ws) {
          connectWebSocket()
        }
      }
    )
  }

  onMounted(() => {
    activeSubscribers++
    init()
  })

  onUnmounted(() => {
    activeSubscribers--
    if (activeSubscribers === 0) {
      if (ws) {
        ws.close()
        ws = null
      }
      isConnected.value = false
      initPromise = null
      stopPolling()
      stopPing()
    }
  })

  return {
    runs,
    isConnected,
    isLoading,
    refresh: fetchActiveRuns,
    cancelRun
  }
}

export function useUserRunsState() {
  const { runs, cancelRun } = useUserRuns()

  const activeRunCount = computed(
    () => runs.value.filter((r) => ACTIVE_STATUSES.includes(r.status)).length
  )

  const notifiedRunIds = new Set<string>()

  const onTaskCompleted = (
    taskIdentifier: string,
    callback: (run: TriggerRun) => void | Promise<void>
  ) => {
    const setupTime = Date.now()

    // Keep track of which runs were already completed when this watcher started
    const alreadyCompleted = new Set(
      runs.value
        .filter((r) => r.taskIdentifier === taskIdentifier && r.status === 'COMPLETED')
        .map((r) => r.id)
    )

    watch(
      runs,
      (newRuns) => {
        const matches = newRuns.filter(
          (r) => r.taskIdentifier === taskIdentifier && r.status === 'COMPLETED'
        )
        matches.forEach((run) => {
          if (alreadyCompleted.has(run.id) || notifiedRunIds.has(run.id)) {
            return
          }

          // Only notify if it finished AFTER we set up this watcher
          // We add a 2-second grace period to account for minor clock differences
          // and the time it takes for the initial fetch to reach the client.
          const finishedTime = run.finishedAt ? new Date(run.finishedAt).getTime() : 0
          if (finishedTime > setupTime - 2000) {
            notifiedRunIds.add(run.id)
            callback(run)
          } else {
            // It's an old run that just appeared in the list (e.g. after initial fetch)
            alreadyCompleted.add(run.id)
          }
        })
      },
      { deep: true, immediate: true }
    )
  }

  return {
    activeRunCount,
    runs,
    onTaskCompleted,
    cancelRun
  }
}
