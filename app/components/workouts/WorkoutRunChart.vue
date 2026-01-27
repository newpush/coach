<template>
  <div class="workout-chart-container">
    <!-- Tooltip -->
    <div
      v-if="tooltip.visible"
      class="fixed z-50 px-3 py-2 text-xs font-medium text-white bg-gray-900 rounded shadow-lg pointer-events-none transform -translate-x-1/2 -translate-y-full mb-2 whitespace-nowrap dark:bg-gray-700"
      :style="{ left: `${tooltip.x}px`, top: `${tooltip.y - 8}px` }"
    >
      {{ tooltip.content }}
      <div
        class="absolute left-1/2 bottom-0 transform -translate-x-1/2 translate-y-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"
      ></div>
    </div>
    <div
      v-if="!workout || !workout.steps || workout.steps.length === 0"
      class="text-center py-8 text-muted text-sm"
    >
      No structured workout data available.
    </div>

    <div v-else class="space-y-4">
      <!-- Legend -->
      <div class="flex items-center gap-4 text-xs">
        <div class="flex items-center gap-1.5">
          <div class="w-3 h-3 rounded-xs bg-blue-500" />
          <span class="text-muted">Intensity (% LTHR)</span>
        </div>
      </div>

      <!-- Chart -->
      <div
        class="relative bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
      >
        <!-- Y-axis labels -->
        <div class="flex">
          <div
            class="flex flex-col justify-between text-xs text-muted w-8 sm:w-12 pr-1 sm:pr-2 text-right h-[140px] sm:h-[200px]"
          >
            <span>120%</span>
            <span>100%</span>
            <span>80%</span>
            <span>60%</span>
            <span>40%</span>
            <span>20%</span>
          </div>

          <!-- Chart area -->
          <div class="flex-1 relative min-w-0 h-[140px] sm:h-[200px]">
            <!-- Grid lines -->
            <div class="absolute inset-0 flex flex-col justify-between">
              <div v-for="i in 6" :key="i" class="border-t border-gray-200 dark:border-gray-700" />
            </div>

            <!-- Intensity bars -->
            <div class="absolute inset-0 flex items-end gap-0.5">
              <div
                v-for="(step, index) in workout.steps"
                :key="index"
                :style="getStepStyle(step)"
                class="relative group cursor-pointer transition-all hover:opacity-80"
                @mouseenter="hoveredStep = step"
                @mouseleave="hoveredStep = null"
              >
                <!-- Tooltip -->
                <div
                  v-if="hoveredStep === step"
                  class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs rounded-lg shadow-lg whitespace-nowrap z-50"
                >
                  <div class="font-semibold">{{ step.name }}</div>
                  <div class="text-[10px] opacity-80 mt-1">
                    {{ formatDuration(step.durationSeconds || step.duration || 0) }} @
                    <span v-if="step.heartRate?.range">
                      {{ Math.round(step.heartRate.range.start * 100) }}-{{
                        Math.round(step.heartRate.range.end * 100)
                      }}% LTHR
                    </span>
                    <span v-else-if="step.heartRate?.value">
                      {{ Math.round(step.heartRate.value * 100) }}% LTHR
                    </span>
                    <span v-else-if="step.power?.range">
                      {{ Math.round(step.power.range.start * 100) }}-{{
                        Math.round(step.power.range.end * 100)
                      }}% Power
                    </span>
                    <span v-else-if="step.power?.value">
                      {{ Math.round(step.power.value * 100) }}% Power
                    </span>
                    <span v-else> {{ getInferredIntensity(step) * 100 }}% (Inferred) </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- X-axis (time) -->
        <div class="flex mt-2 ml-12">
          <div class="flex-1 flex justify-between text-xs text-muted">
            <span>0:00</span>
            <span>{{ formatDuration(totalDuration / 4) }}</span>
            <span>{{ formatDuration(totalDuration / 2) }}</span>
            <span>{{ formatDuration((totalDuration * 3) / 4) }}</span>
            <span>{{ formatDuration(totalDuration) }}</span>
          </div>
        </div>
      </div>

      <!-- Step breakdown -->
      <div class="space-y-2">
        <h4 class="text-sm font-semibold text-muted">Workout Steps</h4>
        <div class="space-y-1">
          <div
            v-for="(step, index) in workout.steps"
            :key="index"
            class="rounded hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors p-2"
          >
            <!-- Mobile View -->
            <div class="flex flex-col gap-1.5 sm:hidden">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0">
                  <div
                    class="w-3 h-3 rounded-full flex-shrink-0"
                    :style="{ backgroundColor: getStepColor(getStepIntensity(step)) }"
                  />
                  <span class="text-sm font-medium truncate">{{ step.name }}</span>
                </div>
                <div class="text-xs font-mono text-muted flex-shrink-0">
                  {{ formatDuration(step.durationSeconds || step.duration || 0) }}
                </div>
              </div>

              <div class="flex items-center justify-between text-xs pl-5">
                <div class="text-muted">{{ step.type }}</div>

                <div class="flex items-center text-right">
                  <!-- Zone -->
                  <div
                    class="w-8 text-center font-semibold text-gray-700 dark:text-gray-300 flex-shrink-0"
                  >
                    {{ getZoneName(getStepIntensity(step)) }}
                  </div>

                  <!-- Cadence -->
                  <div class="w-16 text-blue-500 flex-shrink-0">
                    <span v-if="step.cadence">{{ step.cadence }} spm</span>
                    <span v-else class="opacity-0">-</span>
                  </div>

                  <!-- Intensity % -->
                  <div class="w-18 font-bold flex-shrink-0">
                    <span v-if="step.heartRate?.range">
                      {{ Math.round(step.heartRate.range.start * 100) }}-{{
                        Math.round(step.heartRate.range.end * 100)
                      }}%
                    </span>
                    <span v-else-if="step.heartRate?.value">
                      {{ Math.round(step.heartRate.value * 100) }}%
                    </span>
                    <span v-else-if="step.power?.range">
                      {{ Math.round(step.power.range.start * 100) }}-{{
                        Math.round(step.power.range.end * 100)
                      }}%
                    </span>
                    <span v-else-if="step.power?.value">
                      {{ Math.round(step.power.value * 100) }}%
                    </span>
                    <span v-else> {{ getInferredIntensity(step) * 100 }}% </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Desktop View -->
            <div class="hidden sm:grid grid-cols-[12px_1fr_48px_80px_110px] items-center gap-4">
              <div
                class="w-3 h-3 rounded-full flex-shrink-0 mt-1"
                :style="{ backgroundColor: getStepColor(getStepIntensity(step)) }"
              />
              <div class="min-w-0">
                <div class="text-sm font-medium truncate">{{ step.name }}</div>
                <div class="text-xs text-muted">{{ step.type }}</div>
              </div>
              <div class="text-center text-sm font-bold text-gray-500 dark:text-gray-400">
                {{ getZoneName(getStepIntensity(step)) }}
              </div>
              <div class="text-sm text-blue-500 font-semibold text-center whitespace-nowrap">
                <!-- Placeholder for pace or cadence if available -->
                <span v-if="step.cadence">{{ step.cadence }} SPM</span>
                <span v-else class="text-gray-300 dark:text-gray-700">-</span>
              </div>
              <div class="text-right">
                <div class="text-sm font-bold whitespace-nowrap">
                  <span v-if="step.heartRate?.range">
                    {{ Math.round(step.heartRate.range.start * 100) }}-{{
                      Math.round(step.heartRate.range.end * 100)
                    }}%
                  </span>
                  <span v-else-if="step.heartRate?.value">
                    {{ Math.round(step.heartRate.value * 100) }}%
                  </span>
                  <span v-else-if="step.power?.range">
                    {{ Math.round(step.power.range.start * 100) }}-{{
                      Math.round(step.power.range.end * 100)
                    }}%
                  </span>
                  <span v-else-if="step.power?.value">
                    {{ Math.round(step.power.value * 100) }}%
                  </span>
                  <span v-else> {{ getInferredIntensity(step) * 100 }}% (Est) </span>
                </div>
                <div class="text-[10px] text-muted">
                  {{ formatDuration(step.durationSeconds || step.duration || 0) }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Zone Distribution -->
      <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
        <h4 class="text-sm font-semibold text-muted mb-3">Time in Zone</h4>

        <!-- Stacked Horizontal Bar -->
        <div
          class="h-6 w-full rounded-md overflow-hidden flex relative bg-gray-100 dark:bg-gray-700 mb-3"
          @mouseleave="hideTooltip"
        >
          <div
            v-for="(zone, index) in zoneDistribution"
            :key="index"
            class="h-full relative group first:rounded-l-md last:rounded-r-md transition-all hover:opacity-90"
            :style="{
              width: `${(zone.duration / totalDuration) * 100}%`,
              backgroundColor: zone.color
            }"
            @mouseenter="showTooltip($event, `${zone.name}: ${formatDuration(zone.duration)}`)"
            @mousemove="moveTooltip($event)"
          />
        </div>

        <!-- Legend -->
        <div class="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
          <div
            v-for="zone in zoneDistribution"
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
            <span class="text-[10px] text-muted pl-3.5"
              >{{ Math.round((zone.duration / totalDuration) * 100) }}%</span
            >
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ZONE_COLORS } from '~/utils/zone-colors'

  const { tooltip, showTooltip, moveTooltip, hideTooltip } = useTooltip()

  const props = defineProps<{
    workout: any // structuredWorkout JSON
  }>()

  const hoveredStep = ref<any>(null)

  // Computed properties
  const totalDuration = computed(() => {
    if (!props.workout?.steps) return 0
    return props.workout.steps.reduce(
      (sum: number, step: any) => sum + (step.durationSeconds || step.duration || 0),
      0
    )
  })

  const zoneDistribution = computed(() => {
    const distribution = [
      { name: 'Z1', min: 0, max: 0.75, duration: 0, color: ZONE_COLORS[0] }, // Green
      { name: 'Z2', min: 0.75, max: 0.85, duration: 0, color: ZONE_COLORS[1] }, // Blue
      { name: 'Z3', min: 0.85, max: 0.95, duration: 0, color: ZONE_COLORS[2] }, // Amber
      { name: 'Z4', min: 0.95, max: 1.05, duration: 0, color: ZONE_COLORS[3] }, // Orange
      { name: 'Z5', min: 1.05, max: 9.99, duration: 0, color: ZONE_COLORS[4] } // Red
    ]

    if (!props.workout?.steps) return distribution

    props.workout.steps.forEach((step: any) => {
      const intensity = getStepIntensity(step)
      const duration = step.durationSeconds || step.duration || 0

      // Find zone
      const zone =
        distribution.find((z) => intensity <= z.max) || distribution[distribution.length - 1]
      if (zone) zone.duration += duration
    })

    return distribution
  })

  // Functions
  function getStepIntensity(step: any): number {
    const hr = step.heartRate?.range
      ? (step.heartRate.range.start + step.heartRate.range.end) / 2
      : step.heartRate?.value
    if (hr) return hr

    const pwr = step.power?.range
      ? (step.power.range.start + step.power.range.end) / 2
      : step.power?.value
    if (pwr) return pwr

    return getInferredIntensity(step)
  }

  function getInferredIntensity(step: any): number {
    if (step.type === 'Rest' || step.type === 'Warmup' || step.type === 'Cooldown') return 0.6
    return 0.8
  }

  function getStepStyle(step: any) {
    const width = ((step.durationSeconds || step.duration || 0) / totalDuration.value) * 100
    const intensity = getStepIntensity(step)
    const color = getStepColor(intensity)
    const maxScale = 1.2 // 120% is top of chart

    const range = step.heartRate?.range || step.power?.range
    if (range) {
      const startH = Math.min(range.start / maxScale, 1) * 100
      const endH = Math.min(range.end / maxScale, 1) * 100

      return {
        height: '100%',
        width: `${width}%`,
        backgroundColor: color,
        clipPath: `polygon(0% ${100 - startH}%, 100% ${100 - endH}%, 100% 100%, 0% 100%)`,
        minWidth: '2px'
      }
    }

    const height = Math.min(intensity / maxScale, 1) * 100

    return {
      height: `${height}%`,
      width: `${width}%`,
      backgroundColor: color,
      minWidth: '2px'
    }
  }

  function getStepColor(intensity: number): string {
    // Use zone colors
    if (intensity <= 0.75) return ZONE_COLORS[0] || '#10b981'
    if (intensity <= 0.85) return ZONE_COLORS[1] || '#3b82f6'
    if (intensity <= 0.95) return ZONE_COLORS[2] || '#f59e0b'
    if (intensity <= 1.05) return ZONE_COLORS[3] || '#f97316'
    return ZONE_COLORS[4] || '#ef4444'
  }

  function getZoneName(intensity: number): string {
    if (intensity <= 0.75) return 'Z1'
    if (intensity <= 0.85) return 'Z2'
    if (intensity <= 0.95) return 'Z3'
    if (intensity <= 1.05) return 'Z4'
    return 'Z5'
  }

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    if (mins === 0) return `${secs}s`
    if (secs === 0) return `${mins}m`
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }
</script>

<style scoped>
  .workout-chart-container {
    @apply w-full;
  }
</style>
