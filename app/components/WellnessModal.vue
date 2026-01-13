<template>
  <UModal v-model:open="isOpen" :description="formattedDate" class="sm:max-w-2xl">
    <template #title>
      <div class="flex items-center gap-2">
        <span>Wellness Overview</span>
        <UTooltip v-if="isStale" :text="staleLabel">
          <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-amber-500" />
        </UTooltip>
      </div>
    </template>

    <template #body>
      <div v-if="loading" class="flex items-center justify-center py-12">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary-500" />
      </div>

      <div v-else-if="wellnessData" class="space-y-8">
        <!-- Key Metrics Grid -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <!-- HRV -->
          <div
            v-if="wellnessData.hrv != null"
            class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl ring-1 ring-inset ring-blue-500/10"
          >
            <div class="flex items-center gap-2 mb-2">
              <UIcon name="i-heroicons-heart" class="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span
                class="text-xs font-bold text-blue-900 dark:text-blue-100 uppercase tracking-tight"
                >HRV (rMSSD)</span
              >
            </div>
            <div class="text-2xl font-bold text-blue-900 dark:text-blue-50">
              {{ Math.round(wellnessData.hrv) }}
              <span class="text-xs font-medium opacity-70">ms</span>
            </div>
            <div v-if="trendData.length > 0" class="mt-2">
              <TrendIndicator
                :current="wellnessData.hrv"
                :previous="trendData.map((d) => d.hrv).filter((v) => v != null)"
                type="higher-is-better"
                compact
                show-value
              />
            </div>
          </div>

          <!-- Sleep -->
          <div
            v-if="wellnessData.hoursSlept != null"
            class="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl ring-1 ring-inset ring-purple-500/10"
          >
            <div class="flex items-center gap-2 mb-2">
              <UIcon name="i-heroicons-moon" class="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span
                class="text-xs font-bold text-purple-900 dark:text-purple-100 uppercase tracking-tight"
                >Sleep</span
              >
            </div>
            <div class="text-2xl font-bold text-purple-900 dark:text-purple-50">
              {{ wellnessData.hoursSlept.toFixed(1) }}
              <span class="text-xs font-medium opacity-70">hrs</span>
            </div>
            <div v-if="trendData.length > 0" class="mt-2">
              <TrendIndicator
                :current="wellnessData.hoursSlept"
                :previous="trendData.map((d) => d.hoursSlept).filter((v) => v != null)"
                type="higher-is-better"
                compact
                show-value
              />
            </div>
          </div>

          <!-- Resting HR -->
          <div
            v-if="wellnessData.restingHr != null"
            class="p-4 bg-rose-50 dark:bg-rose-900/20 rounded-xl ring-1 ring-inset ring-rose-500/10"
          >
            <div class="flex items-center gap-2 mb-2">
              <UIcon
                name="i-heroicons-heart-20-solid"
                class="w-4 h-4 text-rose-600 dark:text-rose-400"
              />
              <span
                class="text-xs font-bold text-rose-900 dark:text-rose-100 uppercase tracking-tight"
                >RHR</span
              >
            </div>
            <div class="text-2xl font-bold text-rose-900 dark:text-rose-50">
              {{ wellnessData.restingHr }} <span class="text-xs font-medium opacity-70">bpm</span>
            </div>
            <div v-if="trendData.length > 0" class="mt-2">
              <TrendIndicator
                :current="wellnessData.restingHr"
                :previous="trendData.map((d) => d.restingHr).filter((v) => v != null)"
                type="lower-is-better"
                compact
                show-value
              />
            </div>
          </div>

          <!-- Recovery Score -->
          <div
            v-if="wellnessData.recoveryScore != null"
            class="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl ring-1 ring-inset ring-emerald-500/10"
          >
            <div class="flex items-center gap-2 mb-2">
              <UIcon
                name="i-heroicons-bolt"
                class="w-4 h-4 text-emerald-600 dark:text-emerald-400"
              />
              <span
                class="text-xs font-bold text-emerald-900 dark:text-emerald-100 uppercase tracking-tight"
                >Recovery</span
              >
            </div>
            <div class="text-2xl font-bold text-emerald-900 dark:text-emerald-50">
              {{ wellnessData.recoveryScore }}%
            </div>
            <div class="mt-2">
              <span
                class="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-white/50 dark:bg-emerald-900/40"
                :class="getRecoveryColor(wellnessData.recoveryScore)"
              >
                {{ getRecoveryLabel(wellnessData.recoveryScore) }}
              </span>
            </div>
          </div>

          <!-- Readiness -->
          <div
            v-if="wellnessData.readiness != null"
            class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl ring-1 ring-inset ring-blue-500/10"
          >
            <div class="flex items-center gap-2 mb-2">
              <UIcon name="i-heroicons-bolt" class="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span
                class="text-xs font-bold text-blue-900 dark:text-blue-100 uppercase tracking-tight"
                >Readiness</span
              >
            </div>
            <div class="text-2xl font-bold text-blue-900 dark:text-blue-50">
              {{ wellnessData.readiness }}{{ wellnessData.readiness > 10 ? '%' : '/10' }}
            </div>
            <div v-if="trendData.length > 0" class="mt-2">
              <TrendIndicator
                :current="wellnessData.readiness"
                :previous="trendData.map((d) => d.readiness).filter((v) => v != null)"
                type="higher-is-better"
                compact
                show-value
              />
            </div>
          </div>
        </div>

        <!-- Metric Explanations -->
        <div class="space-y-4">
          <div class="flex items-center justify-between px-1">
            <h4
              class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest"
            >
              Insights
            </h4>
            <!-- AI Analyze Button (Only if NOT already analyzed) -->
            <UButton
              v-if="wellnessData.aiAnalysisJson && wellnessData.aiAnalysisStatus !== 'PROCESSING'"
              color="neutral"
              variant="link"
              size="xs"
              class="p-0 text-gray-400 hover:text-primary-500 dark:text-gray-500 dark:hover:text-primary-400 transition-colors font-medium"
              :loading="analyzingWellness"
              :disabled="analyzingWellness"
              @click="analyzeWellness"
            >
              Regenerate
            </UButton>
            <UButton
              v-else-if="wellnessData.aiAnalysisStatus === 'PROCESSING'"
              icon="i-heroicons-arrow-path"
              color="primary"
              variant="ghost"
              size="xs"
              loading
              disabled
            >
              Analyzing...
            </UButton>
          </div>

          <!-- AI Analysis Content -->
          <div
            v-if="wellnessData.aiAnalysisJson"
            class="p-4 bg-indigo-50 dark:bg-indigo-900/10 rounded-xl ring-1 ring-inset ring-indigo-200 dark:ring-indigo-800/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/20 transition-colors group/ai-card cursor-pointer relative"
            @click="navigateTo(`/fitness/${wellnessData.id}`)"
          >
            <div class="flex items-start gap-3">
              <UIcon
                name="i-heroicons-sparkles"
                class="w-5 h-5 text-indigo-500 mt-0.5 flex-shrink-0"
              />
              <div class="space-y-3 w-full">
                <div>
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-indigo-900 dark:text-indigo-100"
                      >AI Coach Analysis</span
                    >
                    <div class="flex items-center gap-2" @click.stop>
                      <AiFeedback
                        v-if="wellnessData.llmUsageId"
                        :llm-usage-id="wellnessData.llmUsageId"
                        :initial-feedback="wellnessData.feedback"
                        :initial-feedback-text="wellnessData.feedbackText"
                        hide-usage-link
                      />
                      <span
                        v-if="wellnessData.aiAnalysisJson.status"
                        class="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-white/50 dark:bg-indigo-900/40"
                      >
                        {{ formatStatus(wellnessData.aiAnalysisJson.status) }}
                      </span>
                    </div>
                  </div>
                  <p class="text-sm text-indigo-800 dark:text-indigo-200 mt-1 leading-relaxed">
                    {{ wellnessData.aiAnalysisJson.executive_summary }}
                  </p>
                  <div class="flex justify-end mt-2">
                    <span
                      class="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 group-hover/ai-card:underline uppercase tracking-tight"
                    >
                      View Full Details
                      <UIcon name="i-heroicons-arrow-right" class="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Analyze Action (Empty State) -->
          <button
            v-else
            class="w-full text-left p-4 bg-gray-50 dark:bg-gray-800/40 rounded-xl ring-1 ring-inset ring-gray-200 dark:ring-gray-700 hover:ring-primary-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all group flex items-center gap-3"
            :disabled="analyzingWellness"
            @click="analyzeWellness"
          >
            <div
              class="p-2 bg-white dark:bg-gray-900 rounded-lg shadow-sm ring-1 ring-gray-200 dark:ring-gray-700"
            >
              <UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-primary-500" />
            </div>
            <div>
              <span class="font-bold text-gray-900 dark:text-white block">Analyze with AI</span>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Get personalized insights on your recovery and readiness.
              </p>
            </div>
            <UIcon
              name="i-heroicons-arrow-right"
              class="w-4 h-4 text-gray-400 group-hover:text-primary-500 ml-auto"
            />
          </button>
        </div>

        <!-- 7-Day Trends -->
        <div v-if="trendData && trendData.length > 1" class="space-y-4">
          <h4
            class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest px-1"
          >
            7-Day Trends
          </h4>

          <div class="grid md:grid-cols-2 gap-6">
            <!-- HRV Trend Chart -->
            <div v-if="trendData.some((d) => d.hrv != null)" class="space-y-3">
              <div class="flex items-center justify-between px-1">
                <span
                  class="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-tight"
                  >HRV History</span
                >
              </div>
              <div
                class="h-32 flex items-end justify-between gap-1.5 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl ring-1 ring-inset ring-gray-200 dark:ring-gray-700"
              >
                <div
                  v-for="(day, idx) in trendData"
                  :key="idx"
                  class="flex-1 bg-blue-400/30 dark:bg-blue-500/20 rounded-lg hover:bg-blue-400 dark:hover:bg-blue-500 transition-all duration-300 relative group"
                  :style="{
                    height: day.hrv ? `${Math.max((day.hrv / maxHRV) * 100, 10)}%` : '4px'
                  }"
                >
                  <div
                    class="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded shadow-xl whitespace-nowrap pointer-events-none z-10"
                  >
                    {{ formatDate(day.date, 'MMM d') }}:
                    {{ day.hrv ? Math.round(day.hrv) + 'ms' : 'N/A' }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Sleep Trend Chart -->
            <div v-if="trendData.some((d) => d.hoursSlept != null)" class="space-y-3">
              <div class="flex items-center justify-between px-1">
                <span
                  class="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-tight"
                  >Sleep Duration</span
                >
              </div>
              <div
                class="h-32 flex items-end justify-between gap-1.5 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl ring-1 ring-inset ring-gray-200 dark:ring-gray-700"
              >
                <div
                  v-for="(day, idx) in trendData"
                  :key="idx"
                  class="flex-1 bg-purple-400/30 dark:bg-purple-500/20 rounded-lg hover:bg-purple-400 dark:hover:bg-purple-500 transition-all duration-300 relative group"
                  :style="{
                    height: day.hoursSlept ? `${Math.max((day.hoursSlept / 12) * 100, 10)}%` : '4px'
                  }"
                >
                  <div
                    class="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded shadow-xl whitespace-nowrap pointer-events-none z-10"
                  >
                    {{ formatDate(day.date, 'MMM d') }}:
                    {{ day.hoursSlept ? day.hoursSlept.toFixed(1) + 'h' : 'N/A' }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Training Recommendations -->
        <div
          class="p-5 bg-primary-50 dark:bg-primary-900/10 border border-primary-100 dark:border-primary-900/20 rounded-2xl"
        >
          <div class="flex items-start gap-4">
            <div
              class="p-2.5 rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-primary-100 dark:ring-primary-900/30"
            >
              <UIcon
                name="i-heroicons-sparkles"
                class="w-6 h-6 text-primary-600 dark:text-primary-400 flex-shrink-0"
              />
            </div>
            <div class="space-y-2 flex-1">
              <h4 class="font-bold text-sm text-primary-900 dark:text-primary-100">
                Coach Recommendation
              </h4>

              <!-- AI Recommendation -->
              <div
                v-if="
                  wellnessData.aiAnalysisJson && wellnessData.aiAnalysisJson.recommendations?.length
                "
                class="space-y-3"
              >
                <div
                  v-for="(rec, index) in wellnessData.aiAnalysisJson.recommendations.slice(0, 1)"
                  :key="index"
                >
                  <p class="text-sm font-semibold text-primary-900 dark:text-primary-100">
                    {{ rec.title }}
                  </p>
                  <p class="text-sm text-primary-800 dark:text-primary-200 leading-relaxed mt-1">
                    {{ rec.description }}
                  </p>
                </div>
              </div>

              <!-- Fallback Heuristic -->
              <p
                v-else
                class="text-sm text-primary-800 dark:text-primary-200 leading-relaxed font-medium"
              >
                {{ getTrainingRecommendation() }}
              </p>

              <div v-if="wellnessData.id" class="flex justify-end mt-2">
                <UButton
                  :to="`/fitness/${wellnessData.id}`"
                  variant="ghost"
                  color="primary"
                  size="xs"
                  icon="i-heroicons-arrow-right"
                  trailing
                >
                  View Full Details
                </UButton>
              </div>
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
  import { subDays, format as formatDateFns } from 'date-fns'

  const props = defineProps<{
    open: boolean
    date: Date | null
  }>()

  const emit = defineEmits<{
    'update:open': [value: boolean]
  }>()

  const { formatDate, timezone } = useFormat()
  const toast = useToast()
  const { checkWellnessStale } = useDataStatus()

  const isOpen = computed({
    get: () => props.open,
    set: (value) => emit('update:open', value)
  })

  const wellnessStatus = computed(() => {
    if (!props.date) return { isStale: false, label: '' }
    const dateStr = formatDateFns(props.date, 'yyyy-MM-dd')
    return checkWellnessStale(dateStr)
  })
  const isStale = computed(() => wellnessStatus.value.isStale)
  const staleLabel = computed(() => wellnessStatus.value.label)

  const formattedDate = computed(() => {
    return props.date ? formatDate(props.date, 'EEEE, MMMM d, yyyy') : ''
  })

  const loading = ref(false)
  const wellnessData = ref<any>(null)
  const trendData = ref<any[]>([])

  // AI Analysis State
  const analyzingWellness = ref(false)
  let pollingInterval: NodeJS.Timeout | null = null

  // Watch for date changes to fetch data
  watch(
    () => props.date,
    async (newDate) => {
      if (newDate && props.open) {
        await fetchWellnessData(newDate)
      }
    },
    { immediate: true }
  )

  watch(
    () => props.open,
    async (isOpen) => {
      if (isOpen && props.date) {
        await fetchWellnessData(props.date)
      } else if (!isOpen) {
        stopPolling()
      }
    }
  )

  // Cleanup on unmount
  onUnmounted(() => {
    stopPolling()
  })

  async function fetchWellnessData(date: Date) {
    loading.value = true
    stopPolling()

    try {
      const dateStr = formatDateFns(date, 'yyyy-MM-dd')

      // Fetch wellness data for the specific date
      const response = await $fetch(`/api/wellness/${dateStr}`)
      wellnessData.value = response

      // If processing, start polling
      if (wellnessData.value?.aiAnalysisStatus === 'PROCESSING') {
        startPolling()
      }

      // Fetch 7-day trend data
      const startDate = formatDateFns(subDays(date, 6), 'yyyy-MM-dd')
      const endDate = dateStr
      const trendResponse = await $fetch<any[]>(
        `/api/wellness/trend?startDate=${startDate}&endDate=${endDate}`
      )
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

  // AI Analysis Logic
  async function analyzeWellness() {
    if (!wellnessData.value?.id) return

    analyzingWellness.value = true
    try {
      const result = (await $fetch(`/api/wellness/${wellnessData.value.id}/analyze`, {
        method: 'POST'
      })) as any

      // If already completed, update immediately
      if (result.status === 'COMPLETED' && result.analysis) {
        wellnessData.value.aiAnalysisJson = result.analysis
        wellnessData.value.aiAnalyzedAt = result.analyzedAt
        wellnessData.value.aiAnalysisStatus = 'COMPLETED'
        wellnessData.value.llmUsageId = result.llmUsageId
        wellnessData.value.feedback = result.feedback
        wellnessData.value.feedbackText = result.feedbackText
        analyzingWellness.value = false

        toast.add({
          title: 'Analysis Ready',
          description: 'Wellness analysis is ready',
          color: 'success',
          icon: 'i-heroicons-check-circle'
        })
        return
      }

      // Update status and start polling
      if (wellnessData.value) {
        wellnessData.value.aiAnalysisStatus = result.status || 'PROCESSING'
      }

      toast.add({
        title: 'Analysis Started',
        description: 'AI is analyzing your wellness data...',
        color: 'info',
        icon: 'i-heroicons-sparkles'
      })

      startPolling()
    } catch (e: any) {
      console.error('Error triggering wellness analysis:', e)
      analyzingWellness.value = false
      toast.add({
        title: 'Analysis Failed',
        description: e.data?.message || 'Failed to start analysis',
        color: 'error',
        icon: 'i-heroicons-exclamation-circle'
      })
    }
  }

  function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval)

    pollingInterval = setInterval(async () => {
      if (!wellnessData.value?.id) return

      try {
        const updated = (await $fetch(`/api/wellness/${wellnessData.value.id}`)) as any

        if (wellnessData.value) {
          wellnessData.value.aiAnalysisJson = updated.aiAnalysisJson
          wellnessData.value.aiAnalysisStatus = updated.aiAnalysisStatus
          wellnessData.value.aiAnalyzedAt = updated.aiAnalyzedAt
          wellnessData.value.llmUsageId = updated.llmUsageId
          wellnessData.value.feedback = updated.feedback
          wellnessData.value.feedbackText = updated.feedbackText
        }

        if (updated.aiAnalysisStatus === 'COMPLETED' || updated.aiAnalysisStatus === 'FAILED') {
          analyzingWellness.value = false
          stopPolling()

          if (updated.aiAnalysisStatus === 'COMPLETED') {
            toast.add({
              title: 'Analysis Complete',
              color: 'success',
              icon: 'i-heroicons-check-circle'
            })
          }
        }
      } catch (e) {
        console.error('Error polling wellness status:', e)
      }
    }, 3000)
  }

  function stopPolling() {
    if (pollingInterval) {
      clearInterval(pollingInterval)
      pollingInterval = null
    }
  }

  const { calculateTrend } = useTrend()

  // Computed properties for trends
  const maxHRV = computed(() => {
    const values = trendData.value.filter((d) => d.hrv != null).map((d) => d.hrv)
    return values.length > 0 ? Math.max(...values) : 100
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

  function formatStatus(status: string) {
    if (!status) return ''
    return status.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
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
      return "You're well recovered! This is a great day for high-intensity training or hard workouts. Your body is ready to handle significant stress."
    }

    // Check HRV and sleep
    if (hrv && hrv >= 60 && sleep && sleep >= 7.5) {
      return "Good recovery metrics indicate you're ready for challenging training. Consider intervals, tempo runs, or strength work."
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
    if (restingHr && trendData.value.length > 0) {
      const rhrTrend = calculateTrend(
        restingHr,
        trendData.value.map((d) => d.restingHr).filter((v) => v != null),
        'lower-is-better',
        3 // 3% threshold
      )

      if (rhrTrend.direction === 'up') {
        // Up is bad for 'lower-is-better' (e.g. Elevated)
        return 'Elevated resting heart rate suggests your body is under stress. Prioritize recovery activities like easy movement, stretching, or complete rest.'
      }
    }

    return 'Listen to your body and adjust training intensity based on how you feel throughout your session.'
  }
</script>
