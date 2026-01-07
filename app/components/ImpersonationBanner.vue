<template>
  <div
    v-if="isImpersonating"
    class="bg-yellow-500 text-black py-2 px-4 rounded-md shadow-lg flex items-center gap-4 fixed bottom-4 right-4 z-[60]"
  >
    <div class="flex items-center gap-2 text-sm font-medium">
      <UIcon name="i-heroicons-eye" class="w-5 h-5" />
      <span>
        Impersonating <strong>{{ impersonatedUserEmail }}</strong>
      </span>
    </div>
    <div class="flex items-center gap-4">
      <UButton
        color="neutral"
        variant="solid"
        size="xs"
        label="Exit"
        :loading="stopping"
        @click="stopImpersonation"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
  const { data, refresh } = useAuth()
  const toast = useToast()
  const stopping = ref(false)

  const impersonationMeta = useCookie<{
    adminId: string
    adminEmail: string
    impersonatedUserId: string
    impersonatedUserEmail: string
  }>('auth.impersonation_meta')

  const isImpersonating = computed(() => !!impersonationMeta.value)
  const impersonatedUserEmail = computed(() => impersonationMeta.value?.impersonatedUserEmail)
  const originalUserEmail = computed(() => impersonationMeta.value?.adminEmail)

  async function stopImpersonation() {
    stopping.value = true
    try {
      await $fetch('/api/admin/stop-impersonation', { method: 'POST' })
      toast.add({
        title: 'Impersonation stopped',
        description: 'Returning to admin account',
        color: 'success'
      })
      // Refresh session and redirect
      await refresh()
      await navigateTo('/admin/users')
    } catch (error) {
      console.error('Failed to stop impersonation:', error)
      toast.add({
        title: 'Error',
        description: 'Failed to stop impersonation',
        color: 'error'
      })
    } finally {
      stopping.value = false
    }
  }
</script>
