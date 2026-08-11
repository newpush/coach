<template>
  <div
    v-bind="attrs"
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

      <div class="flex items-center gap-2">
        <USelectMenu
          v-if="canEditStrategy"
          :model-value="selectedStrategy"
          :items="fuelingStrategies"
          value-key="value"
          size="xs"
          :loading="updatingStrategy"
          class="min-w-[132px]"
          :ui="{
            base: 'text-[10px] font-black uppercase tracking-widest'
          }"
          @update:model-value="onStrategyChange"
        />

        <UButton
          v-if="fuelState > 0"
          color="neutral"
          variant="ghost"
          size="xs"
          class="font-black uppercase tracking-widest text-[10px]"
          @click="
            () => {
              showFuelStateModal = true
            }
          "
        >
          Why Fuel State {{ fuelState }}?
        </UButton>

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

  <UModal
    v-model:open="showFuelStateModal"
    :ui="{
      content: 'sm:max-w-lg z-[9999]',
      overlay: 'z-[9998]'
    }"
    title="Fuel State Breakdown"
    description="Technical details on how your fueling state was calculated based on workout intensity and triggers."
  >
    <template #content>
      <div class="p-6 space-y-5">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="text-lg font-black uppercase tracking-tight text-gray-900 dark:text-white">
              Fuel State {{ fuelState }} Breakdown
            </h3>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              How this workout was classified for fueling.
            </p>
          </div>
          <UBadge color="primary" variant="soft" class="font-black uppercase text-[10px]">
            {{ stateLabel }}
          </UBadge>
        </div>

        <div class="space-y-3">
          <div
            class="flex items-start justify-between gap-3 py-2 border-b border-gray-100 dark:border-gray-800"
          >
            <div>
              <p class="text-sm font-bold text-gray-700 dark:text-gray-200">Workout Intensity</p>
              <p class="text-[11px] text-gray-500 dark:text-gray-400">
                Intensity factor used to pick the fuel state.
              </p>
            </div>
            <p class="text-sm font-black text-gray-900 dark:text-white">
              IF {{ intensityDisplay }}
            </p>
          </div>

          <div
            class="flex items-start justify-between gap-3 py-2 border-b border-gray-100 dark:border-gray-800"
          >
            <div>
              <p class="text-sm font-bold text-gray-700 dark:text-gray-200">Your Thresholds</p>
              <p class="text-[11px] text-gray-500 dark:text-gray-400">
                State 2 starts above State 1 trigger; State 3 starts above State 2 trigger.
              </p>
            </div>
            <p class="text-sm font-black text-gray-900 dark:text-white whitespace-pre-line">
              {{ thresholdsDisplay }}
            </p>
          </div>

          <div
            class="flex items-start justify-between gap-3 py-2 border-b border-gray-100 dark:border-gray-800"
          >
            <div>
              <p class="text-sm font-bold text-gray-700 dark:text-gray-200">Selected Rule</p>
              <p class="text-[11px] text-gray-500 dark:text-gray-400">
                Applied directly from your Fuel State trigger settings.
              </p>
            </div>
            <p
              class="text-sm font-black text-gray-900 dark:text-white text-right whitespace-pre-line"
            >
              {{ selectedRule }}
            </p>
          </div>

          <div
            class="flex items-start justify-between gap-3 py-2 border-b border-gray-100 dark:border-gray-800"
          >
            <div>
              <p class="text-sm font-bold text-gray-700 dark:text-gray-200">Workout Context</p>
              <p class="text-[11px] text-gray-500 dark:text-gray-400">
                Session duration and strategy affect script details.
              </p>
            </div>
            <p class="text-sm font-black text-gray-900 dark:text-white text-right">
              {{ workoutContextDisplay }}
            </p>
          </div>

          <div
            class="flex items-start justify-between gap-3 py-2 border-b border-gray-100 dark:border-gray-800"
          >
            <div>
              <p class="text-sm font-bold text-gray-700 dark:text-gray-200">Intra-Workout Target</p>
              <p class="text-[11px] text-gray-500 dark:text-gray-400">
                Final carbs/fluid/sodium from this classification.
              </p>
            </div>
            <p class="text-sm font-black text-gray-900 dark:text-white text-right">
              {{ intraTargetDisplay }}
            </p>
          </div>
        </div>

        <div
          class="bg-primary-50 dark:bg-primary-950/20 p-4 rounded-xl border border-primary-100 dark:border-primary-900"
        >
          <p
            class="text-xs font-bold text-primary-700 dark:text-primary-300 uppercase tracking-wider"
          >
            What to change if this looks off
          </p>
          <p class="text-xs text-primary-600 dark:text-primary-400 mt-1 leading-relaxed">
            Adjust Intensity Factor in the workout structure or update Fuel State triggers in
            Nutrition Settings.
          </p>
        </div>

        <UButton
          color="neutral"
          variant="soft"
          block
          class="font-bold uppercase text-xs tracking-tight"
          @click="
            () => {
              showFuelStateModal = false
            }
          "
        >
          Close
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
  defineOptions({
    inheritAttrs: false
  })

  const attrs = useAttrs()

  const props = defineProps<{
    fuelingPlan: any
    fuelState: number
    isGutTraining?: boolean
    workoutIntensity?: number
    durationSec?: number
    strategyOverride?: string | null
    nutritionSettings?: any
    canEditStrategy?: boolean
    updatingStrategy?: boolean
  }>()

  const emit = defineEmits<{
    'change-fueling-strategy': [value: string]
  }>()

  const showFuelStateModal = ref(false)

  const fuelingStrategies = [
    { label: 'Standard', value: 'STANDARD' },
    { label: 'Train Low', value: 'TRAIN_LOW' },
    { label: 'High Carb', value: 'HIGH_CARB' }
  ]

  const selectedStrategy = computed(() => props.strategyOverride || 'STANDARD')

  function onStrategyChange(value: string | { value?: string } | null) {
    const nextValue =
      typeof value === 'string'
        ? value
        : value && typeof value.value === 'string'
          ? value.value
          : ''
    if (!nextValue || nextValue === selectedStrategy.value) return
    emit('change-fueling-strategy', nextValue)
  }

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

  const stateLabel = computed(() => {
    if (props.fuelState === 3) return 'Performance'
    if (props.fuelState === 2) return 'Steady'
    return 'Eco'
  })

  const resolvedSettings = computed(() => ({
    fuelState1Trigger: Number(props.nutritionSettings?.fuelState1Trigger ?? 0.7),
    fuelState2Trigger: Number(props.nutritionSettings?.fuelState2Trigger ?? 0.85)
  }))

  const resolvedIntensity = computed(() => {
    const fromWorkout = Number(props.workoutIntensity ?? NaN)
    if (Number.isFinite(fromWorkout) && fromWorkout > 0) return fromWorkout

    const desc = String(intraWindow.value?.description || '')
    const maybeState = desc.match(/Fuel State\s+(\d)/i)?.[1]
    if (maybeState === '3') return resolvedSettings.value.fuelState2Trigger + 0.01
    if (maybeState === '2')
      return (
        (resolvedSettings.value.fuelState1Trigger + resolvedSettings.value.fuelState2Trigger) / 2
      )
    return Math.max(0.01, resolvedSettings.value.fuelState1Trigger - 0.01)
  })

  const intensityDisplay = computed(() => resolvedIntensity.value.toFixed(2))

  const thresholdsDisplay = computed(
    () =>
      `S1<${resolvedSettings.value.fuelState1Trigger.toFixed(2)}\nS2<${resolvedSettings.value.fuelState2Trigger.toFixed(2)}\nS3>${resolvedSettings.value.fuelState2Trigger.toFixed(2)}`
  )

  const selectedRule = computed(() => {
    const intensity = resolvedIntensity.value
    const s1 = resolvedSettings.value.fuelState1Trigger
    const s2 = resolvedSettings.value.fuelState2Trigger
    if (intensity > s2) return `IF ${intensity.toFixed(2)} > ${s2.toFixed(2)}\n→ Fuel State 3`
    if (intensity > s1)
      return `IF ${intensity.toFixed(2)} > ${s1.toFixed(2)} and <= ${s2.toFixed(2)}\n→ Fuel State 2`
    return `IF ${intensity.toFixed(2)} <= ${s1.toFixed(2)}\n→ Fuel State 1`
  })

  const workoutContextDisplay = computed(() => {
    const hours = Math.max(0, Number(props.durationSec || 0) / 3600)
    const durationLabel = `${hours.toFixed(1)}h`
    const strategy = props.strategyOverride
      ? String(props.strategyOverride).replaceAll('_', ' ')
      : 'STANDARD'
    return `${durationLabel} • ${strategy}`
  })

  const intraTargetDisplay = computed(() => {
    const carbs = Math.round(Number(intraWindow.value?.targetCarbs || 0))
    const fluid = Math.round(Number(intraWindow.value?.targetFluid || 0))
    const sodium = Math.round(Number(intraWindow.value?.targetSodium || 0))
    return `${carbs}g • ${fluid}ml • ${sodium}mg`
  })
</script>
