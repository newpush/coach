<template>
  <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
    <div v-if="loading" class="flex items-center gap-4 py-8 text-gray-600 dark:text-gray-400">
      <div class="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-primary-500" />
      Loading pacing data...
    </div>

    <div v-else-if="error" class="py-8 text-center">
      <p class="text-red-600 dark:text-red-400">{{ error }}</p>
      <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Pacing data may not be available for this workout.
      </p>
    </div>

    <div v-else-if="streams" class="space-y-6">
      <!-- Summary Metrics -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
          <span class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2"
            >Average Pace</span
          >
          <span class="text-2xl font-semibold text-gray-900 dark:text-white">{{
            formatPace(streams.avgPacePerKm)
          }}</span>
        </div>

        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
          <span class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2"
            >Pace Consistency</span
          >
          <span class="text-2xl font-semibold text-gray-900 dark:text-white">
            {{ streams.paceVariability ? `${streams.paceVariability.toFixed(2)} m/s` : 'N/A' }}
          </span>
        </div>

        <div
          v-if="streams.pacingStrategy"
          class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg md:col-span-2 lg:col-span-1"
        >
          <span class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2"
            >Pacing Strategy</span
          >
          <span class="block text-2xl font-semibold text-gray-900 dark:text-white">{{
            formatStrategy(streams.pacingStrategy.strategy)
          }}</span>
          <span class="block text-sm text-gray-600 dark:text-gray-400 italic mt-1">{{
            streams.pacingStrategy.description
          }}</span>
        </div>
      </div>

      <!-- Lap Splits Table -->
      <div v-if="streams.lapSplits && streams.lapSplits.length > 0">
        <div
          class="flex items-center justify-between mb-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 p-2 rounded transition-colors"
          @click="showSplits = !showSplits"
        >
          <div class="flex items-center gap-2">
            <UIcon
              :name="showSplits ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
              class="w-5 h-5 text-gray-500"
            />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Lap Splits</h3>
          </div>
        </div>

        <div v-if="showSplits" class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th
                  class="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider"
                >
                  Lap
                </th>
                <th
                  class="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider"
                >
                  Distance
                </th>
                <th
                  class="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider"
                >
                  Time
                </th>
                <th
                  class="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider"
                >
                  Pace
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              <tr
                v-for="split in streams.lapSplits"
                :key="split.lap"
                :class="getSplitClass(split, streams.lapSplits)"
              >
                <td class="px-4 py-3 text-sm text-gray-900 dark:text-white">{{ split.lap }}</td>
                <td class="px-4 py-3 text-sm text-gray-900 dark:text-white">
                  {{ formatDistance(split.distance) }}
                </td>
                <td class="px-4 py-3 text-sm text-gray-900 dark:text-white">
                  {{ formatTime(split.time) }}
                </td>
                <td class="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white">
                  {{ split.pace }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Pacing Strategy Details -->
      <div v-if="streams.pacingStrategy">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Split Analysis</h3>
        <div class="grid grid-cols-3 gap-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
          <div class="flex flex-col gap-2">
            <span class="text-sm font-medium text-gray-600 dark:text-gray-400">First Half</span>
            <span class="text-xl font-semibold text-gray-900 dark:text-white">{{
              formatPaceSeconds(streams.pacingStrategy.firstHalfPace)
            }}</span>
          </div>
          <div class="flex flex-col gap-2">
            <span class="text-sm font-medium text-gray-600 dark:text-gray-400">Second Half</span>
            <span class="text-xl font-semibold text-gray-900 dark:text-white">{{
              formatPaceSeconds(streams.pacingStrategy.secondHalfPace)
            }}</span>
          </div>
          <div
            class="flex flex-col gap-2"
            :class="getDifferenceClass(streams.pacingStrategy.paceDifference)"
          >
            <span class="text-sm font-medium text-gray-600 dark:text-gray-400">Difference</span>
            <span class="text-xl font-semibold"
              >{{ Math.abs(streams.pacingStrategy.paceDifference) }}s</span
            >
          </div>
        </div>
        <div class="mt-4 flex flex-col gap-2">
          <span class="text-sm font-medium text-gray-600 dark:text-gray-400">Evenness Score</span>
          <div class="h-6 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
            <div
              class="h-full transition-all duration-300"
              :style="{ width: streams.pacingStrategy.evenness + '%' }"
              :class="getEvennessClass(streams.pacingStrategy.evenness)"
            />
          </div>
          <span class="text-sm font-semibold text-gray-700 dark:text-gray-300"
            >{{ streams.pacingStrategy.evenness }}/100</span
          >
        </div>
      </div>

      <!-- Surges Detection -->
      <div v-if="streams.surges && streams.surges.length > 0">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Detected Surges</h3>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {{ streams.surges.length }} sudden pace increase{{
            streams.surges.length > 1 ? 's' : ''
          }}
          detected
        </p>

        <!-- Visual Timeline -->
        <div class="relative h-16 bg-gray-100 dark:bg-gray-700 rounded-lg mb-4 overflow-hidden">
          <!-- Background gradient -->
          <div
            class="absolute inset-0 bg-gradient-to-r from-green-100 via-yellow-100 to-green-100 dark:from-green-900/30 dark:via-yellow-900/30 dark:to-green-900/30"
          />

          <!-- Surge markers -->
          <div
            v-for="(surge, index) in streams.surges"
            :key="index"
            class="absolute top-0 bottom-0 w-1 bg-yellow-500 hover:w-2 transition-all cursor-pointer"
            :style="{ left: getSurgePosition(surge.time) + '%' }"
            :title="`${formatTime(surge.time)} - +${surge.increase.toFixed(2)} m/s`"
          >
            <div
              class="absolute -top-1 left-1/2 transform -translate-x-1/2 w-3 h-3 bg-yellow-500 rounded-full border-2 border-white dark:border-gray-800"
            />
          </div>

          <!-- Time labels -->
          <div
            class="absolute inset-x-0 bottom-1 flex justify-between px-2 text-xs text-gray-600 dark:text-gray-400"
          >
            <span>Start</span>
            <span>End</span>
          </div>
        </div>

        <!-- Compact Summary Grid -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div
            v-for="(surge, index) in streams.surges.slice(0, 8)"
            :key="index"
            class="p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-sm"
          >
            <div class="font-medium text-gray-700 dark:text-gray-300">
              {{ formatTime(surge.time) }}
            </div>
            <div class="font-semibold text-yellow-700 dark:text-yellow-400 text-xs">
              +{{ surge.increase.toFixed(1) }} m/s
            </div>
          </div>
        </div>

        <!-- Show more button if there are many surges -->
        <button
          v-if="streams.surges.length > 8 && !showAllSurges"
          class="mt-3 text-sm text-primary-600 dark:text-primary-400 hover:underline"
          @click="showAllSurges = true"
        >
          Show {{ streams.surges.length - 8 }} more surge{{
            streams.surges.length - 8 > 1 ? 's' : ''
          }}
        </button>

        <div
          v-if="showAllSurges && streams.surges.length > 8"
          class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2"
        >
          <div
            v-for="(surge, index) in streams.surges.slice(8)"
            :key="index + 8"
            class="p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-sm"
          >
            <div class="font-medium text-gray-700 dark:text-gray-300">
              {{ formatTime(surge.time) }}
            </div>
            <div class="font-semibold text-yellow-700 dark:text-yellow-400 text-xs">
              +{{ surge.increase.toFixed(1) }} m/s
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  const props = defineProps<{
    workoutId: string
    publicToken?: string
  }>()

  const endpoint = computed(() =>
    props.publicToken
      ? `/api/share/workouts/${props.publicToken}/streams`
      : `/api/workouts/${props.workoutId}/streams`
  )

  interface PacingStreams {
    avgPacePerKm: number
    paceVariability: number
    pacingStrategy: {
      strategy: string
      description: string
      firstHalfPace: number
      secondHalfPace: number
      paceDifference: number
      evenness: number
    }
    lapSplits: Array<{
      lap: number
      distance: number
      time: number
      pace: string
      paceSeconds: number
    }>
    surges: Array<{
      time: number
      increase: number
    }>
    time: number[]
  }

  const {
    data: streams,
    pending: loading,
    error: fetchError
  } = await useFetch<PacingStreams>(endpoint, {
    lazy: true
  })

  const error = computed(() => {
    if (fetchError.value) {
      return fetchError.value.message || 'Failed to load pacing data'
    }
    return null
  })

  const showAllSurges = ref(false)
  const showSplits = ref(false)

  // Calculate surge position as percentage of total workout time
  function getSurgePosition(surgeTime: number): number {
    if (!streams.value?.time || streams.value.time.length === 0) return 0
    const totalTime = streams.value.time[streams.value.time.length - 1]
    if (!totalTime) return 0
    return (surgeTime / totalTime) * 100
  }

  function formatPace(paceMinPerKm: number | null | undefined): string {
    if (!paceMinPerKm) return 'N/A'
    const minutes = Math.floor(paceMinPerKm)
    const seconds = Math.round((paceMinPerKm - minutes) * 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}/km`
  }

  function formatPaceSeconds(paceSeconds: number | null | undefined): string {
    if (!paceSeconds) return 'N/A'
    const minutes = Math.floor(paceSeconds / 60)
    const seconds = Math.round(paceSeconds % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}/km`
  }

  function formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.round(seconds % 60)

    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  function formatDistance(meters: number): string {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(2)} km`
    }
    return `${Math.round(meters)} m`
  }

  function formatStrategy(strategy: string): string {
    const strategies: Record<string, string> = {
      even: 'Even Pacing',
      positive_split: 'Positive Split',
      negative_split: 'Negative Split',
      slightly_uneven: 'Slightly Uneven',
      insufficient_data: 'Insufficient Data'
    }
    return strategies[strategy] || strategy
  }

  function getSplitClass(split: any, allSplits: any[]): string {
    if (allSplits.length < 2) return ''

    const avgPace =
      allSplits.reduce((sum: number, s: any) => sum + s.paceSeconds, 0) / allSplits.length
    const deviation = ((split.paceSeconds - avgPace) / avgPace) * 100

    if (Math.abs(deviation) < 3) return 'bg-blue-50 dark:bg-blue-900/20'
    if (deviation > 0) return 'bg-red-50 dark:bg-red-900/20'
    return 'bg-green-50 dark:bg-green-900/20'
  }

  function getDifferenceClass(difference: number): string {
    if (Math.abs(difference) < 5) return 'text-green-600 dark:text-green-400'
    if (difference > 0) return 'text-orange-600 dark:text-orange-400'
    return 'text-blue-600 dark:text-blue-400'
  }

  function getEvennessClass(score: number): string {
    if (score >= 80) return 'bg-green-500'
    if (score >= 60) return 'bg-blue-500'
    if (score >= 40) return 'bg-orange-500'
    return 'bg-red-500'
  }
</script>

<style scoped>
  /* Minimal custom styles - most styling is done with Tailwind classes in template */
</style>
