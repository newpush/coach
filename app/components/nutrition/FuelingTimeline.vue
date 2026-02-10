<template>
  <div class="space-y-4">
    <div class="relative py-4">
      <template v-for="(window, index) in windows" :key="index">
        <!-- Physical Effort Anchor -->
        <NutritionWorkoutEventCard
          v-if="window.type === 'WORKOUT_EVENT'"
          :workout="window.workout"
          :start-time="window.startTime"
          :end-time="window.endTime"
          :fuel-state="getWorkoutFuelState(window.workout)"
        />

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
          :is-locked="isLocked"
          :fuel-state="getWorkoutFuelState(window.workout)"
          @add="$emit('add', $event)"
          @add-ai="$emit('addAi', $event)"
          @edit="$emit('edit', $event)"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
  import type { FuelingTimelineWindow } from '~/utils/nutrition-timeline'

  const props = defineProps<{
    windows: FuelingTimelineWindow[]
    isLocked?: boolean
  }>()

  defineEmits(['add', 'addAi', 'edit'])

  function getWorkoutFuelState(workout: any) {
    if (!workout) return 1
    const intensity = workout.workIntensity || 0.65
    if (intensity > 0.85) return 3
    if (intensity > 0.6) return 2
    return 1
  }

  function formatTitle(window: FuelingTimelineWindow) {
    if (window.type === 'TRANSITION') return 'Transition Fueling'
    if (window.type === 'DAILY_BASE') {
      return window.description !== 'Daily baseline' ? window.description : 'Daily Base'
    }
    if (window.type === 'WORKOUT_EVENT') return window.workout?.title || 'Workout'

    const typeMap: Record<string, string> = {
      PRE_WORKOUT: 'Pre-Workout',
      INTRA_WORKOUT: 'Intra-Workout Fueling',
      POST_WORKOUT: 'Post-Workout Recovery'
    }

    const typeStr = typeMap[window.type] || window.type
    return window.workoutTitle ? `${typeStr}: ${window.workoutTitle}` : typeStr
  }
</script>
