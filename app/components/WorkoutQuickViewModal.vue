<template>
  <UModal
    v-model:open="isOpen"
    title="Workout Overview"
    description="View detailed statistics for this workout"
  >
    <template #actions>
      <UButton
        color="error"
        variant="ghost"
        icon="i-heroicons-trash"
        size="sm"
        aria-label="Delete workout"
        @click="showDeleteConfirm = true"
      />
    </template>

    <!-- Hidden trigger - modal is controlled programmatically -->
    <span class="hidden" />

    <template #body>
      <div v-if="workout" class="space-y-6">
        <!-- Header Info -->
        <div class="flex items-start justify-between">
          <div>
            <h3 class="text-lg font-bold text-gray-900 dark:text-white">{{ workout.title }}</h3>
            <div class="flex items-center gap-2 mt-1 text-sm text-gray-500 dark:text-gray-400">
              <div class="flex items-center gap-1">
                <UIcon :name="getActivityIcon(workout.type)" class="w-4 h-4" />
                <span>{{ workout.type || 'Activity' }}</span>
              </div>
              <span>•</span>
              <span>{{ formatDateTime(workout.date) }}</span>
            </div>
          </div>
          <UBadge
            :color="workout.source === 'manual' ? 'warning' : 'neutral'"
            variant="subtle"
            size="xs"
          >
            {{ workout.source.toUpperCase() }}
          </UBadge>
        </div>

        <!-- Clean Stats Grid (Top Level) -->
        <div class="pt-2 pb-4">
          <dl class="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4">
            <div v-if="workout.durationSec">
              <dt
                class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                Duration
              </dt>
              <dd class="mt-1 text-sm font-bold text-gray-900 dark:text-white">
                {{ formatDuration(workout.durationSec) }}
              </dd>
            </div>

            <div v-if="workout.tss">
              <dt
                class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                TSS
              </dt>
              <dd class="mt-1 text-sm font-bold text-gray-900 dark:text-white">
                {{ Math.round(workout.tss) }}
              </dd>
            </div>

            <div v-if="workout.averageHr">
              <dt
                class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                Avg HR
              </dt>
              <dd
                class="mt-1 text-sm font-bold text-gray-900 dark:text-white flex items-baseline gap-1"
              >
                {{ workout.averageHr }}
                <span class="text-[10px] font-normal text-gray-500 uppercase">bpm</span>
              </dd>
            </div>

            <div v-if="workout.kilojoules">
              <dt
                class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                Work
              </dt>
              <dd
                class="mt-1 text-sm font-bold text-gray-900 dark:text-white flex items-baseline gap-1"
              >
                {{ workout.kilojoules }}
                <span class="text-[10px] font-normal text-gray-500 uppercase">kJ</span>
              </dd>
            </div>

            <div v-if="workout.distanceMeters">
              <dt
                class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                Distance
              </dt>
              <dd class="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                {{ (workout.distanceMeters / 1000).toFixed(2) }} km
              </dd>
            </div>

            <div v-if="workout.averageWatts">
              <dt
                class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                Avg Power
              </dt>
              <dd
                class="mt-1 text-sm font-semibold text-gray-900 dark:text-white flex items-baseline gap-1"
              >
                {{ workout.averageWatts }}
                <span class="text-[10px] font-normal text-gray-500">W</span>
              </dd>
            </div>

            <div v-if="workout.normalizedPower">
              <dt
                class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                NP
              </dt>
              <dd
                class="mt-1 text-sm font-semibold text-gray-900 dark:text-white flex items-baseline gap-1"
              >
                {{ workout.normalizedPower }}
                <span class="text-[10px] font-normal text-gray-500">W</span>
              </dd>
            </div>

            <div v-if="workout.rpe">
              <dt
                class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                RPE
              </dt>
              <dd class="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                {{ workout.rpe }}/10
              </dd>
            </div>
          </dl>
        </div>

        <!-- Planned Workout Section (Preserved) -->
        <div
          v-if="workout.plannedWorkout"
          class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-100 dark:border-blue-800 relative group"
        >
          <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-heroicons-link-slash"
              :loading="isUnlinking"
              title="Unlink from Plan"
              @click="unlinkWorkout"
            />
          </div>

          <div class="flex items-center justify-between mb-3 pr-8">
            <div class="flex items-center gap-2">
              <UBadge color="primary" variant="subtle" size="xs">
                <UIcon name="i-heroicons-calendar" class="w-3.5 h-3.5" />
                <span class="ml-1">Plan</span>
              </UBadge>
              <div class="flex flex-col">
                <NuxtLink
                  :to="`/workouts/planned/${workout.plannedWorkout.id}`"
                  class="text-sm font-medium text-blue-700 dark:text-blue-300 hover:underline flex items-center gap-1 group/link"
                >
                  {{ workout.plannedWorkout.title }}
                  <UIcon
                    name="i-heroicons-arrow-top-right-on-square"
                    class="w-3 h-3 opacity-0 group-hover/link:opacity-100 transition-opacity"
                  />
                </NuxtLink>
                <div class="flex gap-2 text-[10px] text-gray-500">
                  <span>{{ formatDateUTC(workout.plannedWorkout.date) }}</span>
                  <span>•</span>
                  <span>{{ workout.plannedWorkout.type || 'Workout' }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Planned vs Actual Grid -->
          <div class="grid grid-cols-3 gap-2 text-xs">
            <!-- Headers -->
            <div class="text-gray-500 font-medium">Metric</div>
            <div class="text-gray-500 font-medium">Planned</div>
            <div class="text-gray-500 font-medium">Actual</div>

            <!-- Duration -->
            <div class="text-gray-600 dark:text-gray-400">Duration</div>
            <div>
              {{
                workout.plannedWorkout.durationSec
                  ? formatDuration(workout.plannedWorkout.durationSec)
                  : '-'
              }}
            </div>
            <div
              :class="getComplianceColor(workout.durationSec, workout.plannedWorkout.durationSec)"
            >
              {{ formatDuration(workout.durationSec) }}
            </div>

            <!-- Distance (if applicable) -->
            <template v-if="workout.plannedWorkout.distanceMeters || workout.distanceMeters">
              <div class="text-gray-600 dark:text-gray-400">Distance</div>
              <div>
                {{
                  workout.plannedWorkout.distanceMeters
                    ? `${(workout.plannedWorkout.distanceMeters / 1000).toFixed(1)} km`
                    : '-'
                }}
              </div>
              <div
                :class="
                  getComplianceColor(workout.distanceMeters, workout.plannedWorkout.distanceMeters)
                "
              >
                {{
                  workout.distanceMeters ? `${(workout.distanceMeters / 1000).toFixed(1)} km` : '-'
                }}
              </div>
            </template>

            <!-- TSS (if applicable) -->
            <template v-if="workout.plannedWorkout.tss || workout.tss">
              <div class="text-gray-600 dark:text-gray-400">TSS</div>
              <div>
                {{ workout.plannedWorkout.tss ? Math.round(workout.plannedWorkout.tss) : '-' }}
              </div>
              <div :class="getComplianceColor(workout.tss, workout.plannedWorkout.tss)">
                {{ workout.tss ? Math.round(workout.tss) : '-' }}
              </div>
            </template>
          </div>

          <!-- Description & Structure (from Plan) -->
          <div
            v-if="workout.plannedWorkout.description"
            class="mt-4 pt-4 border-t border-blue-100 dark:border-blue-800 space-y-4"
          >
            <!-- Description -->
            <div>
              <h4 class="font-semibold text-[10px] text-gray-500 dark:text-gray-400 uppercase mb-1">
                Plan Description
              </h4>
              <p class="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {{ workout.plannedWorkout.description }}
              </p>
            </div>
          </div>
        </div>

        <!-- Collapsible Description -->
        <div v-if="workout.description">
          <UAccordion
            color="white"
            variant="ghost"
            size="sm"
            :items="[
              {
                label: 'Description',
                content: workout.description,
                icon: 'i-heroicons-document-text'
              }
            ]"
          >
            <template #body>
              <p class="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap py-2">
                {{ workout.description }}
              </p>
            </template>
          </UAccordion>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="primary" @click="viewFullWorkout"> View Full Workout </UButton>
        <UButton variant="outline" @click="closeModal"> Close </UButton>
      </div>
    </template>
  </UModal>

  <!-- Delete Confirmation Modal -->
  <UModal
    v-model:open="showDeleteConfirm"
    title="Delete Workout"
    description="Are you sure you want to delete this workout? This action cannot be undone."
  >
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="showDeleteConfirm = false">
          Cancel
        </UButton>
        <UButton color="error" :loading="isDeleting" @click="deleteWorkout"> Delete </UButton>
      </div>
    </template>
  </UModal>

  <!-- Unlink Confirmation Modal -->
  <UModal
    v-model:open="showUnlinkConfirm"
    title="Unlink Workout"
    description="Are you sure you want to unlink this workout from the plan? The planned workout will be marked as pending."
  >
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="showUnlinkConfirm = false">
          Cancel
        </UButton>
        <UButton color="warning" :loading="isUnlinking" @click="executeUnlink"> Unlink </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
  const { formatDateTime, formatDateUTC } = useFormat()

  const props = defineProps<{
    workout: any | null
    modelValue: boolean
  }>()

  const emit = defineEmits<{
    'update:modelValue': [value: boolean]
    deleted: [workoutId: string]
    updated: [workoutId: string]
  }>()

  const isOpen = computed({
    get: () => props.modelValue,
    set: (value) => emit('update:modelValue', value)
  })

  const isDeleting = ref(false)
  const isUnlinking = ref(false)
  const showDeleteConfirm = ref(false)
  const showUnlinkConfirm = ref(false)
  const toast = useToast()

  function closeModal() {
    isOpen.value = false
  }

  function unlinkWorkout() {
    if (!props.workout?.id) return
    showUnlinkConfirm.value = true
  }

  async function executeUnlink() {
    if (!props.workout?.id) return

    isUnlinking.value = true
    try {
      await $fetch(`/api/workouts/${props.workout.id}/unlink`, {
        method: 'POST'
      })

      toast.add({
        title: 'Unlinked',
        description: 'Workout unlinked from plan',
        color: 'success'
      })

      emit('updated', props.workout.id)
      closeModal()
    } catch (error) {
      console.error('Failed to unlink workout:', error)
      toast.add({
        title: 'Error',
        description: 'Failed to unlink workout',
        color: 'error'
      })
    } finally {
      isUnlinking.value = false
      showUnlinkConfirm.value = false
    }
  }

  async function deleteWorkout() {
    if (!props.workout?.id) return

    isDeleting.value = true
    try {
      await $fetch(`/api/workouts/${props.workout.id}`, {
        method: 'DELETE'
      })

      toast.add({
        title: 'Workout deleted',
        color: 'success'
      })

      showDeleteConfirm.value = false
      emit('deleted', props.workout.id)
      closeModal()
    } catch (error) {
      console.error('Failed to delete workout:', error)
      toast.add({
        title: 'Error',
        description: 'Failed to delete workout',
        color: 'error'
      })
    } finally {
      isDeleting.value = false
    }
  }

  function viewFullWorkout() {
    if (props.workout) {
      navigateTo(`/workouts/${props.workout.id}`)
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

  function getComplianceColor(
    actual: number | null | undefined,
    planned: number | null | undefined
  ) {
    if (!actual || !planned) return ''
    const ratio = actual / planned
    if (ratio >= 0.9 && ratio <= 1.1) return 'text-green-600 dark:text-green-400 font-medium'
    if (ratio >= 0.8 && ratio <= 1.2) return 'text-amber-600 dark:text-amber-400'
    return 'text-red-600 dark:text-red-400'
  }
</script>
