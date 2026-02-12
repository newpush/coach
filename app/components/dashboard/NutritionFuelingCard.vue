<template>
  <UCard :ui="{ body: 'p-0 sm:p-4' }">
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <template v-if="loading">
            <USkeleton class="w-3 h-3 rounded-full" />
            <USkeleton class="h-4 w-32" />
          </template>
          <template v-else>
            <div
              v-if="nutrition"
              class="w-3 h-3 rounded-full"
              :class="{
                'bg-blue-500': fuelState === 1,
                'bg-orange-500': fuelState === 2,
                'bg-red-500': fuelState === 3
              }"
            />
            <UIcon v-else name="i-heroicons-beaker" class="w-4 h-4 text-gray-400" />
            <h3 class="font-bold text-gray-900 dark:text-white text-sm tracking-tight uppercase">
              Daily Fueling: {{ nutrition ? stateLabel : 'No Plan' }}
            </h3>
          </template>
        </div>
        <div class="flex items-center gap-2">
          <UButton
            v-if="!loading"
            :to="`/nutrition/${formatDateUTC(new Date(), 'yyyy-MM-dd')}`"
            variant="ghost"
            color="neutral"
            size="xs"
            icon="i-heroicons-arrow-right"
            trailing
            title="Open Journal"
          />
          <UButton
            v-if="!loading"
            :loading="generating"
            variant="ghost"
            color="neutral"
            size="xs"
            icon="i-heroicons-sparkles"
            title="Regenerate Plan"
            @click="handleGenerate"
          />
          <UButton
            v-if="!loading"
            to="/profile/settings?tab=nutrition"
            variant="ghost"
            color="neutral"
            size="xs"
            icon="i-heroicons-cog-6-tooth"
            title="Nutrition Settings"
          />
          <UBadge v-if="strategy" color="neutral" variant="subtle" size="xs">
            {{ strategy }}
          </UBadge>
        </div>
      </div>
    </template>

    <!-- Loading State -->
    <div v-if="loading" class="p-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div class="space-y-4">
          <div class="space-y-2">
            <USkeleton class="h-3 w-1/2" />
            <USkeleton class="h-6 w-full rounded-full" />
          </div>
          <div class="grid grid-cols-3 gap-4">
            <USkeleton v-for="i in 3" :key="i" class="h-16 w-full rounded-xl" />
          </div>
        </div>
        <div class="space-y-3">
          <div v-for="i in 3" :key="i" class="flex gap-3">
            <USkeleton class="w-2.5 h-2.5 rounded-full mt-1" />
            <div class="flex-1 space-y-2">
              <USkeleton class="h-3 w-1/4" />
              <USkeleton class="h-2 w-3/4" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="!nutrition"
      class="p-6 text-center flex flex-col items-center justify-center h-full min-h-[200px] space-y-3"
    >
      <UIcon name="i-heroicons-calendar-slash" class="w-10 h-10 text-gray-300 dark:text-gray-600" />
      <p class="text-xs text-gray-500 dark:text-gray-400">
        No fueling plan for today. Add a workout to see periodized guidance.
      </p>
      <div class="flex gap-2">
        <UButton
          :loading="generating"
          variant="soft"
          color="primary"
          size="xs"
          icon="i-heroicons-sparkles"
          @click="handleGenerate"
        >
          Generate Plan
        </UButton>
        <UButton to="/plan" variant="soft" color="neutral" size="xs">Set Goal</UButton>
      </div>
    </div>

    <!-- Active Plan Content -->
    <div v-else class="p-4 space-y-6">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        <!-- Left Side: Tank & Info -->
        <div class="space-y-6">
          <!-- Fuel Tank Visualization -->

          <div class="space-y-2 group cursor-pointer" @click="showExplainModal = true">
            <div class="flex justify-between text-xs font-bold uppercase tracking-wider">
              <span class="text-gray-500 flex items-center gap-1">
                Glycogen "Fuel Tank"
                <UIcon
                  name="i-heroicons-information-circle"
                  class="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </span>
              <span :class="tankColorClass">{{ tankPercentage }}%</span>
            </div>
            <div
              class="h-6 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden border border-gray-200 dark:border-gray-700 ring-primary-500/0 group-hover:ring-2 transition-all duration-300"
            >
              <div
                class="h-full transition-all duration-1000 relative"
                :class="tankBarClass"
                :style="{ width: `${tankPercentage}%` }"
              >
                <!-- Subtle pattern/shine -->
                <div
                  class="absolute inset-0 opacity-20 bg-gradient-to-r from-white/0 via-white/50 to-white/0 animate-shimmer"
                />
              </div>
            </div>
            <p class="text-xs text-gray-500 italic flex justify-between items-center">
              {{ tankAdvice }}
              <span
                class="text-[9px] font-black uppercase text-primary-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >Show Breakdown</span
              >
            </p>
          </div>

          <!-- Live Energy Visualization -->
          <div class="pt-6 border-t border-gray-100 dark:border-gray-800">
            <div
              class="bg-white dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-800 p-4"
            >
              <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-1.5">
                  <h4
                    class="text-[10px] font-black uppercase text-gray-400 tracking-widest flex items-center gap-1.5"
                  >
                    <UIcon name="i-heroicons-bolt" class="w-3.5 h-3.5 text-primary-500" />
                    Live Energy Availability
                  </h4>
                  <span
                    v-if="currentLevel < 25"
                    class="text-[9px] font-black uppercase text-red-500 animate-pulse ml-2"
                    >Low Fuel Warning</span
                  >
                </div>
                <UTabs
                  v-model="energyViewIdx"
                  :items="[
                    { label: '%', value: '0' },
                    { label: 'kcal', value: '1' },
                    { label: 'carbs', value: '2' }
                  ]"
                  size="xs"
                  class="w-32"
                  @update:model-value="console.log('[FuelingCard] View switched to:', $event)"
                />
              </div>
              <NutritionLiveEnergyChart
                :points="energyPoints"
                :ghost-points="ghostPoints"
                :view-mode="energyViewMode"
              />

              <!-- Legend/Status -->
              <div
                class="flex items-center justify-between text-[9px] font-bold uppercase tracking-widest text-gray-400 px-1 mt-4"
              >
                <div class="flex gap-3">
                  <span class="flex items-center gap-1"
                    ><span class="w-1.5 h-1.5 rounded-full bg-primary-500"></span> Actual</span
                  >
                  <span class="flex items-center gap-1"
                    ><span
                      class="w-1.5 h-1.5 rounded-full border border-primary-500 border-dashed"
                    ></span>
                    Predicted</span
                  >
                  <span v-if="ghostPoints.length > 0" class="flex items-center gap-1">
                    <span class="w-1.5 h-1.5 border border-purple-400 border-dashed"></span> Ghost
                    (Rec)
                  </span>
                </div>
                <div class="flex gap-3">
                  <span class="flex items-center gap-1">
                    <UIcon name="i-tabler-tools-kitchen-2" class="w-3 h-3 text-green-500" />
                    Meal
                  </span>
                  <span class="flex items-center gap-1">
                    <UIcon name="i-tabler-bike" class="w-3 h-3 text-red-500" /> Workout
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Meal Recommendation Section -->
          <div
            v-if="recommendationStore.todayRecommendation?.analysisJson?.meal_recommendation"
            class="bg-purple-50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-800/30 rounded-xl p-4"
          >
            <div class="flex items-center gap-2 mb-2">
              <UIcon name="i-heroicons-sparkles" class="w-4 h-4 text-purple-500" />
              <h4
                class="text-xs font-black uppercase text-purple-600 dark:text-purple-400 tracking-wider"
              >
                AI Nutrition Advice
              </h4>
            </div>
            <div class="space-y-1">
              <p class="text-sm font-bold text-gray-900 dark:text-white">
                {{ recommendationStore.todayRecommendation.analysisJson.meal_recommendation.item }}
              </p>
              <div class="flex items-center gap-3">
                <UBadge color="primary" variant="subtle" size="xs">
                  {{
                    recommendationStore.todayRecommendation.analysisJson.meal_recommendation.carbs
                  }}g Carbs
                </UBadge>
                <UBadge color="neutral" variant="subtle" size="xs">
                  {{
                    recommendationStore.todayRecommendation.analysisJson.meal_recommendation
                      .absorptionType
                  }}
                </UBadge>
                <span class="text-[10px] text-gray-500 font-medium uppercase tracking-tight">
                  Timing:
                  {{
                    recommendationStore.todayRecommendation.analysisJson.meal_recommendation.timing
                  }}
                </span>
              </div>
              <p class="text-xs text-gray-500 italic mt-2 leading-relaxed">
                {{ mealRecommendationReasoning }}
              </p>
            </div>
          </div>

          <!-- Daily Totals -->
          <div
            class="pt-6 border-t border-gray-100 dark:border-gray-800 grid grid-cols-2 sm:grid-cols-3 gap-3 text-center"
          >
            <div
              class="bg-gray-50 dark:bg-gray-900/50 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800 cursor-pointer hover:border-primary-300 transition-colors group"
              @click="showMacroExplain('Calories')"
            >
              <div class="flex items-center justify-center gap-1 mb-1">
                <UIcon name="i-tabler-flame" class="w-3.5 h-3.5 text-orange-500" />
                <div class="text-[10px] uppercase font-bold text-gray-400">Calories</div>
              </div>
              <div class="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                {{ Math.round(nutrition.calories || 0)
                }}<span class="text-[10px] text-gray-400 font-medium"
                  >/{{ Math.round(nutrition.caloriesGoal || 0) }}</span
                >
              </div>
            </div>
            <div
              class="bg-gray-50 dark:bg-gray-900/50 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800 cursor-pointer hover:border-primary-300 transition-colors group"
              @click="showMacroExplain('Carbs')"
            >
              <div class="flex items-center justify-center gap-1 mb-1">
                <UIcon name="i-tabler-bread" class="w-3.5 h-3.5 text-yellow-500" />
                <div class="text-[10px] uppercase font-bold text-gray-400">Carbs</div>
              </div>
              <div class="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                {{ Math.round(nutrition.carbs || 0)
                }}<span class="text-[10px] text-gray-400 font-medium"
                  >/{{ Math.round(nutrition.carbsGoal || 0) }}g</span
                >
              </div>
            </div>
            <div
              class="bg-gray-50 dark:bg-gray-900/50 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800 cursor-pointer hover:border-primary-300 transition-colors group"
              @click="showMacroExplain('Protein')"
            >
              <div class="flex items-center justify-center gap-1 mb-1">
                <UIcon name="i-tabler-egg" class="w-3.5 h-3.5 text-blue-500" />
                <div class="text-[10px] uppercase font-bold text-gray-400">Protein</div>
              </div>
              <div class="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                {{ Math.round(nutrition.protein || 0)
                }}<span class="text-[10px] text-gray-400 font-medium"
                  >/{{ Math.round(nutrition.proteinGoal || 0) }}g</span
                >
              </div>
            </div>
            <div
              class="bg-gray-50 dark:bg-gray-900/50 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800 cursor-pointer hover:border-primary-300 transition-colors group"
              @click="showMacroExplain('Fat')"
            >
              <div class="flex items-center justify-center gap-1 mb-1">
                <UIcon name="i-tabler-droplet" class="w-3.5 h-3.5 text-green-500" />
                <div class="text-[10px] uppercase font-bold text-gray-400">Fat</div>
              </div>
              <div class="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                {{ Math.round(nutrition.fat || 0)
                }}<span class="text-[10px] text-gray-400 font-medium"
                  >/{{ Math.round(nutrition.fatGoal || 0) }}g</span
                >
              </div>
            </div>
            <div
              class="bg-gray-50 dark:bg-gray-900/50 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800"
            >
              <div class="flex items-center justify-center gap-1 mb-1">
                <UIcon name="i-tabler-droplet" class="w-3.5 h-3.5 text-blue-400" />
                <div class="text-[10px] uppercase font-bold text-gray-400">Hydration</div>
              </div>
              <div class="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                {{ ((nutrition.waterMl || 0) / 1000).toFixed(1)
                }}<span class="text-[10px] text-gray-400 font-medium"
                  >/{{
                    ((nutrition.fuelingPlan?.dailyTotals?.fluid || 2000) / 1000).toFixed(1)
                  }}L</span
                >
              </div>
            </div>
          </div>
        </div>

        <!-- Right Side: Timeline -->
        <div class="space-y-4">
          <div
            class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2"
          >
            <UIcon name="i-heroicons-clock" class="w-4 h-4" />
            Fueling Timeline
          </div>
          <div class="space-y-3 max-h-[700px] overflow-y-auto pl-4 pr-2 pt-4 pb-8 custom-scrollbar">
            <template v-for="(window, index) in timeline" :key="index">
              <!-- Physical Effort Anchor -->
              <NutritionWorkoutEventCard
                v-if="window.type === 'WORKOUT_EVENT'"
                :workout="window.workout"
                :fuel-state="getWorkoutFuelState(window.workout)"
                class="!pb-2"
              />

              <!-- Fueling Window -->
              <NutritionWindowBlock
                v-else
                :type="window.type"
                :title="formatTitle(window)"
                :start-time="window.startTime"
                :end-time="window.endTime"
                :target-carbs="window.targetCarbs"
                :target-protein="window.targetProtein"
                :target-fat="window.targetFat"
                :target-fluid="window.targetFluid"
                :target-sodium="window.targetSodium"
                :items="window.items"
                :supplements="window.supplements"
                :meals="window.meals"
                :is-locked="false"
                class="!pb-6"
                @add="handleAddItem"
                @add-ai="handleAddItemAi"
                @edit="handleEditItem"
              />
            </template>
          </div>
        </div>
      </div>
    </div>
  </UCard>

  <DashboardGlycogenExplainModal
    v-model="showExplainModal"
    :percentage="tankPercentage"
    :state="glycogenState.state"
    :advice="tankAdvice"
    :breakdown="glycogenState.breakdown"
  />

  <NutritionMacroExplainModal
    v-if="selectedMacro"
    v-model="isMacroExplainOpen"
    :label="selectedMacro.label"
    :actual="selectedMacro.actual"
    :target="selectedMacro.target"
    :unit="selectedMacro.unit"
    :fuel-state="fuelState"
    :settings="settings"
    :weight="weight || 75"
    :fueling-plan="nutrition?.fuelingPlan"
  />

  <NutritionFoodItemModal
    ref="itemModal"
    :nutrition-id="nutrition?.id"
    :date="nutrition?.date || formatDateUTC(new Date(), 'yyyy-MM-dd')"
    @updated="emit('refresh')"
  />
  <NutritionFoodAiModal
    ref="aiModal"
    :nutrition-id="nutrition?.id"
    :date="nutrition?.date || formatDateUTC(new Date(), 'yyyy-MM-dd')"
    @updated="emit('refresh')"
  />
