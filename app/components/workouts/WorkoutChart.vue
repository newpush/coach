<template>
  <div class="workout-chart-container">
    <div v-if="!workout || !workout.steps || workout.steps.length === 0" class="text-center py-8 text-muted text-sm">
      No structured workout data available.
    </div>

    <div v-else class="space-y-4">
      <!-- Chart -->
      <div class="relative bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <!-- Y-axis labels -->
        <div class="flex">
          <div class="flex flex-col justify-between text-xs text-muted w-12 pr-2 text-right" style="height: 200px">
            <span>120%</span>
            <span>100%</span>
            <span>80%</span>
            <span>60%</span>
            <span>40%</span>
            <span>20%</span>
          </div>

          <!-- Chart area -->
          <div class="flex-1 relative" style="height: 200px">
            <!-- Grid lines -->
            <div class="absolute inset-0 flex flex-col justify-between">
              <div v-for="i in 6" :key="i" class="border-t border-gray-200 dark:border-gray-700"></div>
            </div>

            <!-- Power bars -->
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
                  class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs rounded-lg shadow-lg whitespace-nowrap z-10"
                >
                  <div class="font-semibold">{{ step.name }}</div>
                  <div class="text-[10px] opacity-80 mt-1">
                    {{ formatDuration(step.durationSeconds) }} @ {{ Math.round((step.power?.value || 0) * 100) }}% FTP
                  </div>
                  <div v-if="userFtp" class="text-[10px] opacity-80">
                    {{ Math.round((step.power?.value || 0) * userFtp) }}W
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
            <span>{{ formatDuration(totalDuration * 3 / 4) }}</span>
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
            class="flex items-center gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
          >
            <div class="flex-shrink-0 w-3 h-3 rounded-full" :style="{ backgroundColor: getStepColor(step.type) }"></div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium truncate">{{ step.name }}</div>
              <div class="text-xs text-muted">{{ step.type }}</div>
            </div>
            <div class="flex-shrink-0 text-right">
              <div class="text-sm font-semibold">{{ Math.round((step.power?.value || 0) * 100) }}%</div>
              <div class="text-xs text-muted">{{ formatDuration(step.durationSeconds) }}</div>
            </div>
            <div v-if="userFtp" class="flex-shrink-0 text-xs text-muted w-16 text-right">
              {{ Math.round((step.power?.value || 0) * userFtp) }}W
            </div>
          </div>
        </div>
      </div>

      <!-- Summary Stats -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
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
        <div class="text-center" v-if="userFtp">
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
  return props.workout.steps.reduce((sum: number, step: any) => sum + (step.durationSeconds || 0), 0)
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

// Functions
function getStepStyle(step: any) {
  const powerPercent = (step.power?.value || 0) * 100
  const height = Math.min(powerPercent / 1.2, 100) // Scale to 120% max
  const width = (step.durationSeconds / totalDuration.value) * 100
  const color = getStepColor(step.type)

  return {
    height: `${height}%`,
    width: `${width}%`,
    backgroundColor: color,
    minWidth: '2px'
  }
}

function getStepColor(type: string): string {
  const colors: Record<string, string> = {
    'Warmup': '#10b981',      // green
    'Active': '#f59e0b',      // amber
    'Rest': '#6366f1',        // indigo
    'Cooldown': '#06b6d4',    // cyan
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
