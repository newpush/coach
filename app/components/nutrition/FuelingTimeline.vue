<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between mb-2">
      <h2 class="text-base font-black uppercase tracking-widest text-gray-400">Fueling Timeline</h2>
      <span class="text-[10px] font-bold text-gray-400 uppercase tracking-tighter"
        >{{ windows.length }} Active Windows</span
      >
    </div>

    <div class="relative py-4">
      <NutritionWindowBlock
        v-for="(window, index) in windows"
        :key="index"
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
        :is-locked="isLocked"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
  import type { FuelingTimelineWindow } from '~/utils/nutrition-timeline'

  const props = defineProps<{
    windows: FuelingTimelineWindow[]
    isLocked?: boolean
  }>()

  function formatTitle(window: FuelingTimelineWindow) {
    if (window.type === 'TRANSITION') return 'Workout Transition'
    if (window.type === 'DAILY_BASE') return 'Daily Base'

    const typeMap: Record<string, string> = {
      PRE_WORKOUT: 'Pre-Workout',
      INTRA_WORKOUT: 'Intra-Workout',
      POST_WORKOUT: 'Post-Workout'
    }

    const typeStr = typeMap[window.type] || window.type
    return window.workoutTitle ? `${typeStr}: ${window.workoutTitle}` : typeStr
  }
</script>
