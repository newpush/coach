<template>
  <div class="efficiency-trend-chart">
    <div v-if="loading" class="flex justify-center items-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary" />
    </div>

    <div
      v-else-if="!trendData || !trendData.trends || trendData.trends.length === 0"
      class="text-center py-12"
    >
      <UIcon name="i-heroicons-chart-bar-slash" class="w-12 h-12 mx-auto mb-4 text-gray-400" />
      <p class="text-gray-600 dark:text-gray-400">No efficiency data available for this period</p>
    </div>

    <div v-else class="space-y-6">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Aerobic Efficiency Factor (EF)
          </h3>
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-500">Trend:</span>
            <UBadge
              :color="
                trendDirection === 'up'
                  ? 'primary'
                  : trendDirection === 'down'
                    ? 'error'
                    : 'neutral'
              "
              size="xs"
              variant="subtle"
            >
              {{
                trendDirection === 'up'
                  ? 'Improving'
                  : trendDirection === 'down'
                    ? 'Declining'
                    : 'Stable'
              }}
            </UBadge>
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
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler,
    TimeScale
  } from 'chart.js'
  import 'chartjs-adapter-date-fns'

  ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler,
    TimeScale
  )

  const props = defineProps<{
    days?: number
  }>()

  const loading = ref(true)
  const trendData = ref<any>(null)

  // Fetch efficiency trend data
  async function fetchTrendData() {
    loading.value = true

    try {
      const data = await $fetch('/api/scores/efficiency-trends', {
        query: { days: props.days || 90 }
      })
      trendData.value = data
    } catch (e: any) {
      console.error('Error fetching efficiency trends:', e)
      trendData.value = null
    } finally {
      loading.value = false
    }
  }

  // Watch for prop changes
  watch(
    () => props.days,
    () => {
      fetchTrendData()
    }
  )

  // Calculate trend direction (simple linear regression slope or start vs end comparison)
  const trendDirection = computed(() => {
    if (!trendData.value?.trends || trendData.value.trends.length < 2) return 'stable'

    const trends = trendData.value.trends
    // Simple moving average comparison (last 3 vs first 3)
    const window = Math.min(3, Math.floor(trends.length / 3))

    const startAvg =
      trends.slice(0, window).reduce((sum: number, t: any) => sum + t.efficiencyFactor, 0) / window
    const endAvg =
      trends.slice(-window).reduce((sum: number, t: any) => sum + t.efficiencyFactor, 0) / window

    const percentChange = (endAvg - startAvg) / startAvg

    if (percentChange > 0.02) return 'up'
    if (percentChange < -0.02) return 'down'
    return 'stable'
  })

  // Chart data
  const chartData = computed(() => {
    if (!trendData.value?.trends) return { labels: [], datasets: [] }

    const trends = trendData.value.trends

    return {
      labels: trends.map((t: any) => t.date),
      datasets: [
        {
          label: 'Efficiency Factor (NP/HR)',
          data: trends.map((t: any) => t.efficiencyFactor),
          borderColor: '#8b5cf6', // Violet 500
          backgroundColor: 'rgba(139, 92, 246, 0.1)',
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.3,
          fill: true
        }
      ]
    }
  })

  // Chart options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        callbacks: {
          label: function (context: any) {
            return `EF: ${context.parsed.y.toFixed(2)}`
          }
        }
      }
    },
    scales: {
      x: {
        type: 'time' as const,
        time: {
          unit: 'day' as const,
          displayFormats: {
            day: 'MMM d'
          }
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
        title: {
          display: true,
          text: 'EF Ratio',
          color: 'rgb(107, 114, 128)'
        },
        grid: {
          color: 'rgba(128, 128, 128, 0.1)'
        },
        ticks: {
          color: 'rgb(107, 114, 128)'
        }
      }
    },
    interaction: {
      mode: 'nearest' as const,
      axis: 'x' as const,
      intersect: false
    }
  }

  onMounted(() => {
    fetchTrendData()
  })
</script>

<style scoped>
  .efficiency-trend-chart {
    width: 100%;
  }
</style>
