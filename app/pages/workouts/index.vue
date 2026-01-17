<template>
  <UDashboardPanel id="workouts">
    <template #header>
      <UDashboardNavbar title="Workouts">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <div class="flex gap-3">
            <DashboardTriggerMonitorButton />
            <UButton
              :loading="generatingExplanations"
              color="primary"
              variant="solid"
              icon="i-heroicons-sparkles"
              size="sm"
              class="font-bold"
              @click="generateExplanations"
            >
              <span class="hidden sm:inline">Insights</span>
              <span class="sm:hidden">AI</span>
            </UButton>
            <UButton
              :loading="analyzingWorkouts"
              color="neutral"
              variant="outline"
              size="sm"
              icon="i-heroicons-cpu-chip"
              class="font-bold"
              @click="analyzeAllWorkouts"
            >
              <span class="hidden sm:inline">Analyze</span>
              <span class="sm:hidden">Sync</span>
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-3 sm:p-6 space-y-6 sm:space-y-12">
        <!-- Page Header -->
        <div>
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Workouts</h1>
          <p class="text-sm font-medium text-gray-500 dark:text-gray-400 mt-1">
            View and analyze your training sessions with AI-powered insights
          </p>
        </div>

        <!-- Summary Stats -->
        <WorkoutSummary
          :total-workouts="totalWorkouts"
          :analyzed-workouts="analyzedWorkouts"
          :avg-score="avgScore"
          :total-hours="totalHours"
        />

        <!-- Workout Performance Scores -->
        <WorkoutPerformance
          v-model="selectedPeriod"
          :trends-data="workoutTrendsData"
          :loading="workoutTrendsLoading"
          @open-modal="openWorkoutModal"
        />

        <!-- Charts Section -->
        <WorkoutCharts
          v-if="loading || allWorkouts.length > 0"
          :loading="loading"
          :distribution-data="activityDistributionData"
          :scores-data="scoresTimelineData"
          :load-data="trainingLoadData"
          :volume-data="weeklyVolumeData"
          :chart-options="doughnutChartOptions"
          :line-options="lineChartOptions"
          :bar-options="barChartOptions"
        />

        <!-- Filters & Table -->
        <div class="space-y-6">
          <UCard class="bg-gray-50/30 dark:bg-gray-900/20">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              <UFormField label="Activity Type">
                <USelect
                  v-model="filterType"
                  :items="activityTypeOptions"
                  placeholder="All Types"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Analysis Status">
                <USelect
                  v-model="filterAnalysis"
                  :items="analysisStatusOptions"
                  placeholder="All Status"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Source">
                <USelect
                  v-model="filterSource"
                  :items="sourceOptions"
                  placeholder="All Sources"
                  class="w-full"
                />
              </UFormField>
            </div>
          </UCard>

          <WorkoutTable
            v-model:current-page="currentPage"
            :workouts="paginatedWorkouts"
            :loading="loading"
            :total-pages="totalPages"
            :total-workouts="filteredWorkouts.length"
            :visible-pages="visiblePages"
            @navigate="navigateToWorkout"
          />
        </div>

        <!-- Score Detail Modal -->
        <ScoreDetailModal
          v-model="showModal"
          :title="modalData.title"
          :score="modalData.score"
          :explanation="modalData.explanation"
          :analysis-data="modalData.analysisData"
          :color="modalData.color"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
  import WorkoutSummary from '~/components/workouts/WorkoutSummary.vue'
  import WorkoutPerformance from '~/components/workouts/WorkoutPerformance.vue'
  import WorkoutCharts from '~/components/workouts/WorkoutCharts.vue'
  import WorkoutTable from '~/components/workouts/WorkoutTable.vue'

  const { formatDate, getUserLocalDate, timezone } = useFormat()

  definePageMeta({
    middleware: 'auth',
    layout: 'default'
  })

  useHead({
    title: 'Workouts',
    meta: [
      {
        name: 'description',
        content:
          'View and analyze your training sessions with AI-powered insights for every workout.'
      }
    ]
  })

  const toast = useToast()
  const colorMode = useColorMode()
  const loading = ref(true)
  const analyzingWorkouts = ref(false)
  const allWorkouts = ref<any[]>([])
  const currentPage = ref(1)
  const itemsPerPage = 20

  // Background Task Monitoring
  const { refresh: refreshRuns } = useUserRuns()
  const { onTaskCompleted } = useUserRunsState()

  // Listeners
  onTaskCompleted('analyze-workout', async () => {
    await fetchWorkouts()
    analyzingWorkouts.value = false
    toast.add({
      title: 'Analysis Complete',
      description: 'Workout analysis has been updated.',
      color: 'success',
      icon: 'i-heroicons-check-circle'
    })
  })

  onTaskCompleted('generate-score-explanations', async () => {
    await refreshNuxtData('workout-trends')
    generatingExplanations.value = false
    toast.add({
      title: 'Insights Ready',
      description: 'Workout insights have been generated.',
      color: 'success',
      icon: 'i-heroicons-sparkles'
    })
  })

  // Filters
  const filterType = ref<string | undefined>(undefined)
  const filterAnalysis = ref<string | undefined>(undefined)
  const filterSource = ref<string | undefined>(undefined)

  // Filter options
  const activityTypeOptions = [
    { label: 'Run', value: 'Run' },
    { label: 'Ride', value: 'Ride' },
    { label: 'Swim', value: 'Swim' },
    { label: 'Other', value: 'Other' }
  ]

  const analysisStatusOptions = [
    { label: 'Completed', value: 'COMPLETED' },
    { label: 'Pending', value: 'PENDING' },
    { label: 'Processing', value: 'PROCESSING' },
    { label: 'Not Started', value: 'NOT_STARTED' }
  ]

  const sourceOptions = [
    { label: 'Intervals.icu', value: 'intervals' },
    { label: 'Strava', value: 'strava' },
    { label: 'Whoop', value: 'whoop' },
    { label: 'Garmin', value: 'garmin' }
  ]

  // Fetch all workouts
  async function fetchWorkouts() {
    loading.value = true
    try {
      // Fetch up to 1000 workouts for better history in charts
      // The payload is now optimized (COACH-WATTS-7) so this is safe
      const workouts = await $fetch('/api/workouts', {
        query: { limit: 1000 }
      })
      allWorkouts.value = workouts
    } catch (error) {
      console.error('Error fetching workouts:', error)
      toast.add({
        title: 'Error',
        description: 'Failed to load workouts',
        color: 'error'
      })
    } finally {
      loading.value = false
    }
  }

  // Computed properties
  const filteredWorkouts = computed(() => {
    let workouts = [...allWorkouts.value]

    if (filterType.value) {
      workouts = workouts.filter((w) => w.type === filterType.value)
    }

    if (filterAnalysis.value) {
      if (filterAnalysis.value === 'NOT_STARTED') {
        workouts = workouts.filter((w) => !w.aiAnalysisStatus)
      } else {
        workouts = workouts.filter((w) => w.aiAnalysisStatus === filterAnalysis.value)
      }
    }

    if (filterSource.value) {
      workouts = workouts.filter((w) => w.source === filterSource.value)
    }

    return workouts
  })

  const totalWorkouts = computed(() => allWorkouts.value.length)
  const analyzedWorkouts = computed(
    () => allWorkouts.value.filter((w) => w.aiAnalysisStatus === 'COMPLETED').length
  )
  const avgScore = computed(() => {
    const withScores = allWorkouts.value.filter((w) => w.overallScore)
    if (withScores.length === 0) return null
    return withScores.reduce((sum, w) => sum + w.overallScore, 0) / withScores.length
  })
  const totalHours = computed(() => {
    const totalSec = allWorkouts.value.reduce((sum, w) => sum + (w.durationSec || 0), 0)
    return Math.round(totalSec / 3600)
  })

  const totalPages = computed(() => Math.ceil(filteredWorkouts.value.length / itemsPerPage))
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

  const paginatedWorkouts = computed(() => {
    const start = (currentPage.value - 1) * itemsPerPage
    const end = start + itemsPerPage
    return filteredWorkouts.value.slice(start, end)
  })

  // Functions
  function navigateToWorkout(id: string) {
    navigateTo(`/workouts/${id}`)
  }

  async function analyzeAllWorkouts() {
    analyzingWorkouts.value = true
    try {
      const response: any = await $fetch('/api/workouts/analyze-all', {
        method: 'POST'
      })
      refreshRuns()

      toast.add({
        title: 'Analysis Started',
        description: response.message,
        color: 'success',
        icon: 'i-heroicons-check-circle'
      })
    } catch (error: any) {
      analyzingWorkouts.value = false
      toast.add({
        title: 'Analysis Failed',
        description: error.data?.message || error.message || 'Failed to start analysis',
        color: 'error',
        icon: 'i-heroicons-exclamation-circle'
      })
    }
  }

  // Score trends and insights functionality
  const generatingExplanations = ref(false)
  const selectedPeriod = ref(30)

  // Fetch workout trends data
  const { data: workoutTrendsData, pending: workoutTrendsLoading } = await useFetch(
    '/api/scores/workout-trends',
    {
      query: { days: selectedPeriod }
    }
  )

  // Modal state
  const showModal = ref(false)
  const modalData = ref<{
    title: string
    score: number | null
    explanation: string | null
    analysisData?: any
    color?: 'gray' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'cyan'
  }>({
    title: '',
    score: null,
    explanation: null,
    analysisData: undefined,
    color: undefined
  })

  // Generate all score explanations (batch job)
  async function generateExplanations() {
    generatingExplanations.value = true
    try {
      const response: any = await $fetch('/api/scores/generate-explanations', {
        method: 'POST'
      })
      refreshRuns()

      toast.add({
        title: 'Generating Insights',
        description:
          response.message || 'AI is analyzing your workout data. This may take a few minutes.',
        color: 'success',
        icon: 'i-heroicons-sparkles'
      })
    } catch (error: any) {
      generatingExplanations.value = false
      toast.add({
        title: 'Generation Failed',
        description: error.data?.message || error.message || 'Failed to generate insights',
        color: 'error',
        icon: 'i-heroicons-exclamation-circle'
      })
    }
  }

  // Open workout modal with AI insights
  async function openWorkoutModal(title: string, score: number | null, color?: string) {
    if (!score) return

    const metricName = getWorkoutMetricName(title)

    modalData.value = {
      title,
      score,
      explanation: 'Loading insights...',
      analysisData: undefined,
      color: color as any
    }
    showModal.value = true

    try {
      const response: any = await $fetch('/api/scores/explanation', {
        query: {
          type: 'workout',
          period: selectedPeriod.value.toString(),
          metric: metricName
        }
      })

      if (response.cached === false && response.generating) {
        // Wait 3 seconds and retry
        await new Promise((resolve) => setTimeout(resolve, 3000))
        const retryResponse: any = await $fetch('/api/scores/explanation', {
          query: {
            type: 'workout',
            period: selectedPeriod.value.toString(),
            metric: metricName
          }
        })
        modalData.value.analysisData = retryResponse.analysis
        modalData.value.explanation = null
      } else if (response.cached === false && !response.generating) {
        // Not cached and not generating (manual trigger required)
        modalData.value.explanation =
          response.message || 'No insights available. Click "Insights" to create them.'
      } else {
        modalData.value.analysisData = response.analysis
        modalData.value.explanation = null
      }
    } catch (error) {
      console.error('Error fetching workout explanation:', error)
      modalData.value.explanation = 'Failed to load explanation. Please try again.'
    }
  }

  // Map display names to metric names
  function getWorkoutMetricName(title: string): string {
    const mapping: Record<string, string> = {
      Overall: 'overall',
      'Technical Execution': 'technical',
      'Effort Management': 'effort',
      'Pacing Strategy': 'pacing',
      'Workout Execution': 'execution'
    }
    return mapping[title] || title.toLowerCase()
  }

  // Chart data computations
  const activityDistributionData = computed(() => {
    const typeCounts: Record<string, number> = {}
    allWorkouts.value.forEach((w) => {
      const type = w.type || 'Other'
      typeCounts[type] = (typeCounts[type] || 0) + 1
    })

    const labels = Object.keys(typeCounts)
    const data = Object.values(typeCounts)

    return {
      labels,
      datasets: [
        {
          data,
          backgroundColor: [
            'rgba(59, 130, 246, 0.8)', // blue for Run
            'rgba(34, 197, 94, 0.8)', // green for Ride
            'rgba(234, 179, 8, 0.8)', // yellow for Swim
            'rgba(168, 85, 247, 0.8)', // purple for Other
            'rgba(239, 68, 68, 0.8)', // red
            'rgba(6, 182, 212, 0.8)' // cyan
          ],
          borderColor: [
            'rgb(59, 130, 246)',
            'rgb(34, 197, 94)',
            'rgb(234, 179, 8)',
            'rgb(168, 85, 247)',
            'rgb(239, 68, 68)',
            'rgb(6, 182, 212)'
          ],
          borderWidth: 2
        }
      ]
    }
  })

  const scoresTimelineData = computed(() => {
    // Get workouts from last 30 days with scores
    const today = getUserLocalDate()
    const thirtyDaysAgo = new Date(today)
    thirtyDaysAgo.setDate(today.getDate() - 30)

    const recentWorkouts = allWorkouts.value
      .filter((w) => w.overallScore && new Date(w.date) >= thirtyDaysAgo)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    // Group by date and calculate average
    const scoresByDate: Record<string, number[]> = {}
    recentWorkouts.forEach((w) => {
      const dateStr = formatDate(w.date, 'MMM d')
      if (!scoresByDate[dateStr]) scoresByDate[dateStr] = []
      scoresByDate[dateStr].push(w.overallScore)
    })

    const labels = Object.keys(scoresByDate)
    const avgScores = labels.map((date) => {
      const scores = scoresByDate[date]
      if (!scores || scores.length === 0) return 0
      return scores.reduce((sum, s) => sum + s, 0) / scores.length
    })

    return {
      labels,
      datasets: [
        {
          label: 'Average Score',
          data: avgScores,
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.4,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true
        }
      ]
    }
  })

  const trainingLoadData = computed(() => {
    // Get workouts from last 30 days with training load
    const today = getUserLocalDate()
    const thirtyDaysAgo = new Date(today)
    thirtyDaysAgo.setDate(today.getDate() - 30)

    const recentWorkouts = allWorkouts.value
      .filter((w) => w.trainingLoad && new Date(w.date) >= thirtyDaysAgo)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    // Group by date and sum training load
    const loadByDate: Record<string, number> = {}
    recentWorkouts.forEach((w) => {
      const dateStr = formatDate(w.date, 'MMM d')
      loadByDate[dateStr] = (loadByDate[dateStr] || 0) + w.trainingLoad
    })

    const labels = Object.keys(loadByDate)
    const loads = Object.values(loadByDate)

    return {
      labels,
      datasets: [
        {
          label: 'Training Load',
          data: loads,
          backgroundColor: 'rgba(34, 197, 94, 0.8)',
          borderColor: 'rgb(34, 197, 94)',
          borderWidth: 2
        }
      ]
    }
  })

  const weeklyVolumeData = computed(() => {
    // Get workouts from last 8 weeks
    const today = getUserLocalDate()
    const eightWeeksAgo = new Date(today)
    eightWeeksAgo.setDate(today.getDate() - 56)

    const recentWorkouts = allWorkouts.value.filter((w) => new Date(w.date) >= eightWeeksAgo)

    // Group by week
    const volumeByWeek: Record<string, number> = {}
    recentWorkouts.forEach((w) => {
      const date = new Date(w.date)
      const weekStart = new Date(date)
      weekStart.setDate(date.getDate() - date.getDay()) // Start of week (Sunday) - local aware enough for labels
      const weekLabel = formatDate(weekStart, 'MMM d')

      const hours = (w.durationSec || 0) / 3600
      volumeByWeek[weekLabel] = (volumeByWeek[weekLabel] || 0) + hours
    })

    const labels = Object.keys(volumeByWeek)
    const hours = Object.values(volumeByWeek)

    return {
      labels,
      datasets: [
        {
          label: 'Hours',
          data: hours,
          backgroundColor: 'rgba(168, 85, 247, 0.8)',
          borderColor: 'rgba(168, 85, 247, 1)',
          borderWidth: 2
        }
      ]
    }
  })

  // Chart options
  const doughnutChartOptions = computed(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: colorMode.value === 'dark' ? 'rgb(209, 213, 219)' : 'rgb(55, 65, 81)',
          padding: 15,
          font: {
            size: 12
          }
        }
      },
      tooltip: {
        backgroundColor: colorMode.value === 'dark' ? 'rgb(31, 41, 55)' : 'rgb(255, 255, 255)',
        titleColor: colorMode.value === 'dark' ? 'rgb(229, 231, 235)' : 'rgb(17, 24, 39)',
        bodyColor: colorMode.value === 'dark' ? 'rgb(209, 213, 219)' : 'rgb(55, 65, 81)',
        borderColor: colorMode.value === 'dark' ? 'rgb(75, 85, 99)' : 'rgb(229, 231, 235)',
        borderWidth: 1,
        padding: 12
      }
    }
  }))

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
            return `Score: ${context.parsed.y.toFixed(1)}/10`
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
        max: 10,
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
            return `${context.dataset.label}: ${context.parsed.y.toFixed(1)}`
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

  // Watch filters and reset to page 1
  watch([filterType, filterAnalysis, filterSource], () => {
    currentPage.value = 1
  })

  // Load data on mount
  onMounted(() => {
    fetchWorkouts()
  })
</script>
