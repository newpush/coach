<template>
  <div class="space-y-6">
    <!-- Step 1: Select Type -->
    <div v-if="step === 1" class="space-y-4">
      <h3 class="text-lg font-semibold">What is your main goal?</h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button 
          v-for="type in goalTypes" 
          :key="type.id"
          @click="selectType(type.id)"
          class="p-4 rounded-lg border-2 text-left transition-all hover:border-primary hover:bg-primary/5 dark:hover:bg-primary/10"
          :class="selectedType === type.id ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-gray-200 dark:border-gray-800'"
        >
          <div class="p-2 rounded-lg w-fit mb-3" :class="type.color">
            <UIcon :name="type.icon" class="w-6 h-6" />
          </div>
          <div class="font-semibold">{{ type.label }}</div>
          <div class="text-sm text-muted mt-1">{{ type.description }}</div>
        </button>
      </div>
    </div>

    <!-- Step 2: Configure -->
    <div v-else-if="step === 2" class="space-y-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UButton icon="i-heroicons-arrow-left" variant="ghost" size="sm" @click="step = 1" />
          <h3 class="text-lg font-semibold">Configure {{ selectedTypeLabel }} Goal</h3>
        </div>
        <UButton 
          v-if="aiSuggestionAvailable" 
          icon="i-heroicons-sparkles" 
          size="xs" 
          color="primary" 
          variant="soft"
          @click="generateAiSuggestion"
          :loading="generatingSuggestion"
        >
          AI Suggest
        </UButton>
      </div>

      <div class="space-y-6">
        <UFormGroup label="Goal Title" help="Give your goal a clear, inspiring name">
          <UInput v-model="form.title" placeholder="e.g. Sub-3 Hour Marathon" icon="i-heroicons-tag" autofocus />
        </UFormGroup>

        <!-- Body Composition Fields -->
        <template v-if="selectedType === 'BODY_COMPOSITION'">
          <div class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <UFormGroup label="Start Weight" help="Current">
                <UInput v-model="form.startValue" type="number" placeholder="0.0">
                  <template #trailing><span class="text-gray-500 text-xs">kg</span></template>
                </UInput>
              </UFormGroup>
              <UFormGroup label="Target Weight" help="Goal">
                <UInput v-model="form.targetValue" type="number" placeholder="0.0">
                  <template #trailing><span class="text-gray-500 text-xs">kg</span></template>
                </UInput>
              </UFormGroup>
            </div>
            <UFormGroup label="Target Date" help="When do you want to achieve this?">
              <UInput v-model="form.targetDate" type="date" icon="i-heroicons-calendar" />
            </UFormGroup>
          </div>
        </template>

        <!-- Event Fields -->
        <template v-if="selectedType === 'EVENT'">
          <div class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg space-y-4">
            <UFormGroup label="Event Date" help="The big day">
              <UInput v-model="form.eventDate" type="date" icon="i-heroicons-calendar" />
            </UFormGroup>
            <UFormGroup label="Event Type" help="What kind of challenge is it?">
              <USelectMenu 
                v-model="form.eventType" 
                :options="['Race', 'Gran Fondo', 'Time Trial', 'Triathlon', 'Running Race', 'Other']" 
                icon="i-heroicons-trophy"
              />
            </UFormGroup>
          </div>
        </template>

        <!-- Performance Fields -->
        <template v-if="selectedType === 'PERFORMANCE'">
          <div class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg space-y-4">
            <UFormGroup label="Metric" help="What do you want to improve?">
              <USelectMenu 
                v-model="form.metric" 
                :options="['FTP (Watts)', 'VO2 Max', '5k Pace (min/km)', '10k Pace (min/km)', 'Max Heart Rate']" 
                icon="i-heroicons-chart-bar"
              />
            </UFormGroup>
            <div class="grid grid-cols-2 gap-4">
              <UFormGroup label="Current Value">
                <UInput v-model="form.startValue" type="number" placeholder="0" />
              </UFormGroup>
              <UFormGroup label="Target Value">
                <UInput v-model="form.targetValue" type="number" placeholder="0" />
              </UFormGroup>
            </div>
          </div>
        </template>
        
        <!-- Consistency Fields -->
        <template v-if="selectedType === 'CONSISTENCY'">
           <div class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg space-y-4">
             <UFormGroup label="Weekly Target" help="Commitment per week">
               <div class="flex gap-2">
                  <UInput v-model="form.targetValue" type="number" class="flex-1" placeholder="e.g. 10" />
                  <USelectMenu v-model="form.metric" :options="['Hours', 'Workouts', 'TSS']" class="w-32" />
               </div>
             </UFormGroup>
           </div>
        </template>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <UFormGroup label="Priority" help="How important is this?">
            <div class="flex flex-col gap-2">
              <label class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <URadio v-model="form.priority" value="HIGH" />
                <span class="text-sm font-medium text-error">High</span>
                <span class="text-xs text-muted">Primary focus</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <URadio v-model="form.priority" value="MEDIUM" />
                <span class="text-sm font-medium text-warning">Medium</span>
                <span class="text-xs text-muted">Important</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <URadio v-model="form.priority" value="LOW" />
                <span class="text-sm font-medium text-success">Low</span>
                <span class="text-xs text-muted">Nice to have</span>
              </label>
            </div>
          </UFormGroup>
          
          <UFormGroup label="Description" help="Optional notes or motivation">
            <UTextarea v-model="form.description" :rows="4" placeholder="I want to achieve this because..." />
          </UFormGroup>
        </div>

        <div class="pt-4 border-t border-gray-200 dark:border-gray-800 flex justify-end">
          <UButton size="lg" color="primary" @click="saveGoal" :loading="saving" icon="i-heroicons-check">
            {{ isEditMode ? 'Update Goal' : 'Create Goal' }}
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  goal?: any
}>()

