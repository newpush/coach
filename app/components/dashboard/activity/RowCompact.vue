<template>
  <div
    class="group flex items-center gap-3 py-3 px-2 -mx-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors border-b border-gray-50 dark:border-gray-800/50 last:border-0"
    @click="$emit('click')"
  >
    <!-- Icon -->
    <div
      class="shrink-0 w-9 h-9 flex items-center justify-center rounded-full"
      :class="getIconBgClass(item)"
    >
      <UIcon :name="item.icon" class="w-4.5 h-4.5" :class="getIconColorClass(item)" />
    </div>

    <!-- Content -->
    <div class="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
      <div class="flex items-center justify-between">
        <span class="text-sm font-bold text-gray-900 dark:text-white truncate pr-2">
          {{ item.title }}
        </span>
        <span class="text-[10px] font-bold text-gray-400 shrink-0 uppercase tracking-wider">
          {{ dateLabel }}
        </span>
      </div>

      <!-- Inline Metrics -->
      <div
        class="flex items-center gap-2.5 text-xs text-gray-500 dark:text-gray-400 truncate leading-none mt-1"
      >
        <template v-for="(detail, i) in compactDetails" :key="i">
          <div class="flex items-center gap-1">
            <UIcon
              v-if="detail.icon"
              :name="detail.icon"
              class="w-3 h-3 opacity-80"
              :class="getIconColorClass(item)"
            />
            <span
              v-if="detail.shortLabel"
              class="text-[10px] uppercase font-bold text-gray-400 dark:text-gray-500 tracking-tight"
              >{{ detail.shortLabel }}</span
            >
            <span class="text-xs font-medium text-gray-600 dark:text-gray-300">{{
              detail.value
            }}</span>
          </div>
        </template>
      </div>
    </div>

    <!-- Chevron -->
    <UIcon
      name="i-heroicons-chevron-right"
      class="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-primary-500 transition-colors shrink-0"
    />
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  const props = defineProps<{
    item: any
    dateLabel: string
  }>()

  const compactDetails = computed(() => {
    // Map long labels to short ones or keep as is
    // e.g. Protein -> P, Carbs -> C, Avg HR -> HR
    if (!props.item.details || !Array.isArray(props.item.details)) return []

    return props.item.details
      .map((d: any) => {
        let shortLabel = d.label
        const value = d.value

        if (d.label === 'Protein') shortLabel = 'P'
        if (d.label === 'Carbs') shortLabel = 'C'
        if (d.label === 'Fat') shortLabel = 'F'
        if (d.label === 'Calories') shortLabel = '' // Usually implied 876 kcal
        if (d.label === 'Avg HR') shortLabel = 'HR'
        if (d.label === 'Avg Power') shortLabel = 'Pwr'
        if (d.label === 'Duration') shortLabel = '' // Implied 52m
        if (d.label === 'TSS') shortLabel = 'TSS'

        return {
          ...d,
          shortLabel,
          value
        }
      })
      .slice(0, 3) as any[] // Limit to 3 metrics
  })

  function getIconBgClass(item: any) {
    switch (item.type) {
      case 'workout':
        return 'bg-amber-50 dark:bg-amber-900/10'
      case 'wellness':
        return 'bg-blue-50 dark:bg-blue-900/10'
      case 'nutrition':
        return 'bg-emerald-50 dark:bg-emerald-900/10'
      default:
        return 'bg-gray-50 dark:bg-gray-800'
    }
  }

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
