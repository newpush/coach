<template>
  <div
    class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
  >
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-lg font-semibold">Strength Training</h3>
      <div class="flex gap-2">
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          icon="i-heroicons-adjustments-horizontal"
          @click="$emit('adjust')"
        >
          Adjust
        </UButton>
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          icon="i-heroicons-arrow-path"
          :loading="generating"
          @click="$emit('regenerate')"
        >
          Regenerate
        </UButton>
      </div>
    </div>

    <div v-if="workout.structuredWorkout?.exercises?.length" class="space-y-6">
      <div v-for="(group, gIndex) in groupedExercises" :key="gIndex">
        <h4
          v-if="group.name"
          class="font-semibold text-gray-900 dark:text-white mb-2 uppercase text-xs tracking-wider"
        >
          {{ group.name }}
        </h4>
        <div class="space-y-3">
          <div
            v-for="(exercise, eIndex) in group.exercises"
            :key="eIndex"
            class="flex items-center p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
          >
            <div
              class="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-300 flex items-center justify-center font-bold text-sm mr-4 flex-shrink-0"
            >
              {{ Number(eIndex) + 1 }}
            </div>
            <div class="flex-1">
              <div class="font-medium text-gray-900 dark:text-white">{{ exercise.name }}</div>
              <div class="text-sm text-muted mt-0.5">
                <span v-if="exercise.sets">{{ exercise.sets }} Sets</span>
                <span v-if="exercise.reps" class="mx-2">•</span>
                <span v-if="exercise.reps">{{ exercise.reps }} Reps</span>
                <span v-if="exercise.weight" class="mx-2">•</span>
                <span v-if="exercise.weight">{{ exercise.weight }}</span>
                <span v-if="exercise.duration" class="mx-2">•</span>
                <span v-if="exercise.duration">{{ exercise.duration }}s</span>
              </div>
              <div v-if="exercise.notes" class="text-xs text-gray-500 italic mt-1">
                {{ exercise.notes }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="text-center py-8 text-muted">No exercises generated yet.</div>
  </div>
</template>

<script setup lang="ts">
  const props = defineProps<{
    workout: any
    generating?: boolean
  }>()

  defineEmits(['adjust', 'regenerate'])

  const groupedExercises = computed(() => {
    // Logic to group exercises if the data structure supports it (e.g. Warmup, Main Set, Cooldown)
    // For now, assuming a flat list or simple structure
    if (!props.workout.structuredWorkout?.exercises) return []

    // Example: Check if exercises have 'phase' or 'group' property
    // Fallback to single group
    return [{ name: 'Routine', exercises: props.workout.structuredWorkout.exercises }]
  })
</script>
