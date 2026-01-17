<template>
  <UDashboardPanel id="nutrition">
    <template #header>
      <UDashboardNavbar title="Nutrition">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <div class="flex gap-3">
            <ClientOnly>
              <DashboardTriggerMonitorButton />
            </ClientOnly>
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
              :loading="analyzingNutrition"
              color="neutral"
              variant="outline"
              size="sm"
              icon="i-heroicons-cpu-chip"
              class="font-bold"
              @click="analyzeAllNutrition"
            >
              <span class="hidden sm:inline">Analyze</span>
              <span class="sm:hidden">Sync</span>
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-3 sm:p-6 space-y-4 sm:space-y-6">
        <!-- Page Header -->
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Nutrition</h1>
          <p class="text-sm text-muted mt-1">
            Monitor your daily nutrition intake and quality scores
          </p>
        </div>

        <!-- Summary Stats -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-3 sm:gap-4">
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
            <div class="text-center">
              <div class="text-3xl font-bold text-blue-600 dark:text-blue-400">
                <USkeleton v-if="loading" class="h-9 w-12 mx-auto" />
                <template v-else>{{ totalNutrition }}</template>
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">Total Days</div>
            </div>
          </div>

          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
            <div class="text-center">
              <div class="text-3xl font-bold text-green-600 dark:text-green-400">
                <USkeleton v-if="loading" class="h-9 w-12 mx-auto" />
                <template v-else>{{ analyzedNutrition }}</template>
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">Analyzed</div>
            </div>
          </div>

          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
            <div class="text-center">
              <div class="text-3xl font-bold text-yellow-600 dark:text-yellow-400">
                <USkeleton v-if="loading" class="h-9 w-12 mx-auto" />
                <template v-else>{{ avgScore !== null ? avgScore.toFixed(1) : '-' }}</template>
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">Avg Score</div>
            </div>
          </div>

          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
            <div class="text-center">
              <div class="text-3xl font-bold text-purple-600 dark:text-purple-400">
                <USkeleton v-if="loading" class="h-9 w-20 mx-auto" />
                <template v-else>{{ avgCalories ? Math.round(avgCalories) : '-' }}</template>
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">Avg Calories</div>
            </div>
          </div>
        </div>

        <!-- Nutrition Quality Scores -->
        <div class="space-y-6">
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Nutrition Quality</h2>
            <USelect
              v-model="selectedPeriod"
              :items="periodOptions"
              class="w-32 sm:w-36"
              size="sm"
            />
          </div>

          <div v-if="nutritionScoresLoading" class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <UCard v-for="i in 5" :key="i">
                <div class="space-y-2">
                  <USkeleton class="h-4 w-20" />
                  <USkeleton class="h-8 w-12" />
                </div>
              </UCard>
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div class="lg:col-span-2 space-y-4">
                <USkeleton class="h-8 w-48" />
                <USkeleton class="h-64 w-full" />
              </div>
              <div class="lg:col-span-1 space-y-4">
                <USkeleton class="h-8 w-48" />
                <USkeleton class="h-64 w-full" />
              </div>
            </div>
          </div>

          <div v-else-if="nutritionTrendsData" class="space-y-6">
            <!-- Score Cards -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <ScoreCard
                title="Overall"
                :score="nutritionTrendsData.summary?.avgOverall"
                icon="i-heroicons-star"
                color="yellow"
                compact
                explanation="Click for AI-generated insights"
                @click="
                  () =>
                    nutritionTrendsData &&
                    openNutritionModal(
                      'Overall Nutrition Quality',
                      nutritionTrendsData.summary?.avgOverall,
                      'yellow'
                    )
                "
              />
              <ScoreCard
                title="Macro Balance"
                :score="nutritionTrendsData.summary?.avgMacroBalance"
                icon="i-heroicons-scale"
                color="blue"
                compact
                explanation="Click for AI-generated insights"
                @click="
                  () =>
                    nutritionTrendsData &&
                    openNutritionModal(
                      'Macronutrient Balance',
                      nutritionTrendsData.summary?.avgMacroBalance,
                      'blue'
                    )
                "
              />
              <ScoreCard
                title="Quality"
                :score="nutritionTrendsData.summary?.avgQuality"
                icon="i-heroicons-sparkles"
                color="green"
                compact
                explanation="Click for AI-generated insights"
                @click="
                  () =>
                    nutritionTrendsData &&
                    openNutritionModal(
                      'Food Quality',
                      nutritionTrendsData.summary?.avgQuality,
                      'green'
                    )
                "
              />
              <ScoreCard
                title="Adherence"
                :score="nutritionTrendsData.summary?.avgAdherence"
                icon="i-heroicons-check-badge"
                color="purple"
                compact
                explanation="Click for AI-generated insights"
                @click="
                  () =>
                    nutritionTrendsData &&
                    openNutritionModal(
                      'Goal Adherence',
                      nutritionTrendsData.summary?.avgAdherence,
                      'purple'
                    )
                "
              />
              <ScoreCard
                title="Hydration"
                :score="nutritionTrendsData.summary?.avgHydration"
                icon="i-heroicons-beaker"
                color="cyan"
                compact
                explanation="Click for AI-generated insights"
                @click="
                  () =>
                    nutritionTrendsData &&
                    openNutritionModal(
                      'Hydration Status',
                      nutritionTrendsData.summary?.avgHydration,
                      'cyan'
                    )
                "
              />
            </div>

            <!-- Trend Chart and Radar Chart Side by Side -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <!-- Score Trends (2/3 width) -->
              <div class="lg:col-span-2">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Score Trends
                </h3>
                <TrendChart :data="nutritionTrendsData.nutrition" type="nutrition" />
              </div>

              <!-- Current Balance (1/3 width) -->
              <div class="lg:col-span-1">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Current Balance
                </h3>
                <RadarChart
                  :scores="{
                    overall: nutritionTrendsData.summary?.avgOverall,
                    macroBalance: nutritionTrendsData.summary?.avgMacroBalance,
                    quality: nutritionTrendsData.summary?.avgQuality,
                    adherence: nutritionTrendsData.summary?.avgAdherence,
                    hydration: nutritionTrendsData.summary?.avgHydration
                  }"
                  type="nutrition"
                />
              </div>
            </div>
          </div>
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

        <!-- Charts Section -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Calorie Tracking Chart -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Calorie Tracking
            </h3>
            <ClientOnly>
              <Line :data="calorieTrackingData" :options="lineChartOptions" />
            </ClientOnly>
          </div>

          <!-- Macro Distribution Chart -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Macro Distribution
            </h3>
            <ClientOnly>
              <Doughnut :data="macroDistributionData" :options="doughnutChartOptions" />
            </ClientOnly>
          </div>

          <!-- Nutrition Scores Chart -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Nutrition Scores
            </h3>
            <ClientOnly>
              <Line :data="nutritionScoresChartData" :options="lineChartOptions" />
            </ClientOnly>
          </div>

          <!-- Hydration Chart -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Hydration Tracking
            </h3>
            <ClientOnly>
              <Bar :data="hydrationData" :options="barChartOptions" />
            </ClientOnly>
          </div>
        </div>

        <!-- Filters -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Analysis Status
              </label>
              <USelect
                v-model="filterAnalysis"
                :items="analysisStatusOptions"
                placeholder="All Status"
                class="w-full"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Calorie Goal Status
              </label>
              <USelect
                v-model="filterCalories"
                :items="calorieStatusOptions"
                placeholder="All"
                class="w-full"
              />
            </div>
          </div>
        </div>

        <!-- Nutrition Table -->
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
                    Calories
                  </th>
                  <th
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    Protein
                  </th>
                  <th
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    Carbs
                  </th>
                  <th
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    Fat
                  </th>
                  <th
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    Water
                  </th>
                  <th
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    Score
                  </th>
                  <th
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    AI Analysis
                  </th>
                </tr>
              </thead>
              <tbody
                v-if="loading"
                class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700"
              >
                <tr v-for="i in 10" :key="i">
                  <td v-for="j in 8" :key="j" class="px-6 py-4">
                    <USkeleton class="h-4 w-full" />
                  </td>
                </tr>
              </tbody>
              <tbody v-else-if="filteredNutrition.length === 0" class="bg-white dark:bg-gray-800">
                <tr>
                  <td colspan="8" class="p-8 text-center text-gray-600 dark:text-gray-400">
                    No nutrition data found. Connect Yazio and sync data to get started.
                  </td>
                </tr>
              </tbody>
              <tbody
                v-else
                class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700"
              >
                <tr
                  v-for="nutrition in paginatedNutrition"
                  :key="nutrition.id"
                  class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  @click="navigateToNutrition(nutrition.id)"
                >
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {{ formatDate(nutrition.date) }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    <span v-if="nutrition.calories">
                      {{ nutrition.calories }}
                      <span v-if="nutrition.caloriesGoal" class="text-xs text-gray-500">
                        / {{ nutrition.caloriesGoal }} kcal
                      </span>
                    </span>
                    <span v-else class="text-gray-400">-</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ nutrition.protein ? Math.round(nutrition.protein) + 'g' : '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ nutrition.carbs ? Math.round(nutrition.carbs) + 'g' : '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ nutrition.fat ? Math.round(nutrition.fat) + 'g' : '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ nutrition.waterMl ? (nutrition.waterMl / 1000).toFixed(1) + 'L' : '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm">
                    <span
                      v-if="(nutrition as any).overallScore"
                      :class="getScoreBadgeClass((nutrition as any).overallScore)"
                    >
                      {{ (nutrition as any).overallScore }}/10
                    </span>
                    <span v-else class="text-gray-400">-</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm">
                    <span :class="getAnalysisStatusBadgeClass((nutrition as any).aiAnalysisStatus)">
                      {{ getAnalysisStatusLabel((nutrition as any).aiAnalysisStatus) }}
                    </span>
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
                {{ Math.min(currentPage * itemsPerPage, filteredNutrition.length) }} of
                {{ filteredNutrition.length }} entries
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

        <!-- AI Recommendations Section -->
        <div
          v-if="!loading && allRecommendations.length > 0"
          class="bg-white dark:bg-gray-800 rounded-lg shadow p-6"
        >
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            🎯 AI-Generated Nutrition Recommendations
          </h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Based on your last {{ selectedPeriod }} days of nutrition data
          </p>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              v-for="(rec, index) in allRecommendations"
              :key="index"
              class="border rounded-lg p-4"
              :class="{
                'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20':
                  rec.priority === 'high',
                'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20':
                  rec.priority === 'medium',
                'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20':
                  rec.priority === 'low'
              }"
            >
              <div class="flex items-start gap-3">
                <div class="flex-shrink-0">
                  <span
                    class="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold"
                    :class="{
                      'bg-red-500 text-white': rec.priority === 'high',
                      'bg-yellow-500 text-white': rec.priority === 'medium',
                      'bg-blue-500 text-white': rec.priority === 'low'
                    }"
                  >
                    {{ rec.priority === 'high' ? 'H' : rec.priority === 'medium' ? 'M' : 'L' }}
                  </span>
                </div>
                <div class="flex-1">
                  <h4
                    class="font-semibold text-sm mb-2"
                    :class="{
                      'text-red-900 dark:text-red-100': rec.priority === 'high',
                      'text-yellow-900 dark:text-yellow-100': rec.priority === 'medium',
                      'text-blue-900 dark:text-blue-100': rec.priority === 'low'
                    }"
                  >
                    {{ rec.title }}
                  </h4>
                  <p
                    class="text-sm"
                    :class="{
                      'text-red-700 dark:text-red-300': rec.priority === 'high',
                      'text-yellow-700 dark:text-yellow-300': rec.priority === 'medium',
                      'text-blue-700 dark:text-blue-300': rec.priority === 'low'
                    }"
                  >
                    {{ rec.description }}
                  </p>
                  <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    From: {{ rec.metric }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
  import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler
  } from 'chart.js'
  import { Line, Doughnut, Bar } from 'vue-chartjs'

  ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
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
    title: 'Nutrition',
    meta: [
      {
        name: 'description',
        content:
          'Monitor your nutrition intake, calorie goals, and macro distribution with Yazio integration.'
      }
    ]
  })

  const colorMode = useColorMode()
  const toast = useToast()
  const loading = ref(true)
  const analyzingNutrition = ref(false)
  const generatingExplanations = ref(false)
  const allNutrition = ref<any[]>([])
  const currentPage = ref(1)
  const itemsPerPage = 20

  // Background Task Monitoring
  const { refresh: refreshRuns } = useUserRuns()
  const { onTaskCompleted } = useUserRunsState()

  // Period selection for nutrition scores
  const selectedPeriod = ref<number | string>(30)
  const periodOptions = [
    { label: '7 Days', value: 7 },
    { label: '14 Days', value: 14 },
    { label: '30 Days', value: 30 },
    { label: '90 Days', value: 90 },
    { label: 'Year to Date', value: 'YTD' }
  ]

  // Listeners
  onTaskCompleted('analyze-nutrition', async () => {
    await fetchNutrition()
    analyzingNutrition.value = false
    toast.add({
      title: 'Analysis Complete',
      description: 'Nutrition data has been analyzed.',
      color: 'success',
      icon: 'i-heroicons-check-circle'
    })
  })

  onTaskCompleted('generate-score-explanations', async () => {
    await refreshNuxtData('nutrition-trends')
    await fetchAllRecommendations()
    generatingExplanations.value = false
    nutritionExplanations.value = {}
    toast.add({
      title: 'Insights Ready',
      description: 'Nutrition insights have been generated.',
      color: 'success',
      icon: 'i-heroicons-sparkles'
    })
  })

  // Fetch nutrition score trends (renamed to avoid conflict with chart data)
  const { data: nutritionTrendsData, pending: nutritionScoresLoading } = await useFetch(
    '/api/scores/nutrition-trends',
    {
      query: { days: selectedPeriod }
    }
  )

  // Modal state
  const showModal = ref(false)
  const loadingExplanation = ref(false)
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

  // Cache for explanations to avoid refetching
  const nutritionExplanations = ref<Record<string, any>>({})

  // Filters
  const filterAnalysis = ref<string | undefined>(undefined)
  const filterCalories = ref<string | undefined>(undefined)

  // Filter options
  const analysisStatusOptions = [
    { label: 'Completed', value: 'COMPLETED' },
    { label: 'Pending', value: 'PENDING' },
    { label: 'Processing', value: 'PROCESSING' },
    { label: 'Not Started', value: 'NOT_STARTED' }
  ]

  const calorieStatusOptions = [
    { label: 'Over Goal', value: 'over' },
    { label: 'Under Goal', value: 'under' },
    { label: 'Met Goal (±50 cal)', value: 'met' }
  ]

  // Fetch all nutrition data
  async function fetchNutrition() {
    loading.value = true
    try {
      const response: any = await $fetch('/api/nutrition')
      allNutrition.value = response.nutrition || []
    } catch (error) {
      console.error('Error fetching nutrition:', error)
      toast.add({
        title: 'Error',
        description: 'Failed to load nutrition data',
        color: 'error'
      })
    } finally {
      loading.value = false
    }
  }

  // Computed properties
  const filteredNutrition = computed(() => {
    let nutrition = [...allNutrition.value]

    if (filterAnalysis.value) {
      if (filterAnalysis.value === 'NOT_STARTED') {
        nutrition = nutrition.filter((n) => !(n as any).aiAnalysisStatus)
      } else {
        nutrition = nutrition.filter((n) => (n as any).aiAnalysisStatus === filterAnalysis.value)
      }
    }

    if (filterCalories.value) {
      nutrition = nutrition.filter((n) => {
        if (!n.calories || !n.caloriesGoal) return false
        const diff = n.calories - n.caloriesGoal
        if (filterCalories.value === 'over') return diff > 50
        if (filterCalories.value === 'under') return diff < -50
        if (filterCalories.value === 'met') return Math.abs(diff) <= 50
        return true
      })
    }

    return nutrition
  })

  const totalNutrition = computed(() => allNutrition.value.length)
  const analyzedNutrition = computed(
    () => allNutrition.value.filter((n) => (n as any).aiAnalysisStatus === 'COMPLETED').length
  )
  const avgScore = computed(() => {
    const withScores = allNutrition.value.filter((n) => (n as any).overallScore)
    if (withScores.length === 0) return null
    return withScores.reduce((sum, n) => sum + (n as any).overallScore, 0) / withScores.length
  })
  const avgCalories = computed(() => {
    const withCalories = allNutrition.value.filter((n) => n.calories)
    if (withCalories.length === 0) return null
    return withCalories.reduce((sum, n) => sum + n.calories, 0) / withCalories.length
  })

  const totalPages = computed(() => Math.ceil(filteredNutrition.value.length / itemsPerPage))
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

  const paginatedNutrition = computed(() => {
    const start = (currentPage.value - 1) * itemsPerPage
    const end = start + itemsPerPage
    return filteredNutrition.value.slice(start, end)
  })

  // Functions
  function formatDate(date: string | Date) {
    // Handle date string properly to avoid timezone shifts
    // If it's a string in YYYY-MM-DD format, parse it as local date
    if (typeof date === 'string' && date.includes('-')) {
      const parts = date.split('-').map(Number)
      if (parts.length === 3) {
        const year = parts[0]
        const month = parts[1]
        const day = parts[2]
        if (year !== undefined && month !== undefined && day !== undefined) {
          return new Date(year, month - 1, day).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          })
        }
      }
    }
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  function getScoreBadgeClass(score: number) {
    const baseClass = 'px-2 py-1 rounded text-xs font-semibold'
    if (score >= 8)
      return `${baseClass} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`
    if (score >= 6)
      return `${baseClass} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`
    if (score >= 4)
      return `${baseClass} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`
    return `${baseClass} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`
  }

  function getAnalysisStatusBadgeClass(status: string | null | undefined) {
    const baseClass = 'px-2 py-1 rounded text-xs font-medium'
    if (status === 'COMPLETED')
      return `${baseClass} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`
    if (status === 'PROCESSING')
      return `${baseClass} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`
    if (status === 'PENDING')
      return `${baseClass} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`
    if (status === 'FAILED')
      return `${baseClass} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`
    return `${baseClass} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300`
  }

  function getAnalysisStatusLabel(status: string | null | undefined) {
    if (status === 'COMPLETED') return '✓ Complete'
    if (status === 'PROCESSING') return '⟳ Processing'
    if (status === 'PENDING') return '⋯ Pending'
    if (status === 'FAILED') return '✗ Failed'
    return '− Not Started'
  }

  function navigateToNutrition(id: string) {
    navigateTo(`/nutrition/${id}`)
  }

  function changePage(page: number) {
    currentPage.value = page
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function generateExplanations() {
    generatingExplanations.value = true
    try {
      await $fetch('/api/scores/generate-explanations', { method: 'POST' })
      refreshRuns()

      toast.add({
        title: 'Insights Generation Started',
        description: 'AI is generating insights for all metrics. This may take a few minutes.',
        color: 'success',
        icon: 'i-heroicons-sparkles'
      })

      // Clear the cache so fresh explanations will be fetched
      nutritionExplanations.value = {}
    } catch (error: any) {
      generatingExplanations.value = false
      toast.add({
        title: 'Generation Failed',
        description: error.data?.message || error.message || 'Failed to start generation',
        color: 'error',
        icon: 'i-heroicons-exclamation-circle'
      })
    }
  }

  async function analyzeAllNutrition() {
    analyzingNutrition.value = true
    try {
      const response: any = await $fetch('/api/nutrition/analyze-all', {
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
      analyzingNutrition.value = false
      toast.add({
        title: 'Analysis Failed',
        description: error.data?.message || error.message || 'Failed to start analysis',
        color: 'error',
        icon: 'i-heroicons-exclamation-circle'
      })
    }
  }

  // Map display titles to metric names
  function getMetricName(title: string): string {
    const mapping: Record<string, string> = {
      'Overall Nutrition Quality': 'overall',
      'Macronutrient Balance': 'macroBalance',
      'Food Quality': 'quality',
      'Goal Adherence': 'adherence',
      'Hydration Status': 'hydration'
    }
    return mapping[title] || 'overall'
  }

  // Handle nutrition aggregate score click - fetch from database or trigger generation
  async function openNutritionModal(title: string, score: number | null, color?: string) {
    if (!score || !nutritionTrendsData.value) return

    modalData.value = {
      title,
      score,
      explanation: 'Loading insights...',
      analysisData: undefined,
      color: color as any
    }
    showModal.value = true
    loadingExplanation.value = true

    const metric = getMetricName(title)
    const cacheKey = `${selectedPeriod.value}-${metric}`

    // Check memory cache first
    if (nutritionExplanations.value[cacheKey]) {
      modalData.value.analysisData = nutritionExplanations.value[cacheKey]
      modalData.value.explanation = null
      loadingExplanation.value = false
      return
    }

    try {
      // Fetch from database (or trigger generation if not available)
      const response: any = await $fetch('/api/scores/explanation', {
        query: {
          type: 'nutrition',
          period: selectedPeriod.value,
          metric
        }
      })

      if (response.cached && response.analysis) {
        // Explanation was found in database
        nutritionExplanations.value[cacheKey] = response.analysis
        modalData.value.analysisData = response.analysis
        modalData.value.explanation = null
      } else if (response.generating) {
        // Explanation is being generated - show message
        modalData.value.explanation =
          'Generating insights for the first time. Please try again in a moment.'

        // Auto-retry after 3 seconds
        setTimeout(async () => {
          try {
            const retryResponse: any = await $fetch('/api/scores/explanation', {
              query: { type: 'nutrition', period: selectedPeriod.value, metric }
            })

            if (retryResponse.cached && retryResponse.analysis) {
              nutritionExplanations.value[cacheKey] = retryResponse.analysis
              modalData.value.analysisData = retryResponse.analysis
              modalData.value.explanation = null
              loadingExplanation.value = false
            }
          } catch (retryError) {
            console.error('Retry failed:', retryError)
          }
        }, 3000)
      } else {
        // Not cached and not generating (manual trigger required)
        modalData.value.explanation =
          response.message || 'No insights available. Click "Insights" to create them.'
      }
    } catch (error) {
      console.error('Error fetching nutrition explanation:', error)
      modalData.value.explanation = 'Failed to load explanation. Please try again.'
    } finally {
      if (!modalData.value.explanation?.includes('Generating')) {
        loadingExplanation.value = false
      }
    }
  }

  // Chart data computed properties
  const calorieTrackingData = computed(() => {
    const last30Days = allNutrition.value
      .filter((n) => n.calories)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-30)

    return {
      labels: last30Days.map((n) => formatDate(n.date)),
      datasets: [
        {
          label: 'Calories Consumed',
          data: last30Days.map((n) => n.calories),
          borderColor: colorMode.value === 'dark' ? 'rgb(59, 130, 246)' : 'rgb(37, 99, 235)',
          backgroundColor:
            colorMode.value === 'dark' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(37, 99, 235, 0.1)',
          fill: true,
          tension: 0.4
        },
        {
          label: 'Calorie Goal',
          data: last30Days.map((n) => n.caloriesGoal || 0),
          borderColor: colorMode.value === 'dark' ? 'rgb(251, 146, 60)' : 'rgb(249, 115, 22)',
          backgroundColor:
            colorMode.value === 'dark' ? 'rgba(251, 146, 60, 0.1)' : 'rgba(249, 115, 22, 0.1)',
          borderDash: [5, 5],
          fill: false,
          tension: 0.4
        }
      ]
    }
  })

  const macroDistributionData = computed(() => {
    const withMacros = allNutrition.value.filter((n) => n.protein && n.carbs && n.fat)
    if (withMacros.length === 0) {
      return {
        labels: ['Protein', 'Carbs', 'Fat'],
        datasets: [
          {
            data: [0, 0, 0],
            backgroundColor: []
          }
        ]
      }
    }

    const avgProtein = withMacros.reduce((sum, n) => sum + n.protein, 0) / withMacros.length
    const avgCarbs = withMacros.reduce((sum, n) => sum + n.carbs, 0) / withMacros.length
    const avgFat = withMacros.reduce((sum, n) => sum + n.fat, 0) / withMacros.length

    return {
      labels: ['Protein', 'Carbs', 'Fat'],
      datasets: [
        {
          data: [Math.round(avgProtein), Math.round(avgCarbs), Math.round(avgFat)],
          backgroundColor: [
            colorMode.value === 'dark' ? 'rgba(34, 197, 94, 0.8)' : 'rgba(22, 163, 74, 0.8)',
            colorMode.value === 'dark' ? 'rgba(59, 130, 246, 0.8)' : 'rgba(37, 99, 235, 0.8)',
            colorMode.value === 'dark' ? 'rgba(251, 146, 60, 0.8)' : 'rgba(249, 115, 22, 0.8)'
          ],
          borderColor: [
            colorMode.value === 'dark' ? 'rgb(34, 197, 94)' : 'rgb(22, 163, 74)',
            colorMode.value === 'dark' ? 'rgb(59, 130, 246)' : 'rgb(37, 99, 235)',
            colorMode.value === 'dark' ? 'rgb(251, 146, 60)' : 'rgb(249, 115, 22)'
          ],
          borderWidth: 2
        }
      ]
    }
  })

  const nutritionScoresChartData = computed(() => {
    const withScores = allNutrition.value
      .filter((n) => (n as any).overallScore)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-30)

    return {
      labels: withScores.map((n) => formatDate(n.date)),
      datasets: [
        {
          label: 'Nutrition Score',
          data: withScores.map((n) => (n as any).overallScore),
          borderColor: colorMode.value === 'dark' ? 'rgb(168, 85, 247)' : 'rgb(147, 51, 234)',
          backgroundColor:
            colorMode.value === 'dark' ? 'rgba(168, 85, 247, 0.1)' : 'rgba(147, 51, 234, 0.1)',
          fill: true,
          tension: 0.4
        }
      ]
    }
  })

  const hydrationData = computed(() => {
    const withWater = allNutrition.value
      .filter((n) => n.waterMl)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-30)

    return {
      labels: withWater.map((n) => formatDate(n.date)),
      datasets: [
        {
          label: 'Water (Liters)',
          data: withWater.map((n) => parseFloat((n.waterMl / 1000).toFixed(1))),
          backgroundColor:
            colorMode.value === 'dark' ? 'rgba(56, 189, 248, 0.8)' : 'rgba(14, 165, 233, 0.8)',
          borderColor: colorMode.value === 'dark' ? 'rgb(56, 189, 248)' : 'rgb(14, 165, 233)',
          borderWidth: 2
        }
      ]
    }
  })

  // Chart options
  const lineChartOptions = computed(() => ({
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 2,
    plugins: {
      legend: {
        labels: {
          color: colorMode.value === 'dark' ? '#9ca3af' : '#4b5563'
        }
      },
      tooltip: {
        backgroundColor: colorMode.value === 'dark' ? '#1f2937' : '#ffffff',
        titleColor: colorMode.value === 'dark' ? '#f3f4f6' : '#111827',
        bodyColor: colorMode.value === 'dark' ? '#d1d5db' : '#374151',
        borderColor: colorMode.value === 'dark' ? '#374151' : '#e5e7eb',
        borderWidth: 1
      }
    },
    scales: {
      x: {
        ticks: {
          color: colorMode.value === 'dark' ? '#9ca3af' : '#6b7280',
          maxRotation: 45,
          minRotation: 45
        },
        grid: {
          color: colorMode.value === 'dark' ? '#374151' : '#e5e7eb'
        }
      },
      y: {
        ticks: {
          color: colorMode.value === 'dark' ? '#9ca3af' : '#6b7280'
        },
        grid: {
          color: colorMode.value === 'dark' ? '#374151' : '#e5e7eb'
        }
      }
    }
  }))

  const doughnutChartOptions = computed(() => ({
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 2,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: colorMode.value === 'dark' ? '#9ca3af' : '#4b5563',
          padding: 15
        }
      },
      tooltip: {
        backgroundColor: colorMode.value === 'dark' ? '#1f2937' : '#ffffff',
        titleColor: colorMode.value === 'dark' ? '#f3f4f6' : '#111827',
        bodyColor: colorMode.value === 'dark' ? '#d1d5db' : '#374151',
        borderColor: colorMode.value === 'dark' ? '#374151' : '#e5e7eb',
        borderWidth: 1,
        callbacks: {
          label: function (context: any) {
            const label = context.label || ''
            const value = context.parsed || 0
            return `${label}: ${value}g`
          }
        }
      }
    }
  }))

  const barChartOptions = computed(() => ({
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 2,
    plugins: {
      legend: {
        labels: {
          color: colorMode.value === 'dark' ? '#9ca3af' : '#4b5563'
        }
      },
      tooltip: {
        backgroundColor: colorMode.value === 'dark' ? '#1f2937' : '#ffffff',
        titleColor: colorMode.value === 'dark' ? '#f3f4f6' : '#111827',
        bodyColor: colorMode.value === 'dark' ? '#d1d5db' : '#374151',
        borderColor: colorMode.value === 'dark' ? '#374151' : '#e5e7eb',
        borderWidth: 1
      }
    },
    scales: {
      x: {
        ticks: {
          color: colorMode.value === 'dark' ? '#9ca3af' : '#6b7280',
          maxRotation: 45,
          minRotation: 45
        },
        grid: {
          color: colorMode.value === 'dark' ? '#374151' : '#e5e7eb'
        }
      },
      y: {
        ticks: {
          color: colorMode.value === 'dark' ? '#9ca3af' : '#6b7280'
        },
        grid: {
          color: colorMode.value === 'dark' ? '#374151' : '#e5e7eb'
        }
      }
    }
  }))

  // Watch filters and reset to page 1
  watch([filterAnalysis, filterCalories], () => {
    currentPage.value = 1
  })

  // Fetch all recommendations from stored explanations
  const allRecommendations = ref<any[]>([])

  async function fetchAllRecommendations() {
    const recommendations: any[] = []
    const metrics = ['overall', 'macroBalance', 'quality', 'adherence', 'hydration']
    const metricNames: Record<string, string> = {
      overall: 'Overall Quality',
      macroBalance: 'Macro Balance',
      quality: 'Food Quality',
      adherence: 'Goal Adherence',
      hydration: 'Hydration'
    }

    for (const metric of metrics) {
      try {
        const response: any = await $fetch('/api/scores/explanation', {
          query: {
            type: 'nutrition',
            period: selectedPeriod.value,
            metric
          }
        })

        if (response.cached && response.analysis?.recommendations) {
          // Add metric name to each recommendation
          response.analysis.recommendations.forEach((rec: any) => {
            recommendations.push({
              ...rec,
              metric: metricNames[metric]
            })
          })
        }
      } catch (error) {
        console.error(`Error fetching recommendations for ${metric}:`, error)
      }
    }

    // Sort by priority (high first, then medium, then low)
    const priorityOrder = { high: 0, medium: 1, low: 2 }
    recommendations.sort((a, b) => {
      return (
        (priorityOrder[a.priority as keyof typeof priorityOrder] || 99) -
        (priorityOrder[b.priority as keyof typeof priorityOrder] || 99)
      )
    })

    allRecommendations.value = recommendations
  }

  // Watch for period changes and refetch nutrition trends
  watch(selectedPeriod, async () => {
    await refreshNuxtData('nutrition-trends')
    await fetchAllRecommendations()
  })

  // Load data on mount
  onMounted(async () => {
    await fetchNutrition()
    await fetchAllRecommendations()
  })
</script>
