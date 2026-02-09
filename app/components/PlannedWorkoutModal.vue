<template>
  <UModal
    v-model:open="isOpen"
    :dismissible="!loading"
    title="Planned Workout"
    :close="loading ? false : undefined"
  >
    <!-- Hidden trigger - modal is controlled programmatically -->
    <span class="hidden" />

    <template #body>
      <div v-if="plannedWorkout" class="space-y-4">
        <!-- Workout Details -->
        <div>
          <h4 class="font-semibold text-sm text-gray-500 dark:text-gray-400 mb-2">Details</h4>
          <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
            <div class="flex justify-between">
              <span class="text-sm text-gray-600 dark:text-gray-400">Title:</span>
              <span class="text-sm font-medium">{{ plannedWorkout.title }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-sm text-gray-600 dark:text-gray-400">Type:</span>
              <span class="text-sm font-medium">{{ plannedWorkout.type || 'N/A' }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-sm text-gray-600 dark:text-gray-400">Date:</span>
              <span class="text-sm font-medium">{{
                formatDateUTC(plannedWorkout.date, 'EEEE, MMMM d, yyyy')
              }}</span>
            </div>
            <div v-if="plannedWorkout.durationSec" class="flex justify-between">
              <span class="text-sm text-gray-600 dark:text-gray-400">Duration:</span>
              <span class="text-sm font-medium">{{
                formatDuration(plannedWorkout.durationSec)
              }}</span>
            </div>
            <div v-if="plannedWorkout.distanceMeters" class="flex justify-between">
              <span class="text-sm text-gray-600 dark:text-gray-400">Distance:</span>
              <span class="text-sm font-medium"
                >{{ (plannedWorkout.distanceMeters / 1000).toFixed(2) }} km</span
              >
            </div>
            <div v-if="plannedWorkout.tss" class="flex justify-between">
              <span class="text-sm text-gray-600 dark:text-gray-400">TSS:</span>
              <span class="text-sm font-medium">{{ Math.round(plannedWorkout.tss) }}</span>
            </div>
            <div
              class="flex justify-between items-center pt-2 mt-2 border-t border-gray-100 dark:border-gray-700"
            >
              <span class="text-sm text-gray-600 dark:text-gray-400">Fueling Strategy:</span>
              <USelectMenu
                v-model="fuelingStrategy"
                :items="fuelingStrategies"
                value-key="value"
                size="xs"
                variant="none"
                class="min-w-[120px] text-right"
                :ui="{
                  base: 'text-primary-600 dark:text-primary-400 font-bold hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md px-2 py-1 transition-colors'
                }"
                :loading="updatingStrategy"
              />
            </div>
          </div>
        </div>

        <!-- Description -->
        <div v-if="plannedWorkout.description">
          <h4 class="font-semibold text-sm text-gray-500 dark:text-gray-400 mb-2">Description</h4>
          <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {{ plannedWorkout.description }}
            </p>
          </div>
        </div>

        <!-- Coach Instructions -->
        <div
          v-if="plannedWorkout.structuredWorkout?.coachInstructions"
          class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-100 dark:border-blue-800"
        >
          <div class="flex items-start gap-3">
            <div class="p-2 bg-blue-100 dark:bg-blue-800 rounded-full">
              <UIcon
                name="i-heroicons-chat-bubble-bottom-center-text"
                class="w-5 h-5 text-blue-600 dark:text-blue-300"
              />
            </div>
            <div>
              <h4 class="font-semibold text-sm text-blue-900 dark:text-blue-100">Coach's Advice</h4>
              <p class="text-sm text-blue-800 dark:text-blue-200 mt-1 italic">
                "{{ plannedWorkout.structuredWorkout.coachInstructions }}"
              </p>
            </div>
          </div>
        </div>

        <!-- Workout Visualization -->
        <div
          v-if="plannedWorkout.structuredWorkout"
          class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700"
        >
          <div class="flex justify-between items-center mb-2">
            <h4 class="font-semibold text-sm text-gray-500 dark:text-gray-400">
              Workout Structure
            </h4>
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-heroicons-arrow-path"
              :loading="generating"
              @click="generateStructure"
            >
              Regenerate
            </UButton>
          </div>
          <WorkoutRunChart
            v-if="isRunWorkout"
            :workout="plannedWorkout.structuredWorkout"
            :preference="preference"
          />
          <WorkoutChart v-else :workout="plannedWorkout.structuredWorkout" :user-ftp="userFtp" />
        </div>

        <!-- Coaching Messages Timeline -->
        <div
          v-if="plannedWorkout.structuredWorkout?.messages?.length"
          class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700"
        >
          <WorkoutMessagesTimeline :workout="plannedWorkout.structuredWorkout" />
        </div>

        <!-- Status Badge -->
        <div v-if="plannedWorkout.completed" class="flex items-center gap-2">
          <UBadge color="success" variant="subtle">
            <UIcon name="i-heroicons-check-circle" class="w-4 h-4" />
            <span class="ml-1">Completed</span>
          </UBadge>
        </div>

        <!-- Mark Complete Section -->
        <div v-if="!plannedWorkout.completed && !showWorkoutSelector" class="flex flex-col gap-2">
          <UButton
            color="success"
            block
            :loading="loading"
            @click="confirmMarkCompleteWithoutActivity"
          >
            <UIcon name="i-heroicons-check" class="w-4 h-4" />
            Mark as Done (No Activity)
          </UButton>

          <UButton
            color="primary"
            variant="outline"
            block
            :loading="loading"
            @click="showWorkoutSelector = true"
          >
            <UIcon name="i-heroicons-link" class="w-4 h-4" />
            Link to Activity
          </UButton>
        </div>

        <!-- Workout Selector -->
        <div v-if="showWorkoutSelector && !plannedWorkout.completed" class="space-y-3">
          <div>
            <h4 class="font-semibold text-sm text-gray-500 dark:text-gray-400 mb-2">
              Select Completed Workout
            </h4>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Choose which workout on
              {{ formatDateUTC(plannedWorkout.date, 'EEEE, MMMM d, yyyy') }} completed this plan
            </p>
          </div>

          <!-- Loading State -->
          <div v-if="loadingWorkouts" class="flex items-center justify-center py-4">
            <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin" />
            <span class="ml-2 text-sm text-gray-500">Loading workouts...</span>
          </div>

          <!-- No Workouts -->
          <div v-else-if="availableWorkouts.length === 0" class="text-center py-4">
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-3">
              No workouts found for this date.
            </p>
            <div class="flex gap-2 justify-center">
              <UButton color="primary" size="sm" @click="showManualEntry = true">
                Create Manual Entry
              </UButton>
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                @click="showWorkoutSelector = false"
              >
                Cancel
              </UButton>
            </div>
          </div>

          <!-- Workout List -->
          <div v-else class="space-y-2 max-h-64 overflow-y-auto">
            <button
              v-for="workout in availableWorkouts"
              :key="workout.id"
              :disabled="loading"
              class="w-full text-left p-3 rounded-lg border-2 transition-colors"
              :class="[
                selectedWorkoutId === workout.id
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
                loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              ]"
              @click="selectWorkout(workout.id)"
            >
              <div class="flex items-start justify-between">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <UIcon :name="getActivityIcon(workout.type)" class="w-4 h-4 flex-shrink-0" />
                    <span class="text-sm font-medium truncate">{{ workout.title }}</span>
                    <UBadge
                      v-if="workout.plannedWorkoutId"
                      color="primary"
                      variant="subtle"
                      size="xs"
                    >
                      Already linked
                    </UBadge>
                  </div>
                  <div class="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <span v-if="workout.durationSec">{{
                      formatDuration(workout.durationSec)
                    }}</span>
                    <span v-if="workout.distanceMeters"
                      >{{ (workout.distanceMeters / 1000).toFixed(1) }} km</span
                    >
                    <span v-if="workout.tss">{{ Math.round(workout.tss) }} TSS</span>
                  </div>
                </div>
                <div v-if="selectedWorkoutId === workout.id" class="ml-2">
                  <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-green-500" />
                </div>
              </div>
            </button>
          </div>

          <!-- Action Buttons -->
          <div v-if="availableWorkouts.length > 0" class="flex gap-2 pt-2">
            <UButton
              color="success"
              :disabled="!selectedWorkoutId"
              :loading="loading"
              class="flex-1"
              @click="markComplete"
            >
              Confirm Complete
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              :disabled="loading"
              @click="showWorkoutSelector = false"
            >
              Cancel
            </UButton>
          </div>

          <!-- Or Create Manual Entry -->
          <div v-if="availableWorkouts.length > 0" class="relative">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-gray-200 dark:border-gray-700" />
            </div>
            <div class="relative flex justify-center text-xs">
              <span class="bg-white dark:bg-gray-900 px-2 text-gray-500">or</span>
            </div>
          </div>

          <UButton
            v-if="availableWorkouts.length > 0"
            color="neutral"
            variant="outline"
            size="sm"
            block
            :disabled="loading"
            @click="showManualEntry = true"
          >
            Create Manual Entry Instead
          </UButton>
        </div>

        <!-- Manual Workout Entry Form -->
        <div v-if="showManualEntry" class="space-y-3">
          <div class="flex items-center justify-between mb-2">
            <h4 class="font-semibold text-sm text-gray-500 dark:text-gray-400">
              Create Manual Workout
            </h4>
            <UButton color="neutral" variant="ghost" size="xs" @click="showManualEntry = false">
              Back
            </UButton>
          </div>

          <div class="space-y-2">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Title <span class="text-red-500">*</span>
            </label>
            <UInput v-model="manualWorkout.title" placeholder="e.g., Morning Run" />
          </div>

          <div class="space-y-2">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Duration (minutes) <span class="text-red-500">*</span>
            </label>
            <UInput v-model="manualWorkout.durationMinutes" type="number" placeholder="60" />
          </div>

          <div class="space-y-2">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Distance (km)
            </label>
            <UInput
              v-model="manualWorkout.distanceKm"
              type="number"
              step="0.1"
              placeholder="10.5"
            />
          </div>

          <div class="space-y-2">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              TSS / Load
            </label>
            <UInput v-model="manualWorkout.tss" type="number" placeholder="85" />
          </div>

          <div class="space-y-2">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              RPE (1-10)
            </label>
            <UInput v-model="manualWorkout.rpe" type="number" min="1" max="10" placeholder="7" />
          </div>

          <div class="space-y-2">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Notes
            </label>
            <UTextarea
              v-model="manualWorkout.description"
              placeholder="How did it feel?"
              :rows="3"
            />
          </div>

          <div class="flex gap-2 pt-2">
            <UButton
              color="success"
              :disabled="!isManualWorkoutValid"
              :loading="loading"
              class="flex-1"
              @click="createManualWorkout"
            >
              Create & Mark Complete
            </UButton>
            <UButton color="neutral" variant="ghost" :disabled="loading" @click="cancelManualEntry">
              Cancel
            </UButton>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-between gap-2 w-full">
        <UButton
          v-if="!plannedWorkout?.completed"
          color="error"
          variant="ghost"
          :loading="loading"
          @click="confirmDelete"
        >
          <UIcon name="i-heroicons-trash" class="w-4 h-4" />
          Delete
        </UButton>
        <div class="flex-1" />
        <div class="flex gap-2">
          <UButton v-if="plannedWorkout" color="primary" @click="viewFullPlannedWorkout">
            View Details
          </UButton>
          <UButton color="neutral" variant="ghost" :disabled="loading" @click="closeModal">
            Close
          </UButton>
        </div>
      </div>
    </template>
  </UModal>

  <!-- Confirm Mark Complete Modal -->
  <UModal
    v-model:open="showMarkCompleteConfirm"
    title="Mark as Done"
    description="Are you sure you want to mark this as done without linking an activity?"
  >
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="showMarkCompleteConfirm = false">
          Cancel
        </UButton>
        <UButton color="success" :loading="loading" @click="executeMarkCompleteWithoutActivity">
          Confirm
        </UButton>
      </div>
    </template>
  </UModal>

  <!-- Delete Confirmation Modal -->
  <UModal
    v-model:open="showDeleteConfirm"
    title="Delete Planned Workout"
    description="Are you sure you want to delete this planned workout?"
  >
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="showDeleteConfirm = false">
          Cancel
        </UButton>
        <UButton color="error" :loading="loading" @click="executeDelete"> Delete </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
  import WorkoutChart from '~/components/workouts/WorkoutChart.vue'
  import WorkoutRunChart from '~/components/workouts/WorkoutRunChart.vue'
  import WorkoutMessagesTimeline from '~/components/workouts/WorkoutMessagesTimeline.vue'
  import { getSportSettingsForActivity, getPreferredMetric } from '~/utils/sportSettings'

  const { formatDate, formatDateUTC } = useFormat()
  const toast = useToast()

  const props = defineProps<{
    plannedWorkout: any | null
    modelValue: boolean
    userFtp?: number
    allSportSettings?: any[]
  }>()

  const emit = defineEmits<{
    'update:modelValue': [value: boolean]
    completed: []
    deleted: []
  }>()

  const isOpen = computed({
    get: () => props.modelValue,
    set: (value) => emit('update:modelValue', value)
  })

  const loading = ref(false)
  const showWorkoutSelector = ref(false)
  const selectedWorkoutId = ref<string | null>(null)
  const availableWorkouts = ref<any[]>([])
  const loadingWorkouts = ref(false)
  const generating = ref(false)
  const updatingStrategy = ref(false)
  const showManualEntry = ref(false)

  const fuelingStrategies = [
    { label: 'Standard', value: 'STANDARD' },
    { label: 'Train Low', value: 'TRAIN_LOW' },
    { label: 'High Carb', value: 'HIGH_CARB' }
  ]

  const fuelingStrategy = computed({
    get: () => props.plannedWorkout?.fuelingStrategy || 'STANDARD',
    set: async (val) => {
      if (!props.plannedWorkout || val === props.plannedWorkout.fuelingStrategy) return

      updatingStrategy.value = true
      try {
        await $fetch(`/api/planned-workouts/${props.plannedWorkout.id}`, {
          method: 'PATCH',
          body: { fuelingStrategy: val }
        })

        toast.add({
          title: 'Strategy Updated',
          description: `Fueling set to ${val.replace('_', ' ')}. AI will regenerate your plan.`,
          color: 'success'
        })

        emit('completed') // Trigger refresh
      } catch (error: any) {
        toast.add({
          title: 'Update Failed',
          description: error?.data?.message || 'Failed to update strategy',
          color: 'error'
        })
      } finally {
        updatingStrategy.value = false
      }
    }
  })

  const showDeleteConfirm = ref(false)
  const showMarkCompleteConfirm = ref(false)

  const isRunWorkout = computed(() => props.plannedWorkout?.type?.toLowerCase().includes('run'))
  const isRideWorkout = computed(
    () =>
      props.plannedWorkout?.type?.toLowerCase().includes('ride') ||
      props.plannedWorkout?.type?.toLowerCase().includes('cycle')
  )

  const applicableSettings = computed(() => {
    if (!props.allSportSettings || !props.plannedWorkout) return null
    return getSportSettingsForActivity(props.allSportSettings, props.plannedWorkout.type)
  })

  const preference = computed(() => {
    if (!props.plannedWorkout?.structuredWorkout) return 'power'
    const hasHr = props.plannedWorkout.structuredWorkout.steps?.some((s: any) => s.heartRate)
    const hasPower = props.plannedWorkout.structuredWorkout.steps?.some((s: any) => s.power)

    return getPreferredMetric(applicableSettings.value, { hasHr, hasPower })
  })

  async function generateStructure() {
    if (!props.plannedWorkout) return

    generating.value = true
    try {
      await $fetch(`/api/planned-workouts/${props.plannedWorkout.id}/generate-structure`, {
        method: 'POST' as any
      })

      // Refresh planned workout data
      const updated = await $fetch(`/api/planned-workouts/${props.plannedWorkout.id}`)
      if (updated) {
        // We can't directly mutate props, so we might need a local copy or emit an event
        // For now, let's just refresh the parent
        emit('completed') // Using this to trigger refresh in parent
      }
    } catch (error: any) {
      console.error('Error generating workout structure:', error)
      toast.add({
        title: 'Generation Failed',
        description: error?.data?.message || 'Failed to generate structure',
        color: 'error',
        duration: 6000
      })
    } finally {
      generating.value = false
    }
  }

  const manualWorkout = ref({
    title: '',
    durationMinutes: '',
    distanceKm: '',
    tss: '',
    rpe: '',
    description: ''
  })

  const isManualWorkoutValid = computed(() => {
    return (
      manualWorkout.value.title.trim() !== '' &&
      manualWorkout.value.durationMinutes !== '' &&
      parseInt(manualWorkout.value.durationMinutes) > 0
    )
  })

  // Watch for workout selector opening
  watch(showWorkoutSelector, async (show) => {
    if (show && props.plannedWorkout) {
      await fetchAvailableWorkouts()
    }
  })

  // Reset state when modal closes
  watch(isOpen, (open) => {
    if (!open) {
      showWorkoutSelector.value = false
      selectedWorkoutId.value = null
      availableWorkouts.value = []
      showManualEntry.value = false
      showDeleteConfirm.value = false
      showMarkCompleteConfirm.value = false
      resetManualWorkout()
    }
  })

  function resetManualWorkout() {
    manualWorkout.value = {
      title: '',
      durationMinutes: '',
      distanceKm: '',
      tss: '',
      rpe: '',
      description: ''
    }
  }

  function cancelManualEntry() {
    showManualEntry.value = false
    showWorkoutSelector.value = true
    resetManualWorkout()
  }

  async function fetchAvailableWorkouts() {
    if (!props.plannedWorkout) return

    loadingWorkouts.value = true
    try {
      const date = new Date(props.plannedWorkout.date).toISOString().split('T')[0]
      const response = await $fetch(`/api/workouts/by-date?date=${date}`)
      availableWorkouts.value = response as any[]
    } catch (error) {
      console.error('Error fetching workouts:', error)
    } finally {
      loadingWorkouts.value = false
    }
  }

  function selectWorkout(workoutId: string) {
    selectedWorkoutId.value = workoutId
  }

  async function markComplete() {
    if (!selectedWorkoutId.value || !props.plannedWorkout) return

    loading.value = true
    try {
      await $fetch(`/api/planned-workouts/${props.plannedWorkout.id}/complete`, {
        method: 'POST',
        body: {
          workoutId: selectedWorkoutId.value
        }
      })

      emit('completed')
      closeModal()
    } catch (error: any) {
      console.error('Error marking complete:', error)
      toast.add({
        title: 'Error',
        description: error?.data?.message || 'Failed to mark workout complete',
        color: 'error'
      })
    } finally {
      loading.value = false
    }
  }

  function confirmMarkCompleteWithoutActivity() {
    if (!props.plannedWorkout) return
    showMarkCompleteConfirm.value = true
  }

  async function executeMarkCompleteWithoutActivity() {
    if (!props.plannedWorkout) return

    loading.value = true
    try {
      await $fetch(`/api/planned-workouts/${props.plannedWorkout.id}/complete`, {
        method: 'POST',
        body: {} // No workoutId
      })

      emit('completed')
      closeModal()
    } catch (error: any) {
      console.error('Error marking complete:', error)
      toast.add({
        title: 'Error',
        description: error?.data?.message || 'Failed to mark workout complete',
        color: 'error'
      })
    } finally {
      loading.value = false
      showMarkCompleteConfirm.value = false
    }
  }

  async function createManualWorkout() {
    if (!isManualWorkoutValid.value || !props.plannedWorkout) return

    loading.value = true
    try {
      const durationSec = parseInt(manualWorkout.value.durationMinutes) * 60
      const distanceMeters = manualWorkout.value.distanceKm
        ? parseFloat(manualWorkout.value.distanceKm) * 1000
        : null

      await $fetch('/api/workouts/manual', {
        method: 'POST',
        body: {
          title: manualWorkout.value.title,
          type: props.plannedWorkout.type || 'Activity',
          date: props.plannedWorkout.date,
          durationSec,
          distanceMeters,
          tss: manualWorkout.value.tss ? parseFloat(manualWorkout.value.tss) : null,
          rpe: manualWorkout.value.rpe ? parseInt(manualWorkout.value.rpe) : null,
          description: manualWorkout.value.description || null,
          plannedWorkoutId: props.plannedWorkout.id
        }
      })

      emit('completed')
      closeModal()
    } catch (error: any) {
      console.error('Error creating manual workout:', error)
      toast.add({
        title: 'Error',
        description: error?.data?.message || 'Failed to create manual workout',
        color: 'error'
      })
    } finally {
      loading.value = false
    }
  }

  function confirmDelete() {
    if (!props.plannedWorkout) return
    showDeleteConfirm.value = true
  }

  async function executeDelete() {
    if (!props.plannedWorkout) return

    loading.value = true
    try {
      await $fetch(`/api/planned-workouts/${props.plannedWorkout.id}`, {
        method: 'DELETE'
      })

      emit('deleted')
      closeModal()
    } catch (error: any) {
      console.error('Error deleting planned workout:', error)
      toast.add({
        title: 'Error',
        description: error?.data?.message || 'Failed to delete planned workout',
        color: 'error'
      })
    } finally {
      loading.value = false
      showDeleteConfirm.value = false
    }
  }

  function closeModal() {
    isOpen.value = false
  }

  function viewFullPlannedWorkout() {
    if (props.plannedWorkout?.id) {
      navigateTo(`/workouts/planned/${props.plannedWorkout.id}`)
    }
  }

  function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)

    if (h > 0) {
      return `${h}h ${m}m`
    }
    return `${m}m`
  }

  function getActivityIcon(type: string) {
    const t = (type || '').toLowerCase()
    if (t.includes('ride') || t.includes('cycle')) return 'i-heroicons-bolt'
    if (t.includes('run')) return 'i-heroicons-fire'
    if (t.includes('swim')) return 'i-heroicons-beaker'
    if (t.includes('weight') || t.includes('strength')) return 'i-heroicons-trophy'
    return 'i-heroicons-check-circle'
  }
</script>
