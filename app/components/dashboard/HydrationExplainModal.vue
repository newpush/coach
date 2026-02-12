<template>
  <UModal v-model:open="isOpen" :ui="{ content: 'sm:max-w-md' }">
    <template #content>
      <div class="p-6 space-y-6">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UIcon name="i-tabler-droplet" class="w-6 h-6 text-blue-500" />
            <h3 class="text-lg font-black uppercase tracking-tight text-gray-900 dark:text-white">
              Hydration Analysis
            </h3>
          </div>
          <div class="text-right">
            <div class="text-2xl font-black text-blue-500">{{ actualLiters.toFixed(1) }}L</div>
            <div class="text-[10px] font-bold uppercase text-gray-400">Logged</div>
          </div>
        </div>

        <div
          class="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800"
        >
          <div class="flex justify-between items-center mb-1">
            <span class="text-xs font-bold text-gray-400 uppercase tracking-widest"
              >Daily Fluid Target</span
            >
            <span class="text-sm font-black text-gray-900 dark:text-white"
              >{{ targetLiters.toFixed(1) }}L</span
            >
          </div>
          <div class="h-1.5 w-full bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden mt-2">
            <div
              class="h-full bg-blue-500 rounded-full"
              :style="{ width: `${Math.min(progressPercent, 100)}%` }"
            />
          </div>
        </div>

        <div class="space-y-4">
          <h4
            class="text-[10px] font-black uppercase text-gray-400 tracking-widest flex items-center gap-1"
          >
            <UIcon name="i-heroicons-cpu-chip" class="w-3.5 h-3.5" />
            Calculation logic
          </h4>

          <div
            v-for="item in breakdown"
            :key="item.label"
            class="flex items-start justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0"
          >
            <div class="space-y-0.5">
              <div class="text-sm font-bold text-gray-700 dark:text-gray-200">{{ item.label }}</div>
              <div class="text-[10px] text-gray-400 font-medium leading-tight max-w-[220px]">
                {{ item.description }}
              </div>
            </div>
            <div class="text-sm font-black text-gray-900 dark:text-white whitespace-nowrap">
              {{ item.value }}
            </div>
          </div>
        </div>

        <div
          class="bg-primary-50 dark:bg-primary-950/20 p-4 rounded-xl border border-primary-100 dark:border-primary-900"
        >
          <p
            class="text-sm font-bold text-primary-700 dark:text-primary-300 flex items-center gap-2"
          >
            <UIcon name="i-heroicons-light-bulb" class="w-4 h-4" />
            Coach Insight
          </p>
          <p class="text-xs text-primary-600 dark:text-primary-400 mt-1 leading-relaxed italic">
            {{ coachTip }}
          </p>
        </div>

        <UButton
          color="neutral"
          variant="soft"
          block
          class="font-bold uppercase tracking-tight text-xs"
          @click="isOpen = false"
        >
          Close
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
  const props = defineProps<{
    modelValue: boolean
    nutrition: any
    settings?: any
  }>()

  const emit = defineEmits<{
    'update:modelValue': [value: boolean]
  }>()

  const isOpen = computed({
    get: () => props.modelValue,
    set: (val) => emit('update:modelValue', val)
  })

  const actualMl = computed(() => props.nutrition?.waterMl || 0)
  const targetMl = computed(() => props.nutrition?.fuelingPlan?.dailyTotals?.fluid || 2000)
  const actualLiters = computed(() => actualMl.value / 1000)
  const targetLiters = computed(() => targetMl.value / 1000)
  const progressPercent = computed(() =>
    targetMl.value > 0 ? (actualMl.value / targetMl.value) * 100 : 0
  )

  const intraWindows = computed(
    () =>
      (props.nutrition?.fuelingPlan?.windows || []).filter(
        (w: any) => w.type === 'INTRA_WORKOUT'
      ) as any[]
  )

  const workoutDurationHours = computed(() =>
    intraWindows.value.reduce((sum: number, w: any) => {
      const start = new Date(w.startTime)
      const end = new Date(w.endTime)
      const hrs = Math.max(0, (end.getTime() - start.getTime()) / 3600000)
      return sum + hrs
    }, 0)
  )

  const baseHydrationMl = 2000
  const workoutReplacementMl = computed(() => Math.max(0, targetMl.value - baseHydrationMl))
  const impliedSweatRate = computed(() => {
    if (workoutDurationHours.value <= 0) return null
    return workoutReplacementMl.value / 1000 / workoutDurationHours.value
  })

  const sweatRateSource = computed(() => {
    const configured = props.settings?.sweatRate
    if (typeof configured === 'number' && configured > 0) return 'manual'
    const notes = props.nutrition?.fuelingPlan?.notes || []
    const hasEstimatedNote = notes.some(
      (n: string) => typeof n === 'string' && n.toLowerCase().includes('estimated sweat rate')
    )
    return hasEstimatedNote ? 'estimated lookup' : 'default estimate'
  })

  const breakdown = computed(() => {
    const items = [
      {
        label: 'Daily Baseline',
        description: 'Base daily hydration target used on all days.',
        value: `+${(baseHydrationMl / 1000).toFixed(1)}L`
      }
    ]

    if (workoutReplacementMl.value > 0) {
      items.push({
        label: 'Workout Fluid Replacement',
        description:
          sweatRateSource.value === 'manual'
            ? 'Added from your configured sweat rate setting.'
            : 'Estimated from planned workout intensity and temperature via sweat-rate table.',
        value: `+${(workoutReplacementMl.value / 1000).toFixed(1)}L`
      })
    }

    if (impliedSweatRate.value != null) {
      items.push({
        label: 'Implied Sweat Rate',
        description: `Replacement / planned training duration (${workoutDurationHours.value.toFixed(1)}h).`,
        value: `${impliedSweatRate.value.toFixed(2)} L/hr`
      })
    }

    items.push({
      label: 'Current Logged Intake',
      description: 'Hydration logged from meals, AI capture, and manual fluid entries.',
      value: `${actualLiters.value.toFixed(1)}L`
    })

    return items
  })

  const coachTip = computed(() => {
    if (progressPercent.value < 50) {
      return 'You are behind on today’s fluid target. Add 500ml over your next meal window.'
    }
    if (progressPercent.value > 110) {
      return 'You are ahead of the target. Keep electrolytes in line with intake during longer sessions.'
    }
    return 'Hydration is on track. Keep steady intake across the day rather than large single boluses.'
  })
</script>
