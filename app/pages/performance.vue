<template>
  <UDashboardPanel id="performance">
    <template #header>
      <UDashboardNavbar title="Performance Scores">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <USelectMenu
            v-model="selectedPeriod"
            :options="periodOptions"
            value-attribute="value"
            option-attribute="label"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-6 space-y-6">

    <!-- Athlete Profile Scores -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">Athlete Profile</h2>
          <UBadge v-if="profileData?.scores?.lastUpdated" color="neutral" variant="subtle">
            Updated {{ formatDate(profileData.scores.lastUpdated) }}
          </UBadge>
        </div>
      </template>
      
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
    </UCard>

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
    <UCard>
      <template #header>
        <h2 class="text-xl font-semibold">Workout Performance</h2>
      </template>
      
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

        <!-- Trend Chart -->
        <div class="mt-6">
          <h3 class="text-lg font-medium mb-4">Score Trends</h3>
          <TrendChart :data="workoutData.workouts" type="workout" />
        </div>

        <!-- Radar Chart -->
        <div class="mt-6">
          <h3 class="text-lg font-medium mb-4">Current Balance</h3>
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
    </UCard>

        <!-- Nutrition Scores -->
        <UCard>
          <template #header>
            <h2 class="text-xl font-semibold">Nutrition Quality</h2>
          </template>
          
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

            <!-- Trend Chart -->
            <div class="mt-6">
              <h3 class="text-lg font-medium mb-4">Score Trends</h3>
              <TrendChart :data="nutritionData.nutrition" type="nutrition" />
            </div>

            <!-- Radar Chart -->
            <div class="mt-6">
              <h3 class="text-lg font-medium mb-4">Current Balance</h3>
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
        </UCard>
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

// Handle workout aggregate score click - fetch AI explanation
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
  
  const cacheKey = `${selectedPeriod.value}-${title}`
  
  // Check cache first
  if (workoutExplanations.value[cacheKey]) {
    modalData.value.analysisData = workoutExplanations.value[cacheKey]
    modalData.value.explanation = null
    loadingExplanation.value = false
    return
  }
  
  try {
    const response = await $fetch('/api/scores/workout-trends-explanation', {
      method: 'POST',
      body: {
        days: selectedPeriod.value,
        summary: workoutData.value.summary
      }
    })
    
    workoutExplanations.value[cacheKey] = response.analysis
    modalData.value.analysisData = response.analysis
    modalData.value.explanation = null
  } catch (error) {
    console.error('Error fetching workout explanation:', error)
    modalData.value.explanation = 'Failed to load explanation. Please try again.'
  } finally {
    loadingExplanation.value = false
  }
}

// Handle nutrition aggregate score click - fetch AI explanation
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
  
  const cacheKey = `${selectedPeriod.value}-${title}`
  
  // Check cache first
  if (nutritionExplanations.value[cacheKey]) {
    modalData.value.analysisData = nutritionExplanations.value[cacheKey]
    modalData.value.explanation = null
    loadingExplanation.value = false
    return
  }
  
  try {
    const response = await $fetch('/api/scores/nutrition-trends-explanation', {
      method: 'POST',
      body: {
        days: selectedPeriod.value,
        summary: nutritionData.value.summary
      }
    })
    
    nutritionExplanations.value[cacheKey] = response.analysis
    modalData.value.analysisData = response.analysis
    modalData.value.explanation = null
  } catch (error) {
    console.error('Error fetching nutrition explanation:', error)
    modalData.value.explanation = 'Failed to load explanation. Please try again.'
  } finally {
    loadingExplanation.value = false
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