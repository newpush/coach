<template>
  <div class="space-y-6">
    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-8">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
        <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">Loading timeline data...</p>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="text-center py-8">
      <p class="text-sm text-gray-600 dark:text-gray-400">{{ error }}</p>
    </div>

    <!-- No Data State -->
    <div v-else-if="!hasStreamData" class="text-center py-8 bg-gray-50 dark:bg-gray-900 rounded-lg">
      <p class="text-sm text-gray-600 dark:text-gray-400">No timeline data available for this workout</p>
      <p class="text-xs text-gray-500 dark:text-gray-500 mt-2">Stream data may not have been captured during the activity</p>
    </div>

    <!-- Timeline Charts -->
    <div v-else class="space-y-6">
      <!-- Metric Selection Buttons -->
      <div class="flex flex-wrap gap-2">
        <button
          v-for="metric in availableMetrics"
          :key="metric.key"
          @click="toggleMetric(metric.key)"
          :class="[
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            selectedMetrics.includes(metric.key)
              ? 'bg-primary-500 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
          ]"
        >
          {{ metric.label }}
        </button>
      </div>

      <!-- Compact Stacked Charts -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div
          v-for="(metric, index) in selectedMetrics"
          :key="metric"
          :class="[
            'border-gray-200 dark:border-gray-700',
            index < selectedMetrics.length - 1 ? 'border-b' : ''
          ]"
        >
          <div class="px-4 py-2 bg-gray-50 dark:bg-gray-900">
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
              {{ getMetricLabel(metric) }}
            </span>
          </div>
          <div class="px-4 py-2" style="height: 150px;">
            <Line
              :data="getChartData(metric)"
              :options="getChartOptions(metric, index === selectedMetrics.length - 1)"
            />
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

// Register Chart.js components
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

interface Props {
  workoutId: string
}

const props = defineProps<Props>()

const loading = ref(true)
const error = ref<string | null>(null)
const streamData = ref<any>(null)
const selectedMetrics = ref<string[]>([])

interface Metric {
  key: string
  label: string
  color: string
  unit: string
}

const availableMetrics = computed<Metric[]>(() => {
  if (!streamData.value) return []
  
  const metrics: Metric[] = []
  
  if (streamData.value.heartrate && streamData.value.heartrate.length > 0) {
    metrics.push({ key: 'heartrate', label: 'Heart Rate', color: 'rgb(239, 68, 68)', unit: 'bpm' })
  }
  if (streamData.value.altitude && streamData.value.altitude.length > 0) {
    metrics.push({ key: 'altitude', label: 'Altitude', color: 'rgb(34, 197, 94)', unit: 'm' })
  }
  if (streamData.value.velocity && streamData.value.velocity.length > 0) {
    metrics.push({ key: 'velocity', label: 'Speed/Pace', color: 'rgb(59, 130, 246)', unit: 'm/s' })
  }
  if (streamData.value.watts && streamData.value.watts.length > 0) {
    metrics.push({ key: 'watts', label: 'Power', color: 'rgb(168, 85, 247)', unit: 'W' })
  }
  if (streamData.value.cadence && streamData.value.cadence.length > 0) {
    metrics.push({ key: 'cadence', label: 'Cadence', color: 'rgb(245, 158, 11)', unit: 'rpm' })
  }
  
  return metrics
})

const hasStreamData = computed(() => {
  return streamData.value && availableMetrics.value.length > 0
})

// Fetch stream data
async function fetchStreamData() {
  loading.value = true
  error.value = null
  
  try {
    const data = await $fetch(`/api/workouts/${props.workoutId}/streams`)
    streamData.value = data
    
    // Auto-select appropriate metrics:
    // 1. If HR exists, select it (most important for most workouts)
    // 2. Otherwise, select the first 2 available metrics for variety
    if (availableMetrics.value.length > 0) {
      const hrMetric = availableMetrics.value.find(m => m.key === 'heartrate')
      if (hrMetric) {
        selectedMetrics.value = ['heartrate']
      } else {
        // No HR, select first 2 metrics (e.g., altitude + velocity for skiing)
        selectedMetrics.value = availableMetrics.value.slice(0, Math.min(2, availableMetrics.value.length)).map(m => m.key)
      }
    }
  } catch (e: any) {
    console.error('Error fetching stream data:', e)
    error.value = e.data?.message || 'Failed to load timeline data'
  } finally {
    loading.value = false
  }
}

function toggleMetric(metricKey: string) {
  const index = selectedMetrics.value.indexOf(metricKey)
  if (index > -1) {
    // Remove if already selected (but keep at least one)
    if (selectedMetrics.value.length > 1) {
      selectedMetrics.value.splice(index, 1)
    }
  } else {
    // Add if not selected
    selectedMetrics.value.push(metricKey)
  }
}

function getMetricLabel(key: string): string {
  const metric = availableMetrics.value.find(m => m.key === key)
  return metric?.label || key
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

function getChartData(metricKey: string) {
  if (!streamData.value || !streamData.value[metricKey]) {
    return { labels: [], datasets: [] }
  }
  
  const metric = availableMetrics.value.find(m => m.key === metricKey)
  if (!metric) return { labels: [], datasets: [] }
  
  const time = streamData.value.time || []
  const values = streamData.value[metricKey] || []
  
  // Sample data for performance (every 10th point if more than 500 points)
  const sampleRate = values.length > 500 ? 10 : 1
  const sampledTime = time.filter((_: any, i: number) => i % sampleRate === 0)
  const sampledValues = values.filter((_: any, i: number) => i % sampleRate === 0)
  
  return {
    labels: sampledTime.map((t: number) => formatTime(t)),
    datasets: [
      {
        label: metric.label,
        data: sampledValues,
        borderColor: metric.color,
        backgroundColor: metric.color.replace('rgb', 'rgba').replace(')', ', 0.1)'),
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: true,
        tension: 0.4
      }
    ]
  }
}

function getChartOptions(metricKey: string, isLastChart: boolean = false) {
  const metric = availableMetrics.value.find(m => m.key === metricKey)
  const isDark = document.documentElement.classList.contains('dark')
  
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false
    },
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: {
          title: (context: any) => {
            return `Time: ${context[0].label}`
          },
          label: (context: any) => {
            return `${metric?.label}: ${context.parsed.y.toFixed(1)} ${metric?.unit}`
          }
        }
      }
    },
    scales: {
      x: {
        display: isLastChart,
        ticks: {
          color: isDark ? '#9CA3AF' : '#6B7280',
          maxRotation: 0,
          autoSkipPadding: 50,
          font: {
            size: 11
          }
        },
        grid: {
          display: false
        }
      },
      y: {
        display: true,
        position: 'right' as const,
        ticks: {
          color: isDark ? '#9CA3AF' : '#6B7280',
          font: {
            size: 11
          },
          callback: function(value: any) {
            return value.toFixed(0)
          }
        },
        grid: {
          color: isDark ? 'rgba(55, 65, 81, 0.3)' : 'rgba(229, 231, 235, 0.5)',
          drawBorder: false
        }
      }
    },
    layout: {
      padding: {
        left: 10,
        right: 10,
        top: 5,
        bottom: isLastChart ? 5 : 0
      }
    }
  }
}

// Load data on mount
onMounted(() => {
  fetchStreamData()
})
</script>