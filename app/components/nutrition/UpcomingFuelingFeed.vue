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
      <div
        class="overflow-x-auto border-y sm:border border-gray-200 dark:border-gray-800 sm:rounded-xl bg-white dark:bg-gray-900/50"
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
              :id="`window-${window.dateKey}`"
              :key="window.dateKey"
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
                      v-if="window.isSynthetic"
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
                </div>
              </td>
              <td class="px-4 py-4">
                <div class="flex flex-col items-center gap-1">
                  <div class="flex items-center gap-2">
                    <div class="flex flex-col items-center">
                      <span class="text-xs font-black text-primary-600 dark:text-primary-400"
                        >{{ window.targetCarbs }}g</span
                      >
                      <span class="text-[8px] text-gray-400 uppercase font-bold">Carbs</span>
                    </div>
                    <div class="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
                    <div class="flex flex-col items-center">
                      <span class="text-xs font-bold text-gray-700 dark:text-gray-300"
                        >{{ window.targetProtein }}g</span
                      >
                      <span class="text-[8px] text-gray-400 uppercase font-bold">Prot</span>
                    </div>
                  </div>
                </div>
              </td>
              <td class="px-4 py-4">
                <p class="text-xs text-gray-600 dark:text-gray-400 leading-relaxed max-w-xs">
                  {{ window.advice }}
                </p>
              </td>
              <td class="px-4 py-4 text-right">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-sparkles"
                  @click="$emit('suggest', window)"
                />
              </td>
            </tr>
            <tr class="bg-gray-50/80 dark:bg-gray-800/40">
              <td class="px-4 py-3 text-[10px] font-black uppercase tracking-wide text-gray-600" colspan="2">
                Daily Total
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center justify-center gap-2">
                  <span class="text-xs font-black text-primary-700 dark:text-primary-300"
                    >{{ day.totalCarbs }}g carbs</span
                  >
                  <span class="text-[10px] text-gray-400">•</span>
                  <span class="text-xs font-bold text-gray-700 dark:text-gray-300"
                    >{{ day.totalProtein }}g protein</span
                  >
                </div>
              </td>
              <td class="px-4 py-3 text-[10px] text-gray-500">
                {{ day.windows.length }} windows
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

  defineEmits(['export-grocery', 'suggest'])

  const filteredWindows = computed(() => {
    // We show the next 8 items, or more if a specific day is selected and we want to scroll
    // Actually, filtering by day might be better if user clicks a day
    return props.windows
  })

  const groupedDays = computed(() => {
    const groups = new Map<
      string,
      { dateKey: string; windows: any[]; totalCarbs: number; totalProtein: number }
    >()

    for (const window of filteredWindows.value) {
      const dateKey = format(parseISO(window.startTime), 'yyyy-MM-dd')
      const existing = groups.get(dateKey)

      if (!existing) {
        groups.set(dateKey, {
          dateKey,
          windows: [window],
          totalCarbs: Number(window.targetCarbs || 0),
          totalProtein: Number(window.targetProtein || 0)
        })
        continue
      }

      existing.windows.push(window)
      existing.totalCarbs += Number(window.targetCarbs || 0)
      existing.totalProtein += Number(window.targetProtein || 0)
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
</script>
