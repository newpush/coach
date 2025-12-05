<template>
  <UDashboardPanel id="performance">
    <template #header>
      <UDashboardNavbar title="Performance Scores">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <button
            @click="generateExplanations"
            :disabled="generatingExplanations"
            class="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm flex items-center gap-2"
          >
            <UIcon v-if="generatingExplanations" name="i-heroicons-arrow-path" class="animate-spin" />
            <UIcon v-else name="i-heroicons-sparkles" />
            <span v-if="generatingExplanations">Generating...</span>
            <span v-else>Generate Insights</span>
          </button>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-6 space-y-6">
        <!-- Page Header -->
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Performance Scores</h1>
          <p class="text-sm text-muted mt-1">
            Track your fitness metrics and performance trends across all training dimensions
          </p>
        </div>

        <!-- Athlete Profile Scores -->
        <div class="space-y-6">
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Athlete Profile</h2>
            <UBadge v-if="profileData?.scores?.lastUpdated" color="neutral" variant="subtle">
              Updated {{ formatDate(profileData.scores.lastUpdated) }}
            </UBadge>
          </div>
          
          <div v-if="profileLoading" class="flex justify-center py-12">
            <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary" />
          </div>
          
          <div v-else-if="profileData" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <ScoreCard
              title="Current Fitness"
              :score="profileData.scores?.currentFitness"
              :explanation="profileData.scores?.currentFitnessExplanationJson ? 'Click for detailed analysis' : profileData.scores?.currentFitnessExplanation"
              icon="i-heroicons-bolt"
              color="blue"
              @click="(data) => openModalWithStructured(data, profileData.scores?.currentFitnessExplanationJson)"
            />
            <ScoreCard
              title="Recovery Capacity"
              :score="profileData.scores?.recoveryCapacity"
              :explanation="profileData.scores?.recoveryCapacityExplanationJson ? 'Click for detailed analysis' : profileData.scores?.recoveryCapacityExplanation"
              icon="i-heroicons-heart"
              color="green"
              @click="(data) => openModalWithStructured(data, profileData.scores?.recoveryCapacityExplanationJson)"
            />
            <ScoreCard
              title="Nutrition Compliance"
              :score="profileData.scores?.nutritionCompliance"
              :explanation="profileData.scores?.nutritionComplianceExplanationJson ? 'Click for detailed analysis' : profileData.scores?.nutritionComplianceExplanation"
              icon="i-heroicons-cake"
              color="purple"
              @click="(data) => openModalWithStructured(data, profileData.scores?.nutritionComplianceExplanationJson)"
            />
            <ScoreCard
              title="Training Consistency"
              :score="profileData.scores?.trainingConsistency"
              :explanation="profileData.scores?.trainingConsistencyExplanationJson ? 'Click for detailed analysis' : profileData.scores?.trainingConsistencyExplanation"
              icon="i-heroicons-calendar"
              color="orange"
              @click="(data) => openModalWithStructured(data, profileData.scores?.trainingConsistencyExplanationJson)"
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

        <!-- Workout Scores -->
        <div class="space-y-6">
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Workout Performance</h2>
            <USelect
              v-model="selectedPeriod"
              :items="periodOptions"
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
                @click="() => workoutData && openWorkoutModal('Overall Workout Performance', workoutData.summary?.avgOverall, 'yellow')"
              />
              <ScoreCard
                title="Technical"
                :score="workoutData.summary?.avgTechnical"
                icon="i-heroicons-cog"
                color="blue"
                compact
                explanation="Click for AI-generated insights"
                @click="() => workoutData && openWorkoutModal('Technical Execution', workoutData.summary?.avgTechnical, 'blue')"
              />
              <ScoreCard
                title="Effort"
                :score="workoutData.summary?.avgEffort"
                icon="i-heroicons-fire"
                color="red"
                compact
                explanation="Click for AI-generated insights"
                @click="() => workoutData && openWorkoutModal('Effort Management', workoutData.summary?.avgEffort, 'red')"
              />
              <ScoreCard
                title="Pacing"
                :score="workoutData.summary?.avgPacing"
                icon="i-heroicons-chart-bar"
                color="green"
                compact
                explanation="Click for AI-generated insights"
                @click="() => workoutData && openWorkoutModal('Pacing Strategy', workoutData.summary?.avgPacing, 'green')"
              />
              <ScoreCard
                title="Execution"
                :score="workoutData.summary?.avgExecution"
                icon="i-heroicons-check-circle"
                color="purple"
                compact
                explanation="Click for AI-generated insights"
                @click="() => workoutData && openWorkoutModal('Workout Execution', workoutData.summary?.avgExecution, 'purple')"
              />
            </div>

            <!-- Trend Chart and Radar Chart Side by Side -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <!-- Score Trends (2/3 width) -->
              <div class="lg:col-span-2">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Score Trends</h3>
                <TrendChart :data="workoutData.workouts" type="workout" />
              </div>

              <!-- Current Balance (1/3 width) -->
              <div class="lg:col-span-1">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Current Balance</h3>
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

        <!-- Nutrition Scores -->
        <div class="space-y-6">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Nutrition Quality</h2>
          
          <div v-if="nutritionLoading" class="flex justify-center py-12">
            <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary" />
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
                @click="() => nutritionData && openNutritionModal('Overall Nutrition Quality', nutritionData.summary?.avgOverall, 'yellow')"
              />
              <ScoreCard
                title="Macro Balance"
                :score="nutritionData.summary?.avgMacroBalance"
                icon="i-heroicons-scale"
                color="blue"
                compact
                explanation="Click for AI-generated insights"
                @click="() => nutritionData && openNutritionModal('Macronutrient Balance', nutritionData.summary?.avgMacroBalance, 'blue')"
              />
              <ScoreCard
                title="Quality"
                :score="nutritionData.summary?.avgQuality"
                icon="i-heroicons-sparkles"
                color="green"
                compact
                explanation="Click for AI-generated insights"
                @click="() => nutritionData && openNutritionModal('Food Quality', nutritionData.summary?.avgQuality, 'green')"
              />
              <ScoreCard
                title="Adherence"
                :score="nutritionData.summary?.avgAdherence"
                icon="i-heroicons-check-badge"
                color="purple"
                compact
                explanation="Click for AI-generated insights"
                @click="() => nutritionData && openNutritionModal('Goal Adherence', nutritionData.summary?.avgAdherence, 'purple')"
              />
              <ScoreCard
                title="Hydration"
                :score="nutritionData.summary?.avgHydration"
                icon="i-heroicons-beaker"
                color="cyan"
                compact
                explanation="Click for AI-generated insights"
                @click="() => nutritionData && openNutritionModal('Hydration Status', nutritionData.summary?.avgHydration, 'cyan')"
              />
            </div>

            <!-- Trend Chart and Radar Chart Side by Side -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <!-- Score Trends (2/3 width) -->
              <div class="lg:col-span-2">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Score Trends</h3>
                <TrendChart :data="nutritionData.nutrition" type="nutrition" />
              </div>

              <!-- Current Balance (1/3 width) -->
              <div class="lg:col-span-1">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Current Balance</h3>
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
definePageMeta({
  middleware: 'auth',
  layout: 'default'
})

