<template>
  <div class="relative pl-8 pb-4">
    <!-- Anchor Icon -->
    <div
      class="absolute left-[-11px] top-0 w-5 h-5 rounded-full border-2 border-primary-500 bg-primary-500 z-10 flex items-center justify-center shadow-lg"
    >
      <UIcon :name="icon" class="w-3 h-3 text-white" />
    </div>

    <!-- Workout Block -->
    <div
      class="bg-gray-900 rounded-xl p-4 sm:p-5 border border-gray-800 shadow-2xl relative overflow-hidden group cursor-pointer hover:border-primary-500/50 transition-colors"
      @click="navigateTo(`/workouts/planned/${workout.id}`)"
    >
      <!-- Animated background effect -->
      <div
        class="absolute inset-0 bg-gradient-to-br from-primary-500/10 to-transparent opacity-50"
      />

      <div class="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="space-y-1">
          <div class="flex items-center gap-2 flex-wrap">
            <h3
              class="text-base font-black text-white uppercase tracking-tight group-hover:text-primary-400 transition-colors"
            >
              {{ workout.title }}
            </h3>
            <UBadge
              v-if="strategyLabel"
              variant="soft"
              color="primary"
              size="xs"
              class="font-black uppercase tracking-tighter"
            >
              {{ strategyLabel }}
            </UBadge>
          </div>

          <div
            class="flex items-center gap-3 text-xs font-bold text-gray-400 uppercase tracking-widest"
          >
            <div class="flex items-center gap-1">
              <UIcon name="i-tabler-clock" class="w-3.5 h-3.5" />
              <span>{{ formatDuration(workout.durationSec) }}</span>
            </div>
            <div v-if="workout.tss" class="flex items-center gap-1">
              <UIcon name="i-tabler-bolt" class="w-3.5 h-3.5 text-yellow-500" />
              <span>{{ Math.round(workout.tss) }} TSS</span>
            </div>
            <div v-if="workout.workIntensity" class="flex items-center gap-1">
              <UIcon name="i-tabler-chart-bar" class="w-3.5 h-3.5 text-primary-500" />
              <span>{{ Math.round(workout.workIntensity * 100) }}% IF</span>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <div
            class="px-3 py-1.5 bg-gray-800 rounded-lg border border-gray-700 text-center min-w-[70px]"
          >
            <div class="text-[8px] font-black text-gray-500 uppercase leading-none mb-1">
              Status
            </div>
            <div class="text-[10px] font-bold text-primary-400 uppercase leading-none">Planned</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  const props = defineProps<{
    workout: any
    fuelState?: number
  }>()

  const icon = computed(() => {
    const type = (props.workout.type || '').toLowerCase()
    if (type.includes('run')) return 'i-heroicons-fire'
    if (type.includes('cycle') || type.includes('ride')) return 'i-heroicons-bolt'
    if (type.includes('swim')) return 'i-heroicons-beaker'
    if (type.includes('strength') || type.includes('weight')) return 'i-heroicons-trophy'
    return 'i-heroicons-check-circle'
  })

  const strategyLabel = computed(() => {
    if (props.fuelState === 3) return 'Gut Training: Active'
    if (props.fuelState === 2) return 'Steady Fueling'
    if (props.fuelState === 1) return 'Low Intensity'
    return null
  })

  function formatDuration(seconds: number) {
    if (!seconds) return '0m'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }
</script>
