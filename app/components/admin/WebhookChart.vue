<script setup lang="ts">
  import { Bar } from 'vue-chartjs'
  import {
    Chart as ChartJS,
    Title,
    Tooltip,
    Legend,
    BarElement,
    CategoryScale,
    LinearScale,
    TimeScale,
    type ChartOptions
  } from 'chart.js'
  import 'chartjs-adapter-date-fns'

  ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, TimeScale)

  const props = defineProps<{
    data: { timestamp: string; eventType: string; count: number }[]
    period: 'hour' | 'day'
  }>()

  const chartData = computed(() => {
    if (!props.data || props.data.length === 0) return { labels: [], datasets: [] }

    // 1. Get unique sorted timestamps (Labels)
    const timestamps = Array.from(new Set(props.data.map((d) => d.timestamp))).sort()

    // 2. Get unique event types (Datasets)
    const eventTypes = Array.from(new Set(props.data.map((d) => d.eventType))).sort()

    // 3. Create datasets
    // Define some colors for different event types
    const colors = [
      '#3b82f6', // blue
      '#10b981', // emerald
      '#8b5cf6', // violet
      '#f59e0b', // amber
      '#ef4444', // red
      '#6366f1', // indigo
      '#ec4899', // pink
      '#14b8a6' // teal
    ]

    const datasets = eventTypes.map((type, index) => {
      return {
        label: type,
        backgroundColor: colors[index % colors.length],
        data: timestamps.map((t) => {
          const entry = props.data.find((d) => d.timestamp === t && d.eventType === type)
          return entry ? entry.count : 0
        })
      }
    })

    return {
      labels: timestamps,
      datasets
    }
  })

  const chartOptions = computed<ChartOptions<'bar'>>(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'time' as const,
          time: {
            unit: props.period,
            tooltipFormat: props.period === 'hour' ? 'MMM d, HH:mm' : 'MMM d',
            displayFormats: {
              hour: 'HH:mm',
              day: 'MMM d'
            }
          },
          stacked: true
        },
        y: {
          beginAtZero: true,
          stacked: true,
          ticks: {
            stepSize: 1
          }
        }
      },
      plugins: {
        legend: {
          position: 'bottom' as const
        }
      }
    }
  })
</script>

<template>
  <div class="h-64">
    <Bar v-if="chartData.labels.length > 0" :data="chartData" :options="chartOptions" />
    <div v-else class="h-full flex items-center justify-center text-gray-500">
      No data available for this period
    </div>
  </div>
</template>
