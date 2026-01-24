import { useIntervalFn } from '@vueuse/core'

export type LoadingContext =
  | 'general'
  | 'daily-checkin'
  | 'workout-analysis'
  | 'nutrition-analysis'
  | 'athlete-profile'

const MESSAGE_POOLS: Record<LoadingContext, string[]> = {
  general: [
    'Crunching the numbers...',
    'Consulting the AI coach...',
    'Loading your data...',
    'Processing...',
    'Almost there...',
    'Analyzing patterns...',
    'Connecting the dots...'
  ],
  'daily-checkin': [
    'Checking your recovery metrics...',
    'Consulting your digital physiologist...',
    'Analyzing your training stress balance (TSB)...',
    'Formulating the perfect questions...',
    'Reviewing your upcoming events...',
    'Checking for training plan compliance...',
    'Evaluating your sleep consistency...',
    'Looking for trends in your subjective feedback...',
    'Measuring your readiness to perform...',
    'Calibrating coaching personality...',
    'Checking workload accumulation...',
    'Reviewing recent intensity distribution...',
    'Preparing your daily briefing...'
  ],
  'workout-analysis': [
    'Parsing file data...',
    'Calculating power duration curve...',
    'Detecting intervals...',
    'Analyzing heart rate response...',
    'Comparing against your FTP...',
    'Evaluating variability index...',
    'Checking zone distribution...',
    'Identifying physiological limiters...',
    'Quantifying training load...'
  ],
  'nutrition-analysis': [
    'Calculating caloric balance...',
    'Analyzing macro distribution...',
    'Checking fueling consistency...',
    'Reviewing pre-workout nutrition...',
    'Evaluating recovery intake...',
    'Comparing intake vs expenditure...',
    'Identifying nutritional gaps...'
  ],
  'athlete-profile': [
    'Compiling your training history...',
    'Identifying strength and weaknesses...',
    'Analyzing long-term trends...',
    'Calculating fitness progression...',
    'Determining rider phenotype...',
    'Reviewing consistency scores...',
    'Building your physiological profile...'
  ]
}

export function useLoadingMessages(context: LoadingContext = 'general', interval = 4000) {
  const currentMessage = ref('')
  const availableMessages = ref<string[]>([])

  // Initialize with a random message from the pool
  const resetPool = () => {
    // Combine general messages with context-specific ones for variety, or just use context?
    // User asked for "specific which only shows for example in this daily checkins".
    // So let's stick to strict context pools, maybe fallback to general if empty.
    const pool = MESSAGE_POOLS[context] || MESSAGE_POOLS.general
    // Shuffle the pool
    availableMessages.value = [...pool].sort(() => Math.random() - 0.5)
    currentMessage.value = availableMessages.value[0]
  }

  const nextMessage = () => {
    if (availableMessages.value.length === 0) {
      resetPool()
    }
    // Take the next one (we already shuffled)
    const next = availableMessages.value.shift()
    if (next) currentMessage.value = next
  }

  const { pause, resume, isActive } = useIntervalFn(
    () => {
      nextMessage()
    },
    interval,
    { immediate: false }
  )

  const start = () => {
    resetPool()
    resume()
  }

  const stop = () => {
    pause()
  }

  // Auto-start if immediate? No, let's keep it manual control for Vue lifecycle
  // Initialize on creation
  resetPool()

  return {
    message: currentMessage,
    start,
    stop,
    isActive
  }
}
