<template>
  <UDashboardPanel id="performance">
    <template #header>
      <UDashboardNavbar title="Performance Scores">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
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
              <span class="sm:hidden">Generate</span>
              <span class="hidden sm:inline">Generate Insights</span>
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-3 sm:p-6 space-y-6 sm:space-y-10">
        <!-- Page Header -->
        <div>
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
            Performance Scores
          </h1>
          <p class="text-sm font-medium text-gray-500 dark:text-gray-400 mt-1">
            Track your fitness metrics and performance trends across all training dimensions
          </p>
        </div>

        <!-- 1. Activity Highlights (Big Numbers) -->
        <div class="space-y-3 sm:space-y-4">
          <div class="flex items-center justify-between px-1">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white uppercase tracking-tight">
              Activity Highlights
            </h2>
            <USelect
              v-model="highlightsPeriod"
              :items="periodOptions"
              size="xs"
              class="w-32 sm:w-36"
            />
          </div>
          <ActivityHighlights :period="highlightsPeriod" />
        </div>

        <!-- 2. Athlete Profile Scores -->
        <div class="space-y-3 sm:space-y-4">
          <div class="flex items-center justify-between px-1">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white uppercase tracking-tight">
              Athlete Profile
            </h2>
            <UBadge
              v-if="profileData?.scores?.lastUpdated"
              color="neutral"
              variant="subtle"
              size="sm"
              class="font-bold"
            >
              Updated {{ formatDateLocal(profileData.scores.lastUpdated) }}
            </UBadge>
          </div>

          <div v-if="profileLoading" class="flex justify-center py-12">
            <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary" />
          </div>

          <div
            v-else-if="profileData"
            class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
          >
            <ScoreCard
              title="Current Fitness"
              :score="profileData.scores?.currentFitness"
              :explanation="
                profileData.scores?.currentFitnessExplanationJson
                  ? 'Click for detailed analysis'
                  : profileData.scores?.currentFitnessExplanation
              "
              icon="i-heroicons-bolt"
              color="blue"
              @click="
                (data) =>
                  openModalWithStructured(data, profileData?.scores?.currentFitnessExplanationJson)
              "
            />
            <ScoreCard
              title="Recovery Capacity"
              :score="profileData.scores?.recoveryCapacity"
              :explanation="
                profileData.scores?.recoveryCapacityExplanationJson
                  ? 'Click for detailed analysis'
                  : profileData.scores?.recoveryCapacityExplanation
              "
              icon="i-heroicons-heart"
              color="green"
              @click="
                (data) =>
                  openModalWithStructured(
                    data,
                    profileData?.scores?.recoveryCapacityExplanationJson
                  )
              "
            />
            <ScoreCard
              title="Nutrition Compliance"
              :score="profileData.scores?.nutritionCompliance"
              :explanation="
                profileData.scores?.nutritionComplianceExplanationJson
                  ? 'Click for detailed analysis'
                  : profileData.scores?.nutritionComplianceExplanation
              "
              icon="i-heroicons-cake"
              color="purple"
              @click="
                (data) =>
                  openModalWithStructured(
                    data,
                    profileData?.scores?.nutritionComplianceExplanationJson
                  )
              "
            />
            <ScoreCard
              title="Training Consistency"
              :score="profileData.scores?.trainingConsistency"
              :explanation="
                profileData.scores?.trainingConsistencyExplanationJson
                  ? 'Click for detailed analysis'
                  : profileData.scores?.trainingConsistencyExplanation
              "
              icon="i-heroicons-calendar"
              color="orange"
              @click="
                (data) =>
                  openModalWithStructured(
                    data,
                    profileData?.scores?.trainingConsistencyExplanationJson
                  )
              "
            />
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

        <!-- 3. PMC Chart (Performance Management Chart) -->
        <div class="space-y-6">
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
              Training Load & Form
            </h2>
            <USelect v-model="pmcPeriod" :items="pmcPeriodOptions" class="w-32 sm:w-36" size="sm" />
          </div>

          <PMCChart :days="pmcPeriod" />
        </div>

        <!-- 4. Power Duration Curve -->
        <div class="space-y-6">
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
              Power Duration Curve
            </h2>
            <USelect
              v-model="powerCurvePeriod"
              :items="periodOptions"
              class="w-32 sm:w-36"
              size="sm"
            />
          </div>
          <!-- Pass days to the updated component for Performance Page mode -->
          <PowerCurveChart :days="powerCurvePeriod" />
        </div>

        <!-- 5. Efficiency & Decoupling -->
        <div class="space-y-6">
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
              Aerobic Efficiency Trend
            </h2>
            <USelect
              v-model="efficiencyPeriod"
              :items="periodOptions"
              class="w-32 sm:w-36"
              size="sm"
            />
          </div>
          <EfficiencyTrendChart :days="efficiencyPeriod" />
        </div>

        <!-- 6. Readiness vs Performance -->
        <div class="space-y-6">
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
              Readiness & Performance
            </h2>
            <USelect
              v-model="readinessPeriod"
              :items="periodOptions"
              class="w-32 sm:w-36"
              size="sm"
            />
          </div>
          <ReadinessCorrelationChart :days="readinessPeriod" />
        </div>

        <!-- 7. FTP Evolution Chart -->
        <div class="space-y-6">
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">FTP Evolution</h2>
            <USelect v-model="ftpPeriod" :items="ftpPeriodOptions" class="w-32 sm:w-36" size="sm" />
          </div>

          <FTPEvolutionChart :months="ftpPeriod" />
        </div>

        <!-- 8. Training Intensity Distribution -->
        <div class="space-y-6">
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
              Intensity Distribution
            </h2>
            <USelect
              v-model="distributionPeriod"
              :items="distributionPeriodOptions"
              class="w-32 sm:w-36"
              size="sm"
            />
          </div>

          <UCard>
            <WeeklyZoneChart :weeks="distributionPeriod" />
          </UCard>
        </div>

        <!-- 9. Workout Scores -->
        <div class="space-y-6">
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Workout Performance</h2>
            <USelect
              v-model="selectedPeriod"
              :items="periodOptions"
              class="w-32 sm:w-36"
              size="sm"
            />
          </div>

          <div v-if="workoutLoading" class="flex justify-center py-12">
            <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary" />
          </div>

          <div v-else-if="workoutData" class="space-y-6">
            <!-- Score Cards -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <ScoreCard
                title="Overall"
                :score="workoutData.summary?.avgOverall"
                icon="i-heroicons-star"
                color="yellow"
                compact
                explanation="Click for AI-generated insights"
                @click="
                  () =>
                    workoutData &&
                    openWorkoutModal(
                      'Overall Workout Performance',
                      workoutData.summary?.avgOverall,
                      'yellow'
                    )
                "
              />
              <ScoreCard
                title="Technical"
                :score="workoutData.summary?.avgTechnical"
                icon="i-heroicons-cog"
                color="blue"
                compact
                explanation="Click for AI-generated insights"
                @click="
                  () =>
                    workoutData &&
                    openWorkoutModal(
                      'Technical Execution',
                      workoutData.summary?.avgTechnical,
                      'blue'
                    )
                "
              />
              <ScoreCard
                title="Effort"
                :score="workoutData.summary?.avgEffort"
                icon="i-heroicons-fire"
                color="red"
                compact
                explanation="Click for AI-generated insights"
                @click="
                  () =>
                    workoutData &&
                    openWorkoutModal('Effort Management', workoutData.summary?.avgEffort, 'red')
                "
              />
              <ScoreCard
                title="Pacing"
                :score="workoutData.summary?.avgPacing"
                icon="i-heroicons-chart-bar"
                color="green"
                compact
                explanation="Click for AI-generated insights"
                @click="
                  () =>
                    workoutData &&
                    openWorkoutModal('Pacing Strategy', workoutData.summary?.avgPacing, 'green')
                "
              />
              <ScoreCard
                title="Execution"
                :score="workoutData.summary?.avgExecution"
                icon="i-heroicons-check-circle"
                color="purple"
                compact
                explanation="Click for AI-generated insights"
                @click="
                  () =>
                    workoutData &&
                    openWorkoutModal(
                      'Workout Execution',
                      workoutData.summary?.avgExecution,
                      'purple'
                    )
                "
              />
            </div>

            <!-- Trend Chart and Radar Chart Side by Side -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <!-- Score Trends (2/3 width) -->
              <div class="lg:col-span-2 space-y-4">
                <h3
                  class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest px-1"
                >
                  Score Trends
                </h3>
                <TrendChart :data="workoutData.workouts" type="workout" />
              </div>

              <!-- Current Balance (1/3 width) -->
              <div class="lg:col-span-1 space-y-4">
                <h3
                  class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest px-1"
                >
                  Current Balance
                </h3>
                <RadarChart
                  :scores="{
                    overall: workoutData.summary?.avgOverall,
                    technical: workoutData.summary?.avgTechnical,
                    effort: workoutData.summary?.avgEffort,
                    pacing: workoutData.summary?.avgPacing,
                    execution: workoutData.summary?.avgExecution
                  }"
                  type="workout"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- 10. Nutrition Scores -->
        <div class="space-y-4">
          <div class="px-1">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white uppercase tracking-tight">
              Nutrition Quality
            </h2>
          </div>

          <div v-if="nutritionLoading" class="flex justify-center py-12">
            <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary-500" />
          </div>

          <div v-else-if="nutritionData" class="space-y-6">
            <!-- Score Cards -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <ScoreCard
                title="Overall"
                :score="nutritionData.summary?.avgOverall"
                icon="i-heroicons-star"
                color="yellow"
                compact
                explanation="Click for AI-generated insights"
                @click="
                  () =>
                    nutritionData &&
                    openNutritionModal(
                      'Overall Nutrition Quality',
                      nutritionData.summary?.avgOverall,
                      'yellow'
                    )
                "
              />
              <ScoreCard
                title="Macro Balance"
                :score="nutritionData.summary?.avgMacroBalance"
                icon="i-heroicons-scale"
                color="blue"
                compact
                explanation="Click for AI-generated insights"
                @click="
                  () =>
                    nutritionData &&
                    openNutritionModal(
                      'Macronutrient Balance',
                      nutritionData.summary?.avgMacroBalance,
                      'blue'
                    )
                "
              />
              <ScoreCard
                title="Quality"
                :score="nutritionData.summary?.avgQuality"
                icon="i-heroicons-sparkles"
                color="green"
                compact
                explanation="Click for AI-generated insights"
                @click="
                  () =>
                    nutritionData &&
                    openNutritionModal('Food Quality', nutritionData.summary?.avgQuality, 'green')
                "
              />
              <ScoreCard
                title="Adherence"
                :score="nutritionData.summary?.avgAdherence"
                icon="i-heroicons-check-badge"
                color="purple"
                compact
                explanation="Click for AI-generated insights"
                @click="
                  () =>
                    nutritionData &&
                    openNutritionModal(
                      'Goal Adherence',
                      nutritionData.summary?.avgAdherence,
                      'purple'
                    )
                "
              />
              <ScoreCard
                title="Hydration"
                :score="nutritionData.summary?.avgHydration"
                icon="i-heroicons-beaker"
                color="cyan"
                compact
                explanation="Click for AI-generated insights"
                @click="
                  () =>
                    nutritionData &&
                    openNutritionModal(
                      'Hydration Status',
                      nutritionData.summary?.avgHydration,
                      'cyan'
                    )
                "
              />
            </div>

            <!-- Trend Chart and Radar Chart Side by Side -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <!-- Score Trends (2/3 width) -->
              <div class="lg:col-span-2 space-y-4">
                <h3
                  class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest px-1"
                >
                  Score Trends
                </h3>
                <TrendChart :data="nutritionData.nutrition" type="nutrition" />
              </div>

              <!-- Current Balance (1/3 width) -->
              <div class="lg:col-span-1 space-y-4">
                <h3
                  class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest px-1"
                >
                  Current Balance
                </h3>
                <RadarChart
                  :scores="{
                    overall: nutritionData.summary?.avgOverall,
                    macroBalance: nutritionData.summary?.avgMacroBalance,
                    quality: nutritionData.summary?.avgQuality,
                    adherence: nutritionData.summary?.avgAdherence,
                    hydration: nutritionData.summary?.avgHydration
                  }"
                  type="nutrition"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
  import ActivityHighlights from '~/components/ActivityHighlights.vue'
  import PowerCurveChart from '~/components/PowerCurveChart.vue'
  import EfficiencyTrendChart from '~/components/EfficiencyTrendChart.vue'
  import ReadinessCorrelationChart from '~/components/ReadinessCorrelationChart.vue'

  const { formatDate: baseFormatDate } = useFormat()

  definePageMeta({
    middleware: 'auth',
    layout: 'default'
  })

  useHead({
    title: 'Performance Scores',
    meta: [
      {
        name: 'description',
        content:
          'Detailed analysis of your athletic performance, including FTP evolution, training load, nutrition quality, and workout execution.'
      },
      { property: 'og:title', content: 'Performance Scores | Coach Watts' },
      {
        property: 'og:description',
        content:
          'Detailed analysis of your athletic performance, including FTP evolution, training load, nutrition quality, and workout execution.'
      }
    ]
  })

  const selectedPeriod = ref<number | string>(30)
  const highlightsPeriod = ref<number | string>(30)
  const efficiencyPeriod = ref<number | string>(90)
  const readinessPeriod = ref<number | string>(30)
  const powerCurvePeriod = ref<number | string>(90)

  const periodOptions = [
    { label: '7 Days', value: 7 },
    { label: '14 Days', value: 14 },
    { label: '30 Days', value: 30 },
    { label: '90 Days', value: 90 },
    { label: 'Year to Date', value: 'YTD' }
  ]

  const pmcPeriod = ref<number | string>(90)
  const pmcPeriodOptions = [
    { label: '30 Days', value: 30 },
    { label: '60 Days', value: 60 },
    { label: '90 Days', value: 90 },
    { label: '180 Days', value: 180 },
    { label: 'Year to Date', value: 'YTD' }
  ]

  const ftpPeriod = ref<number | string>(12)
  const ftpPeriodOptions = [
    { label: '3 Months', value: 3 },
    { label: '6 Months', value: 6 },
    { label: '12 Months', value: 12 },
    { label: '24 Months', value: 24 },
    { label: 'Year to Date', value: 'YTD' }
  ]

  const distributionPeriod = ref<number | string>(12)
  const distributionPeriodOptions = [
    { label: '4 Weeks', value: 4 },
    { label: '8 Weeks', value: 8 },
    { label: '12 Weeks', value: 12 },
    { label: '24 Weeks', value: 24 },
    { label: 'Year to Date', value: 'YTD' }
  ]

  interface AthleteProfile {
    scores?: {
      lastUpdated?: string
      currentFitness?: number
      currentFitnessExplanation?: string
      currentFitnessExplanationJson?: any
      recoveryCapacity?: number
      recoveryCapacityExplanation?: string
      recoveryCapacityExplanationJson?: any
      nutritionCompliance?: number
      nutritionComplianceExplanation?: string
      nutritionComplianceExplanationJson?: any
      trainingConsistency?: number
      trainingConsistencyExplanation?: string
      trainingConsistencyExplanationJson?: any
    }
  }

  // Fetch athlete profile data
  const { data: profileData, pending: profileLoading } = await useFetch<AthleteProfile>(
    '/api/scores/athlete-profile'
  )

  // Fetch workout score trends
  const { data: workoutData, pending: workoutLoading } = await useFetch(
    '/api/scores/workout-trends',
    {
      query: { days: selectedPeriod }
    }
  )

  // Fetch nutrition score trends
  const { data: nutritionData, pending: nutritionLoading } = await useFetch(
    '/api/scores/nutrition-trends',
    {
      query: { days: selectedPeriod }
    }
  )

  // Modal state
  const showModal = ref(false)
  const loadingExplanation = ref(false)
  const generatingExplanations = ref(false)
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
  const workoutExplanations = ref<Record<string, any>>({})
  const nutritionExplanations = ref<Record<string, any>>({})

  // Toast for notifications
  const toast = useToast()

  // Handle score card click (for cards with plain text explanation)
  const openModal = (data: {
    title: string
    score?: number | null
    explanation?: string | null
    color?: 'gray' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'cyan'
  }) => {
    modalData.value = {
      title: data.title,
      score: data.score ?? null,
      explanation: data.explanation ?? null,
      analysisData: undefined,
      color: data.color
    }
    showModal.value = true
  }

  // Handle score card click with structured data
  const openModalWithStructured = (
    data: {
      title: string
      score?: number | null
      explanation?: string | null
      color?: 'gray' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'cyan'
    },
    structuredData?: any
  ) => {
    modalData.value = {
      title: data.title,
      score: data.score ?? null,
      explanation: structuredData ? null : (data.explanation ?? null),
      analysisData: structuredData || undefined,
      color: data.color
    }
    showModal.value = true
  }

  // Map display titles to metric names
  const getWorkoutMetricName = (title: string): string => {
    const mapping: Record<string, string> = {
      'Overall Workout Performance': 'overall',
      'Technical Execution': 'technical',
      'Effort Management': 'effort',
      'Pacing Strategy': 'pacing',
      'Workout Execution': 'execution'
    }
    return mapping[title] || 'overall'
  }

  // Handle workout aggregate score click - fetch from database or trigger generation
  const openWorkoutModal = async (title: string, score: number | null, color?: string) => {
    if (!score || !workoutData.value) return

    modalData.value = {
      title,
      score,
      explanation: 'Loading insights...',
      analysisData: undefined,
      color: color as any
    }
    showModal.value = true
    loadingExplanation.value = true

    const metric = getWorkoutMetricName(title)
    const cacheKey = `${selectedPeriod.value}-${metric}`

    // Check memory cache first
    if (workoutExplanations.value[cacheKey]) {
      modalData.value.analysisData = workoutExplanations.value[cacheKey]
      modalData.value.explanation = null
      loadingExplanation.value = false
      return
    }

    try {
      // Fetch from database (or trigger generation if not available)
      const response: any = await $fetch('/api/scores/explanation', {
        query: {
          type: 'workout',
          period: selectedPeriod.value,
          metric
        }
      })

      if (response.cached && response.analysis) {
        // Explanation was found in database
        workoutExplanations.value[cacheKey] = response.analysis
        modalData.value.analysisData = response.analysis
        modalData.value.explanation = null
      } else if (response.generating) {
        // Explanation is being generated - show message
        modalData.value.explanation = 'Generating insights... This may take a moment.'
        // Listener will refresh this when 'generate-score-explanations' completes
        // Note: The specific task might be different but 'generate-score-explanations' covers the batch.
        // If it's a single on-demand generation, we might need to listen to 'generate-score-explanation-single'
        // But for now assuming the batch task or a generic refresh handles it.
        // Actually, we should trigger a refreshRuns() here just in case the backend triggered a job we don't know about yet
        refreshRuns()
      } else {
        // Not cached and not generating (manual trigger required)
        modalData.value.explanation =
          response.message || 'No insights available. Click "Generate Insights" to create them.'
      }
    } catch (error) {
      console.error('Error fetching workout explanation:', error)
      modalData.value.explanation = 'Failed to load explanation. Please try again.'
    } finally {
      if (!modalData.value.explanation?.includes('Generating')) {
        loadingExplanation.value = false
      }
    }
  }

  // Map display titles to metric names
  const getNutritionMetricName = (title: string): string => {
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
  const openNutritionModal = async (title: string, score: number | null, color?: string) => {
    if (!score || !nutritionData.value) return

    modalData.value = {
      title,
      score,
      explanation: 'Loading insights...',
      analysisData: undefined,
      color: color as any
    }
    showModal.value = true
    loadingExplanation.value = true

    const metric = getNutritionMetricName(title)
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
        modalData.value.explanation = 'Generating insights... This may take a moment.'
        refreshRuns()
      } else {
        // Not cached and not generating (manual trigger required)
        modalData.value.explanation =
          response.message || 'No insights available. Click "Generate Insights" to create them.'
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

  // Background Task Monitoring
  const { refresh: refreshRuns } = useUserRuns()
  const { onTaskCompleted } = useUserRunsState()

  // Generate explanations function
  const generateExplanations = async () => {
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

      // Clear the caches so fresh explanations will be fetched
      workoutExplanations.value = {}
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

  const refreshCurrentModal = async () => {
    if (!showModal.value || !modalData.value) return

    // Identify if it is a workout or nutrition modal based on title/context
    // This is a bit heuristic but works for now given the titles are distinct enough or we can track type
    const title = modalData.value.title
    const isWorkout = [
      'Overall Workout Performance',
      'Technical Execution',
      'Effort Management',
      'Pacing Strategy',
      'Workout Execution'
    ].includes(title)

    if (isWorkout) {
      await openWorkoutModal(title, modalData.value.score, modalData.value.color)
    } else {
      await openNutritionModal(title, modalData.value.score, modalData.value.color)
    }
  }

  // Listen for completion
  onTaskCompleted('generate-score-explanations', async () => {
    generatingExplanations.value = false
    workoutExplanations.value = {}
    nutritionExplanations.value = {}

    toast.add({
      title: 'Insights Ready',
      description: 'Performance insights have been generated.',
      color: 'success',
      icon: 'i-heroicons-check-badge'
    })

    if (showModal.value) {
      await refreshCurrentModal()
    }
  })

  // Watch for period changes and refetch
  watch(selectedPeriod, async () => {
    await Promise.all([refreshNuxtData('workout-trends'), refreshNuxtData('nutrition-trends')])
  })

  const formatDateLocal = (date: string) => {
    return baseFormatDate(date)
  }
</script>
