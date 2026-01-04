<template>
  <UDashboardPanel id="events">
    <template #header>
      <UDashboardNavbar title="Events">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <div class="flex gap-3">
            <UButton
              @click="openCreateModal"
              color="primary"
              variant="solid"
              icon="i-heroicons-plus"
              size="sm"
              class="font-bold"
            >
              <span class="hidden sm:inline">Add Event</span>
              <span class="sm:hidden">Add</span>
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-3 sm:p-6 space-y-4 sm:space-y-6">
        <!-- Page Header -->
        <div>
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Events Management</h1>
          <p class="text-sm font-medium text-gray-500 dark:text-gray-400 mt-1">
            Plan your races, events, and training milestones
          </p>
        </div>

        <!-- Events List -->
        <EventTable
          :events="paginatedEvents"
          :loading="loading"
          v-model:current-page="currentPage"
          :total-pages="totalPages"
          :total-events="events.length"
          :visible-pages="visiblePages"
          @navigate="navigateToEvent"
          @create="openCreateModal"
          @edit="openEditModal"
          @delete="confirmDeleteEvent"
        />
      </div>

      <!-- Event Form Modal -->
      <UModal v-model:open="isEventFormOpen" :title="editingEvent ? 'Edit Event' : 'Add New Event'" :description="editingEvent ? 'Update event details.' : 'Create a new race or event record.'">
        <template #body>
          <EventForm
            :initial-data="editingEvent"
            @success="onEventSaved"
            @cancel="isEventFormOpen = false"
          />
        </template>
      </UModal>

      <!-- Delete Confirmation Modal -->
      <UModal v-model:open="isDeleteModalOpen" title="Delete Event" description="Are you sure you want to delete this event? This action cannot be undone.">
        <template #body>
          <div class="space-y-4">
            <p>Are you sure you want to delete <strong>{{ eventToDelete?.title }}</strong>?</p>
            <div class="flex justify-end gap-2">
              <UButton color="neutral" variant="ghost" @click="isDeleteModalOpen = false">Cancel</UButton>
              <UButton color="error" variant="solid" :loading="deleting" @click="deleteEvent">Delete</UButton>
            </div>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import EventForm from '~/components/events/EventForm.vue'
import EventTable from '~/components/events/EventTable.vue'

definePageMeta({
  middleware: 'auth',
  layout: 'default'
})

useHead({
  title: 'Events Management',
  meta: [
    { name: 'description', content: 'Manage your racing calendar and training milestones.' }
  ]
})

const loading = ref(true)
const events = ref<any[]>([])
const isEventFormOpen = ref(false)
const editingEvent = ref<any>(null)
const isDeleteModalOpen = ref(false)
const eventToDelete = ref<any>(null)
const deleting = ref(false)

// Pagination
const currentPage = ref(1)
const itemsPerPage = 20

const totalPages = computed(() => Math.ceil(events.value.length / itemsPerPage))
const visiblePages = computed(() => {
  const pages = []
  const maxVisible = 7
  let start = Math.max(1, currentPage.value - Math.floor(maxVisible / 2))
  let end = Math.min(totalPages.value, start + maxVisible - 1)
  
  if (end - start < maxVisible - 1) {
    start = Math.max(1, end - maxVisible + 1)
  }
  
  for (let i = start; i <= end; i++) {
    pages.push(i)
  }
  return pages
})

const paginatedEvents = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage
  const end = start + itemsPerPage
  return events.value.slice(start, end)
})

async function fetchEvents() {
  loading.value = true
  try {
    const data = await $fetch('/api/events')
    events.value = data
  } catch (error) {
    console.error('Error fetching events:', error)
    useToast().add({
      title: 'Error',
      description: 'Failed to load events',
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  editingEvent.value = null
  isEventFormOpen.value = true
}

function openEditModal(event: any) {
  editingEvent.value = event
  isEventFormOpen.value = true
}

function onEventSaved() {
  isEventFormOpen.value = false
  fetchEvents()
  useToast().add({
    title: 'Success',
    description: editingEvent.value ? 'Event updated successfully' : 'Event created successfully',
    color: 'success'
  })
}

function confirmDeleteEvent(event: any) {
  eventToDelete.value = event
  isDeleteModalOpen.value = true
}

async function deleteEvent() {
  if (!eventToDelete.value) return
  
  deleting.value = true
  try {
    await $fetch(`/api/events/${eventToDelete.value.id}`, {
      method: 'DELETE'
    })
    
    useToast().add({
      title: 'Success',
      description: 'Event deleted successfully',
      color: 'success'
    })
    fetchEvents()
  } catch (error) {
    console.error('Error deleting event:', error)
    useToast().add({
      title: 'Error',
      description: 'Failed to delete event',
      color: 'error'
    })
  } finally {
    deleting.value = false
    isDeleteModalOpen.value = false
    eventToDelete.value = null
  }
}

function navigateToEvent(id: string) {
  navigateTo(`/events/${id}`)
}

onMounted(() => {
  fetchEvents()
})
</script>
