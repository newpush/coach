<template>
  <UCard :ui="{ body: { padding: 'p-4 sm:p-4' } }">
    <div class="flex items-start justify-between">
      <div class="flex items-start gap-3">
        <div class="p-2 rounded-lg" :class="typeColor">
          <UIcon :name="typeIcon" class="w-5 h-5" />
        </div>
        <div>
          <h3 class="font-semibold text-sm">{{ goal.title }}</h3>
          <p class="text-xs text-muted mt-0.5">{{ typeLabel }}</p>
          
          <div class="mt-3 flex flex-wrap gap-2 text-xs">
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
      
      <UDropdown :items="actions" position="bottom-end">
        <UButton color="neutral" variant="ghost" icon="i-heroicons-ellipsis-vertical" size="xs" />
      </UDropdown>
    </div>
    
    <div class="mt-4">
      <div v-if="goal.metric === 'weight_kg'" class="space-y-1">
        <div class="flex justify-between text-xs">
          <span>{{ goal.currentValue }}kg</span>
          <span>Target: {{ goal.targetValue }}kg</span>
        </div>
        <UProgress :model-value="calculateProgress(goal.startValue, goal.currentValue, goal.targetValue)" size="sm" color="primary" />
      </div>
      
      <div v-else-if="goal.type === 'EVENT'" class="text-xs text-muted">
        <p v-if="daysUntil(goal.eventDate) > 0">
          {{ daysUntil(goal.eventDate) }} days until event
        </p>
        <p v-else class="text-success">Event Completed!</p>
      </div>
      
      <div v-else class="text-sm">
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

const typeColor = computed(() => {
  switch (props.goal.type) {
    case 'BODY_COMPOSITION': return 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
    case 'EVENT': return 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
    case 'PERFORMANCE': return 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
    case 'CONSISTENCY': return 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
    default: return 'bg-gray-100 text-gray-600'
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

const actions = [
  [{
    label: 'Edit Goal',
    icon: 'i-heroicons-pencil',
    click: () => emit('edit', props.goal)
  }, {
    label: 'Delete Goal',
    icon: 'i-heroicons-trash',
    click: () => emit('delete', props.goal.id)
  }]
]

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
  return Math.min(Math.round((currentChange / totalChange) * 100), 100)
}
</script>