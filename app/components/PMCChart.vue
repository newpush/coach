<template>
  <div class="pmc-chart">
    <div v-if="loading" class="flex justify-center items-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary" />
    </div>

    <div v-else-if="error" class="text-center py-12">
      <p class="text-red-600 dark:text-red-400">{{ error }}</p>
    </div>

    <div v-else-if="pmcData">
      <!-- Summary Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div
          class="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/30 rounded-lg p-4 shadow"
        >
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-purple-600 dark:text-purple-400 font-semibold"
              >CTL (Fitness)</span
            >
            <UIcon
              name="i-heroicons-arrow-trending-up"
              class="w-4 h-4 text-purple-600 dark:text-purple-400"
            />
          </div>
          <div class="text-2xl font-bold text-purple-900 dark:text-purple-100">
            {{ (pmcData.summary?.currentCTL ?? 0).toFixed(1) }}
          </div>
          <div class="text-xs text-purple-700 dark:text-purple-300 mt-1">Chronic Training Load</div>
        </div>

        <div
          class="bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/30 rounded-lg p-4 shadow"
        >
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-yellow-600 dark:text-yellow-400 font-semibold"
              >ATL (Fatigue)</span
            >
            <UIcon name="i-heroicons-bolt" class="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
          </div>
          <div class="text-2xl font-bold text-yellow-900 dark:text-yellow-100">
            {{ (pmcData.summary?.currentATL ?? 0).toFixed(1) }}
          </div>
          <div class="text-xs text-yellow-700 dark:text-yellow-300 mt-1">Acute Training Load</div>
        </div>

        <div
          :class="getFormColorClass(pmcData.summary?.currentTSB ?? 0)"
          class="rounded-lg p-4 shadow"
        >
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-semibold">TSB (Form)</span>
            <UIcon name="i-heroicons-chart-bar" class="w-4 h-4" />
          </div>
          <div class="text-2xl font-bold">
            {{ (pmcData.summary?.currentTSB ?? 0) > 0 ? '+' : ''
            }}{{ (pmcData.summary?.currentTSB ?? 0).toFixed(1) }}
          </div>
          <div class="text-xs mt-1">
            <span class="capitalize">{{ pmcData.summary?.formStatus || 'N/A' }}</span>
            <span class="mx-1 opacity-50">•</span>
            <span>Training Stress Balance</span>
          </div>
        </div>

        <div
          class="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/30 rounded-lg p-4 shadow"
        >
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-blue-600 dark:text-blue-400 font-semibold">Avg TSS</span>
            <UIcon name="i-heroicons-calculator" class="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div class="text-2xl font-bold text-blue-900 dark:text-blue-100">
            {{ (pmcData.summary?.avgTSS ?? 0).toFixed(1) }}
          </div>
          <div class="text-xs text-blue-700 dark:text-blue-300 mt-1">Training Stress Score</div>
        </div>
      </div>

      <!-- Chart -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div style="height: 400px">
          <Line :data="chartData" :options="chartOptions" />
        </div>
      </div>

      <!-- Info Section -->
      <div
        class="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
      >
        <h4 class="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
          Understanding PMC
        </h4>
        <ul class="text-xs text-blue-800 dark:text-blue-200 space-y-1">
          <li>
            <strong>CTL (Fitness):</strong> Long-term training load (~42 days). Higher = more
            fitness.
          </li>
          <li>
            <strong>ATL (Fatigue):</strong> Short-term training load (~7 days). Higher = more
            fatigue.
          </li>
          <li>
            <strong>TSB (Form):</strong> CTL - ATL. Positive = fresh, negative = fatigued, -10 to +5
            = optimal racing form.
          </li>
        </ul>
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

  ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
  )

  const props = defineProps<{
    days?: number
  }>()

  const loading = ref(true)
  const error = ref<string | null>(null)
  const pmcData = ref<any>(null)

  // Fetch PMC data
  async function fetchPMCData() {
    loading.value = true
    error.value = null

    try {
      const data = await $fetch('/api/performance/pmc', {
        query: { days: props.days || 90 }
      })
      pmcData.value = data
    } catch (e: any) {
      console.error('Error fetching PMC data:', e)
      error.value = e.data?.message || e.message || 'Failed to load PMC data'
    } finally {
      loading.value = false
    }
  }

  function getFormColorClass(tsb: number) {
    if (tsb >= 5) {
      return 'bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/30 text-green-900 dark:text-green-100'
    } else if (tsb >= -10) {
      return 'bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/30 text-orange-900 dark:text-orange-100'
    } else {
      return 'bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/30 text-red-900 dark:text-red-100'
    }
  }

  // Chart data computed property
  const chartData = computed(() => {
    if (!pmcData.value?.data) return { labels: [], datasets: [] }

    const data = pmcData.value.data
    const labels = data.map((d: any) =>
      new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    )

    return {
      labels,
      datasets: [
        {
          label: 'CTL (Fitness)',
          data: data.map((d: any) => d.ctl),
          borderColor: 'rgb(171, 131, 186)',
          backgroundColor: 'rgba(171, 131, 186, 0.1)',
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 4,
          tension: 0.4
        },
        {
          label: 'ATL (Fatigue)',
          data: data.map((d: any) => d.atl),
          borderColor: 'rgb(245, 226, 59)',
          backgroundColor: 'rgba(245, 226, 59, 0.1)',
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 4,
          tension: 0.4
        },
        {
          label: 'TSB (Form)',
          data: data.map((d: any) => d.tsb),
          borderColor: 'rgb(193, 125, 55)',
          backgroundColor: 'rgba(193, 125, 55, 0.3)',
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 4,
          tension: 0.4,
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
        display: true,
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 15,
          color: 'rgb(107, 114, 128)'
        }
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        callbacks: {
          label: function (context: any) {
            let label = context.dataset.label || ''
            if (label) {
              label += ': '
            }
            if (context.parsed.y !== null) {
              label += context.parsed.y.toFixed(1)
            }
            return label
          }
        }
      }
    },
    scales: {
      x: {
        display: true,
        grid: {
          display: false
        },
        ticks: {
          color: 'rgb(107, 114, 128)'
        }
      },
      y: {
        display: true,
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

  // Watch for days prop changes
  watch(
    () => props.days,
    () => {
      fetchPMCData()
    }
  )

  // Load data on mount
  onMounted(() => {
    fetchPMCData()
  })
</script>

<style scoped>
  .pmc-chart {
    width: 100%;
  }
</style>
