<template>
  <UDashboardPanel id="event-detail">
    <template #header>
      <UDashboardNavbar :title="event ? `Event: ${event.title}` : 'Event Details'">
        <template #leading>
          <UButton
            icon="i-heroicons-arrow-left"
            color="neutral"
            variant="ghost"
            to="/events"
            class="hidden sm:flex"
          >
            Back to Events
          </UButton>
          <UButton
            icon="i-heroicons-arrow-left"
            color="neutral"
            variant="ghost"
            to="/events"
            class="sm:hidden"
          />
        </template>

        <template #right>
          <div class="flex gap-2">
            <UButton
              icon="i-heroicons-pencil-square"
              color="primary"
              variant="solid"
              size="sm"
              class="font-bold"
              @click="openEditModal"
            >
              Edit
            </UButton>
            <UButton
              icon="i-heroicons-trash"
              color="error"
              variant="outline"
              size="sm"
              class="font-bold"
              @click="confirmDeleteEvent"
            >
              Delete
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-6">
        <div v-if="loading" class="flex items-center justify-center py-12">
          <div class="text-center">
            <div
              class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"
            />
            <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">Loading event...</p>
          </div>
        </div>

        <div v-else-if="error" class="text-center py-12">
          <div class="text-red-600 dark:text-red-400">
            <p class="text-lg font-semibold">{{ error }}</p>
          </div>
        </div>

        <div v-else-if="event" class="space-y-6">
          <!-- Header Section -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div class="flex items-start justify-between mb-4">
              <div class="flex-1">
                <div class="flex items-center gap-3 mb-2">
                  <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                    {{ event.title }}
                  </h1>
                  <span :class="getPriorityBadgeClass(event.priority)">
                    Priority {{ event.priority }}
                  </span>
                </div>
                <div class="flex flex-wrap gap-3 text-sm text-gray-600 dark:text-gray-400">
                  <div class="flex items-center gap-1">
                    <span class="i-heroicons-calendar w-4 h-4" />
                    {{ formatDate(event.date) }}
                  </div>
                  <div v-if="event.startTime" class="flex items-center gap-1">
                    <span class="i-heroicons-clock w-4 h-4" />
                    {{ event.startTime }}
                  </div>
                  <div v-if="event.type" class="flex items-center gap-1">
                    <span class="i-heroicons-tag w-4 h-4" />
                    {{ event.type }}
                    <span v-if="event.subType">({{ event.subType }})</span>
                  </div>
                </div>
              </div>
              <div v-if="event.websiteUrl">
                <UButton
                  :to="event.websiteUrl"
                  target="_blank"
                  icon="i-heroicons-link"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                >
                  Website
                </UButton>
              </div>
            </div>

            <!-- Key Stats Grid -->
            <div class="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div
                v-if="event.distance"
                class="rounded-lg p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
              >
                <div class="text-xs text-blue-600 dark:text-blue-400 mb-1">Distance</div>
                <div class="text-xl font-bold text-blue-900 dark:text-blue-100">
                  {{ event.distance }} <span class="text-sm font-normal">km</span>
                </div>
              </div>
              <div
                v-if="event.elevation"
                class="rounded-lg p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
              >
                <div class="text-xs text-green-600 dark:text-green-400 mb-1">Elevation</div>
                <div class="text-xl font-bold text-green-900 dark:text-green-100">
                  {{ event.elevation }} <span class="text-sm font-normal">m</span>
                </div>
              </div>
              <div
                v-if="event.expectedDuration"
                class="rounded-lg p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800"
              >
                <div class="text-xs text-purple-600 dark:text-purple-400 mb-1">Est. Duration</div>
                <div class="text-xl font-bold text-purple-900 dark:text-purple-100">
                  {{ event.expectedDuration }} <span class="text-sm font-normal">h</span>
                </div>
              </div>
              <div
                class="rounded-lg p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
              >
                <div class="text-xs text-gray-600 dark:text-gray-400 mb-1">Location</div>
                <div
                  class="text-sm font-bold text-gray-900 dark:text-white truncate"
                  :title="formatLocation(event)"
                >
                  {{ formatLocation(event) || 'TBD' }}
                </div>
              </div>
            </div>

            <div v-if="event.description" class="mt-6">
              <h3 class="text-sm font-medium text-gray-900 dark:text-white mb-2">Description</h3>
              <p class="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                {{ event.description }}
              </p>
            </div>
          </div>

          <!-- Goals Section -->
          <div
            v-if="event.goals && event.goals.length > 0"
            class="bg-white dark:bg-gray-800 rounded-lg shadow p-6"
          >
            <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-4">Linked Goals</h2>
            <div class="space-y-3">
              <div
                v-for="goal in event.goals"
                :key="goal.id"
                class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700"
              >
                <div>
                  <div class="font-medium text-gray-900 dark:text-white">{{ goal.title }}</div>
                  <div class="text-xs text-gray-500 mt-1">
                    Target: {{ formatDate(goal.targetDate) }}
                  </div>
                </div>
                <UBadge
                  :color="goal.status === 'COMPLETED' ? 'success' : 'primary'"
                  variant="subtle"
                >
                  {{ goal.status === 'COMPLETED' ? 'Completed' : 'In Progress' }}
                </UBadge>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Event Form Modal (Edit) -->
      <UModal v-model:open="isEventFormOpen" title="Edit Event" description="Update event details.">
        <template #body>
          <EventForm
            :initial-data="event"
            @success="onEventUpdated"
            @cancel="isEventFormOpen = false"
          />
        </template>
      </UModal>

      <!-- Delete Confirmation Modal -->
      <UModal
        v-model:open="isDeleteModalOpen"
        title="Delete Event"
        description="Are you sure you want to delete this event? This action cannot be undone."
      >
        <template #body>
          <div class="space-y-4">
            <p>
              Are you sure you want to delete <strong>{{ event?.title }}</strong
              >?
            </p>
            <div class="flex justify-end gap-2">
              <UButton color="neutral" variant="ghost" @click="isDeleteModalOpen = false"
                >Cancel</UButton
              >
              <UButton color="error" variant="solid" :loading="deleting" @click="deleteEvent"
                >Delete</UButton
              >
            </div>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
  import EventForm from '~/components/events/EventForm.vue'

  definePageMeta({
    middleware: 'auth',
    layout: 'default'
  })

  const route = useRoute()
  const router = useRouter()
  const toast = useToast()

  const event = ref<any>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)
  const isEventFormOpen = ref(false)
  const isDeleteModalOpen = ref(false)
  const deleting = ref(false)

  useHead(() => {
    if (!event.value) {
      return { title: 'Event Details' }
    }
    return {
      title: `${event.value.title} | Coach Wattz`,
      meta: [{ name: 'description', content: `Details for ${event.value.title}` }]
    }
  })

  async function fetchEvent() {
    loading.value = true
    error.value = null
    try {
      const id = route.params.id
      event.value = await $fetch(`/api/events/${id}`)
    } catch (e: any) {
      error.value = e.data?.message || e.message || 'Failed to load event'
      console.error('Error fetching event:', e)
    } finally {
      loading.value = false
    }
  }

  function openEditModal() {
    isEventFormOpen.value = true
  }

  function onEventUpdated() {
    isEventFormOpen.value = false
    fetchEvent()
    toast.add({
      title: 'Success',
      description: 'Event updated successfully',
      color: 'success'
    })
  }

  function confirmDeleteEvent() {
    isDeleteModalOpen.value = true
  }

  async function deleteEvent() {
    if (!event.value) return

    deleting.value = true
    try {
      await $fetch(`/api/events/${event.value.id}`, {
        method: 'DELETE'
      })

      toast.add({
        title: 'Success',
        description: 'Event deleted successfully',
        color: 'success'
      })
      router.push('/events')
    } catch (error) {
      console.error('Error deleting event:', error)
      toast.add({
        title: 'Error',
        description: 'Failed to delete event',
        color: 'error'
      })
    } finally {
      deleting.value = false
      isDeleteModalOpen.value = false
    }
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  }

  function formatLocation(event: any) {
    const parts = []
    if (event.city) parts.push(event.city)
    if (event.country) parts.push(event.country)
    if (parts.length === 0 && event.location) return event.location
    return parts.join(', ')
  }

  function getPriorityBadgeClass(priority: string) {
    const baseClass = 'px-2 py-0.5 rounded text-xs font-bold ml-2'
    switch (priority) {
      case 'A':
        return `${baseClass} bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200`
      case 'B':
        return `${baseClass} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`
      case 'C':
        return `${baseClass} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300`
      default:
        return `${baseClass} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300`
    }
  }

  onMounted(() => {
    fetchEvent()
  })
</script>
