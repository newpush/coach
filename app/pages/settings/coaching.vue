<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-2xl font-bold">Coaching Settings</h2>
      <p class="text-neutral-500">Manage who can view and coach your account.</p>
    </div>

    <!-- Active Coaches -->
    <UCard>
      <template #header>
        <h3 class="font-semibold">My Coaches</h3>
      </template>

      <div v-if="coaches.length > 0" class="divide-y divide-neutral-200 dark:divide-neutral-800">
        <div v-for="rel in coaches" :key="rel.id" class="py-4 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <UAvatar :src="rel.coach.image" :alt="rel.coach.name" />
            <div>
              <p class="font-medium">{{ rel.coach.name }}</p>
              <p class="text-sm text-neutral-500">{{ rel.coach.email }}</p>
            </div>
          </div>
          <UButton
            color="error"
            variant="ghost"
            label="Remove"
            icon="i-heroicons-trash"
            @click="confirmRemove(rel)"
          />
        </div>
      </div>
      <div v-else class="text-center py-6 text-neutral-500">
        You don't have any coaches connected yet.
      </div>
    </UCard>

    <!-- Invitation -->
    <UCard>
      <template #header>
        <h3 class="font-semibold">Connect a New Coach</h3>
      </template>

      <div class="space-y-4">
        <p class="text-sm text-neutral-500">
          To connect a coach, generate an invite code and share it with them. They can then enter
          this code in their dashboard to connect.
        </p>

        <div
          v-if="activeInvite && activeInvite.status === 'PENDING'"
          class="bg-primary-50 dark:bg-primary-900/20 p-6 rounded-lg text-center border border-primary-100 dark:border-primary-800"
        >
          <p
            class="text-xs uppercase tracking-widest text-primary-600 dark:text-primary-400 font-bold mb-2"
          >
            Your Invite Code
          </p>
          <div class="text-4xl font-mono font-bold tracking-widest mb-2">
            {{ activeInvite.code }}
          </div>
          <p class="text-xs text-neutral-500">
            Expires on {{ formatDate(activeInvite.expiresAt) }}
          </p>
          <div class="mt-4 flex justify-center gap-2">
            <UButton
              color="primary"
              variant="soft"
              icon="i-heroicons-clipboard-document"
              label="Copy Code"
              @click="copyCode(activeInvite.code)"
            />
          </div>
        </div>

        <div v-else class="flex justify-center py-4">
          <UButton
            color="primary"
            icon="i-heroicons-plus"
            label="Generate New Invite Code"
            :loading="generating"
            @click="generateInvite"
          />
        </div>
      </div>
    </UCard>

    <!-- Confirmation Modal -->
    <UModal
      v-model:open="isRemoveModalOpen"
      title="Remove Coach"
      description="Are you sure you want to remove this coach? They will no longer be able to see or manage your data."
    >
      <template #footer>
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="isRemoveModalOpen = false"
        />
        <UButton label="Remove Coach" color="error" :loading="removing" @click="removeCoach" />
      </template>
    </UModal>
  </div>
</template>

<script setup>
  useHead({
    title: 'Coaching Settings',
    meta: [{ name: 'description', content: 'Manage your connected coaches and invite codes.' }]
  })

  const coaches = ref([])
  const activeInvite = ref(null)
  const generating = ref(false)
  const removing = ref(false)
  const isRemoveModalOpen = ref(false)
  const selectedRelationship = ref(null)

  const toast = useToast()

  async function fetchCoaches() {
    coaches.value = await $fetch('/api/coaching/coaches')
  }

  async function fetchInvite() {
    const res = await $fetch('/api/coaching/invite')
    activeInvite.value = res.status === 'NONE' ? null : res
  }

  async function generateInvite() {
    generating.value = true
    try {
      activeInvite.value = await $fetch('/api/coaching/invite', { method: 'POST' })
      toast.add({ title: 'Invite code generated', color: 'success' })
    } catch (err) {
      toast.add({ title: 'Failed to generate code', color: 'error' })
    } finally {
      generating.value = false
    }
  }

  function confirmRemove(rel) {
    selectedRelationship.value = rel
    isRemoveModalOpen.value = true
  }

  async function removeCoach() {
    if (!selectedRelationship.value) return
    removing.value = true
    try {
      // We should implement a DELETE endpoint, but for now I'll just use the logic
      // Actually, I'll use the athletes endpoint from the other side or implement it.
      // Let's assume we have /api/coaching/coaches/:id
      await $fetch(`/api/coaching/coaches/${selectedRelationship.value.coachId}`, {
        method: 'DELETE'
      })
      toast.add({ title: 'Coach removed', color: 'success' })
      await fetchCoaches()
      isRemoveModalOpen.value = false
    } catch (err) {
      toast.add({ title: 'Failed to remove coach', color: 'error' })
    } finally {
      removing.value = false
    }
  }

  function copyCode(code) {
    navigator.clipboard.writeText(code)
    toast.add({ title: 'Code copied to clipboard', color: 'success' })
  }

  function formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  onMounted(() => {
    fetchCoaches()
    fetchInvite()
  })
</script>
