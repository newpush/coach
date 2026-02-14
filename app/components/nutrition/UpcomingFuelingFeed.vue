<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between px-4 sm:px-1 pt-4 sm:pt-0">
      <h3
        class="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight flex items-center gap-2"
      >
        <UIcon name="i-lucide-calendar-clock" class="size-4 text-primary-500" />
        Upcoming Plan
      </h3>
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        icon="i-lucide-shopping-cart"
        @click="$emit('export-grocery')"
      >
        <span class="hidden sm:inline">Export to Grocery List</span>
        <span class="sm:hidden">Export</span>
      </UButton>
    </div>

    <div v-if="!windows.length" class="py-12 text-center text-gray-500">
      <UIcon name="i-lucide-calendar-x" class="size-8 mx-auto mb-2 opacity-20" />
      <p class="text-sm italic">No upcoming targets found for the selected period.</p>
    </div>

    <div v-for="day in groupedDays" :key="day.dateKey" class="space-y-2">
      <div class="px-4 sm:px-1">
        <span
          class="inline-flex w-fit rounded-full bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
        >
          {{ formatDay(day.dateKey) }}
        </span>
      </div>

      <div class="sm:hidden space-y-2 px-4">
        <div
          v-for="window in day.windows"
          :id="`window-mobile-${window.dateKey}-${window.type}-${startTimeKey(window.startTime)}`"
          :key="`mobile-${window.dateKey}-${window.type}-${window.startTime}`"
          class="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 p-3 space-y-2"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 space-y-1">
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-bold text-gray-700 dark:text-gray-300">
                  {{ formatTime(window.startTime) }}
                </span>
                <span class="text-[10px] text-gray-400">•</span>
                <span
                  class="text-xs font-black uppercase tracking-tight"
                  :class="getTypeColor(window.type)"
                >
                  {{ window.label }}
                </span>
              </div>
              <div class="flex items-center gap-3 text-[10px] font-bold uppercase">
                <span class="text-primary-600 dark:text-primary-400">
                  {{ window.isLocked ? window.lockedMeal.totals.carbs : window.targetCarbs }}g carbs
                </span>
                <span class="text-gray-600 dark:text-gray-300">
                  {{ window.isLocked ? window.lockedMeal.totals.protein : window.targetProtein }}g
                  prot
                </span>
              </div>
              <p v-if="window.workoutTitle" class="text-[10px] font-medium text-gray-500 truncate">
                ⚓ {{ window.workoutTitle }}
              </p>
              <p
                v-else-if="window.lockedMeal"
                class="text-[10px] font-bold text-success-600 dark:text-success-400 truncate"
              >
                🍴 {{ window.lockedMeal.title }}
              </p>
            </div>
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              :icon="window.isLocked ? 'i-lucide-pencil' : 'i-lucide-sparkles'"
              @click="emitSuggestion(day, window)"
            />
          </div>

          <p
            v-if="window.isLocked && hasLockedAdvice(window)"
            class="text-xs text-gray-600 dark:text-gray-400 leading-relaxed"
          >
            {{ formatLockedAdvice(window) }}
          </p>
          <p v-else class="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
            {{ window.advice }}
          </p>
        </div>

        <div
          class="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/40 p-3"
        >
          <div class="text-[10px] font-black uppercase tracking-wide text-gray-600">
            Daily Total
          </div>
          <div class="mt-1 flex items-center gap-2">
            <span class="text-xs font-black text-primary-700 dark:text-primary-300"
              >{{ day.totalCarbs }}g carbs</span
            >
            <span class="text-[10px] text-gray-400">•</span>
            <span class="text-xs font-bold text-gray-700 dark:text-gray-300"
              >{{ day.totalProtein }}g protein</span
            >
          </div>
          <div class="mt-1 text-[10px] text-gray-500">
            {{ day.windows.length }} windows • {{ day.plannedCarbs }}g planned •
            {{ Math.max(0, day.totalCarbs - day.plannedCarbs) }}g remaining
          </div>
        </div>
      </div>

      <div
        class="hidden sm:block overflow-x-auto border-y sm:border border-gray-200 dark:border-gray-800 sm:rounded-xl bg-white dark:bg-gray-900/50"
      >
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead class="bg-gray-50 dark:bg-gray-800/50">
            <tr>
              <th
                scope="col"
                class="px-4 py-3 text-left text-[10px] font-black uppercase text-gray-500 tracking-widest"
              >
                Time
              </th>
              <th
                scope="col"
                class="px-4 py-3 text-left text-[10px] font-black uppercase text-gray-500 tracking-widest"
              >
                Window
              </th>
              <th
                scope="col"
                class="px-4 py-3 text-left text-[10px] font-black uppercase text-gray-500 tracking-widest text-center"
              >
                Target
              </th>
              <th
                scope="col"
                class="px-4 py-3 text-left text-[10px] font-black uppercase text-gray-500 tracking-widest"
              >
                AI Coach Advice
              </th>
              <th scope="col" class="px-4 py-3 text-right"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
            <tr
              v-for="window in day.windows"
              :id="`window-${window.dateKey}-${window.type}-${startTimeKey(window.startTime)}`"
              :key="`${window.dateKey}-${window.type}-${window.startTime}`"
              class="group hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
            >
              <td class="px-4 py-4 whitespace-nowrap">
                <span class="text-xs font-bold text-gray-900 dark:text-white">{{
                  formatTime(window.startTime)
                }}</span>
              </td>
              <td class="px-4 py-4">
                <div class="flex flex-col gap-1">
                  <div class="flex items-center gap-1.5">
                    <span
                      class="text-xs font-black uppercase tracking-tight"
                      :class="getTypeColor(window.type)"
                    >
                      {{ window.label }}
                    </span>
                    <UBadge
                      v-if="window.isLocked"
                      size="xs"
                      color="success"
                      variant="subtle"
                      class="text-[8px] px-1 py-0 uppercase"
                      icon="i-lucide-lock"
                      >Locked</UBadge
                    >
                    <UBadge
                      v-else-if="window.isSynthetic"
                      size="xs"
                      color="neutral"
                      variant="subtle"
                      class="text-[8px] px-1 py-0 uppercase"
                      >Target</UBadge
                    >
                  </div>
                  <span
                    v-if="window.workoutTitle"
                    class="text-[10px] font-medium text-gray-500 truncate max-w-[120px]"
                  >
                    ⚓ {{ window.workoutTitle }}
                  </span>
                  <span
                    v-else-if="window.lockedMeal"
                    class="text-[10px] font-bold text-success-600 dark:text-success-400 truncate max-w-[120px]"
                  >
                    🍴 {{ window.lockedMeal.title }}
                  </span>
                </div>
              </td>
              <td class="px-4 py-4">
                <div class="mx-auto grid w-[168px] grid-cols-[72px_24px_72px] items-center">
                  <div class="flex flex-col items-end">
                    <span
                      class="text-xs font-black"
                      :class="
                        window.isLocked
                          ? 'text-success-600 dark:text-success-400'
                          : 'text-primary-600 dark:text-primary-400'
                      "
                      >{{
                        window.isLocked ? window.lockedMeal.totals.carbs : window.targetCarbs
                      }}g</span
                    >
                    <span class="text-[8px] text-gray-400 uppercase font-bold">Carbs</span>
                  </div>
                  <div class="mx-auto h-4 w-px bg-gray-200 dark:bg-gray-700" />
                  <div class="flex flex-col items-start">
                    <span class="text-xs font-bold text-gray-700 dark:text-gray-300"
                      >{{
                        window.isLocked ? window.lockedMeal.totals.protein : window.targetProtein
                      }}g</span
                    >
                    <span class="text-[8px] text-gray-400 uppercase font-bold">Prot</span>
                  </div>
                </div>
              </td>
              <td class="px-4 py-4">
                <p
                  v-if="window.isLocked && hasLockedAdvice(window)"
                  class="text-xs text-gray-600 dark:text-gray-400 leading-relaxed max-w-xs font-medium"
                >
                  {{ formatLockedAdvice(window) }}
                </p>
                <p v-else class="text-xs text-gray-600 dark:text-gray-400 leading-relaxed max-w-xs">
                  {{ window.advice }}
                </p>
              </td>
              <td class="px-4 py-4 text-right">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :icon="window.isLocked ? 'i-lucide-pencil' : 'i-lucide-sparkles'"
                  @click="emitSuggestion(day, window)"
                />
              </td>
            </tr>
            <tr class="bg-gray-50/80 dark:bg-gray-800/40">
              <td
                class="px-4 py-3 text-[10px] font-black uppercase tracking-wide text-gray-600"
                colspan="2"
              >
                Daily Total
              </td>
              <td class="px-4 py-3">
                <div class="mx-auto grid w-[168px] grid-cols-[72px_24px_72px] items-center">
                  <span class="text-right text-xs font-black text-primary-700 dark:text-primary-300"
                    >{{ day.totalCarbs }}g carbs</span
                  >
                  <span class="text-center text-[10px] text-gray-400">•</span>
                  <span class="text-left text-xs font-bold text-gray-700 dark:text-gray-300"
                    >{{ day.totalProtein }}g protein</span
                  >
                </div>
              </td>
              <td class="px-4 py-3 text-[10px] text-gray-500">
                <div class="flex flex-col gap-0.5">
                  <span>{{ day.windows.length }} windows</span>
                  <span class="text-[9px] uppercase tracking-wider">
                    {{ day.plannedCarbs }}g planned •
                    {{ Math.max(0, day.totalCarbs - day.plannedCarbs) }}g remaining
                  </span>
                </div>
              </td>
              <td class="px-4 py-3" />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { format, parseISO } from 'date-fns'

  const props = defineProps<{
    windows: any[]
  }>()

  const emit = defineEmits(['export-grocery', 'suggest'])

  const filteredWindows = computed(() => {
    // We show the next 8 items, or more if a specific day is selected and we want to scroll
    // Actually, filtering by day might be better if user clicks a day
    return props.windows
  })

  const groupedDays = computed(() => {
    const groups = new Map<
      string,
      {
        dateKey: string
        windows: any[]
        totalCarbs: number
        totalProtein: number
        plannedCarbs: number
        plannedProtein: number
      }
    >()

    for (const window of filteredWindows.value) {
      const dateKey = window.dateKey || format(parseISO(window.startTime), 'yyyy-MM-dd')
      const existing = groups.get(dateKey)

      if (!existing) {
        groups.set(dateKey, {
          dateKey,
          windows: [window],
          totalCarbs: Number(window.targetCarbs || 0),
          totalProtein: Number(window.targetProtein || 0),
          plannedCarbs: Number(window.isLocked ? window.lockedMeal?.totals?.carbs || 0 : 0),
          plannedProtein: Number(window.isLocked ? window.lockedMeal?.totals?.protein || 0 : 0)
        })
        continue
      }

      existing.windows.push(window)
      existing.totalCarbs += Number(window.targetCarbs || 0)
      existing.totalProtein += Number(window.targetProtein || 0)
      if (window.isLocked) {
        existing.plannedCarbs += Number(window.lockedMeal?.totals?.carbs || 0)
        existing.plannedProtein += Number(window.lockedMeal?.totals?.protein || 0)
      }
    }

    return Array.from(groups.values())
  })

  function formatTime(dateStr: string) {
    return format(parseISO(dateStr), 'HH:mm')
  }

  function formatDay(dateStr: string) {
    return format(parseISO(dateStr), 'EEE, MMM d')
  }

  function getTypeColor(type: string) {
    switch (type) {
      case 'PRE_WORKOUT':
        return 'text-orange-500'
      case 'INTRA_WORKOUT':
        return 'text-primary-500'
      case 'POST_WORKOUT':
        return 'text-success-500'
      case 'TRANSITION':
        return 'text-purple-500'
      default:
        return 'text-gray-500'
    }
  }

  function startTimeKey(value: string) {
    const parsed = parseISO(value)
    if (Number.isNaN(parsed.getTime())) return value
    return parsed.toISOString()
  }

  function formatLockedAdvice(window: any) {
    const parts: string[] = []
    const absorptionType = String(window.lockedMeal?.absorptionType || '').trim()
    const prepMinutes = Number(window.lockedMeal?.prepMinutes || 0)

    if (absorptionType) parts.push(`${absorptionType} absorption`)
    if (prepMinutes > 0) parts.push(`${prepMinutes}m prep`)

    return parts.join(' • ')
  }

  function hasLockedAdvice(window: any) {
    return formatLockedAdvice(window).length > 0
  }

  function buildWindowAssignments(day: any, selectedWindow: any) {
    const selectedKey = startTimeKey(selectedWindow.startTime)
    const overlappingWindows = day.windows.filter(
      (window: any) => startTimeKey(window.startTime) === selectedKey
    )
    const windowsToAssign = overlappingWindows.length > 1 ? overlappingWindows : [selectedWindow]
    return windowsToAssign.map((window: any) => ({
      windowType: window.type,
      slotName: window.slotName || window.label || '',
      label: window.label,
      targetCarbs: Number(window.targetCarbs || 0),
      targetProtein: Number(window.targetProtein || 0),
      targetKcal: Number(window.targetKcal || 0)
    }))
  }

  function emitSuggestion(day: any, window: any) {
    const windowAssignments = buildWindowAssignments(day, window)
    const mergedTargets = windowAssignments.reduce(
      (sum: any, assignment: any) => ({
        carbs: sum.carbs + Number(assignment.targetCarbs || 0),
        protein: sum.protein + Number(assignment.targetProtein || 0),
        kcal: sum.kcal + Number(assignment.targetKcal || 0)
      }),
      { carbs: 0, protein: 0, kcal: 0 }
    )
    const currentlyAssignedCarbs = day.windows
      .filter((candidate: any) =>
        windowAssignments.some(
          (assignment: any) =>
            assignment.windowType === candidate.type &&
            String(assignment.slotName || '')
              .trim()
              .toLowerCase() ===
              String(candidate.slotName || candidate.label || '')
                .trim()
                .toLowerCase()
        )
      )
      .reduce((sum: number, candidate: any) => {
        return sum + Number(candidate.isLocked ? candidate.lockedMeal?.totals?.carbs || 0 : 0)
      }, 0)

    emit('suggest', {
      ...window,
      dateKey: day.dateKey,
      targetCarbs: mergedTargets.carbs || Number(window.targetCarbs || 0),
      targetProtein: mergedTargets.protein || Number(window.targetProtein || 0),
      targetKcal: mergedTargets.kcal || Number(window.targetKcal || 0),
      windowAssignments,
      dayTargetCarbs: day.totalCarbs,
      dayPlannedCarbs: day.plannedCarbs,
      currentAssignedCarbs: currentlyAssignedCarbs
    })
  }
</script>
