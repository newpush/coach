<template>
  <div class="space-y-6">
    <!-- Training Data Management -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-calendar" class="w-5 h-5 text-warning" />
          <h2 class="text-xl font-semibold">Training Schedule</h2>
        </div>
      </template>
      
      <div class="space-y-4">
        <div>
          <h3 class="font-medium mb-1">Clear Future Schedule</h3>
          <p class="text-sm text-muted mb-3">
            Remove all uncompleted planned workouts scheduled for future dates. This is useful if you want to regenerate your plan completely.
          </p>
          <UButton 
            color="warning" 
            variant="soft"
            :loading="clearingSchedule"
            @click="confirmClearSchedule"
          >
            Clear Future Workouts
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- Account Deletion -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-error" />
          <h2 class="text-xl font-semibold text-error">Account Deletion</h2>
        </div>
      </template>
      
      <div class="space-y-4">
        <p class="text-sm text-muted">
          Once you delete your account, there is no going back. Please be certain.
        </p>
        <UButton color="error" variant="outline">
          Delete Account
        </UButton>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const toast = useToast()
const clearingSchedule = ref(false)

async function confirmClearSchedule() {
  if (!confirm('Are you sure? This will delete all future planned workouts that are not marked as complete.')) {
    return
  }

  clearingSchedule.value = true
  try {
    const result: any = await $fetch('/api/plans/workouts/future', {
      method: 'DELETE'
    })
    
    toast.add({
      title: 'Schedule Cleared',
      description: `Removed ${result.count} future planned workouts.`,
      color: 'success'
    })
  } catch (error) {
    console.error('Failed to clear schedule', error)
    toast.add({
      title: 'Action Failed',
      description: 'Could not clear future workouts.',
      color: 'error'
    })
  } finally {
    clearingSchedule.value = false
  }
}
</script>
