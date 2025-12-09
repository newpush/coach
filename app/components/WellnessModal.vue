<template>
  <UModal v-model:open="isOpen" title="Wellness Overview" :description="formattedDate">
    <template #body>
      <div v-if="loading" class="flex items-center justify-center py-12">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-indigo-500" />
      </div>

      <div v-else-if="wellnessData" class="space-y-6">
        <!-- Key Metrics Grid -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <!-- HRV -->
          <div v-if="wellnessData.hrv != null" class="p-4 bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-950 dark:to-indigo-900 rounded-lg">
            <div class="flex items-center gap-2 mb-2">
              <UIcon name="i-heroicons-heart" class="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span class="text-xs font-medium text-gray-600 dark:text-gray-400">HRV</span>
            </div>
            <div class="text-2xl font-bold text-indigo-900 dark:text-indigo-100">{{ Math.round(wellnessData.hrv) }}</div>
            <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">ms</div>
            <div v-if="hrvTrend" class="flex items-center gap-1 mt-2 text-xs">
              <UIcon :name="hrvTrend.icon" :class="hrvTrend.color" class="w-3 h-3" />
              <span :class="hrvTrend.color">{{ hrvTrend.text }}</span>
            </div>
          </div>

          <!-- Sleep -->
          <div v-if="wellnessData.hoursSlept != null" class="p-4 bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-950 dark:to-indigo-900 rounded-lg">
            <div class="flex items-center gap-2 mb-2">
              <UIcon name="i-heroicons-moon" class="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span class="text-xs font-medium text-gray-600 dark:text-gray-400">Sleep</span>
            </div>
            <div class="text-2xl font-bold text-indigo-900 dark:text-indigo-100">{{ wellnessData.hoursSlept.toFixed(1) }}</div>
            <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">hours</div>
            <div v-if="wellnessData.sleepScore" class="flex items-center gap-1 mt-2 text-xs">
              <span class="text-gray-600 dark:text-gray-400">Score: {{ wellnessData.sleepScore }}/100</span>
            </div>
          </div>

          <!-- Resting HR -->
          <div v-if="wellnessData.restingHr != null" class="p-4 bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-950 dark:to-indigo-900 rounded-lg">
            <div class="flex items-center gap-2 mb-2">
              <UIcon name="i-heroicons-heart-20-solid" class="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span class="text-xs font-medium text-gray-600 dark:text-gray-400">Resting HR</span>
            </div>
            <div class="text-2xl font-bold text-indigo-900 dark:text-indigo-100">{{ wellnessData.restingHr }}</div>
            <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">bpm</div>
            <div v-if="restingHrTrend" class="flex items-center gap-1 mt-2 text-xs">
              <UIcon :name="restingHrTrend.icon" :class="restingHrTrend.color" class="w-3 h-3" />
              <span :class="restingHrTrend.color">{{ restingHrTrend.text }}</span>
            </div>
          </div>

          <!-- Recovery Score -->
          <div v-if="wellnessData.recoveryScore != null" class="p-4 bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-950 dark:to-indigo-900 rounded-lg">
            <div class="flex items-center gap-2 mb-2">
              <UIcon name="i-heroicons-bolt" class="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span class="text-xs font-medium text-gray-600 dark:text-gray-400">Recovery</span>
            </div>
            <div class="text-2xl font-bold text-indigo-900 dark:text-indigo-100">{{ wellnessData.recoveryScore }}</div>
            <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">/100</div>
            <div class="flex items-center gap-1 mt-2 text-xs">
              <span :class="getRecoveryColor(wellnessData.recoveryScore)">{{ getRecoveryLabel(wellnessData.recoveryScore) }}</span>
            </div>
          </div>
        </div>

        <!-- Metric Explanations -->
        <div class="space-y-3">
          <h4 class="font-semibold text-sm text-gray-900 dark:text-gray-100">Understanding Your Metrics</h4>
          
          <div v-if="wellnessData.hrv != null" class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div class="flex items-start gap-2">
              <UIcon name="i-heroicons-information-circle" class="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
              <div class="text-sm">
                <span class="font-medium">HRV (Heart Rate Variability)</span>
                <p class="text-gray-600 dark:text-gray-400 mt-1">
                  Measures the variation in time between heartbeats. Higher HRV generally indicates better recovery and readiness to train. 
                  <span class="font-medium">{{ getHRVInterpretation(wellnessData.hrv) }}</span>
                </p>
              </div>
            </div>
          </div>

          <div v-if="wellnessData.hoursSlept != null" class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div class="flex items-start gap-2">
              <UIcon name="i-heroicons-information-circle" class="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
              <div class="text-sm">
                <span class="font-medium">Sleep Duration</span>
                <p class="text-gray-600 dark:text-gray-400 mt-1">
                  Most athletes need 7-9 hours for optimal recovery. You slept {{ wellnessData.hoursSlept.toFixed(1) }} hours. 
                  <span class="font-medium">{{ getSleepInterpretation(wellnessData.hoursSlept) }}</span>
                </p>
              </div>
            </div>
          </div>

          <div v-if="wellnessData.restingHr != null" class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div class="flex items-start gap-2">
              <UIcon name="i-heroicons-information-circle" class="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
              <div class="text-sm">
                <span class="font-medium">Resting Heart Rate</span>
                <p class="text-gray-600 dark:text-gray-400 mt-1">
                  Your baseline heart rate. Lower values typically indicate better fitness. An elevated RHR may signal stress, fatigue, or illness.
                  <span class="font-medium" v-if="restingHrTrend">{{ restingHrTrend.description }}</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- 7-Day Trends -->
        <div v-if="trendData && trendData.length > 1" class="space-y-3">
          <h4 class="font-semibold text-sm text-gray-900 dark:text-gray-100">7-Day Trends</h4>
          
          <!-- HRV Trend -->
          <div v-if="trendData.some(d => d.hrv != null)" class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div class="flex items-center justify-between mb-3">
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">HRV Trend</span>
              <span class="text-xs text-gray-500">Last 7 days</span>
            </div>
            <div class="h-24 flex items-end justify-between gap-1">
              <div
                v-for="(day, idx) in trendData"
                :key="idx"
                class="flex-1 bg-indigo-200 dark:bg-indigo-700 rounded-t hover:bg-indigo-300 dark:hover:bg-indigo-600 transition-colors relative group"
                :style="{ height: day.hrv ? `${(day.hrv / maxHRV) * 100}%` : '4px' }"
                :title="`${format(day.date, 'MMM dd')}: ${day.hrv ? Math.round(day.hrv) + 'ms' : 'No data'}`"
              >
                <div class="absolute bottom-full mb-1 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none">
                  {{ format(day.date, 'MMM dd') }}: {{ day.hrv ? Math.round(day.hrv) + 'ms' : 'N/A' }}
                </div>
              </div>
            </div>
            <div class="flex justify-between mt-2 text-xs text-gray-500">
              <span>{{ format(trendData[0].date, 'MMM dd') }}</span>
              <span>{{ format(trendData[trendData.length - 1].date, 'MMM dd') }}</span>
            </div>
          </div>

          <!-- Sleep Trend -->
          <div v-if="trendData.some(d => d.hoursSlept != null)" class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div class="flex items-center justify-between mb-3">
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Sleep Duration</span>
              <span class="text-xs text-gray-500">Last 7 days</span>
            </div>
            <div class="h-24 flex items-end justify-between gap-1">
              <div
                v-for="(day, idx) in trendData"
                :key="idx"
                class="flex-1 bg-indigo-200 dark:bg-indigo-700 rounded-t hover:bg-indigo-300 dark:hover:bg-indigo-600 transition-colors relative group"
                :style="{ height: day.hoursSlept ? `${(day.hoursSlept / 10) * 100}%` : '4px' }"
                :title="`${format(day.date, 'MMM dd')}: ${day.hoursSlept ? day.hoursSlept.toFixed(1) + 'h' : 'No data'}`"
              >
                <div class="absolute bottom-full mb-1 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none">
                  {{ format(day.date, 'MMM dd') }}: {{ day.hoursSlept ? day.hoursSlept.toFixed(1) + 'h' : 'N/A' }}
                </div>
              </div>
            </div>
            <div class="flex justify-between mt-2 text-xs text-gray-500">
              <span>{{ format(trendData[0].date, 'MMM dd') }}</span>
              <span>{{ format(trendData[trendData.length - 1].date, 'MMM dd') }}</span>
            </div>
          </div>
        </div>

        <!-- Subjective Metrics -->
        <div v-if="hasSubjectiveMetrics" class="space-y-3">
          <h4 class="font-semibold text-sm text-gray-900 dark:text-gray-100">Subjective Wellness</h4>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div v-if="wellnessData.soreness != null" class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div class="text-xs text-gray-600 dark:text-gray-400">Soreness</div>
              <div class="text-lg font-semibold mt-1">{{ wellnessData.soreness }}/10</div>
            </div>
            <div v-if="wellnessData.fatigue != null" class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div class="text-xs text-gray-600 dark:text-gray-400">Fatigue</div>
              <div class="text-lg font-semibold mt-1">{{ wellnessData.fatigue }}/10</div>
            </div>
            <div v-if="wellnessData.stress != null" class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div class="text-xs text-gray-600 dark:text-gray-400">Stress</div>
              <div class="text-lg font-semibold mt-1">{{ wellnessData.stress }}/10</div>
            </div>
            <div v-if="wellnessData.mood != null" class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div class="text-xs text-gray-600 dark:text-gray-400">Mood</div>
              <div class="text-lg font-semibold mt-1">{{ wellnessData.mood }}/10</div>
            </div>
            <div v-if="wellnessData.motivation != null" class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div class="text-xs text-gray-600 dark:text-gray-400">Motivation</div>
              <div class="text-lg font-semibold mt-1">{{ wellnessData.motivation }}/10</div>
            </div>
            <div v-if="wellnessData.readiness != null" class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div class="text-xs text-gray-600 dark:text-gray-400">Readiness</div>
              <div class="text-lg font-semibold mt-1">{{ wellnessData.readiness }}/10</div>
            </div>
          </div>
        </div>

        <!-- Training Recommendations -->
        <div class="p-4 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 rounded-lg">
          <div class="flex items-start gap-3">
            <UIcon name="i-heroicons-light-bulb" class="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 class="font-semibold text-sm text-indigo-900 dark:text-indigo-100 mb-2">Training Recommendation</h4>
              <p class="text-sm text-indigo-800 dark:text-indigo-200">{{ getTrainingRecommendation() }}</p>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="py-12 text-center text-gray-500">
        No wellness data available for this date
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { format, subDays } from 'date-fns'

const props = defineProps<{
  modelValue: boolean
  date: Date | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const formattedDate = computed(() => {
  return props.date ? format(props.date, 'EEEE, MMMM d, yyyy') : ''
})

const loading = ref(false)
const wellnessData = ref<any>(null)
const trendData = ref<any[]>([])

// Watch for date changes to fetch data
watch(() => props.date, async (newDate) => {
  if (newDate && props.modelValue) {
    await fetchWellnessData(newDate)
  }
}, { immediate: true })

watch(() => props.modelValue, async (isOpen) => {
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