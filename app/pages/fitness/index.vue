<template>
  <UDashboardPanel id="fitness">
    <template #header>
      <UDashboardNavbar title="Fitness & Wellness">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <ClientOnly>
            <DashboardTriggerMonitorButton />
          </ClientOnly>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-3 sm:p-6 space-y-4 sm:space-y-6">
        <!-- Page Header -->
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Fitness & Wellness</h1>
          <p class="text-sm text-muted mt-1">
            Track your recovery, sleep quality, and overall wellness metrics
          </p>
        </div>

        <!-- Summary Stats -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div class="text-center">
              <div class="text-3xl font-bold text-blue-600 dark:text-blue-400">
                <USkeleton v-if="loading" class="h-9 w-12 mx-auto" />
                <template v-else>{{ totalDays }}</template>
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">Total Days</div>
            </div>
          </div>

          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div class="text-center">
              <div class="text-3xl font-bold text-green-600 dark:text-green-400">
                <USkeleton v-if="loading" class="h-9 w-12 mx-auto" />
                <template v-else>{{
                  avgRecovery !== null ? avgRecovery.toFixed(0) : '-'
                }}</template>
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">Avg Recovery</div>
            </div>
          </div>

          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div class="text-center">
              <div class="text-3xl font-bold text-yellow-600 dark:text-yellow-400">
                <USkeleton v-if="loading" class="h-9 w-12 mx-auto" />
                <template v-else>{{ avgSleep !== null ? avgSleep.toFixed(1) : '-' }}h</template>
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">Avg Sleep</div>
            </div>
          </div>

          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div class="text-center">
              <div class="text-3xl font-bold text-purple-600 dark:text-purple-400">
                <USkeleton v-if="loading" class="h-9 w-12 mx-auto" />
                <template v-else>{{ avgHRV !== null ? avgHRV.toFixed(0) : '-' }}</template>
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">Avg HRV (rMSSD)</div>
            </div>
          </div>
        </div>

        <!-- Charts Section -->
        <div v-if="loading || allWellness.length > 0" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Recovery Score Trend -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Recovery Score (Last 30 Days)
            </h3>
            <div v-if="loading" class="h-[300px]">
              <USkeleton class="h-full w-full" />
            </div>
            <div v-else style="height: 300px">
              <ClientOnly>
                <Line :data="recoveryTrendData" :options="lineChartOptions" />
              </ClientOnly>
            </div>
          </div>

          <!-- Sleep Hours Trend -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Sleep Duration (Last 30 Days)
            </h3>
            <div v-if="loading" class="h-[300px]">
              <USkeleton class="h-full w-full" />
            </div>
            <div v-else style="height: 300px">
              <ClientOnly>
                <Bar :data="sleepTrendData" :options="barChartOptions" />
              </ClientOnly>
            </div>
          </div>

          <!-- HRV Trend -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Heart Rate Variability (Last 30 Days)
            </h3>
            <div v-if="loading" class="h-[300px]">
              <USkeleton class="h-full w-full" />
            </div>
            <div v-else style="height: 300px">
              <ClientOnly>
                <Line :data="hrvTrendData" :options="hrvLineChartOptions" />
              </ClientOnly>
            </div>
          </div>

          <!-- Resting HR Trend -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Resting Heart Rate (Last 30 Days)
            </h3>
            <div v-if="loading" class="h-[300px]">
              <USkeleton class="h-full w-full" />
            </div>
            <div v-else style="height: 300px">
              <ClientOnly>
                <Line :data="restingHrTrendData" :options="hrLineChartOptions" />
              </ClientOnly>
            </div>
          </div>
        </div>

        <!-- Filters -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Recovery Status
              </label>
              <USelect
                v-model="filterRecovery"
                :items="recoveryStatusOptions"
                placeholder="All"
                class="w-full"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Sleep Quality
              </label>
              <USelect
                v-model="filterSleep"
                :items="sleepQualityOptions"
                placeholder="All"
                class="w-full"
              />
            </div>
          </div>
        </div>

        <!-- Wellness Table -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    Date
                  </th>
                  <th
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    Recovery
                  </th>
                  <th
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    Readiness
                  </th>
                  <th
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    Sleep
                  </th>
                  <th
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    HRV (rMSSD)
                  </th>
                  <th
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    HRV (SDNN)
                  </th>
                  <th
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    Resting HR
                  </th>
                  <th
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    Soreness
                  </th>
                  <th
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    Mood
                  </th>
                </tr>
              </thead>
              <tbody
                v-if="loading"
                class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700"
              >
                <tr v-for="i in 10" :key="i">
                  <td v-for="j in 9" :key="j" class="px-6 py-4">
                    <USkeleton class="h-4 w-full" />
                  </td>
                </tr>
              </tbody>
              <tbody v-else-if="filteredWellness.length === 0" class="bg-white dark:bg-gray-800">
                <tr>
                  <td colspan="9" class="p-8 text-center text-gray-600 dark:text-gray-400">
                    No wellness data found. Connect Intervals.icu and sync data to get started.
                  </td>
                </tr>
              </tbody>
              <tbody
                v-else
                class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700"
              >
                <tr
                  v-for="wellness in paginatedWellness"
                  :key="wellness.id"
                  class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  @click="navigateToWellness(wellness.id)"
                >
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {{ formatDate(wellness.date) }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm">
                    <span
                      v-if="wellness.recoveryScore"
                      :class="getRecoveryBadgeClass(wellness.recoveryScore)"
                    >
                      {{ wellness.recoveryScore }}%
                    </span>
                    <span v-else class="text-gray-400">-</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ wellness.readiness ? wellness.readiness + '/10' : '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    <div>
                      {{ wellness.sleepHours ? wellness.sleepHours.toFixed(1) + 'h' : '-' }}
                    </div>
                    <div v-if="wellness.sleepScore" class="text-xs text-gray-500">
                      Score: {{ wellness.sleepScore }}%
                    </div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ wellness.hrv ? Math.round(wellness.hrv) + 'ms' : '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ wellness.hrvSdnn ? Math.round(wellness.hrvSdnn) + 'ms' : '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ wellness.restingHr ? wellness.restingHr + ' bpm' : '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ wellness.soreness ? wellness.soreness + '/10' : '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm">
                    <span v-if="wellness.mood" :class="getMoodBadgeClass(wellness.mood)">
                      {{ wellness.mood }}/10
                    </span>
                    <span v-else class="text-gray-400">-</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          <div
            v-if="totalPages > 1"
            class="px-6 py-4 border-t border-gray-200 dark:border-gray-700"
          >
            <div class="flex items-center justify-between">
              <div class="text-sm text-gray-600 dark:text-gray-400">
                Showing {{ (currentPage - 1) * itemsPerPage + 1 }} to
                {{ Math.min(currentPage * itemsPerPage, filteredWellness.length) }} of
                {{ filteredWellness.length }} entries
              </div>
              <div class="flex gap-2">
                <button
                  :disabled="currentPage === 1"
                  class="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  @click="changePage(currentPage - 1)"
                >
                  Previous
                </button>
                <div class="flex gap-1">
                  <button
                    v-for="page in visiblePages"
                    :key="page"
                    :class="[
                      'px-3 py-1 rounded text-sm',
                      page === currentPage
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
                    ]"
                    @click="changePage(page)"
                  >
                    {{ page }}
                  </button>
                </div>
                <button
                  :disabled="currentPage === totalPages"
                  class="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  @click="changePage(currentPage + 1)"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
  import { Line, Bar } from 'vue-chartjs'
  import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
    Filler
  } from 'chart.js'

  ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
    Filler
  )

  definePageMeta({
    middleware: 'auth',
    layout: 'default'
  })

  useHead({
    title: 'Fitness & Wellness',
    meta: [
      {
        name: 'description',
        content:
          'Track your recovery, sleep quality, and overall wellness metrics with WHOOP integration.'
      }
    ]
  })

  const toast = useToast()
  const colorMode = useColorMode()
  const loading = ref(true)
  const allWellness = ref<any[]>([])
  const currentPage = ref(1)
  const itemsPerPage = 20

  // Filters
  const filterRecovery = ref<string | undefined>(undefined)
  const filterSleep = ref<string | undefined>(undefined)

  // Filter options
  const recoveryStatusOptions = [
    { label: 'Excellent (>80)', value: 'excellent' },
    { label: 'Good (60-80)', value: 'good' },
    { label: 'Fair (40-60)', value: 'fair' },
    { label: 'Poor (<40)', value: 'poor' }
  ]

  const sleepQualityOptions = [
    { label: 'Excellent (>8h)', value: 'excellent' },
    { label: 'Good (7-8h)', value: 'good' },
    { label: 'Fair (6-7h)', value: 'fair' },
    { label: 'Poor (<6h)', value: 'poor' }
  ]

  // Fetch all wellness data
  async function fetchWellness() {
    loading.value = true
    try {
      const wellness = await $fetch('/api/wellness')

      allWellness.value = wellness
    } catch (error) {
      console.error('Error fetching wellness:', error)
      toast.add({
        title: 'Error',
        description: 'Failed to load wellness data',
        color: 'error'
      })
    } finally {
      loading.value = false
    }
  }

  const { formatDate, getUserLocalDate } = useFormat()

  // Computed properties
  const filteredWellness = computed(() => {
    let wellness = [...allWellness.value]

    // Filter out future dates - compare using UTC dates only
    // todayUTC from getUserLocalDate() is already UTC midnight of user's local day
    const todayUTC = getUserLocalDate()

    wellness = wellness.filter((w) => {
      const wellnessDate = new Date(w.date)
      return wellnessDate <= todayUTC
    })

    if (filterRecovery.value) {
      wellness = wellness.filter((w) => {
        if (!w.recoveryScore) return false
        const score = w.recoveryScore
        if (filterRecovery.value === 'excellent') return score > 80
        if (filterRecovery.value === 'good') return score >= 60 && score <= 80
        if (filterRecovery.value === 'fair') return score >= 40 && score < 60
        if (filterRecovery.value === 'poor') return score < 40
        return true
      })
    }

    if (filterSleep.value) {
      wellness = wellness.filter((w) => {
        if (!w.sleepHours) return false
        const hours = w.sleepHours
        if (filterSleep.value === 'excellent') return hours > 8
        if (filterSleep.value === 'good') return hours >= 7 && hours <= 8
        if (filterSleep.value === 'fair') return hours >= 6 && hours < 7
        if (filterSleep.value === 'poor') return hours < 6
        return true
      })
    }

    return wellness
  })

  const totalDays = computed(() => allWellness.value.length)
  const avgRecovery = computed(() => {
    const withRecovery = allWellness.value.filter((w) => w.recoveryScore)
    if (withRecovery.length === 0) return null
    return withRecovery.reduce((sum, w) => sum + w.recoveryScore, 0) / withRecovery.length
  })
  const avgSleep = computed(() => {
    const withSleep = allWellness.value.filter((w) => w.sleepHours)
    if (withSleep.length === 0) return null
    return withSleep.reduce((sum, w) => sum + w.sleepHours, 0) / withSleep.length
  })
  const avgHRV = computed(() => {
    const withHRV = allWellness.value.filter((w) => w.hrv)
    if (withHRV.length === 0) return null
    return withHRV.reduce((sum, w) => sum + w.hrv, 0) / withHRV.length
  })

  const totalPages = computed(() => Math.ceil(filteredWellness.value.length / itemsPerPage))
  const visiblePages = computed(() => {
    const pages = []
    const maxVisible = 7
    let start = Math.max(1, currentPage.value - Math.floor(maxVisible / 2))
    const end = Math.min(totalPages.value, start + maxVisible - 1)

    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1)
    }

    for (let i = start; i <= end; i++) {
      pages.push(i)
    }
    return pages
  })

  const paginatedWellness = computed(() => {
    const start = (currentPage.value - 1) * itemsPerPage
    const end = start + itemsPerPage
    return filteredWellness.value.slice(start, end)
  })

  // Functions
  function formatDate(date: string | Date) {
    // Parse date in UTC to avoid timezone conversion issues
    // Database stores dates as YYYY-MM-DD (date-only, no time component)
    const d = new Date(date)
    const formatted = d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC' // Force UTC to prevent timezone shifts
    })

    return formatted
  }

  function getRecoveryBadgeClass(score: number) {
    const baseClass = 'px-2 py-1 rounded text-xs font-semibold'
    if (score > 80)
      return `${baseClass} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`
    if (score >= 60)
      return `${baseClass} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`
    if (score >= 40)
      return `${baseClass} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`
    return `${baseClass} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`
  }

  function getMoodBadgeClass(mood: number) {
    const baseClass = 'px-2 py-1 rounded text-xs font-semibold'
    if (mood >= 8)
      return `${baseClass} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`
    if (mood >= 6)
      return `${baseClass} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`
    if (mood >= 4)
      return `${baseClass} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`
    return `${baseClass} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`
  }

  function changePage(page: number) {
    currentPage.value = page
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function navigateToWellness(id: string) {
    navigateTo(`/fitness/${id}`)
  }

  // Watch filters and reset to page 1
  // Chart data computations
  const recoveryTrendData = computed(() => {
    const today = getUserLocalDate()
    const thirtyDaysAgo = new Date(today)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const recentWellness = allWellness.value
      .filter((w) => w.recoveryScore && new Date(w.date) >= thirtyDaysAgo)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    const labels = recentWellness.map((w) =>
      new Date(w.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    )

    return {
      labels,
      datasets: [
        {
          label: 'Recovery Score',
          data: recentWellness.map((w) => w.recoveryScore),
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          tension: 0.4,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true
        }
      ]
    }
  })

  const sleepTrendData = computed(() => {
    const today = getUserLocalDate()
    const thirtyDaysAgo = new Date(today)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const recentWellness = allWellness.value
      .filter((w) => w.sleepHours && new Date(w.date) >= thirtyDaysAgo)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    const labels = recentWellness.map((w) =>
      new Date(w.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    )

    return {
      labels,
      datasets: [
        {
          label: 'Hours',
          data: recentWellness.map((w) => w.sleepHours),
          backgroundColor: 'rgba(59, 130, 246, 0.8)',
          borderColor: 'rgb(59, 130, 246)',
          borderWidth: 2
        }
      ]
    }
  })

  const hrvTrendData = computed(() => {
    const today = getUserLocalDate()
    const thirtyDaysAgo = new Date(today)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const recentWellness = allWellness.value
      .filter((w) => w.hrv && new Date(w.date) >= thirtyDaysAgo)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    const labels = recentWellness.map((w) =>
      new Date(w.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    )

    return {
      labels,
      datasets: [
        {
          label: 'HRV (rMSSD)',
          data: recentWellness.map((w) => w.hrv),
          borderColor: 'rgb(168, 85, 247)',
          backgroundColor: 'rgba(168, 85, 247, 0.1)',
          tension: 0.4,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true
        }
      ]
    }
  })

  const restingHrTrendData = computed(() => {
    const today = getUserLocalDate()
    const thirtyDaysAgo = new Date(today)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const recentWellness = allWellness.value
      .filter((w) => w.restingHr && new Date(w.date) >= thirtyDaysAgo)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    const labels = recentWellness.map((w) =>
      new Date(w.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    )

    return {
      labels,
      datasets: [
        {
          label: 'Resting HR (bpm)',
          data: recentWellness.map((w) => w.restingHr),
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          tension: 0.4,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true
        }
      ]
    }
  })

  // Chart options
  const lineChartOptions = computed(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false
    },
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: colorMode.value === 'dark' ? 'rgb(31, 41, 55)' : 'rgb(255, 255, 255)',
        titleColor: colorMode.value === 'dark' ? 'rgb(229, 231, 235)' : 'rgb(17, 24, 39)',
        bodyColor: colorMode.value === 'dark' ? 'rgb(209, 213, 219)' : 'rgb(55, 65, 81)',
        borderColor: colorMode.value === 'dark' ? 'rgb(75, 85, 99)' : 'rgb(229, 231, 235)',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (context: any) => {
            return `Recovery: ${context.parsed.y.toFixed(0)}%`
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          color: colorMode.value === 'dark' ? 'rgb(156, 163, 175)' : 'rgb(107, 114, 128)',
          font: {
            size: 11
          },
          maxRotation: 45,
          minRotation: 45
        },
        border: {
          color: colorMode.value === 'dark' ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.8)'
        }
      },
      y: {
        min: 0,
        max: 100,
        ticks: {
          stepSize: 20,
          color: colorMode.value === 'dark' ? 'rgb(156, 163, 175)' : 'rgb(107, 114, 128)',
          font: {
            size: 11
          }
        },
        grid: {
          color: colorMode.value === 'dark' ? 'rgba(75, 85, 99, 0.2)' : 'rgba(229, 231, 235, 0.5)'
        },
        border: {
          color: colorMode.value === 'dark' ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.8)'
        }
      }
    }
  }))

  const barChartOptions = computed(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: colorMode.value === 'dark' ? 'rgb(31, 41, 55)' : 'rgb(255, 255, 255)',
        titleColor: colorMode.value === 'dark' ? 'rgb(229, 231, 235)' : 'rgb(17, 24, 39)',
        bodyColor: colorMode.value === 'dark' ? 'rgb(209, 213, 219)' : 'rgb(55, 65, 81)',
        borderColor: colorMode.value === 'dark' ? 'rgb(75, 85, 99)' : 'rgb(229, 231, 235)',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (context: any) => {
            return `${context.dataset.label}: ${context.parsed.y.toFixed(1)}h`
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          color: colorMode.value === 'dark' ? 'rgb(156, 163, 175)' : 'rgb(107, 114, 128)',
          font: {
            size: 11
          },
          maxRotation: 45,
          minRotation: 45
        },
        border: {
          color: colorMode.value === 'dark' ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.8)'
        }
      },
      y: {
        beginAtZero: true,
        max: 12,
        ticks: {
          stepSize: 2,
          color: colorMode.value === 'dark' ? 'rgb(156, 163, 175)' : 'rgb(107, 114, 128)',
          font: {
            size: 11
          }
        },
        grid: {
          color: colorMode.value === 'dark' ? 'rgba(75, 85, 99, 0.2)' : 'rgba(229, 231, 235, 0.5)'
        },
        border: {
          color: colorMode.value === 'dark' ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.8)'
        }
      }
    }
  }))

  const hrvLineChartOptions = computed(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false
    },
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: colorMode.value === 'dark' ? 'rgb(31, 41, 55)' : 'rgb(255, 255, 255)',
        titleColor: colorMode.value === 'dark' ? 'rgb(229, 231, 235)' : 'rgb(17, 24, 39)',
        bodyColor: colorMode.value === 'dark' ? 'rgb(209, 213, 219)' : 'rgb(55, 65, 81)',
        borderColor: colorMode.value === 'dark' ? 'rgb(75, 85, 99)' : 'rgb(229, 231, 235)',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (context: any) => {
            return `HRV: ${context.parsed.y.toFixed(0)}ms`
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          color: colorMode.value === 'dark' ? 'rgb(156, 163, 175)' : 'rgb(107, 114, 128)',
          font: {
            size: 11
          },
          maxRotation: 45,
          minRotation: 45
        },
        border: {
          color: colorMode.value === 'dark' ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.8)'
        }
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: colorMode.value === 'dark' ? 'rgb(156, 163, 175)' : 'rgb(107, 114, 128)',
          font: {
            size: 11
          }
        },
        grid: {
          color: colorMode.value === 'dark' ? 'rgba(75, 85, 99, 0.2)' : 'rgba(229, 231, 235, 0.5)'
        },
        border: {
          color: colorMode.value === 'dark' ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.8)'
        }
      }
    }
  }))

  const hrLineChartOptions = computed(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false
    },
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: colorMode.value === 'dark' ? 'rgb(31, 41, 55)' : 'rgb(255, 255, 255)',
        titleColor: colorMode.value === 'dark' ? 'rgb(229, 231, 235)' : 'rgb(17, 24, 39)',
        bodyColor: colorMode.value === 'dark' ? 'rgb(209, 213, 219)' : 'rgb(55, 65, 81)',
        borderColor: colorMode.value === 'dark' ? 'rgb(75, 85, 99)' : 'rgb(229, 231, 235)',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (context: any) => {
            return `HR: ${context.parsed.y.toFixed(0)} bpm`
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          color: colorMode.value === 'dark' ? 'rgb(156, 163, 175)' : 'rgb(107, 114, 128)',
          font: {
            size: 11
          },
          maxRotation: 45,
          minRotation: 45
        },
        border: {
          color: colorMode.value === 'dark' ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.8)'
        }
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: colorMode.value === 'dark' ? 'rgb(156, 163, 175)' : 'rgb(107, 114, 128)',
          font: {
            size: 11
          }
        },
        grid: {
          color: colorMode.value === 'dark' ? 'rgba(75, 85, 99, 0.2)' : 'rgba(229, 231, 235, 0.5)'
        },
        border: {
          color: colorMode.value === 'dark' ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.8)'
        }
      }
    }
  }))

  watch([filterRecovery, filterSleep], () => {
    currentPage.value = 1
  })

  // Load data on mount
  onMounted(() => {
    fetchWellness()
  })
</script>
