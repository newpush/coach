<template>
  <UCard :ui="{ body: 'p-0 sm:p-0' }" class="overflow-hidden">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <div class="rounded-lg bg-primary-100 p-1.5 dark:bg-primary-900">
            <UIcon name="i-lucide-calendar-range" class="h-5 w-5 text-primary-500" />
          </div>
          <div>
            <h3 class="text-sm font-black uppercase tracking-tight leading-tight">
              Weekly Nutrition Plan
            </h3>
            <p class="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
              {{ format(parseISO(startDate), 'MMM d') }} - {{ format(parseISO(endDate), 'MMM d') }}
            </p>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton
            color="primary"
            variant="solid"
            size="xs"
            icon="i-lucide-sparkles"
            :loading="generating"
            @click="emit('generate-draft')"
          >
            Generate Draft
          </UButton>
          <UButton
            color="neutral"
            variant="soft"
            size="xs"
            icon="i-lucide-shopping-cart"
            @click="emit('open-grocery')"
          >
            Grocery List
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-lucide-refresh-cw"
            :loading="loading"
            @click="refresh"
          >
            Sync
          </UButton>
        </div>
      </div>
    </template>

    <div
      class="grid grid-cols-2 gap-2 border-b border-gray-100 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-900/40 sm:grid-cols-4"
    >
      <div
        class="rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-900"
      >
        <p class="text-[9px] font-black uppercase tracking-wider text-gray-500">Days Complete</p>
        <p class="text-lg font-black">{{ weeklyStats.daysComplete }}</p>
      </div>
      <div
        class="rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-900"
      >
        <p class="text-[9px] font-black uppercase tracking-wider text-gray-500">Days With Gaps</p>
        <p class="text-lg font-black text-warning-600">{{ weeklyStats.daysWithGaps }}</p>
      </div>
      <div
        class="rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-900"
      >
        <p class="text-[9px] font-black uppercase tracking-wider text-gray-500">Planned / Target</p>
        <p class="text-lg font-black">
          {{ weeklyStats.plannedCarbs }}g / {{ weeklyStats.targetCarbs }}g
        </p>
      </div>
      <div
        class="rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-900"
      >
        <p class="text-[9px] font-black uppercase tracking-wider text-gray-500">Plan Sync Age</p>
        <p class="text-lg font-black">{{ planSyncAgeLabel }}</p>
      </div>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full border-collapse text-left">
        <thead>
          <tr class="border-b border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50">
            <th class="w-28 p-3 text-[10px] font-black uppercase tracking-widest text-gray-400">
              Day
            </th>
            <th class="p-3 text-[10px] font-black uppercase tracking-widest text-gray-400">
              Training
            </th>
            <th class="p-3 text-[10px] font-black uppercase tracking-widest text-gray-400">
              Fueling Plan
            </th>
            <th
              class="w-44 p-3 text-right text-[10px] font-black uppercase tracking-widest text-gray-400"
            >
              Target
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
          <tr
            v-for="day in planDays"
            :key="day.date"
            class="cursor-pointer transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-800/30"
            @click="openDayDrawer(day)"
          >
            <td class="p-3">
              <p class="text-[10px] font-black uppercase text-gray-400">
                {{ format(parseISO(day.date), 'EEE') }}
              </p>
              <div class="mt-1 flex items-center gap-1.5">
                <p class="text-sm font-black tracking-tight">
                  {{ format(parseISO(day.date), 'MMM d') }}
                </p>
                <UBadge
                  :color="getStateColor(day.state)"
                  variant="soft"
                  size="xs"
                  class="font-black"
                >
                  State {{ day.state }}
                </UBadge>
              </div>
            </td>

            <td class="p-3">
              <div v-if="day.workouts.length" class="space-y-1">
                <div class="flex flex-wrap gap-1">
                  <UBadge
                    v-for="w in day.workouts"
                    :key="w.id"
                    color="neutral"
                    variant="subtle"
                    size="xs"
                    class="max-w-[180px] truncate font-bold"
                  >
                    {{ w.title }}
                  </UBadge>
                </div>
                <div
                  class="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wider text-gray-500"
                >
                  <span v-if="sumDurationSec(day.workouts) > 0"
                    >{{ Math.round(sumDurationSec(day.workouts) / 60) }}m</span
                  >
                  <span v-if="sumTss(day.workouts) > 0"
                    >{{ Math.round(sumTss(day.workouts)) }} TSS</span
                  >
                  <span>{{ day.trainingSourceLabel }}</span>
                </div>
              </div>
              <div
                v-else-if="day.hasWorkoutWindows"
                class="flex items-center gap-1.5 text-xs text-warning-600"
              >
                <UIcon name="i-lucide-alert-triangle" class="size-3" />
                <span>No workout found</span>
              </div>
              <div v-else class="flex items-center gap-1.5 text-xs text-gray-400 italic">
                <UIcon name="i-lucide-coffee" class="size-3" />
                <span>Rest day</span>
              </div>
            </td>

            <td class="p-3">
              <div class="space-y-2">
                <div class="flex flex-wrap items-center gap-1">
                  <button
                    v-for="(win, idx) in day.windows"
                    :key="`${day.date}-${win.type}-${win.label || ''}-${idx}`"
                    type="button"
                    class="group relative"
                    @click.stop="openDayDrawer(day, win)"
                  >
                    <UTooltip :text="windowTooltip(win)">
                      <span
                        class="inline-flex items-center justify-center rounded-full border-2 transition-all"
                        :class="pipClass(win.status)"
                      >
                        <span
                          class="block size-2.5 rounded-full"
                          :class="pipInnerClass(win.status)"
                        />
                      </span>
                    </UTooltip>
                  </button>
                  <UBadge
                    v-if="day.criticalMissingCount > 0"
                    color="warning"
                    variant="soft"
                    size="xs"
                    class="ml-1 font-black"
                  >
                    {{ day.criticalMissingCount }} critical missing
                  </UBadge>
                </div>
                <div v-if="day.keyMeals.length" class="flex flex-wrap gap-1">
                  <UBadge
                    v-for="mealTitle in day.keyMeals"
                    :key="`${day.date}-${mealTitle}`"
                    color="primary"
                    variant="soft"
                    size="xs"
                    class="max-w-[170px] truncate"
                  >
                    {{ mealTitle }}
                  </UBadge>
                </div>
                <p v-else class="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  No meals selected
                </p>
              </div>
            </td>

            <td class="p-3 text-right">
              <p class="text-sm font-black text-gray-900 dark:text-white">
                {{ Math.round(day.totalCarbs) }}g
              </p>
              <p class="text-[9px] font-bold uppercase tracking-tighter text-gray-400">
                {{ Math.round(day.plannedCarbs) }}g planned
              </p>
              <UProgress
                :model-value="targetProgress(day)"
                size="xs"
                :color="day.criticalMissingCount > 0 ? 'warning' : 'primary'"
                class="mt-1"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </UCard>

  <USlideover v-model:open="drawerOpen" side="right" :title="drawerTitle">
    <template #content>
      <div v-if="activeDay" class="space-y-4 p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-[10px] font-black uppercase tracking-widest text-gray-500">
              Fueling Script
            </p>
            <p class="text-lg font-black">{{ format(parseISO(activeDay.date), 'EEEE, MMM d') }}</p>
          </div>
          <UBadge
            :color="getStateColor(activeDay.state)"
            variant="soft"
            size="sm"
            class="font-black"
          >
            State {{ activeDay.state }}
          </UBadge>
        </div>

        <div class="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
          <p class="mb-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
            Training
          </p>
          <div v-if="activeDay.workouts.length" class="space-y-2">
            <div
              v-for="workout in activeDay.workouts"
              :key="workout.id"
              class="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800/50"
            >
              <p class="max-w-[220px] truncate text-sm font-bold">{{ workout.title }}</p>
              <p class="text-xs text-gray-500">
                <span v-if="workout.durationSec">{{ Math.round(workout.durationSec / 60) }}m</span>
                <span v-if="workout.tss" class="ml-2">{{ Math.round(workout.tss) }} TSS</span>
              </p>
            </div>
          </div>
          <p v-else-if="activeDay.hasWorkoutWindows" class="text-sm text-warning-600">
            No workout found for this day.
          </p>
          <p v-else class="text-sm text-gray-500">Rest day with baseline fueling windows.</p>
        </div>

        <div class="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
          <div class="mb-3 flex items-center justify-between">
            <p class="text-[10px] font-black uppercase tracking-widest text-gray-500">Windows</p>
            <UBadge
              v-if="activeDay.criticalMissingCount > 0"
              color="warning"
              variant="soft"
              size="xs"
            >
              {{ activeDay.criticalMissingCount }} critical missing
            </UBadge>
          </div>

          <div class="space-y-2">
            <div
              v-for="(win, idx) in activeDay.windows"
              :key="`${activeDay.date}-${win.type}-${win.label || ''}-${idx}`"
              class="rounded-lg border border-gray-200 p-2 dark:border-gray-800"
              :class="{ 'ring-2 ring-primary-300': selectedWindowKey === windowKey(win, idx) }"
            >
              <div class="flex items-center justify-between gap-2">
                <div>
                  <p class="text-sm font-bold">{{ formatWindowLabel(win) }}</p>
                  <p class="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    {{ win.targetCarbs }}g C / {{ win.targetProtein }}g P /
                    {{ win.targetKcal }} kcal
                  </p>
                </div>
                <UBadge :color="statusBadgeColor(win.status)" variant="soft" size="xs">
                  {{ statusLabel(win.status) }}
                </UBadge>
              </div>
              <div v-if="win.mealTitle" class="mt-1">
                <p class="text-xs text-gray-700 dark:text-gray-300">{{ win.mealTitle }}</p>
                <UButton
                  v-if="hasMealDetails(win)"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  class="mt-1"
                  :icon="isMealExpanded(win, idx) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                  @click="toggleMealDetails(win, idx)"
                >
                  {{ isMealExpanded(win, idx) ? 'Hide meal details' : 'View meal details' }}
                </UButton>
                <div
                  v-if="hasMealDetails(win) && isMealExpanded(win, idx)"
                  class="mt-2 rounded-md border border-gray-200 bg-gray-50 p-2 dark:border-gray-800 dark:bg-gray-900/40"
                >
                  <div
                    class="grid grid-cols-3 gap-2 text-[10px] font-bold uppercase tracking-wider text-gray-500"
                  >
                    <span>{{ Number(win.meal?.totals?.carbs || 0) }}g carbs</span>
                    <span>{{ Number(win.meal?.totals?.protein || 0) }}g protein</span>
                    <span>{{ Number(win.meal?.totals?.kcal || 0) }} kcal</span>
                  </div>
                  <p
                    v-if="Number(win.meal?.prepMinutes || 0) > 0 || win.meal?.absorptionType"
                    class="mt-1 text-[10px] text-gray-500"
                  >
                    {{ win.meal?.absorptionType || 'Balanced' }} absorption
                    <span v-if="Number(win.meal?.prepMinutes || 0) > 0">
                      • {{ Number(win.meal?.prepMinutes || 0) }}m prep</span
                    >
                  </p>
                  <div
                    v-if="Array.isArray(win.meal?.ingredients) && win.meal.ingredients.length"
                    class="mt-2"
                  >
                    <p class="text-[10px] font-black uppercase tracking-widest text-gray-500">
                      Ingredients
                    </p>
                    <div class="mt-1 flex flex-wrap gap-1">
                      <UBadge
                        v-for="ingredient in win.meal.ingredients"
                        :key="`${ingredient.item}-${ingredient.quantity}-${ingredient.unit}`"
                        size="xs"
                        color="neutral"
                        variant="subtle"
                      >
                        {{ ingredient.quantity }}{{ ingredient.unit }} {{ ingredient.item }}
                      </UBadge>
                    </div>
                  </div>
                  <p v-if="win.meal?.reasoning" class="mt-2 text-[10px] italic text-gray-500">
                    {{ win.meal.reasoning }}
                  </p>
                </div>
              </div>
              <div v-else class="mt-1 flex justify-end">
                <UButton
                  size="xs"
                  variant="ghost"
                  color="primary"
                  @click="emitSuggestWindow(activeDay.date, win)"
                >
                  Suggest meal
                </UButton>
              </div>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton
            size="sm"
            color="primary"
            icon="i-lucide-sparkles"
            @click="emit('generate-draft')"
          >
            Regenerate Missing
          </UButton>
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            icon="i-lucide-shopping-cart"
            @click="emit('open-grocery')"
          >
            Grocery List
          </UButton>
          <UButton
            size="sm"
            color="neutral"
            variant="ghost"
            icon="i-lucide-external-link"
            :to="`/nutrition/${activeDay.date}`"
          >
            Open Day Planner
          </UButton>
        </div>
      </div>
    </template>
  </USlideover>
