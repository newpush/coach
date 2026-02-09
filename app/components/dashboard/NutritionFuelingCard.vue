<template>
  <UCard :ui="{ body: 'p-0 sm:p-4' }">
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <template v-if="loading">
            <USkeleton class="w-3 h-3 rounded-full" />
            <USkeleton class="h-4 w-32" />
          </template>
          <template v-else>
            <div
              v-if="plan"
              class="w-3 h-3 rounded-full"
              :class="{
                'bg-blue-500': fuelState === 1,
                'bg-orange-500': fuelState === 2,
                'bg-red-500': fuelState === 3
              }"
            />
            <UIcon v-else name="i-heroicons-beaker" class="w-4 h-4 text-gray-400" />
            <h3 class="font-bold text-gray-900 dark:text-white text-sm tracking-tight uppercase">
              Daily Fueling: {{ plan ? stateLabel : 'No Plan' }}
            </h3>
          </template>
        </div>
        <div class="flex items-center gap-2">
          <UButton
            v-if="!loading"
            :to="`/nutrition/${formatDateUTC(new Date(), 'yyyy-MM-dd')}`"
            variant="ghost"
            color="neutral"
            size="xs"
            icon="i-heroicons-arrow-right"
            trailing
            title="Open Journal"
          />
          <UButton
            v-if="!loading"
            :loading="generating"
            variant="ghost"
            color="neutral"
            size="xs"
            icon="i-heroicons-sparkles"
            title="Regenerate Plan"
            @click="handleGenerate"
          />
          <UButton
            v-if="!loading"
            to="/profile/settings?tab=nutrition"
            variant="ghost"
            color="neutral"
            size="xs"
            icon="i-heroicons-cog-6-tooth"
            title="Nutrition Settings"
          />
          <UBadge v-if="strategy" color="neutral" variant="subtle" size="xs">
            {{ strategy }}
          </UBadge>
        </div>
      </div>
    </template>

    <!-- Loading State -->
    <div v-if="loading" class="p-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div class="space-y-4">
          <div class="space-y-2">
            <USkeleton class="h-3 w-1/2" />
            <USkeleton class="h-6 w-full rounded-full" />
          </div>
          <div class="grid grid-cols-3 gap-4">
            <USkeleton v-for="i in 3" :key="i" class="h-16 w-full rounded-xl" />
          </div>
        </div>
        <div class="space-y-3">
          <div v-for="i in 3" :key="i" class="flex gap-3">
            <USkeleton class="w-2.5 h-2.5 rounded-full mt-1" />
            <div class="flex-1 space-y-2">
              <USkeleton class="h-3 w-1/4" />
              <USkeleton class="h-2 w-3/4" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="!plan"
      class="p-6 text-center flex flex-col items-center justify-center h-full min-h-[200px] space-y-3"
    >
      <UIcon name="i-heroicons-calendar-slash" class="w-10 h-10 text-gray-300 dark:text-gray-600" />
      <p class="text-xs text-gray-500 dark:text-gray-400">
        No fueling plan for today. Add a workout to see periodized guidance.
      </p>
      <div class="flex gap-2">
        <UButton
          :loading="generating"
          variant="soft"
          color="primary"
          size="xs"
          icon="i-heroicons-sparkles"
          @click="handleGenerate"
        >
          Generate Plan
        </UButton>
        <UButton to="/plan" variant="soft" color="neutral" size="xs">Set Goal</UButton>
      </div>
    </div>

    <!-- Active Plan Content -->
    <div v-else class="p-4 space-y-6">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        <!-- Left Side: Tank & Info -->
        <div class="space-y-6">
          <!-- Fuel Tank Visualization -->
          <div class="space-y-2">
            <div class="flex justify-between text-xs font-bold uppercase tracking-wider">
              <span class="text-gray-500">Glycogen "Fuel Tank"</span>
              <span :class="tankColorClass">{{ tankPercentage }}%</span>
            </div>
            <div
              class="h-6 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden border border-gray-200 dark:border-gray-700"
            >
              <div
                class="h-full transition-all duration-1000 relative"
                :class="tankBarClass"
                :style="{ width: `${tankPercentage}%` }"
              >
                <!-- Subtle pattern/shine -->
                <div
                  class="absolute inset-0 opacity-20 bg-gradient-to-r from-white/0 via-white/50 to-white/0 animate-shimmer"
                />
              </div>
            </div>
            <p class="text-xs text-gray-500 italic">
              {{ tankAdvice }}
            </p>
          </div>

          <!-- Daily Totals -->
          <div
            class="pt-6 border-t border-gray-100 dark:border-gray-800 grid grid-cols-3 gap-4 text-center"
          >
            <div
              class="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl border border-gray-100 dark:border-gray-800"
            >
              <div class="flex items-center justify-center gap-1 mb-1">
                <UIcon name="i-tabler-bread" class="w-3.5 h-3.5 text-yellow-500" />
                <div class="text-[10px] uppercase font-bold text-gray-400">Carbs</div>
              </div>
              <div class="text-lg font-bold text-gray-900 dark:text-white">
                {{ plan.dailyTotals.carbs }}g
              </div>
            </div>
            <div
              class="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl border border-gray-100 dark:border-gray-800"
            >
              <div class="flex items-center justify-center gap-1 mb-1">
                <UIcon name="i-tabler-egg" class="w-3.5 h-3.5 text-blue-500" />
                <div class="text-[10px] uppercase font-bold text-gray-400">Protein</div>
              </div>
              <div class="text-lg font-bold text-gray-900 dark:text-white">
                {{ plan.dailyTotals.protein }}g
              </div>
            </div>
            <div
              class="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl border border-gray-100 dark:border-gray-800"
            >
              <div class="flex items-center justify-center gap-1 mb-1">
                <UIcon name="i-tabler-droplet" class="w-3.5 h-3.5 text-blue-400" />
                <div class="text-[10px] uppercase font-bold text-gray-400">Hydration</div>
              </div>
              <div class="text-lg font-bold text-gray-900 dark:text-white">
                {{ (plan.dailyTotals.fluid / 1000).toFixed(1) }}L
              </div>
            </div>
          </div>
        </div>

        <!-- Right Side: Timeline -->
        <div class="space-y-4">
          <div
            class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2"
          >
            <UIcon name="i-heroicons-clock" class="w-4 h-4" />
            Fueling Timeline
          </div>
          <div class="space-y-3 max-h-[400px] overflow-y-auto pl-4 pr-2 pt-4 pb-8 custom-scrollbar">
            <template v-for="(window, index) in timeline" :key="index">
              <!-- Physical Effort Anchor -->
              <NutritionWorkoutEventCard
                v-if="window.type === 'WORKOUT_EVENT'"
                :workout="window.workout"
                :fuel-state="getWorkoutFuelState(window.workout)"
                class="!pb-2"
              />

              <!-- Fueling Window -->
              <NutritionWindowBlock
                v-else
                :type="window.type"
                :title="formatTitle(window)"
                :start-time="window.startTime"
                :end-time="window.endTime"
                :target-carbs="window.targetCarbs"
                :target-protein="window.targetProtein"
                :target-fat="window.targetFat"
                :target-fluid="window.targetFluid"
                :target-sodium="window.targetSodium"
                :items="window.items"
                :supplements="window.supplements"
                :is-locked="false"
                class="!pb-6"
              />
            </template>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="relative">
        <UInput
          icon="i-heroicons-chat-bubble-left-ellipsis"
          placeholder="I just had a banana..."
          size="sm"
          variant="none"
          class="bg-gray-50 dark:bg-gray-900/50 rounded-lg"
          @keyup.enter="handleQuickLog"
        />
        <div class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">
          Press Enter to Log
        </div>
      </div>
    </template>
  </UCard>
