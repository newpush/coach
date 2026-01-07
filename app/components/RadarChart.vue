<template>
  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
    <div v-if="!hasScores" class="text-center py-12 text-gray-500">No score data available</div>

    <div v-else class="flex justify-center">
      <div class="w-full max-w-md">
        <Radar :data="chartData" :options="chartOptions" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { Radar } from 'vue-chartjs'
  import {
    Chart as ChartJS,
    RadialLinearScale,
    PointElement,
    LineElement,
    Filler,
    Tooltip,
    Legend
  } from 'chart.js'

  ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

  const props = defineProps<{
    scores: Record<string, number | null | undefined>
    type: 'workout' | 'nutrition'
  }>()

  const theme = useTheme()

  const labels = computed(() => {
    if (props.type === 'workout') {
      return ['Overall', 'Technical', 'Effort', 'Pacing', 'Execution']
    } else {
      return ['Overall', 'Macro Balance', 'Quality', 'Adherence', 'Hydration']
    }
  })

  const scoreKeys = computed(() => {
    if (props.type === 'workout') {
      return ['overall', 'technical', 'effort', 'pacing', 'execution']
    } else {
      return ['overall', 'macroBalance', 'quality', 'adherence', 'hydration']
    }
  })

  const chartColor = computed(() =>
    props.type === 'workout'
      ? theme.colors.value.get('blue', 500)
      : theme.colors.value.get('green', 500)
  )

  const hasScores = computed(() => {
    return Object.values(props.scores).some((score) => score != null && score !== undefined)
  })

  const chartData = computed(() => ({
    labels: labels.value,
    datasets: [
      {
        label: props.type === 'workout' ? 'Workout Scores' : 'Nutrition Scores',
        data: scoreKeys.value.map((key) => props.scores[key] || 0),
        backgroundColor: chartColor.value + '33', // ~20% opacity
        borderColor: chartColor.value,
        borderWidth: 2,
        pointBackgroundColor: chartColor.value,
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: chartColor.value,
        pointRadius: 5,
        pointHoverRadius: 7
      }
    ]
  }))

  const chartOptions = computed(() => ({
    responsive: true,
    maintainAspectRatio: true,
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
        callbacks: {
          label: (context: any) => {
            return `${context.label}: ${context.parsed.r.toFixed(1)}/10`
          }
        }
      }
    },
    scales: {
      r: {
        min: 0,
        max: 10,
        ticks: {
          stepSize: 2,
          color: theme.colors.value.chartText,
          backdropColor: 'transparent',
          font: {
            size: 10
          }
        },
        grid: {
          color: theme.colors.value.chartGrid
        },
        pointLabels: {
          color: theme.isDark.value ? '#d1d5db' : '#374151',
          font: {
            size: 11,
            weight: 'bold' as const
          }
        },
        angleLines: {
          color: theme.colors.value.chartGrid
        }
      }
    }
  }))
</script>