</template>

<script setup lang="ts">
  import { mapNutritionToTimeline } from '~/utils/nutrition-timeline'
  import { calculateGlycogenState, calculateEnergyTimeline } from '~/utils/nutrition-logic'
  import { ABSORPTION_PROFILES, type AbsorptionType } from '~/utils/nutrition-absorption'

  const props = defineProps<{
    nutrition: any
    workouts?: any[]
    settings?: any
    weight?: number
    loading?: boolean
  }>()

  const emit = defineEmits<{
    refresh: []
  }>()

  const userStore = useUserStore()
  const recommendationStore = useRecommendationStore()
  const { formatDateUTC } = useFormat()
  const toast = useToast()

  const generating = ref(false)
  const showExplainModal = ref(false)
  const isMacroExplainOpen = ref(false)
  const selectedMacro = ref<any>(null)

  const itemModal = ref<any>(null)
  const aiModal = ref<any>(null)

  const energyViewIdx = ref('0') // '0': %, '1': kcal, '2': carbs
  const energyViewMode = computed(() => {
    if (energyViewIdx.value === '0') return 'percent'
    if (energyViewIdx.value === '1') return 'kcal'
    return 'carbs'
  })

  function handleAddItem(event: { type: string; meals?: string[] }) {
    let mealType = 'snacks'
    if (event.meals && event.meals.length > 0) {
      const firstMeal = event.meals[0]?.toLowerCase()
      if (['breakfast', 'lunch', 'dinner', 'snacks'].includes(firstMeal!)) {
        mealType = firstMeal!
      }
    } else if (event.type === 'PRE_WORKOUT') {
      mealType = 'breakfast'
    } else if (event.type === 'POST_WORKOUT') {
      mealType = 'lunch'
    }
    itemModal.value?.open('add', { mealType })
  }

  function handleAddItemAi(event: { type: string; meals?: string[] }) {
    let mealType = 'snacks'
    if (event.meals && event.meals.length > 0) {
      const firstMeal = event.meals[0]?.toLowerCase()
      if (['breakfast', 'lunch', 'dinner', 'snacks'].includes(firstMeal!)) {
        mealType = firstMeal!
      }
    } else if (event.type === 'PRE_WORKOUT') {
      mealType = 'breakfast'
    } else if (event.type === 'POST_WORKOUT') {
      mealType = 'lunch'
    }
    aiModal.value?.open(mealType)
  }

  function handleEditItem(item: any) {
    itemModal.value?.open('edit', item)
  }

  function showMacroExplain(label: string) {
    let actual = 0
    let target = 0
    let unit = 'g'

    if (label === 'Calories') {
      actual = props.nutrition.calories || 0
      target = props.nutrition.caloriesGoal || 2500
      unit = 'kcal'
    } else if (label === 'Carbs') {
      actual = props.nutrition.carbs || 0
      target = props.nutrition.carbsGoal || 0
      unit = 'g'
    } else if (label === 'Protein') {
      actual = props.nutrition.protein || 0
      target = props.nutrition.proteinGoal || 0
      unit = 'g'
    } else if (label === 'Fat') {
      actual = props.nutrition.fat || 0
      target = props.nutrition.fatGoal || 0
      unit = 'g'
    }

    selectedMacro.value = { label, actual, target, unit }
    isMacroExplainOpen.value = true
  }

  const plan = computed(() => props.nutrition?.fuelingPlan)
  const mealRecommendation = computed(
    () => recommendationStore.todayRecommendation?.analysisJson?.meal_recommendation
  )

  const energyPoints = computed(() => {
    // Priority: Server-provided points (consistent with metabolic chain)
    if (props.nutrition?.energyPoints && props.nutrition.energyPoints.length > 0) {
      return props.nutrition.energyPoints
    }

    if (!props.nutrition || !props.settings) return []

    const { timezone } = useFormat()

    return calculateEnergyTimeline(
      props.nutrition,
      props.workouts || [],
      props.settings,
      timezone.value,
      undefined,
      {
        startingGlycogenPercentage: props.nutrition.startingGlycogen,
        startingFluidDeficit: props.nutrition.startingFluid
      }
    )
  })

  // Metabolic Ghost Line Calculation

  const ghostPoints = computed(() => {
    const mealRec = recommendationStore.todayRecommendation?.analysisJson?.meal_recommendation

    if (!mealRec || !props.nutrition || !props.settings) return []

    const { timezone } = useFormat()

    const now = new Date()

    // Simulate adding the recommended meal 15 mins from now

    const ghostTime = new Date(now.getTime() + 15 * 60000)

    return calculateEnergyTimeline(
      props.nutrition,

      props.workouts || [],

      props.settings,

      timezone.value,

      {
        totalCarbs: mealRec.carbs || 30,

        totalKcal: (mealRec.carbs || 30) * 4,

        profile:
          ABSORPTION_PROFILES[mealRec.absorptionType as AbsorptionType] ||
          ABSORPTION_PROFILES.BALANCED,

        time: ghostTime
      },

      {
        startingGlycogenPercentage: props.nutrition.startingGlycogen,

        startingFluidDeficit: props.nutrition.startingFluid
      }
    )
  })

  const currentLevel = computed(() => {
    const points = energyPoints.value
    if (points.length === 0) return 0
    const nowIdx = points.findIndex((p: any) => p.isFuture)
    const activePoint = nowIdx > 0 ? points[nowIdx - 1] : points[0]
    return activePoint?.level || 0
  })

  const timeline = computed(() => {
    if (!props.nutrition || !plan.value) return []
    const { timezone } = useFormat()

    return mapNutritionToTimeline(props.nutrition, props.workouts || [], {
      preWorkoutWindow: props.settings?.preWorkoutWindow || 90,
      postWorkoutWindow: props.settings?.postWorkoutWindow || 60,
      baseProteinPerKg: props.settings?.baseProteinPerKg || 1.6,
      baseFatPerKg: props.settings?.baseFatPerKg || 1.0,
      weight: props.weight || 75,
      mealPattern: props.settings?.mealPattern,
      timezone: timezone.value
    })
  })

  const glycogenState = computed(() => {
    // Priority: Server-provided summary
    if (props.nutrition?.percentage != null) {
      return {
        percentage: props.nutrition.percentage,
        advice: props.nutrition.advice || '',
        state: props.nutrition.state || 1,
        breakdown: props.nutrition.breakdown || {
          midnightBaseline: 80,
          replenishment: { value: 0, actualCarbs: 0, targetCarbs: 0 },
          depletion: []
        }
      }
    }

    if (!props.nutrition) {
      return {
        percentage: 85,
        advice: 'Loading...',
        state: 1,
        breakdown: {
          midnightBaseline: 80,
          replenishment: { value: 5, actualCarbs: 0, targetCarbs: 300 },
          depletion: []
        }
      }
    }
    const { timezone } = useFormat()
    return calculateGlycogenState(
      props.nutrition,
      props.workouts || [],
      props.settings,
      timezone.value,
      new Date(),
      props.nutrition.startingGlycogen
    )
  })

  const tankPercentage = computed(() => glycogenState.value.percentage)
  const tankAdvice = computed(() => glycogenState.value.advice)

  const mealRecommendationReasoning = computed(() => {
    const raw = mealRecommendation.value?.reasoning || ''
    if (!raw) return ''

    const liveTank = tankPercentage.value
    const replaced = raw.replace(
      /(tank\s*now[^0-9]{0,20})(\d{1,3})%/i,
      (_m, p1) => `${p1}${liveTank}%`
    )

    if (replaced !== raw) return replaced

    return `${raw} (Live tank now: ${liveTank}%).`
  })

  const tankColorClass = computed(() => {
    if (tankPercentage.value > 70) return 'text-green-500'
    if (tankPercentage.value > 30) return 'text-orange-500'
    return 'text-red-500 font-bold animate-pulse'
  })

  const tankBarClass = computed(() => {
    if (tankPercentage.value > 70) return 'bg-green-500'
    if (tankPercentage.value > 30) return 'bg-orange-500'
    return 'bg-red-500'
  })

  function getWorkoutFuelState(workout: any) {
    if (!workout) return 1
    const intensity = workout.workIntensity || 0.65
    if (intensity > 0.85) return 3
    if (intensity > 0.6) return 2
    return 1
  }

  function formatTitle(window: any) {
    if (window.type === 'TRANSITION') return 'Transition Fueling'
    if (window.type === 'DAILY_BASE') return 'Daily Base'
    if (window.type === 'WORKOUT_EVENT') return window.workout?.title || 'Workout'

    const typeMap: Record<string, string> = {
      PRE_WORKOUT: 'Pre-Workout',
      INTRA_WORKOUT: 'Intra-Workout Fueling',
      POST_WORKOUT: 'Post-Workout Recovery'
    }

    const typeStr = typeMap[window.type] || window.type
    return window.workoutTitle ? `${typeStr}: ${window.workoutTitle}` : typeStr
  }

  async function handleGenerate() {
    generating.value = true
    try {
      const response = await $fetch<any>('/api/nutrition/generate-plan', {
        method: 'POST'
      })

      if (response.success) {
        toast.add({
          title: 'Generation Started',
          description: response.message,
          color: 'success'
        })
      } else {
        toast.add({
          title: 'No Workout Found',
          description: response.message,
          color: 'warning'
        })
      }
      emit('refresh')
    } catch (e: any) {
      toast.add({
        title: 'Failed to start generation',
        description: e.data?.message || e.message,
        color: 'error'
      })
    } finally {
      generating.value = false
    }
  }

  const fuelState = computed(() => {
    // Priority 1: Plan totals (Newest implementation)
    if (props.nutrition?.fuelingPlan?.dailyTotals?.fuelState) {
      return props.nutrition.fuelingPlan.dailyTotals.fuelState
    }
    // Priority 2: Nutrition record 'state' column (DB source)
    if (props.nutrition?.state) {
      return props.nutrition.state
    }

    if (!plan.value) return 1

    // Priority 3: Scan ALL windows (handles merged TRANSITION windows)
    const allDescriptions = plan.value.windows?.map((w: any) => w.description || '').join(' ') || ''
    if (allDescriptions.includes('Fuel State 3')) return 3
    if (allDescriptions.includes('Fuel State 2')) return 2
    if (allDescriptions.includes('Fuel State 1')) return 1

    return 1
  })

  const stateLabel = computed(() => {
    if (!plan.value) return 'No Plan'
    switch (fuelState.value) {
      case 3:
        return 'Performance (High Demand)'
      case 2:
        return 'Steady (Moderate Demand)'
      default:
        return 'Eco (Recovery/Light)'
    }
  })

  const strategy = computed(() => {
    if (!plan.value) return null
    return plan.value.notes?.find((n: string) => n.includes('Protocol'))?.split(':')[0] || null
  })
</script>

<style scoped>
  @keyframes shimmer {
    0% {
      transform: translateX(-100%);
    }

    100% {
      transform: translateX(100%);
    }
  }

  .animate-shimmer {
    animation: shimmer 2s infinite;
  }

  .custom-scrollbar::-webkit-scrollbar {
    width: 4px;
  }

  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }

  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: #e2e8f0;
    border-radius: 10px;
  }

  .dark .custom-scrollbar::-webkit-scrollbar-thumb {
    background: #334155;
  }
</style>
