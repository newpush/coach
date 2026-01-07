<template>
  <div class="space-y-4">
    <div
      v-for="workoutExercise in exercises"
      :key="workoutExercise.id"
      class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
    >
      <div
        class="px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center"
      >
        <div class="flex items-center gap-3">
          <UAvatar
            v-if="workoutExercise.exercise.imageUrl"
            :src="workoutExercise.exercise.imageUrl"
            :alt="workoutExercise.exercise.title"
            size="sm"
          />
          <div
            v-else
            class="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-primary-600 dark:text-primary-300 font-bold text-xs"
          >
            {{ workoutExercise.exercise.title.substring(0, 2).toUpperCase() }}
          </div>

          <div>
            <h3 class="font-semibold text-gray-900 dark:text-white">
              {{ workoutExercise.exercise.title }}
            </h3>
            <p
              v-if="workoutExercise.exercise.primaryMuscle"
              class="text-xs text-gray-500 capitalize"
            >
              {{ workoutExercise.exercise.primaryMuscle }}
            </p>
          </div>
        </div>

        <div v-if="workoutExercise.notes" class="text-sm text-gray-500 italic">
          {{ workoutExercise.notes }}
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm text-left">
          <thead class="text-xs text-gray-500 uppercase bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th scope="col" class="px-4 py-2 w-10">Set</th>
              <th scope="col" class="px-4 py-2">Type</th>
              <th scope="col" class="px-4 py-2 text-right">Weight</th>
              <th scope="col" class="px-4 py-2 text-right">Reps</th>
              <th v-if="hasDistance(workoutExercise)" scope="col" class="px-4 py-2 text-right">
                Distance
              </th>
              <th v-if="hasDuration(workoutExercise)" scope="col" class="px-4 py-2 text-right">
                Duration
              </th>
              <th scope="col" class="px-4 py-2 text-right">RPE</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(set, index) in workoutExercise.sets"
              :key="set.id"
              class="border-b dark:border-gray-700 last:border-b-0"
            >
              <td class="px-4 py-2 font-medium text-gray-900 dark:text-white">
                {{ Number(index) + 1 }}
              </td>
              <td class="px-4 py-2">
                <span
                  v-if="set.type !== 'NORMAL'"
                  class="text-xs font-semibold px-2 py-0.5 rounded"
                  :class="getSetTypeClass(set.type)"
                >
                  {{ set.type }}
                </span>
                <span v-else class="text-gray-400">-</span>
              </td>
              <td class="px-4 py-2 text-right font-medium">
                <span v-if="set.weight">{{ set.weight }} {{ set.weightUnit || 'kg' }}</span>
                <span v-else class="text-gray-400">-</span>
              </td>
              <td class="px-4 py-2 text-right font-medium">
                <span v-if="set.reps">{{ set.reps }}</span>
                <span v-else class="text-gray-400">-</span>
              </td>
              <td v-if="hasDistance(workoutExercise)" class="px-4 py-2 text-right">
                <span v-if="set.distanceMeters">{{ set.distanceMeters }} m</span>
              </td>
              <td v-if="hasDuration(workoutExercise)" class="px-4 py-2 text-right">
                <span v-if="set.durationSec">{{ formatDuration(set.durationSec) }}</span>
              </td>
              <td class="px-4 py-2 text-right">
                <span
                  v-if="set.rpe"
                  class="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold"
                  :class="getRpeClass(set.rpe)"
                >
                  {{ set.rpe }}
                </span>
                <span v-else class="text-gray-400">-</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  const props = defineProps<{
    exercises: any[]
  }>()

  function hasDistance(workoutExercise: any) {
    return workoutExercise.sets.some((s: any) => s.distanceMeters)
  }

  function hasDuration(workoutExercise: any) {
    return workoutExercise.sets.some((s: any) => s.durationSec)
  }

  function getSetTypeClass(type: string) {
    switch (type) {
      case 'WARMUP':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
      case 'DROPSET':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
      case 'FAILURE':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  function getRpeClass(rpe: number) {
    if (rpe >= 9) return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    if (rpe >= 7) return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
    if (rpe >= 5) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
    return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
  }

  function formatDuration(seconds: number) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }
</script>
