<template>
  <div class="h-[300px] w-full relative">
    <Line :data="chartData" :options="chartOptions" />
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
  import annotationPlugin from 'chartjs-plugin-annotation'

  ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler,
    annotationPlugin
  )

  const props = defineProps<{
    points: any[]
  }>()

  const chartData = computed(() => {
    return {
      labels: props.points.map((p) => {
        // Only show time for every 4th point or so to avoid crowding, or use day labels
        return p.time
      }),
      datasets: [
        {
          label: 'Energy availability',
          data: props.points.map((p) => p.level),
          borderColor: '#3b82f6',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          segment: {
            borderDash: (ctx: any) => {
              const point = props.points[ctx.p1DataIndex]
              return point?.dataType === 'future' ? [5, 5] : undefined
            },
            borderColor: (ctx: any) => {
              const point = props.points[ctx.p1DataIndex]
              return point?.dataType === 'future' ? 'rgba(59, 130, 246, 0.5)' : '#3b82f6'
            }
          },
          backgroundColor: (context: any) => {
            const chart = context.chart
            const { ctx, chartArea } = chart
            if (!chartArea) return null
            const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top)
            gradient.addColorStop(0, 'rgba(239, 68, 68, 0.05)')
            gradient.addColorStop(0.3, 'rgba(59, 130, 246, 0.1)')
            return gradient
          },
          pointRadius: (ctx: any) => {
            const p = props.points[ctx.dataIndex]
            return p?.eventType ? 4 : 0
          },
          pointBackgroundColor: (ctx: any) => {
            const p = props.points[ctx.dataIndex]
            if (p?.eventType === 'workout') return '#ef4444'
            if (p?.eventType === 'meal') return '#10b981'
            return 'transparent'
          }
        }
      ]
    }
  })

  const chartOptions = computed(() => {
    const dayBoundaries: number[] = []
    let lastDay = ''
    props.points.forEach((p, idx) => {
      if (p.dateKey !== lastDay) {
        if (lastDay !== '') dayBoundaries.push(idx)
        lastDay = p.dateKey
      }
    })

    const nowIdx = props.points.findIndex((p) => p.dataType === 'current' && p.isFuture)
    const annotations: any = {
      nowLine: {
        type: 'line' as const,
        xMin: nowIdx >= 0 ? nowIdx : undefined,
        xMax: nowIdx >= 0 ? nowIdx : undefined,
        display: nowIdx >= 0,
        borderColor: 'rgba(156, 163, 175, 0.8)',
        borderWidth: 1.5,
        label: {
          content: 'NOW',
          display: true,
          position: 'start' as const,
          backgroundColor: 'rgba(0,0,0,0.5)',
          font: { size: 9, weight: 'bold' as const }
        }
      }
    }

    // Add day boundary lines
    dayBoundaries.forEach((idx, i) => {
      annotations[`dayLine${i}`] = {
        type: 'line' as const,
        xMin: idx,
        xMax: idx,
        borderColor: 'rgba(148, 163, 184, 0.2)',
        borderWidth: 1,
        borderDash: [2, 2]
      }
    })

    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          interaction: { mode: 'index', intersect: false },
          callbacks: {
            title: (context: any) => {
              const p = props.points[context[0].dataIndex]
              if (!p) return ''
              return `${p.dateKey} ${p.time}`
            }
          }
        },
        annotation: { annotations }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            maxTicksLimit: 12,
            callback: function (value: any, index: number) {
              const p = props.points[index]
              if (p.time === '00:00') return p.dateKey
              return p.time
            }
          }
        },
        y: {
          min: 0,
          max: 100,
          ticks: { callback: (val: any) => `${val}%` }
        }
      }
    }
  })
</script>
