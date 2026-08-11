<template>
  <UModal
    v-model:open="isOpen"
    :ui="{
      content: 'sm:max-w-md z-[9999]',
      overlay: 'z-[9998]'
    }"
    title="Macro Analysis"
    description="Explanation of macronutrients and their role in your metabolic strategy."
  >
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
              <div
                class="text-sm font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1.5"
              >
                <span>{{ item.label }}</span>
                <UTooltip v-if="item.badgeLabel && item.badgeTooltip" :text="item.badgeTooltip">
                  <UBadge
                    size="xs"
                    variant="subtle"
                    :color="(item.badgeColor as any) || 'neutral'"
                    class="font-black uppercase tracking-wide text-[9px] px-1.5 py-0.5 leading-none"
                  >
                    {{ item.badgeLabel }}
                  </UBadge>
                </UTooltip>
              </div>
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
          @click="
            () => {
              isOpen = false
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
    const safeWeight = Math.max(1, w)
    const target = Math.max(0, Number(props.target || 0))
    const actual = Math.max(0, Number(props.actual || 0))
    const adjustmentMultiplier = 1 + (s.targetAdjustmentPercent || 0) / 100

    const windows = Array.isArray(props.fuelingPlan?.windows) ? props.fuelingPlan.windows : []
    const sumWindowMacro = (
      macroKey: 'targetCarbs' | 'targetProtein' | 'targetFat',
      types?: string[]
    ) =>
      windows
        .filter((win: any) => !types || types.includes(win.type))
        .reduce((sum: number, win: any) => sum + Math.max(0, Number(win?.[macroKey] || 0)), 0)

    if (props.label === 'Carbs') {
      // Calculate the "Reverse Base" that led to this target
      // This ensures the numbers in the breakdown always lead to the 'target' shown
      const sensitivity = s.fuelingSensitivity || 1.0
      const weight = safeWeight

      // target = weight * base * sensitivity * adjustment
      // base = target / (weight * sensitivity * adjustment)
      const base = target / (weight * sensitivity * adjustmentMultiplier)
      const workoutAllocation = sumWindowMacro('targetCarbs', [
        'PRE_WORKOUT',
        'INTRA_WORKOUT',
        'POST_WORKOUT',
        'TRANSITION'
      ])
      const baseAllocation = sumWindowMacro('targetCarbs', ['DAILY_BASE'])
      const fallbackBaseAllocation = Math.max(0, target - workoutAllocation)
      const totalAllocation = sumWindowMacro('targetCarbs')

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

      if (totalAllocation > 0) {
        items.push({
          label: 'Workout Window Allocation',
          description: 'Carbs assigned to pre/intra/post workout windows.',
          value: `${Math.round(workoutAllocation)} g`
        })
        if (baseAllocation > 0) {
          items.push({
            label: 'Daily Base Allocation',
            description: 'Carbs reserved for non-workout baseline meals.',
            value: `${Math.round(baseAllocation)} g`
          })
        } else if (fallbackBaseAllocation > 0) {
          items.push({
            label: 'Unassigned Daily Balance',
            description:
              'No explicit baseline meal slots were saved for this day. This remaining carb budget can be distributed across regular meals.',
            value: `${Math.round(fallbackBaseAllocation)} g`
          })
        }
      }

      const finalGkg = target / weight
      items.push({
        label: 'Final Target Intensity',
        description: 'Resulting grams per kilogram after all multipliers.',
        value: `${finalGkg.toFixed(2)} g/kg`
      })
      items.push({
        label: 'Energy Contribution',
        description: 'Calories provided by this carb target.',
        value: `${Math.round(target * 4)} kcal`
      })
      items.push({
        label: 'Progress Today',
        description: 'Logged intake compared with your daily target.',
        value:
          actual >= target
            ? `${Math.round(actual - target)}g above target`
            : `${Math.round(target - actual)}g remaining`
      })
    } else if (props.label === 'Protein') {
      const workoutAllocation = sumWindowMacro('targetProtein', [
        'PRE_WORKOUT',
        'INTRA_WORKOUT',
        'POST_WORKOUT',
        'TRANSITION'
      ])
      const baseAllocation = sumWindowMacro('targetProtein', ['DAILY_BASE'])
      const fallbackBaseAllocation = Math.max(0, target - workoutAllocation)
      const totalAllocation = sumWindowMacro('targetProtein')
      const finalGkg = target / safeWeight

      items.push({
        label: 'Muscle Maintenance',
        description: 'Standard recommendation for endurance athletes to support repair.',
        value: `${s.baseProteinPerKg || 1.6} g/kg`
      })
      items.push({
        label: 'Athlete Weight',
        description: 'Your current weight used for scale-based calculation.',
        value: `${w.toFixed(1)} kg`
      })
      if (totalAllocation > 0) {
        items.push({
          label: 'Workout Recovery Allocation',
          description: 'Protein specifically distributed around training windows.',
          value: `${Math.round(workoutAllocation)} g`
        })
        if (baseAllocation > 0) {
          items.push({
            label: 'Baseline Meal Allocation',
            description: 'Protein distributed across regular meal windows.',
            value: `${Math.round(baseAllocation)} g`
          })
        } else if (fallbackBaseAllocation > 0) {
          items.push({
            label: 'Unassigned Daily Balance',
            description:
              'No explicit baseline meal slots were saved for this day. This remaining protein budget can be distributed across regular meals.',
            value: `${Math.round(fallbackBaseAllocation)} g`
          })
        }
      }
      items.push({
        label: 'Final Target Intensity',
        description: 'Resulting grams per kilogram at your current target.',
        value: `${finalGkg.toFixed(2)} g/kg`
      })
      items.push({
        label: 'Energy Contribution',
        description: 'Calories provided by this protein target.',
        value: `${Math.round(target * 4)} kcal`
      })
      items.push({
        label: 'Progress Today',
        description: 'Logged intake compared with your daily target.',
        value:
          actual >= target
            ? `${Math.round(actual - target)}g above target`
            : `${Math.round(target - actual)}g remaining`
      })
    } else if (props.label === 'Fat') {
      const workoutAllocation = sumWindowMacro('targetFat', [
        'PRE_WORKOUT',
        'INTRA_WORKOUT',
        'POST_WORKOUT',
        'TRANSITION'
      ])
      const baseAllocation = sumWindowMacro('targetFat', ['DAILY_BASE'])
      const fallbackBaseAllocation = Math.max(0, target - workoutAllocation)
      const totalAllocation = sumWindowMacro('targetFat')
      const finalGkg = target / safeWeight

      items.push({
        label: 'Hormonal Baseline',
        description: 'Essential fats for hormonal health and vitamin absorption.',
        value: `${s.baseFatPerKg || 1.0} g/kg`
      })
      items.push({
        label: 'Athlete Weight',
        description: 'Your current weight used for scale-based calculation.',
        value: `${w.toFixed(1)} kg`
      })
      if (totalAllocation > 0) {
        items.push({
          label: 'Workout Window Allocation',
          description: 'Fat assigned to training-adjacent meals.',
          value: `${Math.round(workoutAllocation)} g`
        })
        if (baseAllocation > 0) {
          items.push({
            label: 'Baseline Meal Allocation',
            description: 'Fat distributed across regular meal windows.',
            value: `${Math.round(baseAllocation)} g`
          })
        } else if (fallbackBaseAllocation > 0) {
          items.push({
            label: 'Unassigned Daily Balance',
            description:
              'No explicit baseline meal slots were saved for this day. This remaining fat budget can be distributed across regular meals.',
            value: `${Math.round(fallbackBaseAllocation)} g`
          })
        }
      }
      items.push({
        label: 'Final Target Intensity',
        description: 'Resulting grams per kilogram at your current target.',
        value: `${finalGkg.toFixed(2)} g/kg`
      })
      items.push({
        label: 'Energy Contribution',
        description: 'Calories provided by this fat target.',
        value: `${Math.round(target * 9)} kcal`
      })
      items.push({
        label: 'Progress Today',
        description: 'Logged intake compared with your daily target.',
        value:
          actual >= target
            ? `${Math.round(actual - target)}g above target`
            : `${Math.round(target - actual)}g remaining`
      })
    } else if (props.label === 'Calories') {
      const fp = props.fuelingPlan?.dailyTotals || props.settings?.fuelingPlan?.dailyTotals || {}
      const bmrBase = Math.round(s.bmr || 1600)
      const baseCaloriesMode =
        fp.baseCaloriesMode ||
        (s.baseCaloriesMode === 'MANUAL_NON_EXERCISE' ? 'MANUAL_NON_EXERCISE' : 'AUTO')
      const activityMultipliers: Record<string, number> = {
        SEDENTARY: 1.2,
        LIGHTLY_ACTIVE: 1.375,
        ACTIVE: 1.55,
        MODERATELY_ACTIVE: 1.725,
        VERY_ACTIVE: 1.9,
        EXTRA_ACTIVE: 2.1
      }
      const fallbackBaseCalories =
        baseCaloriesMode === 'MANUAL_NON_EXERCISE'
          ? Number(s.nonExerciseBaseCalories || 0)
          : bmrBase * (activityMultipliers[s.activityLevel || 'ACTIVE'] || 1.55)
      const baseCalories = Math.round(fp.baseCalories || fallbackBaseCalories)

      if (baseCaloriesMode === 'MANUAL_NON_EXERCISE') {
        items.push({
          label: 'Manual Non-Exercise Baseline',
          description: 'Your explicit daily calorie baseline for days without structured training.',
          value: `${baseCalories} kcal`
        })
      } else {
        items.push({
          label: 'Base Calories (Auto)',
          description: 'Computed from BMR and your selected activity level.',
          value: `${baseCalories} kcal`
        })
        items.push({
          label: 'Basal Metabolic Rate (BMR)',
          description: 'Energy required for basic life functions at rest.',
          value: `${bmrBase} kcal`
        })
      }

      // Show specific workouts if present
      if (fp.workoutCalories && fp.workoutCalories.length > 0) {
        fp.workoutCalories.forEach((w: any) => {
          const sourceType = w?.sourceType === 'actual' ? 'actual' : 'estimated'
          items.push({
            label: w.title || 'Training Demand',
            description:
              sourceType === 'actual'
                ? 'Actual recorded energy cost of this completed workout.'
                : 'Estimated energy cost of this workout.',
            value: `+${Math.round(w.calories)} kcal`,
            badgeLabel: sourceType === 'actual' ? 'ACTUAL' : 'EST',
            badgeColor: sourceType === 'actual' ? 'success' : 'neutral',
            badgeTooltip:
              sourceType === 'actual'
                ? 'This value comes from recorded workout energy.'
                : 'This value is predicted from planned intensity and duration.'
          })
        })
      } else if (fp.activityCalories > 5) {
        items.push({
          label: 'Training Demand',
          description: "Estimated energy cost of today's planned workouts.",
          value: `+${Math.round(fp.activityCalories)} kcal`,
          badgeLabel: 'EST',
          badgeColor: 'neutral',
          badgeTooltip: 'This value is predicted from planned workouts.'
        })
      }

      // Adjustment (Handle missing granular data explicitly)
      let adjustmentValue = fp.adjustmentCalories

      if (adjustmentValue === undefined) {
        // Fallback: estimate based on percent if missing from plan
        if (s.targetAdjustmentPercent) {
          const subtotal = baseCalories + (fp.activityCalories || 0)
          adjustmentValue = Math.round(subtotal * (s.targetAdjustmentPercent / 100))
        } else {
          // If no targetAdjustmentPercent, calculate the difference to reach the target
          adjustmentValue = props.target - baseCalories - (fp.activityCalories || 0)
        }
      }

      if (Math.abs(adjustmentValue) > 5) {
        items.push({
          label: `Goal Adjustment (${s.goalProfile || 'MAINTAIN'})`,
          description: `Adjustment applied for your goal.`,
          value: `${adjustmentValue > 0 ? '+' : ''}${Math.round(adjustmentValue)} kcal`
        })
      }

      // The day's calorie target is the higher of its energy budget and what its macro targets
      // already imply. When the macros win, the lines above stop adding up to the number on screen,
      // so the difference is named rather than left as an unexplained gap.
      const energyBudget = baseCalories + Number(fp.activityCalories || 0) + Number(adjustmentValue)
      const macroFloor = Math.round(Number(props.target || 0) - energyBudget)
      if (macroFloor > 5) {
        items.push({
          label: 'Macro Floor',
          description:
            'Your carb, protein and fat targets already require more energy than the day-budget above. The target is raised to match them.',
          value: `+${macroFloor} kcal`
        })
      }
    }

    return items
  })

  const coachTip = computed(() => {
    if (props.label === 'Carbs') {
      if (props.actual >= props.target) {
        return 'Daily carb target reached. Extra carbs are optional and should be used only if a timing-specific window still needs support.'
      }
      return props.fuelState === 3
        ? 'Today is a high-output day. Prioritize carbs around key windows first, then close any remaining daily gap.'
        : 'Lower intensity day: keep carbs steady and focus on timing around training demands rather than overfeeding late.'
    }
    if (props.label === 'Protein') {
      return props.actual >= props.target
        ? 'Protein target is already covered. Keep the rest of the day lighter and prioritize hydration and sleep.'
        : 'Spread protein across 4-5 servings and prioritize one feeding in the recovery window for best muscle repair.'
    }
    if (props.label === 'Fat') {
      return props.actual >= props.target
        ? 'Fat intake is already high for today. Keep upcoming meals lower-fat to improve digestion and preserve carb timing flexibility.'
        : 'Use quality fats (olive oil, nuts, avocado) and keep heavy fat away from pre/intra/post workout windows.'
    }
    return 'These targets are dynamic. They adjust automatically whenever your training plan or intensity changes.'
  })
</script>
