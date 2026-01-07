<template>
  <div class="readiness-correlation-chart">
    <div v-if="loading" class="flex justify-center items-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary" />
    </div>

    <div
      v-else-if="!chartData || !chartData.datasets[0] || chartData.datasets[0].data.length === 0"
      class="text-center py-12"
    >
      <UIcon name="i-heroicons-chart-bar-slash" class="w-12 h-12 mx-auto mb-4 text-gray-400" />
      <p class="text-gray-600 dark:text-gray-400">No correlation data available for this period</p>
    </div>

    <div v-else class="space-y-6">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Readiness vs Training Load
          </h3>
          <UTooltip text="Correlation between your daily Recovery Score (X) and Workout TSS (Y).">
            <UIcon name="i-heroicons-information-circle" class="w-4 h-4 text-gray-400" />
          </UTooltip>
        </div>
        <div style="height: 300px">
          <Scatter :data="chartData" :options="chartOptions" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { Scatter } from 'vue-chartjs'
  import {
    Chart as ChartJS,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
  } from 'chart.js'

  ChartJS.register(LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

  const props = defineProps<{
    days?: number
  }>()

  const loading = ref(true)
  const correlationData = ref<any>(null)

  async function fetchCorrelationData() {
    loading.value = true

    try {
      const data = await $fetch('/api/scores/readiness-correlation', {
        query: { days: props.days || 30 }
      })
      correlationData.value = data
    } catch (e: any) {
      console.error('Error fetching correlation data:', e)
      correlationData.value = null
    } finally {
      loading.value = false
    }
  }

  watch(
    () => props.days,
    () => {
      fetchCorrelationData()
    }
  )

  const chartData = computed(() => {
    if (!correlationData.value?.points) return { datasets: [] }

    return {
      datasets: [
        {
          label: 'Workouts',
          data: correlationData.value.points,
          backgroundColor: (context: any) => {
            const val = context.raw?.x
            if (val >= 67) return '#10b981' // Green
            if (val >= 34) return '#f59e0b' // Yellow
            return '#ef4444' // Red
          },
          borderColor: 'rgba(0,0,0,0.1)',
          borderWidth: 1,
          pointRadius: 6,
          pointHoverRadius: 8
        }
      ]
    }
  })

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
            const point = context.raw
            return `${point.title || 'Workout'}: TSS ${Math.round(point.y)} (Rec: ${point.x})`
          }
        }
      }
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Recovery Score (0-100)',
          color: 'rgb(107, 114, 128)'
        },
        min: 0,
        max: 100,
        grid: {
          display: false
        },
        ticks: {
          color: 'rgb(107, 114, 128)'
        }
      },
      y: {
        title: {
          display: true,
          text: 'Training Stress (TSS)',
          color: 'rgb(107, 114, 128)'
        },
        grid: {
          color: 'rgba(128, 128, 128, 0.1)'
        },
        ticks: {
          color: 'rgb(107, 114, 128)'
        },
        beginAtZero: true
      }
    }
  }

  onMounted(() => {
    fetchCorrelationData()
  })
</script>

<style scoped>
  .readiness-correlation-chart {
    width: 100%;
  }
</style>
