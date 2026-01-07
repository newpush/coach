<template>
  <div class="space-y-4">
    <h3 class="text-xl font-bold text-gray-900 dark:text-white uppercase tracking-tight px-1">
      Workout Recommendations
    </h3>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <UCard
        v-for="(rec, index) in recommendations"
        :key="index"
        class="overflow-hidden transition-all duration-200"
        :class="{
          'bg-red-50 dark:bg-red-900/20 ring-red-500/20': rec.priority === 'high',
          'bg-amber-50 dark:bg-amber-900/20 ring-amber-500/20': rec.priority === 'medium',
          'bg-blue-50 dark:bg-blue-900/20 ring-blue-500/20': rec.priority === 'low'
        }"
      >
        <div class="flex items-start gap-4">
          <div class="flex-shrink-0">
            <div
              class="flex items-center justify-center w-8 h-8 rounded-lg shadow-sm ring-1 ring-inset"
              :class="{
                'bg-red-600 text-white ring-red-700': rec.priority === 'high',
                'bg-amber-500 text-white ring-amber-600': rec.priority === 'medium',
                'bg-blue-500 text-white ring-blue-600': rec.priority === 'low'
              }"
            >
              <UIcon
                :name="
                  rec.priority === 'high'
                    ? 'i-heroicons-exclamation-triangle'
                    : rec.priority === 'medium'
                      ? 'i-heroicons-information-circle'
                      : 'i-heroicons-light-bulb'
                "
                class="w-5 h-5"
              />
            </div>
          </div>
          <div class="flex-1 space-y-2">
            <h4
              class="font-bold text-sm tracking-tight"
              :class="{
                'text-red-900 dark:text-red-100': rec.priority === 'high',
                'text-amber-900 dark:text-amber-100': rec.priority === 'medium',
                'text-blue-900 dark:text-blue-100': rec.priority === 'low'
              }"
            >
              {{ rec.title }}
            </h4>
            <p
              class="text-sm leading-relaxed"
              :class="{
                'text-red-800/80 dark:text-red-200/80': rec.priority === 'high',
                'text-amber-800/80 dark:text-amber-200/80': rec.priority === 'medium',
                'text-blue-800/80 dark:text-blue-200/80': rec.priority === 'low'
              }"
            >
              {{ rec.description }}
            </p>
            <div
              class="pt-2 border-t flex justify-between items-center"
              :class="{
                'border-red-200/50 dark:border-red-800/50': rec.priority === 'high',
                'border-amber-200/50 dark:border-amber-800/50': rec.priority === 'medium',
                'border-blue-200/50 dark:border-blue-800/50': rec.priority === 'low'
              }"
            >
              <span class="text-[10px] font-bold uppercase tracking-widest opacity-60">{{
                rec.metric
              }}</span>
              <span
                class="text-[10px] font-bold uppercase tracking-widest text-right"
                :class="{
                  'text-red-600 dark:text-red-400': rec.priority === 'high',
                  'text-amber-600 dark:text-amber-400': rec.priority === 'medium',
                  'text-blue-600 dark:text-blue-400': rec.priority === 'low'
                }"
                >{{ rec.priority }} Priority</span
              >
            </div>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
  defineProps<{
    recommendations: any[]
  }>()
</script>
