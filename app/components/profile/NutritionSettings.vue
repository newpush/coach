<template>
  <div class="space-y-6">
    <UAlert
      v-if="isProfileDataMissing"
      icon="i-heroicons-exclamation-triangle"
      color="warning"
      variant="soft"
      title="Missing Profile Information"
      description="Weight, Height, Date of Birth, and Sex are required to automatically calculate your BMR. Please update them in Basic Settings."
      :actions="[
        {
          label: 'Go to Basic Settings',
          color: 'warning',
          variant: 'solid',
          onClick: () => $emit('navigate', 'basic')
        }
      ]"
    />

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">
              Metabolic Profile
            </h3>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Your physiological baseline for nutrition calculations.
            </p>
          </div>
        </div>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <UFormField
          label="Current Weight"
          name="weight"
          help="Foundation for relative macro targets (g/kg). Managed in Basic Settings."
        >
          <UInput :model-value="props.profile?.weight" type="number" disabled class="w-full">
            <template #trailing>
              <span class="text-gray-500 dark:text-gray-400 text-xs">{{
                props.profile?.weightUnits === 'Pounds' ? 'lbs' : 'kg'
              }}</span>
            </template>
          </UInput>
        </UFormField>

        <UFormField label="Basal Metabolic Rate (BMR)" name="bmr" help="Calories burned at rest.">
          <div class="flex gap-2">
            <UInput
              v-model.number="localSettings.bmr"
              type="number"
              :min="500"
              :max="5000"
              placeholder="1600"
              class="flex-1"
            >
              <template #trailing>
                <span class="text-gray-500 dark:text-gray-400 text-xs">kcal/day</span>
              </template>
            </UInput>
            <UButton
              icon="i-heroicons-calculator"
              color="neutral"
              variant="subtle"
              @click="calculateBMR"
            >
              Set BMR
            </UButton>
          </div>
        </UFormField>

        <UFormField
          label="Daily Activity Level"
          name="activityLevel"
          class="md:col-span-1"
          help="Your non-exercise daily movement (NEAT)."
        >
          <USelectMenu
            v-model="localSettings.activityLevel"
            :items="activityLevels"
            value-key="value"
            class="w-full"
            :ui="{ content: 'w-full min-w-[var(--reka-popper-anchor-width)]' }"
          />
        </UFormField>

        <UFormField
          label="Estimated TDEE"
          name="tdee"
          help="Total Daily Energy Expenditure (BMR × Activity)"
        >
          <UInput
            :model-value="tdee"
            type="number"
            disabled
            class="w-full"
            :ui="{ base: 'bg-gray-50 dark:bg-gray-800' }"
          >
            <template #trailing>
              <span class="text-gray-500 dark:text-gray-400 text-xs">kcal/day</span>
            </template>
          </UInput>
        </UFormField>

        <div class="md:col-span-2 space-y-4">
          <UFormField
            label="Goal Profile"
            name="goalProfile"
            help="Your primary objective for body composition."
          >
            <USelectMenu
              v-model="localSettings.goalProfile"
              :items="goalProfiles"
              value-key="value"
              class="w-full"
              :ui="{ content: 'w-full min-w-[var(--reka-popper-anchor-width)]' }"
            />
          </UFormField>

          <div
            v-if="localSettings.goalProfile !== 'MAINTAIN'"
            class="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg border border-gray-100 dark:border-gray-800"
          >
            <div class="flex justify-between mb-2">
              <label class="text-sm font-medium text-gray-700 dark:text-gray-200">
                Aggressiveness ({{ localSettings.targetAdjustmentPercent > 0 ? '+' : ''
                }}{{ localSettings.targetAdjustmentPercent }}%)
              </label>
              <span class="text-xs text-gray-500">
                {{ localSettings.goalProfile === 'LOSE' ? 'Deficit' : 'Surplus' }}
              </span>
            </div>
            <URange
              v-model.number="localSettings.targetAdjustmentPercent"
              :min="adjustmentRange.min"
              :max="adjustmentRange.max"
              :step="adjustmentRange.step"
              :color="localSettings.goalProfile === 'LOSE' ? 'orange' : 'success'"
            />
            <p class="text-xs text-gray-500 mt-2">
              {{
                localSettings.goalProfile === 'LOSE'
                  ? 'Higher deficit speeds up weight loss but risks muscle loss.'
                  : 'Higher surplus maximizes muscle gain but risks fat gain.'
              }}
            </p>
          </div>
        </div>

        <UFormField
          label="Target Daily Calories"
          name="targetCalories"
          help="Your starting point for nutrition planning."
        >
          <UInput
            :model-value="targetCalories"
            type="number"
            disabled
            class="w-full"
            :ui="{ base: 'font-bold text-primary-600 dark:text-primary-400' }"
          >
            <template #trailing>
              <span class="text-gray-500 dark:text-gray-400 text-xs">kcal/day</span>
            </template>
          </UInput>
        </UFormField>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">
              Meal Schedule
            </h3>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Define your typical daily meal pattern to help AI slot fueling windows.
            </p>
          </div>
          <UButton
            icon="i-heroicons-plus"
            size="xs"
            color="primary"
            variant="soft"
            label="Add Meal"
            @click="addMeal"
          />
        </div>
      </template>

      <div class="space-y-4">
        <div
          v-for="(meal, index) in localSettings.mealPattern"
          :key="index"
          class="flex items-center gap-4"
        >
          <UInput v-model="meal.name" placeholder="Meal Name (e.g. Breakfast)" class="flex-1" />
          <UInput v-model="meal.time" type="time" class="w-32" />
          <UButton
            icon="i-heroicons-trash"
            color="error"
            variant="ghost"
            size="sm"
            @click="removeMeal(index)"
          />
        </div>
        <p v-if="!localSettings.mealPattern?.length" class="text-sm text-gray-500 italic">
          No meals defined. Add one to get started.
        </p>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">
          Dietary Constraints (Non-Negotiables)
        </h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Define food intolerances and preferences to ensure AI advice is safe and relevant.
        </p>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <UFormField
          label="Dietary Profile"
          name="dietaryProfile"
          help="General dietary patterns (e.g. Vegan, Keto)."
        >
          <USelectMenu
            v-model="localSettings.dietaryProfile"
            :items="dietaryOptions"
            multiple
            value-key="value"
            placeholder="Select patterns..."
            class="w-full"
            size="lg"
          >
            <template #leading>
              <UIcon name="i-heroicons-user-circle" class="w-4 h-4 text-primary-500" />
            </template>
          </USelectMenu>
        </UFormField>

        <UFormField
          label="Food Allergies"
          name="foodAllergies"
          help="Must-avoid foods (triggers immune response)."
        >
          <USelectMenu
            v-model="localSettings.foodAllergies"
            :items="allergyOptions"
            multiple
            value-key="value"
            placeholder="Select allergies..."
            class="w-full"
            size="lg"
          >
            <template #leading>
              <UIcon name="i-heroicons-exclamation-circle" class="w-4 h-4 text-error-500" />
            </template>
          </USelectMenu>
        </UFormField>

        <UFormField
          label="Food Intolerances"
          name="foodIntolerances"
          help="Avoid foods that cause digestive or metabolic distress."
        >
          <USelectMenu
            v-model="localSettings.foodIntolerances"
            :items="intoleranceOptions"
            multiple
            value-key="value"
            placeholder="Select intolerances..."
            class="w-full"
            size="lg"
          >
            <template #leading>
              <UIcon name="i-heroicons-no-symbol" class="w-4 h-4 text-warning-500" />
            </template>
          </USelectMenu>
        </UFormField>

        <UFormField
          label="Lifestyle Exclusions"
          name="lifestyleExclusions"
          help="Strictly avoid specific ingredients or substances for health/performance."
        >
          <USelectMenu
            v-model="localSettings.lifestyleExclusions"
            :items="lifestyleOptions"
            multiple
            value-key="value"
            placeholder="Select exclusions..."
            class="w-full"
            size="lg"
          >
            <template #leading>
              <UIcon name="i-heroicons-shield-exclamation" class="w-4 h-4 text-neutral-500" />
            </template>
          </USelectMenu>
        </UFormField>
      </div>
    </UCard>

    <UCard class="border-primary-200 dark:border-primary-800 border-2">
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h3
              class="text-lg font-medium leading-6 text-gray-900 dark:text-white flex items-center gap-2"
            >
              Fuel State Calibration
              <UBadge size="xs" color="primary" variant="subtle">PRO</UBadge>
            </h3>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Define the intensity triggers and carbohydrate ranges for each physiological state.
            </p>
          </div>
        </div>
      </template>

      <div class="space-y-8">
        <div
          class="bg-primary-50 dark:bg-primary-950/20 p-4 rounded-lg border border-primary-100 dark:border-primary-900/30"
        >
          <div class="flex justify-between items-center mb-2">
            <label class="text-sm font-semibold text-primary-900 dark:text-primary-100">
              Fueling Sensitivity ({{ Math.round(localSettings.fuelingSensitivity * 100) }}%)
            </label>
            <span class="text-xs text-primary-700 dark:text-primary-300 font-medium">
              {{
                localSettings.fuelingSensitivity < 1
                  ? 'Fat Adapted'
                  : localSettings.fuelingSensitivity > 1
                    ? 'Sugar Burner'
                    : 'Standard'
              }}
            </span>
          </div>
          <URange
            v-model="localSettings.fuelingSensitivity"
            :min="0.8"
            :max="1.2"
            :step="0.05"
            color="primary"
          />
          <p class="text-xs text-gray-500 mt-2">
            Scales all carbohydrate targets globally. Decreasing moves toward fat-adaptation;
            increasing moves toward high glycolytic demand.
          </p>
        </div>

        <div class="grid grid-cols-1 gap-6">
          <!-- State 1 -->
          <div
            class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800"
          >
            <div class="flex items-center gap-2 mb-4">
              <div
                class="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-700 dark:text-green-400 font-bold text-sm"
              >
                1
              </div>
              <div>
                <h4 class="text-sm font-bold">Fuel State 1: Eco / Recovery</h4>
                <p class="text-xs text-gray-500">Low glycogen demand (Zone 1-2).</p>
              </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <UFormField label="Trigger (IF <)" name="fuelState1Trigger">
                <UInput
                  v-model.number="localSettings.fuelState1Trigger"
                  type="number"
                  :step="0.05"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Min Carbs (g/kg)" name="fuelState1Min">
                <UInput
                  v-model.number="localSettings.fuelState1Min"
                  type="number"
                  :step="0.1"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Max Carbs (g/kg)" name="fuelState1Max">
                <UInput
                  v-model.number="localSettings.fuelState1Max"
                  type="number"
                  :step="0.1"
                  class="w-full"
                />
              </UFormField>
            </div>
          </div>

          <!-- State 2 -->
          <div
            class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800"
          >
            <div class="flex items-center gap-2 mb-4">
              <div
                class="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-700 dark:text-blue-400 font-bold text-sm"
              >
                2
              </div>
              <div>
                <h4 class="text-sm font-bold">Fuel State 2: Steady / Endurance</h4>
                <p class="text-xs text-gray-500">Moderate demand (Zone 2-3).</p>
              </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <UFormField label="Trigger (IF <)" name="fuelState2Trigger">
                <UInput
                  v-model.number="localSettings.fuelState2Trigger"
                  type="number"
                  :step="0.05"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Min Carbs (g/kg)" name="fuelState2Min">
                <UInput
                  v-model.number="localSettings.fuelState2Min"
                  type="number"
                  :step="0.1"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Max Carbs (g/kg)" name="fuelState2Max">
                <UInput
                  v-model.number="localSettings.fuelState2Max"
                  type="number"
                  :step="0.1"
                  class="w-full"
                />
              </UFormField>
            </div>
          </div>

          <!-- State 3 -->
          <div
            class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800"
          >
            <div class="flex items-center gap-2 mb-4">
              <div
                class="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-700 dark:text-orange-400 font-bold text-sm"
              >
                3
              </div>
              <div>
                <h4 class="text-sm font-bold">Fuel State 3: Performance / Race</h4>
                <p class="text-xs text-gray-500">High demand (Threshold & above).</p>
              </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <UFormField label="Trigger (IF >)" name="fuelState2Trigger_repeat">
                <UInput
                  :model-value="localSettings.fuelState2Trigger"
                  disabled
                  type="number"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Min Carbs (g/kg)" name="fuelState3Min">
                <UInput
                  v-model.number="localSettings.fuelState3Min"
                  type="number"
                  :step="0.1"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Max Carbs (g/kg)" name="fuelState3Max">
                <UInput
                  v-model.number="localSettings.fuelState3Max"
                  type="number"
                  :step="0.1"
                  class="w-full"
                />
              </UFormField>
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <UCard class="border-primary-200 dark:border-primary-800 border-2">
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h3
              class="text-lg font-medium leading-6 text-gray-900 dark:text-white flex items-center gap-2"
            >
              Adaptive Metabolic Engine
              <UBadge size="xs" color="primary" variant="subtle">PRO</UBadge>
            </h3>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Fine-tune gut training limits and carb-to-intensity scaling coefficients.
            </p>
          </div>
        </div>
      </template>

      <div
        class="mb-8 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800"
      >
        <UFormField
          label="Season Block / Training Phase"
          name="trainingPhase"
          help="Apply metabolic presets based on your current training focus."
        >
          <USelectMenu
            v-model="selectedPhase"
            :items="trainingPhases"
            value-key="value"
            class="w-full"
            :ui="{ content: 'w-full min-w-[var(--reka-popper-anchor-width)]' }"
          >
            <template #leading>
              <UIcon
                :name="
                  selectedPhase === 'RACE'
                    ? 'i-heroicons-trophy'
                    : selectedPhase === 'BUILD'
                      ? 'i-heroicons-bolt'
                      : 'i-heroicons-calendar'
                "
                class="w-4 h-4 text-primary-500"
              />
            </template>
          </USelectMenu>
        </UFormField>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <UFormField
          label="Current Max Carb Intake (Gut Limit)"
          name="currentCarbMax"
          help="What your gut can currently handle comfortably during high intensity."
        >
          <UInput
            v-model.number="localSettings.currentCarbMax"
            type="number"
            :min="0"
            :max="150"
            class="w-full"
          >
            <template #trailing>
              <span class="text-gray-500 dark:text-gray-400 text-xs">g/hr</span>
            </template>
          </UInput>
        </UFormField>

        <UFormField
          label="Target Intake Goal"
          name="ultimateCarbGoal"
          help="Your long-term objective for carb adaptation/gut training."
        >
          <UInput
            v-model.number="localSettings.ultimateCarbGoal"
            type="number"
            :min="0"
            :max="150"
            class="w-full"
          >
            <template #trailing>
              <span class="text-gray-500 dark:text-gray-400 text-xs">g/hr</span>
            </template>
          </UInput>
        </UFormField>

        <UFormField
          label="Carb-to-Intensity Slope"
          name="carbScalingFactor"
          help="Global multiplier for how aggressively carbs scale with intensity (1.0 = Standard)."
        >
          <UInput
            v-model.number="localSettings.carbScalingFactor"
            type="number"
            :step="0.05"
            :min="0.5"
            :max="2.0"
            class="w-full"
          >
            <template #trailing>
              <span class="text-gray-500 dark:text-gray-400 text-xs">x</span>
            </template>
          </UInput>
        </UFormField>

        <div class="md:col-span-1 space-y-4">
          <UFormField
            label="Bio-Optimization Stack"
            name="enabledSupplements"
            help="Select the supplements you currently use for personalized timing advice."
          >
            <USelectMenu
              v-model="localSettings.enabledSupplements"
              :items="supplementOptions"
              multiple
              value-key="value"
              placeholder="Select supplements..."
              class="w-full"
              size="lg"
            >
              <template #leading>
                <UIcon name="i-heroicons-beaker" class="w-4 h-4 text-primary-500" />
              </template>
            </USelectMenu>
          </UFormField>
        </div>
      </div>

      <div
        class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 pt-6 border-t border-gray-200 dark:border-gray-800"
      >
        <UFormField
          label="Daily Protein Baseline"
          name="baseProteinPerKg"
          help="Target grams of protein per kg of body weight."
        >
          <UInput
            v-model.number="localSettings.baseProteinPerKg"
            type="number"
            :step="0.1"
            :min="1.0"
            :max="3.0"
            class="w-full"
          >
            <template #trailing>
              <span class="text-gray-500 dark:text-gray-400 text-xs">g/kg</span>
            </template>
          </UInput>
        </UFormField>

        <UFormField
          label="Daily Fat Baseline"
          name="baseFatPerKg"
          help="Target grams of fat per kg of body weight."
        >
          <UInput
            v-model.number="localSettings.baseFatPerKg"
            type="number"
            :step="0.1"
            :min="0.5"
            :max="2.0"
            class="w-full"
          >
            <template #trailing>
              <span class="text-gray-500 dark:text-gray-400 text-xs">g/kg</span>
            </template>
          </UInput>
        </UFormField>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <UFormField
          label="Pre-Workout Window"
          name="preWorkoutWindow"
          help="Minutes before exercise for final fueling."
        >
          <UInput
            v-model.number="localSettings.preWorkoutWindow"
            type="number"
            :step="15"
            :min="30"
            :max="180"
            class="w-full"
          >
            <template #trailing>
              <span class="text-gray-500 dark:text-gray-400 text-xs">min</span>
            </template>
          </UInput>
        </UFormField>

        <UFormField
          label="Post-Workout Recovery Window"
          name="postWorkoutWindow"
          help="Duration of prioritized protein/carb intake after exercise."
        >
          <UInput
            v-model.number="localSettings.postWorkoutWindow"
            type="number"
            :step="15"
            :min="30"
            :max="240"
            class="w-full"
          >
            <template #trailing>
              <span class="text-gray-500 dark:text-gray-400 text-xs">min</span>
            </template>
          </UInput>
        </UFormField>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">
          Hydration Precision
        </h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Optimize your fluid and electrolyte replacement strategy.
        </p>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <UFormField
          label="Sweat Rate"
          name="sweatRate"
          help="Fluid loss per hour during exercise (L/hr)."
        >
          <UInput
            v-model.number="localSettings.sweatRate"
            type="number"
            :step="0.1"
            :min="0"
            :max="5.0"
            class="w-full"
          >
            <template #trailing>
              <span class="text-gray-500 dark:text-gray-400 text-xs">L/hr</span>
            </template>
          </UInput>
        </UFormField>

        <UFormField
          label="Sodium Concentration"
          name="sodiumTarget"
          help="Sodium lost per liter of sweat (mg/L)."
        >
          <UInput
            v-model.number="localSettings.sodiumTarget"
            type="number"
            :step="50"
            :min="0"
            :max="2000"
            class="w-full"
          >
            <template #trailing>
              <span class="text-gray-500 dark:text-gray-400 text-xs">mg/L</span>
            </template>
          </UInput>
        </UFormField>
      </div>
    </UCard>

    <UCard class="border-primary-200 dark:border-primary-800 border-2">
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h3
              class="text-lg font-medium leading-6 text-gray-900 dark:text-white flex items-center gap-2"
            >
              Adaptive Metabolic Engine
              <UBadge size="xs" color="primary" variant="subtle">PRO</UBadge>
            </h3>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Fine-tune coefficients and carbohydrate scaling for specific training blocks.
            </p>
          </div>
        </div>
      </template>

      <div
        class="mb-8 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800"
      >
        <UFormField
          label="Season Block / Training Phase"
          name="trainingPhase"
          help="Apply metabolic presets based on your current training focus."
        >
          <USelectMenu
            v-model="selectedPhase"
            :items="trainingPhases"
            value-key="value"
            class="w-full"
            :ui="{ content: 'w-full min-w-[var(--reka-popper-anchor-width)]' }"
          >
            <template #leading>
              <UIcon
                :name="
                  selectedPhase === 'RACE'
                    ? 'i-heroicons-trophy'
                    : selectedPhase === 'BUILD'
                      ? 'i-heroicons-bolt'
                      : 'i-heroicons-calendar'
                "
                class="w-4 h-4 text-primary-500"
              />
            </template>
          </USelectMenu>
        </UFormField>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <UFormField
          label="Current Max Carb Intake (Gut Limit)"
          name="currentCarbMax"
          help="What your gut can currently handle comfortably during high intensity."
        >
          <UInput
            v-model.number="localSettings.currentCarbMax"
            type="number"
            :min="0"
            :max="150"
            class="w-full"
          >
            <template #trailing>
              <span class="text-gray-500 dark:text-gray-400 text-xs">g/hr</span>
            </template>
          </UInput>
        </UFormField>

        <UFormField
          label="Target Intake Goal"
          name="ultimateCarbGoal"
          help="Your long-term objective for carb adaptation/gut training."
        >
          <UInput
            v-model.number="localSettings.ultimateCarbGoal"
            type="number"
            :min="0"
            :max="150"
            class="w-full"
          >
            <template #trailing>
              <span class="text-gray-500 dark:text-gray-400 text-xs">g/hr</span>
            </template>
          </UInput>
        </UFormField>

        <UFormField
          label="Carb-to-Intensity Slope"
          name="carbScalingFactor"
          help="Global multiplier for how aggressively carbs scale with intensity (1.0 = Standard)."
        >
          <UInput
            v-model.number="localSettings.carbScalingFactor"
            type="number"
            :step="0.05"
            :min="0.5"
            :max="2.0"
            class="w-full"
          >
            <template #trailing>
              <span class="text-gray-500 dark:text-gray-400 text-xs">x</span>
            </template>
          </UInput>
        </UFormField>

        <div class="md:col-span-2 space-y-4">
          <UFormField
            label="Bio-Optimization Stack"
            name="enabledSupplements"
            help="Select the supplements you currently use for personalized timing advice."
          >
            <USelectMenu
              v-model="localSettings.enabledSupplements"
              :items="supplementOptions"
              multiple
              value-key="value"
              placeholder="Select supplements..."
              class="w-full"
              size="lg"
            >
              <template #leading>
                <UIcon name="i-heroicons-beaker" class="w-4 h-4 text-primary-500" />
              </template>
            </USelectMenu>
          </UFormField>
        </div>
      </div>

      <div
        class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 pt-6 border-t border-gray-200 dark:border-gray-800"
      >
        <UFormField
          label="Daily Protein Baseline"
          name="baseProteinPerKg"
          help="Target grams of protein per kg of body weight."
        >
          <UInput
            v-model.number="localSettings.baseProteinPerKg"
            type="number"
            :step="0.1"
            :min="1.0"
            :max="3.0"
            class="w-full"
          >
            <template #trailing>
              <span class="text-gray-500 dark:text-gray-400 text-xs">g/kg</span>
            </template>
          </UInput>
        </UFormField>

        <UFormField
          label="Daily Fat Baseline"
          name="baseFatPerKg"
          help="Target grams of fat per kg of body weight."
        >
          <UInput
            v-model.number="localSettings.baseFatPerKg"
            type="number"
            :step="0.1"
            :min="0.5"
            :max="2.0"
            class="w-full"
          >
            <template #trailing>
              <span class="text-gray-500 dark:text-gray-400 text-xs">g/kg</span>
            </template>
          </UInput>
        </UFormField>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <UFormField
          label="Pre-Workout Window"
          name="preWorkoutWindow"
          help="Minutes before exercise for final fueling."
        >
          <UInput
            v-model.number="localSettings.preWorkoutWindow"
            type="number"
            :step="15"
            :min="30"
            :max="180"
            class="w-full"
          >
            <template #trailing>
              <span class="text-gray-500 dark:text-gray-400 text-xs">min</span>
            </template>
          </UInput>
        </UFormField>

        <UFormField
          label="Post-Workout Recovery Window"
          name="postWorkoutWindow"
          help="Duration of prioritized protein/carb intake after exercise."
        >
          <UInput
            v-model.number="localSettings.postWorkoutWindow"
            type="number"
            :step="15"
            :min="30"
            :max="240"
            class="w-full"
          >
            <template #trailing>
              <span class="text-gray-500 dark:text-gray-400 text-xs">min</span>
            </template>
          </UInput>
        </UFormField>
      </div>
    </UCard>

    <div class="flex justify-end pt-4">
      <UButton
        :loading="loading"
        label="Save Nutrition Settings"
        color="primary"
        @click="saveSettings"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
  const props = defineProps<{
    settings?: any
    profile?: any
  }>()

  const emit = defineEmits(['update:settings', 'navigate'])

  const localSettings = ref({
    bmr: 1600,
    activityLevel: 'MODERATELY_ACTIVE',
    currentCarbMax: 60,
    ultimateCarbGoal: 90,
    sweatRate: 0.8,
    sodiumTarget: 750,
    carbScalingFactor: 1.0,
    fuelingSensitivity: 1.0,
    fuelState1Trigger: 0.6,
    fuelState1Min: 3.0,
    fuelState1Max: 4.5,
    fuelState2Trigger: 0.85,
    fuelState2Min: 5.0,
    fuelState2Max: 7.5,
    fuelState3Min: 8.0,
    fuelState3Max: 12.0,
    enabledSupplements: [],
    baseProteinPerKg: 1.6,
    baseFatPerKg: 1.0,
    preWorkoutWindow: 120,
    postWorkoutWindow: 60,
    goalProfile: 'MAINTAIN',
    targetAdjustmentPercent: 0.0,
    mealPattern: [
      { name: 'Breakfast', time: '07:00' },
      { name: 'Lunch', time: '12:00' },
      { name: 'Dinner', time: '18:00' },
      { name: 'Snack', time: '15:00' }
    ],
    dietaryProfile: [],
    foodAllergies: [],
    foodIntolerances: [],
    lifestyleExclusions: [],
    ...props.settings
  })

  const loading = ref(false)
  const toast = useToast()

  const activityLevels = [
    { label: 'Sedentary', value: 'SEDENTARY' },
    { label: 'Lightly Active', value: 'LIGHTLY_ACTIVE' },
    { label: 'Moderately Active', value: 'MODERATELY_ACTIVE' },
    { label: 'Very Active', value: 'VERY_ACTIVE' },
    { label: 'Extra Active', value: 'EXTRA_ACTIVE' }
  ]

  const goalProfiles = [
    { label: 'Lose Weight (-300 to -500 kcal)', value: 'LOSE' },
    { label: 'Maintain (Energy Balance)', value: 'MAINTAIN' },
    { label: 'Gain Muscle (+200 to +500 kcal)', value: 'GAIN' }
  ]

  const dietaryOptions = [
    { label: 'Vegan', value: 'VEGAN' },
    { label: 'Vegetarian', value: 'VEGETARIAN' },
    { label: 'Gluten-Free', value: 'GLUTEN_FREE' },
    { label: 'Dairy-Free', value: 'DAIRY_FREE' },
    { label: 'Low-FODMAP', value: 'LOW_FODMAP' },
    { label: 'Keto', value: 'KETO' },
    { label: 'Paleo', value: 'PALEO' },
    { label: 'Mediterranean', value: 'MEDITERRANEAN' },
    { label: 'Halal', value: 'HALAL' },
    { label: 'Kosher', value: 'KOSHER' }
  ]

  const lifestyleOptions = [
    { label: 'No Alcohol', value: 'NO_ALCOHOL' },
    { label: 'No Caffeine', value: 'NO_CAFFEINE' },
    { label: 'No Refined Sugar', value: 'NO_REFINED_SUGAR' },
    { label: 'No Seed Oils', value: 'NO_SEED_OILS' },
    { label: 'No Processed Foods', value: 'NO_PROCESSED_FOODS' },
    { label: 'No Artificial Sweeteners', value: 'NO_SWEETENERS' },
    { label: 'No Carbonated Drinks', value: 'NO_SODA' },
    { label: 'No Pork', value: 'NO_PORK' },
    { label: 'No Red Meat', value: 'NO_RED_MEAT' }
  ]

  const allergyOptions = [
    { label: 'Peanuts', value: 'PEANUTS' },
    { label: 'Tree Nuts (Almonds, Walnuts, etc.)', value: 'TREE_NUTS' },
    { label: 'Milk / Dairy', value: 'MILK' },
    { label: 'Eggs', value: 'EGGS' },
    { label: 'Wheat', value: 'WHEAT' },
    { label: 'Soy', value: 'SOY' },
    { label: 'Fish', value: 'FISH' },
    { label: 'Shellfish', value: 'SHELLFISH' },
    { label: 'Sesame', value: 'SESAME' },
    { label: 'Mustard', value: 'MUSTARD' },
    { label: 'Celery', value: 'CELERY' }
  ]

  const intoleranceOptions = [
    { label: 'Lactose', value: 'LACTOSE' },
    { label: 'Fructose', value: 'FRUCTOSE' },
    { label: 'Histamine', value: 'HISTAMINE' },
    { label: 'Nightshades (Tomatoes, Peppers, etc.)', value: 'NIGHTSHADES' },
    { label: 'Sulfites', value: 'SULFITES' },
    { label: 'Yeast', value: 'YEAST' },
    { label: 'Legumes / Beans', value: 'LEGUMES' },
    { label: 'Artificial Sweeteners', value: 'SWEETENERS' }
  ]

  const supplementOptions = [
    {
      label: 'Caffeine',
      value: 'caffeine',
      description: 'Pre-workout stimulant for focus and fatigue reduction'
    },
    {
      label: 'Nitrates / Beetroot',
      value: 'nitrates',
      description: 'Improves blood flow and oxygen delivery'
    },
    {
      label: 'Beta-Alanine',
      value: 'beta_alanine',
      description: 'Buffers muscle acidity during high intensity'
    },
    { label: 'Creatine', value: 'creatine', description: 'Increases power output and recovery' },
    {
      label: 'Sodium Bicarbonate',
      value: 'sodium_bicarbonate',
      description: 'Intracellular buffer for high-intensity efforts'
    },
    {
      label: 'Glycerol',
      value: 'glycerol',
      description: 'Hyperhydration agent for hot conditions'
    },
    {
      label: 'Electrolytes',
      value: 'electrolytes',
      description: 'Crucial for fluid balance and nerve function'
    },
    { label: 'Omega-3', value: 'omega_3', description: 'Supports heart and joint health' },
    {
      label: 'Vitamin D',
      value: 'vitamin_d',
      description: 'Essential for bone health and immune function'
    },
    { label: 'Iron', value: 'iron', description: 'Oxygen transport (crucial for endurance)' },
    { label: 'Magnesium', value: 'magnesium', description: 'Nerve function and muscle relaxation' },
    {
      label: 'Tart Cherry',
      value: 'tart_cherry',
      description: 'Potent antioxidant for muscle recovery'
    },
    { label: 'Collagen', value: 'collagen', description: 'Supports tendon and ligament integrity' },
    {
      label: 'Probiotics',
      value: 'probiotics',
      description: 'Optimizes gut health and nutrient absorption'
    },
    { label: 'CoQ10', value: 'coq10', description: 'Supports mitochondrial energy production' }
  ]

  const trainingPhases = [
    { label: 'Base Phase (Fat Adapted / Recovery)', value: 'BASE' },
    { label: 'Build Phase (High Performance)', value: 'BUILD' },
    { label: 'Taper / Race Week (High Carb Loading)', value: 'RACE' },
    { label: 'Custom', value: 'CUSTOM' }
  ]

  const phasePresets: Record<string, any> = {
    BASE: { baseProteinPerKg: 1.8, baseFatPerKg: 1.2, carbScalingFactor: 0.8 },
    BUILD: { baseProteinPerKg: 1.6, baseFatPerKg: 0.9, carbScalingFactor: 1.1 },
    RACE: { baseProteinPerKg: 1.4, baseFatPerKg: 0.6, carbScalingFactor: 1.4 }
  }

  const selectedPhase = ref('CUSTOM')

  watch(selectedPhase, (newPhase) => {
    if (newPhase && phasePresets[newPhase]) {
      const preset = phasePresets[newPhase]
      localSettings.value.baseProteinPerKg = preset.baseProteinPerKg
      localSettings.value.baseFatPerKg = preset.baseFatPerKg
      localSettings.value.carbScalingFactor = preset.carbScalingFactor
    }
  })

  const palMultipliers: Record<string, number> = {
    SEDENTARY: 1.2,
    LIGHTLY_ACTIVE: 1.375,
    MODERATELY_ACTIVE: 1.55,
    VERY_ACTIVE: 1.725,
    EXTRA_ACTIVE: 1.9
  }

  const isProfileDataMissing = computed(() => {
    const p = props.profile
    return !p?.weight || !p?.height || !p?.dob || !p?.sex
  })

  const tdee = computed(() => {
    const pal = palMultipliers[localSettings.value.activityLevel] || 1.2
    return Math.round(localSettings.value.bmr * pal)
  })

  const targetCalories = computed(() => {
    const adjustment = localSettings.value.targetAdjustmentPercent || 0
    return Math.round(tdee.value * (1 + adjustment / 100))
  })

  const adjustmentRange = computed(() => {
    switch (localSettings.value.goalProfile) {
      case 'LOSE':
        return { min: -30, max: -5, step: 1 }
      case 'GAIN':
        return { min: 5, max: 20, step: 1 }
      default:
        return { min: 0, max: 0, step: 0 } // MAINTAIN
    }
  })

  // Reset adjustment when profile changes
  watch(
    () => localSettings.value.goalProfile,
    (newProfile) => {
      if (newProfile === 'MAINTAIN') {
        localSettings.value.targetAdjustmentPercent = 0
      } else if (newProfile === 'LOSE') {
        localSettings.value.targetAdjustmentPercent = -15
      } else if (newProfile === 'GAIN') {
        localSettings.value.targetAdjustmentPercent = 10
      }
    }
  )

  function addMeal() {
    if (!localSettings.value.mealPattern) {
      localSettings.value.mealPattern = []
    }
    localSettings.value.mealPattern.push({ name: 'New Meal', time: '08:00' })
  }

  function removeMeal(index: number | string) {
    const idx = typeof index === 'string' ? parseInt(index, 10) : index
    if (Array.isArray(localSettings.value.mealPattern)) {
      localSettings.value.mealPattern.splice(idx, 1)
    }
  }

  function calculateBMR() {
    if (isProfileDataMissing.value) {
      toast.add({
        title: 'Missing Profile Data',
        description:
          'Please ensure weight, height, date of birth, and sex are set in Basic Settings.',
        color: 'warning'
      })
      return
    }

    const p = props.profile
    // Convert weight to kg if needed
    const weightKg = p.weightUnits === 'Pounds' ? p.weight * 0.453592 : p.weight

    // Height is already in cm in the profile (as per heightUnits="cm" default)
    const heightCm = p.height

    // Calculate age
    const birthDate = new Date(p.dob)
    const today = new Date()
    let age = today.getFullYear() - birthDate.getFullYear()
    const m = today.getMonth() - birthDate.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--
    }

    // Mifflin-St Jeor
    let bmr = 10 * weightKg + 6.25 * heightCm - 5 * age
    if (p.sex?.toLowerCase() === 'male' || p.sex === 'M') {
      bmr += 5
    } else {
      bmr -= 161
    }

    localSettings.value.bmr = Math.round(bmr)

    toast.add({
      title: 'BMR Calculated',
      description: `Your BMR has been set to ${localSettings.value.bmr} kcal/day based on your profile.`,
      color: 'success'
    })
  }

  watch(
    () => props.settings,
    (newVal) => {
      if (!newVal) return

      // Update local state if it differs from prop (e.g. data loaded from server)
      // We check key by key to avoid resetting everything if only one field changes
      for (const key in newVal) {
        if (Object.prototype.hasOwnProperty.call(newVal, key)) {
          const propVal = JSON.stringify(newVal[key])
          const localVal = JSON.stringify(
            localSettings.value[key as keyof typeof localSettings.value]
          )

          if (propVal !== localVal) {
            localSettings.value[key as keyof typeof localSettings.value] = JSON.parse(propVal)
          }
        }
      }
    },
    { deep: true, immediate: true }
  )

  async function saveSettings() {
    loading.value = true
    try {
      await $fetch('/api/profile/nutrition', {
        method: 'POST',
        body: localSettings.value
      })

      toast.add({
        title: 'Nutrition Settings Saved',
        description: 'Your metabolic profile has been updated.',
        color: 'success'
      })

      emit('update:settings', localSettings.value)
    } catch (err: any) {
      toast.add({
        title: 'Save Failed',
        description: err.data?.message || err.message,
        color: 'error'
      })
    } finally {
      loading.value = false
    }
  }
</script>
