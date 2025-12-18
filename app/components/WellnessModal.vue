<template>
  <UModal v-model:open="isOpen" title="Wellness Overview" :description="formattedDate" class="sm:max-w-2xl">
    <template #body>
      <div v-if="loading" class="flex items-center justify-center py-12">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary-500" />
      </div>

      <div v-else-if="wellnessData" class="space-y-8">
        <!-- Key Metrics Grid -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <!-- HRV -->
          <div v-if="wellnessData.hrv != null" class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl ring-1 ring-inset ring-blue-500/10">
            <div class="flex items-center gap-2 mb-2">
              <UIcon name="i-heroicons-heart" class="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span class="text-xs font-bold text-blue-900 dark:text-blue-100 uppercase tracking-tight">HRV</span>
            </div>
            <div class="text-2xl font-bold text-blue-900 dark:text-blue-50">{{ Math.round(wellnessData.hrv) }} <span class="text-xs font-medium opacity-70">ms</span></div>
            <div v-if="hrvTrend" class="flex items-center gap-1 mt-2 text-xs font-bold">
              <UIcon :name="hrvTrend.icon" :class="hrvTrend.color" class="w-3 h-3" />
              <span :class="hrvTrend.color">{{ hrvTrend.text }}</span>
            </div>
          </div>

          <!-- Sleep -->
          <div v-if="wellnessData.hoursSlept != null" class="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl ring-1 ring-inset ring-purple-500/10">
            <div class="flex items-center gap-2 mb-2">
              <UIcon name="i-heroicons-moon" class="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span class="text-xs font-bold text-purple-900 dark:text-purple-100 uppercase tracking-tight">Sleep</span>
            </div>
            <div class="text-2xl font-bold text-purple-900 dark:text-purple-50">{{ wellnessData.hoursSlept.toFixed(1) }} <span class="text-xs font-medium opacity-70">hrs</span></div>
            <div v-if="wellnessData.sleepScore" class="mt-2 text-[10px] font-bold text-purple-600/80 dark:text-purple-400 uppercase tracking-widest">
              Score: {{ wellnessData.sleepScore }}
            </div>
          </div>

          <!-- Resting HR -->
          <div v-if="wellnessData.restingHr != null" class="p-4 bg-rose-50 dark:bg-rose-900/20 rounded-xl ring-1 ring-inset ring-rose-500/10">
            <div class="flex items-center gap-2 mb-2">
              <UIcon name="i-heroicons-heart-20-solid" class="w-4 h-4 text-rose-600 dark:text-rose-400" />
              <span class="text-xs font-bold text-rose-900 dark:text-rose-100 uppercase tracking-tight">RHR</span>
            </div>
            <div class="text-2xl font-bold text-rose-900 dark:text-rose-50">{{ wellnessData.restingHr }} <span class="text-xs font-medium opacity-70">bpm</span></div>
            <div v-if="restingHrTrend" class="flex items-center gap-1 mt-2 text-xs font-bold">
              <UIcon :name="restingHrTrend.icon" :class="restingHrTrend.color" class="w-3 h-3" />
              <span :class="restingHrTrend.color">{{ restingHrTrend.text }}</span>
            </div>
          </div>

          <!-- Recovery Score -->
          <div v-if="wellnessData.recoveryScore != null" class="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl ring-1 ring-inset ring-emerald-500/10">
            <div class="flex items-center gap-2 mb-2">
              <UIcon name="i-heroicons-bolt" class="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span class="text-xs font-bold text-emerald-900 dark:text-emerald-100 uppercase tracking-tight">Recovery</span>
            </div>
            <div class="text-2xl font-bold text-emerald-900 dark:text-emerald-50">{{ wellnessData.recoveryScore }}%</div>
            <div class="mt-2">
              <span class="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-white/50 dark:bg-emerald-900/40" :class="getRecoveryColor(wellnessData.recoveryScore)">
                {{ getRecoveryLabel(wellnessData.recoveryScore) }}
              </span>
            </div>
          </div>
        </div>

        <!-- Metric Explanations -->
        <div class="space-y-4">
          <h4 class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest px-1">Insights</h4>
          
          <div class="grid gap-3">
            <div v-if="wellnessData.hrv != null" class="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-xl ring-1 ring-inset ring-gray-200 dark:ring-gray-700">
              <div class="flex items-start gap-3">
                <UIcon name="i-heroicons-information-circle" class="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                <div class="text-sm">
                  <span class="font-bold text-gray-900 dark:text-white">Heart Rate Variability</span>
                  <p class="text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
                    {{ getHRVInterpretation(wellnessData.hrv) }}
                  </p>
                </div>
              </div>
            </div>

            <div v-if="wellnessData.hoursSlept != null" class="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-xl ring-1 ring-inset ring-gray-200 dark:ring-gray-700">
              <div class="flex items-start gap-3">
                <UIcon name="i-heroicons-moon" class="w-5 h-5 text-purple-500 mt-0.5 flex-shrink-0" />
                <div class="text-sm">
                  <span class="font-bold text-gray-900 dark:text-white">Sleep Quality</span>
                  <p class="text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
                    {{ getSleepInterpretation(wellnessData.hoursSlept) }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 7-Day Trends -->
        <div v-if="trendData && trendData.length > 1" class="space-y-4">
          <h4 class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest px-1">7-Day Trends</h4>
          
          <div class="grid md:grid-cols-2 gap-6">
            <!-- HRV Trend Chart -->
            <div v-if="trendData.some(d => d.hrv != null)" class="space-y-3">
              <div class="flex items-center justify-between px-1">
                <span class="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-tight">HRV History</span>
              </div>
              <div class="h-32 flex items-end justify-between gap-1.5 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl ring-1 ring-inset ring-gray-200 dark:ring-gray-700">
                <div
                  v-for="(day, idx) in trendData"
                  :key="idx"
                  class="flex-1 bg-blue-400/30 dark:bg-blue-500/20 rounded-lg hover:bg-blue-400 dark:hover:bg-blue-500 transition-all duration-300 relative group"
                  :style="{ height: day.hrv ? `${Math.max((day.hrv / maxHRV) * 100, 10)}%` : '4px' }"
                >
                  <div class="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded shadow-xl whitespace-nowrap pointer-events-none z-10">
                    {{ format(day.date, 'MMM d') }}: {{ day.hrv ? Math.round(day.hrv) + 'ms' : 'N/A' }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Sleep Trend Chart -->
            <div v-if="trendData.some(d => d.hoursSlept != null)" class="space-y-3">
              <div class="flex items-center justify-between px-1">
                <span class="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-tight">Sleep Duration</span>
              </div>
              <div class="h-32 flex items-end justify-between gap-1.5 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl ring-1 ring-inset ring-gray-200 dark:ring-gray-700">
                <div
                  v-for="(day, idx) in trendData"
                  :key="idx"
                  class="flex-1 bg-purple-400/30 dark:bg-purple-500/20 rounded-lg hover:bg-purple-400 dark:hover:bg-purple-500 transition-all duration-300 relative group"
                  :style="{ height: day.hoursSlept ? `${Math.max((day.hoursSlept / 12) * 100, 10)}%` : '4px' }"
                >
                  <div class="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded shadow-xl whitespace-nowrap pointer-events-none z-10">
                    {{ format(day.date, 'MMM d') }}: {{ day.hoursSlept ? day.hoursSlept.toFixed(1) + 'h' : 'N/A' }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Training Recommendations -->
        <div class="p-5 bg-primary-50 dark:bg-primary-900/10 border border-primary-100 dark:border-primary-900/20 rounded-2xl">
          <div class="flex items-start gap-4">
            <div class="p-2.5 rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-primary-100 dark:ring-primary-900/30">
              <UIcon name="i-heroicons-sparkles" class="w-6 h-6 text-primary-600 dark:text-primary-400 flex-shrink-0" />
            </div>
            <div class="space-y-1">
              <h4 class="font-bold text-sm text-primary-900 dark:text-primary-100">Coach Recommendation</h4>
              <p class="text-sm text-primary-800 dark:text-primary-200 leading-relaxed font-medium">{{ getTrainingRecommendation() }}</p>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="py-12 text-center">
        <UIcon name="i-heroicons-calendar-days" class="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <p class="text-gray-500 font-medium font-sans">No wellness data available for this date</p>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { format, subDays } from 'date-fns'

const props = defineProps<{
  open: boolean
  date: Date | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value)
})

const formattedDate = computed(() => {
  return props.date ? format(props.date, 'EEEE, MMMM d, yyyy') : ''
})

const loading = ref(false)
const wellnessData = ref<any>(null)
const trendData = ref<any[]>([])

// Watch for date changes to fetch data
watch(() => props.date, async (newDate) => {
  if (newDate && props.open) {
    await fetchWellnessData(newDate)
  }
}, { immediate: true })

watch(() => props.open, async (isOpen) => {
  if (isOpen && props.date) {
    await fetchWellnessData(props.date)
  }
})

async function fetchWellnessData(date: Date) {
  loading.value = true
  try {
    const dateStr = format(date, 'yyyy-MM-dd')
    
    // Fetch wellness data for the specific date
    const response = await $fetch(`/api/wellness/${dateStr}`)
    wellnessData.value = response
    
    // Fetch 7-day trend data
    const startDate = format(subDays(date, 6), 'yyyy-MM-dd')
    const endDate = dateStr
    const trendResponse = await $fetch<any[]>(`/api/wellness/trend?startDate=${startDate}&endDate=${endDate}`)
    trendData.value = trendResponse.map((d: any) => ({
      ...d,
      date: new Date(d.date)
    }))
  } catch (error) {
    console.error('Error fetching wellness data:', error)
    wellnessData.value = null
    trendData.value = []
  } finally {
    loading.value = false
  }
}

// Computed properties for trends
const maxHRV = computed(() => {
  const values = trendData.value.filter(d => d.hrv != null).map(d => d.hrv)
  return values.length > 0 ? Math.max(...values) : 100
})

const hrvTrend = computed(() => {
  if (!trendData.value || trendData.value.length < 2 || !wellnessData.value?.hrv) return null
  
  const recentData = trendData.value.filter(d => d.hrv != null).slice(-3)
  if (recentData.length < 2) return null
  
  const avg = recentData.reduce((sum, d) => sum + d.hrv, 0) / recentData.length
  const current = wellnessData.value.hrv
  const diff = current - avg
  
  if (diff > 5) {
    return {
      icon: 'i-heroicons-arrow-trending-up',
      color: 'text-green-600 dark:text-green-400',
      text: 'Improving',
      description: 'Your HRV is trending upward, indicating good recovery.'
    }
  } else if (diff < -5) {
    return {
      icon: 'i-heroicons-arrow-trending-down',
      color: 'text-red-600 dark:text-red-400',
      text: 'Declining',
      description: 'Your HRV is lower than usual, consider easier training.'
    }
  }
  return {
    icon: 'i-heroicons-minus',
    color: 'text-gray-600 dark:text-gray-400',
    text: 'Stable',
    description: 'Your HRV is consistent with recent averages.'
  }
})

const restingHrTrend = computed(() => {
  if (!trendData.value || trendData.value.length < 2 || !wellnessData.value?.restingHr) return null
  
  const recentData = trendData.value.filter(d => d.restingHr != null).slice(-3)
  if (recentData.length < 2) return null
  
  const avg = recentData.reduce((sum, d) => sum + d.restingHr, 0) / recentData.length
  const current = wellnessData.value.restingHr
  const diff = current - avg
  
  if (diff > 3) {
    return {
      icon: 'i-heroicons-arrow-trending-up',
      color: 'text-red-600 dark:text-red-400',
      text: 'Elevated',
      description: 'Your resting HR is higher than usual, indicating possible fatigue or stress.'
    }
  } else if (diff < -3) {
    return {
      icon: 'i-heroicons-arrow-trending-down',
      color: 'text-green-600 dark:text-green-400',
      text: 'Lower',
      description: 'Your resting HR is lower than usual, a positive sign.'
    }
  }
  return {
    icon: 'i-heroicons-minus',
    color: 'text-gray-600 dark:text-gray-400',
    text: 'Normal',
    description: 'Your resting HR is within your typical range.'
  }
})

const hasSubjectiveMetrics = computed(() => {
  if (!wellnessData.value) return false
  return wellnessData.value.soreness != null ||
         wellnessData.value.fatigue != null ||
         wellnessData.value.stress != null ||
         wellnessData.value.mood != null ||
         wellnessData.value.motivation != null ||
         wellnessData.value.readiness != null
})

// Helper functions
function getRecoveryColor(score: number): string {
  if (score >= 67) return 'text-green-600 dark:text-green-400'
  if (score >= 34) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function getRecoveryLabel(score: number): string {
  if (score >= 67) return 'Well recovered'
  if (score >= 34) return 'Moderate recovery'
  return 'Low recovery'
}

function getHRVInterpretation(hrv: number): string {
  if (hrv >= 70) return 'Excellent recovery, ready for high-intensity training.'
  if (hrv >= 50) return 'Good recovery, suitable for moderate to high intensity.'
  if (hrv >= 30) return 'Moderate recovery, consider lighter training.'
  return 'Low recovery, prioritize rest and recovery.'
}

function getSleepInterpretation(hours: number): string {
  if (hours >= 8) return 'Excellent sleep duration for recovery.'
  if (hours >= 7) return 'Good sleep duration, adequate for most athletes.'
  if (hours >= 6) return 'Below optimal, consider prioritizing more sleep.'
  return 'Insufficient sleep, recovery may be compromised.'
}

function getTrainingRecommendation(): string {
  if (!wellnessData.value) return 'No data available for recommendations.'
  
  const recovery = wellnessData.value.recoveryScore
  const hrv = wellnessData.value.hrv
  const sleep = wellnessData.value.hoursSlept
  const restingHr = wellnessData.value.restingHr
  
  // High recovery
  if (recovery && recovery >= 67) {
    return 'You\'re well recovered! This is a great day for high-intensity training or hard workouts. Your body is ready to handle significant stress.'
  }
  
  // Check HRV and sleep
  if (hrv && hrv >= 60 && sleep && sleep >= 7.5) {
    return 'Good recovery metrics indicate you\'re ready for challenging training. Consider intervals, tempo runs, or strength work.'
  }
  
  // Moderate recovery
  if ((recovery && recovery >= 34) || (hrv && hrv >= 40)) {
    return 'Moderate recovery suggests sticking to moderate-intensity training. Good day for aerobic base work, technique sessions, or moderate volume.'
  }
  
  // Low recovery indicators
  if ((recovery && recovery < 34) || (hrv && hrv < 40) || (sleep && sleep < 6.5)) {
    return 'Your body needs recovery. Focus on easy aerobic work, mobility, or consider a rest day. Quality recovery now will pay dividends later.'
  }
  
  // Elevated resting HR
  if (restingHr && restingHrTrend.value?.text === 'Elevated') {
    return 'Elevated resting heart rate suggests your body is under stress. Prioritize recovery activities like easy movement, stretching, or complete rest.'
  }
  
  return 'Listen to your body and adjust training intensity based on how you feel throughout your session.'
}
</script>