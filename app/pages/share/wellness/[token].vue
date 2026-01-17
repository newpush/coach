<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div v-if="loading" class="flex items-center justify-center py-12">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
        <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">Loading shared wellness data...</p>
      </div>
    </div>

    <div v-else-if="error" class="text-center py-12">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8 max-w-md mx-auto">
        <UIcon
          name="i-heroicons-exclamation-triangle"
          class="w-12 h-12 text-red-500 mx-auto mb-4"
        />
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Unavailable</h3>
        <p class="text-gray-600 dark:text-gray-400 mb-6">{{ error }}</p>
        <UButton to="/" color="primary" variant="solid">Go Home</UButton>
      </div>
    </div>

    <div v-else-if="wellness" class="space-y-6">
      <!-- Header Section -->
      <div
        class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700"
      >
        <div class="flex items-start justify-between mb-4">
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-2">
              <UAvatar :src="user?.image || undefined" :alt="user?.name || 'User'" size="xs" />
              <span class="text-sm text-gray-500 dark:text-gray-400">
                {{ user?.name || 'Coach Wattz User' }} shared their wellness
              </span>
            </div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Daily Wellness</h1>
            <div class="flex flex-wrap gap-3 text-sm text-gray-600 dark:text-gray-400">
              <div class="flex items-center gap-1">
                <span class="i-heroicons-calendar w-4 h-4" />
                {{ formatDate(wellness.date) }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Key Metrics Grid -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div
          v-if="wellness.recoveryScore"
          class="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/30 rounded-lg p-6 shadow-sm border border-green-200 dark:border-green-800/30"
        >
          <div class="flex items-center justify-between mb-2">
            <span class="i-heroicons-heart w-6 h-6 text-green-600 dark:text-green-400" />
          </div>
          <div class="text-3xl font-bold text-green-900 dark:text-green-100">
            {{ wellness.recoveryScore }}%
          </div>
          <div class="text-sm text-green-700 dark:text-green-300 mt-1">Recovery Score</div>
        </div>

        <div
          v-if="wellness.readiness"
          class="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/30 rounded-lg p-6 shadow-sm border border-blue-200 dark:border-blue-800/30"
        >
          <div class="flex items-center justify-between mb-2">
            <span class="i-heroicons-bolt w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div class="text-3xl font-bold text-blue-900 dark:text-blue-100">
            {{ wellness.readiness }}{{ wellness.readiness > 10 ? '%' : '/10' }}
          </div>
          <div class="text-sm text-blue-700 dark:text-blue-300 mt-1">Readiness</div>
        </div>

        <div
          v-if="wellness.sleepHours"
          class="bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/20 dark:to-indigo-800/30 rounded-lg p-6 shadow-sm border border-indigo-200 dark:border-indigo-800/30"
        >
          <div class="flex items-center justify-between mb-2">
            <span class="i-heroicons-moon w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div class="text-3xl font-bold text-indigo-900 dark:text-indigo-100">
            {{ wellness.sleepHours.toFixed(1) }}h
          </div>
          <div class="text-sm text-indigo-700 dark:text-indigo-300 mt-1">Sleep Duration</div>
        </div>

        <div
          v-if="wellness.hrv"
          class="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/30 rounded-lg p-6 shadow-sm border border-purple-200 dark:border-purple-800/30"
        >
          <div class="flex items-center justify-between mb-2">
            <span class="i-heroicons-heart-pulse w-6 h-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div class="text-3xl font-bold text-purple-900 dark:text-purple-100">
            {{ Math.round(wellness.hrv) }}
          </div>
          <div class="text-sm text-purple-700 dark:text-purple-300 mt-1">HRV (rMSSD)</div>
        </div>
      </div>

      <!-- AI Analysis Section (Read Only) -->
      <div
        v-if="wellness.aiAnalysisJson"
        class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700"
      >
        <div class="flex items-center gap-2 mb-4">
          <span class="i-heroicons-sparkles w-5 h-5 text-primary-500" />
          <h2 class="text-lg font-bold text-gray-900 dark:text-white">AI Analysis</h2>
        </div>

        <!-- Executive Summary -->
        <div
          class="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800 mb-6"
        >
          <h3
            class="text-base font-semibold text-blue-900 dark:text-blue-100 mb-4 flex items-center gap-2"
          >
            <span class="i-heroicons-light-bulb w-5 h-5" />
            Quick Take
          </h3>
          <p class="text-base text-gray-800 dark:text-gray-200 leading-relaxed">
            {{ wellness.aiAnalysisJson.executive_summary }}
          </p>
        </div>

        <!-- Analysis Sections -->
        <div v-if="wellness.aiAnalysisJson.sections" class="grid grid-cols-1 gap-4">
          <div
            v-for="(section, index) in wellness.aiAnalysisJson.sections"
            :key="index"
            class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
          >
            <div
              class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between"
            >
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                {{ section.title }}
              </h3>
              <span :class="getStatusBadgeClass(section.status)">
                {{ section.status_label || section.status }}
              </span>
            </div>
            <div class="px-6 py-4">
              <ul class="space-y-2">
                <li
                  v-for="(point, pIndex) in section.analysis_points"
                  :key="pIndex"
                  class="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
                >
                  <span
                    class="i-heroicons-chevron-right w-4 h-4 mt-0.5 text-primary-500 flex-shrink-0"
                  />
                  <span>{{ point }}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Strengths & Weaknesses -->
        <div
          v-if="wellness.aiAnalysisJson.strengths || wellness.aiAnalysisJson.weaknesses"
          class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6"
        >
          <!-- Strengths -->
          <div
            v-if="wellness.aiAnalysisJson.strengths && wellness.aiAnalysisJson.strengths.length > 0"
            class="bg-green-50 dark:bg-green-900/20 rounded-lg p-6 border border-green-200 dark:border-green-800"
          >
            <h3
              class="text-lg font-semibold text-green-900 dark:text-green-100 mb-3 flex items-center gap-2"
            >
              <span class="i-heroicons-check-circle w-5 h-5" />
              Strengths
            </h3>
            <ul class="space-y-2">
              <li
                v-for="(strength, index) in wellness.aiAnalysisJson.strengths"
                :key="index"
                class="flex items-start gap-2 text-sm text-green-800 dark:text-green-200"
              >
                <span class="i-heroicons-plus-circle w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{{ strength }}</span>
              </li>
            </ul>
          </div>

          <!-- Weaknesses -->
          <div
            v-if="
              wellness.aiAnalysisJson.weaknesses && wellness.aiAnalysisJson.weaknesses.length > 0
            "
            class="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-6 border border-orange-200 dark:border-orange-800"
          >
            <h3
              class="text-lg font-semibold text-orange-900 dark:text-orange-100 mb-3 flex items-center gap-2"
            >
              <span class="i-heroicons-exclamation-triangle w-5 h-5" />
              Areas for Improvement
            </h3>
            <ul class="space-y-2">
              <li
                v-for="(weakness, index) in wellness.aiAnalysisJson.weaknesses"
                :key="index"
                class="flex items-start gap-2 text-sm text-orange-800 dark:text-orange-200"
              >
                <span class="i-heroicons-arrow-trending-up w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{{ weakness }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Detailed Metrics Section -->
      <div
        class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700"
      >
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Detailed Metrics</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
          <!-- Heart Rate -->
          <div
            v-if="wellness.restingHr"
            class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
          >
            <span class="text-sm text-gray-600 dark:text-gray-400">Resting Heart Rate</span>
            <span class="text-sm font-medium text-gray-900 dark:text-white"
              >{{ wellness.restingHr }} bpm</span
            >
          </div>
          <div
            v-if="wellness.avgSleepingHr"
            class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
          >
            <span class="text-sm text-gray-600 dark:text-gray-400">Avg Sleeping HR</span>
            <span class="text-sm font-medium text-gray-900 dark:text-white"
              >{{ wellness.avgSleepingHr }} bpm</span
            >
          </div>
          <div
            v-if="wellness.hrvSdnn"
            class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
          >
            <span class="text-sm text-gray-600 dark:text-gray-400">HRV SDNN</span>
            <span class="text-sm font-medium text-gray-900 dark:text-white"
              >{{ Math.round(wellness.hrvSdnn) }} ms</span
            >
          </div>

          <!-- Sleep -->
          <div
            v-if="wellness.sleepScore"
            class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
          >
            <span class="text-sm text-gray-600 dark:text-gray-400">Sleep Score</span>
            <span class="text-sm font-medium text-gray-900 dark:text-white"
              >{{ wellness.sleepScore }}%</span
            >
          </div>
          <div
            v-if="wellness.sleepQuality"
            class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
          >
            <span class="text-sm text-gray-600 dark:text-gray-400">Sleep Quality</span>
            <span class="text-sm font-medium text-gray-900 dark:text-white"
              >{{ wellness.sleepQuality }}/10</span
            >
          </div>

          <!-- Physical -->
          <div
            v-if="wellness.weight"
            class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
          >
            <span class="text-sm text-gray-600 dark:text-gray-400">Weight</span>
            <span class="text-sm font-medium text-gray-900 dark:text-white"
              >{{ wellness.weight.toFixed(2) }} kg</span
            >
          </div>
          <div
            v-if="wellness.spO2"
            class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
          >
            <span class="text-sm text-gray-600 dark:text-gray-400">SpO2</span>
            <span class="text-sm font-medium text-gray-900 dark:text-white"
              >{{ wellness.spO2.toFixed(1) }}%</span
            >
          </div>

          <!-- Training Load -->
          <div
            v-if="wellness.ctl"
            class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
          >
            <span class="text-sm text-gray-600 dark:text-gray-400">CTL (Fitness)</span>
            <span class="text-sm font-medium text-gray-900 dark:text-white">{{
              wellness.ctl.toFixed(1)
            }}</span>
          </div>
          <div
            v-if="wellness.atl"
            class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
          >
            <span class="text-sm text-gray-600 dark:text-gray-400">ATL (Fatigue)</span>
            <span class="text-sm font-medium text-gray-900 dark:text-white">{{
              wellness.atl.toFixed(1)
            }}</span>
          </div>

          <!-- Subjective -->
          <div
            v-if="wellness.soreness"
            class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
          >
            <span class="text-sm text-gray-600 dark:text-gray-400">Soreness</span>
            <span class="text-sm font-medium text-gray-900 dark:text-white"
              >{{ wellness.soreness }}/10</span
            >
          </div>
          <div
            v-if="wellness.fatigue"
            class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
          >
            <span class="text-sm text-gray-600 dark:text-gray-400">Fatigue</span>
            <span class="text-sm font-medium text-gray-900 dark:text-white"
              >{{ wellness.fatigue }}/10</span
            >
          </div>
          <div
            v-if="wellness.stress"
            class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
          >
            <span class="text-sm text-gray-600 dark:text-gray-400">Stress</span>
            <span class="text-sm font-medium text-gray-900 dark:text-white"
              >{{ wellness.stress }}/10</span
            >
          </div>
          <div
            v-if="wellness.mood"
            class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
          >
            <span class="text-sm text-gray-600 dark:text-gray-400">Mood</span>
            <span class="text-sm font-medium text-gray-900 dark:text-white"
              >{{ wellness.mood }}/10</span
            >
          </div>
          <div
            v-if="wellness.motivation"
            class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
          >
            <span class="text-sm text-gray-600 dark:text-gray-400">Motivation</span>
            <span class="text-sm font-medium text-gray-900 dark:text-white"
              >{{ wellness.motivation }}/10</span
            >
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  const { formatDate: baseFormatDate, formatDateTime } = useFormat()

  // Public share page - accessible to everyone
  definePageMeta({
    layout: 'share'
  })

  const route = useRoute()
  const token = route.params.token as string

  const {
    data: shareData,
    pending: loading,
    error: fetchError
  } = await useFetch<any>(`/api/share/${token}`)

  const wellness = computed(() => shareData.value?.data)
  const user = computed(() => shareData.value?.user)

  const error = computed(() => {
    if (fetchError.value) {
      return (
        fetchError.value.data?.message ||
        'Failed to load wellness data. The link may be invalid or expired.'
      )
    }
    return null
  })

  // Formatters
  function formatDate(date: string | Date) {
    if (!date) return ''
    return formatDateTime(date, 'EEEE, MMMM d, yyyy')
  }

  function getStatusBadgeClass(status: string) {
    const baseClass = 'px-3 py-1 rounded-full text-xs font-semibold'
    if (status === 'optimal')
      return `${baseClass} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`
    if (status === 'good')
      return `${baseClass} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`
    if (status === 'caution')
      return `${baseClass} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`
    if (status === 'attention' || status === 'rest_required')
      return `${baseClass} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`
    return `${baseClass} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200`
  }

  const pageTitle = computed(() =>
    wellness.value
      ? `Daily Wellness - ${formatDate(wellness.value.date)} | Coach Wattz`
      : 'Shared Wellness | Coach Wattz'
  )
  const pageDescription = computed(() => {
    if (wellness.value) {
      const dateStr = formatDate(wellness.value.date)
      return `Check out this wellness data on Coach Wattz: ${dateStr}. Recovery: ${wellness.value.recoveryScore}%, HRV: ${Math.round(wellness.value.hrv)}ms.`.substring(
        0,
        160
      )
    }
    return 'View shared wellness data on Coach Wattz.'
  })

  useHead({
    title: pageTitle,
    meta: [
      { name: 'description', content: pageDescription },
      { property: 'og:title', content: pageTitle },
      { property: 'og:description', content: pageDescription },
      { property: 'og:type', content: 'article' },
      { property: 'article:published_time', content: computed(() => wellness.value?.date) },
      { name: 'twitter:title', content: pageTitle },
      { name: 'twitter:description', content: pageDescription }
    ]
  })
</script>
