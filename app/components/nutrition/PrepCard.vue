<template>
  <div
    class="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 sm:p-6 border border-orange-100 dark:border-orange-800 space-y-4 shadow-sm"
  >
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="p-2 bg-orange-100 dark:bg-orange-800 rounded-full flex-shrink-0">
          <UIcon name="i-heroicons-beaker" class="w-6 h-6 text-orange-600 dark:text-orange-300" />
        </div>
        <div>
          <h3
            class="font-semibold text-lg text-orange-900 dark:text-orange-100 uppercase tracking-tight"
          >
            Nutrition & Fueling Prep
          </h3>
          <div class="text-xs text-orange-700 dark:text-orange-300 font-medium">
            {{ fuelingPlan.notes?.[0] || 'Strategic fueling for metabolic efficiency' }}
          </div>
        </div>
      </div>

      <!-- Gut Training Badge -->
      <UBadge
        v-if="isGutTraining"
        color="primary"
        variant="solid"
        class="animate-pulse font-black text-[10px] uppercase"
      >
        Gut Training Session
      </UBadge>
    </div>

    <!-- Hydration & Sodium Grid -->
    <div class="grid grid-cols-2 gap-4">
      <div
        class="bg-white/50 dark:bg-black/20 p-3 rounded-lg border border-orange-100 dark:border-orange-800"
      >
        <div
          class="text-[10px] uppercase font-black text-orange-600 dark:text-orange-400 tracking-widest mb-1"
        >
          Target Fluid
        </div>
        <div class="text-xl font-black text-orange-900 dark:text-orange-100">
          {{ (intraWindow?.targetFluid / 1000).toFixed(1) }} L
        </div>
      </div>
      <div
        class="bg-white/50 dark:bg-black/20 p-3 rounded-lg border border-orange-100 dark:border-orange-800"
      >
        <div
          class="text-[10px] uppercase font-black text-orange-600 dark:text-orange-400 tracking-widest mb-1"
        >
          Target Sodium
        </div>
        <div class="text-xl font-black text-orange-900 dark:text-orange-100">
          {{ intraWindow?.targetSodium }} mg
        </div>
      </div>
    </div>

    <!-- Intra-Workout Script -->
    <div
      v-if="intraWindow?.targetCarbs > 0"
      class="space-y-2 pt-2 border-t border-orange-100 dark:border-orange-800/50"
    >
      <div class="flex items-center justify-between">
        <div
          class="text-xs font-bold text-orange-700 dark:text-orange-300 uppercase tracking-wider flex items-center gap-1"
        >
          <UIcon name="i-heroicons-list-bullet" class="w-4 h-4" />
          Intra-Workout Script (Total {{ intraWindow.targetCarbs }}g Carbs)
        </div>
        <UBadge
          v-if="strategyLabel"
          variant="soft"
          color="primary"
          size="xs"
          class="font-black text-[8px] uppercase"
          :class="{ 'animate-pulse': fuelState === 3 }"
        >
          {{ strategyLabel }}
        </UBadge>
      </div>
      <div
        class="bg-white/50 dark:bg-black/20 rounded-lg p-3 text-sm text-orange-900 dark:text-orange-100 italic leading-relaxed"
      >
        {{ intraWindow.description }}
      </div>

      <!-- Supplement Checklist -->
      <div v-if="intraWindow.supplements?.length" class="flex flex-wrap gap-2 pt-1">
        <div
          v-for="supp in intraWindow.supplements"
          :key="supp"
          class="flex items-center gap-1.5 px-2 py-1 bg-orange-100 dark:bg-orange-800/50 rounded text-xs font-bold text-orange-700 dark:text-orange-200"
        >
          <UIcon name="i-heroicons-plus-circle" class="w-3.5 h-3.5" />
          {{ supp }}
        </div>
      </div>
    </div>

    <!-- Pre & Post Workout Targets -->
    <div
      class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-orange-100 dark:border-orange-800/50"
    >
      <!-- Pre-Workout -->
      <div v-if="preWindow" class="space-y-2">
        <div
          class="text-[10px] font-black uppercase text-orange-600 dark:text-orange-400 tracking-widest flex items-center gap-1"
        >
          <UIcon name="i-heroicons-sun" class="w-3.5 h-3.5" />
          Pre-Workout Target
        </div>
        <div class="flex items-center gap-4">
          <div
            class="flex items-center gap-1.5 text-sm font-black text-orange-900 dark:text-orange-100"
          >
            <UIcon name="i-tabler-bread" class="w-4 h-4 text-yellow-500" />
            {{ preWindow.targetCarbs }}g
          </div>
          <div
            class="flex items-center gap-1.5 text-sm font-black text-orange-900 dark:text-orange-100"
          >
            <UIcon name="i-tabler-egg" class="w-4 h-4 text-blue-500" />
            {{ preWindow.targetProtein }}g
          </div>
        </div>
      </div>

      <!-- Post-Workout -->
      <div v-if="postWindow" class="space-y-2">
        <div
          class="text-[10px] font-black uppercase text-orange-600 dark:text-orange-400 tracking-widest flex items-center gap-1"
        >
          <UIcon name="i-heroicons-sparkles" class="w-3.5 h-3.5" />
          Post-Workout Recovery
        </div>
        <div class="flex items-center gap-4">
          <div
            class="flex items-center gap-1.5 text-sm font-black text-orange-900 dark:text-orange-100"
          >
            <UIcon name="i-tabler-bread" class="w-4 h-4 text-yellow-500" />
            {{ postWindow.targetCarbs }}g
          </div>
          <div
            class="flex items-center gap-1.5 text-sm font-black text-orange-900 dark:text-orange-100"
          >
            <UIcon name="i-tabler-egg" class="w-4 h-4 text-blue-500" />
            {{ postWindow.targetProtein }}g
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  const props = defineProps<{
    fuelingPlan: any
    fuelState: number
    isGutTraining?: boolean
  }>()

  const intraWindow = computed(() =>
    props.fuelingPlan?.windows?.find((w: any) => w.type === 'INTRA_WORKOUT')
  )
  const preWindow = computed(() =>
    props.fuelingPlan?.windows?.find((w: any) => w.type === 'PRE_WORKOUT')
  )
  const postWindow = computed(() =>
    props.fuelingPlan?.windows?.find((w: any) => w.type === 'POST_WORKOUT')
  )

  const strategyLabel = computed(() => {
    if (props.fuelState === 3) return 'Gut Training: Active'
    if (props.fuelState === 2) return 'Steady Fueling'
    if (props.fuelState === 1) return 'Low Intensity'
    return null
  })
</script>
