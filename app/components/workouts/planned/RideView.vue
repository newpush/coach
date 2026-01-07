<template>
  <div
    class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6"
  >
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
      <h3 class="text-lg font-semibold">Power Profile</h3>
      <div class="flex gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          icon="i-heroicons-chat-bubble-left-right"
          class="whitespace-nowrap"
          @click="$emit('add-messages')"
        >
          <span class="hidden sm:inline">Add Messages</span>
          <span class="inline sm:hidden">Messages</span>
        </UButton>
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
          <span class="hidden sm:inline">Regenerate</span>
          <span class="inline sm:hidden">Redo</span>
        </UButton>
      </div>
    </div>
    <WorkoutChart :workout="workout.structuredWorkout" :user-ftp="userFtp" />
  </div>
</template>

<script setup lang="ts">
  import WorkoutChart from '~/components/workouts/WorkoutChart.vue'

  defineProps<{
    workout: any
    userFtp?: number
    generating?: boolean
  }>()

  defineEmits(['add-messages', 'adjust', 'regenerate'])
</script>
