<template>
  <UModal v-model:open="isOpen" title="Bulk Delete Workouts">
    <template #body>
      <div class="space-y-4">
        <div v-if="step === 'filter'" class="space-y-4">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Select criteria to remove planned workouts, events, and notes. This action cannot be
            undone.
          </p>

          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Start Date">
              <UInput v-model="filters.startDate" type="date" />
            </UFormField>
            <UFormField label="End Date">
              <UInput v-model="filters.endDate" type="date" />
            </UFormField>
          </div>

          <UFormField label="Source">
            <USelectMenu
              v-model="filters.source"
              :options="sourceOptions"
              option-attribute="label"
              value-attribute="value"
            />
          </UFormField>

          <UFormField label="Keyword (Optional)">
            <UInput
              v-model="filters.keyword"
              placeholder="e.g. 'Rest', 'Zwift'"
              icon="i-heroicons-magnifying-glass"
            />
          </UFormField>
        </div>

        <div v-else-if="step === 'confirm'" class="space-y-4">
          <UAlert
            icon="i-heroicons-exclamation-triangle"
            color="warning"
            variant="soft"
            title="Confirm Deletion"
            description="Are you sure you want to delete these items?"
          />

          <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
            <div class="flex justify-between items-center">
              <span class="text-sm font-medium">Planned Workouts</span>
              <span class="text-sm font-bold">{{ previewCounts?.plannedWorkouts || 0 }}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm font-medium">Events</span>
              <span class="text-sm font-bold">{{ previewCounts?.events || 0 }}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm font-medium">Notes</span>
              <span class="text-sm font-bold">{{ previewCounts?.notes || 0 }}</span>
            </div>
            <div
              class="pt-2 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center"
            >
              <span class="font-bold">Total Items</span>
              <span class="font-bold text-red-500">{{ previewCounts?.total || 0 }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-between w-full">
        <UButton color="neutral" variant="ghost" @click="closeModal"> Cancel </UButton>

        <div class="flex gap-2">
          <UButton
            v-if="step === 'confirm'"
            color="neutral"
            variant="ghost"
            @click="step = 'filter'"
          >
            Back
          </UButton>

          <UButton
            v-if="step === 'filter'"
            color="primary"
            :loading="loading"
            @click="previewDeletion"
          >
            Preview Deletion
          </UButton>

          <UButton
            v-if="step === 'confirm'"
            color="error"
            :loading="loading"
            @click="executeDeletion"
          >
            Delete {{ previewCounts?.total || 0 }} Items
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
  import { format, addDays } from 'date-fns'

  const props = defineProps<{
    modelValue: boolean
  }>()

  const emit = defineEmits<{
    'update:modelValue': [value: boolean]
    deleted: []
  }>()

  const isOpen = computed({
    get: () => props.modelValue,
    set: (value) => emit('update:modelValue', value)
  })

  const toast = useToast()
  const step = ref<'filter' | 'confirm'>('filter')
  const loading = ref(false)
  const previewCounts = ref<{
    plannedWorkouts: number
    events: number
    notes: number
    total: number
  } | null>(null)

  // Defaults: Tomorrow to Next Week
  const today = new Date()
  const tomorrow = addDays(today, 1)
  const nextWeek = addDays(today, 7)

  const filters = reactive({
    startDate: format(tomorrow, 'yyyy-MM-dd'),
    endDate: format(nextWeek, 'yyyy-MM-dd'),
    source: 'all',
    keyword: ''
  })

  const sourceOptions = [
    { label: 'All Sources', value: 'all' },
    { label: 'Intervals.icu (Synced)', value: 'intervals' },
    { label: 'Coach Wattz (Local)', value: 'coach-wattz' }
  ]

  function closeModal() {
    isOpen.value = false
    // Reset after delay to avoid UI jumping
    setTimeout(() => {
      step.value = 'filter'
      previewCounts.value = null
    }, 300)
  }

  async function previewDeletion() {
    loading.value = true
    try {
      const res = await $fetch<{
        success: boolean
        preview?: boolean
        counts?: { plannedWorkouts: number; events: number; notes: number; total: number }
      }>('/api/workouts/planned/bulk-delete', {
        method: 'POST',
        body: {
          ...filters,
          preview: true
        }
      })
      if (res.counts) {
        previewCounts.value = res.counts
        step.value = 'confirm'
      }
    } catch (err: any) {
      toast.add({
        title: 'Preview Failed',
        description: err.message || 'Could not fetch deletion preview',
        color: 'error'
      })
    } finally {
      loading.value = false
    }
  }

  async function executeDeletion() {
    loading.value = true
    try {
      const res = await $fetch<{
        success: boolean
        preview?: boolean
        deleted?: { plannedWorkouts: number; events: number; notes: number; total: number }
      }>('/api/workouts/planned/bulk-delete', {
        method: 'POST',
        body: {
          ...filters,
          preview: false
        }
      })
      if (res.deleted) {
        toast.add({
          title: 'Deletion Complete',
          description: `Removed ${res.deleted.total} items.`,
          color: 'success'
        })

        emit('deleted')
        closeModal()
      }
    } catch (err: any) {
      toast.add({
        title: 'Deletion Failed',
        description: err.message || 'Could not delete items',
        color: 'error'
      })
    } finally {
      loading.value = false
    }
  }
</script>
