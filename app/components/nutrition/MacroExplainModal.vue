<template>
  <UModal v-model:open="isOpen" :ui="{ content: 'sm:max-w-md' }">
    <template #content>
      <div class="p-6 space-y-6">
        <!-- Header -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UIcon :name="macroInfo.icon" class="w-6 h-6" :class="macroInfo.iconColor" />
            <h3 class="text-lg font-black uppercase tracking-tight text-gray-900 dark:text-white">
              {{ label }} Analysis
            </h3>
          </div>
          <div class="text-2xl font-black" :class="macroInfo.iconColor">
            {{ Math.round(actual) }}{{ unit }}
          </div>
        </div>

        <!-- Target Summary -->
        <div
          class="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800"
        >
          <div class="flex justify-between items-center mb-1">
            <span class="text-xs font-bold text-gray-400 uppercase tracking-widest"
              >Total Daily Target</span
            >
            <span class="text-sm font-black text-gray-900 dark:text-white"
              >{{ Math.round(target) }}{{ unit }}</span
            >
          </div>
          <div class="h-1.5 w-full bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden mt-2">
            <div
              class="h-full bg-primary-500 rounded-full"
              :style="{ width: `${Math.min((actual / target) * 100, 100)}%` }"
            />
          </div>
        </div>

        <!-- Logic Breakdown -->
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

        <!-- Coach Tip -->
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
    label: string
    actual: number
    target: number
    unit: string
    fuelState: number
    settings: any
    weight: number
    fuelingPlan?: any
  }>()

  const emit = defineEmits<{
    'update:modelValue': [value: boolean]
  }>()

  const isOpen = computed({
    get: () => props.modelValue,
    set: (val) => emit('update:modelValue', val)
  })

  const macroInfo = computed(() => {
    switch (props.label) {
      case 'Carbs':
        return { icon: 'i-tabler-bread', iconColor: 'text-yellow-500' }
      case 'Protein':
        return { icon: 'i-tabler-egg', iconColor: 'text-blue-500' }
      case 'Fat':
        return { icon: 'i-tabler-droplet', iconColor: 'text-green-500' }
      default:
        return { icon: 'i-tabler-flame', iconColor: 'text-orange-500' }
    }
  })

  const breakdown = computed(() => {
    const items = []
    const s = props.settings || {}
    const w = props.weight || 75

    if (props.label === 'Carbs') {
      const adjustmentMultiplier = 1 + (s.targetAdjustmentPercent || 0) / 100

      // Calculate the "Reverse Base" that led to this target
      // This ensures the numbers in the breakdown always lead to the 'target' shown
      const sensitivity = s.fuelingSensitivity || 1.0
      const weight = props.weight || 75

      // target = weight * base * sensitivity * adjustment
      // base = target / (weight * sensitivity * adjustment)
      const base = props.target / (weight * sensitivity * adjustmentMultiplier)

      items.push({
        label: 'Metabolic Baseline',
        description: `Based on your Fuel State ${props.fuelState} activity intensity.`,
        value: `${base.toFixed(1)} g/kg`
      })
      items.push({
        label: 'Sensitivity Factor',
        description: 'Global multiplier applied to your carb ranges.',
        value: `x${s.fuelingSensitivity || 1.0}`
      })
      if (s.targetAdjustmentPercent !== 0) {
        items.push({
          label: 'Goal Adjustment',
          description: `Scaled for your current profile goal (${s.goalProfile}).`,
          value: `${s.targetAdjustmentPercent > 0 ? '+' : ''}${s.targetAdjustmentPercent}%`
        })
      }

      const finalGkg = props.target / weight
      items.push({
        label: 'Final Target Intensity',
        description: 'Resulting grams per kilogram after all multipliers.',
        value: `${finalGkg.toFixed(2)} g/kg`
      })
    } else if (props.label === 'Protein') {
      items.push({
        label: 'Muscle Maintenance',
        description: 'Standard recommendation for endurance athletes to support repair.',
        value: `${s.baseProteinPerKg || 1.6} g/kg`
      })
      items.push({
        label: 'Athlete Weight',
        description: 'Your current weight used for scale-based calculation.',
        value: `${w} kg`
      })
    } else if (props.label === 'Fat') {
      items.push({
        label: 'Hormonal Baseline',
        description: 'Essential fats for hormonal health and vitamin absorption.',
        value: `${s.baseFatPerKg || 1.0} g/kg`
      })
    } else if (props.label === 'Calories') {
      const fp = props.fuelingPlan?.dailyTotals || props.settings?.fuelingPlan?.dailyTotals || {}

      const bmrAdjustmentMultiplier =
        (props.settings?.activityLevel || s.activityLevel) === 'SEDENTARY' ? 1.2 : 1.375
      const bmrBase = s.bmr || 1600
      const lifestyleAddition = Math.round(bmrBase * (bmrAdjustmentMultiplier - 1))

      items.push({
        label: 'Basal Metabolic Rate (BMR)',
        description: 'Energy required for basic life functions at rest.',
        value: `${Math.round(bmrBase)} kcal`
      })

      items.push({
        label: 'Lifestyle Activity',
        description: `Energy for non-exercise movement (${Math.round((bmrAdjustmentMultiplier - 1) * 100)}% multiplier).`,
        value: `+${lifestyleAddition} kcal`
      })

      // Show specific workouts if present
      if (fp.workoutCalories && fp.workoutCalories.length > 0) {
        fp.workoutCalories.forEach((w: any) => {
          items.push({
            label: w.title || 'Training Demand',
            description: 'Estimated energy cost of this workout.',
            value: `+${Math.round(w.calories)} kcal`
          })
        })
      } else if (fp.activityCalories > 5) {
        items.push({
          label: 'Training Demand',
          description: "Estimated energy cost of today's planned workouts.",
          value: `+${Math.round(fp.activityCalories)} kcal`
        })
      }

      // Adjustment (Handle missing granular data explicitly)
      const bmrMultiplied = Math.round(bmrBase * bmrAdjustmentMultiplier)
      let adjustmentValue = fp.adjustmentCalories

      if (adjustmentValue === undefined) {
        // Fallback: estimate based on percent if missing from plan
        if (s.targetAdjustmentPercent) {
          const subtotal = bmrMultiplied + (fp.activityCalories || 0)
          adjustmentValue = Math.round(subtotal * (s.targetAdjustmentPercent / 100))
        } else {
          // If no targetAdjustmentPercent, calculate the difference to reach the target
          adjustmentValue = props.target - bmrMultiplied - (fp.activityCalories || 0)
        }
      }

      if (Math.abs(adjustmentValue) > 5) {
        items.push({
          label: `Goal Adjustment (${s.goalProfile || 'MAINTAIN'})`,
          description: `Adjustment applied for your goal.`,
          value: `${adjustmentValue > 0 ? '+' : ''}${Math.round(adjustmentValue)} kcal`
        })
      }
    }

    return items
  })

  const coachTip = computed(() => {
    if (props.label === 'Carbs') {
      return props.fuelState === 3
        ? "Today is a high-output day. Your carb target is aggressive to ensure you don't 'bonk' and recover fast."
        : 'Lower intensity today means we prioritize fat oxidation while keeping enough carbs for metabolic health.'
    }
    if (props.label === 'Protein') {
      return 'Consistency is key. Aim to spread this protein across 4-5 servings to maximize muscle protein synthesis.'
    }
    if (props.label === 'Fat') {
      return 'Focus on quality: avocados, nuts, and olive oil. Avoid heavy fats right before your interval sessions.'
    }
    return 'These targets are dynamic. They adjust automatically whenever your training plan or intensity changes.'
  })
</script>
