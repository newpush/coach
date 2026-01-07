<template>
  <div class="space-y-4">
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-lg font-semibold">Match Workouts</h3>
      <p class="text-sm text-muted">Link completed activities to your training plan.</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 h-[500px]">
      <!-- Left: Unmatched Completed Workouts -->
      <div class="border border-gray-200 dark:border-gray-700 rounded-lg flex flex-col">
        <div
          class="p-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 font-medium"
        >
          Completed (Unlinked)
        </div>
        <div class="flex-1 overflow-y-auto p-2 space-y-2">
          <div
            v-for="workout in completedWorkouts"
            :key="workout.id"
            class="p-3 rounded border cursor-pointer hover:border-primary transition-colors"
            :class="
              selectedCompleted?.id === workout.id
                ? 'border-primary bg-primary/5'
                : 'border-gray-200 dark:border-gray-700'
            "
            @click="selectedCompleted = workout"
          >
            <div class="font-bold">{{ workout.title }}</div>
            <div class="text-xs text-muted flex gap-2 mt-1">
              <span>{{ formatDateTime(workout.date, 'MMM d, h:mm a') }}</span>
              <span>•</span>
              <span>{{ Math.round(workout.tss || 0) }} TSS</span>
            </div>
          </div>
          <div v-if="completedWorkouts.length === 0" class="text-center py-10 text-muted text-sm">
            No unlinked workouts found.
          </div>
        </div>
      </div>

      <!-- Right: Planned Workouts -->
      <div class="border border-gray-200 dark:border-gray-700 rounded-lg flex flex-col">
        <div
          class="p-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 font-medium"
        >
          Planned (Pending)
        </div>
        <div class="flex-1 overflow-y-auto p-2 space-y-2">
          <div
            v-for="planned in plannedWorkouts"
            :key="planned.id"
            class="p-3 rounded border cursor-pointer hover:border-primary transition-colors"
            :class="
              selectedPlanned?.id === planned.id
                ? 'border-primary bg-primary/5'
                : 'border-gray-200 dark:border-gray-700'
            "
            @click="selectedPlanned = planned"
          >
            <div class="font-bold">{{ planned.title }}</div>
            <div class="text-xs text-muted flex gap-2 mt-1">
              <span>{{ formatDateTime(planned.date, 'MMM d, h:mm a') }}</span>
              <span>•</span>
              <span>{{ planned.tss }} TSS</span>
            </div>
            <div class="text-xs text-primary mt-1">{{ planned.type }}</div>
          </div>
          <div v-if="plannedWorkouts.length === 0" class="text-center py-10 text-muted text-sm">
            No planned workouts found.
          </div>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
      <UButton :disabled="!canMatch" color="primary" :loading="matching" @click="matchWorkouts">
        Link Workouts
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
  const { formatDateTime } = useFormat()

  const props = defineProps<{
    completedWorkouts: any[]
    plannedWorkouts: any[]
  }>()

  const emit = defineEmits(['matched'])

  const selectedCompleted = ref<any>(null)
  const selectedPlanned = ref<any>(null)
  const matching = ref(false)

  const canMatch = computed(() => selectedCompleted.value && selectedPlanned.value)

  async function matchWorkouts() {
    if (!canMatch.value) return

    matching.value = true
    try {
      await $fetch(`/api/workouts/${selectedCompleted.value.id}/link`, {
        method: 'POST',
        body: { plannedWorkoutId: selectedPlanned.value.id }
      })

      emit('matched')
      selectedCompleted.value = null
      selectedPlanned.value = null
    } catch (error) {
      console.error('Failed to link workouts', error)
    } finally {
      matching.value = false
    }
  }
</script>
