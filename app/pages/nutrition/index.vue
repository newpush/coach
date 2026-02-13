<template>
  <UDashboardPanel id="nutrition-strategy">
    <template #header>
      <UDashboardNavbar title="Metabolic Strategy">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <div class="flex items-center gap-3">
            <ClientOnly>
              <DashboardTriggerMonitorButton />
            </ClientOnly>

            <UButton
              to="/nutrition/history"
              icon="i-lucide-history"
              color="neutral"
              variant="ghost"
            >
              <span class="hidden sm:inline">View History</span>
            </UButton>

            <UButton
              icon="i-lucide-refresh-cw"
              color="neutral"
              variant="ghost"
              :loading="loading"
              @click="refreshData"
            >
              <span class="hidden sm:inline">Refresh</span>
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-0 sm:p-6 space-y-4 sm:space-y-6">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
          <!-- Main Chart Section -->
          <div id="top-section" class="lg:col-span-2 space-y-4 sm:space-y-6">
            <UCard
              :ui="{
                root: 'rounded-none sm:rounded-lg shadow-none sm:shadow',
                body: 'p-4 sm:p-6'
              }"
            >
              <template #header>
                <div
                  class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-0"
                >
                  <div>
                    <h3 class="text-base font-semibold leading-6 text-gray-900 dark:text-white">
                      Metabolic Horizon
                    </h3>
                    <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      7-day rolling glycogen tank projection
                    </p>
                  </div>
                  <div class="flex flex-wrap items-center gap-3">
                    <div class="flex items-center gap-1">
                      <div class="size-2 rounded-full bg-blue-500" />
                      <span class="text-[10px] text-gray-500">Glycogen</span>
                    </div>
                    <div class="flex items-center gap-1">
                      <div class="size-2 rounded-full bg-blue-500 border border-dashed" />
                      <span class="text-[10px] text-gray-500">Projected</span>
                    </div>
                    <div class="flex items-center gap-1">
                      <div class="size-2 rounded bg-[#ef4444]" />
                      <span class="text-[10px] text-gray-500">Workout</span>
                    </div>
                    <div class="flex items-center gap-1">
                      <div class="size-2 rounded-full bg-[#10b981]" />
                      <span class="text-[10px] text-gray-500">Meal</span>
                    </div>
                    <div class="flex items-center gap-1">
                      <div
                        class="size-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] border-b-[#8b5cf6]"
                      />
                      <span class="text-[10px] text-gray-500">Multiple</span>
                    </div>
                  </div>
                </div>
              </template>

              <div v-if="loadingWave" class="h-[300px] flex items-center justify-center">
                <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-gray-400" />
              </div>
              <ClientOnly>
                <NutritionMultiDayEnergyChart
                  v-if="!loadingWave && wavePoints.length"
                  :points="wavePoints"
                  :highlighted-date="highlightedDate"
                />
                <div
                  v-else-if="!loadingWave"
                  class="h-[300px] flex items-center justify-center text-gray-500"
                >
                  No wave data available
                </div>
              </ClientOnly>
            </UCard>

            <UCard :ui="{ root: 'rounded-none sm:rounded-lg shadow-none sm:shadow' }">
              <template #header>
                <h3 class="text-base font-semibold leading-6 text-gray-900 dark:text-white">
                  Weekly Fueling Periodization
                </h3>
              </template>
              <div v-if="loadingStrategy" class="h-24 flex items-center justify-center">
                <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-gray-400" />
              </div>
              <ClientOnly>
                <NutritionWeeklyFuelingGrid
                  v-if="!loadingStrategy && strategy"
                  :days="strategy.fuelingMatrix"
                  @hover-day="highlightedDate = $event"
                />
              </ClientOnly>
            </UCard>
          </div>

          <!-- Sidebar Section -->
          <div class="space-y-4 sm:space-y-6 lg:row-span-2 lg:col-start-3">
            <!-- Active Fueling Feed (The "On-Ramp") -->
            <ClientOnly>
              <NutritionActiveFuelingFeed
                :feed="activeFeed"
                :loading="loadingActiveFeed"
                @open-ai-helper="openAiHelper"
              />
            </ClientOnly>

            <!-- Strategy Summary Card -->
            <UCard
              color="primary"
              variant="subtle"
              :ui="{ root: 'rounded-none sm:rounded-lg shadow-none sm:shadow' }"
            >
              <template #header>
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-sparkles" class="size-5 text-primary-500" />
                  <h3 class="text-base font-semibold leading-6">Strategic Summary</h3>
                </div>
              </template>
              <div v-if="loadingStrategy" class="space-y-2">
                <USkeleton class="h-4 w-full" />
                <USkeleton class="h-4 w-3/4" />
                <USkeleton class="h-4 w-5/6" />
              </div>
              <p
                v-else-if="strategy"
                class="text-sm leading-relaxed text-gray-700 dark:text-gray-300"
              >
                {{ strategy.summary }}
              </p>
            </UCard>

            <!-- Hydration Debt Card -->
            <UCard :ui="{ root: 'rounded-none sm:rounded-lg shadow-none sm:shadow' }">
              <template #header>
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-droplets" class="size-5 text-blue-500" />
                  <h3 class="text-base font-semibold leading-6 text-gray-900 dark:text-white">
                    Fluid Balance
                  </h3>
                </div>
              </template>
              <div class="text-center py-4">
                <div
                  class="mx-auto size-28 rounded-full border-8 flex items-center justify-center"
                  :class="hydrationRingClass"
                >
                  <div class="flex flex-col items-center">
                    <span class="text-xl font-black text-gray-900 dark:text-white">
                      {{ ((strategy?.hydrationDebt || 0) / 1000).toFixed(1) }}L
                    </span>
                    <span class="text-[10px] uppercase font-bold tracking-wider text-gray-500">
                      {{ hydrationStatus.toUpperCase() }}
                    </span>
                  </div>
                </div>
                <p class="text-sm text-gray-500 mt-3">Persistent Fluid Debt</p>

                <div
                  class="mt-4 p-3 bg-info-50 dark:bg-info-900/20 rounded-lg text-xs text-info-700 dark:text-info-300"
                >
                  {{ hydrationAdvice }}
                </div>

                <UAlert
                  v-if="strategy?.showHydrationFlushPrompt"
                  color="warning"
                  variant="soft"
                  class="mt-4 text-left"
                  :title="strategy?.hydrationFlushPrompt"
                >
                  <template #actions>
                    <UButton size="xs" color="warning" variant="solid" @click="resetHydrationDebt">
                      Reset to zero
                    </UButton>
                  </template>
                </UAlert>
              </div>

              <template #footer>
                <UButton
                  block
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-clipboard-list"
                  @click="showGroceryList = true"
                >
                  View Grocery Needs
                </UButton>
              </template>
            </UCard>
          </div>

          <!-- Upcoming Fueling Plan (Moved to separate div for better grid control) -->
          <div class="lg:col-span-2">
            <ClientOnly>
              <div v-if="upcomingPlan?.windows?.length" class="space-y-4">
                <NutritionUpcomingFuelingFeed
                  :windows="upcomingPlan.windows"
                  @suggest="openAiHelperForWindow"
                  @export-grocery="showGroceryList = true"
                />

                <div class="flex justify-between items-center px-4 sm:px-0">
                  <p class="text-[10px] text-gray-500 italic">
                    Targets are dynamically calculated based on your planned training intensity and
                    fuel states.
                  </p>
                </div>
              </div>
            </ClientOnly>
          </div>
        </div>

        <UModal
          v-model:open="showGroceryList"
          title="Strategic Grocery List"
          :ui="{ content: 'sm:max-w-md' }"
        >
          <template #content>
            <div class="p-6 space-y-4">
              <div
                class="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-xl border border-primary-100 dark:border-primary-800"
              >
                <p
                  class="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-widest mb-1"
                >
                  48-Hour Carb Target
                </p>
                <div class="flex items-baseline gap-2">
                  <span class="text-3xl font-black text-primary-700 dark:text-primary-300"
                    >{{ next48hCarbTotal }}g</span
                  >
                  <span class="text-sm text-primary-600/70">Total Carbs Needed</span>
                </div>
                <p class="text-[10px] text-primary-600/60 mt-1 italic">
                  This is the sum of all planned workout and baseline fueling windows.
                </p>
              </div>

              <p class="text-sm text-gray-500">
                Based on your metabolic horizon, ensure you have these fueling essentials ready:
              </p>

              <ul class="space-y-2">
                <li
                  v-for="item in groceryItems"
                  :key="item.name"
                  class="flex items-center gap-2 text-sm"
                >
                  <UIcon :name="item.icon" class="size-4 text-primary-500" />
                  <span>{{ item.name }}</span>
                  <span class="ml-auto text-xs text-gray-400">{{ item.reason }}</span>
                </li>
              </ul>

              <div
                class="p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg text-xs text-primary-700 dark:text-primary-300"
              >
                <strong>Pro Tip:</strong> Focus on high-glycemic carbs for your State 3 days to
                ensure rapid replenishment.
              </div>
            </div>
          </template>
        </UModal>

        <!-- AI Meal Helper Modal -->
        <NutritionFoodAiModal
          v-model:open="showAiHelper"
          :date="format(new Date(), 'yyyy-MM-dd')"
          :initial-context="aiHelperContext"
          @updated="refreshData"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
  import { format, parseISO } from 'date-fns'

  definePageMeta({
    middleware: 'auth',
    layout: 'default'
  })

  useHead({
    title: 'Metabolic Strategy',
    meta: [
      {
        name: 'description',
        content: 'View your 7-day metabolic horizon, fueling periodization, and fluid balance.'
      }
    ]
  })

  const loadingWave = ref(true)
  const loadingStrategy = ref(true)
  const loadingActiveFeed = ref(true)
  const wavePoints = ref<any[]>([])
  const strategy = ref<any>(null)
  const activeFeed = ref<any>(null)
  const upcomingPlan = ref<any>(null)
  const showGroceryList = ref(false)
  const highlightedDate = ref<string | null>(null)

  const showAiHelper = ref(false)
  const aiHelperContext = ref<any>(null)

  const loading = computed(
    () => loadingWave.value || loadingStrategy.value || loadingActiveFeed.value
  )

  async function refreshData() {
    loadingWave.value = true
    loadingStrategy.value = true
    loadingActiveFeed.value = true

    try {
      const [waveRes, strategyRes, feedRes, upcomingRes] = await Promise.all([
        $fetch('/api/nutrition/extended-wave', { query: { daysAhead: 3 } }),
        $fetch('/api/nutrition/strategy'),
        $fetch('/api/nutrition/active-feed'),
        $fetch('/api/nutrition/upcoming-plan')
      ])

      wavePoints.value = (waveRes as any).points
      strategy.value = strategyRes
      activeFeed.value = feedRes
      upcomingPlan.value = upcomingRes
    } catch (e) {
      console.error('Failed to load nutrition strategy:', e)
    } finally {
      loadingWave.value = false
      loadingStrategy.value = false
      loadingActiveFeed.value = false
    }
  }

  onMounted(() => {
    refreshData()
  })

  function openAiHelper(context: any) {
    aiHelperContext.value = {
      type: 'suggestion',
      targetCarbs: context.carbs,
      windowType: context.basedOnWindowType,
      item: context.item
    }
    showAiHelper.value = true
  }

  function openAiHelperForWindow(window: any) {
    aiHelperContext.value = {
      type: 'suggestion',
      targetCarbs: window.targetCarbs,
      windowType: window.type,
      item: null
    }
    showAiHelper.value = true
  }

  const hydrationAdvice = computed(() => {
    if (!strategy.value) return 'Loading...'
    const debt = strategy.value.hydrationDebt
    if (debt > 2000)
      return 'High fluid debt detected. Add 500ml of water to your next two meals to normalize.'
    if (debt > 1500)
      return 'Severe dehydration risk. Sip 250ml every 30 mins until balance is restored.'
    if (debt > 500) return 'Moderate fluid debt. Increase intake by 500ml over your baseline today.'
    return 'Fluid balance is optimal. Maintain standard hydration pattern.'
  })

  const hydrationStatus = computed(() => strategy.value?.hydrationStatus || 'green')
  const hydrationRingClass = computed(() => {
    if (hydrationStatus.value === 'red') {
      return 'border-error-500 bg-error-50 dark:bg-error-900/20'
    }
    if (hydrationStatus.value === 'yellow') {
      return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'
    }
    return 'border-success-500 bg-success-50 dark:bg-success-900/20'
  })

  async function resetHydrationDebt() {
    try {
      await $fetch('/api/nutrition/hydration-reset', { method: 'POST' })
      await refreshData()
    } catch (error) {
      console.error('Failed to reset hydration debt:', error)
    }
  }

  const groceryItems = computed(() => {
    if (!strategy.value) return []
    const items = [
      { name: 'Complex Carbs', reason: 'Daily baseline', icon: 'i-lucide-wheat' },
      { name: 'Electrolytes', reason: 'Fluid retention', icon: 'i-lucide-flask-conical' }
    ]

    if (strategy.value.fuelingMatrix.some((d: any) => d.state === 3)) {
      items.push({
        name: 'Simple Sugars/Gels',
        reason: 'High intensity fueling',
        icon: 'i-lucide-zap'
      })
      items.push({ name: 'Rice/Pasta', reason: 'Carb loading', icon: 'i-lucide-utensils-crossed' })
    }

    if (strategy.value.hydrationDebt > 1000) {
      items.push({ name: 'Sodium/Sea Salt', reason: 'Rehydration focus', icon: 'i-lucide-waves' })
    }

    return items
  })

  const next48hCarbTotal = computed(() => {
    if (!upcomingPlan.value?.windows) return 0
    const now = new Date()
    const limit = new Date(now.getTime() + 48 * 60 * 60 * 1000)

    return upcomingPlan.value.windows
      .filter((w: any) => {
        const d = new Date(w.startTime)
        return d >= now && d <= limit
      })
      .reduce((sum: number, w: any) => sum + (w.targetCarbs || 0), 0)
  })
</script>
