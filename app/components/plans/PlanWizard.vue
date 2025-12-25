<template>
  <div class="flex flex-col h-full max-h-[70vh]">
    <!-- Scrollable Content -->
    <div class="flex-1 overflow-y-auto px-1 py-2 space-y-6">
      
      <!-- Step 1: Select Goal -->
      <div v-if="step === 1" class="space-y-6">
        <h3 class="text-xl font-semibold">Step 1: Choose your Goal</h3>
        
        <div v-if="loadingGoals" class="text-center py-8">
          <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary" />
        </div>

        <div v-else class="space-y-4">
          <!-- Create New Goal Option -->
          <button 
            @click="showCreateGoal = true"
            class="w-full p-4 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-primary hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors flex items-center justify-center gap-2 text-muted hover:text-primary"
          >
            <UIcon name="i-heroicons-plus" class="w-5 h-5" />
            <span class="font-medium">Create New Goal</span>
          </button>

          <!-- Existing Goals -->
          <div v-if="goals.length > 0" class="space-y-3">
            <div 
              v-for="goal in goals" 
              :key="goal.id"
              @click="selectGoal(goal)"
              class="p-4 rounded-lg border-2 text-left transition-all cursor-pointer"
              :class="selectedGoal?.id === goal.id ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-gray-200 dark:border-gray-800 hover:border-primary/50'"
            >
              <div class="flex justify-between items-start">
                <div>
                  <div class="font-semibold text-lg">{{ goal.title }}</div>
                  <div class="text-sm text-muted mt-1">{{ goal.description }}</div>
                  <div v-if="goal.eventDate" class="text-sm text-primary mt-2 flex items-center gap-1">
                    <UIcon name="i-heroicons-calendar" class="w-4 h-4" />
                    Target: {{ formatDate(goal.eventDate) }}
                  </div>
                </div>
                <UBadge :color="getPriorityColor(goal.priority)">{{ goal.priority }}</UBadge>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 2: Plan Strategy & Volume -->
      <div v-else-if="step === 2" class="space-y-6">
        <div class="flex items-center gap-3 mb-2">
          <UButton icon="i-heroicons-arrow-left" variant="ghost" size="sm" @click="step = 1" />
          <h3 class="text-xl font-semibold">Step 2: Training Strategy</h3>
        </div>

        <div class="space-y-6">
          <div>
            <label class="block text-sm font-medium mb-3">Volume Preference</label>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button 
                v-for="vol in volumeOptions" 
                :key="vol.value"
                @click="volumePreference = vol.value"
                class="p-4 rounded-lg border-2 text-center transition-all"
                :class="volumePreference === vol.value ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-gray-200 dark:border-gray-800'"
              >
                <div class="font-semibold">{{ vol.label }}</div>
                <div class="text-xs text-muted mt-1">{{ vol.hours }}</div>
              </button>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium mb-3">Training Strategy</label>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
               <button 
                v-for="strat in strategyOptions" 
                :key="strat.value"
                @click="strategy = strat.value"
                class="p-4 rounded-lg border-2 text-left transition-all"
                :class="strategy === strat.value ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-gray-200 dark:border-gray-800'"
              >
                <div class="font-semibold">{{ strat.label }}</div>
                <div class="text-xs text-muted mt-1">{{ strat.description }}</div>
              </button>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium mb-2">Start Date</label>
            <UInput v-model="startDate" type="date" />
          </div>
        </div>
      </div>

      <!-- Step 3: Plan Preview (Blocks) -->
      <div v-else-if="step === 3" class="space-y-6">
        <div class="flex items-center gap-3 mb-2">
          <h3 class="text-xl font-semibold">Step 3: Review Your Plan</h3>
        </div>

        <div v-if="generatedPlan" class="space-y-6">
          <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg text-sm text-blue-800 dark:text-blue-200">
            We've designed a <strong>{{ generatedPlan.strategy }}</strong> plan focusing on your goal <strong>{{ selectedGoal.title }}</strong>.
            It consists of {{ generatedPlan.blocks.length }} training blocks over {{ totalWeeks }} weeks.
          </div>

          <!-- Block Timeline Visualization -->
          <div class="space-y-4">
            <div 
              v-for="block in generatedPlan.blocks" 
              :key="block.order"
              class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex gap-4 items-center"
            >
              <div class="p-3 rounded-lg bg-gray-100 dark:bg-gray-800 text-center min-w-[60px]">
                <div class="text-xs text-muted">WEEKS</div>
                <div class="font-bold text-lg">{{ block.durationWeeks }}</div>
              </div>
              
              <div class="flex-1">
                <div class="flex justify-between items-center mb-1">
                  <h4 class="font-bold">{{ block.name }}</h4>
                  <span class="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-800">{{ formatDate(block.startDate) }}</span>
                </div>
                <div class="text-sm text-muted mb-2">{{ getBlockDescription(block.type) }}</div>
                <div class="flex gap-2">
                  <UBadge size="xs" color="primary" variant="subtle">Focus: {{ formatFocus(block.primaryFocus) }}</UBadge>
                  <UBadge size="xs" color="gray" variant="subtle">{{ block.type }}</UBadge>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Goal Modal (Nested) -->
    <UModal 
      v-model:open="showCreateGoal" 
      title="Create Goal"
      description="Define a new training goal to focus your plan."
    >
      <template #body>
        <EventGoalWizard @created="onGoalCreated" @close="showCreateGoal = false" />
      </template>
    </UModal>

    <!-- Sticky Footer Actions -->
    <div class="pt-4 border-t mt-auto flex justify-end bg-white dark:bg-gray-900 sticky bottom-0 z-10 gap-3">
      <template v-if="step === 1">
        <UButton 
          v-if="selectedGoal" 
          size="xl" 
          color="primary" 
          @click="step = 2" 
          icon="i-heroicons-arrow-right"
        >
          Next: Plan Strategy
        </UButton>
      </template>

      <template v-else-if="step === 2">
        <UButton 
          size="xl" 
          color="primary" 
          @click="initializePlan" 
          :loading="initializing"
          icon="i-heroicons-sparkles"
        >
          Generate Plan Preview
        </UButton>
      </template>

      <template v-else-if="step === 3">
        <UButton variant="ghost" @click="step = 2">Back</UButton>
        <UButton 
          size="xl" 
          color="success" 
          @click="confirmPlan" 
          icon="i-heroicons-check-circle"
        >
          Start Training
        </UButton>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import EventGoalWizard from '~/components/goals/EventGoalWizard.vue'

