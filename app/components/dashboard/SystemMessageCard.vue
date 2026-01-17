<template>
  <UAlert
    v-if="message"
    :title="message.title"
    :description="message.content"
    :color="color"
    :variant="variant"
    :icon="icon"
    :close="{
      icon: 'i-heroicons-x-mark-20-solid',
      color: 'neutral',
      variant: 'link'
    }"
    class="mb-6 w-full shadow-sm"
    @update:open="dismiss"
  />
</template>

<script setup lang="ts">
  const message = ref<any>(null)

  // Map message types to UI props
  const typeConfig: Record<string, { color: string; icon: string }> = {
    INFO: { color: 'info', icon: 'i-heroicons-information-circle' },
    WARNING: { color: 'warning', icon: 'i-heroicons-exclamation-triangle' },
    ERROR: { color: 'error', icon: 'i-heroicons-exclamation-circle' },
    SUCCESS: { color: 'success', icon: 'i-heroicons-check-circle' }
  }

  const color = computed(() => (typeConfig[message.value?.type]?.color || 'primary') as any)
  const icon = computed(
    () => typeConfig[message.value?.type]?.icon || 'i-heroicons-information-circle'
  )
  const variant = 'subtle'

  async function fetchMessage() {
    try {
      const { message: msg } = await $fetch<{ message: any }>('/api/system-messages/latest')
      message.value = msg
    } catch (e) {
      console.error('Failed to fetch system message', e)
    }
  }

  async function dismiss() {
    if (!message.value) return

    const id = message.value.id
    message.value = null // Hide immediately

    try {
      await $fetch('/api/system-messages/dismiss', {
        method: 'POST',
        body: { messageId: id }
      })
    } catch (e) {
      console.error('Failed to dismiss message', e)
    }
  }

  onMounted(fetchMessage)
</script>
