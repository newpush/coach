<script setup lang="ts">
import { ref, computed } from 'vue'

definePageMeta({
  middleware: 'auth'
})

interface Message {
  id: string
  role: 'user' | 'assistant'
  parts: Array<{
    type: 'text'
    id: string
    text: string
  }>
  metadata?: {
    charts?: Array<{
      id: string
      type: 'line' | 'bar' | 'doughnut' | 'radar'
      title: string
      labels: string[]
      datasets: Array<{
        label: string
        data: number[]
        color?: string
      }>
    }>
    createdAt?: Date
    senderId?: string
  }
}

interface Room {
  roomId: string
  roomName: string
  avatar: string
  lastMessage?: {
    content: string
    timestamp: string
  }
  index: number
}

// State
const input = ref('')
const messages = ref<Message[]>([])
const status = ref<'ready' | 'submitted' | 'streaming' | 'error'>('ready')
const error = ref<Error | null>(null)
const currentRoomId = ref('')
const loadingMessages = ref(true)
const rooms = ref<Room[]>([])
const loadingRooms = ref(true)

// Fetch session and initialize
const { data: session } = await useFetch('/api/auth/session')
const currentUserId = computed(() => (session.value?.user as any)?.id)

// Load initial room and messages
onMounted(async () => {
  await loadChat()
})

async function loadRooms() {
  try {
    loadingRooms.value = true
    const loadedRooms = await $fetch<Room[]>('/api/chat/rooms')
    rooms.value = loadedRooms
    
    // Select first room if we don't have a current one
    if (!currentRoomId.value && loadedRooms.length > 0) {
      await selectRoom(loadedRooms[0].roomId)
    }
  } catch (err: any) {
    console.error('Failed to load rooms:', err)
    error.value = err
  } finally {
    loadingRooms.value = false
  }
}

async function loadMessages(roomId: string) {
  try {
    loadingMessages.value = true
    const loadedMessages = await $fetch<Message[]>(`/api/chat/messages?roomId=${roomId}`)
    messages.value = loadedMessages
  } catch (err: any) {
    console.error('Failed to load messages:', err)
    error.value = err
  } finally {
    loadingMessages.value = false
  }
}

async function loadChat() {
  await loadRooms()
}

async function selectRoom(roomId: string) {
  currentRoomId.value = roomId
  await loadMessages(roomId)
}

async function onSubmit() {
  if (!input.value.trim() || !currentRoomId.value) return
  
  const userMessage = input.value.trim()
  input.value = ''
  
  // Add user message immediately
  const tempUserMessage: Message = {
    id: `temp-${Date.now()}`,
    role: 'user',
    parts: [{
      type: 'text',
      id: `text-temp-${Date.now()}`,
      text: userMessage
    }],
    metadata: {
      createdAt: new Date()
    }
  }
  messages.value.push(tempUserMessage)
  
  try {
    status.value = 'submitted'
    error.value = null
    
    // Send message and get AI response
    const response = await $fetch<Message>('/api/chat/messages', {
      method: 'POST',
      body: {
        roomId: currentRoomId.value,
        content: userMessage
      }
    })
    
    // Replace temp message with real one and add AI response
    messages.value = messages.value.filter(m => m.id !== tempUserMessage.id)
    messages.value.push({
      id: `user-${Date.now()}`,
      role: 'user',
      parts: [{
        type: 'text',
        id: `text-user-${Date.now()}`,
        text: userMessage
      }],
      metadata: {
        createdAt: new Date()
      }
    })
    messages.value.push(response)
    
    // Refresh rooms to update last message
    await loadRooms()
    
    status.value = 'ready'
  } catch (err: any) {
    console.error('Failed to send message:', err)
    error.value = err
    status.value = 'error'
    
    // Remove temp message on error
    messages.value = messages.value.filter(m => m.id !== tempUserMessage.id)
  }
}

async function createNewChat() {
  try {
    const newRoom = await $fetch<Room>('/api/chat/rooms', {
      method: 'POST'
    })
    
    // Add to rooms list
    rooms.value.unshift(newRoom)
    
    // Switch to new room
    await selectRoom(newRoom.roomId)
    input.value = ''
  } catch (err: any) {
    console.error('Failed to create new chat:', err)
  }
}

// Helper to get text from message
function getTextFromMessage(message: Message): string {
  return message.parts.find(p => p.type === 'text')?.text || ''
}

// Helper to get charts from message
function getChartsFromMessage(message: Message) {
  return message.metadata?.charts || []
}

