<template>
  <div class="ftp-evolution-chart">
    <div v-if="loading" class="flex justify-center items-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary" />
    </div>

    <div v-else-if="error" class="text-center py-12">
      <p class="text-red-600 dark:text-red-400">{{ error }}</p>
    </div>

    <div v-else-if="ftpData">
      <div v-if="ftpData.data.length === 0" class="text-center py-12">
        <UIcon name="i-heroicons-chart-bar-square" class="w-12 h-12 mx-auto mb-4 text-gray-400" />
        <p class="text-gray-600 dark:text-gray-400">No FTP data available for this period</p>
      </div>

      <div v-else class="space-y-6">
        <!-- Summary Stats -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div
            class="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/30 rounded-lg p-4 shadow"
          >
            <div class="text-xs text-blue-600 dark:text-blue-400 font-semibold mb-1">
              Current FTP
            </div>
            <div class="text-2xl font-bold text-blue-900 dark:text-blue-100">
              {{ ftpData.summary.currentFTP || '-' }}
            </div>
            <div class="text-xs text-blue-700 dark:text-blue-300 mt-1">watts</div>
          </div>

          <div
            class="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/30 rounded-lg p-4 shadow"
          >
            <div class="text-xs text-green-600 dark:text-green-400 font-semibold mb-1">
              Peak FTP
            </div>
            <div class="text-2xl font-bold text-green-900 dark:text-green-100">
              {{ ftpData.summary.peakFTP || '-' }}
            </div>
            <div class="text-xs text-green-700 dark:text-green-300 mt-1">watts</div>
          </div>

          <div
            class="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/30 rounded-lg p-4 shadow"
          >
            <div class="text-xs text-purple-600 dark:text-purple-400 font-semibold mb-1">
              Starting FTP
            </div>
            <div class="text-2xl font-bold text-purple-900 dark:text-purple-100">
              {{ ftpData.summary.startingFTP || '-' }}
            </div>
            <div class="text-xs text-purple-700 dark:text-purple-300 mt-1">watts</div>
          </div>

          <div
            :class="getImprovementClass(ftpData.summary.improvement)"
            class="rounded-lg p-4 shadow"
          >
            <div class="text-xs font-semibold mb-1">Improvement</div>
            <div class="text-2xl font-bold">
              {{
                ftpData.summary.improvement !== null
                  ? (ftpData.summary.improvement > 0 ? '+' : '') + ftpData.summary.improvement + '%'
                  : '-'
              }}
            </div>
            <div class="text-xs mt-1">vs start</div>
          </div>
        </div>

        <!-- Chart -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">FTP Over Time</h3>
          <div style="height: 300px">
            <Line :data="chartData" :options="chartOptions" />
          </div>
        </div>

        <!-- Info Section -->
        <div
          class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
        >
          <h4 class="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">About FTP</h4>
          <p class="text-xs text-blue-800 dark:text-blue-200 mb-2">
            FTP (Functional Threshold Power) is the maximum power you can sustain for approximately
            one hour.
          </p>
          <ul class="text-xs text-blue-800 dark:text-blue-200 space-y-1">
            <li>
              <strong>Training Zones:</strong> FTP is used to calculate personalized training zones
            </li>
            <li>
              <strong>Progress Tracking:</strong> Monitor improvements in your aerobic fitness over
              time
            </li>
            <li>
              <strong>Testing:</strong> Typically measured with a 20-minute test (95% of 20min
              power)
            </li>
          </ul>
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
    months?: number | string
    sport?: string
  }>()

  const loading = ref(true)
  const error = ref<string | null>(null)
  const ftpData = ref<any>(null)

  // Fetch FTP evolution data
  async function fetchFTPData() {
    loading.value = true
    error.value = null

    try {
      const data = await $fetch('/api/performance/ftp-evolution', {
        query: {
          months: props.months || 12,
          sport: props.sport
        }
      })
      ftpData.value = data
    } catch (e: any) {
      console.error('Error fetching FTP data:', e)
      error.value = e.data?.message || e.message || 'Failed to load FTP data'
    } finally {
      loading.value = false
    }
  }

  function getImprovementClass(improvement: number | null) {
    if (improvement === null) {
      return 'bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900/20 dark:to-gray-800/30 text-gray-900 dark:text-gray-100'
    }
    if (improvement >= 5) {
      return 'bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/30 text-green-900 dark:text-green-100'
    } else if (improvement >= 0) {
      return 'bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/30 text-yellow-900 dark:text-yellow-100'
    } else {
      return 'bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/30 text-red-900 dark:text-red-100'
    }
  }

  // Chart data computed property
  const chartData = computed(() => {
    if (!ftpData.value?.data || ftpData.value.data.length === 0) {
      return { labels: [], datasets: [] }
    }

    const data = ftpData.value.data
    const labels = data.map((d: any) => d.month)
    const ftpValues = data.map((d: any) => d.ftp)

    return {
      labels,
      datasets: [
        {
          label: 'FTP (watts)',
          data: ftpValues,
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 3,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointBackgroundColor: 'rgb(59, 130, 246)',
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
        display: false
      },
      tooltip: {
        callbacks: {
          label: function (context: any) {
            return `FTP: ${context.parsed.y}W`
          }
        }
      }
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: 'Month',
          color: 'rgb(107, 114, 128)'
        },
        grid: {
          display: false
        },
        ticks: {
          color: 'rgb(107, 114, 128)'
        }
      },
      y: {
        display: true,
        title: {
          display: true,
          text: 'FTP (watts)',
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
    }
  }

  // Watch for prop changes
  watch(
    () => [props.months, props.sport],
    () => {
      fetchFTPData()
    }
  )

  // Load data on mount
  onMounted(() => {
    fetchFTPData()
  })
</script>

<style scoped>
  .ftp-evolution-chart {
    width: 100%;
  }
</style>