const selectedPeriod = ref(30)
const periodOptions = [
  { label: '7 Days', value: 7 },
  { label: '14 Days', value: 14 },
  { label: '30 Days', value: 30 },
  { label: '90 Days', value: 90 }
]

// Fetch athlete profile data
const { data: profileData, pending: profileLoading } = await useFetch('/api/scores/athlete-profile')

// Fetch workout score trends
const { data: workoutData, pending: workoutLoading } = await useFetch('/api/scores/workout-trends', {
  query: { days: selectedPeriod }
})

// Fetch nutrition score trends
const { data: nutritionData, pending: nutritionLoading } = await useFetch('/api/scores/nutrition-trends', {
  query: { days: selectedPeriod }
})

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
    explanation: structuredData ? null : data.explanation ?? null,
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
      modalData.value.explanation = 'Generating insights for the first time. Please try again in a moment.'
      
      // Auto-retry after 3 seconds
      setTimeout(async () => {
        try {
          const retryResponse: any = await $fetch('/api/scores/explanation', {
            query: { type: 'workout', period: selectedPeriod.value, metric }
          })
          
          if (retryResponse.cached && retryResponse.analysis) {
            workoutExplanations.value[cacheKey] = retryResponse.analysis
            modalData.value.analysisData = retryResponse.analysis
            modalData.value.explanation = null
            loadingExplanation.value = false
          }
        } catch (retryError) {
          console.error('Retry failed:', retryError)
        }
      }, 3000)
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
      modalData.value.explanation = 'Generating insights for the first time. Please try again in a moment.'
      
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

// Generate explanations function
const generateExplanations = async () => {
  generatingExplanations.value = true
  try {
    const response: any = await $fetch('/api/scores/generate-explanations', {
      method: 'POST'
    })
    
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
    toast.add({
      title: 'Generation Failed',
      description: error.data?.message || error.message || 'Failed to start generation',
      color: 'error',
      icon: 'i-heroicons-exclamation-circle'
    })
  } finally {
    generatingExplanations.value = false
  }
}

// Watch for period changes and refetch
watch(selectedPeriod, async () => {
  await Promise.all([
    refreshNuxtData('workout-trends'),
    refreshNuxtData('nutrition-trends')
  ])
})

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}
</script>