<template>
  <div class="flex flex-col h-full max-h-[70vh]">
    <!-- Scrollable Content -->
    <div class="flex-1 overflow-y-auto px-1 py-2 space-y-6">
      <!-- Progress Indicator -->
      <div v-if="step <= 2" class="flex items-center justify-center gap-2 mb-4">
        <div class="flex items-center">
          <div
            class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors"
            :class="
              step >= 1 ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-500'
            "
          >
            1
          </div>
          <div
            class="text-xs font-medium ml-2"
            :class="step >= 1 ? 'text-primary' : 'text-gray-500'"
          >
            Goal
          </div>
        </div>
        <div class="w-12 h-1 bg-gray-200 dark:bg-gray-800 rounded-full mx-2 overflow-hidden">
          <div
            class="h-full bg-primary transition-all duration-300"
            :style="{ width: step >= 2 ? '100%' : '0%' }"
          />
        </div>
        <div class="flex items-center">
          <div
            class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors"
            :class="
              step >= 2 ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-500'
            "
          >
            2
          </div>
          <div
            class="text-xs font-medium ml-2"
            :class="step >= 2 ? 'text-primary' : 'text-gray-500'"
          >
            Strategy
          </div>
        </div>
      </div>

      <!-- Step 1: Select Goal -->
      <div v-if="step === 1" class="space-y-6">
        <h3 class="text-xl font-semibold">Step 1: Choose your Goal</h3>

        <div v-if="loadingGoals" class="text-center py-8">
          <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary" />
        </div>

        <div v-else class="space-y-4">
          <!-- Create New Goal Option -->
          <button
            class="w-full p-4 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-primary hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors flex items-center justify-center gap-2 text-muted hover:text-primary"
            @click="showCreateGoal = true"
          >
            <UIcon name="i-heroicons-plus" class="w-5 h-5" />
            <span class="font-medium">Create New Goal</span>
          </button>

          <!-- Existing Goals -->
          <div v-if="goals.length > 0" class="space-y-3">
            <div
              v-for="goal in goals"
              :key="goal.id"
              class="p-4 rounded-lg border-2 text-left transition-all cursor-pointer"
              :class="
                selectedGoal?.id === goal.id
                  ? 'border-primary bg-primary/5 dark:bg-primary/10'
                  : 'border-gray-200 dark:border-gray-800 hover:border-primary/50'
              "
              @click="selectGoal(goal)"
            >
              <div class="flex justify-between items-start">
                <div>
                  <div class="font-semibold text-lg">{{ goal.title }}</div>
                  <div class="text-sm text-muted mt-1">{{ goal.description }}</div>
                  <div
                    v-if="goal.eventDate"
                    class="text-sm text-primary mt-2 flex items-center gap-1"
                  >
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
      <div v-else-if="step === 2" class="space-y-8">
        <div class="flex items-center gap-3 mb-2">
          <UButton icon="i-heroicons-arrow-left" variant="ghost" size="sm" @click="step = 1" />
          <h3 class="text-xl font-semibold">Step 2: Training Strategy</h3>
        </div>

        <!-- 1. Activity Types -->
        <div class="space-y-3">
          <label class="block text-sm font-medium">Which activities should be included?</label>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div
              v-for="type in availableActivityTypes"
              :key="type.value"
              class="p-3 rounded-lg border-2 text-center cursor-pointer transition-all select-none"
              :class="
                selectedActivityTypes.includes(type.value)
                  ? 'border-primary bg-primary/5 dark:bg-primary/10 ring-1 ring-primary/50'
                  : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-600 opacity-70'
              "
              @click="toggleActivityType(type.value)"
            >
              <UIcon
                :name="type.icon"
                class="w-6 h-6 mb-1"
                :class="
                  selectedActivityTypes.includes(type.value) ? 'text-primary' : 'text-gray-400'
                "
              />
              <div
                class="text-sm font-medium"
                :class="
                  selectedActivityTypes.includes(type.value)
                    ? 'text-gray-900 dark:text-white'
                    : 'text-gray-500'
                "
              >
                {{ type.label }}
              </div>
            </div>
          </div>
        </div>

        <!-- 2. Volume -->
        <div class="space-y-4">
          <div class="flex justify-between items-end">
            <label class="block text-sm font-medium">Weekly Volume Target</label>
            <span class="text-2xl font-bold text-primary tabular-nums"
              >{{ volumeHours }} <span class="text-sm font-normal text-muted">hrs/week</span></span
            >
          </div>

          <USlider v-model="volumeHours" :min="3" :max="20" :step="0.5" color="primary" />

          <div class="flex justify-between text-xs text-muted px-1">
            <span>Low (3h)</span>
            <span>Mid (8h)</span>
            <span>High (15h+)</span>
          </div>

          <div class="text-xs text-muted bg-gray-50 dark:bg-gray-800/50 p-2 rounded">
            <UIcon name="i-heroicons-information-circle" class="w-3 h-3 inline mr-1" />
            Roughly {{ Math.round(volumeHours / 1.5) }} workouts per week based on average duration.
          </div>
        </div>

        <!-- 3. Strategy -->
        <div class="space-y-3">
          <div class="flex justify-between items-center">
            <label class="block text-sm font-medium">Training Approach</label>
            <UButton
              variant="link"
              size="xs"
              color="primary"
              class="p-0"
              @click="recommendStrategy"
            >
              Help me choose
            </UButton>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              v-for="strat in strategyOptions"
              :key="strat.value"
              class="relative p-4 rounded-lg border-2 text-left transition-all group overflow-hidden"
              :class="
                strategy === strat.value
                  ? 'border-primary bg-primary/5 dark:bg-primary/10'
                  : 'border-gray-200 dark:border-gray-800'
              "
              @click="strategy = strat.value"
            >
              <!-- Selection Indicator -->
              <div v-if="strategy === strat.value" class="absolute top-2 right-2">
                <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-primary" />
              </div>

              <div class="font-bold mb-1">{{ strat.label }}</div>

              <!-- Mini Visualization -->
              <div class="h-8 w-full mb-2 opacity-50 group-hover:opacity-100 transition-opacity">
                <!-- Simple SVG sparklines -->
                <svg
                  v-if="strat.value === 'LINEAR'"
                  viewBox="0 0 100 20"
                  class="w-full h-full stroke-current text-primary"
                  fill="none"
                >
                  <path d="M0 18 L20 15 L40 12 L60 8 L80 4 L100 0" stroke-width="2" />
                </svg>
                <svg
                  v-else-if="strat.value === 'POLARIZED'"
                  viewBox="0 0 100 20"
                  class="w-full h-full stroke-current text-primary"
                  fill="none"
                >
                  <path
                    d="M0 18 L15 18 L20 2 L25 18 L40 18 L45 2 L50 18 L100 18"
                    stroke-width="2"
                  />
                </svg>
                <svg
                  v-else-if="strat.value === 'BLOCK'"
                  viewBox="0 0 100 20"
                  class="w-full h-full stroke-current text-primary"
                  fill="none"
                >
                  <path
                    d="M0 15 L30 15 L30 5 L60 5 L60 15 L90 15 L90 2"
                    stroke-width="2"
                    step="after"
                  />
                </svg>
                <svg
                  v-else-if="strat.value === 'UNDULATING'"
                  viewBox="0 0 100 20"
                  class="w-full h-full stroke-current text-primary"
                  fill="none"
                >
                  <path d="M0 10 Q25 0 50 10 T100 10" stroke-width="2" />
                </svg>
              </div>

              <div class="text-xs text-muted leading-tight">{{ strat.description }}</div>
            </button>
          </div>

          <div
            v-if="aiRecommendation"
            class="text-xs text-primary bg-primary/5 p-2 rounded flex gap-2 items-start animate-in fade-in slide-in-from-top-1"
          >
            <UIcon name="i-heroicons-sparkles" class="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{{ aiRecommendation }}</span>
          </div>
        </div>

        <!-- 4. Timeline -->
        <div class="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg space-y-4">
          <div class="flex items-center justify-between">
            <label class="block text-sm font-medium">Timeline Mode</label>
            <div class="flex items-center gap-2">
              <span
                class="text-xs text-muted"
                :class="{ 'text-primary font-medium': !isEventBased }"
                >Duration</span
              >
              <USwitch v-model="isEventBased" size="lg" />
              <span class="text-xs text-muted" :class="{ 'text-primary font-medium': isEventBased }"
                >Event Date</span
              >
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div v-if="isEventBased">
              <label class="block text-xs font-medium text-muted uppercase mb-1"
                >Target Event Date</label
              >
              <div class="font-bold text-lg">
                {{ endDate ? formatDate(endDate) : 'Select Goal Event' }}
              </div>
              <div class="text-xs text-muted mt-1">AI will backwards plan from this date.</div>
            </div>

            <div v-else>
              <label class="block text-xs font-medium text-muted uppercase mb-1">Duration</label>
              <USelect v-model="durationWeeks" :items="durationOptions" value-key="value" />
            </div>

            <div>
              <label class="block text-xs font-medium text-muted uppercase mb-1">Start Date</label>
              <UInput v-model="startDate" type="date" />
            </div>
          </div>
        </div>
      </div>

      <!-- Step 3: Plan Preview (Blocks) -->
      <div v-else-if="step === 3" class="space-y-6">
        <div class="flex items-center gap-3 mb-2">
          <h3 class="text-xl font-semibold">Step 3: Review Your Plan</h3>
        </div>

        <div v-if="generatedPlan" class="space-y-6">
          <div
            class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg text-sm text-blue-800 dark:text-blue-200"
          >
            We've designed a <strong>{{ generatedPlan.strategy }}</strong> plan focusing on your
            goal <strong>{{ selectedGoal.title }}</strong
            >. It consists of {{ generatedPlan.blocks.length }} training blocks over
            {{ totalWeeks }} weeks.
          </div>

          <!-- Add a note about background generation -->
          <div
            class="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg text-sm text-yellow-800 dark:text-yellow-200 flex items-start gap-2"
          >
            <UIcon name="i-heroicons-information-circle" class="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Note:</strong> Once you click "Start Training", the AI will begin generating
              detailed workouts for your first block in the background. This may take a minute.
            </div>
          </div>

          <!-- Block Timeline Visualization -->
          <div class="space-y-4">
            <div
              v-for="block in generatedPlan.blocks"
              :key="block.order"
              class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center"
            >
              <div
                class="p-3 rounded-lg bg-gray-100 dark:bg-gray-800 text-center min-w-[60px] w-full sm:w-auto flex sm:block justify-between sm:justify-center items-center"
              >
                <div class="text-xs text-muted">WEEKS</div>
                <div class="font-bold text-lg">{{ block.durationWeeks }}</div>
              </div>

              <div class="flex-1 w-full">
                <div
                  class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-1 gap-1"
                >
                  <h4 class="font-bold">{{ block.name.split('[')[0].trim() }}</h4>
                  <span class="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 w-fit">{{
                    formatDate(block.startDate, 'MMM d')
                  }}</span>
                </div>
                <div class="text-sm text-muted mb-2">{{ getBlockDescription(block.type) }}</div>
                <div class="flex flex-wrap gap-2">
                  <UBadge size="xs" color="primary" variant="subtle"
                    >Focus: {{ formatFocus(block.primaryFocus) }}</UBadge
                  >
                  <UBadge size="xs" color="neutral" variant="subtle">{{ block.type }}</UBadge>
                  <UBadge
                    v-if="block.name.includes('[Race:')"
                    size="xs"
                    color="info"
                    variant="soft"
                    icon="i-heroicons-flag"
                  >
                    {{ block.name.match(/\[Race: (.*?)\]/)?.[1] || 'Race' }}
                  </UBadge>
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
    <div
      class="pt-4 border-t mt-auto flex justify-end bg-white dark:bg-gray-900 sticky bottom-0 z-10 gap-3"
    >
      <template v-if="step === 1">
        <UButton
          v-if="selectedGoal"
          size="xl"
          color="primary"
          icon="i-heroicons-arrow-right"
          @click="step = 2"
        >
          Next: Plan Strategy
        </UButton>
      </template>

      <template v-else-if="step === 2">
        <UButton
          size="xl"
          color="primary"
          :loading="initializing"
          icon="i-heroicons-sparkles"
          :disabled="selectedActivityTypes.length === 0"
          @click="initializePlan"
        >
          Generate Plan Preview
        </UButton>
      </template>

      <template v-else-if="step === 3">
        <UButton variant="ghost" @click="step = 2">Back</UButton>
        <UButton
          size="xl"
          color="success"
          :loading="activating"
          icon="i-heroicons-check-circle"
          @click="confirmPlan"
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
  const { formatDate, getUserLocalDate, timezone } = useFormat()

  // State
  const step = ref(1)
  const loadingGoals = ref(false)
  const showCreateGoal = ref(false)
  const goals = ref<any[]>([])
  const selectedGoal = ref<any>(null)

  // Step 2 State
  const volumeHours = ref(6) // Default 6 hours
  const strategy = ref('LINEAR')
  // Initialize with local today
  const startDate = ref(getUserLocalDate().toISOString().split('T')[0])
  const endDate = ref('')
  const isEventBased = ref(true)
  const durationWeeks = ref(12)
  const aiRecommendation = ref('')

  const durationOptions = [
    { label: '4 Weeks (Sprint)', value: 4 },
    { label: '8 Weeks (Short)', value: 8 },
    { label: '12 Weeks (Standard)', value: 12 },
    { label: '16 Weeks (Long)', value: 16 },
    { label: '24 Weeks (Season)', value: 24 },
    { label: '52 Weeks (Year)', value: 52 }
  ]

  const selectedActivityTypes = ref<string[]>(['Ride'])
  const availableActivityTypes = [
    { value: 'Ride', label: 'Cycling', icon: 'i-heroicons-bolt' }, // Using bolt as simplified "power" icon or fallback
    { value: 'Run', label: 'Running', icon: 'i-heroicons-fire' }, // Using fire as cardio/run icon
    { value: 'Swim', label: 'Swimming', icon: 'i-material-symbols-water-drop' }, // Drop as water
    { value: 'Gym', label: 'Strength', icon: 'i-heroicons-trophy' } // Trophy or similar for strength
  ]

  const initializing = ref(false)

  // Step 3 State
  const generatedPlan = ref<any>(null)
  const activating = ref(false)

  const strategyOptions = [
    { value: 'LINEAR', label: 'Linear', description: 'Steady progression. Classic approach.' },
    { value: 'POLARIZED', label: 'Polarized', description: '80% Easy, 20% Hard. Max freshness.' },
    { value: 'BLOCK', label: 'Block', description: 'Concentrated intensity weeks. Advanced.' },
    {
      value: 'UNDULATING',
      label: 'Undulating',
      description: 'Varied daily focus. Prevents plateaus.'
    }
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
    if (goal.eventDate) {
      endDate.value = new Date(goal.eventDate).toISOString().split('T')[0] || ''
      isEventBased.value = true
    } else {
      // Default to 12 weeks if no event date
      const d = getUserLocalDate()
      d.setDate(d.getDate() + 84)
      endDate.value = d.toISOString().split('T')[0] || ''
      isEventBased.value = false
    }
  }

  function onGoalCreated() {
    showCreateGoal.value = false
    fetchGoals() // Refresh list
    toast.add({ title: 'Goal Created', color: 'success' })
  }

  function getPriorityColor(p: string) {
    if (p === 'HIGH') return 'error'
    if (p === 'MEDIUM') return 'warning'
    return 'success'
  }

  function getBlockDescription(type: string) {
    const map: Record<string, string> = {
      BASE: 'Building aerobic endurance and muscular efficiency.',
      BUILD: 'Increasing threshold power and VO2 max capacity.',
      PEAK: 'Sharpening race-specific skills and tapering fatigue.',
      RACE: 'Race week preparation and execution.',
      TRANSITION: 'Recovery and unstructured riding.'
    }
    return map[type] || 'Training block.'
  }

  function formatFocus(focus: string) {
    return focus
      .split('_')
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(' ')
  }

  function toggleActivityType(type: string) {
    if (selectedActivityTypes.value.includes(type)) {
      // Prevent deselecting the last one
      if (selectedActivityTypes.value.length > 1) {
        selectedActivityTypes.value = selectedActivityTypes.value.filter((t) => t !== type)
      }
    } else {
      selectedActivityTypes.value.push(type)
    }
  }

  function recommendStrategy() {
    // Simple logic for now, could be LLM powered later
    if (volumeHours.value > 10) {
      aiRecommendation.value =
        'With high volume (>10h), Polarized is excellent for avoiding burnout while building huge aerobic capacity.'
      strategy.value = 'POLARIZED'
    } else if (isEventBased.value && selectedGoal.value?.eventDate) {
      // Check time to event
      const weeks =
        (new Date(selectedGoal.value.eventDate).getTime() - getUserLocalDate().getTime()) /
        (1000 * 60 * 60 * 24 * 7)
      if (weeks < 8) {
        aiRecommendation.value =
          'With limited time (<8 weeks), Block periodization can provide a rapid fitness boost.'
        strategy.value = 'BLOCK'
      } else {
        aiRecommendation.value =
          'Linear periodization is the safest and most reliable way to peak for your event.'
        strategy.value = 'LINEAR'
      }
    } else {
      aiRecommendation.value = 'Linear periodization is the best starting point for most athletes.'
      strategy.value = 'LINEAR'
    }
  }

  async function initializePlan() {
    initializing.value = true

    if (!startDate.value) {
      toast.add({ title: 'Please select a start date', color: 'error' })
      initializing.value = false
      return
    }

    // Calculate end date if duration mode
    let finalEndDate = endDate.value
    if (!isEventBased.value) {
      const d = new Date(startDate.value + 'T00:00:00')
      d.setDate(d.getDate() + durationWeeks.value * 7)
      // Adjust to end of that day
      finalEndDate = d.toISOString().split('T')[0] + 'T23:59:59'
    } else if (finalEndDate) {
      finalEndDate = finalEndDate.split('T')[0] + 'T23:59:59'
    }

    // Map volume hours to bucket for backend (temporary until backend supports direct hours)
    let volumeBucket = 'MID'
    if (volumeHours.value <= 5) volumeBucket = 'LOW'
    else if (volumeHours.value >= 10) volumeBucket = 'HIGH'

    try {
      const response: any = await $fetch('/api/plans/initialize', {
        method: 'POST',
        body: {
          goalId: selectedGoal.value.id,
          startDate: new Date(startDate.value + 'T00:00:00').toISOString(),
          endDate: finalEndDate ? new Date(finalEndDate).toISOString() : undefined,
          volumePreference: volumeBucket, // Keeping for backward compat if needed
          volumeHours: volumeHours.value, // New precise value
          strategy: strategy.value,
          preferredActivityTypes: selectedActivityTypes.value
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

  async function confirmPlan() {
    if (activating.value) return
    activating.value = true
    try {
      // Activate the plan (archives others, triggers generation)
      await $fetch(`/api/plans/${generatedPlan.value.id}/activate`, { method: 'POST' })

      emit('plan-created', generatedPlan.value)
      emit('close')
    } catch (error) {
      toast.add({
        title: 'Activation Failed',
        description: 'Could not activate the plan.',
        color: 'error'
      })
    } finally {
      activating.value = false
    }
  }

  onMounted(() => {
    fetchGoals()
  })
</script>
