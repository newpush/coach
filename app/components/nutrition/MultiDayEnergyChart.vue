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
    highlightedDate?: string | null
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
            return p?.eventType ? 6 : 0
          },
          pointHoverRadius: 8,
          pointBackgroundColor: (ctx: any) => {
            const p = props.points[ctx.dataIndex]
            if (!p?.eventType) return 'transparent'
            if (p.eventIcon === 'i-tabler-layers-intersect') return '#8b5cf6'
            if (p.event && (p.event.includes('Synthetic') || p.event.includes('Probable')))
              return '#a855f7'
            return p.eventType === 'workout' ? '#ef4444' : '#10b981'
          },
          pointStyle: (ctx: any) => {
            const p = props.points[ctx.dataIndex]
            if (p?.eventIcon === 'i-tabler-layers-intersect') return 'triangle'
            if (p?.eventType === 'workout') return 'rectRot'
            if (p?.eventType === 'meal') return 'circle'
            return 'circle'
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

    // Add Highlighted Day Box
    if (props.highlightedDate) {
      const startIdx = props.points.findIndex((p) => p.dateKey === props.highlightedDate)
      const endIdx = props.points.findLastIndex((p) => p.dateKey === props.highlightedDate)

      if (startIdx >= 0 && endIdx >= 0) {
        annotations.highlightBox = {
          type: 'box' as const,
          xMin: startIdx,
          xMax: endIdx,
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderColor: 'transparent',
          borderWidth: 0,
          drawTime: 'beforeDatasetsDraw'
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
            },
            label: (context: any) => {
              return `Glycogen: ${context.raw}%`
            },
            afterBody: (context: any) => {
              const p = props.points[context[0].dataIndex]
              if (!p) return ''

              const lines = []
              if (p.eventType === 'workout') {
                lines.push(`Workout: ${p.event || 'Planned Activity'}`)
              } else if (p.eventType === 'meal') {
                lines.push(`Event: ${p.event || 'Food Logged'}`)
                if (p.eventCarbs) lines.push(`Carbs: ${p.eventCarbs}g`)
              }

              if (p.eventFluid > 0) {
                lines.push(`Fluid Intake: ${p.eventFluid}ml`)
              } else if (p.fluidDeficit > 0) {
                lines.push(`Fluid Debt: ${Math.round(p.fluidDeficit)}ml`)
              }

              return lines
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
