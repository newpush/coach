<template>
  <div
    class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
  >
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-lg font-semibold">Run Details</h3>
      <div class="flex gap-2">
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          icon="i-heroicons-adjustments-horizontal"
          @click="$emit('adjust')"
        >
          Adjust
        </UButton>
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          icon="i-heroicons-arrow-path"
          :loading="generating"
          @click="$emit('regenerate')"
        >
          Regenerate
        </UButton>
      </div>
    </div>

    <!-- Summary Stats -->
    <div v-if="hasStructure" class="grid grid-cols-2 gap-4 mb-6">
      <div class="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <div class="text-xs text-muted mb-1">Total Distance (Est.)</div>
        <div class="text-xl font-bold">{{ (totalDistance / 1000).toFixed(1) }} km</div>
      </div>
      <div class="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <div class="text-xs text-muted mb-1">Avg Intensity</div>
        <div class="text-xl font-bold">{{ Math.round(avgIntensity * 100) }}%</div>
      </div>
    </div>

    <!-- Structure Chart -->
    <div v-if="hasStructure" class="mb-6">
      <h4 class="text-sm font-semibold text-muted mb-3">Structure Profile</h4>
      <WorkoutRunChart :workout="workout.structuredWorkout" />
    </div>
  </div>
</template>

<script setup lang="ts">
  import WorkoutRunChart from '~/components/workouts/WorkoutRunChart.vue'

  const props = defineProps<{
    workout: any
    generating?: boolean
  }>()

  defineEmits(['adjust', 'regenerate'])

  const hasStructure = computed(() => !!props.workout.structuredWorkout?.steps?.length)

  const totalDistance = computed(() => {
    if (!props.workout.structuredWorkout?.steps) return 0
    return props.workout.structuredWorkout.steps.reduce(
      (sum: number, step: any) => sum + (step.distance || 0),
      0
    )
  })

  const avgIntensity = computed(() => {
    const steps = props.workout.structuredWorkout?.steps
    if (!steps?.length) return 0

    let totalWeighted = 0
    let totalDuration = 0

    steps.forEach((step: any) => {
      const duration = step.durationSeconds || step.duration || 60
      const intensity =
        step.heartRate?.value || step.power?.value || (step.type === 'Rest' ? 0.5 : 0.75)
      totalWeighted += intensity * duration
      totalDuration += duration
    })

    return totalDuration > 0 ? totalWeighted / totalDuration : 0
  })
</script>
