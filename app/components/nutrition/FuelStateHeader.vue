<template>
  <div class="space-y-6">
    <!-- Fuel State Banner -->
    <div
      class="rounded-xl p-4 sm:p-6 shadow-sm border transition-all duration-500"
      :class="[
        fuelState === 3
          ? 'bg-red-50 dark:bg-red-950/20 border-red-100 dark:border-red-900/50'
          : fuelState === 2
            ? 'bg-orange-50 dark:bg-orange-950/20 border-orange-100 dark:border-orange-900/50'
            : 'bg-blue-50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/50'
      ]"
    >
      <div class="flex items-start justify-between">
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <h2
              class="text-lg sm:text-xl font-black uppercase tracking-tight"
              :class="[
                fuelState === 3
                  ? 'text-red-600 dark:text-red-400'
                  : fuelState === 2
                    ? 'text-orange-600 dark:text-orange-400'
                    : 'text-blue-600 dark:text-blue-400'
              ]"
            >
              Fuel State {{ fuelState }}: {{ stateLabel }}
            </h2>
            <UTooltip v-if="isLocked" text="Manual Lock Enabled: AI recommendations are static">
              <UIcon name="i-heroicons-lock-closed" class="w-5 h-5 text-gray-400" />
            </UTooltip>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400 font-medium">
            {{ stateDescription }}
          </p>
        </div>

        <!-- Goal Profile Offset -->
        <div v-if="goalAdjustment !== 0" class="text-right">
          <div class="text-[10px] font-bold uppercase text-gray-400 tracking-wider mb-1">
            Goal Offset
          </div>
          <UBadge
            variant="soft"
            :color="goalAdjustment < 0 ? 'error' : 'success'"
            class="font-black"
          >
            {{ goalAdjustment > 0 ? '+' : '' }}{{ goalAdjustment }} kcal
          </UBadge>
        </div>
      </div>
    </div>

    <!-- Macro Summary Charts -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div
        v-for="macro in macros"
        :key="macro.label"
        class="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden relative group"
      >
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <UIcon :name="macro.icon" class="w-5 h-5" :class="macro.iconColor" />
            <span class="text-xs font-bold uppercase text-gray-500 tracking-wider">{{
              macro.label
            }}</span>
          </div>
          <span class="text-[10px] font-bold" :class="macro.statusColor"
            >{{ macro.percentage }}%</span
          >
        </div>

        <div class="flex items-baseline gap-1 mb-2">
          <span class="text-2xl font-black text-gray-900 dark:text-white">{{
            Math.round(macro.actual)
          }}</span>
          <span class="text-sm font-bold text-gray-400"
            >/ {{ Math.round(macro.target) }}{{ macro.unit }}</span
          >
        </div>

        <!-- Progress Bar -->
        <div class="h-2 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            class="h-full transition-all duration-1000 ease-out rounded-full"
            :class="macro.barColor"
            :style="{ width: `${Math.min(macro.percentage, 100)}%` }"
          />
        </div>

        <!-- Hover indicator -->
        <div
          class="absolute bottom-0 left-0 h-0.5 bg-gray-200 dark:bg-gray-700 w-full transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  const props = withDefaults(
    defineProps<{
      fuelState: number
      isLocked?: boolean
      goalAdjustment?: number
      targets: {
        calories: number
        carbs: number
        protein: number
        fat: number
      }
      actuals: {
        calories: number
        carbs: number
        protein: number
        fat: number
      }
    }>(),
    {
      isLocked: false,
      goalAdjustment: 0
    }
  )

  const stateLabel = computed(() => {
    switch (props.fuelState) {
      case 3:
        return 'Performance'
      case 2:
        return 'Steady'
      default:
        return 'Eco'
    }
  })

  const stateDescription = computed(() => {
    switch (props.fuelState) {
      case 3:
        return 'High intensity day. Prioritize carbohydrates for peak output and recovery.'
      case 2:
        return 'Endurance/Tempo day. Balanced fueling to support consistent energy.'
      default:
        return 'Recovery/Easy day. Focus on fat oxidation and high-quality protein.'
    }
  })

  const macros = computed(() => [
    {
      label: 'Calories',
      actual: props.actuals.calories,
      target: props.targets.calories,
      unit: '',
      icon: 'i-tabler-flame',
      iconColor: 'text-orange-500',
      barColor: 'bg-orange-500',
      percentage: Math.round((props.actuals.calories / props.targets.calories) * 100) || 0,
      statusColor: getStatusColor(props.actuals.calories / props.targets.calories)
    },
    {
      label: 'Carbs',
      actual: props.actuals.carbs,
      target: props.targets.carbs,
      unit: 'g',
      icon: 'i-tabler-bread',
      iconColor: 'text-yellow-500',
      barColor: 'bg-yellow-500',
      percentage: Math.round((props.actuals.carbs / props.targets.carbs) * 100) || 0,
      statusColor: getStatusColor(props.actuals.carbs / props.targets.carbs)
    },
    {
      label: 'Protein',
      actual: props.actuals.protein,
      target: props.targets.protein,
      unit: 'g',
      icon: 'i-tabler-egg',
      iconColor: 'text-blue-500',
      barColor: 'bg-blue-500',
      percentage: Math.round((props.actuals.protein / props.targets.protein) * 100) || 0,
      statusColor: getStatusColor(props.actuals.protein / props.targets.protein)
    },
    {
      label: 'Fat',
      actual: props.actuals.fat,
      target: props.targets.fat,
      unit: 'g',
      icon: 'i-tabler-droplet',
      iconColor: 'text-green-500',
      barColor: 'bg-green-500',
      percentage: Math.round((props.actuals.fat / props.targets.fat) * 100) || 0,
      statusColor: getStatusColor(props.actuals.fat / props.targets.fat)
    }
  ])

  function getStatusColor(ratio: number) {
    if (ratio > 1.1) return 'text-red-500'
    if (ratio > 0.9) return 'text-green-500'
    if (ratio > 0.7) return 'text-orange-500'
    return 'text-gray-400'
  }
</script>
