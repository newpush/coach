<script setup lang="ts">
import { onMounted, ref } from 'vue'

definePageMeta({
  middleware: 'auth'
})

const isClient = ref(false)
const colorMode = useColorMode()
const theme = computed(() => colorMode.value === 'dark' ? 'dark' : 'light')

onMounted(async () => {
  if (process.client) {
    const { register } = await import('vue-advanced-chat')
    register()
    isClient.value = true
  }
})

const currentUserId = 'user1'
const roomId = 'room1'
const rooms = ref([
  {
    roomId: 'room1',
    roomName: 'AI Coach',
    avatar: '/images/logo.svg',
    users: [
      { _id: 'user1', username: 'Me' },
      { _id: 'ai_coach', username: 'Coach Watts' }
    ]
  }
])
const messages = ref([])
const messagesLoaded = ref(true)

function fetchMessages({ room, options = {} }: any) {
  // Simulating message fetch
  if (options.reset) {
    messages.value = []
  }
}

function sendMessage({ content, roomId, files, replyMessage }: any) {
  const message = {
    _id: Date.now().toString(),
    content: content,
    senderId: currentUserId,
    timestamp: new Date().toString().substring(16, 21),
    date: new Date().toDateString()
  }
  
  messages.value = [...messages.value, message]
}
</script>

<template>

  <UDashboardPanel id="chat" :ui="{ body: 'p-0' }">

    <template #header>

      <UDashboardNavbar title="Chat with Coach Watts" />

    </template>

    

    <template #body>

      <div class="h-full">

        <ClientOnly>

          <vue-advanced-chat

            v-if="isClient"

            height="100%"

            :current-user-id="currentUserId"

            :rooms="JSON.stringify(rooms)"

            :messages="JSON.stringify(messages)"

            :room-id="roomId"

            :messages-loaded="messagesLoaded"

            :theme="theme"

            @send-message="sendMessage($event.detail[0])"

            @fetch-messages="fetchMessages($event.detail[0])"

          />

        </ClientOnly>

      </div>

    </template>

  </UDashboardPanel>

</template>
