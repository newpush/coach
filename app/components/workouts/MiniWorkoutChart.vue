<template>
  <div class="mini-chart-container h-8 w-24 relative flex items-end gap-px">
    <div
      v-for="(step, index) in steps"
      :key="index"
      class="rounded-sm"
      :style="getStepStyle(step)"
      :title="`${step.name}: ${formatDuration(step.durationSeconds)}`"
    />
  </div>
</template>

<script setup lang="ts">
  const props = defineProps<{
    workout: any // structuredWorkout JSON
  }>()

  const steps = computed(() => {
    if (!props.workout?.steps || props.workout.steps.length === 0) return []
    return props.workout.steps
  })

  const totalDuration = computed(() => {
    return steps.value.reduce((sum: number, step: any) => sum + (step.durationSeconds || 0), 0)
  })

  function getStepStyle(step: any) {
    const powerPercent = (step.power?.value || 0) * 100
    const height = Math.min(powerPercent, 120) // Scale to 120% max, cap visually
    // Use relative width based on duration
    const widthPercent = (step.durationSeconds / totalDuration.value) * 100
    const color = getStepColor(step.type)

    return {
      height: `${Math.max(height, 10)}%`, // Minimum height for visibility
      width: `${widthPercent}%`,
      backgroundColor: color
    }
  }

  function getStepColor(type: string): string {
    const colors: Record<string, string> = {
      Warmup: '#10b981', // green
      Active: '#f59e0b', // amber
      Rest: '#6366f1', // indigo
      Cooldown: '#06b6d4' // cyan
    }
    return colors[type] || '#9ca3af' // gray default
  }

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    return `${mins}m`
  }
</script>
