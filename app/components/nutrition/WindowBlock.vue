<template>
  <div
    v-bind="attrs"
    class="relative pl-8 pb-10 border-l-2 border-gray-100 dark:border-gray-800 last:border-0 last:pb-0"
  >
    <!-- Timeline Icon -->
    <div
      class="absolute left-[-11px] top-0 w-5 h-5 rounded-full border-2 bg-white dark:bg-gray-900 z-10 flex items-center justify-center shadow-sm"
      :class="statusBorderClass"
    >
      <UIcon :name="windowIcon" class="w-3 h-3" :class="statusTextClass" />
    </div>

    <!-- Content Card -->
    <div class="space-y-4">
      <!-- Window Header -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-xs font-black uppercase tracking-widest text-gray-900 dark:text-white">
              {{ title }}
            </h3>
            <div v-if="!isLocked" class="flex items-center gap-1 ml-1">
              <UButton
                icon="i-heroicons-plus-circle"
                variant="ghost"
                color="neutral"
                size="xs"
                class="opacity-40 hover:opacity-100 transition-opacity"
                @click="
                  () => {
                    void $emit('add', { type, meals })
                  }
                "
              />
              <UButton
                icon="i-heroicons-sparkles"
                variant="ghost"
                color="primary"
                size="xs"
                class="opacity-40 hover:opacity-100 transition-opacity"
                @click="
                  () => {
                    void $emit('addAi', { type, meals })
                  }
                "
              />
            </div>
          </div>
          <p class="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
            {{ formatWindowDateTimeRange(startTime, endTime) }}
          </p>
        </div>

        <!-- Targets Chips -->
        <div class="flex flex-wrap gap-2">
          <button
            v-if="targetCarbs > 0"
            type="button"
            class="flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-colors"
            :class="carbChipClass"
            title="Explain this carb target"
            @click="
              () => {
                showCarbExplainModal = true
              }
            "
          >
            <UIcon name="i-tabler-bread" class="w-3.5 h-3.5" :class="carbChipTextClass" />
            <span class="text-xs font-black" :class="carbChipTextClass">
              {{ Math.round(actualCarbs) }}/{{ Math.round(targetCarbs) }}g
            </span>
            <UIcon
              v-if="compliance === 'HIT'"
              name="i-heroicons-check-circle"
              class="w-3.5 h-3.5 text-green-500"
            />
            <UIcon
              v-else-if="compliance === 'PARTIAL'"
              name="i-heroicons-clock"
              class="w-3.5 h-3.5 text-amber-500"
            />
          </button>
          <div
            v-if="targetProtein > 0"
            class="flex items-center gap-1.5 px-2 py-1 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-900/50"
          >
            <UIcon name="i-tabler-egg" class="w-3.5 h-3.5 text-blue-500" />
            <span class="text-xs font-black text-blue-700 dark:text-blue-400"
              >{{ formatMacro(targetProtein) }}g</span
            >
          </div>

          <!-- Supplement Pips -->
          <div
            v-if="chartSettings.showSupplements && supplements?.length"
            class="flex gap-1 ml-1 border-l border-gray-200 dark:border-gray-700 pl-2"
          >
            <UTooltip v-for="supp in supplements" :key="supp" :text="supp">
              <div
                class="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center border border-purple-200 dark:border-purple-800"
              >
                <UIcon
                  :name="getSupplementIcon(supp)"
                  class="w-3.5 h-3.5 text-purple-600 dark:text-purple-400"
                />
              </div>
            </UTooltip>
          </div>
        </div>
      </div>

      <!-- Hydration Card (Intra-Workout Only) -->

      <div
        v-if="
          !chartSettings.hideHydration && type === 'INTRA_WORKOUT' && (targetFluid || targetSodium)
        "
        class="space-y-3"
      >
        <!-- Fueling Script (Hide if target hit or 2+ hours past) -->

        <div
          v-if="
            targetCarbs > 0 &&
            compliance !== 'HIT' &&
            !(chartSettings.hidePastSuggestions && isPastWindow)
          "
          class="bg-amber-50 dark:bg-amber-950/20 rounded-xl p-4 border border-amber-100 dark:border-amber-900/50"
        >
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <UIcon
                name="i-heroicons-document-text"
                class="w-4 h-4 text-amber-600 dark:text-amber-400"
              />

              <span
                class="text-[10px] font-black uppercase text-amber-600 dark:text-amber-400 tracking-widest"
                >Intra-Workout Script</span
              >
            </div>

            <UBadge
              v-if="strategyLabel"
              variant="soft"
              color="warning"
              size="xs"
              class="font-black text-[8px] uppercase"
              :class="{ 'animate-pulse': fuelState === 3 }"
            >
              {{ strategyLabel }}
            </UBadge>
          </div>

          <p class="text-xs font-bold text-amber-800 dark:text-amber-200">
            Target:
            {{ Math.round(targetCarbs / (Math.abs(end.getTime() - start.getTime()) / 3600000)) }}g
            carbs per hour.

            <span class="font-normal opacity-80">({{ getGelCountLabel(targetCarbs) }})</span>
          </p>

          <!-- Fueling Checklist -->
          <div
            v-if="intraScriptItems.length > 0"
            class="mt-4 space-y-3 border-t border-amber-200/50 dark:border-amber-800/30 pt-4"
          >
            <div
              v-for="item in intraScriptItems"
              :key="item.time"
              class="flex items-center gap-3 p-2 rounded-lg bg-white/50 dark:bg-black/20 border border-amber-200/30 dark:border-amber-800/30 shadow-sm"
            >
              <UCheckbox
                :label="item.label"
                color="primary"
                :ui="{
                  label:
                    'text-[11px] font-black text-amber-900 dark:text-amber-100 uppercase tracking-tight',
                  container: 'flex items-center gap-2'
                }"
              />
              <div
                class="ml-auto text-[10px] font-black px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-400"
              >
                {{ item.time }}
              </div>
            </div>
          </div>
        </div>

        <div
          class="bg-blue-50/50 dark:bg-blue-900/10 rounded-xl p-4 border border-blue-100/50 dark:border-blue-900/30"
        >
          <div class="flex items-center gap-2 mb-3">
            <UIcon name="i-heroicons-beaker" class="w-4 h-4 text-blue-500" />

            <span class="text-[10px] font-black uppercase text-blue-600 tracking-widest"
              >Hydration & Electrolytes</span
            >
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="flex items-center gap-3">
              <div
                class="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center"
              >
                <UIcon name="i-tabler-droplet" class="w-5 h-5 text-blue-500" />
              </div>

              <div>
                <div class="text-[10px] font-bold text-gray-400 uppercase">Fluid Target</div>

                <div class="text-sm font-black text-gray-900 dark:text-white">
                  {{ (targetFluid || 0) / 1000 }}L
                </div>
              </div>
            </div>

            <div class="flex items-center gap-3">
              <div
                class="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center"
              >
                <UIcon name="i-tabler-grain" class="w-5 h-5 text-blue-500" />
              </div>

              <div>
                <div class="text-[10px] font-bold text-gray-400 uppercase">Sodium Target</div>

                <div class="text-sm font-black text-gray-900 dark:text-white">
                  {{ targetSodium }}mg
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- AI Recommendations Tool (If empty and not locked) -->
      <div
        v-if="
          items.length === 0 &&
          !isLocked &&
          type !== 'DAILY_BASE' &&
          compliance !== 'HIT' &&
          !(chartSettings.hidePastSuggestions && isPastWindow)
        "
        class="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-dashed border-gray-200 dark:border-gray-700"
      >
        <div class="flex items-center gap-2 mb-2">
          <UIcon name="i-heroicons-sparkles" class="w-4 h-4 text-primary-500" />
          <span class="text-[10px] font-bold uppercase text-gray-500 tracking-wider"
            >Coach Suggests</span
          >
        </div>
        <p class="text-xs text-gray-600 dark:text-gray-400 italic leading-relaxed">
          {{ recommendationText }}
        </p>
      </div>

      <!-- Logged Items -->
      <div v-if="mealGroupedItems.length > 0" class="space-y-6">
        <div v-for="group in mealGroupedItems" :key="group.meal" class="space-y-2">
          <!-- Meal Sub-heading (Always show if scheduled or window covers multiple meals) -->
          <div
            v-if="group.isScheduled || canShowMealSubheadings"
            class="flex items-center gap-2 mb-3"
          >
            <div class="h-px flex-1 bg-gray-100 dark:bg-gray-800" />
            <span class="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 italic">
              {{ group.label }}
            </span>
            <div class="h-px flex-1 bg-gray-100 dark:bg-gray-800" />
          </div>

          <div v-if="group.items.length > 0" class="space-y-2">
            <div
              v-for="(item, idx) in group.items"
              :key="item.id || `${group.meal}-item-${idx}`"
              class="group flex flex-col gap-1 p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm"
              :class="{
                'cursor-pointer hover:border-primary-200 dark:hover:border-primary-900/50':
                  !isLocked
              }"
              :role="!isLocked ? 'button' : undefined"
              :tabindex="!isLocked ? 0 : undefined"
              @click="
                () => {
                  void handleItemEdit(item)
                }
              "
              @keydown.enter.prevent="handleItemEdit(item)"
              @keydown.space.prevent="handleItemEdit(item)"
            >
              <!-- Row 1: Title and Actions -->
              <div class="flex items-center justify-between gap-4">
                <div class="text-sm font-bold text-gray-900 dark:text-white min-w-0 flex-1">
                  <span class="truncate block">{{ item.name || item.product_name }}</span>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <UBadge
                    v-if="item.absorptionType"
                    :color="getAbsorptionColor(item.absorptionType)"
                    variant="subtle"
                    size="xs"
                    class="text-[8px] font-black uppercase px-1 py-0 leading-none"
                  >
                    {{ item.absorptionType }}
                  </UBadge>
                  <UButton
                    v-if="!isLocked"
                    icon="i-heroicons-pencil-square"
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    class="opacity-0 group-hover:opacity-100 transition-opacity -my-1"
                    @click.stop="handleItemEdit(item)"
                  />
                </div>
              </div>

              <!-- Row 2: Secondary Info and Macros -->
              <div class="flex items-center justify-between gap-2">
                <div
                  class="text-[10px] text-gray-500 font-medium uppercase flex items-center gap-1.5 min-w-0"
                >
                  <span v-if="getItemTime(item)" class="text-primary-500 font-bold shrink-0">{{
                    getItemTime(item)
                  }}</span>
                  <span v-if="getItemTime(item)" class="shrink-0">•</span>
                  <span class="truncate"
                    >{{ item.amount }}{{ item.unit || 'g' }} •
                    {{ formatKcal(item.calories) }} kcal</span
                  >
                </div>

                <div class="flex items-center gap-3 shrink-0">
                  <span
                    class="text-[10px] font-black text-yellow-600 dark:text-yellow-400 whitespace-nowrap"
                  >
                    {{ formatMacro(item.carbs)
                    }}<span class="text-[8px] ml-0.5 opacity-80 font-bold">g C</span>
                  </span>
                  <span
                    class="text-[10px] font-black text-blue-600 dark:text-blue-400 whitespace-nowrap"
                  >
                    {{ formatMacro(item.protein)
                    }}<span class="text-[8px] ml-0.5 opacity-80 font-bold">g P</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <UModal
    v-model:open="showCarbExplainModal"
    :ui="{
      content: 'sm:max-w-md z-[9999]',
      overlay: 'z-[9998]'
    }"
    title="Carbohydrate Target Details"
    description="Explanation of your carbohydrate targets and current compliance status for this fueling window."
  >
    <template #content>
      <div class="p-6 space-y-5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UIcon name="i-tabler-bread" class="w-5 h-5 text-yellow-500" />
            <h3 class="text-base font-black uppercase tracking-tight text-gray-900 dark:text-white">
              Carb Target Breakdown
            </h3>
          </div>
          <span class="text-lg font-black text-yellow-600 dark:text-yellow-400">
            {{ Math.round(targetCarbs) }}g
          </span>
        </div>

        <div
          class="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800 space-y-2"
        >
          <div class="flex items-center justify-between text-sm">
            <span class="text-gray-500">Window target</span>
            <span class="font-black text-gray-900 dark:text-white"
              >{{ Math.round(targetCarbs) }}g</span
            >
          </div>
          <div class="flex items-center justify-between text-sm">
            <span class="text-gray-500">Logged in this window</span>
            <span class="font-black text-gray-900 dark:text-white"
              >{{ Math.round(actualCarbs) }}g</span
            >
          </div>
          <div class="flex items-center justify-between text-sm">
            <span class="text-gray-500">Remaining for this window</span>
            <span class="font-black text-gray-900 dark:text-white"
              >{{ Math.round(windowRemainingCarbs) }}g</span
            >
          </div>
          <div class="flex items-center justify-between text-sm">
            <span class="text-gray-500">Status</span>
            <span
              class="font-black uppercase text-xs"
              :class="
                compliance === 'HIT'
                  ? 'text-green-600 dark:text-green-400'
                  : compliance === 'PARTIAL'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-gray-500'
              "
            >
              {{ compliance }}
            </span>
          </div>
        </div>

        <div
          v-if="type === 'INTRA_WORKOUT'"
          class="bg-primary-50 dark:bg-primary-950/20 p-4 rounded-xl border border-primary-100 dark:border-primary-900"
        >
          <p
            class="text-xs font-bold uppercase tracking-widest text-primary-700 dark:text-primary-300 mb-1"
          >
            Why this number
          </p>
          <p class="text-sm text-primary-700 dark:text-primary-300 leading-relaxed">
            This intra target is set from workout duration and intensity to keep energy stable
            during the session.
          </p>
        </div>

        <div
          class="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800"
        >
          <p class="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Important</p>
          <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Window targets are timing goals. Daily macro totals are tracked separately on the day
            summary.
          </p>
        </div>

        <UButton
          block
          color="neutral"
          variant="soft"
          @click="
            () => {
              showCarbExplainModal = false
            }
          "
        >
          Close
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
  import { computed, ref, useAttrs } from 'vue'
  import { fuelingSuggestionText } from '~/utils/nutrition-suggestions'
  import { groupWindowItemsByMeal } from '~/utils/nutrition-meal-groups'

  defineOptions({
    inheritAttrs: false
  })

  const attrs = useAttrs()

  const props = defineProps<{
    type: string
    title: string
    startTime: Date | string
    endTime: Date | string
    targetCarbs: number
    targetProtein: number
    targetFat: number
    targetFluid?: number
    targetSodium?: number
    items: any[]
    supplements?: string[]
    meals?: string[]
    isLocked?: boolean
    fuelState?: number
    settings?: any
    /**
     * The athlete's dietary constraints, so the fallback suggestion cannot name a food they told
     * us they cannot eat. Optional: when absent, the suggestion stays generic rather than guessing.
     */
    dietaryConstraints?: {
      dietaryProfile?: string[]
      foodAllergies?: string[]
      foodIntolerances?: string[]
      lifestyleExclusions?: string[]
    } | null
  }>()

  const chartSettings = computed(() => ({
    hideHydration: false,
    hidePastSuggestions: true,
    showSupplements: true,
    ...props.settings
  }))

  const mealGroupedItems = computed(() =>
    groupWindowItemsByMeal(props.items || [], props.meals || [])
  )

  const canShowMealSubheadings = computed(() => {
    // Only show subheadings if the window covers multiple logical meal types
    // and it's a daily base window (not a workout-specific window which is usually one thing)
    return mealGroupedItems.value.length > 1 || props.type === 'DAILY_BASE'
  })

  const isPastWindow = computed(() => {
    const now = new Date()
    const twoHoursAgo = new Date(now.getTime() - 120 * 60 * 1000)
    return end.value < twoHoursAgo
  })

  const emit = defineEmits(['add', 'addAi', 'edit'])

  function formatMacro(val: number | string | undefined) {
    if (val === undefined || val === null) return 0
    const num = typeof val === 'string' ? parseFloat(val) : val
    if (isNaN(num)) return 0
    return Math.round(num * 10) / 10
  }

  function formatKcal(val: number | string | undefined) {
    if (val === undefined || val === null) return 0
    const num = typeof val === 'string' ? parseFloat(val) : val
    if (isNaN(num)) return 0
    return Math.round(num)
  }

  const start = computed(() => new Date(props.startTime))
  const end = computed(() => new Date(props.endTime))
  const showCarbExplainModal = ref(false)
  const actualCarbs = computed(() => props.items.reduce((sum, item) => sum + (item.carbs || 0), 0))
  const windowRemainingCarbs = computed(() => Math.max(0, props.targetCarbs - actualCarbs.value))
  const carbChipClass = computed(() => {
    if (compliance.value === 'HIT') {
      return 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-900/50'
    }
    if (compliance.value === 'PARTIAL') {
      return 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-900/50'
    }
    return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-100 dark:border-yellow-900/50'
  })
  const carbChipTextClass = computed(() => {
    if (compliance.value === 'HIT') return 'text-green-700 dark:text-green-400'
    if (compliance.value === 'PARTIAL') return 'text-amber-700 dark:text-amber-400'
    return 'text-yellow-700 dark:text-yellow-400'
  })

  const strategyLabel = computed(() => {
    if (props.type !== 'INTRA_WORKOUT') return null
    if (props.fuelState === 3) return 'Gut Training: Active'
    if (props.fuelState === 2) return 'Steady Fueling'
    if (props.fuelState === 1) return 'Low Intensity'
    // Fallback based on carbs if prop not passed
    if (props.targetCarbs >= 80) return 'Gut Training: Active'
    return null
  })

  const intraScriptItems = computed(() => {
    if (props.type !== 'INTRA_WORKOUT' || props.targetCarbs <= 0) return []

    const items = []
    const totalCarbs = props.targetCarbs
    const durationMs = Math.abs(end.value.getTime() - start.value.getTime())
    const durationHours = durationMs / 3600000

    // Heuristic: If we have a target >= 80g (Gut Training), we use the requested script pattern
    if (totalCarbs >= 80 && durationHours >= 1.5) {
      items.push({ time: '0:45', label: '1 Gel (30g Carbs)' })
      items.push({ time: '1:30', label: '500ml Mix (60g Carbs)' })
    } else if (totalCarbs >= 60 && durationHours >= 1) {
      items.push({ time: '0:30', label: '1 Gel (30g Carbs)' })
      items.push({ time: '1:00', label: '1 Gel (30g Carbs)' })
    } else if (totalCarbs >= 30) {
      items.push({ time: '0:45', label: '1 Gel (30g Carbs)' })
    }

    return items
  })

  const formatTime = (date: Date | string) => {
    if (!date) return ''
    const d = typeof date === 'string' ? new Date(date) : date
    if (!(d instanceof Date) || isNaN(d.getTime())) return ''
    const { formatDate } = useFormat()
    return formatDate(d, 'HH:mm')
  }

  const formatWindowDateTimeRange = (startTime: Date | string, endTime: Date | string) => {
    if (!startTime || !endTime) return ''
    const startDate = typeof startTime === 'string' ? new Date(startTime) : startTime
    const endDate = typeof endTime === 'string' ? new Date(endTime) : endTime
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return ''

    const { formatDate } = useFormat()
    const startDay = formatDate(startDate, 'EEE, MMM d')
    const endDay = formatDate(endDate, 'EEE, MMM d')
    const startClock = formatDate(startDate, 'HH:mm')
    const endClock = formatDate(endDate, 'HH:mm')

    if (startDay === endDay) return `${startDay} • ${startClock} — ${endClock}`
    return `${startDay} ${startClock} — ${endDay} ${endClock}`
  }

  const windowIcon = computed(() => {
    switch (props.type) {
      case 'PRE_WORKOUT':
        return 'i-heroicons-sun'
      case 'INTRA_WORKOUT':
        return 'i-heroicons-bolt'
      case 'POST_WORKOUT':
        return 'i-heroicons-sparkles'
      case 'TRANSITION':
        return 'i-heroicons-arrows-right-left'
      default:
        return 'i-heroicons-cake'
    }
  })

  const statusBorderClass = computed(() => {
    if (compliance.value === 'HIT') return 'border-green-500 bg-green-50 dark:bg-green-950'
    if (props.items.length > 0) return 'border-orange-400 bg-orange-50 dark:bg-orange-950'
    return 'border-gray-200 dark:border-gray-700'
  })

  const statusTextClass = computed(() => {
    if (compliance.value === 'HIT') return 'text-green-600 dark:text-green-400'
    if (props.items.length > 0) return 'text-orange-500 dark:text-orange-400'
    return 'text-gray-400'
  })

  const compliance = computed(() => {
    if (props.targetCarbs === 0) return 'NONE'
    if (actualCarbs.value >= props.targetCarbs * 0.8) return 'HIT'
    if (actualCarbs.value > 0) return 'PARTIAL'
    return 'PENDING'
  })

  // Named foods are only suggested when the athlete's constraints are known and none conflict -
  // this is the one nutrition surface that names food without going through the recommendation
  // service, which filters on allergies and dietary profile.
  const recommendationText = computed(() =>
    fuelingSuggestionText(props.targetCarbs, props.dietaryConstraints ?? null)
  )

  function getGelCountLabel(carbs: number) {
    const count = Math.round(carbs / 30)

    if (count <= 0) return 'Water/Electrolytes only'

    if (count === 1) return 'Take ~1 gel'

    return `Take ~${count} gels`
  }

  function getItemTime(item: any) {
    const { getUserDateFromLocal } = useFormat()
    const timeVal = item.logged_at || item.date || item._heuristic_time
    if (!timeVal) return null

    let date: Date
    if (typeof timeVal === 'string' && /^\d{2}:\d{2}$/.test(timeVal)) {
      // Use the nutrition date from context if available, otherwise fallback to today
      const dateStr = (item.date || new Date().toISOString()).split('T')[0]
      date = getUserDateFromLocal(dateStr, `${timeVal}:00`)
    } else {
      // Handle YYYY-MM-DD HH:mm:ss by replacing space with T
      const normalized = typeof timeVal === 'string' ? timeVal.replace(' ', 'T') : timeVal
      date = new Date(normalized)
    }

    if (isNaN(date.getTime())) return null

    // If it's exactly midnight UTC, it might be just a date without time info
    // Only show if we explicitly have a time string or heuristic time
    if (
      date.getUTCHours() === 0 &&
      date.getUTCMinutes() === 0 &&
      !item.logged_at &&
      !item._heuristic_time
    ) {
      return null
    }

    return formatTime(date)
  }

  function getAbsorptionColor(type: string) {
    switch (type) {
      case 'SIMPLE':
        return 'primary'
      case 'INTERMEDIATE':
        return 'warning'
      case 'COMPLEX':
        return 'neutral'
      default:
        return 'neutral'
    }
  }

  function getSupplementIcon(supp: string) {
    const s = supp.toLowerCase()
    if (s.includes('caffeine')) return 'i-tabler-pill'
    if (s.includes('nitrate')) return 'i-tabler-bottle'
    if (s.includes('bicarbonate')) return 'i-tabler-flask'
    return 'i-heroicons-plus-circle'
  }

  function handleItemEdit(item: any) {
    if (props.isLocked) return
    emit('edit', item)
  }
</script>
