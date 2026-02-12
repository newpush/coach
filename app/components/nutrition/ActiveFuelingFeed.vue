<template>
  <div class="space-y-6">
    <!-- Next Fueling Task (The "Next Steps") -->
    <UCard color="primary" variant="subtle">
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-zap" class="size-5 text-primary-500" />
            <h3 class="text-base font-semibold leading-6">Upcoming Target</h3>
          </div>
          <UBadge v-if="loading" color="neutral" variant="subtle" size="xs"> Loading... </UBadge>
        </div>
      </template>

      <div v-if="loading" class="space-y-3">
        <USkeleton class="h-12 w-full" />
        <USkeleton class="h-10 w-full" />
      </div>

      <div v-else-if="feed?.nextWindow" class="space-y-4">
        <div
          class="p-3 bg-white dark:bg-gray-900 rounded-lg border border-primary-100 dark:border-primary-900/50"
        >
          <div class="flex justify-between items-start mb-2">
            <div>
              <span class="text-xs font-bold uppercase text-gray-500">{{
                formatWindowType(feed.nextWindow.type)
              }}</span>
              <h4 class="text-sm font-bold">
                {{ feed.nextWindow.workoutTitle || 'Daily Baseline' }}
              </h4>
            </div>
            <div class="text-right">
              <span class="text-lg font-black text-primary-600 dark:text-primary-400"
                >{{ feed.nextWindow.targetCarbs }}g</span
              >
              <p class="text-[10px] text-gray-500">Carb Target</p>
            </div>
          </div>

          <div class="flex items-center gap-2 text-xs text-gray-500">
            <UIcon name="i-lucide-clock" class="size-3" />
            <span>{{ formatTimeRange(feed.nextWindow.startTime, feed.nextWindow.endTime) }}</span>
          </div>
        </div>

        <div
          v-if="displayRecommendation"
          class="p-3 bg-primary-50 dark:bg-primary-900/10 rounded-lg border border-dashed border-primary-200 dark:border-primary-800"
        >
          <div class="flex items-center gap-2 mb-2">
            <UIcon name="i-lucide-sparkles" class="size-4 text-primary-500" />
            <span class="text-xs font-bold text-primary-700 dark:text-primary-300"
              >AI Suggestion</span
            >
          </div>

          <div v-if="feed.mealRecommendation" class="space-y-2">
            <p class="text-sm font-bold text-gray-900 dark:text-white">
              {{ feed.mealRecommendation.item }}
            </p>
            <div class="flex items-center gap-2">
              <UBadge color="primary" variant="subtle" size="xs">
                {{ feed.mealRecommendation.carbs }}g Carbs
              </UBadge>
              <UBadge color="neutral" variant="subtle" size="xs">
                {{ feed.mealRecommendation.absorptionType }}
              </UBadge>
            </div>
            <p class="text-[10px] text-gray-500 font-medium uppercase tracking-tight">
              Timing: {{ feed.mealRecommendation.timing }}
            </p>
            <p
              v-if="feed.mealRecommendation.reasoning"
              class="text-xs text-gray-500 italic leading-relaxed mt-1"
            >
              {{ feed.mealRecommendation.reasoning }}
            </p>
          </div>

          <p v-else class="text-sm font-medium mb-3">
            Eat <span class="text-primary-600 font-bold">{{ feed.suggestedIntake.carbs }}g</span> of
            <span class="lowercase">{{ feed.suggestedIntake.absorptionType }}</span> carbs
            <span class="text-primary-600">{{ feed.suggestedIntake.timing }}</span
            >.
          </p>

          <UButton
            size="xs"
            block
            class="mt-3"
            color="primary"
            variant="outline"
            icon="i-lucide-utensils"
            @click="$emit('open-ai-helper', displayRecommendation)"
          >
            Get Meal Ideas
          </UButton>
        </div>
      </div>

      <div v-else class="text-center py-6 text-gray-500">
        <UIcon name="i-lucide-check-circle" class="size-8 mb-2 opacity-20" />
        <p class="text-sm">All windows complete for today!</p>
      </div>
    </UCard>

    <!-- Recent Activity (The "History") -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-history" class="size-5 text-gray-500" />
          <h3 class="text-base font-semibold leading-6 text-gray-900 dark:text-white">
            Recent Fueling
          </h3>
        </div>
      </template>

      <div v-if="loading" class="space-y-4">
        <div v-for="i in 3" :key="i" class="flex gap-3">
          <USkeleton class="size-10 rounded-full" />
          <div class="flex-1 space-y-2">
            <USkeleton class="h-4 w-1/2" />
            <USkeleton class="h-3 w-1/3" />
          </div>
        </div>
      </div>

      <div v-else-if="feed?.recentItems?.length" class="space-y-4">
        <div v-for="item in feed.recentItems" :key="item.id" class="flex items-center gap-3 group">
          <div class="relative">
            <!-- Progress Ring for Absorption -->
            <svg class="size-10 -rotate-90">
              <circle
                cx="20"
                cy="20"
                r="18"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
                class="text-gray-100 dark:text-gray-800"
              />
              <circle
                cx="20"
                cy="20"
                r="18"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
                stroke-dasharray="113"
                :stroke-dashoffset="113 - (113 * item.absorptionProgress) / 100"
                class="text-success-500 transition-all duration-1000"
              />
            </svg>
            <div class="absolute inset-0 flex items-center justify-center">
              <UIcon :name="getMealIcon(item.mealType)" class="size-4 text-gray-400" />
            </div>
          </div>

          <div class="flex-1 min-w-0">
            <div class="flex justify-between items-start">
              <h4 class="text-sm font-medium truncate pr-2">{{ item.name }}</h4>
              <span class="text-xs font-bold text-gray-900 dark:text-white">{{ item.carbs }}g</span>
            </div>
            <div class="flex justify-between items-center mt-0.5">
              <span class="text-[10px] text-gray-500">{{ formatRelativeTime(item.loggedAt) }}</span>
              <span
                class="text-[10px] font-medium"
                :class="item.absorptionProgress === 100 ? 'text-success-500' : 'text-primary-500'"
              >
                {{
                  item.absorptionProgress === 100
                    ? 'Absorbed'
                    : `${item.absorptionProgress}% Absorbed`
                }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="text-center py-6 text-gray-500">
        <p class="text-xs italic">No items logged in the last 24h</p>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
  import { format, formatDistanceToNow, parseISO } from 'date-fns'

  const props = defineProps<{
    feed: any
    loading: boolean
  }>()

  defineEmits(['open-ai-helper'])

  const displayRecommendation = computed(() => {
    if (props.feed?.mealRecommendation) {
      return {
        carbs: props.feed.mealRecommendation.carbs,
        absorptionType: props.feed.mealRecommendation.absorptionType,
        timing: props.feed.mealRecommendation.timing,
        item: props.feed.mealRecommendation.item,
        basedOnWindowType: props.feed.mealRecommendation.windowType || 'fueling window'
      }
    }
    return props.feed?.suggestedIntake
  })

  function formatWindowType(type: string) {
    return type.replace('_', ' ')
  }

  function formatTimeRange(start: string, end: string) {
    return `${format(new Date(start), 'HH:mm')} - ${format(new Date(end), 'HH:mm')}`
  }

  function formatRelativeTime(date: string | Date) {
    const d = typeof date === 'string' ? new Date(date) : date
    return formatDistanceToNow(d, { addSuffix: true })
  }

  function getMealIcon(type: string) {
    switch (type) {
      case 'breakfast':
        return 'i-lucide-coffee'
      case 'lunch':
        return 'i-lucide-sun'
      case 'dinner':
        return 'i-lucide-moon'
      default:
        return 'i-lucide-apple'
    }
  }
</script>
