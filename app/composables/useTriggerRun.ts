import { ref, onMounted, onUnmounted, watch } from 'vue'

export function useTriggerRun(runId: Ref<string | null>) {
  const status = ref<string | null>(null)
  const output = ref<any>(null)
  const error = ref<any>(null)
  const isConnected = ref(false)

  let ws: WebSocket | null = null
  let pollInterval: NodeJS.Timeout | null = null
  let reconnectTimeout: NodeJS.Timeout | null = null
  let retryCount = 0

  const POLLING_INTERVAL = 3000
  const MAX_RETRIES = 5

  // --- WebSocket Logic ---

  const connectWebSocket = () => {
    if (ws || typeof window === 'undefined') return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/api/websocket`

    ws = new WebSocket(url)

    ws.onopen = () => {
      isConnected.value = true
      retryCount = 0
      if (runId.value) {
        subscribeToRun(runId.value)
      }
      // If WS connects, we can stop polling (or keep it as backup? Better to stop to save calls)
      stopPolling()
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'run_update' && data.runId === runId.value) {
          updateState(data.status, data.output, data.error)
        }
      } catch (e) {
        // Ignore malformed messages
      }
    }

    ws.onclose = () => {
      isConnected.value = false
      ws = null

      // Attempt reconnect if we haven't exceeded max retries
      if (retryCount < MAX_RETRIES) {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 10000)
        reconnectTimeout = setTimeout(() => {
          retryCount++
          connectWebSocket()
        }, delay)
      }

      // Fallback to polling immediately when WS drops
      if (runId.value && !isFinalStatus(status.value)) {
        startPolling()
      }
    }
  }

  const subscribeToRun = (id: string) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'subscribe_run',
          runId: id
        })
      )
    }
  }

  // --- Polling Logic (Fallback) ---

  const pollStatus = async () => {
    if (!runId.value) return

    try {
      const data = (await $fetch(`/api/runs/${runId.value}`)) as any
      if (!Array.isArray(data)) {
        updateState(data.status, data.output, data.error)

        if (isFinalStatus(data.status)) {
          stopPolling()
        }
      }
    } catch (err) {
      // If polling fails (e.g. 404 or 500), we might want to stop or retry
      console.error('Polling error:', err)
    }
  }

  const startPolling = () => {
    if (pollInterval) return
    // Poll immediately once
    pollStatus()
    // Then set interval
    pollInterval = setInterval(pollStatus, POLLING_INTERVAL)
  }

  const stopPolling = () => {
    if (pollInterval) {
      clearInterval(pollInterval)
      pollInterval = null
    }
  }

  // --- Shared Helper ---

  const updateState = (newStatus: string, newOutput: any, newError: any) => {
    status.value = newStatus
    if (newOutput) output.value = newOutput
    if (newError) error.value = newError
  }

  const isFinalStatus = (s: string | null) => {
    return ['COMPLETED', 'FAILED', 'CANCELED', 'TIMED_OUT'].includes(s || '')
  }

  // --- Watchers & Lifecycle ---

  watch(runId, (newId) => {
    if (!newId) {
      status.value = null
      output.value = null
      error.value = null
      stopPolling()
      return
    }

    // Reset state for new run
    status.value = 'WAITING'
    output.value = null
    error.value = null

    if (isConnected.value) {
      subscribeToRun(newId)
    } else {
      startPolling()
    }
  })

  onMounted(() => {
    connectWebSocket()
  })

  onUnmounted(() => {
    if (ws) ws.close()
    if (pollInterval) clearInterval(pollInterval)
    if (reconnectTimeout) clearTimeout(reconnectTimeout)
  })

  return {
    status,
    output,
    error,
    isConnected
  }
}
