export const usePolling = () => {
  const poll = async <T>(
    fetchFn: () => Promise<T>,
    checkFn: (data: T) => boolean,
    options: {
      interval?: number
      maxAttempts?: number
      onSuccess?: (data: T) => void
      onMaxAttemptsReached?: () => void
      onError?: (error: any) => void
    } = {}
  ) => {
    const { interval = 5000, maxAttempts = 15, onSuccess, onMaxAttemptsReached, onError } = options

    let attempts = 0

    const executePoll = async () => {
      attempts++
      try {
        const data = await fetchFn()

        if (checkFn(data)) {
          if (onSuccess) onSuccess(data)
          return
        }

        if (attempts >= maxAttempts) {
          if (onMaxAttemptsReached) onMaxAttemptsReached()
          return
        }

        setTimeout(executePoll, interval)
      } catch (error) {
        if (onError) onError(error)
        else console.error('Polling error:', error)
      }
    }

    // Start polling after initial delay
    setTimeout(executePoll, interval)
  }

  return {
    poll
  }
}
