<template>
  <div class="workout-chart-container">
    <div
      v-if="!workout || !workout.steps || workout.steps.length === 0"
      class="text-center py-8 text-muted text-sm"
    >
      No structured workout data available.
    </div>

    <div v-else class="space-y-4">
      <!-- Legend -->
      <div class="flex items-center gap-4 text-xs">
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-xs bg-amber-500" />
          <span class="text-xs text-muted">Planned Intensity</span>
        </div>
        <div class="flex items-center gap-1.5">
          <div class="w-3 h-1 bg-white border border-gray-400 border-dashed" />
          <span class="text-muted">Target Cadence (RPM)</span>
        </div>
      </div>

      <!-- Chart -->
      <div
        class="relative bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
      >
        <!-- Y-axis labels -->
        <div class="flex">
          <div
            class="flex flex-col justify-between text-xs text-muted w-8 sm:w-12 pr-1 sm:pr-2 text-right"
            style="height: 200px"
          >
            <span>120%</span>
            <span>100%</span>
            <span>80%</span>
            <span>60%</span>
            <span>40%</span>
            <span>20%</span>
          </div>

          <!-- Chart area -->
          <div class="flex-1 relative min-w-0" style="height: 200px">
            <!-- Grid lines -->
            <div class="absolute inset-0 flex flex-col justify-between">
              <div v-for="i in 6" :key="i" class="border-t border-gray-200 dark:border-gray-700" />
            </div>

            <!-- Power bars -->
            <div class="absolute inset-0 flex items-end gap-0.5">
              <div
                v-for="(step, index) in workout.steps"
                :key="index"
                class="relative flex items-end h-full"
                :class="{ 'z-30': hoveredStep === step }"
                :style="getStepContainerStyle(step)"
                @mouseenter="hoveredStep = step"
                @mouseleave="hoveredStep = null"
              >
                <!-- Bar -->
                <div
                  :style="getStepBarStyle(step)"
                  class="w-full transition-all hover:opacity-80 cursor-pointer"
                />

                <!-- Tooltip -->
                <div
                  v-if="hoveredStep === step"
                  class="absolute left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs rounded-lg shadow-lg whitespace-nowrap z-50 pointer-events-none"
                  :style="{ bottom: getStepTooltipBottom(step) + '%' }"
                >
                  <div class="font-semibold">{{ step.name }}</div>
                  <div class="text-[10px] opacity-80 mt-1">
                    {{ formatDuration(step.durationSeconds || step.duration || 0) }} @
                    <span v-if="step.power?.range">
                      {{ Math.round(step.power.range.start * 100) }}-{{
                        Math.round(step.power.range.end * 100)
                      }}% FTP
                    </span>
                    <span v-else> {{ Math.round((step.power?.value || 0) * 100) }}% FTP </span>
                  </div>
                  <div v-if="userFtp" class="text-[10px] opacity-80">
                    <span v-if="step.power?.range">
                      {{ Math.round(step.power.range.start * userFtp) }}-{{
                        Math.round(step.power.range.end * userFtp)
                      }}W
                    </span>
                    <span v-else> {{ Math.round((step.power?.value || 0) * userFtp) }}W </span>
                  </div>
                  <div
                    v-if="step.cadence"
                    class="text-[10px] opacity-80 border-t border-white/20 mt-1 pt-1"
                  >
                    Target Cadence: {{ step.cadence }} RPM
                  </div>
                </div>
              </div>
            </div>

            <!-- Cadence Line Overlay -->
            <svg
              class="absolute inset-0 pointer-events-none z-10"
              preserveAspectRatio="none"
              viewBox="0 0 1000 100"
            >
              <path
                :d="cadencePath"
                fill="none"
                stroke="white"
                stroke-width="2"
                stroke-dasharray="4,2"
                class="drop-shadow-sm opacity-60"
              />
            </svg>
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
                    :style="{ backgroundColor: getStepColor(step.type) }"
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
                    {{
                      getZone(
                        step.power?.value ||
                          (step.power?.range
                            ? (step.power.range.start + step.power.range.end) / 2
                            : 0)
                      )
                    }}
                  </div>

                  <!-- Cadence -->
                  <div class="w-16 text-blue-500 flex-shrink-0">
                    <span v-if="step.cadence">{{ step.cadence }} rpm</span>
                    <span v-else class="opacity-0">-</span>
                  </div>

                  <!-- Avg Watts -->
                  <div v-if="userFtp" class="w-12 text-primary font-medium flex-shrink-0">
                    {{ getAvgWatts(step, userFtp) }}w
                  </div>

                  <!-- Power % -->
                  <div class="w-18 font-bold flex-shrink-0">
                    <span v-if="step.power?.range">
                      {{ Math.round(step.power.range.start * 100) }}-{{
                        Math.round(step.power.range.end * 100)
                      }}%
                    </span>
                    <span v-else> {{ Math.round((step.power?.value || 0) * 100) }}% </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Desktop View -->
            <div
              class="hidden sm:grid items-center gap-4"
              :class="
                userFtp
                  ? 'grid-cols-[12px_1fr_48px_80px_110px_70px]'
                  : 'grid-cols-[12px_1fr_48px_80px_110px]'
              "
            >
              <div
                class="w-3 h-3 rounded-full flex-shrink-0 mt-1"
                :style="{ backgroundColor: getStepColor(step.type) }"
              />
              <div class="min-w-0">
                <div class="text-sm font-medium truncate">{{ step.name }}</div>
                <div class="text-xs text-muted">{{ step.type }}</div>
              </div>
              <div class="text-center text-sm font-bold text-gray-500 dark:text-gray-400">
                {{
                  getZone(
                    step.power?.value ||
                      (step.power?.range ? (step.power.range.start + step.power.range.end) / 2 : 0)
                  )
                }}
              </div>
              <div class="text-sm text-blue-500 font-semibold text-center whitespace-nowrap">
                <span v-if="step.cadence">{{ step.cadence }} RPM</span>
                <span v-else class="text-gray-300 dark:text-gray-700">-</span>
              </div>
              <div class="text-right">
                <div class="text-sm font-bold whitespace-nowrap">
                  <span v-if="step.power?.range">
                    {{ Math.round(step.power.range.start * 100) }}-{{
                      Math.round(step.power.range.end * 100)
                    }}%
                  </span>
                  <span v-else> {{ Math.round((step.power?.value || 0) * 100) }}% </span>
                </div>
                <div class="text-[10px] text-muted">
                  {{ formatDuration(step.durationSeconds || step.duration || 0) }}
                </div>
              </div>

              <!-- Average Watts -->
              <div v-if="userFtp" class="text-right">
                <div class="text-sm font-bold text-primary">
                  {{ getAvgWatts(step, userFtp) }}<span class="text-[10px] ml-0.5">W</span>
                </div>
                <div class="text-[9px] text-muted uppercase">Avg</div>
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
        >
          <div
            v-for="(zone, index) in zoneDistribution"
            :key="index"
            class="h-full relative group first:rounded-l-md last:rounded-r-md transition-all hover:opacity-90"
            :style="{
              width: `${(zone.duration / totalDuration) * 100}%`,
              backgroundColor: zone.color
            }"
            :title="`${zone.name}: ${formatDuration(zone.duration)}`"
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

      <!-- Summary Stats -->
      <div
        class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-gray-200 dark:border-gray-700"
      >
        <div class="text-center">
          <div class="text-xs text-muted">Total Time</div>
          <div class="text-lg font-bold">{{ formatDuration(totalDuration) }}</div>
        </div>
        <div class="text-center">
          <div class="text-xs text-muted">Avg Power</div>
          <div class="text-lg font-bold">{{ Math.round(avgPower * 100) }}%</div>
        </div>
        <div class="text-center">
          <div class="text-xs text-muted">Max Power</div>
          <div class="text-lg font-bold">{{ Math.round(maxPower * 100) }}%</div>
        </div>
        <div v-if="userFtp" class="text-center">
          <div class="text-xs text-muted">Avg Watts</div>
          <div class="text-lg font-bold">{{ Math.round(avgPower * userFtp) }}W</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  const props = defineProps<{
    workout: any // structuredWorkout JSON
    userFtp?: number
  }>()

  const hoveredStep = ref<any>(null)

  // Computed properties
  const totalDuration = computed(() => {
    if (!props.workout?.steps) return 0
    return props.workout.steps.reduce(
      (sum: number, step: any) => sum + (step.durationSeconds || 0),
      0
    )
  })

  const avgPower = computed(() => {
    if (!props.workout?.steps || props.workout.steps.length === 0) return 0
    const weightedSum = props.workout.steps.reduce((sum: number, step: any) => {
      return sum + (step.power?.value || 0) * (step.durationSeconds || 0)
    }, 0)
    return weightedSum / totalDuration.value
  })

  const maxPower = computed(() => {
    if (!props.workout?.steps || props.workout.steps.length === 0) return 0
    return Math.max(...props.workout.steps.map((step: any) => step.power?.value || 0))
  })

  const cadencePath = computed(() => {
    if (!props.workout?.steps || props.workout.steps.length === 0) return ''

    let path = ''
    let currentX = 0
    const chartWidth = 1000 // Virtual coordinate system
    const chartHeight = 100 // Virtual coordinate system
    const maxCadence = 120

    props.workout.steps.forEach((step: any, index: number) => {
      const stepWidth =
        ((step.durationSeconds || step.duration || 0) / totalDuration.value) * chartWidth
      const cadence = step.cadence || 0
      const y = chartHeight - Math.min(cadence / maxCadence, 1) * chartHeight

      if (index === 0) {
        path += `M ${currentX} ${y} `
      }

      path += `L ${currentX + stepWidth} ${y} `
      currentX += stepWidth
    })

    return path
  })

  const zoneDistribution = computed(() => {
    const distribution = [
      { name: 'Z1', min: 0, max: 0.55, duration: 0, color: '#9ca3af' }, // gray-400
      { name: 'Z2', min: 0.55, max: 0.75, duration: 0, color: '#3b82f6' }, // blue-500
      { name: 'Z3', min: 0.75, max: 0.9, duration: 0, color: '#22c55e' }, // green-500
      { name: 'Z4', min: 0.9, max: 1.05, duration: 0, color: '#eab308' }, // yellow-500
      { name: 'Z5', min: 1.05, max: 1.2, duration: 0, color: '#f97316' }, // orange-500
      { name: 'Z6', min: 1.2, max: 9.99, duration: 0, color: '#ef4444' } // red-500
    ]

    if (!props.workout?.steps) return distribution

    props.workout.steps.forEach((step: any) => {
      // If range (ramp), take average
      const val = step.power?.range
        ? (step.power.range.start + step.power.range.end) / 2
        : step.power?.value || 0

      // Use HR if no power?
      // If val is 0, maybe check heartRate?
      // For now assume power is primary if present or if structure is for cycling.
      // If running, we might need a different chart or mapping.

      const power = val
      const duration = step.durationSeconds || step.duration || 0

      // Find zone
      // Use < for upper bound to align with standard Coggan zones where Z2 ends at 75% inclusive?
      // Actually Coggan is:
      // Z1 < 55%
      // Z2 56-75%
      // Z3 76-90%
      // Z4 91-105%
      // Z5 106-120%
      // Z6 121%+
      // So <= 0.55 is Z1. >0.55 and <=0.75 is Z2.

      const zone = distribution.find((z) => power <= z.max) || distribution[distribution.length - 1]
      if (zone) zone.duration += duration
    })

    return distribution
  })

  // Functions
  function getStepContainerStyle(step: any) {
    const width = ((step.durationSeconds || step.duration || 0) / totalDuration.value) * 100
    return {
      width: `${width}%`,
      minWidth: '2px'
    }
  }

  function getStepBarStyle(step: any) {
    const color = getStepColor(step.type)
    const maxScale = 1.2 // 120% FTP is top of chart

    if (step.power?.range) {
      // Ramp logic
      const startH = Math.min(step.power.range.start / maxScale, 1) * 100
      const endH = Math.min(step.power.range.end / maxScale, 1) * 100

      return {
        height: '100%',
        backgroundColor: color,
        clipPath: `polygon(0% ${100 - startH}%, 100% ${100 - endH}%, 100% 100%, 0% 100%)`
      }
    } else {
      // Flat logic
      const height = Math.min((step.power?.value || 0) / maxScale, 1) * 100

      return {
        height: `${height}%`,
        backgroundColor: color
      }
    }
  }

  function getStepTooltipBottom(step: any): number {
    const maxScale = 1.2 // 120% FTP is top of chart

    if (step.power?.range) {
      // Ramp logic - position at the average height of the ramp
      const startH = Math.min(step.power.range.start / maxScale, 1) * 100
      const endH = Math.min(step.power.range.end / maxScale, 1) * 100
      return (startH + endH) / 2
    } else {
      // Flat logic - position at the top of the bar
      return Math.min((step.power?.value || 0) / maxScale, 1) * 100
    }
  }

  function getZone(power: number): string {
    if (power <= 0.55) return 'Z1'
    if (power <= 0.75) return 'Z2'
    if (power <= 0.9) return 'Z3'
    if (power <= 1.05) return 'Z4'
    if (power <= 1.2) return 'Z5'
    return 'Z6'
  }

  function getAvgWatts(step: any, ftp: number): number {
    if (step.power?.range) {
      return Math.round(((step.power.range.start + step.power.range.end) / 2) * ftp)
    }
    return Math.round((step.power?.value || 0) * ftp)
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
