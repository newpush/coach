<template>
  <div
    class="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-40 transition-all duration-300"
    :class="{ 'opacity-0 translate-y-4 pointer-events-none': !isVisible }"
  >
    <div
      class="bg-white/90 dark:bg-gray-950/95 backdrop-blur-xl border border-gray-200 dark:border-gray-800 rounded-2xl p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.2)] ring-1 ring-black/5 dark:ring-white/10"
    >
      <UInput
        v-model="input"
        icon="i-heroicons-sparkles"
        placeholder="Ask anything or log data (e.g., 'Log 3 eggs for breakfast' or 'How was my sleep?')..."
        size="lg"
        variant="none"
        class="w-full"
        :loading="isSending"
        @keyup.enter="handleSubmit"
      >
        <template #trailing>
          <div class="flex items-center gap-2 mr-1">
            <kbd
              v-if="!input"
              class="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded border border-gray-200 dark:border-gray-800 text-[10px] font-medium text-gray-400"
            >
              Ask Coach
            </kbd>
            <UButton
              v-else
              icon="i-heroicons-paper-airplane"
              color="primary"
              variant="solid"
              size="sm"
              class="rounded-xl px-4 font-bold"
              :loading="isSending"
              @click="handleSubmit"
            >
              Send
            </UButton>
          </div>
        </template>
      </UInput>
    </div>
  </div>
</template>

<script setup lang="ts">
  const input = ref('')
  const isSending = ref(false)
  const isVisible = ref(false)
  const route = useRoute()
  const router = useRouter()
  const toast = useToast()

  // Only show on specific pages (e.g. Dashboard, Activities, Nutrition index)
  // Hide on the full chat page itself to avoid duplication
  const enabledPages = [
    '/dashboard',
    '/activities',
    '/nutrition',
    '/performance',
    '/fitness',
    '/plan'
  ]

  watch(
    () => route.path,
    (path) => {
      isVisible.value =
        enabledPages.some((p) => path === p || path.startsWith(p + '/')) && path !== '/chat'
    },
    { immediate: true }
  )

  async function handleSubmit() {
    if (!input.value.trim() || isSending.value) return
    isSending.value = true

    try {
      const text = input.value
      input.value = ''

      // 1. Redirect to chat page with the initial message
      // The chat page logic will automatically create a new room and send the message
      await router.push({
        path: '/chat',
        query: {
          initialMessage: text
        }
      })

      toast.add({
        title: 'Coach is thinking...',
        color: 'primary',
        icon: 'i-heroicons-sparkles'
      })
    } catch (e: any) {
      console.error('[QuickCapture] Error:', e)
      toast.add({
        title: 'Error',
        description: 'Could not send message. Please try again.',
        color: 'error'
      })
    } finally {
      isSending.value = false
    }
  }
</script>
