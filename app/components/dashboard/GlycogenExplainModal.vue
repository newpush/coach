<template>
  <UModal v-model:open="isOpen" :ui="{ content: 'sm:max-w-md' }">
    <template #content>
      <div class="p-6 space-y-6">
        <!-- Header -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div
              class="w-3 h-3 rounded-full"
              :class="{
                'bg-green-500': state === 1,
                'bg-orange-500': state === 2,
                'bg-red-500': state === 3
              }"
            />
            <h3 class="text-lg font-black uppercase tracking-tight text-gray-900 dark:text-white">
              Fuel Tank Analysis
            </h3>
          </div>
          <div class="text-2xl font-black" :class="tankColorClass">{{ percentage }}%</div>
        </div>

        <div
          class="bg-primary-50 dark:bg-primary-950/20 p-4 rounded-xl border border-primary-100 dark:border-primary-900"
        >
          <p
            class="text-sm font-bold text-primary-700 dark:text-primary-300 flex items-center gap-2"
          >
            <UIcon name="i-heroicons-light-bulb" class="w-4 h-4" />
            Coach Tip
          </p>
          <p class="text-xs text-primary-600 dark:text-primary-400 mt-1 leading-relaxed">
            {{ actionableTip }}
          </p>
        </div>

        <!-- Breakdown Sections -->
        <div class="space-y-4">
          <!-- Baseline -->
          <div
            class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800"
          >
            <div class="flex items-center gap-2 text-sm font-medium">
              <UIcon name="i-heroicons-moon" class="w-4 h-4 text-indigo-500" />
              <div class="flex flex-col">
                <span>Midnight Restoration</span>
                <span class="text-[9px] text-gray-400 font-bold uppercase tracking-tighter"
                  >Source: Circadian Baseline</span
                >
              </div>
            </div>
            <div class="text-sm font-bold text-gray-900 dark:text-white">
              +{{ breakdown.midnightBaseline }}%
            </div>
          </div>

          <!-- BMR Drain -->
          <div
            v-if="breakdown.restingMetabolism"
            class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800"
          >
            <div class="flex items-center gap-2 text-sm font-medium">
              <UIcon name="i-heroicons-clock" class="w-4 h-4 text-gray-400" />
              <div class="flex flex-col">
                <span>Resting Metabolism</span>
                <span class="text-[9px] text-gray-400 font-bold uppercase tracking-tighter"
                  >Source: Basal Metabolic Rate</span
                >
              </div>
            </div>
            <div class="text-sm font-bold text-red-400">-{{ breakdown.restingMetabolism }}%</div>
          </div>

          <!-- Replenishment -->
          <div class="space-y-2 py-2 border-b border-gray-100 dark:border-gray-800">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 text-sm font-medium">
                <UIcon name="i-tabler-bread" class="w-4 h-4 text-yellow-500" />
                <div class="flex flex-col">
                  <span>Nutrition Replenishment</span>
                  <span class="text-[9px] text-gray-400 font-bold uppercase tracking-tighter"
                    >Source: Nutrition Journal</span
                  >
                </div>
              </div>
              <div class="text-sm font-bold text-green-500">
                +{{ breakdown.replenishment.value }}%
              </div>
            </div>
            <div
              class="flex items-center justify-between text-[10px] text-gray-500 font-bold uppercase tracking-wider pl-6"
            >
              <span
                >Carbs: {{ Math.round(breakdown.replenishment.actualCarbs) }}g /
                {{ Math.round(breakdown.replenishment.targetCarbs) }}g</span
              >
              <span>{{ replenishmentPct }}% of Goal</span>
            </div>
          </div>

          <!-- Depletion -->
          <div class="space-y-2 py-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 text-sm font-medium">
                <UIcon name="i-tabler-bolt" class="w-4 h-4 text-orange-500" />
                <div class="flex flex-col">
                  <span>Training Depletion</span>
                  <span class="text-[9px] text-gray-400 font-bold uppercase tracking-tighter"
                    >Source: Training History</span
                  >
                </div>
              </div>
              <div class="text-sm font-bold text-red-500">-{{ totalDepletion }}%</div>
            </div>

            <div
              v-if="breakdown.depletion.length === 0"
              class="pl-6 text-[10px] text-gray-400 italic"
            >
              No training sessions recorded today.
            </div>
            <div v-else class="space-y-2 pl-6">
              <div
                v-for="(event, i) in breakdown.depletion"
                :key="i"
                class="flex items-center justify-between text-[10px] font-medium"
              >
                <div class="flex flex-col">
                  <span class="text-gray-700 dark:text-gray-300 font-bold truncate max-w-[180px]">{{
                    event.title
                  }}</span>
                  <span class="text-gray-400 uppercase tracking-tighter"
                    >{{ event.durationMin }}m @ {{ Math.round(event.intensity * 100) }}%
                    Intensity</span
                  >
                </div>
                <div class="text-red-400 font-black">-{{ event.value }}%</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Logic Footer -->
        <div
          class="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl border border-gray-100 dark:border-gray-800"
        >
          <h4
            class="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1 flex items-center gap-1"
          >
            <UIcon name="i-heroicons-information-circle" class="w-3 h-3" />
            Calculation Logic
          </h4>
          <p class="text-[10px] leading-relaxed text-gray-500 italic">
            Muscle glycogen is your body's primary high-intensity fuel. We assume an 80% baseline
            after sleep. Logged carbohydrates can fill the tank to 100%. Workouts drain the tank
            based on intensity (IF) and duration. Staying above 35% prevents "bonking" or metabolic
            crashes.
          </p>
        </div>

        <UButton
          color="neutral"
          variant="soft"
          block
          class="font-bold uppercase tracking-tight text-xs"
          @click="isOpen = false"
        >
          Got it
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
  import type { GlycogenBreakdown } from '~/types/nutrition'

  const props = defineProps<{
    modelValue: boolean
    percentage: number
    state: number
    advice: string
    breakdown: GlycogenBreakdown
  }>()

  const emit = defineEmits<{
    'update:modelValue': [value: boolean]
  }>()

  const isOpen = computed({
    get: () => props.modelValue,
    set: (val) => emit('update:modelValue', val)
  })

  const replenishmentPct = computed(() => {
    if (props.breakdown.replenishment.targetCarbs <= 0) return 0
    return Math.round(
      (props.breakdown.replenishment.actualCarbs / props.breakdown.replenishment.targetCarbs) * 100
    )
  })

  const totalDepletion = computed(() => {
    return props.breakdown.depletion.reduce((sum, e) => sum + e.value, 0)
  })

  const tankColorClass = computed(() => {
    if (props.percentage > 70) return 'text-green-500'
    if (props.percentage > 30) return 'text-orange-500'
    return 'text-red-500'
  })

  const actionableTip = computed(() => {
    if (props.percentage < 35) {
      return `Your glycogen stores are critical. Consume ${Math.max(40, Math.round(props.breakdown.replenishment.targetCarbs * 0.2))}g of fast-acting carbohydrates (e.g., fruit, energy bar, oats) immediately to stabilize energy levels.`
    }
    if (props.percentage < 70) {
      if (props.breakdown.depletion.length > 0) {
        return "You've drained some fuel during your session. Focus on your post-workout window to top off your tank for tomorrow."
      }
      return "You're at a good maintenance level, but consider adding a carbohydrate-rich snack if you have a hard session planned for later."
    }
    return 'Your fuel levels are optimal. You are fully prepared for high-intensity efforts. Maintain your base fueling plan.'
  })
</script>
