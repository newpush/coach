<template>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    <!-- Total Distance -->
    <UCard
      class="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 border-l-4 border-l-blue-500"
    >
      <div class="flex flex-col">
        <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1"
          >Total Distance</span
        >
        <div class="flex items-end gap-2">
          <span class="text-2xl font-bold text-gray-900 dark:text-white">
            {{ formatDistance(data?.period.totalDistance) }}
          </span>
          <span class="text-sm text-gray-500 mb-1">km</span>
        </div>
      </div>
    </UCard>

    <!-- Total Duration -->
    <UCard
      class="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 border-l-4 border-l-green-500"
    >
      <div class="flex flex-col">
        <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1"
          >Total Duration</span
        >
        <div class="flex items-end gap-2">
          <span class="text-2xl font-bold text-gray-900 dark:text-white">
            {{ formatDuration(data?.period.totalDuration) }}
          </span>
          <span class="text-sm text-gray-500 mb-1">hrs</span>
        </div>
      </div>
    </UCard>

    <!-- TSS Accumulation -->
    <UCard
      class="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 border-l-4 border-l-purple-500"
    >
      <div class="flex flex-col">
        <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1"
          >Training Load (TSS)</span
        >
        <div class="flex items-end gap-2">
          <span class="text-2xl font-bold text-gray-900 dark:text-white">
            {{ Math.round(data?.period.totalTSS || 0) }}
          </span>
          <span class="text-sm text-gray-500 mb-1">points</span>
        </div>
      </div>
    </UCard>

    <!-- Workload Ratio (ACWR) -->
    <UCard
      :class="[
        'bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 border-l-4',
        getACWRColorClass(data?.load.workloadRatio)
      ]"
    >
      <div class="flex flex-col">
        <div class="flex justify-between items-start">
          <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1"
            >Load Ratio (ACWR)</span
          >
          <UTooltip
            text="Acute:Chronic Workload Ratio. 0.8-1.3 is optimal. >1.5 indicates high injury risk."
          >
            <UIcon name="i-heroicons-information-circle" class="w-4 h-4 text-gray-400" />
          </UTooltip>
        </div>
        <div class="flex items-end gap-2">
          <span class="text-2xl font-bold text-gray-900 dark:text-white">
            {{ data?.load.workloadRatio?.toFixed(2) || '0.00' }}
          </span>
          <UBadge :color="getACWRBadgeColor(data?.load.workloadRatio)" size="xs" variant="subtle">
            {{ getACWRStatus(data?.load.workloadRatio) }}
          </UBadge>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
  const props = defineProps<{
    period: number | string
    sport?: string
  }>()

  const { data, refresh } = await useFetch('/api/activity/highlights', {
    query: computed(() => ({
      days: props.period,
      sport: props.sport
    }))
  })

  const formatDistance = (meters: number | undefined) => {
    if (!meters) return '0'
    return (meters / 1000).toFixed(1)
  }

  const formatDuration = (seconds: number | undefined) => {
    if (!seconds) return '0'
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${hours}:${minutes.toString().padStart(2, '0')}`
  }

  const getACWRColorClass = (ratio: number | undefined) => {
    if (!ratio) return 'border-l-gray-300'
    if (ratio >= 0.8 && ratio <= 1.3) return 'border-l-green-500' // Sweet spot
    if (ratio > 1.5) return 'border-l-red-500' // Danger zone
    if (ratio < 0.8) return 'border-l-yellow-500' // Detraining
    return 'border-l-orange-500' // Caution
  }

  const getACWRBadgeColor = (ratio: number | undefined) => {
    if (!ratio) return 'neutral'
    if (ratio >= 0.8 && ratio <= 1.3) return 'primary'
    if (ratio > 1.5) return 'error'
    if (ratio < 0.8) return 'warning'
    return 'orange' as any
  }

  const getACWRStatus = (ratio: number | undefined) => {
    if (!ratio) return 'No Data'
    if (ratio >= 0.8 && ratio <= 1.3) return 'Optimal'
    if (ratio > 1.5) return 'High Risk'
    if (ratio < 0.8) return 'Low Load'
    return 'Caution'
  }
</script>
