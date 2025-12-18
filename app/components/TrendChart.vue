<template>
  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
    <div v-if="!data || data.length === 0" class="text-center py-12 text-gray-500">
      No score data available for this period
    </div>
    
    <div v-else class="space-y-4">
      <!-- Legend -->
      <div class="flex flex-wrap gap-4 justify-center text-sm">
        <div v-for="metric in visibleMetrics" :key="metric.key" class="flex items-center gap-2">
          <div :class="['w-3 h-3 rounded-full', metric.color]"></div>
          <span class="text-gray-700 dark:text-gray-300">{{ metric.label }}</span>
        </div>
      </div>
      
      <!-- Chart -->
      <div class="relative" style="height: 300px;">
        <Line :data="chartData" :options="chartOptions" />
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
  data: any[]
  type: 'workout' | 'nutrition'
}>()

const theme = useTheme()

const metrics = computed(() => {
  if (props.type === 'workout') {
    return [
      { key: 'overallScore', label: 'Overall', color: 'bg-yellow-500', strokeColor: theme.colors.value.get('amber', 500) },
      { key: 'technicalScore', label: 'Technical', color: 'bg-blue-500', strokeColor: theme.colors.value.get('blue', 500) },
      { key: 'effortScore', label: 'Effort', color: 'bg-red-500', strokeColor: theme.colors.value.get('red', 500) },
      { key: 'pacingScore', label: 'Pacing', color: 'bg-green-500', strokeColor: theme.colors.value.get('green', 500) },
      { key: 'executionScore', label: 'Execution', color: 'bg-purple-500', strokeColor: theme.colors.value.get('purple', 500) }
    ]
  } else {
    return [
      { key: 'overallScore', label: 'Overall', color: 'bg-yellow-500', strokeColor: theme.colors.value.get('amber', 500) },
      { key: 'macroBalanceScore', label: 'Macro Balance', color: 'bg-blue-500', strokeColor: theme.colors.value.get('blue', 500) },
      { key: 'qualityScore', label: 'Quality', color: 'bg-green-500', strokeColor: theme.colors.value.get('green', 500) },
      { key: 'adherenceScore', label: 'Adherence', color: 'bg-purple-500', strokeColor: theme.colors.value.get('purple', 500) },
      { key: 'hydrationScore', label: 'Hydration', color: 'bg-cyan-500', strokeColor: theme.colors.value.get('cyan', 500) }
    ]
  }
})

const visibleMetrics = computed(() => metrics.value)

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const chartData = computed(() => {
  if (!props.data || props.data.length === 0) {
    return { labels: [], datasets: [] }
  }

  const labels = props.data.map(item => formatDate(item.date))
  
  const datasets = visibleMetrics.value.map(metric => ({
    label: metric.label,
    data: props.data.map(item => item[metric.key] || 0),
    borderColor: metric.strokeColor,
    backgroundColor: metric.strokeColor + '1A', // 1A is ~10% opacity in hex
    tension: 0.4,
    borderWidth: 2,
    pointRadius: 4,
    pointHoverRadius: 6,
    pointBackgroundColor: metric.strokeColor,
    pointBorderColor: '#fff',
    pointHoverBackgroundColor: '#fff',
    pointHoverBorderColor: metric.strokeColor,
    pointBorderWidth: 2
  }))

  return { labels, datasets }
})

const chartOptions = computed(() => ({
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
      backgroundColor: theme.isDark.value ? '#1f2937' : '#ffffff',
      titleColor: theme.isDark.value ? '#f3f4f6' : '#111827',
      bodyColor: theme.isDark.value ? '#d1d5db' : '#374151',
      borderColor: theme.isDark.value ? '#374151' : '#e5e7eb',
      borderWidth: 1,
      padding: 12,
      displayColors: true,
      callbacks: {
        label: (context: any) => {
          return `${context.dataset.label}: ${context.parsed.y.toFixed(1)}/10`
        }
      }
    }
  },
  scales: {
    x: {
      grid: {
        display: false,
        color: theme.colors.value.chartGrid
      },
      ticks: {
        color: theme.colors.value.chartText,
        font: {
          size: 11,
          weight: 'bold' as const
        },
        maxRotation: 0,
        autoSkipPadding: 20
      },
      border: {
        display: false
      }
    },
    y: {
      min: 0,
      max: 10,
      ticks: {
        stepSize: 2,
        color: theme.colors.value.chartText,
        font: {
          size: 11
        }
      },
      grid: {
        color: theme.colors.value.chartGrid
      },
      border: {
        display: false
      }
    }
  }
}))
</script>