<template>
  <div
    class="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4"
  >
    <h3 class="font-semibold text-sm text-gray-500 dark:text-gray-400 mb-4">
      Weekly Zone Distribution
    </h3>

    <div v-if="hasData" class="space-y-4">
      <!-- Stacked Horizontal Bar -->
      <div class="h-8 w-full rounded-md overflow-hidden flex relative bg-gray-100 dark:bg-gray-700">
        <div
          v-for="(zone, index) in zones"
          :key="index"
          class="h-full relative group first:rounded-l-md last:rounded-r-md transition-all hover:opacity-90"
          :style="{
            width: `${(zone.duration / totalDuration) * 100}%`,
            backgroundColor: zone.color
          }"
        >
          <!-- Tooltip (On Hover) -->
          <div
            v-if="zone.duration > 0"
            class="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none"
          >
            {{ zone.name }}: {{ formatDuration(zone.duration) }} ({{
              Math.round((zone.duration / totalDuration) * 100)
            }}%)
          </div>
        </div>
      </div>

      <!-- Legend/Stats -->
      <div class="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
        <div
          v-for="zone in zones"
          :key="zone.name"
          class="flex flex-col p-1.5 bg-gray-50 dark:bg-gray-900 rounded border border-gray-100 dark:border-gray-800"
        >
          <div class="flex items-center gap-1.5 mb-1">
            <div
              class="w-2 h-2 rounded-full flex-shrink-0"
              :style="{ backgroundColor: zone.color }"
            />
            <span class="font-medium text-gray-500">{{ zone.name }}</span>
          </div>
          <span class="font-bold pl-3.5">{{ formatDuration(zone.duration) }}</span>
        </div>
      </div>
    </div>

    <div v-else class="text-center py-10 space-y-4">
      <p class="text-sm text-muted">Generate structured workouts to see zone distribution.</p>
      <UTooltip :text="buttonTooltip">
        <UButton
          size="sm"
          color="primary"
          variant="soft"
          icon="i-heroicons-sparkles"
          :loading="loading"
          :disabled="isRestricted"
          @click="$emit('generate')"
        >
          Generate All Workouts for this Week
        </UButton>
      </UTooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
  const props = defineProps<{
    workouts: any[]
    loading?: boolean
    buttonTooltip?: string
    isRestricted?: boolean
  }>()

  const emit = defineEmits(['generate'])

  const hasData = computed(() => props.workouts?.some((w) => w.structuredWorkout))

  const zones = computed(() => {
    const distribution = [
      { name: 'Z1', min: 0, max: 0.55, duration: 0, color: '#9ca3af' }, // gray-400
      { name: 'Z2', min: 0.55, max: 0.75, duration: 0, color: '#3b82f6' }, // blue-500
      { name: 'Z3', min: 0.75, max: 0.9, duration: 0, color: '#22c55e' }, // green-500
      { name: 'Z4', min: 0.9, max: 1.05, duration: 0, color: '#eab308' }, // yellow-500
      { name: 'Z5', min: 1.05, max: 1.2, duration: 0, color: '#f97316' }, // orange-500
      { name: 'Z6', min: 1.2, max: 9.99, duration: 0, color: '#ef4444' } // red-500
    ]

    if (!props.workouts) return distribution

    props.workouts.forEach((w) => {
      if (w.structuredWorkout?.steps && Array.isArray(w.structuredWorkout.steps)) {
        w.structuredWorkout.steps.forEach((step: any) => {
          let intensity = 0

          // Priority 1: Power (Cycling / Running Power)
          // Usually provided as a decimal ratio (0.75 = 75% FTP) or a 'value' object
          if (typeof step.power === 'number') {
            intensity = step.power
          } else if (step.power?.value) {
            intensity = step.power.value
          }
          // Priority 2: Heart Rate (Running / Cardio)
          // Usually provided as decimal ratio of LTHR/MaxHR
          else if (typeof step.heartRate === 'number') {
            intensity = step.heartRate
          } else if (step.heartRate?.value) {
            intensity = step.heartRate.value
          }

          // Intensity 0 means rest or undefined, often Z1

          const duration = step.durationSeconds || step.duration || 0

          // Find matching zone based on intensity
          // Z1: 0 - 0.55
          // ...
          // Z6: 1.20+
          const zone =
            distribution.find((z) => intensity <= z.max) || distribution[distribution.length - 1]
          if (zone) {
            zone.duration += duration
          }
        })
      }
    })

    return distribution
  })

  const totalDuration = computed(() =>
    Math.max(
      zones.value.reduce((acc, z) => acc + z.duration, 0),
      1
    )
  )

  function formatDuration(seconds: number) {
    if (seconds === 0) return '0m'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }
</script>
