<template>
  <UCard
    :class="[
      canClick ? 'hover:shadow-md hover:ring-1 hover:ring-gray-300 dark:hover:ring-gray-600 cursor-pointer transition-all duration-200' : ''
    ]"
    :ui="{ body: compact ? 'p-4' : 'p-6' }"
    @click="handleClick"
  >
    <div class="flex items-center justify-between">
      <div class="flex-1">
        <div class="flex items-center gap-2 mb-2">
          <UIcon
            v-if="icon"
            :name="icon"
            :class="[
              'w-5 h-5',
              iconColorClass
            ]"
          />
          <h3 class="text-sm font-medium text-gray-600 dark:text-gray-400">
            {{ title }}
          </h3>
        </div>
        
        <div class="flex items-baseline gap-2">
          <div :class="['font-bold font-sans', compact ? 'text-2xl' : 'text-3xl', scoreColorClass]">
            {{ displayScore }}
          </div>
          <div class="text-sm text-gray-500 dark:text-gray-400">/ 10</div>
        </div>
        
        <div class="mt-3">
          <UProgress
            :model-value="score ? score * 10 : 0"
            size="sm"
            :color="progressColor"
          />
        </div>
        
        <p v-if="!compact" class="mt-2 text-xs font-medium text-gray-500 dark:text-gray-400">
          {{ scoreLabel }}
        </p>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
const props = defineProps<{
  title: string
  score?: number | null
  explanation?: string | null
  icon?: string
  color?: 'gray' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'cyan'
  compact?: boolean
}>()

const emit = defineEmits<{
  click: [data: {
    title: string
    score?: number | null
    explanation?: string | null
    color?: 'gray' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'cyan'
  }]
}>()

// Determine if the card is clickable
const canClick = computed(() => {
  return props.score !== null &&
         props.score !== undefined &&
         props.explanation
})

const handleClick = () => {
  // Only emit if there's a score AND an explanation
  if (props.score !== null && props.score !== undefined && props.explanation) {
    emit('click', {
      title: props.title,
      score: props.score,
      explanation: props.explanation,
      color: props.color
    })
  }
}

const displayScore = computed(() => {
  if (props.score === null || props.score === undefined) return '--'
  return props.score.toFixed(1)
})

const scoreColorClass = computed(() => {
  if (!props.score) return 'text-gray-400'
  if (props.score >= 9) return 'text-green-600 dark:text-green-400'
  if (props.score >= 7) return 'text-blue-600 dark:text-blue-400'
  if (props.score >= 5) return 'text-yellow-600 dark:text-yellow-400'
  if (props.score >= 3) return 'text-orange-600 dark:text-orange-400'
  return 'text-red-600 dark:text-red-400'
})

const progressColor = computed(() => {
  if (!props.score) return 'neutral' as const
  if (props.score >= 9) return 'success' as const
  if (props.score >= 7) return 'primary' as const
  if (props.score >= 5) return 'warning' as const
  if (props.score >= 3) return 'warning' as const
  return 'error' as const
})

const iconColorClass = computed(() => {
  // Map prop colors to semantic tailwind text colors
  // Could be improved by using standard semantic names (success/warning/etc)
  const map: Record<string, string> = {
    gray: 'text-gray-500',
    red: 'text-red-500',
    orange: 'text-orange-500',
    yellow: 'text-yellow-500',
    green: 'text-green-500',
    blue: 'text-blue-500',
    purple: 'text-purple-500',
    cyan: 'text-cyan-500'
  }
  return map[props.color || 'gray'] || 'text-gray-500'
})

const scoreLabel = computed(() => {
  if (!props.score) return 'No data'
  if (props.score >= 9) return 'Exceptional'
  if (props.score >= 7) return 'Strong'
  if (props.score >= 5) return 'Adequate'
  if (props.score >= 3) return 'Needs Work'
  return 'Poor'
})
</script>