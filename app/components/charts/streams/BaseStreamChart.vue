<template>
  <div class="h-64 w-full">
    <Line :data="chartData" :options="chartOptions" />
  </div>
</template>

<script setup lang="ts">
  import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    TimeScale
  } from 'chart.js'
  import { Line } from 'vue-chartjs'
  import 'chartjs-adapter-date-fns'

  ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    TimeScale
  )

  const props = defineProps<{
    label: string
    dataPoints: number[]
    labels: any[]
    color?: string
    yAxisLabel?: string
  }>()

  const chartData = computed(() => ({
    labels: props.labels,
    datasets: [
      {
        label: props.label,
        data: props.dataPoints,
        borderColor: props.color || '#3b82f6', // blue-500 default
        backgroundColor: (props.color || '#3b82f6') + '20', // transparent fill
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: true,
        tension: 0.1
      }
    ]
  }))

  const chartOptions = computed(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false
    },
    plugins: {
      legend: {
        display: true
      },
      tooltip: {
        enabled: true
      }
    },
    scales: {
      x: {
        type: 'linear' as const, // We use index/seconds for now, could be time
        display: true,
        title: {
          display: true,
          text: 'Time (s)'
        }
      },
      y: {
        display: true,
        title: {
          display: !!props.yAxisLabel,
          text: props.yAxisLabel
        }
      }
    }
  }))
</script>
