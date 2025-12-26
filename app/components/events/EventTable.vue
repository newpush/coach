<template>
  <div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
    <div v-if="loading" class="p-8 text-center text-gray-600 dark:text-gray-400">
      <UIcon name="i-lucide-loader-2" class="size-8 animate-spin mx-auto mb-2" />
      Loading events...
    </div>
    
    <div v-else-if="events.length === 0" class="p-8 text-center text-gray-600 dark:text-gray-400">
      <UIcon name="i-lucide-flag" class="size-12 mx-auto mb-4 opacity-20" />
      <p>No events found. Add your first race or event to get started.</p>
      <UButton
        class="mt-4 font-bold"
        color="primary"
        variant="outline"
        size="sm"
        icon="i-heroicons-plus"
        @click="$emit('create')"
      >
        Add Event
      </UButton>
    </div>
    
    <div v-else class="overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead class="bg-gray-50 dark:bg-gray-900">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Event</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type</th>
            <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Priority</th>
            <th class="hidden md:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Profile</th>
            <th class="hidden lg:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Location</th>
            <th class="hidden xl:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Goals</th>
            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
          <tr
            v-for="event in events"
            :key="event.id"
            @click="$emit('navigate', event.id)"
            class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="flex flex-col">
                <span class="text-sm font-bold text-gray-900 dark:text-white">{{ event.title }}</span>
                <span v-if="event.websiteUrl" class="text-xs text-blue-500 hover:underline" @click.stop>
                  <a :href="event.websiteUrl" target="_blank">{{ event.websiteUrl }}</a>
                </span>
              </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
              <div class="flex flex-col">
                <span>{{ formatDate(event.date) }}</span>
                <span v-if="event.startTime" class="text-xs font-medium text-gray-500">{{ event.startTime }}</span>
              </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
              <div class="flex flex-col">
                <span>{{ event.type }}</span>
                <span v-if="event.subType" class="text-xs text-muted">{{ event.subType }}</span>
              </div>
              <span v-if="event.isVirtual" class="mt-1 inline-block text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-1 rounded uppercase font-bold w-fit">Virtual</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-center">
              <span :class="getPriorityBadgeClass(event.priority)">
                {{ event.priority }}
              </span>
            </td>
            <td class="hidden md:table-cell px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
              <div class="flex flex-col gap-0.5">
                <span v-if="event.distance" class="font-medium text-gray-900 dark:text-white">{{ event.distance }} km</span>
                <span v-if="event.elevation" class="text-xs">{{ event.elevation }} m elev.</span>
                <span v-if="event.expectedDuration" class="text-xs">{{ event.expectedDuration }} h</span>
              </div>
            </td>
            <td class="hidden lg:table-cell px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
              {{ formatLocation(event) }}
            </td>
            <td class="hidden xl:table-cell px-6 py-4 whitespace-nowrap">
              <div class="flex flex-wrap gap-1">
                <span v-for="goal in event.goals" :key="goal.id" class="px-2 py-0.5 rounded-full text-[10px] bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200 font-medium">
                  {{ goal.title }}
                </span>
                <span v-if="!event.goals || event.goals.length === 0" class="text-xs text-gray-400 italic">No goals linked</span>
              </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
              <div class="flex items-center justify-end gap-2" @click.stop>
                <UButton
                  icon="i-heroicons-pencil-square"
                  color="gray"
                  variant="ghost"
                  size="xs"
                  @click="$emit('edit', event)"
                />
                <UButton
                  icon="i-heroicons-trash"
                  color="error"
                  variant="ghost"
                  size="xs"
                  @click="$emit('delete', event)"
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
      <div class="flex items-center justify-between">
        <div class="text-sm text-gray-600 dark:text-gray-400">
          Showing {{ (currentPage - 1) * itemsPerPage + 1 }} to {{ Math.min(currentPage * itemsPerPage, totalEvents) }} of {{ totalEvents }} entries
        </div>
        <div class="flex gap-2">
          <button
            @click="$emit('update:currentPage', currentPage - 1)"
            :disabled="currentPage === 1"
            class="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            Previous
          </button>
          <div class="flex gap-1">
            <button
              v-for="page in visiblePages"
              :key="page"
              @click="$emit('update:currentPage', page)"
              :class="[
                'px-3 py-1 rounded text-sm',
                page === currentPage
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
              ]"
            >
              {{ page }}
            </button>
          </div>
          <button
            @click="$emit('update:currentPage', currentPage + 1)"
            :disabled="currentPage === totalPages"
            class="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
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
  events: any[]
  loading: boolean
  currentPage: number
  totalPages: number
  totalEvents: number
  visiblePages: number[]
}>()

defineEmits(['update:currentPage', 'navigate', 'create', 'edit', 'delete'])

const itemsPerPage = 20

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function getPriorityBadgeClass(priority: string) {
  const baseClass = 'px-3 py-1 rounded-full text-xs font-bold'
  switch (priority) {
    case 'A':
      return `${baseClass} bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 ring-1 ring-amber-500/20`
    case 'B':
      return `${baseClass} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 ring-1 ring-blue-500/20`
    case 'C':
      return `${baseClass} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 ring-1 ring-gray-500/20`
    default:
      return `${baseClass} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300`
  }
}

function formatLocation(event: any) {
  const parts = []
  if (event.city) parts.push(event.city)
  if (event.country) parts.push(event.country)
  if (parts.length === 0 && event.location) return event.location
  return parts.join(', ')
}
</script>
