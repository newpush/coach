<template>
  <div class="space-y-6">
    <!-- Step 1: Select Type -->
    <div v-if="step === 1" class="space-y-4">
      <h3 class="text-lg font-semibold">What is your main goal?</h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          v-for="type in goalTypes"
          :key="type.id"
          class="p-4 rounded-lg border-2 text-left transition-all hover:border-primary hover:bg-primary/5 dark:hover:bg-primary/10"
          :class="
            selectedType === type.id
              ? 'border-primary bg-primary/5 dark:bg-primary/10'
              : 'border-gray-200 dark:border-gray-800'
          "
          @click="selectType(type.id)"
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
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <UButton icon="i-heroicons-arrow-left" variant="ghost" size="sm" @click="step = 1" />
          <h3 class="text-xl font-semibold">Configure {{ selectedTypeLabel }} Goal</h3>
        </div>
        <UButton
          v-if="aiSuggestionAvailable"
          icon="i-heroicons-sparkles"
          size="sm"
          color="primary"
          variant="soft"
          :loading="generatingSuggestion"
          @click="generateAiSuggestion"
        >
          AI Suggest
        </UButton>
      </div>

      <div class="space-y-5">
        <div>
          <label class="flex items-center gap-2 text-sm font-medium mb-2">
            <UIcon name="i-heroicons-tag" class="w-4 h-4 text-muted" />
            Goal Title
          </label>
          <UInput v-model="form.title" placeholder="e.g. Lose 3kg in 8 weeks" size="lg" autofocus />
        </div>

        <!-- Body Composition Fields -->
        <template v-if="selectedType === 'BODY_COMPOSITION'">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-sm font-medium mb-2 block">Start Weight</label>
              <UInputNumber
                v-model="form.startValue"
                placeholder="99.0"
                size="lg"
                :min="0"
                :step="0.1"
                :format-options="{ minimumFractionDigits: 1, maximumFractionDigits: 1 }"
              />
              <p class="text-xs text-muted mt-1">Current weight in kg</p>
            </div>
            <div>
              <label class="text-sm font-medium mb-2 block">Target Weight</label>
              <UInputNumber
                v-model="form.targetValue"
                placeholder="96.0"
                size="lg"
                :min="0"
                :step="0.1"
                :format-options="{ minimumFractionDigits: 1, maximumFractionDigits: 1 }"
              />
              <p class="text-xs text-muted mt-1">Goal weight in kg</p>
            </div>
          </div>
          <div>
            <label class="flex items-center gap-2 text-sm font-medium mb-2">
              <UIcon name="i-heroicons-calendar" class="w-4 h-4 text-muted" />
              Target Date
            </label>
            <UInput v-model="form.targetDate" type="date" size="lg" />
            <p class="text-xs text-muted mt-1">When do you want to achieve this?</p>
          </div>
        </template>

        <!-- Event Fields -->
        <template v-if="selectedType === 'EVENT'">
          <div>
            <label class="flex items-center gap-2 text-sm font-medium mb-2">
              <UIcon name="i-heroicons-calendar" class="w-4 h-4 text-muted" />
              Event Date
            </label>
            <UInput v-model="form.eventDate" type="date" size="lg" />
            <p class="text-xs text-muted mt-1">The big day</p>
          </div>
          <div>
            <label class="flex items-center gap-2 text-sm font-medium mb-2">
              <UIcon name="i-heroicons-trophy" class="w-4 h-4 text-muted" />
              Event Type
            </label>
            <USelect
              v-model="form.eventType"
              :items="['Race', 'Gran Fondo', 'Time Trial', 'Triathlon', 'Running Race', 'Other']"
              size="lg"
              :ui="{ content: 'min-w-[200px]' }"
            />
            <p class="text-xs text-muted mt-1">What kind of challenge is it?</p>
          </div>
        </template>

        <!-- Performance Fields -->
        <template v-if="selectedType === 'PERFORMANCE'">
          <div>
            <label class="flex items-center gap-2 text-sm font-medium mb-2">
              <UIcon name="i-heroicons-chart-bar" class="w-4 h-4 text-muted" />
              Metric
            </label>
            <USelect
              v-model="form.metric"
              :items="[
                'FTP (Watts)',
                'VO2 Max',
                '5k Pace (min/km)',
                '10k Pace (min/km)',
                'Max Heart Rate'
              ]"
              size="lg"
              :ui="{ content: 'min-w-[250px]' }"
            />
            <p class="text-xs text-muted mt-1">What do you want to improve?</p>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-sm font-medium mb-2 block">Current Value</label>
              <UInputNumber v-model="form.startValue" placeholder="250" size="lg" :min="0" />
            </div>
            <div>
              <label class="text-sm font-medium mb-2 block">Target Value</label>
              <UInputNumber v-model="form.targetValue" placeholder="260" size="lg" :min="0" />
            </div>
          </div>
        </template>

        <!-- Consistency Fields -->
        <template v-if="selectedType === 'CONSISTENCY'">
          <div>
            <label class="text-sm font-medium mb-2 block">Weekly Target</label>
            <div class="flex gap-3">
              <UInputNumber
                v-model="form.targetValue"
                class="flex-1"
                placeholder="10"
                size="lg"
                :min="0"
              />
              <USelect
                v-model="form.metric"
                :items="['Hours', 'Workouts', 'TSS']"
                size="lg"
                class="w-40"
                :ui="{ content: 'min-w-[150px]' }"
              />
            </div>
            <p class="text-xs text-muted mt-1">Commitment per week</p>
          </div>
        </template>

        <div>
          <label class="text-sm font-medium mb-3 block">Priority</label>
          <div class="flex flex-col gap-2">
            <button
              type="button"
              class="flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left"
              :class="
                form.priority === 'HIGH'
                  ? 'border-error bg-error/5'
                  : 'border-gray-200 dark:border-gray-800 hover:border-error/50'
              "
              @click="form.priority = 'HIGH'"
            >
              <span class="text-error font-semibold">High</span>
              <span class="text-sm text-muted">Primary focus</span>
            </button>
            <button
              type="button"
              class="flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left"
              :class="
                form.priority === 'MEDIUM'
                  ? 'border-warning bg-warning/5'
                  : 'border-gray-200 dark:border-gray-800 hover:border-warning/50'
              "
              @click="form.priority = 'MEDIUM'"
            >
              <span class="text-warning font-semibold">Medium</span>
              <span class="text-sm text-muted">Important</span>
            </button>
            <button
              type="button"
              class="flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left"
              :class="
                form.priority === 'LOW'
                  ? 'border-success bg-success/5'
                  : 'border-gray-200 dark:border-gray-800 hover:border-success/50'
              "
              @click="form.priority = 'LOW'"
            >
              <span class="text-success font-semibold">Low</span>
              <span class="text-sm text-muted">Nice to have</span>
            </button>
          </div>
        </div>

        <div>
          <label class="text-sm font-medium mb-2 block">Description</label>
          <UTextarea
            v-model="form.description"
            :rows="3"
            placeholder="Based on your recent activity, a moderate deficit is sustainable..."
            size="lg"
          />
          <p class="text-xs text-muted mt-1">Optional notes or motivation</p>
        </div>

        <div class="pt-6 flex justify-end">
          <UButton
            size="xl"
            color="primary"
            :loading="saving"
            icon="i-heroicons-check"
            class="px-8"
            @click="saveGoal"
          >
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
  const { formatDate, getUserLocalDate, timezone } = useFormat()

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
    return goalTypes.find((t) => t.id === selectedType.value)?.label || ''
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
      form.targetDate = props.goal.targetDate
        ? formatUserDate(props.goal.targetDate, timezone.value, 'yyyy-MM-dd')
        : undefined
      form.eventDate = props.goal.eventDate
        ? formatUserDate(props.goal.eventDate, timezone.value, 'yyyy-MM-dd')
        : undefined
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
        form.title = 'Lose 3kg in 8 weeks'
        form.startValue = 99
        form.targetValue = 96
        // Set date 8 weeks from now relative to user local day
        const d = getUserLocalDate()
        d.setDate(d.getDate() + 56)
        form.targetDate = d.toISOString().split('T')[0]
        form.description = 'Based on your recent activity, a moderate deficit is sustainable.'
      } else if (selectedType.value === 'PERFORMANCE') {
        form.title = 'Improve FTP to 260W'
        form.metric = 'FTP (Watts)'
        form.startValue = 250
        form.targetValue = 260
        form.description = 'Your recent intervals suggest you have headroom for a 4% increase.'
      }
      generatingSuggestion.value = false
    }, 1000)
  }

  async function saveGoal() {
    saving.value = true
    try {
      const payload: any = {
        type: selectedType.value,
        ...form
      }

      // Convert local dates to absolute UTC ISO strings
      if (form.targetDate) {
        payload.targetDate = new Date(form.targetDate + 'T23:59:59').toISOString()
      }
      if (form.eventDate) {
        payload.eventDate = new Date(form.eventDate + 'T00:00:00').toISOString()
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
