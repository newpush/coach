<template>
  <div
    class="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-50 to-white dark:from-primary-950/30 dark:to-gray-900 border border-primary-100 dark:border-primary-900/50 p-4 cursor-pointer hover:shadow-md transition-all group"
    @click="$emit('click')"
  >
    <div class="flex justify-between items-start">
      <div class="flex flex-col gap-1">
        <div class="flex items-center gap-2">
          <div
            class="p-1.5 rounded-full bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400"
          >
            <UIcon name="i-heroicons-heart" class="w-4 h-4" />
          </div>
          <h3 class="font-bold text-gray-900 dark:text-white tracking-tight">
            {{ item.title }}
          </h3>
        </div>
        <span class="text-xs font-medium text-gray-500 dark:text-gray-400 ml-9">{{
          dateLabel
        }}</span>
      </div>

      <!-- Primary Metric: Recovery -->
      <div v-if="recoveryMetric" class="text-right">
        <div class="text-3xl font-bold text-primary-500 leading-none tracking-tight">
          {{ recoveryMetric.value }}
        </div>
        <div class="text-[10px] font-bold uppercase tracking-wider text-primary-400 mt-1">
          Recovery
        </div>
      </div>
    </div>

    <!-- Secondary Metrics -->
    <div
      class="flex items-center gap-4 sm:gap-6 mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 ml-1"
    >
      <div v-for="metric in secondaryMetrics" :key="metric.label" class="flex flex-col gap-0.5">
        <div class="flex items-center gap-1.5">
          <UIcon
            v-if="metric.icon"
            :name="metric.icon"
            class="w-3.5 h-3.5"
            :class="getIconColorClass(item)"
          />
          <span
            class="text-[10px] uppercase font-bold text-gray-400 dark:text-gray-500 tracking-tight leading-none"
            >{{ metric.label }}</span
          >
        </div>
        <span class="text-xs font-medium text-gray-600 dark:text-gray-300 pl-5">{{
          metric.value
        }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  const props = defineProps<{
    item: any
    dateLabel: string
  }>()

  const recoveryMetric = computed(() => {
    return props.item.details.find((d: any) => d.label === 'Recovery')
  })

  const secondaryMetrics = computed(() => {
    // Filter out Recovery and limit to 4 items
    // Common labels: Sleep, HRV, RHR, Stress
    const desiredOrder = ['Sleep', 'HRV', 'RHR', 'Stress']
    return props.item.details
      .filter((d: any) => d.label !== 'Recovery')
      .sort((a: any, b: any) => {
        const indexA = desiredOrder.indexOf(a.label)
        const indexB = desiredOrder.indexOf(b.label)
        return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB)
      })
      .slice(0, 4)
  })

  function getIconColorClass(item: any) {
    switch (item.type) {
      case 'workout':
        return 'text-amber-500'
      case 'wellness':
        return 'text-blue-500'
      case 'nutrition':
        return 'text-emerald-500'
      default:
        return 'text-gray-500'
    }
  }
</script>