</template>

<script setup lang="ts">
  import { mapNutritionToTimeline } from '~/utils/nutrition-timeline'

  const props = defineProps<{
    plan: any
    workouts?: any[]
    loading?: boolean
  }>()

  const emit = defineEmits<{
    refresh: []
  }>()

  const userStore = useUserStore()
  const { formatDateUTC } = useFormat()
  const { onTaskCompleted } = useUserRunsState()
  const toast = useToast()

  const generating = ref(false)

  const timeline = computed(() => {
    if (!props.plan) return []

    // We need current daily nutrition object to pass to mapper
    // but we only have fuelingPlan. We can reconstruct a minimal object.
    const nutritionRecord = {
      date: new Date().toISOString().split('T')[0],
      fuelingPlan: props.plan
      // items are not easily accessible here without fetching full day
      // but the dashboard card is mostly for strategy/targets
    }

    return mapNutritionToTimeline(nutritionRecord, props.workouts || [], {
      preWorkoutWindow: 90, // Fallback if settings not available
      postWorkoutWindow: 60,
      baseProteinPerKg: 1.6,
      baseFatPerKg: 1.0,
      weight: userStore.profile?.weight || 75
    })
  })

  function getWorkoutFuelState(workout: any) {
    if (!workout) return 1
    const intensity = workout.workIntensity || 0.65
    if (intensity > 0.85) return 3
    if (intensity > 0.6) return 2
    return 1
  }

  function formatTitle(window: any) {
    if (window.type === 'TRANSITION') return 'Transition Fueling'
    if (window.type === 'DAILY_BASE') return 'Daily Base'
    if (window.type === 'WORKOUT_EVENT') return window.workout?.title || 'Workout'

    const typeMap: Record<string, string> = {
      PRE_WORKOUT: 'Pre-Workout',
      INTRA_WORKOUT: 'Intra-Workout Fueling',
      POST_WORKOUT: 'Post-Workout Recovery'
    }

    const typeStr = typeMap[window.type] || window.type
    return window.workoutTitle ? `${typeStr}: ${window.workoutTitle}` : typeStr
  }

  onTaskCompleted('generate-fueling-plan', () => {
    generating.value = false
    emit('refresh')
  })

  async function handleGenerate() {
    generating.value = true
    try {
      const response = await $fetch<any>('/api/nutrition/generate-plan', {
        method: 'POST'
      })

      if (response.success) {
        toast.add({
          title: 'Generation Started',
          description: response.message,
          color: 'success'
        })
      } else {
        generating.value = false
        toast.add({
          title: 'No Workout Found',
          description: response.message,
          color: 'warning'
        })
      }
    } catch (e: any) {
      generating.value = false
      toast.add({
        title: 'Failed to start generation',
        description: e.data?.message || e.message,
        color: 'error'
      })
    }
  }

  const fuelState = computed(() => {
    if (!props.plan) return 1
    const intraWindow = props.plan.windows?.find((w: any) => w.type === 'INTRA_WORKOUT')
    if (intraWindow?.description?.includes('Fuel State 3')) return 3
    if (intraWindow?.description?.includes('Fuel State 2')) return 2
    if (intraWindow?.description?.includes('Fuel State 1')) return 1
    return 1
  })

  const stateLabel = computed(() => {
    if (!props.plan) return 'No Plan'
    switch (fuelState.value) {
      case 3:
        return 'Performance (High Demand)'
      case 2:
        return 'Steady (Moderate Demand)'
      default:
        return 'Eco (Recovery/Light)'
    }
  })

  const strategy = computed(() => {
    if (!props.plan) return null
    return props.plan.notes?.find((n: string) => n.includes('Protocol'))?.split(':')[0] || null
  })

  const tankPercentage = ref(85) // Placeholder logic for now
  const tankColorClass = computed(() => {
    if (tankPercentage.value > 70) return 'text-green-500'
    if (tankPercentage.value > 30) return 'text-orange-500'
    return 'text-red-500 font-bold animate-pulse'
  })

  const tankBarClass = computed(() => {
    if (tankPercentage.value > 70) return 'bg-green-500'
    if (tankPercentage.value > 30) return 'bg-orange-500'
    return 'bg-red-500'
  })

  const tankAdvice = computed(() => {
    if (tankPercentage.value > 70) return 'Energy levels high. Ready for intensity.'
    if (tankPercentage.value > 30) return 'Moderate depletion. Focus on post-workout window.'
    return 'CRITICAL: Refuel immediately to avoid metabolic crash.'
  })

  function handleQuickLog(event: any) {
    const text = event.target.value
    if (!text) return

    // Emit event to be handled by chat or nutrition store
    // For now just clear
    event.target.value = ''
  }
</script>

<style scoped>
  @keyframes shimmer {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }
  .animate-shimmer {
    animation: shimmer 2s infinite;
  }
  .custom-scrollbar::-webkit-scrollbar {
    width: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: #e2e8f0;
    border-radius: 10px;
  }
  .dark .custom-scrollbar::-webkit-scrollbar-thumb {
    background: #334155;
  }
</style>
