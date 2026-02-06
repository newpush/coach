<template>
  <div class="weekly-zone-chart">
    <div v-if="pending" class="flex justify-center items-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary" />
    </div>

    <div v-else-if="!data?.weeks?.length" class="text-center py-12">
      <UIcon name="i-heroicons-chart-bar" class="w-12 h-12 mx-auto mb-4 text-gray-400" />
      <p class="text-gray-500">No training data found for this period.</p>
    </div>

    <div v-else class="space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UButton
            v-for="type in ['power', 'hr'] as const"
            :key="type"
            size="xs"
            :color="selectedType === type ? 'primary' : 'neutral'"
            :variant="selectedType === type ? 'solid' : 'ghost'"
            class="font-bold uppercase text-[10px]"
            @click="selectedType = type"
          >
            {{ type === 'power' ? 'Power' : 'Heart Rate' }}
          </UButton>
        </div>
        <div
          class="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest"
        >
          Intensity Distribution (Hrs)
        </div>
      </div>

      <div class="h-64 relative">
        <Bar :data="chartData" :options="chartOptions" />
      </div>

      <!-- Legend -->
      <div
        class="flex flex-wrap gap-x-3 gap-y-1 justify-center pt-2 border-t border-gray-100 dark:border-gray-800"
      >
        <div v-for="(label, i) in activeLabels" :key="label" class="flex items-center gap-1.5">
          <div class="w-2 h-2 rounded-full" :style="{ backgroundColor: ZONE_COLORS[i] }" />
          <span class="text-[9px] text-gray-500 dark:text-gray-400 font-bold uppercase">{{
            label.split(' ')[0]
          }}</span>
        </div>
      </div>
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
  import { ZONE_COLORS } from '~/utils/zone-colors'

  ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

  const props = defineProps<{
    weeks?: number | string
    sport?: string
  }>()

  const selectedType = ref<'power' | 'hr'>('power')

  const { data, pending, refresh } = await useFetch('/api/analytics/weekly-zones', {
    query: {
      weeks: props.weeks || 12,
      sport: props.sport
    }
  })

  watch(
    () => [props.weeks, props.sport],
    () => {
      refresh()
    }
  )

  const activeLabels = computed(() => {
    if (!data.value?.zoneLabels) return []
    const labels =
      selectedType.value === 'power' ? data.value.zoneLabels.power : data.value.zoneLabels.hr

    // Filter labels to only include those that have a corresponding color
    // AND ensure we don't try to show more zones than we have colors for
    return labels.slice(0, ZONE_COLORS.length)
  })

  const chartData = computed(() => {
    if (!data.value?.weeks) return { labels: [], datasets: [] }

    const labels = data.value.weeks.map((w) => {
      const d = new Date(w.weekStart)
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    })

    const datasets = []
    const numZones = activeLabels.value.length

    for (let z = 0; z < numZones; z++) {
      const zoneData = data.value.weeks.map((w) => {
        const zones = selectedType.value === 'power' ? w.powerZones : w.hrZones
        return zones[z] || 0
      })

      // Include Z1-Z5 always if they exist in labels, Z6-Z7 only if they have data
      const hasData = zoneData.some((v) => v > 0)
      // Always show at least the first 5 zones if they are defined in labels
      if (hasData || z < 5) {
        datasets.push({
          label: activeLabels.value[z],
          data: zoneData,
          backgroundColor: ZONE_COLORS[z],
          borderRadius: z === numZones - 1 ? 4 : 0,
          stack: 'intensity'
        })
      }
    }

    // Reverse to show Z1 at bottom
    return { labels, datasets }
  })

  const chartOptions = computed(() => {
    const isDark =
      typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index' as const,
        intersect: false
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark ? '#1f2937' : '#ffffff',
          titleColor: isDark ? '#ffffff' : '#1f2937',
          bodyColor: isDark ? '#d1d5db' : '#4b5563',
          borderColor: isDark ? '#374151' : '#e5e7eb',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: (context: any) => ` ${context.dataset.label}: ${context.parsed.y}h`
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: {
            font: { size: 9, weight: 'bold' as const },
            color: isDark ? '#9ca3af' : '#6b7280'
          }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: {
            color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'
          },
          ticks: {
            font: { size: 9 },
            color: isDark ? '#9ca3af' : '#6b7280',
            callback: (value: any) => value + 'h'
          }
        }
      }
    }
  })
</script>
