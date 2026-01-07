<template>
  <div class="h-full">
    <div v-if="!hasScores" class="text-center py-8 text-gray-500 dark:text-gray-400">
      <p class="text-sm">No performance scores available</p>
    </div>

    <div v-else class="h-full">
      <Bar :data="chartData" :options="chartOptions" />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { Bar } from 'vue-chartjs'
  import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend
  } from 'chart.js'

  ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

  interface Props {
    scores: {
      overall?: number | null
      technical?: number | null
      effort?: number | null
      pacing?: number | null
      execution?: number | null
    }
  }

  const props = defineProps<Props>()
  const colorMode = useColorMode()

  const scoreData = computed(() => {
    const data = []
    const colors = []
    const labels = []

    if (props.scores.overall != null) {
      labels.push('Overall')
      data.push(props.scores.overall)
      colors.push('rgb(52, 168, 83)') // Green
    }
    if (props.scores.technical != null) {
      labels.push('Technical')
      data.push(props.scores.technical)
      colors.push('rgb(66, 133, 244)') // Blue
    }
    if (props.scores.effort != null) {
      labels.push('Effort')
      data.push(props.scores.effort)
      colors.push('rgb(52, 168, 83)') // Green
    }
    if (props.scores.pacing != null) {
      labels.push('Pacing')
      data.push(props.scores.pacing)
      colors.push('rgb(52, 168, 83)') // Green
    }
    if (props.scores.execution != null) {
      labels.push('Execution')
      data.push(props.scores.execution)
      colors.push('rgb(52, 168, 83)') // Green
    }

    return { labels, data, colors }
  })

  const hasScores = computed(() => {
    return Object.values(props.scores).some((score) => score != null && score !== undefined)
  })

  const chartData = computed(() => ({
    labels: scoreData.value.labels,
    datasets: [
      {
        data: scoreData.value.data,
        backgroundColor: scoreData.value.colors,
        borderRadius: 6,
        barThickness: 40
      }
    ]
  }))

  const chartOptions = computed(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: colorMode.value === 'dark' ? 'rgb(31, 41, 55)' : 'rgb(255, 255, 255)',
        titleColor: colorMode.value === 'dark' ? 'rgb(229, 231, 235)' : 'rgb(17, 24, 39)',
        bodyColor: colorMode.value === 'dark' ? 'rgb(209, 213, 219)' : 'rgb(55, 65, 81)',
        borderColor: colorMode.value === 'dark' ? 'rgb(75, 85, 99)' : 'rgb(229, 231, 235)',
        borderWidth: 1,
        padding: 12,
        displayColors: false,
        callbacks: {
          title: (context: any) => {
            return context[0].label
          },
          label: (context: any) => {
            return `Score: ${context.parsed.y}/10`
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
          color: colorMode.value === 'dark' ? 'rgb(156, 163, 175)' : 'rgb(107, 114, 128)',
          font: {
            size: 11,
            weight: 500
          }
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
          color: colorMode.value === 'dark' ? 'rgb(156, 163, 175)' : 'rgb(107, 114, 128)',
          font: {
            size: 11
          }
        },
        grid: {
          color: colorMode.value === 'dark' ? 'rgba(75, 85, 99, 0.2)' : 'rgba(229, 231, 235, 0.5)'
        },
        border: {
          display: false
        }
      }
    }
  }))
</script>
