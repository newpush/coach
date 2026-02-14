<template>
  <UCard
    class="relative group transition-all duration-300 hover:ring-2 hover:ring-primary-500/50 cursor-pointer"
    :class="{ 'ring-2 ring-primary-500': selected }"
    @click="$emit('select')"
  >
    <div class="space-y-3">
      <!-- Header -->
      <div class="flex justify-between items-start gap-2">
        <div>
          <h4
            class="text-sm font-black uppercase tracking-tight text-gray-900 dark:text-white leading-tight"
          >
            {{ option.title }}
          </h4>
          <div class="flex items-center gap-2 mt-1">
            <UBadge color="neutral" variant="subtle" size="xs">
              {{ option.absorptionType }}
            </UBadge>
            <span class="text-[10px] text-gray-500 flex items-center gap-1">
              <UIcon name="i-lucide-clock" class="size-3" />
              {{ option.prepMinutes }}m prep
            </span>
          </div>
        </div>
        <div class="text-right">
          <span class="text-lg font-black text-primary-600 dark:text-primary-400">
            {{ option.totals.carbs }}g
          </span>
          <p class="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Carbs</p>
        </div>
      </div>

      <!-- Macros -->
      <div class="grid grid-cols-3 gap-2 py-2 border-y border-gray-100 dark:border-gray-800">
        <div class="text-center">
          <p class="text-[10px] text-gray-400 font-bold uppercase">Pro</p>
          <p class="text-xs font-bold">{{ option.totals.protein }}g</p>
        </div>
        <div class="text-center border-x border-gray-100 dark:border-gray-800">
          <p class="text-[10px] text-gray-400 font-bold uppercase">Fat</p>
          <p class="text-xs font-bold">{{ option.totals.fat }}g</p>
        </div>
        <div class="text-center">
          <p class="text-[10px] text-gray-400 font-bold uppercase">Kcal</p>
          <p class="text-xs font-bold">{{ option.totals.kcal }}</p>
        </div>
      </div>

      <!-- Ingredients -->
      <div class="space-y-1">
        <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Ingredients</p>
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="ing in option.ingredients"
            :key="ing.item"
            class="text-[11px] px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-700 dark:text-gray-300"
          >
            {{ ing.quantity }}{{ ing.unit }} {{ ing.item }}
          </span>
        </div>
      </div>

      <!-- Reasoning / Split Info -->
      <div v-if="option.splitRequired || option.reasoning" class="pt-1">
        <div
          v-if="option.splitRequired"
          class="p-2 bg-amber-50 dark:bg-amber-950/20 rounded border border-amber-100 dark:border-amber-900/50 flex items-start gap-2"
        >
          <UIcon name="i-lucide-alert-triangle" class="size-3.5 text-amber-500 mt-0.5 shrink-0" />
          <p class="text-[10px] text-amber-700 dark:text-amber-400 leading-tight">
            <strong>Target exceeds limit:</strong> This meal is capped at
            {{ option.totals.carbs }}g. Remaining {{ option.postWorkoutDebtCarbs }}g will be shifted
            to your post-workout window.
          </p>
        </div>
        <p v-else-if="option.reasoning" class="text-[10px] text-gray-500 italic leading-relaxed">
          {{ option.reasoning }}
        </p>
      </div>
    </div>

    <!-- Selection Indicator -->
    <div
      v-if="selected"
      class="absolute -top-2 -right-2 size-6 bg-primary-500 rounded-full flex items-center justify-center text-white border-2 border-white dark:border-gray-900 shadow-sm"
    >
      <UIcon name="i-lucide-check" class="size-4" />
    </div>
  </UCard>
</template>

<script setup lang="ts">
  defineProps<{
    option: any
    selected?: boolean
  }>()

  defineEmits(['select'])
</script>
