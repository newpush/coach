<template>
  <UForm :state="state" :schema="schema" class="space-y-6" @submit="onSubmit">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Title & Type -->
      <UFormField label="Event Title" name="title" required>
        <UInput v-model="state.title" placeholder="e.g. London Marathon" class="w-full" />
      </UFormField>

      <UFormField label="Event Type" name="type">
        <USelect
          v-model="state.type"
          :items="typeOptions"
          placeholder="Select type"
          class="w-full"
        />
      </UFormField>

      <UFormField label="Sub-Type" name="subType">
        <USelect
          v-model="state.subType"
          :items="subTypeOptions"
          placeholder="Select sub-type"
          class="w-full"
        />
      </UFormField>

      <!-- Date & Priority -->
      <UFormField label="Date" name="date" required>
        <UInput v-model="state.date" type="date" class="w-full" />
      </UFormField>

      <UFormField label="Start Time" name="startTime">
        <UInput v-model="state.startTime" type="time" class="w-full" />
      </UFormField>

      <UFormField label="Race Priority" name="priority">
        <USelect
          v-model="state.priority"
          :items="priorityOptions"
          class="w-full"
        />
      </UFormField>

      <!-- Location -->
      <UFormField label="City" name="city">
        <UInput v-model="state.city" placeholder="e.g. London" class="w-full" />
      </UFormField>

      <UFormField label="Country" name="country">
        <UInput v-model="state.country" placeholder="e.g. United Kingdom" class="w-full" />
      </UFormField>

      <UFormField label="Location/Venue" name="location">
        <UInput v-model="state.location" placeholder="e.g. Greenwich Park" class="w-full" />
      </UFormField>

      <UFormField label="Website URL" name="websiteUrl">
        <UInput v-model="state.websiteUrl" placeholder="https://..." class="w-full" />
      </UFormField>

      <!-- Options -->
      <div class="flex items-center gap-6 pt-4">
        <UCheckbox v-model="state.isVirtual" label="Virtual Event" />
        <UCheckbox v-model="state.isPublic" label="Public Event" />
      </div>
    </div>

    <!-- Description -->
    <UFormField label="Description" name="description">
      <UTextarea v-model="state.description" placeholder="Additional details about the event..." class="w-full" />
    </UFormField>

    <!-- Course Profile -->
    <div class="space-y-4">
      <h4 class="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight">Course Profile</h4>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
        <UFormField label="Distance (km)" name="distance">
          <UInputNumber v-model="state.distance" placeholder="138" class="w-full" />
        </UFormField>

        <UFormField label="Elevation (m)" name="elevation">
          <UInputNumber v-model="state.elevation" placeholder="4230" class="w-full" />
        </UFormField>

        <UFormField label="Duration (h)" name="expectedDuration">
          <UInputNumber v-model="state.expectedDuration" placeholder="6.5" :step="0.1" class="w-full" />
        </UFormField>

        <UFormField label="Terrain" name="terrain">
          <USelect
            v-model="state.terrain"
            :items="['Flat', 'Rolling', 'Hilly', 'Mountainous', 'Technical']"
            class="w-full"
          />
        </UFormField>
      </div>
    </div>

    <!-- Goals Link -->
    <UFormField label="Link to Goals" name="goalIds">
      <USelect
        v-model="state.goalIds"
        :items="goalOptions"
        multiple
        placeholder="Select goals to link"
        class="w-full"
      />
    </UFormField>

    <div class="flex justify-end gap-3 pt-4">
      <UButton
        label="Cancel"
        color="neutral"
        variant="ghost"
        @click="$emit('cancel')"
      />
      <UButton
        type="submit"
        :label="isEditing ? 'Update Event' : 'Create Event'"
        color="primary"
        :loading="loading"
      />
    </div>
  </UForm>
</template>

<script setup lang="ts">
import { z } from 'zod'

const props = defineProps<{
  initialData?: any
}>()

const emit = defineEmits(['success', 'cancel'])

const loading = ref(false)
const toast = useToast()

const state = reactive({
  title: '',
  description: '',
  date: new Date().toISOString().split('T')[0],
  startTime: '',
  type: 'Run',
  subType: '',
  priority: 'B',
  city: '',
  country: '',
  location: '',
  websiteUrl: '',
  distance: undefined as number | undefined,
  elevation: undefined as number | undefined,
  expectedDuration: undefined as number | undefined,
  terrain: 'Rolling',
  isVirtual: false,
  isPublic: false,
  goalIds: [] as string[]
})

const isEditing = computed(() => !!props.initialData)

