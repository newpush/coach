<template>
  <UCard :ui="{ body: 'p-0 sm:p-0', header: 'px-6 py-4' }" class="overflow-hidden">
    <template #header>
      <h3 class="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight">Recent Sessions</h3>
    </template>

    <div v-if="loading" class="p-12 text-center">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-gray-400 mx-auto mb-2" />
      <p class="text-sm font-medium text-gray-500">Loading workouts...</p>
    </div>
    
    <div v-else-if="workouts.length === 0" class="p-12 text-center text-gray-500 font-medium">
      No workouts found. Sync your data to get started.
    </div>
    
    <div v-else>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead class="bg-gray-50/50 dark:bg-gray-900/50">
            <tr>
              <th class="px-6 py-4 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                Date
              </th>
              <th class="px-6 py-4 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                Activity
              </th>
              <th class="px-6 py-4 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                Type
              </th>
              <th class="px-6 py-4 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                Duration
              </th>
              <th class="px-6 py-4 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                Load
              </th>
              <th class="px-6 py-4 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                Score
              </th>
              <th class="px-6 py-4 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                AI Analysis
              </th>
              <th class="px-6 py-4 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                Source
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
            <tr
              v-for="workout in workouts"
              :key="workout.id"
              @click="$emit('navigate', workout.id)"
              class="cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors group"
            >
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium">
                {{ formatDate(workout.date) }}
              </td>
              <td class="px-6 py-4 text-sm text-gray-900 dark:text-white font-bold">
                {{ workout.title }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400 font-medium">
                {{ workout.type }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400 tabular-nums">
                {{ formatDuration(workout.durationSec) }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400 tabular-nums">
                {{ workout.trainingLoad ? Math.round(workout.trainingLoad) : '-' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm">
                <UBadge 
                  v-if="workout.overallScore" 
                  :color="getScoreBadgeColor(workout.overallScore)" 
                  variant="subtle"
                  size="xs"
                  class="font-bold tabular-nums"
                >
                  {{ workout.overallScore }}/10
                </UBadge>
                <span v-else class="text-gray-400">-</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm">
                <UBadge 
                  :color="getAnalysisStatusColor(workout.aiAnalysisStatus)" 
                  variant="soft"
                  size="xs"
                  class="font-bold"
                >
                  {{ getAnalysisStatusLabel(workout.aiAnalysisStatus) }}
                </UBadge>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm">
                <UBadge 
                  :color="getSourceColor(workout.source)" 
                  variant="outline"
                  size="xs"
                  class="font-bold"
                >
                  {{ workout.source }}
                </UBadge>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <!-- Pagination -->
      <div v-if="totalPages > 1" class="px-6 py-6 border-t border-gray-200 dark:border-gray-800 bg-gray-50/30 dark:bg-gray-900/30">
        <div class="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div class="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-1">
            Page {{ currentPage }} of {{ totalPages }} ({{ totalWorkouts }} Total)
          </div>
          <div class="flex items-center gap-2">
            <UButton
              variant="outline"
              color="neutral"
              size="xs"
              class="font-bold uppercase tracking-wider"
              :disabled="currentPage === 1"
              @click="$emit('update:currentPage', currentPage - 1)"
            >
              Prev
            </UButton>
            <div class="flex gap-1">
              <UButton
                v-for="page in visiblePages"
                :key="page"
                size="xs"
                class="font-bold"
                :variant="page === currentPage ? 'solid' : 'ghost'"
                :color="page === currentPage ? 'primary' : 'neutral'"
                @click="$emit('update:currentPage', page)"
              >
                {{ page }}
              </UButton>
            </div>
            <UButton
              variant="outline"
              color="neutral"
              size="xs"
              class="font-bold uppercase tracking-wider"
              :disabled="currentPage === totalPages"
              @click="$emit('update:currentPage', currentPage + 1)"
            >
              Next
            </UButton>
          </div>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
const props = defineProps<{
  workouts: any[]
  loading: boolean
  currentPage: number
  totalPages: number
  totalWorkouts: number
  visiblePages: number[]
}>()

defineEmits(['update:currentPage', 'navigate'])

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

function getScoreBadgeColor(score: number) {
  if (score >= 8) return 'success'
  if (score >= 6) return 'primary'
  if (score >= 4) return 'warning'
  return 'error'
}

function getAnalysisStatusColor(status: string | null | undefined) {
  if (status === 'COMPLETED') return 'success'
  if (status === 'PROCESSING') return 'primary'
  if (status === 'PENDING') return 'warning'
  if (status === 'FAILED') return 'error'
  return 'neutral'
}

function getAnalysisStatusLabel(status: string | null | undefined) {
  if (status === 'COMPLETED') return 'Complete'
  if (status === 'PROCESSING') return 'In Progress'
  if (status === 'PENDING') return 'Queued'
  if (status === 'FAILED') return 'Failed'
  return 'Not Started'
}

function getSourceColor(source: string) {
  if (source === 'intervals') return 'primary'
  if (source === 'whoop') return 'secondary'
  if (source === 'strava') return 'warning'
  return 'neutral'
}
</script>
