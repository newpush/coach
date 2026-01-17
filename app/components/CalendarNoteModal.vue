<template>
  <UModal v-model:open="isOpen" :title="note?.title || 'Note'">
    <template #body>
      <div v-if="note" class="space-y-4">
        <!-- Header Info -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UBadge color="neutral" variant="subtle" size="sm" class="font-bold">
              {{ note.category }}
            </UBadge>
            <span
              v-if="note.isWeeklyNote"
              class="text-xs text-primary-500 font-medium flex items-center gap-1"
            >
              <UIcon name="i-heroicons-calendar-days" class="w-4 h-4" />
              Weekly
            </span>
          </div>
          <div class="text-sm text-gray-500">
            {{ formatDateRange(note.startDate, note.endDate) }}
          </div>
        </div>

        <!-- Description -->
        <div
          v-if="note.description"
          class="prose prose-sm dark:prose-invert max-w-none border-t dark:border-gray-800 pt-4"
        >
          <MDC :value="note.description" />
        </div>
        <div v-else class="text-sm text-gray-400 italic py-4">No description provided.</div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-between w-full">
        <div class="text-[10px] text-gray-400 flex flex-col">
          <span>Source: {{ note?.source }}</span>
          <span>External ID: {{ note?.externalId }}</span>
        </div>
        <UButton color="neutral" variant="ghost" @click="isOpen = false">Close</UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
  const props = defineProps<{
    note: any
  }>()

  const isOpen = defineModel<boolean>('open', { default: false })

  const { formatDateTime, formatDateUTC } = useFormat()

  function formatDateRange(start: string, end?: string) {
    if (!start) return ''
    const startDate = new Date(start)

    if (!end) {
      return formatDateUTC(startDate, 'MMMM do, yyyy')
    }

    const endDate = new Date(end)

    // If same day
    if (formatDateUTC(startDate, 'yyyy-MM-dd') === formatDateUTC(endDate, 'yyyy-MM-dd')) {
      return formatDateUTC(startDate, 'MMMM do, yyyy')
    }

    return `${formatDateUTC(startDate, 'MMM do')} - ${formatDateUTC(endDate, 'MMM do, yyyy')}`
  }
</script>