// Populate state when initialData changes
watch(() => props.initialData, (newData) => {
  if (newData) {
    state.title = newData.title || ''
    state.description = newData.description || ''
    state.date = newData.date ? new Date(newData.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
    state.startTime = newData.startTime || ''
    state.type = newData.type || 'Run'
    state.subType = newData.subType || ''
    state.priority = newData.priority || 'B'
    state.city = newData.city || ''
    state.country = newData.country || ''
    state.location = newData.location || ''
    state.websiteUrl = newData.websiteUrl || ''
    state.distance = newData.distance
    state.elevation = newData.elevation
    state.expectedDuration = newData.expectedDuration
    state.terrain = newData.terrain || 'Rolling'
    state.isVirtual = newData.isVirtual || false
    state.isPublic = newData.isPublic || false
    // Handle goals if they come as objects
    state.goalIds = newData.goals ? newData.goals.map((g: any) => g.goalId || g) : []
  } else {
    // Reset to defaults
    state.title = ''
    state.description = ''
    state.date = new Date().toISOString().split('T')[0]
    state.startTime = ''
    state.type = 'Run'
    state.subType = ''
    state.priority = 'B'
    state.city = ''
    state.country = ''
    state.location = ''
    state.websiteUrl = ''
    state.distance = undefined
    state.elevation = undefined
    state.expectedDuration = undefined
    state.terrain = 'Rolling'
    state.isVirtual = false
    state.isPublic = false
    state.goalIds = []
  }
}, { immediate: true })

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  date: z.string().min(1, 'Date is required'),
  websiteUrl: z.string().url('Must be a valid URL').optional().or(z.literal(''))
})

const typeOptions = [
  { label: 'Run', value: 'Run' },
  { label: 'Ride', value: 'Ride' },
  { label: 'Swim', value: 'Swim' },
  { label: 'Triathlon', value: 'Triathlon' },
  { label: 'Other', value: 'Other' }
]

const subTypesByMainType: Record<string, { label: string, value: string }[]> = {
  'Run': [
    { label: 'Running (5k)', value: 'Running (5k)' },
    { label: 'Running (10k)', value: 'Running (10k)' },
    { label: 'Half Marathon', value: 'Half Marathon' },
    { label: 'Marathon', value: 'Marathon' },
    { label: 'Ultra', value: 'Ultra' },
    { label: 'Trail Run', value: 'Trail Run' }
  ],
  'Ride': [
    { label: 'Road Race', value: 'Road Race' },
    { label: 'Criterium', value: 'Criterium' },
    { label: 'Time Trial', value: 'Time Trial' },
    { label: 'Gran Fondo', value: 'Gran Fondo' },
    { label: 'MTB (XC)', value: 'MTB (XC)' },
    { label: 'MTB (Marathon)', value: 'MTB (Marathon)' },
    { label: 'Gravel', value: 'Gravel' },
    { label: 'Cyclocross', value: 'Cyclocross' }
  ],
  'Swim': [
    { label: 'Pool Race', value: 'Pool Race' },
    { label: 'Open Water', value: 'Open Water' }
  ],
  'Triathlon': [
    { label: 'Triathlon (Sprint)', value: 'Triathlon (Sprint)' },
    { label: 'Triathlon (Olympic)', value: 'Triathlon (Olympic)' },
    { label: 'Triathlon (70.3)', value: 'Triathlon (70.3)' },
    { label: 'Triathlon (Full)', value: 'Triathlon (Full)' },
    { label: 'Duathlon', value: 'Duathlon' },
    { label: 'Aquathlon', value: 'Aquathlon' }
  ],
  'Other': [
    { label: 'Other', value: 'Other' }
  ]
}

const subTypeOptions = computed(() => {
  return subTypesByMainType[state.type] || subTypesByMainType['Other']
})

// Watch type change to reset subType if not compatible
watch(() => state.type, (newType) => {
  // Only reset if not editing or if type actually changed by user interaction
  // We check if current subType is valid for new type
  const options = subTypesByMainType[newType] || []
  if (!options.find(o => o.value === state.subType)) {
    state.subType = options[0]?.value || ''
  }
})

const priorityOptions = [
  { label: 'A Race (Main Goal)', value: 'A' },
  { label: 'B Race (Preparation)', value: 'B' },
  { label: 'C Race (Training)', value: 'C' }
]

const goalOptions = ref<{ label: string, value: string }[]>([])

async function fetchGoals() {
  try {
    const goals = await $fetch<any[]>('/api/profile/goals')
    goalOptions.value = goals.map(g => ({
      label: g.title,
      value: g.id
    }))
  } catch (error) {
    console.error('Error fetching goals:', error)
  }
}

async function onSubmit() {
  loading.value = true
  try {
    const eventDate = state.date ? new Date(state.date).toISOString() : new Date().toISOString()
    const payload = {
      ...state,
      date: eventDate
    }

    if (isEditing.value && props.initialData?.id) {
      await $fetch(`/api/events/${props.initialData.id}`, {
        method: 'PUT',
        body: payload
      })
    } else {
      await $fetch('/api/events', {
        method: 'POST',
        body: payload
      })
    }
    emit('success')
  } catch (error: any) {
    console.error('Error saving event:', error)
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to save event',
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchGoals()
})
</script>
