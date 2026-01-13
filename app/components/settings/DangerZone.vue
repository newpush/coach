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
            Remove all uncompleted planned workouts scheduled for future dates. This is useful if
            you want to regenerate your plan completely.
          </p>
          <UButton
            color="warning"
            variant="soft"
            :loading="clearingSchedule"
            @click="isClearScheduleModalOpen = true"
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
            Remove all AI-generated athlete profiles and clear cached performance scores. This is
            useful if your scores were calculated using duplicate workout data.
          </p>
          <UButton
            color="warning"
            variant="soft"
            :loading="wipingProfiles"
            @click="isWipeProfilesModalOpen = true"
          >
            Wipe Profiles & Scores
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- AI Analysis Management -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-warning" />
          <h2 class="text-xl font-semibold">AI Analysis Data</h2>
        </div>
      </template>

      <div class="space-y-4">
        <div>
          <h3 class="font-medium mb-1">Wipe AI Recommendations & Analysis</h3>
          <p class="text-sm text-muted mb-3">
            Remove all AI-generated workout analysis, recommendations, and reports. This will not
            delete your actual workout data, only the AI insights.
          </p>
          <UButton
            color="warning"
            variant="soft"
            :loading="wipingAnalysis"
            @click="isWipeAnalysisModalOpen = true"
          >
            Wipe AI Data
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
          @click="isDeleteAccountModalOpen = true"
        >
          Delete Account
        </UButton>
      </div>
    </UCard>

    <!-- Clear Schedule Confirmation Modal -->
    <UModal v-model:open="isClearScheduleModalOpen" title="Clear Future Schedule">
      <template #body>
        <p>
          Are you sure? This will delete ALL future planned workouts from your schedule AND remove
          them from Intervals.icu.
        </p>
      </template>

      <template #footer>
        <div class="flex gap-2 justify-end w-full">
          <UButton color="neutral" variant="ghost" @click="isClearScheduleModalOpen = false"
            >Cancel</UButton
          >
          <UButton color="warning" :loading="clearingSchedule" @click="executeClearSchedule"
            >Clear Future Workouts</UButton
          >
        </div>
      </template>
    </UModal>

    <!-- Wipe Profiles Confirmation Modal -->
    <UModal v-model:open="isWipeProfilesModalOpen" title="Wipe Athlete Profiles">
      <template #body>
        <p>
          Are you sure? This will permanently delete all AI athlete profiles and reset your
          performance scores (Fitness, Recovery, etc.). You will need to regenerate them from the
          dashboard.
        </p>
      </template>
      <template #footer>
        <div class="flex gap-2 justify-end w-full">
          <UButton color="neutral" variant="ghost" @click="isWipeProfilesModalOpen = false"
            >Cancel</UButton
          >
          <UButton color="warning" :loading="wipingProfiles" @click="executeWipeProfiles"
            >Wipe Profiles & Scores</UButton
          >
        </div>
      </template>
    </UModal>

    <!-- Wipe AI Analysis Confirmation Modal -->
    <UModal v-model:open="isWipeAnalysisModalOpen" title="Wipe AI Analysis Data">
      <template #body>
        <p>
          Are you sure? This will delete all AI-generated workout analyses, recommendations, and
          reports. You can regenerate them individually.
        </p>
      </template>
      <template #footer>
        <div class="flex gap-2 justify-end w-full">
          <UButton color="neutral" variant="ghost" @click="isWipeAnalysisModalOpen = false"
            >Cancel</UButton
          >
          <UButton color="warning" :loading="wipingAnalysis" @click="executeWipeAnalysis"
            >Wipe AI Data</UButton
          >
        </div>
      </template>
    </UModal>

    <!-- Delete Account Confirmation Modal -->
    <UModal v-model:open="isDeleteAccountModalOpen" title="Delete Account">
      <template #body>
        <p class="text-error font-semibold mb-2">Warning: This action is irreversible.</p>
        <p>All your data including workouts, metrics, and reports will be permanently deleted.</p>
      </template>
      <template #footer>
        <div class="flex gap-2 justify-end w-full">
          <UButton color="neutral" variant="ghost" @click="isDeleteAccountModalOpen = false"
            >Cancel</UButton
          >
          <UButton color="error" :loading="deletingAccount" @click="executeDeleteAccount"
            >Delete Account</UButton
          >
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
  const toast = useToast()
  const { signOut } = useAuth()
  const clearingSchedule = ref(false)
  const wipingProfiles = ref(false)
  const wipingAnalysis = ref(false)
  const deletingAccount = ref(false)
  const isClearScheduleModalOpen = ref(false)
  const isWipeProfilesModalOpen = ref(false)
  const isWipeAnalysisModalOpen = ref(false)
  const isDeleteAccountModalOpen = ref(false)

  async function executeClearSchedule() {
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
      isClearScheduleModalOpen.value = false
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

  async function executeWipeAnalysis() {
    wipingAnalysis.value = true
    try {
      const result: any = await $fetch('/api/profile/ai-analysis', {
        method: 'DELETE'
      })

      toast.add({
        title: 'AI Data Wiped',
        description: `Cleared ${result.counts.workouts} analyses and ${result.counts.recommendations} recommendations.`,
        color: 'success'
      })
      isWipeAnalysisModalOpen.value = false
    } catch (error) {
      console.error('Failed to wipe AI data', error)
      toast.add({
        title: 'Action Failed',
        description: 'Could not wipe AI analysis data.',
        color: 'error'
      })
    } finally {
      wipingAnalysis.value = false
    }
  }

  async function executeWipeProfiles() {
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
      isWipeProfilesModalOpen.value = false
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

  async function executeDeleteAccount() {
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