// Get current room name
const currentRoomName = computed(() => {
  const room = rooms.value.find(r => r.roomId === currentRoomId.value)
  return room?.roomName || 'Coach Watts'
})

// Format timestamp for display
function formatTimestamp(timestamp: string | undefined) {
  if (!timestamp) return ''
  return timestamp
}
</script>

<template>
  <UDashboardPanel id="chat" :ui="{ body: 'p-0' }">
    <template #header>
      <UDashboardNavbar :title="currentRoomName">
        <template #right>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-heroicons-plus"
            aria-label="New Chat"
            size="sm"
            @click="createNewChat"
          />
          <UButton
            to="/settings/ai"
            color="neutral"
            variant="ghost"
            icon="i-heroicons-cog-6-tooth"
            aria-label="AI Settings"
            size="sm"
          />
        </template>
      </UDashboardNavbar>
    </template>
    
    <template #body>
      <div class="flex h-full">
        <!-- Room List Sidebar -->
        <div class="w-64 border-r border-gray-200 dark:border-gray-800 flex flex-col bg-gray-50 dark:bg-gray-900">
          <div class="p-4 border-b border-gray-200 dark:border-gray-800">
            <h2 class="text-sm font-semibold text-gray-900 dark:text-white">Chat History</h2>
          </div>
          
          <div class="flex-1 overflow-y-auto p-2">
            <div v-if="loadingRooms" class="flex items-center justify-center py-8">
              <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-400" />
            </div>
            
            <div v-else class="space-y-1">
              <button
                v-for="room in rooms"
                :key="room.roomId"
                :class="[
                  'w-full text-left px-3 py-2 rounded-lg transition-colors',
                  room.roomId === currentRoomId
                    ? 'bg-primary-100 dark:bg-primary-900 text-primary-900 dark:text-primary-100'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                ]"
                @click="selectRoom(room.roomId)"
              >
                <div class="flex items-start gap-2">
                  <UAvatar :src="room.avatar" size="xs" class="mt-0.5" />
                  <div class="flex-1 min-w-0">
                    <div class="font-medium truncate text-sm">
                      {{ room.roomName }}
                    </div>
                    <div v-if="room.lastMessage" class="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                      {{ room.lastMessage.content.substring(0, 40) }}{{ room.lastMessage.content.length > 40 ? '...' : '' }}
                    </div>
                  </div>
                </div>
              </button>
              
              <div v-if="rooms.length === 0" class="text-center py-8 text-sm text-gray-500">
                No chat history yet
              </div>
            </div>
          </div>
        </div>

        <!-- Chat Messages Area -->
        <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
          <!-- Messages Container with proper overflow -->
          <div class="flex-1 overflow-y-auto">
            <UContainer class="h-full">
              <div v-if="loadingMessages" class="flex items-center justify-center h-full">
                <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-gray-400" />
              </div>
              
              <UChatMessages
                v-else
                :messages="messages"
                :status="status"
                :should-auto-scroll="true"
                :user="{
                  side: 'right',
                  variant: 'soft'
                }"
                :assistant="{
                  side: 'left',
                  variant: 'naked',
                  avatar: { src: '/images/logo.svg' }
                }"
              >
                <!-- Custom content rendering for each message -->
                <template #content="{ message }">
                  <div class="space-y-4">
                    <!-- Text content with markdown support -->
                    <div v-if="getTextFromMessage(message)" class="prose prose-sm dark:prose-invert max-w-none">
                      <MDC :value="getTextFromMessage(message)" :cache-key="message.id" />
                    </div>
                    
                    <!-- Inline charts -->
                    <div v-if="getChartsFromMessage(message).length > 0" class="space-y-4">
                      <ChatChart
                        v-for="chart in getChartsFromMessage(message)"
                        :key="chart.id"
                        :chart-data="chart"
                      />
                    </div>
                  </div>
                </template>
              </UChatMessages>
            </UContainer>
          </div>

          <!-- Chat Prompt Footer -->
          <div class="flex-shrink-0 border-t border-gray-200 dark:border-gray-800">
            <UContainer class="py-4">
              <UChatPrompt
                v-model="input"
                :error="error"
                placeholder="Ask Coach Watts anything about your training..."
                @submit="onSubmit"
              >
                <UChatPromptSubmit
                  :status="status"
                  @stop="() => {}"
                  @reload="() => {}"
                />
              </UChatPrompt>
            </UContainer>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