</template>

<script setup lang="ts">
  import { addDays, format, parseISO } from 'date-fns'

  interface DayWorkout {
    id: string
    title: string
    durationSec?: number | null
    tss?: number | null
    source?: string
  }

  type WindowStatus = 'target' | 'planned' | 'logged'

  interface FuelWindow {
    type: string
    label?: string
    slotName?: string
    targetCarbs: number
    targetProtein: number
    targetKcal: number
    mealTitle: string
    meal?: any | null
    status: WindowStatus
  }

  interface PlanDay {
    date: string
    workouts: DayWorkout[]
    trainingSourceLabel: string
    windows: FuelWindow[]
    totalCarbs: number
    plannedCarbs: number
    state: number
    keyMeals: string[]
    hasWorkoutWindows: boolean
    criticalMissingCount: number
  }

  const props = defineProps<{
    startDate: string
    endDate: string
    generating?: boolean
  }>()

  const emit = defineEmits<{
    (e: 'generate-draft' | 'open-grocery'): void
    (e: 'suggest-window', window: any): void
  }>()

  const loading = ref(false)
  const plan = ref<any>(null)
  const workoutsByDate = ref<Record<string, DayWorkout[]>>({})
  const drawerOpen = ref(false)
  const activeDay = ref<PlanDay | null>(null)
  const selectedWindowKey = ref('')
  const expandedMealKeys = ref<string[]>([])

  function toDailyBaseKey(slotName?: string) {
    const normalized = (slotName || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
    return normalized ? `DAILY_BASE:${normalized}` : 'DAILY_BASE'
  }

  function getSlotNameFromWindow(window: any) {
    return window?.slotName || window?.label || (window?.type === 'DAILY_BASE' ? 'Meal' : '')
  }

  function matchesMealToWindow(meal: any, window: any) {
    if (!meal || !window) return false
    if (window.type !== 'DAILY_BASE') return meal.windowType === window.type
    if (meal.windowType === 'DAILY_BASE') return true
    if (!String(meal.windowType || '').startsWith('DAILY_BASE:')) return false
    return meal.windowType === toDailyBaseKey(getSlotNameFromWindow(window))
  }

  function toDateKey(value: unknown) {
    if (!value) return ''
    if (typeof value === 'string') {
      if (value.length >= 10) return value.slice(0, 10)
      return ''
    }
    const parsed = new Date(value as any)
    if (Number.isNaN(parsed.getTime())) return ''
    return format(parsed, 'yyyy-MM-dd')
  }

  function isLoggedMeal(meal: any) {
    return Boolean(
      meal?.mealJson?.isLogged ||
      meal?.mealJson?.loggedAt ||
      meal?.mealJson?.completedAt ||
      meal?.status === 'COMPLETED'
    )
  }

  function windowOrder(type: string) {
    const normalized = String(type || '').toUpperCase()
    if (normalized.startsWith('DAILY_BASE')) return 10
    if (normalized === 'PRE_WORKOUT') return 20
    if (normalized === 'INTRA_WORKOUT') return 30
    if (normalized === 'POST_WORKOUT') return 40
    if (normalized === 'REFILL') return 50
    return 60
  }

  function normalizeWindowLabel(window: any) {
    const raw = String(window.label || window.slotName || window.type || 'Window')
    return raw.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
  }

  function toWindowStatus(locked: boolean, logged: boolean): WindowStatus {
    if (logged) return 'logged'
    if (locked) return 'planned'
    return 'target'
  }

  function isWorkoutWindow(type: string) {
    const normalized = String(type || '').toUpperCase()
    return (
      normalized === 'PRE_WORKOUT' ||
      normalized === 'INTRA_WORKOUT' ||
      normalized === 'POST_WORKOUT'
    )
  }

  function getFuelState(totalCarbs: number) {
    if (totalCarbs >= 360) return 3
    if (totalCarbs >= 220) return 2
    return 1
  }

  async function fetchPlan() {
    loading.value = true
    try {
      const [planData, workoutsData] = await Promise.all([
        $fetch<any>('/api/nutrition/plan', {
          query: {
            start: props.startDate,
            end: props.endDate
          }
        }),
        $fetch<any>('/api/workouts/planned/range', {
          query: {
            start: props.startDate,
            end: props.endDate
          }
        })
      ])

      plan.value = planData

      const mappedWorkouts = (workoutsData?.workouts || []).reduce(
        (acc: Record<string, DayWorkout[]>, workout: any) => {
          const dateKey = toDateKey(workout.date)
          if (!dateKey) return acc
          if (!acc[dateKey]) acc[dateKey] = []
          acc[dateKey].push({
            id: workout.id,
            title: workout.title,
            durationSec: workout.durationSec,
            tss: workout.tss,
            source: workout.source
          })
          return acc
        },
        {}
      )
      workoutsByDate.value = mappedWorkouts
    } catch (e) {
      console.error('Failed to fetch weekly nutrition dashboard data:', e)
    } finally {
      loading.value = false
    }
  }

  const planDays = computed<PlanDay[]>(() => {
    const days: PlanDay[] = []
    let current = parseISO(props.startDate)
    const end = parseISO(props.endDate)

    while (current <= end) {
      const dateKey = format(current, 'yyyy-MM-dd')
      const daySummary = plan.value?.summaryJson?.days?.find((d: any) => d.date === dateKey)
      const dayMeals =
        plan.value?.meals?.filter((meal: any) => toDateKey(meal.date) === dateKey) || []

      const fallbackWindows: FuelWindow[] = dayMeals.map((meal: any) => {
        const mealJson = meal.mealJson || {}
        const totals = mealJson.totals || {}
        const slotName = String(meal.windowType || '').startsWith('DAILY_BASE:')
          ? String(meal.windowType).split(':')[1]?.replace(/-/g, ' ')
          : ''
        const logged = isLoggedMeal(meal)

        return {
          type: meal.windowType,
          slotName,
          label: slotName || meal.windowType,
          targetCarbs: Number(totals.carbs || 0),
          targetProtein: Number(totals.protein || 0),
          targetKcal: Number(totals.kcal || 0),
          mealTitle: mealJson.title || '',
          meal: mealJson || null,
          status: toWindowStatus(true, logged)
        }
      })

      const summaryWindowsRaw = daySummary?.fuelingPlan?.windows
      const summaryWindows: FuelWindow[] = Array.isArray(summaryWindowsRaw)
        ? summaryWindowsRaw.map((window: any) => {
            const matchingMeal = dayMeals.find((meal: any) => matchesMealToWindow(meal, window))
            const mealJson = matchingMeal?.mealJson || {}
            const totals = mealJson.totals || {}
            const locked = Boolean(matchingMeal)
            const logged = isLoggedMeal(matchingMeal)

            return {
              type: window.type,
              label: window.label,
              slotName: window.slotName,
              targetCarbs: Number(window.targetCarbs ?? totals.carbs ?? 0),
              targetProtein: Number(window.targetProtein ?? totals.protein ?? 0),
              targetKcal: Number(window.targetKcal ?? totals.kcal ?? 0),
              mealTitle: mealJson.title || '',
              meal: mealJson || null,
              status: toWindowStatus(locked, logged)
            }
          })
        : []

      const baseWindows = summaryWindows.length > 0 ? summaryWindows : fallbackWindows

      const unmatchedLockedMeals = dayMeals.filter(
        (meal: any) => !baseWindows.some((window: FuelWindow) => matchesMealToWindow(meal, window))
      )

      const appendedLockedWindows: FuelWindow[] = unmatchedLockedMeals.map((meal: any) => {
        const mealJson = meal.mealJson || {}
        const totals = mealJson.totals || {}
        const windowType = String(meal.windowType || '')
        const slotLabel = windowType.startsWith('DAILY_BASE:')
          ? windowType.split(':')[1]?.replace(/-/g, ' ')
          : windowType.toLowerCase().replace(/_/g, ' ')

        return {
          type: windowType,
          label: slotLabel,
          targetCarbs: Number(totals.carbs || 0),
          targetProtein: Number(totals.protein || 0),
          targetKcal: Number(totals.kcal || 0),
          mealTitle: mealJson.title || '',
          meal: mealJson || null,
          status: toWindowStatus(true, isLoggedMeal(meal))
        }
      })

      const windows = [...baseWindows, ...appendedLockedWindows].sort(
        (a, b) => windowOrder(a.type) - windowOrder(b.type)
      )

      const workoutsFromRange = workoutsByDate.value[dateKey] || []
      const workoutsFromSummary = daySummary?.fuelingPlan?.workouts || []
      const workouts: DayWorkout[] = workoutsFromRange.length
        ? workoutsFromRange
        : workoutsFromSummary.map((workout: any, index: number) => ({
            id: String(workout.id || `${dateKey}-${index}`),
            title: String(workout.title || workout.type || 'Workout'),
            durationSec: workout.durationSec || workout.duration || null,
            tss: workout.tss || null,
            source: 'summary'
          }))

      const totalCarbsTarget =
        typeof daySummary?.targets?.carbs === 'number' && daySummary.targets.carbs > 0
          ? daySummary.targets.carbs
          : windows.reduce((sum, window) => sum + Number(window.targetCarbs || 0), 0)

      const plannedCarbs = windows
        .filter((window) => window.status !== 'target')
        .reduce((sum, window) => sum + Number(window.targetCarbs || 0), 0)

      const hasWorkoutWindows = windows.some(
        (window) => isWorkoutWindow(window.type) && Number(window.targetCarbs || 0) > 0
      )

      const criticalMissingCount = windows.filter(
        (window) =>
          isWorkoutWindow(window.type) &&
          window.status === 'target' &&
          Number(window.targetCarbs || 0) > 0
      ).length

      const keyMeals = windows
        .filter((window) => window.mealTitle)
        .map((window) => window.mealTitle)
        .slice(0, 2)

      const trainingSourceLabel = workoutsFromRange.length
        ? 'Intervals synced'
        : workoutsFromSummary.length
          ? 'Plan fallback'
          : hasWorkoutWindows
            ? 'Missing sync'
            : 'Rest'

      days.push({
        date: dateKey,
        workouts,
        trainingSourceLabel,
        windows,
        totalCarbs: Number(totalCarbsTarget || 0),
        plannedCarbs: Number(plannedCarbs || 0),
        state: getFuelState(Number(totalCarbsTarget || 0)),
        keyMeals,
        hasWorkoutWindows,
        criticalMissingCount
      })

      current = addDays(current, 1)
    }

    return days
  })

  const weeklyStats = computed(() => {
    const daysComplete = planDays.value.filter((day) => day.criticalMissingCount === 0).length
    const daysWithGaps = planDays.value.filter((day) => day.criticalMissingCount > 0).length
    const targetCarbs = Math.round(planDays.value.reduce((sum, day) => sum + day.totalCarbs, 0))
    const plannedCarbs = Math.round(planDays.value.reduce((sum, day) => sum + day.plannedCarbs, 0))

    return {
      daysComplete,
      daysWithGaps,
      targetCarbs,
      plannedCarbs
    }
  })

  const planSyncAgeLabel = computed(() => {
    if (!plan.value?.updatedAt) return 'unknown'
    const updatedAt = new Date(plan.value.updatedAt)
    if (Number.isNaN(updatedAt.getTime())) return 'unknown'

    const ageMs = Date.now() - updatedAt.getTime()
    const ageMinutes = Math.floor(ageMs / (60 * 1000))
    if (ageMinutes < 60) return `${ageMinutes}m`
    const ageHours = Math.floor(ageMinutes / 60)
    if (ageHours < 24) return `${ageHours}h`
    return `${Math.floor(ageHours / 24)}d`
  })

  const drawerTitle = computed(() => {
    if (!activeDay.value) return 'Day Details'
    return `Plan Details · ${format(parseISO(activeDay.value.date), 'MMM d')}`
  })

  function getStateColor(state: number) {
    if (state >= 3) return 'error'
    if (state === 2) return 'warning'
    return 'primary'
  }

  function pipClass(status: WindowStatus) {
    if (status === 'logged')
      return 'size-4 border-success-600 bg-success-100 dark:bg-success-900/30'
    if (status === 'planned')
      return 'size-4 border-primary-600 bg-primary-100 dark:bg-primary-900/40'
    return 'size-4 border-gray-300 bg-transparent dark:border-gray-600'
  }

  function pipInnerClass(status: WindowStatus) {
    if (status === 'logged') return 'bg-success-600'
    if (status === 'planned') return 'bg-primary-600'
    return 'bg-transparent'
  }

  function statusBadgeColor(status: WindowStatus) {
    if (status === 'logged') return 'success'
    if (status === 'planned') return 'primary'
    return 'neutral'
  }

  function statusLabel(status: WindowStatus) {
    if (status === 'logged') return 'Logged'
    if (status === 'planned') return 'Planned'
    return 'Target only'
  }

  function formatWindowLabel(window: FuelWindow) {
    return normalizeWindowLabel(window)
  }

  function windowTooltip(window: FuelWindow) {
    const label = formatWindowLabel(window)
    const status = statusLabel(window.status)
    const meal = window.mealTitle ? ` • ${window.mealTitle}` : ''
    return `${label} • ${status} • ${window.targetCarbs}g${meal}`
  }

  function targetProgress(day: PlanDay) {
    if (!day.totalCarbs) return 0
    return Math.min(100, Math.round((day.plannedCarbs / day.totalCarbs) * 100))
  }

  function sumDurationSec(workouts: DayWorkout[]) {
    return workouts.reduce((sum, workout) => sum + Number(workout.durationSec || 0), 0)
  }

  function sumTss(workouts: DayWorkout[]) {
    return workouts.reduce((sum, workout) => sum + Number(workout.tss || 0), 0)
  }

  function windowKey(window: FuelWindow, index: number) {
    return `${window.type}:${window.label || ''}:${index}`
  }

  function hasMealDetails(window: FuelWindow) {
    return Boolean(
      window.meal &&
      ((Array.isArray(window.meal.ingredients) && window.meal.ingredients.length > 0) ||
        window.meal.reasoning ||
        window.meal.absorptionType ||
        Number(window.meal.prepMinutes || 0) > 0)
    )
  }

  function isMealExpanded(window: FuelWindow, index: number) {
    return expandedMealKeys.value.includes(windowKey(window, index))
  }

  function toggleMealDetails(window: FuelWindow, index: number) {
    const key = windowKey(window, index)
    if (expandedMealKeys.value.includes(key)) {
      expandedMealKeys.value = expandedMealKeys.value.filter((value) => value !== key)
      return
    }
    expandedMealKeys.value.push(key)
  }

  function openDayDrawer(day: PlanDay, window?: FuelWindow) {
    activeDay.value = day
    expandedMealKeys.value = []
    if (window) {
      const idx = day.windows.findIndex(
        (candidate) =>
          candidate.type === window.type &&
          String(candidate.label || '') === String(window.label || '') &&
          String(candidate.mealTitle || '') === String(window.mealTitle || '')
      )
      selectedWindowKey.value = windowKey(window, Math.max(idx, 0))
    } else {
      selectedWindowKey.value = ''
    }
    drawerOpen.value = true
  }

  function emitSuggestWindow(date: string, window: FuelWindow) {
    emit('suggest-window', {
      date,
      dateKey: date,
      targetCarbs: window.targetCarbs,
      targetProtein: window.targetProtein,
      targetKcal: window.targetKcal,
      type: window.type,
      slotName: window.slotName || window.label || ''
    })
  }

  function refresh() {
    fetchPlan()
  }

  onMounted(() => {
    fetchPlan()
  })

  defineExpose({ refresh })
</script>
