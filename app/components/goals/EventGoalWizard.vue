<template>
  <div class="space-y-6">
    <!-- Step 1: Goal Type Selection -->
    <div v-if="step === 1" class="space-y-4">
      <h3 class="text-lg font-semibold">What are you training for?</h3>
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

    <!-- Step 2: Select Event (Only for EVENT type) -->
    <div v-else-if="step === 2 && selectedType === 'EVENT'" class="space-y-6">
      <div class="flex items-center gap-3 mb-4">
        <UButton icon="i-heroicons-arrow-left" variant="ghost" size="sm" @click="step = 1" />
        <h3 class="text-xl font-semibold">Select your target event</h3>
      </div>

      <div class="space-y-4">
        <div v-if="loadingEvents" class="flex justify-center py-12">
          <div class="text-center">
            <UIcon
              name="i-heroicons-arrow-path"
              class="w-8 h-8 animate-spin text-primary mx-auto mb-2"
            />
            <p class="text-sm text-muted">Loading your events...</p>
          </div>
        </div>

        <div
          v-else-if="userEvents.length === 0"
          class="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-lg"
        >
          <UIcon
            name="i-heroicons-calendar"
            class="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3"
          />
          <h4 class="font-semibold text-lg mb-1">No events found</h4>
          <p class="text-muted text-sm mb-4">You need to add an event to your calendar first.</p>
          <UButton to="/events" color="primary" variant="soft" icon="i-heroicons-plus">
            Go to Events
          </UButton>
        </div>

        <div v-else class="space-y-3">
          <div class="flex justify-between items-center mb-2">
            <h4 class="text-sm font-medium text-muted uppercase tracking-wider">
              Your Upcoming Events
            </h4>
            <span v-if="form.eventIds.length > 0" class="text-xs text-primary font-bold"
              >{{ form.eventIds.length }} selected</span
            >
          </div>
          <div
            v-for="event in userEvents"
            :key="event.id"
            class="p-4 rounded-lg border cursor-pointer transition-all flex justify-between items-center group"
            :class="
              form.eventIds.includes(event.id)
                ? 'border-primary bg-primary/5 dark:bg-primary/10 ring-1 ring-primary'
                : 'border-gray-200 dark:border-gray-700 hover:border-primary/50'
            "
            @click="toggleUserEvent(event)"
          >
            <div>
              <div
                class="font-medium text-lg"
                :class="form.eventIds.includes(event.id) ? 'text-primary' : ''"
              >
                {{ event.title }}
              </div>
              <div class="text-sm text-muted mt-1 flex items-center gap-2">
                <UIcon name="i-heroicons-calendar" class="w-4 h-4" />
                {{ formatDate(event.date) }}
                <span class="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
                {{ event.type }}
              </div>
            </div>
            <div
              class="w-6 h-6 rounded-full border flex items-center justify-center transition-colors"
              :class="
                form.eventIds.includes(event.id)
                  ? 'bg-primary border-primary text-white'
                  : 'border-gray-300 dark:border-gray-600 group-hover:border-primary'
              "
            >
              <UIcon
                v-if="form.eventIds.includes(event.id)"
                name="i-heroicons-check"
                class="w-4 h-4"
              />
            </div>
          </div>

          <div class="pt-6 flex justify-end">
            <UButton
              size="lg"
              color="primary"
              icon="i-heroicons-arrow-right"
              :disabled="form.eventIds.length === 0"
              @click="step = 3"
            >
              Continue with {{ form.eventIds.length }} Event{{
                form.eventIds.length !== 1 ? 's' : ''
              }}
            </UButton>
          </div>
        </div>
      </div>
    </div>

    <!-- Step 3: Event Details / Course Profile -->
    <div v-else-if="step === 3" class="space-y-6">
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <UButton
            icon="i-heroicons-arrow-left"
            variant="ghost"
            size="sm"
            @click="selectedType === 'EVENT' ? (step = 2) : (step = 1)"
          />
          <h3 class="text-xl font-semibold">Configure {{ selectedTypeLabel }}</h3>
        </div>
      </div>

      <div class="space-y-5">
        <div>
          <label class="flex items-center gap-2 text-sm font-medium mb-2">
            <UIcon name="i-heroicons-tag" class="w-4 h-4 text-muted" />
            Goal Title
          </label>
          <UInput v-model="form.title" placeholder="e.g. Maratona dles Dolomites" size="lg" />
        </div>

        <template v-if="selectedType === 'EVENT'">
          <div class="space-y-4">
            <h4 class="text-sm font-medium text-gray-500 uppercase tracking-wider">
              Target Events ({{ selectedEvents.length }})
            </h4>
            <div
              v-for="event in selectedEvents"
              :key="event.id"
              class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 relative overflow-hidden"
            >
              <div class="absolute top-0 right-0 p-2 opacity-10">
                <UIcon name="i-heroicons-calendar" class="w-12 h-12" />
              </div>

              <div class="font-bold text-gray-900 dark:text-white mb-3">{{ event.title }}</div>

              <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <span class="text-[10px] text-muted block uppercase font-bold">Date</span>
                  <span class="text-sm font-medium">{{ formatDate(event.date) }}</span>
                </div>
                <div>
                  <span class="text-[10px] text-muted block uppercase font-bold">Type</span>
                  <span class="text-sm font-medium">{{ event.type || 'N/A' }}</span>
                </div>
                <div>
                  <span class="text-[10px] text-muted block uppercase font-bold">Distance</span>
                  <span class="text-sm font-medium">{{
                    event.distance ? `${event.distance} km` : 'N/A'
                  }}</span>
                </div>
                <div>
                  <span class="text-[10px] text-muted block uppercase font-bold">Elevation</span>
                  <span class="text-sm font-medium">{{
                    event.elevation ? `${event.elevation} m` : 'N/A'
                  }}</span>
                </div>
              </div>
            </div>
            <p class="text-xs text-muted italic px-1">
              Note: The goal encompasses all events listed above. To add or remove events, go back
              to the previous step.
            </p>
          </div>
        </template>

        <!-- Body Composition/Performance/Consistency fields omitted for brevity but should be kept in final -->
        <template v-if="selectedType !== 'EVENT'">
          <!-- Keep existing fields from GoalWizard for these types -->
          <div v-if="selectedType === 'BODY_COMPOSITION'" class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <UFormField label="Start Weight">
                <UInputNumber v-model="form.startValue" size="lg" />
              </UFormField>
              <UFormField label="Target Weight">
                <UInputNumber v-model="form.targetValue" size="lg" />
              </UFormField>
            </div>
            <UFormField label="Target Date">
              <UInput v-model="form.targetDate" type="date" size="lg" />
            </UFormField>
          </div>
          <!-- ... other types ... -->
        </template>

        <div class="pt-6 flex justify-end">
          <UButton
            v-if="hideApproach"
            size="xl"
            color="primary"
            :loading="saving"
            icon="i-heroicons-check"
            class="px-8"
            @click="saveGoal"
          >
            {{ isEditMode ? 'Update Goal' : 'Create Goal' }}
          </UButton>
          <UButton
            v-else
            size="xl"
            color="primary"
            icon="i-heroicons-arrow-right"
            class="px-8"
            @click="step = 4"
          >
            Next: Training Approach
          </UButton>
        </div>
      </div>
    </div>

    <!-- Step 4: Goal Priority -->
    <div v-else-if="step === 4" class="space-y-6">
      <div class="flex items-center gap-3 mb-6">
        <UButton icon="i-heroicons-arrow-left" variant="ghost" size="sm" @click="step = 3" />
        <h3 class="text-xl font-semibold">Goal Priority</h3>
      </div>

      <div class="space-y-4">
        <div
          class="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg text-sm text-gray-600 dark:text-gray-400"
        >
          Set the priority of this goal to help the AI balance your training load if you have
          multiple overlapping goals.
        </div>

        <div>
          <label class="text-sm font-medium mb-3 block">Priority Level</label>
          <div class="grid grid-cols-1 gap-3">
            <button
              v-for="p in priorityOptions"
              :key="p.value"
              class="p-4 rounded-lg border-2 text-left transition-all flex items-center gap-4"
              :class="
                form.priority === p.value
                  ? 'border-primary bg-primary/5 dark:bg-primary/10'
                  : 'border-gray-200 dark:border-gray-800 hover:border-primary/50'
              "
              @click="form.priority = p.value"
            >
              <div class="p-2 rounded bg-gray-100 dark:bg-gray-800" :class="p.color">
                <UIcon :name="p.icon" class="w-5 h-5" />
              </div>
              <div class="flex-1">
                <div class="font-semibold">{{ p.label }}</div>
                <div class="text-sm text-muted">{{ p.description }}</div>
              </div>
              <UIcon
                v-if="form.priority === p.value"
                name="i-heroicons-check-circle"
                class="w-6 h-6 text-primary"
              />
            </button>
          </div>
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
    hideApproach?: boolean
  }>()

  const emit = defineEmits(['close', 'created', 'updated'])
  const { formatDate, getUserLocalDate, timezone } = useFormat()

  const isEditMode = computed(() => !!props.goal)
  const step = ref(1)
  const selectedType = ref('')
  const eventSource = ref('manual') // 'manual' or 'calendar'
  const userEvents = ref<any[]>([])
  const loadingEvents = ref(false)
  const saving = ref(false)

  const form = reactive({
    title: '',
    description: '',
    priority: 'MEDIUM',
    startValue: undefined as number | undefined,
    targetValue: undefined as number | undefined,
    targetDate: undefined as string | undefined,
    eventDate: undefined as string | undefined,
    eventType: 'Road Race',
    distance: undefined as number | undefined,
    elevation: undefined as number | undefined,
    expectedDuration: undefined as number | undefined,
    terrain: 'Rolling',
    phase: 'BASE',
    metric: '',
    eventId: undefined as string | undefined,
    eventIds: [] as string[],
    externalId: undefined as string | undefined,
    source: undefined as string | undefined
  })

  const goalTypes = [
    {
      id: 'EVENT',
      label: 'Event Preparation',
      description: 'Prepare for a specific race or event.',
      icon: 'i-heroicons-calendar',
      color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30'
    },
    {
      id: 'BODY_COMPOSITION',
      label: 'Body Composition',
      description: 'Lose weight, gain muscle, or maintain.',
      icon: 'i-heroicons-scale',
      color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30'
    },
    {
      id: 'PERFORMANCE',
      label: 'Performance',
      description: 'Improve FTP, VO2 Max, or pace.',
      icon: 'i-heroicons-bolt',
      color: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30'
    },
    {
      id: 'CONSISTENCY',
      label: 'Consistency',
      description: 'Build habits like weekly hours or frequency.',
      icon: 'i-heroicons-arrow-path',
      color: 'bg-green-100 text-green-600 dark:bg-green-900/30'
    }
  ]

  const eventSubTypes = [
    'Road Race',
    'Criterium',
    'Time Trial',
    'Gran Fondo',
    'MTB (XC)',
    'MTB (Marathon)',
    'Gravel',
    'Cyclocross',
    'Running (5k)',
    'Running (10k)',
    'Half Marathon',
    'Marathon',
    'Ultra',
    'Triathlon (Sprint)',
    'Triathlon (Olympic)',
    'Triathlon (70.3)',
    'Triathlon (Full)'
  ]

  const priorityOptions = [
    {
      value: 'HIGH',
      label: 'High Priority',
      description: 'This goal takes precedence over others in your training plan.',
      icon: 'i-heroicons-arrow-up',
      color: 'text-red-500'
    },
    {
      value: 'MEDIUM',
      label: 'Medium Priority',
      description: 'Important, but balanced with other objectives.',
      icon: 'i-heroicons-minus',
      color: 'text-amber-500'
    },
    {
      value: 'LOW',
      label: 'Low Priority',
      description: 'Nice to have, but flexible if conflicts arise.',
      icon: 'i-heroicons-arrow-down',
      color: 'text-green-500'
    }
  ]

  const trainingPhases = [
    {
      id: 'BASE',
      label: 'Base',
      description: 'Build aerobic foundation and muscular endurance.',
      icon: 'i-heroicons-square-3-stack-3d'
    },
    {
      id: 'BUILD',
      label: 'Build',
      description: 'Raise FTP and improve specific race intensities.',
      icon: 'i-heroicons-chart-bar'
    },
    {
      id: 'SPECIALTY',
      label: 'Specialty / Peak',
      description: 'Maximum specificity and race simulation.',
      icon: 'i-heroicons-sparkles'
    },
    {
      id: 'TRANSITION',
      label: 'Transition',
      description: 'Unstructured maintenance and recovery.',
      icon: 'i-heroicons-sun'
    }
  ]

  const selectedTypeLabel = computed(
    () => goalTypes.find((t) => t.id === selectedType.value)?.label || ''
  )

  const selectedEvents = computed(() => {
    return userEvents.value.filter((e) => form.eventIds.includes(e.id))
  })

  const phaseRecommendation = computed(() => {
    if (!form.eventDate) return "We'll suggest a phase once you set an event date."

    const today = getUserLocalDate()
    const event = new Date(form.eventDate)
    const weeksToEvent = Math.ceil((event.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 7))

    if (weeksToEvent > 12)
      return `You have ${weeksToEvent} weeks. We recommend starting with a **Base Phase**.`
    if (weeksToEvent > 4)
      return `You have ${weeksToEvent} weeks. We recommend moving into the **Build Phase**.`
    if (weeksToEvent > 0)
      return `Race is only ${weeksToEvent} weeks away! Time for **Specialty and Peak** work.`
    return 'The event date has already passed.'
  })

  async function fetchUserEvents() {
    eventSource.value = 'calendar'
    loadingEvents.value = true
    try {
      const data: any[] = await $fetch('/api/events')
      userEvents.value = data
    } catch (error) {
      console.error('Failed to fetch events', error)
    } finally {
      loadingEvents.value = false
    }
  }

  function toggleUserEvent(event: any) {
    const index = form.eventIds.indexOf(event.id)
    if (index === -1) {
      form.eventIds.push(event.id)
    } else {
      form.eventIds.splice(index, 1)
    }

    // Update form details based on the LAST selected event (as primary)
    if (form.eventIds.length > 0) {
      const lastId = form.eventIds[form.eventIds.length - 1]
      const primaryEvent = userEvents.value.find((e) => e.id === lastId)

      if (primaryEvent) {
        // If multiple, maybe generic title?
        if (form.eventIds.length > 1) {
          form.title = `${primaryEvent.title} and others`
        } else {
          form.title = primaryEvent.title
        }

        form.eventDate = new Date(primaryEvent.date).toISOString().split('T')[0]
        form.description = primaryEvent.description || ''
        form.eventId = primaryEvent.id // Keep for compat

        if (primaryEvent.distance) form.distance = primaryEvent.distance
        if (primaryEvent.elevation) form.elevation = primaryEvent.elevation
        if (primaryEvent.expectedDuration) form.expectedDuration = primaryEvent.expectedDuration
        if (primaryEvent.type) form.eventType = primaryEvent.type
        if (primaryEvent.terrain) form.terrain = primaryEvent.terrain
      }
    } else {
      // Reset if empty
      form.eventId = undefined
      form.title = ''
    }
  }

  function selectType(id: string) {
    selectedType.value = id
    if (id === 'EVENT') {
      step.value = 2
      fetchUserEvents()
    } else {
      step.value = 3
    }
  }

  async function saveGoal() {
    saving.value = true

    // Construct AI Context
    let aiContext = `Type: ${selectedType.value}. Goal: ${form.title}. Phase Preference: ${form.phase}.`
    if (selectedType.value === 'EVENT') {
      aiContext += ` Race Type: ${form.eventType}. Distance: ${form.distance}km. Elevation: ${form.elevation}m. Terrain: ${form.terrain}. Expected Duration: ${form.expectedDuration}h.`
    }

    // Construct Payload
    const payload: any = {
      title: form.title,
      description: form.description,
      priority: form.priority,
      startValue: form.startValue,
      targetValue: form.targetValue,
      type: selectedType.value,
      aiContext,
      metric: form.metric,
      phase: form.phase,
      eventId: form.eventId,
      eventIds: form.eventIds
    }

    // Handle Event Specifics
    if (selectedType.value === 'EVENT') {
      const isoDate = form.eventDate
        ? new Date(form.eventDate + 'T00:00:00').toISOString()
        : undefined
      payload.eventDate = isoDate
      payload.eventType = form.eventType
      payload.distance = form.distance
      payload.elevation = form.elevation
      payload.duration = form.expectedDuration
      payload.terrain = form.terrain
      payload.targetDate = isoDate

      // If no existing event was selected, we can still create one via eventData
      if (!form.eventId && (form.externalId || form.eventDate)) {
        payload.eventData = {
          externalId: form.externalId,
          source: form.source,
          title: form.title,
          date: isoDate,
          subType: form.eventType,
          distance: form.distance,
          elevation: form.elevation,
          expectedDuration: form.expectedDuration,
          terrain: form.terrain
        }
      }
    } else {
      payload.targetDate = form.targetDate
        ? new Date(form.targetDate + 'T23:59:59').toISOString()
        : undefined
    }

    try {
      if (isEditMode.value) {
        await $fetch(`/api/goals/${props.goal.id}`, { method: 'PATCH', body: payload })
        emit('updated')
      } else {
        await $fetch('/api/goals', { method: 'POST', body: payload })
        emit('created')
      }
      emit('close')
    } catch (error) {
      console.error('Failed to save goal', error)
    } finally {
      saving.value = false
    }
  }

  watchEffect(() => {
    if (props.goal) {
      selectedType.value = props.goal.type
      form.title = props.goal.title || ''
      form.description = props.goal.description || ''
      form.priority = props.goal.priority || 'MEDIUM'
      form.startValue = props.goal.startValue
      form.targetValue = props.goal.targetValue
      // Use format to get local date string YYYY-MM-DD from absolute date
      form.targetDate = props.goal.targetDate
        ? formatDate(props.goal.targetDate, 'yyyy-MM-dd')
        : undefined
      form.eventDate = props.goal.eventDate
        ? formatDate(props.goal.eventDate, 'yyyy-MM-dd')
        : undefined
      form.eventType = props.goal.eventType || 'Road Race'
      form.distance = props.goal.distance
      form.elevation = props.goal.elevation
      form.expectedDuration = props.goal.duration
      form.terrain = props.goal.terrain || 'Rolling'
      form.phase = props.goal.phase || 'BASE'
      form.eventId = props.goal.eventId
      form.eventIds =
        props.goal.events?.map((e: any) => e.id) || (props.goal.eventId ? [props.goal.eventId] : []) // Note: events relation usually returns Event objects with id, not join table with eventId

      if (selectedType.value === 'EVENT') {
        fetchUserEvents()
      }
      step.value = 3
    }
  })
</script>
