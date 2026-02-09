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
        <UBadge v-if="strategy" color="neutral" variant="subtle" size="xs">
          {{ strategy }}
        </UBadge>
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
            class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2"
          >
            <UIcon name="i-heroicons-clock" class="w-4 h-4" />
            Fueling Timeline
          </div>
          <div class="space-y-3">
            <div
              v-for="window in sortedWindows"
              :key="window.startTime"
              class="relative pl-6 pb-4 border-l border-gray-200 dark:border-gray-700 last:border-0 last:pb-0"
            >
              <!-- Timeline Dot -->
              <div
                class="absolute left-[-5px] top-0 w-2.5 h-2.5 rounded-full bg-white dark:bg-gray-900 border-2"
                :class="windowBorderClass(window)"
              />

              <div class="flex flex-col gap-1">
                <div class="flex items-center justify-between">
                  <span
                    class="text-xs font-bold uppercase tracking-wider"
                    :class="windowTextClass(window)"
                  >
                    {{ formatWindowType(window.type) }}
                  </span>
                  <span class="text-[10px] text-gray-400 font-medium">
                    {{ formatWindowTime(window) }}
                  </span>
                </div>

                <div
                  class="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-3"
                >
                  <div class="flex items-center gap-1">
                    <UIcon name="i-tabler-bread" class="w-3.5 h-3.5 text-yellow-500" />
                    <span
                      >{{ window.targetCarbs }}g
                      <span class="font-normal text-gray-500 dark:text-gray-400 text-xs"
                        >carbs</span
                      ></span
                    >
                  </div>
                  <div v-if="window.targetProtein > 0" class="flex items-center gap-1">
                    <UIcon name="i-tabler-egg" class="w-3.5 h-3.5 text-blue-500" />
                    <span
                      >{{ window.targetProtein }}g
                      <span class="font-normal text-gray-500 dark:text-gray-400 text-xs"
                        >protein</span
                      ></span
                    >
                  </div>
                  <UBadge
                    v-if="window.status === 'HIT'"
                    color="success"
                    variant="subtle"
                    size="xs"
                    class="ml-auto"
                    >Met</UBadge
                  >
                </div>

                <p class="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
                  {{ window.description }}
                </p>

                <!-- Supplements -->
                <div v-if="window.supplements?.length" class="flex flex-wrap gap-1 mt-1.5">
                  <UBadge
                    v-for="supp in window.supplements"
                    :key="supp"
                    color="primary"
                    variant="soft"
                    size="xs"
                    class="text-[9px]"
                  >
                    {{ supp }}
                  </UBadge>
                </div>
              </div>
            </div>
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
  const props = defineProps<{
    plan: any
    loading?: boolean
  }>()

  const emit = defineEmits<{
    refresh: []
  }>()

  const { formatDateUTC } = useFormat()
  const { onTaskCompleted } = useUserRunsState()
  const toast = useToast()

  const generating = ref(false)

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

  const sortedWindows = computed(() => {
    if (!props.plan) return []
    return [...(props.plan.windows || [])].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    )
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

  function formatWindowType(type: string) {
    return type.replace('_', ' ')
  }

  function formatWindowTime(window: any) {
    const start = new Date(window.startTime)
    const end = new Date(window.endTime)
    return `${start.getHours()}:${start.getMinutes().toString().padStart(2, '0')} - ${end.getHours()}:${end.getMinutes().toString().padStart(2, '0')}`
  }

  function windowBorderClass(window: any) {
    switch (window.type) {
      case 'PRE_WORKOUT':
        return 'border-blue-400'
      case 'INTRA_WORKOUT':
        return 'border-red-500'
      case 'POST_WORKOUT':
        return 'border-green-500'
      default:
        return 'border-gray-400'
    }
  }

  function windowTextClass(window: any) {
    switch (window.type) {
      case 'PRE_WORKOUT':
        return 'text-blue-500'
      case 'INTRA_WORKOUT':
        return 'text-red-500'
      case 'POST_WORKOUT':
        return 'text-green-600'
      default:
        return 'text-gray-500'
    }
  }

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
</style>