const emit = defineEmits(['close', 'created', 'updated'])

const isEditMode = computed(() => !!props.goal)
const step = ref(1)
const selectedType = ref('')
const saving = ref(false)
const generatingSuggestion = ref(false)

const aiSuggestionAvailable = computed(() => {
  // Placeholder logic - we can check if we have enough data
  return true 
})

const selectedTypeLabel = computed(() => {
  return goalTypes.find(t => t.id === selectedType.value)?.label || ''
})

const form = reactive<{
  title: string
  description: string
  priority: string
  startValue: number | undefined
  targetValue: number | undefined
  currentValue: number | undefined
  targetDate: string | undefined
  eventDate: string | undefined
  eventType: string
  metric: string
}>({
  title: '',
  description: '',
  priority: 'MEDIUM',
  startValue: undefined,
  targetValue: undefined,
  currentValue: undefined,
  targetDate: undefined,
  eventDate: undefined,
  eventType: 'Race',
  metric: ''
})

// Initialize form with existing goal data in edit mode
watchEffect(() => {
  if (props.goal) {
    selectedType.value = props.goal.type
    form.title = props.goal.title || ''
    form.description = props.goal.description || ''
    form.priority = props.goal.priority || 'MEDIUM'
    form.startValue = props.goal.startValue
    form.targetValue = props.goal.targetValue
    form.currentValue = props.goal.currentValue
    form.targetDate = props.goal.targetDate ? new Date(props.goal.targetDate).toISOString().split('T')[0] : undefined
    form.eventDate = props.goal.eventDate ? new Date(props.goal.eventDate).toISOString().split('T')[0] : undefined
    form.eventType = props.goal.eventType || 'Race'
    form.metric = props.goal.metric || ''
    step.value = 2
  }
})

const goalTypes = [
  { 
    id: 'BODY_COMPOSITION', 
    label: 'Body Composition', 
    description: 'Lose weight, gain muscle, or maintain.',
    icon: 'i-heroicons-scale',
    color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
  },
  { 
    id: 'EVENT', 
    label: 'Event Preparation', 
    description: 'Prepare for a specific race or event.',
    icon: 'i-heroicons-calendar',
    color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
  },
  { 
    id: 'PERFORMANCE', 
    label: 'Performance', 
    description: 'Improve FTP, VO2 Max, or pace.',
    icon: 'i-heroicons-bolt',
    color: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
  },
  { 
    id: 'CONSISTENCY', 
    label: 'Consistency', 
    description: 'Build habits like weekly hours or frequency.',
    icon: 'i-heroicons-arrow-path',
    color: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
  }
]

function selectType(id: string) {
  selectedType.value = id
  step.value = 2
  
  // Set defaults based on type
  if (id === 'BODY_COMPOSITION') {
    form.metric = 'weight_kg'
    form.title = 'Lose 5kg'
  } else if (id === 'EVENT') {
    form.metric = 'event_date'
    form.title = 'Complete Marathon'
  } else if (id === 'PERFORMANCE') {
    form.metric = 'FTP (Watts)'
    form.title = 'Increase FTP'
  } else if (id === 'CONSISTENCY') {
    form.metric = 'Hours'
    form.title = 'Train 10h per week'
  }
}

async function generateAiSuggestion() {
  generatingSuggestion.value = true
  // Mock AI suggestion for now
  setTimeout(() => {
    if (selectedType.value === 'BODY_COMPOSITION') {
      form.title = "Lose 3kg in 8 weeks"
      form.startValue = 99
      form.targetValue = 96
      // Set date 8 weeks from now
      const d = new Date()
      d.setDate(d.getDate() + 56)
      form.targetDate = d.toISOString().split('T')[0]
      form.description = "Based on your recent activity, a moderate deficit is sustainable."
    } else if (selectedType.value === 'PERFORMANCE') {
      form.title = "Improve FTP to 260W"
      form.metric = "FTP (Watts)"
      form.startValue = 250
      form.targetValue = 260
      form.description = "Your recent intervals suggest you have headroom for a 4% increase."
    }
    generatingSuggestion.value = false
  }, 1000)
}

async function saveGoal() {
  saving.value = true
  try {
    const payload = {
      type: selectedType.value,
      ...form
    }
    
    // Ensure numbers are numbers
    if (payload.startValue) payload.startValue = Number(payload.startValue)
    if (payload.targetValue) payload.targetValue = Number(payload.targetValue)
    if (payload.currentValue) payload.currentValue = Number(payload.currentValue)
    else if (payload.startValue) payload.currentValue = payload.startValue

    if (isEditMode.value && props.goal) {
      // Update existing goal
      await $fetch(`/api/goals/${props.goal.id}`, {
        method: 'PATCH',
        body: payload
      })
      emit('updated')
    } else {
      // Create new goal
      await $fetch('/api/goals', {
        method: 'POST',
        body: payload
      })
      emit('created')
    }
    
    emit('close')
  } catch (error) {
    console.error(error)
  } finally {
    saving.value = false
  }
}
</script>