const emit = defineEmits(['close', 'plan-created'])
const toast = useToast()

// State
const step = ref(1)
const loadingGoals = ref(false)
const showCreateGoal = ref(false)
const goals = ref<any[]>([])
const selectedGoal = ref<any>(null)

// Step 2 State
const volumePreference = ref('MID')
const strategy = ref('LINEAR')
const startDate = ref(new Date().toISOString().split('T')[0])
const initializing = ref(false)

// Step 3 State
const generatedPlan = ref<any>(null)

// Options
const volumeOptions = [
  { value: 'LOW', label: 'Low Volume', hours: '3-5 hrs/week' },
  { value: 'MID', label: 'Mid Volume', hours: '6-9 hrs/week' },
  { value: 'HIGH', label: 'High Volume', hours: '10+ hrs/week' }
]

const strategyOptions = [
  { value: 'LINEAR', label: 'Linear Periodization', description: 'Classic steady progression. Best for most riders.' },
  { value: 'POLARIZED', label: 'Polarized (80/20)', description: 'High volume low intensity, minimal threshold work.' },
  { value: 'UNDULATING', label: 'Daily Undulating', description: 'Frequent changes in intensity to prevent plateau.' },
  { value: 'BLOCK', label: 'Block Periodization', description: 'Concentrated loads of specific intensity. Advanced.' }
]

const totalWeeks = computed(() => {
  if (!generatedPlan.value?.blocks) return 0
  return generatedPlan.value.blocks.reduce((acc: number, b: any) => acc + b.durationWeeks, 0)
})

// Methods
async function fetchGoals() {
  loadingGoals.value = true
  try {
    const data: any = await $fetch('/api/goals')
    goals.value = data.goals || []
  } catch (error) {
    console.error('Error fetching goals', error)
  } finally {
    loadingGoals.value = false
  }
}

function selectGoal(goal: any) {
  selectedGoal.value = goal
}

function onGoalCreated() {
  showCreateGoal.value = false
  fetchGoals() // Refresh list
  toast.add({ title: 'Goal Created', color: 'success' })
}

function getPriorityColor(p: string) {
  if (p === 'HIGH') return 'red'
  if (p === 'MEDIUM') return 'orange'
  return 'green'
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getBlockDescription(type: string) {
  const map: Record<string, string> = {
    'BASE': 'Building aerobic endurance and muscular efficiency.',
    'BUILD': 'Increasing threshold power and VO2 max capacity.',
    'PEAK': 'Sharpening race-specific skills and tapering fatigue.',
    'RACE': 'Race week preparation and execution.',
    'TRANSITION': 'Recovery and unstructured riding.'
  }
  return map[type] || 'Training block.'
}

function formatFocus(focus: string) {
  return focus.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')
}

async function initializePlan() {
  initializing.value = true
  try {
    const response: any = await $fetch('/api/plans/initialize', {
      method: 'POST',
      body: {
        goalId: selectedGoal.value.id,
        startDate: new Date(startDate.value).toISOString(),
        volumePreference: volumePreference.value,
        strategy: strategy.value
      }
    })
    
    generatedPlan.value = response.plan
    step.value = 3
  } catch (error: any) {
    toast.add({
      title: 'Failed to generate plan',
      description: error.data?.message || 'Unknown error',
      color: 'error'
    })
  } finally {
    initializing.value = false
  }
}

function confirmPlan() {
  // Logic to activate the plan (it's already created as ACTIVE in backend for now, but we could have a "confirm" step API if we used DRAFT)
  // Since the API currently creates it as ACTIVE, we just close and emit.
  emit('plan-created', generatedPlan.value)
  emit('close')
}

onMounted(() => {
  fetchGoals()
})
</script>
