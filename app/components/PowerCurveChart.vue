<template>
  <div class="power-curve-chart">
    <div v-if="loading" class="flex justify-center items-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary" />
    </div>

    <div v-else-if="!powerData || !chartData.datasets.length" class="text-center py-12">
      <UIcon name="i-heroicons-bolt-slash" class="w-12 h-12 mx-auto mb-4 text-gray-400" />
      <p class="text-gray-600 dark:text-gray-400">No power data available for this period</p>
    </div>

    <div v-else class="space-y-6">
      <!-- Chart -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Power Duration Curve
          </h3>
          <div class="flex gap-4 text-xs">
            <div class="flex items-center gap-1">
              <span class="w-3 h-3 rounded-full bg-emerald-500" />
              <span class="text-gray-600 dark:text-gray-400">Current Period</span>
            </div>
            <div class="flex items-center gap-1">
              <span class="w-3 h-3 rounded-full border border-gray-500 border-dashed" />
              <span class="text-gray-600 dark:text-gray-400">All Time Best</span>
            </div>
          </div>
        </div>
        <div style="height: 300px">
          <Line :data="chartData" :options="chartOptions" />
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
    LogarithmicScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
  } from 'chart.js'

  ChartJS.register(
    CategoryScale,
    LogarithmicScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
  )

  const props = defineProps<{
    // If provided, fetches data for a specific workout
    workoutId?: string
    publicToken?: string

    // If provided, fetches aggregate data for a period (Performance Page mode)
    days?: number | string
    sport?: string
  }>()

  const loading = ref(true)
  const powerData = ref<any>(null)

  // Format duration labels (e.g., 60s -> 1m)
  const formatDurationLabel = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
    return `${Math.floor(seconds / 3600)}h`
  }

  // Fetch power curve data
  async function fetchPowerCurve() {
    loading.value = true

    try {
      let endpoint = ''
      let query = {}

      if (props.publicToken) {
        endpoint = `/api/share/workouts/${props.publicToken}/power-curve`
      } else if (props.workoutId) {
        endpoint = `/api/workouts/${props.workoutId}/power-curve`
      } else {
        // Performance Page Mode
        endpoint = `/api/workouts/power-curve`
        query = {
          days: props.days || 90,
          sport: props.sport
        }
      }

      const data = await $fetch(endpoint, { query })
      powerData.value = data
    } catch (e: any) {
      console.error('Error fetching power curve:', e)
      powerData.value = null
    } finally {
      loading.value = false
    }
  }

  // Watch for prop changes to refetch
  watch(
    () => [props.days, props.sport],
    () => {
      if (!props.workoutId) {
        fetchPowerCurve()
      }
    }
  )

  // Chart data computed property
  const chartData = computed(() => {
    if (!powerData.value) return { labels: [], datasets: [] }

    // Handle Multi-Dataset Format (Performance Page)
    if (powerData.value.current && powerData.value.allTime) {
      // Extract unique durations from both datasets and sort
      const allDurations = new Set([
        ...powerData.value.current.map((p: any) => p.duration),
        ...powerData.value.allTime.map((p: any) => p.duration)
      ])
      const durations = Array.from(allDurations).sort((a: any, b: any) => a - b)
      const labels = durations.map((d: any) => formatDurationLabel(d))

      // Map data to match sorted durations
      const mapData = (sourceData: any[]) => {
        return durations.map((d: any) => {
          const point = sourceData.find((p: any) => p.duration === d)
          return point ? point.watts : null
        })
      }

      return {
        labels,
        datasets: [
          {
            label: 'Current Period',
            data: mapData(powerData.value.current),
            borderColor: '#10b981', // Emerald 500
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            borderWidth: 3,
            pointRadius: 4,
            tension: 0.4,
            fill: true
          },
          {
            label: 'All Time Best',
            data: mapData(powerData.value.allTime),
            borderColor: '#6b7280', // Gray 500
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 0,
            tension: 0.4,
            fill: false
          }
        ]
      }
    }

    // Handle Single Workout Format (Legacy/Detailed View)
    if (powerData.value.powerCurve) {
      const curve = powerData.value.powerCurve
      const labels = curve.map((point: any) => point.durationLabel)
      const powers = curve.map((point: any) => point.power)

      return {
        labels,
        datasets: [
          {
            label: 'Max Power (W)',
            data: powers,
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 3,
            pointRadius: 4,
            pointHoverRadius: 6,
            tension: 0.4,
            fill: true
          }
        ]
      }
    }

    return { labels: [], datasets: [] }
  })

  // Chart options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false // We use custom legend
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        callbacks: {
          label: function (context: any) {
            return `${context.dataset.label}: ${context.parsed.y}W`
          }
        }
      }
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: 'Duration',
          color: 'rgb(107, 114, 128)'
        },
        grid: {
          display: false
        },
        ticks: {
          color: 'rgb(107, 114, 128)',
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 8
        }
      },
      y: {
        display: true,
        title: {
          display: true,
          text: 'Power (watts)',
          color: 'rgb(107, 114, 128)'
        },
        grid: {
          color: 'rgba(128, 128, 128, 0.1)'
        },
        ticks: {
          color: 'rgb(107, 114, 128)'
        },
        beginAtZero: false
      }
    },
    interaction: {
      mode: 'nearest' as const,
      axis: 'x' as const,
      intersect: false
    }
  }

  // Load data on mount
  onMounted(() => {
    fetchPowerCurve()
  })
</script>

<style scoped>
  .power-curve-chart {
    width: 100%;
  }
</style>
