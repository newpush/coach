<script setup lang="ts">
import { useChat } from '@ai-sdk/vue'

definePageMeta({
  middleware: 'auth'
})

const { messages, input, handleSubmit, status, stop, reload } = useChat({
  api: '/api/chat/stream'
})

const copied = ref(false)
const clipboard = useClipboard()

function copy(e: MouseEvent, message: any) {
  const text = message.content
  clipboard.copy(text)
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 2000)
}
</script>

<template>
  <UDashboardPanel id="chat" class="relative">
    <template #header>
      <UDashboardNavbar>
        <template #left>
          <h1 class="text-xl font-semibold">AI Coach Chat</h1>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-col h-full w-full max-w-4xl mx-auto">
        <UChatMessages
          :messages="messages"
          :status="status === 'streaming' ? 'streaming' : 'ready'"
          :assistant="status !== 'streaming' ? { actions: [{ label: 'Copy', icon: copied ? 'i-lucide-copy-check' : 'i-lucide-copy', onClick: copy }] } : { actions: [] }"
          class="flex-1 p-4"
        >
          <template #content="{ message }">
            <div v-if="message.parts && message.parts.length > 0">
              <template v-for="(part, index) in message.parts" :key="index">
                <Reasoning
                  v-if="part.type === 'reasoning'"
                  :text="part.text"
                  :is-streaming="part.state !== 'done'"
                />
                <MDC
                  v-else-if="part.type === 'text'"
                  :value="part.text"
                  class="prose dark:prose-invert max-w-none"
                />
              </template>
            </div>
            <div v-else>
               <MDC :value="message.content" class="prose dark:prose-invert max-w-none" />
            </div>
          </template>
        </UChatMessages>

        <div class="p-4 border-t border-gray-200 dark:border-gray-800">
          <UChatPrompt
            v-model="input"
            variant="subtle"
            class="[view-transition-name:chat-prompt]"
            @submit="handleSubmit"
          >
            <template #footer>
               <UChatPromptSubmit
                :status="status"
                color="neutral"
                @stop="stop"
                @reload="reload"
              />
            </template>
          </UChatPrompt>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>