<template>
  <div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
    <div class="overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead class="bg-gray-50 dark:bg-gray-900">
          <tr>
            <th
              class="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
            >
              Date
            </th>
            <th
              class="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
            >
              Activity
            </th>
            <th
              class="hidden sm:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
            >
              Type
            </th>
            <th
              class="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
            >
              Duration
            </th>
            <th
              class="hidden md:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
            >
              Load
            </th>
            <th
              class="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
            >
              Score
            </th>
            <th
              class="hidden lg:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
            >
              AI Analysis
            </th>
            <th
              class="hidden lg:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
            >
              Source
            </th>
          </tr>
        </thead>
        <tbody
          v-if="loading"
          class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700"
        >
          <tr v-for="i in 10" :key="i">
            <td class="px-3 sm:px-6 py-4 whitespace-nowrap"><USkeleton class="h-4 w-24" /></td>
            <td class="px-3 sm:px-6 py-4"><USkeleton class="h-4 w-full max-w-[200px]" /></td>
            <td class="hidden sm:table-cell px-6 py-4 whitespace-nowrap">
              <USkeleton class="h-4 w-16" />
            </td>
            <td class="px-3 sm:px-6 py-4 whitespace-nowrap"><USkeleton class="h-4 w-16" /></td>
            <td class="hidden md:table-cell px-6 py-4 whitespace-nowrap">
              <USkeleton class="h-4 w-12" />
            </td>
            <td class="px-3 sm:px-6 py-4 whitespace-nowrap">
              <USkeleton class="h-5 w-16 rounded" />
            </td>
            <td class="hidden lg:table-cell px-6 py-4 whitespace-nowrap">
              <USkeleton class="h-5 w-20 rounded" />
            </td>
            <td class="hidden lg:table-cell px-6 py-4 whitespace-nowrap">
              <USkeleton class="h-5 w-20 rounded" />
            </td>
          </tr>
        </tbody>
        <tbody v-else-if="workouts.length === 0" class="bg-white dark:bg-gray-800">
          <tr>
            <td colspan="8" class="p-8 text-center text-gray-600 dark:text-gray-400">
              No workouts found. Sync your data to get started.
            </td>
          </tr>
        </tbody>
        <tbody
          v-else
          class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700"
        >
          <tr
            v-for="workout in workouts"
            :key="workout.id"
            class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            @click="$emit('navigate', workout.id)"
          >
            <td class="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
              <span class="sm:hidden">{{ formatShortDate(workout.date) }}</span>
              <span class="hidden sm:inline">{{ formatDate(workout.date) }}</span>
            </td>
            <td
              class="px-3 sm:px-6 py-4 text-sm text-gray-900 dark:text-white max-w-[150px] sm:max-w-none truncate"
            >
              {{ workout.title }}
            </td>
            <td
              class="hidden sm:table-cell px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400"
            >
              {{ workout.type }}
            </td>
            <td
              class="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400"
            >
              {{ formatDuration(workout.durationSec) }}
            </td>
            <td
              class="hidden md:table-cell px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400"
            >
              {{ workout.trainingLoad ? Math.round(workout.trainingLoad) : '-' }}
            </td>
            <td class="px-3 sm:px-6 py-4 whitespace-nowrap text-sm">
              <span v-if="workout.overallScore" :class="getScoreBadgeClass(workout.overallScore)">
                {{ workout.overallScore }}<span class="hidden sm:inline">/10</span>
              </span>
              <span v-else class="text-gray-400">-</span>
            </td>
            <td class="hidden lg:table-cell px-6 py-4 whitespace-nowrap text-sm">
              <span :class="getAnalysisStatusBadgeClass(workout.aiAnalysisStatus)">
                {{ getAnalysisStatusLabel(workout.aiAnalysisStatus) }}
              </span>
            </td>
            <td class="hidden lg:table-cell px-6 py-4 whitespace-nowrap text-sm">
              <span :class="getSourceBadgeClass(workout.source)">
                {{ workout.source }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
      <div class="flex items-center justify-between">
        <div class="text-sm text-gray-600 dark:text-gray-400">
          Showing {{ (currentPage - 1) * itemsPerPage + 1 }} to
          {{ Math.min(currentPage * itemsPerPage, totalWorkouts) }} of {{ totalWorkouts }} entries
        </div>
        <div class="flex gap-2">
          <button
            :disabled="currentPage === 1"
            class="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            @click="$emit('update:currentPage', currentPage - 1)"
          >
            Previous
          </button>
          <div class="flex gap-1">
            <button
              v-for="page in visiblePages"
              :key="page"
              :class="[
                'px-3 py-1 rounded text-sm',
                page === currentPage
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
              ]"
              @click="$emit('update:currentPage', page)"
            >
              {{ page }}
            </button>
          </div>
          <button
            :disabled="currentPage === totalPages"
            class="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            @click="$emit('update:currentPage', currentPage + 1)"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  </div>
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

  const { formatDate, formatShortDate } = useFormat()

  // Constant for items per page (used in pagination display)
  const itemsPerPage = 20

  function formatDuration(seconds: number) {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    return `${minutes}m`
  }

  function getScoreBadgeClass(score: number) {
    const baseClass = 'px-2 py-1 rounded text-xs font-semibold'
    if (score >= 8)
      return `${baseClass} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`
    if (score >= 6)
      return `${baseClass} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`
    if (score >= 4)
      return `${baseClass} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`
    return `${baseClass} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`
  }

  function getAnalysisStatusBadgeClass(status: string | null | undefined) {
    const baseClass = 'px-2 py-1 rounded text-xs font-medium'
    if (status === 'COMPLETED')
      return `${baseClass} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`
    if (status === 'PROCESSING')
      return `${baseClass} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`
    if (status === 'PENDING')
      return `${baseClass} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`
    if (status === 'FAILED')
      return `${baseClass} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`
    return `${baseClass} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300`
  }

  function getAnalysisStatusLabel(status: string | null | undefined) {
    if (status === 'COMPLETED') return '✓ Complete'
    if (status === 'PROCESSING') return '⟳ Processing'
    if (status === 'PENDING') return '⋯ Pending'
    if (status === 'FAILED') return '✗ Failed'
    return '− Not Started'
  }

  function getSourceBadgeClass(source: string) {
    const baseClass = 'px-2 py-1 rounded text-xs font-medium'
    if (source === 'intervals')
      return `${baseClass} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`
    if (source === 'whoop')
      return `${baseClass} bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200`
    if (source === 'strava')
      return `${baseClass} bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200`
    return `${baseClass} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300`
  }
</script>
