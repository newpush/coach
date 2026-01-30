<template>
  <UAlert
    v-if="message"
    :title="message.title"
    :color="isAdvert ? 'gray' : color"
    :variant="variant"
    :icon="icon"
    :close="{
      icon: 'i-heroicons-x-mark-20-solid',
      color: 'neutral',
      variant: 'link',
      onClick: (e: Event) => e.stopPropagation()
    }"
    class="mb-6 w-full shadow-sm transition-all duration-200"
    :class="[
      { 'cursor-pointer': !!message.targetUrl },
      isAdvert
        ? '!bg-amber-50/40 dark:!bg-[#1c1a17] ring-1 !ring-amber-400/40 dark:!ring-amber-500/40'
        : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
    ]"
    :ui="{
      title: isAdvert ? 'text-gray-900 dark:text-gray-100 font-bold max-w-[40ch]' : undefined,
      description: isAdvert ? 'text-gray-800 dark:text-gray-200' : undefined,
      icon: { base: isAdvert ? 'text-amber-500 dark:text-amber-500' : undefined },
      close: isAdvert
        ? 'text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors'
        : undefined
    }"
    @click="handleClick"
    @update:open="dismiss"
  >
    <template #description>
      <div class="flex flex-col gap-4">
        <div
          class="prose dark:prose-invert max-w-none text-sm leading-relaxed"
          :class="{
            'prose-strong:text-amber-600 dark:prose-strong:text-amber-400 prose-strong:font-bold':
              isAdvert
          }"
          v-html="parsedContent"
        ></div>
        <div v-if="message.actionLabel" class="mt-1 flex flex-col gap-2 items-start">
          <UButton
            :label="message.actionLabel"
            size="xs"
            :color="isAdvert ? 'warning' : color"
            variant="solid"
            class="font-semibold shadow-lg shadow-amber-500/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-amber-500/35 active:translate-y-0"
            @click.stop="handleAction"
          />
          <span
            v-if="isAdvert"
            class="text-[10px] text-gray-500 dark:text-gray-400 font-medium ml-1 mt-0.5"
          >
            No commitment • Cancel anytime
          </span>
        </div>
      </div>
    </template>
  </UAlert>
</template>

<script setup lang="ts">
  import { marked } from 'marked'

  const message = ref<any>(null)
  const parsedContent = computed(() => {
    if (!message.value?.content) return ''
    return marked.parse(message.value.content)
  })

  // Map message types to UI props
  const typeConfig: Record<string, { color: string; icon: string }> = {
    INFO: { color: 'info', icon: 'i-heroicons-information-circle' },
    WARNING: { color: 'warning', icon: 'i-heroicons-exclamation-triangle' },
    ERROR: { color: 'error', icon: 'i-heroicons-exclamation-circle' },
    SUCCESS: { color: 'success', icon: 'i-heroicons-check-circle' },
    ADVERT: { color: 'warning', icon: 'i-heroicons-sparkles' }
  }

  const color = computed(() => (typeConfig[message.value?.type]?.color || 'primary') as any)
  const icon = computed(
    () => typeConfig[message.value?.type]?.icon || 'i-heroicons-information-circle'
  )
  const isAdvert = computed(() => message.value?.type === 'ADVERT')
  const variant = 'subtle'

  async function fetchMessage() {
    try {
      const { message: msg } = await $fetch<{ message: any }>('/api/system-messages/latest')
      message.value = msg
    } catch (e) {
      console.error('Failed to fetch system message', e)
    }
  }

  function handleClick() {
    if (message.value?.targetUrl) {
      navigateTo(message.value.targetUrl, { external: true })
    }
  }

  function handleAction() {
    if (message.value?.targetUrl) {
      navigateTo(message.value.targetUrl, { external: true })
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
