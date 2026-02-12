<template>
  <div class="grid grid-cols-7 gap-2">
    <div
      v-for="day in days"
      :key="day.date"
      class="flex flex-col items-center p-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"
      :class="{ 'ring-2 ring-primary-500': isToday(day.date) }"
    >
      <span class="text-xs font-medium text-gray-500 uppercase">{{ formatDay(day.date) }}</span>
      <span class="text-sm font-bold my-1">{{ formatDate(day.date) }}</span>

      <div class="relative group">
        <UTooltip :text="day.label">
          <UIcon
            :name="getStateIcon(day.state)"
            class="size-8 my-1"
            :class="getStateColor(day.state)"
          />
        </UTooltip>
        <div v-if="day.isRest" class="absolute -bottom-1 -right-1">
          <UIcon name="i-lucide-coffee" class="size-4 text-orange-500" />
        </div>
      </div>

      <span class="text-xs font-medium mt-1">{{ day.carbsTarget }}g</span>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { format, parseISO, isToday as isTodayFns } from 'date-fns'

  const props = defineProps<{
    days: Array<{
      date: string
      state: number
      label: string
      carbsTarget: number
      isRest: boolean
    }>
  }>()

  function formatDay(dateStr: string) {
    return format(parseISO(dateStr), 'EEE')
  }

  function formatDate(dateStr: string) {
    return format(parseISO(dateStr), 'MMM d')
  }

  function isToday(dateStr: string) {
    return isTodayFns(parseISO(dateStr))
  }

  function getStateIcon(state: number) {
    if (state === 3) return 'i-lucide-zap'
    if (state === 2) return 'i-lucide-trending-up'
    return 'i-lucide-leaf'
  }

  function getStateColor(state: number) {
    if (state === 3) return 'text-primary-500'
    if (state === 2) return 'text-info-500'
    return 'text-success-500'
  }
</script>
