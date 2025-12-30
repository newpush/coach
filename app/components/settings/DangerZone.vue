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

    <!-- Athlete Profile Management -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-user-circle" class="w-5 h-5 text-warning" />
          <h2 class="text-xl font-semibold">Athlete Profile</h2>
        </div>
      </template>
      
      <div class="space-y-4">
        <div>
          <h3 class="font-medium mb-1">Wipe Athlete Profiles</h3>
          <p class="text-sm text-muted mb-3">
            Remove all AI-generated athlete profiles and clear cached performance scores. This is useful if your scores were calculated using duplicate workout data.
          </p>
          <UButton 
            color="warning" 
            variant="soft"
            :loading="wipingProfiles"
            @click="confirmWipeProfiles"
          >
            Wipe Profiles & Scores
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
        <UButton 
          color="error" 
          variant="outline"
          :loading="deletingAccount"
          @click="confirmDeleteAccount"
        >
          Delete Account
        </UButton>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const toast = useToast()
const { signOut } = useAuth()
const clearingSchedule = ref(false)
const wipingProfiles = ref(false)
const deletingAccount = ref(false)

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

async function confirmWipeProfiles() {
  if (!confirm('Are you sure? This will permanently delete all AI athlete profiles and reset your performance scores (Fitness, Recovery, etc.). You will need to regenerate them from the dashboard.')) {
    return
  }

  wipingProfiles.value = true
  try {
    const result: any = await $fetch('/api/profile/athlete-profiles', {
      method: 'DELETE'
    })
    
    toast.add({
      title: 'Profiles Wiped',
      description: `Removed ${result.count} profile records and reset scores.`,
      color: 'success'
    })
  } catch (error) {
    console.error('Failed to wipe profiles', error)
    toast.add({
      title: 'Action Failed',
      description: 'Could not wipe athlete profiles.',
      color: 'error'
    })
  } finally {
    wipingProfiles.value = false
  }
}

async function confirmDeleteAccount() {
  if (!confirm('ARE YOU SURE? This action is irreversible. All your data including workouts, metrics, and reports will be permanently deleted.')) {
    return
  }

  deletingAccount.value = true
  try {
    await $fetch('/api/profile', {
      method: 'DELETE'
    })
    
    toast.add({
      title: 'Account Deleted',
      description: 'Your account has been scheduled for deletion. Signing out...',
      color: 'success'
    })

    // Give a moment for the toast to be seen? No, just sign out.
    await signOut({ callbackUrl: '/login' })
    
  } catch (error) {
    console.error('Failed to delete account', error)
    toast.add({
      title: 'Action Failed',
      description: 'Could not delete account. Please try again.',
      color: 'error'
    })
    deletingAccount.value = false
  }
}
</script>
