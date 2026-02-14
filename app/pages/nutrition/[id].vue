<template>
  <UDashboardPanel id="nutrition-detail">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UButton icon="i-heroicons-arrow-left" color="neutral" variant="ghost" to="/activities">
            Back to Activities
          </UButton>
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <UButton
              v-if="nutrition"
              icon="i-heroicons-sparkles"
              color="primary"
              variant="soft"
              size="sm"
              class="font-bold"
              :loading="generatingPlan"
              @click="handleGeneratePlan"
            >
              Regenerate Plan
            </UButton>
            <ClientOnly>
              <DashboardTriggerMonitorButton />
            </ClientOnly>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-4xl mx-auto w-full p-4 sm:p-6 pb-24">
        <div v-if="loading" class="flex items-center justify-center py-12">
          <div class="text-center">
            <div
              class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"
            />
            <p
              class="mt-4 text-sm text-gray-600 dark:text-gray-400 font-bold uppercase tracking-widest"
            >
              Loading status...
            </p>
          </div>
        </div>

        <div v-else-if="error" class="text-center py-12">
          <UAlert
            icon="i-heroicons-exclamation-triangle"
            color="error"
            variant="soft"
            title="Data Error"
            :description="error"
          />
        </div>

        <div v-else-if="nutrition" class="space-y-8">
          <!-- 0. THE DATE HEADER -->
          <UCard class="border-primary-100 dark:border-primary-900 shadow-sm">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-4">
                <UButton
                  icon="i-heroicons-chevron-left"
                  color="neutral"
                  variant="ghost"
                  @click="navigateDate(-1)"
                />
                <div class="p-3 bg-primary-50 dark:bg-primary-950/20 rounded-xl">
                  <UIcon name="i-heroicons-calendar-days" class="w-8 h-8 text-primary-500" />
                </div>
                <div>
                  <h1 class="text-2xl font-black tracking-tight text-gray-900 dark:text-white">
                    {{ formatDateLabel(nutrition?.date || (route.params.id as string)) }}
                  </h1>
                  <p class="text-sm text-gray-500 font-bold uppercase tracking-widest">
                    Daily Fueling Strategy
                  </p>
                </div>
              </div>
              <UButton
                icon="i-heroicons-chevron-right"
                color="neutral"
                variant="ghost"
                @click="navigateDate(1)"
              />
            </div>
          </UCard>

          <!-- 1. THE METABOLIC STATUS (Header) -->
          <NutritionFuelStateHeader
            :fuel-state="fuelState"
            :is-locked="nutrition.isManualLock"
            :goal-adjustment="goalAdjustment"
            :settings="nutritionSettings"
            :weight="userStore.profile?.weight || 75"
            :targets="{
              calories: nutrition.caloriesGoal || 2500,
              carbs: nutrition.carbsGoal || 300,
              protein: nutrition.proteinGoal || 150,
              fat: nutrition.fatGoal || 80
            }"
            :fueling-plan="nutrition.fuelingPlan"
            :actuals="{
              calories: nutrition.calories || 0,
              carbs: nutrition.carbs || 0,
              protein: nutrition.protein || 0,
              fat: nutrition.fat || 0
            }"
          />

          <!-- 1.5 LIVE ENERGY CHART -->
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
              />
            </div>
            <ClientOnly>
              <NutritionLiveEnergyChart
                :points="energyPoints"
                :ghost-points="ghostPoints"
                :view-mode="energyViewMode"
              />
            </ClientOnly>

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

          <!-- 2. THE TIMELINE (The What & When) -->
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <h2 class="text-base font-black uppercase tracking-widest text-gray-400">
                Fueling Timeline
              </h2>
              <div class="flex items-center gap-4">
                <span class="text-[10px] font-bold text-gray-400 uppercase tracking-tighter"
                  >{{ timeline.length }} Active Windows</span
                >
                <UButton
                  icon="i-heroicons-sparkles"
                  color="primary"
                  variant="ghost"
                  size="xs"
                  @click="openAiModal()"
                >
                  Log with AI
                </UButton>
              </div>
            </div>
            <NutritionFuelingTimeline
              :windows="timeline"
              :is-locked="nutrition.isManualLock"
              @add="handleAddItem"
              @add-ai="handleAddItemAi"
              @edit="handleEditItem"
            />
          </div>

          <!-- 3. AI INSIGHTS (Expanded Analysis) -->
          <UCard
            v-if="nutrition.aiAnalysisJson"
            class="mt-8 overflow-hidden border-primary-100 dark:border-primary-900 shadow-lg"
          >
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-black uppercase tracking-tighter flex items-center gap-2">
                  <UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-primary-500" />
                  Coach Analysis
                </h2>
                <UButton
                  variant="ghost"
                  color="neutral"
                  icon="i-heroicons-arrow-path"
                  size="xs"
                  @click="analyzeNutrition"
                  >Refresh</UButton
                >
              </div>
            </template>

            <div class="space-y-6">
              <div class="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl">
                <p class="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                  {{ nutrition.aiAnalysisJson.executive_summary }}
                </p>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div
                  v-for="section in nutrition.aiAnalysisJson.sections"
                  :key="section.title"
                  class="space-y-2"
                >
                  <h4 class="text-[10px] font-black uppercase text-gray-400 tracking-widest">
                    {{ section.title }}
                  </h4>
                  <ul class="space-y-1">
                    <li
                      v-for="point in section.analysis_points"
                      :key="point"
                      class="text-xs flex items-start gap-2"
                    >
                      <UIcon
                        name="i-heroicons-chevron-right"
                        class="w-3 h-3 mt-0.5 text-primary-500"
                      />
                      {{ point }}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </UCard>

          <!-- 4. MANUAL NOTES -->
          <NotesEditor
            v-model="nutrition.notes"
            :notes-updated-at="nutrition.notesUpdatedAt"
            :api-endpoint="`/api/nutrition/${nutrition.id}/notes`"
            @update:notes-updated-at="nutrition.notesUpdatedAt = $event"
          />
        </div>

        <NutritionFoodItemModal
          v-model:open="showItemModal"
          :nutrition-id="nutrition?.id"
          :date="nutrition?.date || (route.params.id as string)"
          :mode="modalMode"
          :initial-data="modalInitialData"
          @updated="fetchData"
        />
        <NutritionFoodAiModal
          v-model:open="showAiModal"
          :nutrition-id="nutrition?.id"
          :date="nutrition?.date || (route.params.id as string)"
          :initial-context="aiModalContext"
          @updated="fetchData"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
  import { mapNutritionToTimeline } from '~/utils/nutrition-timeline'
  import { ABSORPTION_PROFILES, type AbsorptionType } from '~/utils/nutrition-absorption'
  import { addDays, format } from 'date-fns'

  definePageMeta({
    middleware: 'auth'
  })

  const route = useRoute()
  const toast = useToast()
  const userStore = useUserStore()
  const { formatDateUTC } = useFormat()

  // State
  const nutrition = ref<any>(null)
  const workouts = ref<any[]>([])
  const nutritionSettings = ref<any>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)
  const generatingPlan = ref(false)
  const quickLogInput = ref('')
  const isLogging = ref(false)

  const showItemModal = ref(false)
  const showAiModal = ref(false)
  const modalMode = ref<'add' | 'edit'>('add')
  const modalInitialData = ref<any>(null)
  const aiModalContext = ref<any>(null)

  const energyViewIdx = ref('0') // '0': %, '1': kcal, '2': carbs

  useHead({
    title: computed(() => {
      const date = nutrition.value?.date || (route.params.id as string)
      return `Fueling Strategy - ${formatDateLabel(date)}`
    }),
    meta: [
      {
        name: 'description',
        content: 'Detailed fueling timeline and metabolic status for your training day.'
      }
    ]
  })

  const energyViewMode = computed(() => {
    if (energyViewIdx.value === '0') return 'percent'
    if (energyViewIdx.value === '1') return 'kcal'
    return 'carbs'
  })

  // Computed
  const fuelState = computed(() => {
    if (!nutrition.value?.fuelingPlan) return 1
    const intra = nutrition.value.fuelingPlan.windows?.find((w: any) => w.type === 'INTRA_WORKOUT')
    if (intra?.description?.includes('State 3')) return 3
    if (intra?.description?.includes('State 2')) return 2
    return 1
  })

  const goalAdjustment = computed(() => {
    return nutritionSettings.value?.targetAdjustmentPercent || 0
  })

  const energyPoints = computed(() => {
    // Priority: Server-provided points (consistent with metabolic chain)
    return nutrition.value?.energyPoints || []
  })

  // Metabolic Ghost Line - Fetched from server
  const ghostPoints = ref<any[]>([])
  const loadingGhost = ref(false)

  async function fetchGhostPoints() {
    const recommendationStore = useRecommendationStore()
    const mealRec = recommendationStore.todayRecommendation?.analysisJson?.meal_recommendation
    if (!mealRec || !nutrition.value) {
      ghostPoints.value = []
      return
    }

    const recDate = recommendationStore.todayRecommendation?.date
    const viewingDate = nutrition.value?.date
    const viewingDateStr =
      viewingDate instanceof Date ? viewingDate.toISOString().split('T')[0] : viewingDate

    if (recDate && viewingDateStr && recDate.split('T')[0] !== viewingDateStr.split('T')[0]) {
      ghostPoints.value = []
      return
    }

    loadingGhost.value = true
    try {
      const { points } = await $fetch<any>('/api/nutrition/simulate-impact', {
        method: 'POST',
        body: {
          date: viewingDateStr,
          carbs: mealRec.carbs,
          absorptionType: mealRec.absorptionType
        }
      })
      ghostPoints.value = points
    } catch (e) {
      console.error('Failed to fetch ghost points:', e)
      ghostPoints.value = []
    } finally {
      loadingGhost.value = false
    }
  }

  // Watch for recommendation or nutrition changes to refresh ghost line
  const recommendationStore = useRecommendationStore()
  watch(
    [() => recommendationStore.todayRecommendation, nutrition],
    () => {
      fetchGhostPoints()
    },
    { immediate: true }
  )

  const timeline = computed(() => {
    if (!nutrition.value || !nutritionSettings.value) return []

    try {
      console.log('[NutritionDashboard] Computing timeline with:', {
        nutritionDate: nutrition.value.date,

        workoutCount: workouts.value.length,

        hasFuelingPlan: !!nutrition.value.fuelingPlan,

        timezone: (useFormat() as any).timezone.value
      })

      const result = mapNutritionToTimeline(
        nutrition.value,

        workouts.value,

        {
          preWorkoutWindow: nutritionSettings.value.preWorkoutWindow || 90,

          postWorkoutWindow: nutritionSettings.value.postWorkoutWindow || 60,

          baseProteinPerKg: nutritionSettings.value.baseProteinPerKg || 1.6,

          baseFatPerKg: nutritionSettings.value.baseFatPerKg || 1.0,

          weight: userStore.profile?.weight || 75,

          mealPattern: nutritionSettings.value.mealPattern,

          timezone: (useFormat() as any).timezone.value
        }
      )

      console.log(
        '[NutritionDashboard] Timeline generated:',
        result.map((w) => ({ type: w.type, start: w.startTime, items: w.items.length }))
      )

      return result
    } catch (error) {
      console.error('[NutritionDashboard] Timeline computation failed:', error)
      return []
    }
  })

  // Data Fetching

  async function fetchData() {
    loading.value = true

    error.value = null

    const id = route.params.id as string

    try {
      // 1. Fetch Nutrition record
      console.log('[NutritionDashboard] Fetching nutrition for:', id)
      const nData = await $fetch<any>(`/api/nutrition/${id}`, {
        query: { currentTime: new Date().toISOString() }
      })

      nutrition.value = nData

      const dateStr = nData.date

      // 2. Fetch all training activities for this date
      console.log('[NutritionDashboard] Fetching activities for date:', dateStr)
      const wData = await $fetch<any[]>('/api/calendar', {
        query: { startDate: dateStr, endDate: dateStr }
      })

      // Filter out non-training items like wellness/nutrition placeholders and notes from the workouts array
      workouts.value = (wData || []).filter(
        (a) =>
          (a.source === 'completed' || a.source === 'planned') &&
          a.type !== 'Rest' &&
          a.type !== 'Note'
      )

      console.log(`[NutritionDashboard] Received ${workouts.value.length} training activities`)

      // 3. Fetch Nutrition Settings

      console.log('[NutritionDashboard] Fetching nutrition settings...')

      const sData = await $fetch<any>('/api/profile/nutrition')

      nutritionSettings.value = sData.settings

      console.log('[NutritionDashboard] Data fetching complete')
    } catch (error: any) {
      console.error('Fetch Error:', error)

      error.value = 'Could not load nutrition dashboard. Please try again.'
    } finally {
      loading.value = false
    }
  }

  // Event Handlers
  async function handleGeneratePlan() {
    if (!nutrition.value) return
    generatingPlan.value = true
    try {
      const response = await $fetch<any>('/api/nutrition/generate-plan', {
        method: 'POST',
        body: { date: nutrition.value.date }
      })
      toast.add({
        title: 'Plan Updated',
        description: response?.message || 'Fueling strategy regenerated in real time.',
        color: 'primary'
      })
      await fetchData()
    } catch (error: any) {
      toast.add({
        title: 'Error',
        description: error?.data?.message || 'Failed to regenerate fueling strategy.',
        color: 'error'
      })
    } finally {
      generatingPlan.value = false
    }
  }

  async function analyzeNutrition() {
    if (!nutrition.value) return
    try {
      await $fetch(`/api/nutrition/${nutrition.value.id}/analyze`, {
        method: 'POST'
      })
      toast.add({
        title: 'Analysis Started',
        description: 'AI coach is analyzing your day...',
        color: 'primary'
      })
    } catch (error) {
      toast.add({ title: 'Error', description: 'Failed to trigger analysis.', color: 'error' })
    }
  }

  async function handleQuickLog() {
    if (!quickLogInput.value || isLogging.value) return
    isLogging.value = true

    try {
      // Logic for AI logging would go here
      // For now we simulate
      await new Promise((r) => setTimeout(r, 1000))
      toast.add({ title: 'Logged', description: 'Item added to your journal.', color: 'success' })
      quickLogInput.value = ''
      await fetchData()
    } catch (error) {
      toast.add({ title: 'Error', description: 'Could not log item.', color: 'error' })
    } finally {
      isLogging.value = false
    }
  }

  function handleAddItem(event: { type: string; meals?: string[] }) {
    // Map window type to meal type if possible
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

    modalMode.value = 'add'
    modalInitialData.value = { mealType }
    showItemModal.value = true
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

    aiModalContext.value = { mealType }
    showAiModal.value = true
  }

  function handleEditItem(item: any) {
    modalMode.value = 'edit'
    modalInitialData.value = item
    showItemModal.value = true
  }

  function openAiModal(mealType: string = 'snacks') {
    aiModalContext.value = { mealType }
    showAiModal.value = true
  }

  function formatDateLabel(date: string) {
    if (!date) return ''
    const d = new Date(date + 'T12:00:00') // Force noon to avoid TZ shift in label
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  }

  function navigateDate(days: number) {
    const currentId = route.params.id as string
    let baseDateStr = currentId

    if (!/^\d{4}-\d{2}-\d{2}$/.test(currentId) && nutrition.value?.date) {
      baseDateStr = nutrition.value.date
    }

    // If we still don't have a date string, fallback to today
    if (!/^\d{4}-\d{2}-\d{2}$/.test(baseDateStr)) {
      baseDateStr = format(new Date(), 'yyyy-MM-dd')
    }

    const baseDate = new Date(baseDateStr + 'T12:00:00')
    const targetDate = addDays(baseDate, days)
    const dateStr = format(targetDate, 'yyyy-MM-dd')

    navigateTo(`/nutrition/${dateStr}`)
  }

  watch(() => route.params.id, fetchData)

  onMounted(fetchData)
</script>
