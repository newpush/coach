<template>
  <UCard>
    <div class="flex items-start justify-between">
      <div class="flex items-start gap-3">
        <div class="p-2 rounded-lg ring-1 ring-inset" :class="typeColorClasses">
          <UIcon :name="typeIcon" class="w-5 h-5" />
        </div>
        <div>
          <h3 class="font-semibold text-sm text-gray-900 dark:text-white">{{ goal.title }}</h3>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{{ typeLabel }}</p>
          
          <div class="mt-3 flex flex-wrap gap-2">
            <UBadge v-if="goal.priority" :color="priorityColor" variant="subtle" size="xs">
              {{ goal.priority }} Priority
            </UBadge>
            <UBadge v-if="goal.targetDate" color="neutral" variant="subtle" size="xs">
              Due {{ formatDate(goal.targetDate) }}
            </UBadge>
            <UBadge v-if="goal.eventDate" color="neutral" variant="subtle" size="xs">
              Event: {{ formatDate(goal.eventDate) }}
            </UBadge>
          </div>
        </div>
      </div>
      
      <UDropdownMenu :items="actions">
        <UButton color="neutral" variant="ghost" icon="i-heroicons-ellipsis-vertical" size="xs" />
      </UDropdownMenu>
    </div>
    
    <div class="mt-6">
      <div v-if="goal.metric === 'weight_kg'" class="space-y-2">
        <div class="flex justify-between text-xs font-medium">
          <span class="text-gray-700 dark:text-gray-300">{{ goal.currentValue }}kg</span>
          <span class="text-gray-500">Target: {{ goal.targetValue }}kg</span>
        </div>
        <UProgress :model-value="calculateProgress(goal.startValue, goal.currentValue, goal.targetValue)" size="sm" color="primary" />
      </div>
      
      <div v-else-if="goal.type === 'EVENT'" class="text-xs font-medium">
        <p v-if="daysUntil(goal.eventDate) > 0" class="text-gray-600 dark:text-gray-400">
          {{ daysUntil(goal.eventDate) }} days until event
        </p>
        <p v-else class="text-green-600 dark:text-green-400 flex items-center gap-1">
          <UIcon name="i-heroicons-check-circle" class="w-4 h-4" />
          Event Completed!
        </p>
      </div>
      
      <div v-else class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
        {{ goal.description }}
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
const props = defineProps<{
  goal: any
}>()

const emit = defineEmits(['delete', 'edit'])

const typeIcon = computed(() => {
  switch (props.goal.type) {
    case 'BODY_COMPOSITION': return 'i-heroicons-scale'
    case 'EVENT': return 'i-heroicons-calendar'
    case 'PERFORMANCE': return 'i-heroicons-bolt'
    case 'CONSISTENCY': return 'i-heroicons-arrow-path'
    default: return 'i-heroicons-trophy'
  }
})

const typeColorClasses = computed(() => {
  switch (props.goal.type) {
    case 'BODY_COMPOSITION': return 'bg-blue-50 text-blue-600 ring-blue-500/10 dark:bg-blue-900/20 dark:text-blue-400 dark:ring-blue-400/20'
    case 'EVENT': return 'bg-purple-50 text-purple-600 ring-purple-500/10 dark:bg-purple-900/20 dark:text-purple-400 dark:ring-purple-400/20'
    case 'PERFORMANCE': return 'bg-amber-50 text-amber-600 ring-amber-500/10 dark:bg-amber-900/20 dark:text-amber-400 dark:ring-amber-400/20'
    case 'CONSISTENCY': return 'bg-green-50 text-green-600 ring-green-500/10 dark:bg-green-900/20 dark:text-green-400 dark:ring-green-400/20'
    default: return 'bg-gray-50 text-gray-600 ring-gray-500/10 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700'
  }
})

const typeLabel = computed(() => {
  switch (props.goal.type) {
    case 'BODY_COMPOSITION': return 'Body Composition'
    case 'EVENT': return 'Event Preparation'
    case 'PERFORMANCE': return 'Performance'
    case 'CONSISTENCY': return 'Consistency'
    default: return 'Goal'
  }
})

const priorityColor = computed(() => {
  switch (props.goal.priority) {
    case 'HIGH': return 'error'
    case 'MEDIUM': return 'warning'
    case 'LOW': return 'success'
    default: return 'neutral'
  }
})

const actions = [[{
  label: 'Edit Goal',
  icon: 'i-heroicons-pencil',
  onSelect: () => emit('edit', props.goal)
}, {
  label: 'Delete Goal',
  icon: 'i-heroicons-trash',
  onSelect: () => emit('delete', props.goal.id)
}]]

function formatDate(dateString: string) {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysUntil(dateString: string) {
  if (!dateString) return 0
  const today = new Date()
  const target = new Date(dateString)
  const diffTime = target.getTime() - today.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

function calculateProgress(start: number, current: number, target: number) {
  if (!start || !target || !current) return 0
  const totalChange = Math.abs(target - start)
  const currentChange = Math.abs(current - start)
  if (totalChange === 0) return 100
  return Math.min(Math.round((currentChange / totalChange) * 100), 100)
}
</script>