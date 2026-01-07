<template>
  <div class="space-y-6">
    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-8">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
        <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">Analyzing intervals...</p>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="text-center py-8 bg-white dark:bg-gray-800 rounded-lg shadow">
      <p class="text-red-600 dark:text-red-400">{{ error }}</p>
    </div>

    <!-- Data Display -->
    <div v-else-if="data" class="space-y-6">
      <!-- Visual Chart -->
      <div v-if="chartConfig" class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 h-80">
        <h3
          class="text-sm font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider"
        >
          Interval Visualization
        </h3>
        <Line :data="chartConfig.data" :options="chartConfig.options" />
      </div>

      <!-- Metrics Overview Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <!-- Intervals Count -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-primary-500">
          <div class="text-sm text-gray-500 dark:text-gray-400">Work Intervals</div>
          <div class="text-2xl font-bold text-gray-900 dark:text-white">
            {{ workIntervals.length }}
          </div>
          <div class="text-xs text-gray-500 mt-1">
            Total Work Time: {{ formatDuration(totalWorkDuration) }}
          </div>
        </div>

        <!-- Best Effort (Context Aware) -->
        <div
          v-if="bestEffort"
          class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-amber-500"
        >
          <div class="text-sm text-gray-500 dark:text-gray-400">Best 5min Effort</div>
          <div class="text-2xl font-bold text-gray-900 dark:text-white">
            {{ formatValue(bestEffort.value, bestEffort.metric) }}
          </div>
          <div class="text-xs text-gray-500 mt-1">
            {{ formatTime(bestEffort.start_time) }} - {{ formatTime(bestEffort.end_time) }}
          </div>
        </div>

        <!-- HR Recovery -->
        <div
          v-if="data.recovery"
          class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-green-500"
        >
          <div class="text-sm text-gray-500 dark:text-gray-400">HR Recovery (1min)</div>
          <div class="flex items-end gap-2">
            <div class="text-2xl font-bold text-gray-900 dark:text-white">
              -{{ data.recovery.drops }} <span class="text-sm font-normal text-gray-500">bpm</span>
            </div>
          </div>
          <div class="text-xs text-gray-500 mt-1">
            {{ data.recovery.peakHr }} bpm → {{ data.recovery.recoveryHr }} bpm
          </div>
        </div>
      </div>

      <!-- Intervals Table -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div
          class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          @click="showTable = !showTable"
        >
          <div class="flex items-center gap-2">
            <UIcon
              :name="showTable ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
              class="w-5 h-5 text-gray-500"
            />
            <h3 class="text-lg font-bold text-gray-900 dark:text-white">Detected Intervals</h3>
          </div>
          <UBadge
            :color="
              data.detectionMetric === 'power'
                ? 'primary'
                : data.detectionMetric === 'pace'
                  ? 'info'
                  : 'error'
            "
            variant="subtle"
          >
            Based on {{ data.detectionMetric }}
          </UBadge>
        </div>

        <div v-if="showTable" class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th
                  scope="col"
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  Type
                </th>
                <th
                  scope="col"
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  Start
                </th>
                <th
                  scope="col"
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  Duration
                </th>
                <th
                  scope="col"
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  Avg Power
                </th>
                <th
                  scope="col"
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  Avg HR
                </th>
                <th
                  v-if="hasPace"
                  scope="col"
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  Avg Pace
                </th>
              </tr>
            </thead>
            <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              <tr
                v-for="(interval, index) in data.intervals"
                :key="index"
                :class="interval.type === 'WORK' ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''"
              >
                <td class="px-6 py-4 whitespace-nowrap">
                  <UBadge :color="getIntervalColor(interval.type)" variant="subtle" size="xs">
                    {{ interval.type }}
                  </UBadge>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {{ formatTime(interval.start_time) }}
                </td>
                <td
                  class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white"
                >
                  {{ formatDuration(interval.duration) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                  <span v-if="interval.avg_power">{{ Math.round(interval.avg_power) }}W</span>
                  <span v-else class="text-gray-400">-</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                  <span v-if="interval.avg_heartrate"
                    >{{ Math.round(interval.avg_heartrate) }} bpm</span
                  >
                  <span v-else class="text-gray-400">-</span>
                </td>
                <td
                  v-if="hasPace"
                  class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white"
                >
                  <span v-if="interval.avg_pace">{{ formatPace(interval.avg_pace) }}</span>
                  <span v-else class="text-gray-400">-</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Peak Efforts Grid -->
      <div v-if="peakEfforts.length > 0" class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4">Peak Efforts</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div
            v-for="peak in peakEfforts"
            :key="peak.duration"
            class="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-700"
          >
            <div class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
              {{ peak.duration_label }}
            </div>
            <div class="text-xl font-bold text-primary-600 dark:text-primary-400 mt-1">
              {{ formatValue(peak.value, peak.metric) }}
            </div>
            <div class="text-xs text-gray-400 mt-1">
              {{ formatTime(peak.start_time) }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { Line } from 'vue-chartjs'
  import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
  } from 'chart.js'
  import annotationPlugin from 'chartjs-plugin-annotation'

  ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler,
    annotationPlugin
  )

  const props = defineProps<{
    workoutId: string
    publicToken?: string
  }>()

  const loading = ref(true)
  const error = ref<string | null>(null)
  const data = ref<any>(null)
  const showTable = ref(false)

  // Fetch interval data
  async function fetchIntervals() {
    loading.value = true
    error.value = null
    try {
      const endpoint = props.publicToken
        ? `/api/share/workouts/${props.publicToken}/intervals`
        : `/api/workouts/${props.workoutId}/intervals`

      data.value = await $fetch(endpoint)
    } catch (e: any) {
      console.error('Error fetching intervals:', e)
      error.value = e.data?.message || 'Failed to load interval analysis'
    } finally {
      loading.value = false
    }
  }

  // Chart Configuration
  const chartConfig = computed(() => {
    if (!data.value?.chartData) return null

    const isDark = document.documentElement.classList.contains('dark')
    const metric = data.value.detectionMetric || 'power'

    // Choose dataset based on detection metric
    let datasetLabel = 'Power'
    let datasetData = data.value.chartData.power
    let color = 'rgb(168, 85, 247)' // Purple
    let unit = 'W'

    if (metric === 'heartrate' || (!datasetData.length && data.value.chartData.heartrate.length)) {
      datasetLabel = 'Heart Rate'
      datasetData = data.value.chartData.heartrate
      color = 'rgb(239, 68, 68)' // Red
      unit = 'bpm'
    } else if (metric === 'pace' || (!datasetData.length && data.value.chartData.pace.length)) {
      datasetLabel = 'Pace'
      datasetData = data.value.chartData.pace
      color = 'rgb(59, 130, 246)' // Blue
      unit = 'm/s'
    }

    // Create annotations for intervals
    const annotations: any = {}

    if (data.value.intervals) {
      data.value.intervals.forEach((interval: any, index: number) => {
        if (interval.type === 'WORK') {
          annotations[`box${index}`] = {
            type: 'box',
            xMin: formatTime(interval.start_time),
            xMax: formatTime(interval.end_time),
            backgroundColor: isDark ? 'rgba(74, 222, 128, 0.1)' : 'rgba(74, 222, 128, 0.2)', // Green tint
            borderWidth: 0,
            label: {
              content: 'WORK',
              display: false
            }
          }
        }
      })
    }

    return {
      data: {
        labels: data.value.chartData.time.map((t: number) => formatTime(t)),
        datasets: [
          {
            label: datasetLabel,
            data: datasetData,
            borderColor: color,
            backgroundColor: color.replace('rgb', 'rgba').replace(')', ', 0.1)'),
            borderWidth: 1.5,
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: true,
            tension: 0.2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index' as const,
          intersect: false
        },
        plugins: {
          annotation: {
            annotations
          },
          legend: {
            display: true,
            labels: {
              color: isDark ? '#9CA3AF' : '#4B5563'
            }
          },
          tooltip: {
            callbacks: {
              label: function (context: any) {
                return `${context.dataset.label}: ${Math.round(context.parsed.y)} ${unit}`
              },
              afterBody: function (tooltipItems: any[]) {
                // Find if we are hovering over an interval
                const index = tooltipItems[0].dataIndex
                const time = data.value.chartData.time[index]

                const interval = data.value.intervals.find(
                  (i: any) => i.start_time <= time && i.end_time >= time && i.type === 'WORK'
                )

                if (interval) {
                  return [
                    '',
                    `Interval: ${formatDuration(interval.duration)}`,
                    `Avg Power: ${Math.round(interval.avg_power || 0)}W`,
                    `Avg HR: ${Math.round(interval.avg_heartrate || 0)} bpm`
                  ]
                }
                return []
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              display: false
            },
            ticks: {
              color: isDark ? '#9CA3AF' : '#6B7280',
              maxTicksLimit: 8
            }
          },
          y: {
            grid: {
              color: isDark ? 'rgba(75, 85, 99, 0.2)' : 'rgba(209, 213, 219, 0.4)'
            },
            ticks: {
              color: isDark ? '#9CA3AF' : '#6B7280'
            }
          }
        }
      }
    }
  })

  // Computed properties for display logic
  const workIntervals = computed(() => {
    return data.value?.intervals.filter((i: any) => i.type === 'WORK') || []
  })

  const totalWorkDuration = computed(() => {
    return workIntervals.value.reduce((sum: number, i: any) => sum + i.duration, 0)
  })

  const bestEffort = computed(() => {
    if (!data.value?.peaks) return null

    // Prefer Power > Pace > HR
    const peaks =
      data.value.peaks.power.length > 0
        ? data.value.peaks.power
        : data.value.peaks.pace.length > 0
          ? data.value.peaks.pace
          : data.value.peaks.heartrate

    // Return 5min effort (index 3 usually: 5s, 30s, 1m, 5m...) or best available
    return peaks.find((p: any) => p.duration === 300) || peaks[0]
  })

  const peakEfforts = computed(() => {
    if (!data.value?.peaks) return []
    return data.value.peaks.power.length > 0
      ? data.value.peaks.power
      : data.value.peaks.pace.length > 0
        ? data.value.peaks.pace
        : data.value.peaks.heartrate
  })

  const hasPace = computed(() => {
    return data.value?.intervals.some((i: any) => i.avg_pace)
  })

  // Helper functions
  function getIntervalColor(type: string) {
    switch (type) {
      case 'WORK':
        return 'primary'
      case 'RECOVERY':
        return 'neutral'
      case 'WARMUP':
        return 'warning'
      case 'COOLDOWN':
        return 'info'
      default:
        return 'neutral'
    }
  }

  function formatDuration(seconds: number) {
    const mins = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  function formatTime(seconds: number) {
    const mins = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    if (mins > 60) {
      const hours = Math.floor(mins / 60)
      const remainingMins = mins % 60
      return `${hours}h ${remainingMins}m`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  function formatValue(val: number, metric: string) {
    if (metric === 'power') return `${Math.round(val)}W`
    if (metric === 'heartrate') return `${Math.round(val)} bpm`
    if (metric === 'pace') return formatPace(val)
    return val
  }

  function formatPace(mps: number) {
    if (!mps) return '-'
    const paceMinPerKm = 16.6667 / mps // convert m/s to min/km (1000m / 60s = 16.66)
    const mins = Math.floor(paceMinPerKm)
    const secs = Math.round((paceMinPerKm - mins) * 60)
    return `${mins}:${secs.toString().padStart(2, '0')}/km`
  }

  onMounted(() => {
    fetchIntervals()
  })
</script>
