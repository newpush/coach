<template>
  <div class="space-y-3">
    <div class="grid grid-cols-7 gap-2">
      <NuxtLink
        v-for="day in days"
        :key="day.date"
        :to="`/nutrition/${day.date}`"
        class="flex flex-col items-center p-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 transition-all hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
        :class="[isToday(day.date) ? 'ring-2 ring-primary-500' : '']"
        @mouseenter="$emit('hover-day', day.date)"
        @mouseleave="$emit('hover-day', null)"
      >
        <span class="text-xs font-medium text-gray-500 uppercase">{{ formatDay(day.date) }}</span>
        <span class="text-sm font-bold my-1 text-gray-900 dark:text-white">{{
          formatDate(day.date)
        }}</span>

        <div class="relative group">
          <UTooltip :text="day.label">
            <UIcon
              :name="getStateIcon(day.state)"
              class="size-8 my-1"
              :class="getStateColor(day.state)"
            />
          </UTooltip>
          <div v-if="day.isRest" class="absolute -bottom-1 -right-1">
            <UIcon name="i-lucide-coffee" class="size-4 text-orange-500" />
          </div>
        </div>

        <span class="text-xs font-medium mt-1 text-gray-600 dark:text-gray-400"
          >{{ day.carbsTarget }}g</span
        >
      </NuxtLink>
    </div>

    <div
      class="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900/60 px-3 py-2"
    >
      <button
        v-for="item in legendItems"
        :key="item.key"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-full border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs text-gray-600 dark:text-gray-300 hover:border-primary-300 hover:text-primary-600 dark:hover:text-primary-300 transition-colors"
        @click="
          () => {
            void openLegendModal(item.key)
          }
        "
      >
        <UIcon :name="item.icon" class="size-3.5" :class="item.iconColor" />
        <span>{{ item.label }}</span>
      </button>
    </div>
  </div>

  <UModal
    v-model:open="isLegendModalOpen"
    :ui="{
      content: 'sm:max-w-md z-[9999]',
      overlay: 'z-[9998]'
    }"
    title="Fueling State Analysis"
    description="Explanation of the different fueling states and how to strategically fuel for your training demand."
  >
    <template #content>
      <div v-if="selectedLegend" class="p-6 space-y-5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UIcon :name="selectedLegend.icon" class="size-6" :class="selectedLegend.iconColor" />
            <h3 class="text-lg font-black uppercase tracking-tight text-gray-900 dark:text-white">
              {{ selectedLegend.label }} Analysis
            </h3>
          </div>
        </div>

        <div
          class="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800"
        >
          <p class="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">
            What it means
          </p>
          <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {{ selectedLegend.meaning }}
          </p>
        </div>

        <div
          class="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800"
        >
          <p class="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">How to fuel</p>
          <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {{ selectedLegend.guidance }}
          </p>
        </div>

        <div
          class="bg-primary-50 dark:bg-primary-950/20 p-4 rounded-xl border border-primary-100 dark:border-primary-900"
        >
          <p
            class="text-xs font-bold uppercase tracking-widest text-primary-700 dark:text-primary-300"
          >
            Coach note
          </p>
          <p class="text-sm text-primary-700 dark:text-primary-300 mt-1 leading-relaxed italic">
            {{ selectedLegend.note }}
          </p>
        </div>

        <UButton
          color="neutral"
          variant="soft"
          block
          class="font-bold uppercase tracking-tight text-xs"
          @click="
            () => {
              isLegendModalOpen = false
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
  import { format, parseISO, isToday as isTodayFns } from 'date-fns'
  import { computed, ref } from 'vue'

  const props = defineProps<{
    days: Array<{
      date: string
      state: number
      label: string
      carbsTarget: number
      isRest: boolean
    }>
  }>()

  defineEmits(['hover-day'])

  type LegendKey = 'eco' | 'steady' | 'performance' | 'rest'

  type LegendInfo = {
    key: LegendKey
    label: string
    icon: string
    iconColor: string
    meaning: string
    guidance: string
    note: string
  }

  const legendItems: LegendInfo[] = [
    {
      key: 'eco',
      label: 'Eco',
      icon: 'i-lucide-leaf',
      iconColor: 'text-success-500',
      meaning:
        'Lower-demand training day with conservative carb targets to reinforce metabolic efficiency.',
      guidance:
        'Keep carbs closer to baseline, prioritize quality protein, and spread meals evenly.',
      note: 'Eco days are not under-fueling days. They are controlled intake days with enough energy for recovery.'
    },
    {
      key: 'steady',
      label: 'Steady',
      icon: 'i-lucide-trending-up',
      iconColor: 'text-info-500',
      meaning:
        'Moderate training demand day where carb intake should support session quality and next-day readiness.',
      guidance:
        'Use normal pre/post workout carb timing and maintain your regular hydration rhythm.',
      note: 'Steady is your consistency zone. Hitting these days well keeps the full week stable.'
    },
    {
      key: 'performance',
      label: 'Performance',
      icon: 'i-lucide-zap',
      iconColor: 'text-primary-500',
      meaning:
        'High-output day with aggressive fueling targets to protect quality and prevent late-session drop-off.',
      guidance:
        'Front-load carbs before key work, fuel during longer sessions, and recover quickly after.',
      note: 'Performance days are where strategic carbs matter most for adaptation and execution.'
    },
    {
      key: 'rest',
      label: 'Rest day',
      icon: 'i-lucide-coffee',
      iconColor: 'text-orange-500',
      meaning:
        'No workout-specific fueling windows were planned, so only base daily fueling targets apply.',
      guidance:
        'Focus on recovery habits, hydration, protein distribution, and micronutrient quality.',
      note: 'The coffee icon indicates recovery focus, not a caffeine prescription.'
    }
  ]

  const isLegendModalOpen = ref(false)
  const selectedLegendKey = ref<LegendKey>('eco')

  const selectedLegend = computed(() =>
    legendItems.find((item) => item.key === selectedLegendKey.value)
  )

  function openLegendModal(key: LegendKey) {
    selectedLegendKey.value = key
    isLegendModalOpen.value = true
  }

  function formatDay(dateStr: string) {
    return format(parseISO(dateStr), 'EEE')
  }

  function formatDate(dateStr: string) {
    return format(parseISO(dateStr), 'MMM d')
  }

  function isToday(dateStr: string) {
    return isTodayFns(parseISO(dateStr))
  }

  function getStateIcon(state: number) {
    if (state === 3) return 'i-lucide-zap'
    if (state === 2) return 'i-lucide-trending-up'
    return 'i-lucide-leaf'
  }

  function getStateColor(state: number) {
    if (state === 3) return 'text-primary-500'
    if (state === 2) return 'text-info-500'
    return 'text-success-500'
  }
</script>
