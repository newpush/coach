<script setup lang="ts">
import { onMounted, ref } from 'vue'

definePageMeta({
  middleware: 'auth'
})

const isClient = ref(false)
const colorMode = useColorMode()
const theme = computed(() => colorMode.value === 'dark' ? 'dark' : 'light')

const currentUserId = ref('')
const roomId = ref('')
const rooms = ref([])
const messages = ref([])
const messagesLoaded = ref(false)
const loadingRooms = ref(true)
const debugError = ref('')

// Initialize chat
onMounted(async () => {
  if (process.client) {
    const { register } = await import('vue-advanced-chat')
    register()
    isClient.value = true
    
    // Fetch user session to get ID
    const { data: session } = await useFetch('/api/auth/session')
    if (session.value?.user?.id) {
      currentUserId.value = session.value.user.id
      await fetchRooms()
    }
  }
})

async function fetchRooms() {
  loadingRooms.value = true
  debugError.value = ''
  try {
    const data = await $fetch('/api/chat/rooms')
    rooms.value = data
    if (data && data.length > 0) {
      roomId.value = data[0].roomId
      await fetchMessages({ room: data[0] })
    }
  } catch (error: any) {
    console.error('Error fetching rooms:', error)
    debugError.value = `Failed to load rooms: ${error.message || error}`
  } finally {
    loadingRooms.value = false
  }
}

async function fetchMessages({ room, options = {} }: any) {
  if (!room?.roomId) return
  
  // Update current room ID to trigger UI switch
  roomId.value = room.roomId
  
  if (options.reset) {
    messages.value = []
    messagesLoaded.value = false
  }
  
  try {
    const data = await $fetch(`/api/chat/messages?roomId=${room.roomId}`)
    
    if (options.reset) {
      messages.value = data
    } else {
      messages.value = data
    }
    messagesLoaded.value = true
  } catch (error) {
    console.error('Error fetching messages:', error)
  }
}

async function sendMessage({ content, roomId: rid, files, replyMessage }: any) {
  const tempId = Date.now().toString()
  const userMsg = {
    _id: tempId,
    content: content,
    senderId: currentUserId.value,
    username: 'Me',
    avatar: rooms.value[0]?.users.find((u: any) => u._id === currentUserId.value)?.avatar,
    date: new Date().toLocaleDateString(),
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    saved: false,
    distributed: false,
    seen: false,
    disableActions: false,
    disableReactions: false
  }
  
  messages.value = [...messages.value, userMsg]

  try {
    const response = await $fetch('/api/chat/messages', {
      method: 'POST',
      body: {
        roomId: rid,
        content,
        files,
        replyMessage
      }
    })

    const index = messages.value.findIndex((m: any) => m._id === tempId)
    if (index !== -1) {
      const newMessages = [...messages.value]
      newMessages[index] = { ...newMessages[index], saved: true, distributed: true, seen: true }
      messages.value = newMessages
    }

    messages.value = [...messages.value, response]
    
  } catch (error) {
    console.error('Error sending message:', error)
  }
}

async function createRoom() {
  try {
    const newRoom = await $fetch('/api/chat/rooms', {
      method: 'POST'
    })
    rooms.value = [newRoom, ...rooms.value]
    // Properly select the new room by calling fetchMessages
    await fetchMessages({ room: newRoom, options: { reset: true } })
  } catch (error: any) {
    console.error('Error creating room:', error)
    alert('Failed to create new chat')
  }
}
</script>

<template>
  <UDashboardPanel id="chat" :ui="{ body: 'p-0' }">
    <template #header>
      <UDashboardNavbar title="Chat with Coach Watts" />
    </template>
    
    <template #body>
      <div class="h-full relative">
        <div v-if="debugError" class="absolute top-0 left-0 w-full bg-red-100 text-red-700 p-2 z-50">
          {{ debugError }}
        </div>
        
        <ClientOnly>
          <vue-advanced-chat
            v-if="isClient && currentUserId"
            height="100%"
            :current-user-id="currentUserId"
            :rooms="JSON.stringify(rooms)"
            :loading-rooms="loadingRooms"
            :rooms-loaded="!loadingRooms"
            :messages="JSON.stringify(messages)"
            :room-id="roomId"
            :messages-loaded="messagesLoaded"
            :theme="theme"
            :show-add-room="true"
            @send-message="sendMessage($event.detail[0])"
            @fetch-messages="fetchMessages($event.detail[0])"
            @add-room="createRoom"
          />
          <div v-else class="flex items-center justify-center h-full">
            <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-gray-400" />
          </div>
        </ClientOnly>
      </div>
    </template>
  </UDashboardPanel>
</template>
