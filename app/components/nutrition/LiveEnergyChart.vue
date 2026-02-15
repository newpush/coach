<template>
  <div class="h-[240px] w-full relative">
    <Line :key="props.viewMode" :data="chartData" :options="chartOptions" />
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
  import type { EnergyPoint } from '~/types/nutrition'

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
    points: EnergyPoint[]
    ghostPoints?: EnergyPoint[]
    viewMode: 'percent' | 'kcal' | 'carbs'
  }>()

  // Pre-load icons as images for Chart.js pointStyle (Simplified for now using circles/shapes)
  // We use custom point draws or simple indicators for performance

  const chartData = computed(() => {
    const isKcal = props.viewMode === 'kcal'
    const isCarbs = props.viewMode === 'carbs'

    const datasets: any[] = [
      {
        label: 'Energy availability',
        data: props.points.map((p) => {
          if (isKcal) return p.kcalBalance
          if (isCarbs) return p.carbBalance
          return p.level
        }),
        borderColor: '#3b82f6',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        // Hexis style: Solid for past, dashed for future
        segment: {
          borderDash: (ctx: any) => {
            const point = props.points[ctx.p1DataIndex]
            return point?.isFuture ? [5, 5] : undefined
          },
          borderColor: (ctx: any) => {
            const point = props.points[ctx.p1DataIndex]
            return point?.isFuture ? 'rgba(59, 130, 246, 0.5)' : '#3b82f6'
          }
        },
        backgroundColor: (context: any) => {
          const chart = context.chart
          const { ctx, chartArea } = chart
          if (!chartArea) return null
          const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top)
          gradient.addColorStop(0, 'rgba(239, 68, 68, 0.05)') // Red bottom
          gradient.addColorStop(0.3, 'rgba(59, 130, 246, 0.1)') // Blue mid
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
          if (p.eventIcon === 'i-tabler-layers-intersect') return '#8b5cf6' // Purple for mixed/multi
          // Synthetic/Probable meals are purple/dashed
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

    // Add Metabolic Ghost dataset if provided
    if (props.ghostPoints && props.ghostPoints.length > 0) {
      datasets.push({
        label: 'Metabolic Ghost',
        data: props.ghostPoints.map((p) => {
          if (isKcal) return p.kcalBalance
          if (isCarbs) return p.carbBalance
          return p.level
        }),
        borderColor: 'rgba(139, 92, 246, 0.3)', // Faint purple
        borderWidth: 1.5,
        borderDash: [3, 3],
        fill: false,
        tension: 0.4,
        pointRadius: 0, // Ghost line has no points
        pointHitRadius: 0
      })
    }

    return {
      labels: props.points.map((p) => p.time),
      datasets
    }
  })

  const chartOptions = computed(() => {
    const isKcal = props.viewMode === 'kcal'
    const isCarbs = props.viewMode === 'carbs'

    let yMin = 0
    let yMax = 110 // Add padding above 100% for icons

    if (isKcal || isCarbs) {
      const values = props.points.map((p) => (isKcal ? p.kcalBalance : p.carbBalance))
      const minVal = Math.min(...values)
      const maxVal = Math.max(...values)
      const range = maxVal - minVal

      const step = isKcal ? 100 : 25

      // Add 20% padding to top and bottom
      yMin = Math.floor((minVal - range * 0.2) / step) * step
      yMax = Math.ceil((maxVal + range * 0.2) / step) * step

      // Ensure minimum range
      const minRange = isKcal ? 1000 : 200
      if (yMax - yMin < minRange) {
        const mid = (yMax + yMin) / 2
        yMin = mid - minRange / 2
        yMax = mid + minRange / 2
      }
    }

    return {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          bottom: 10,
          top: 10
        }
      },
      interaction: {
        mode: 'index' as const,
        intersect: false
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.8)',
          padding: 12,
          titleFont: { size: 14, weight: 'bold' as const },
          bodyFont: { size: 12 },
          callbacks: {
            label: (context: any) => {
              const val = context.parsed.y
              // Only show value for main dataset
              if (context.dataset.label === 'Metabolic Ghost') return ''
              if (isKcal) return `Balance: ${val > 0 ? '+' : ''}${val} kcal`
              if (isCarbs) return `Balance: ${val > 0 ? '+' : ''}${val}g Carbs`
              return `Fuel Tank: ${val}%`
            },
            afterBody: (context: any) => {
              const idx = context[0].dataIndex
              const p = props.points[idx]
              if (!p?.event) return ''

              let icon = p.eventType === 'meal' ? '🍴' : '🚴'
              if (p.eventIcon === 'i-tabler-layers-intersect') icon = '🥞' // Pancake/Layers for multi

              let details = `\n${icon} ${p.event}`

              // Add nutritional details if available
              if (p.eventCarbs !== undefined || p.eventFluid !== undefined) {
                const carbs =
                  p.eventCarbs !== undefined
                    ? `${p.eventCarbs > 0 ? '+' : ''}${p.eventCarbs}g Carbs`
                    : ''
                const fluid = p.eventFluid !== undefined ? `${p.eventFluid}ml` : ''
                details += `\nImpact: ${[carbs, fluid].filter(Boolean).join(', ')}`
              }

              if (p.event.includes('Synthetic') || p.event.includes('Probable')) {
                details += '\n(Planned/Estimated)'
              }

              return details
            }
          }
        },
        annotation: {
          annotations: {
            nowLine: {
              type: 'line' as const,
              xMin: props.points.findIndex((p) => p.isFuture),
              xMax: props.points.findIndex((p) => p.isFuture),
              borderColor: 'rgba(156, 163, 175, 0.8)',
              borderWidth: 1.5,
              label: {
                content: 'NOW',
                display: true,
                position: 'start' as const,
                backgroundColor: 'rgba(0,0,0,0.5)',
                font: { size: 9, weight: 'bold' as const }
              }
            },
            // Highlight optimal zone
            optimalZone: {
              type: 'box' as const,
              yMin: isKcal ? 500 : isCarbs ? 125 : 70,
              yMax: yMax,
              backgroundColor: 'rgba(16, 185, 129, 0.03)',
              borderWidth: 0
            },
            // Highlight danger zone
            dangerZone: {
              type: 'box' as const,
              yMin: yMin,
              yMax: isKcal ? -200 : isCarbs ? -50 : 25,
              backgroundColor: 'rgba(239, 68, 68, 0.05)',
              borderWidth: 0
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            maxTicksLimit: 6,
            color: '#94a3b8',
            font: { size: 10, weight: 'bold' as const }
          }
        },
        y: {
          min: yMin,
          max: yMax,
          grid: { color: 'rgba(148, 163, 184, 0.1)' },
          ticks: {
            stepSize: isKcal ? Math.ceil((yMax - yMin) / 5 / 100) * 100 : isCarbs ? 50 : 25,
            color: '#94a3b8',
            font: { size: 10 },
            callback: (val: any) => {
              if (isKcal || isCarbs) return `${val > 0 ? '+' : ''}${val}${isCarbs ? 'g' : ''}`
              if (val > 100) return '' // Hide labels above 100% to keep padding clean
              return `${val}%`
            }
          }
        }
      }
    }
  })
</script>
