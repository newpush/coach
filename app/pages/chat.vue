<script setup lang="ts">
  import { ref, computed } from 'vue'

  definePageMeta({
    middleware: 'auth'
  })

  useHead({
    title: 'AI Chat Coach',
    meta: [
      {
        name: 'description',
        content:
          'Chat with your AI endurance coach to analyze your training, ask questions, and get personalized advice.'
      }
    ]
  })

  interface ToolCall {
    name: string
    args: Record<string, any>
    response: any
    timestamp: string
  }

  interface Message {
    id: string
    role: 'user' | 'assistant' | 'system'
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
      toolCalls?: ToolCall[]
      toolsUsed?: string[]
      toolCallCount?: number
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

  // Computed navigation items for UNavigationMenu
  const navigationItems = computed(() => {
    return rooms.value.map((room) => ({
      label: room.roomName,
      avatar: { src: room.avatar, size: 'md' as const },
      value: room.roomId,
      active: room.roomId === currentRoomId.value,
      description: room.lastMessage?.content
        ? room.lastMessage.content.substring(0, 50) +
          (room.lastMessage.content.length > 50 ? '...' : '')
        : undefined,
      onClick: () => selectRoom(room.roomId)
    }))
  })

  // State
  const input = ref('')
  const messages = ref<Message[]>([])
  const status = ref<'ready' | 'submitted' | 'streaming' | 'error'>('ready')
  const error = ref<Error | undefined>(undefined)
  const currentRoomId = ref('')
  const loadingMessages = ref(true)
  const rooms = ref<Room[]>([])
  const loadingRooms = ref(true)
  const isRoomListOpen = ref(false)

  // Fetch session and initialize
  const { data: session } = await useFetch('/api/auth/session')
  const currentUserId = computed(() => (session.value?.user as any)?.id)

  const route = useRoute()
  const router = useRouter()

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
      if (!currentRoomId.value && loadedRooms.length > 0 && loadedRooms[0]) {
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

    // Check for workout context
    if (route.query.workoutId) {
      const workoutId = route.query.workoutId as string
      const isPlanned = route.query.isPlanned === 'true'

      // Create new chat
      await createNewChat()

      // Send initial message
      if (isPlanned) {
        input.value = `I'd like to discuss my upcoming planned workout (ID: ${workoutId}). What should I focus on?`
      } else {
        input.value = `Please analyze my completed workout with ID ${workoutId}. How did I perform?`
      }
      await onSubmit()

      // Clear query param
      router.replace({ query: {} })
    }

    // Check for recommendation context
    if (route.query.recommendationId) {
      const recommendationId = route.query.recommendationId as string

      // Create new chat
      await createNewChat()

      // Send initial message
      input.value = `Can you explain this recommendation (ID: ${recommendationId}) in more detail?`
      await onSubmit()

      // Clear query param
      router.replace({ query: {} })
    }
  }

  async function selectRoom(roomId: string) {
    currentRoomId.value = roomId
    await loadMessages(roomId)
    isRoomListOpen.value = false
  }

  async function onSubmit() {
    if (!input.value.trim() || !currentRoomId.value) return

    const userMessage = input.value.trim()
    input.value = ''

    // Add user message immediately
    const tempUserMessage: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      parts: [
        {
          type: 'text',
          id: `text-temp-${Date.now()}`,
          text: userMessage
        }
      ],
      metadata: {
        createdAt: new Date()
      }
    }
    messages.value.push(tempUserMessage)

    try {
      status.value = 'submitted'
      error.value = undefined

      // Send message and get AI response
      const response = await $fetch<Message>('/api/chat/messages', {
        method: 'POST',
        body: {
          roomId: currentRoomId.value,
          content: userMessage
        }
      })

      // Replace temp message with real one and add AI response
      messages.value = messages.value.filter((m) => m.id !== tempUserMessage.id)
      messages.value.push({
        id: `user-${Date.now()}`,
        role: 'user',
        parts: [
          {
            type: 'text',
            id: `text-user-${Date.now()}`,
            text: userMessage
          }
        ],
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
      messages.value = messages.value.filter((m) => m.id !== tempUserMessage.id)
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
  function getTextFromMessage(message: any): string {
    if (!message || !Array.isArray(message.parts)) return ''
    return message.parts.find((p: any) => p.type === 'text')?.text || ''
  }

  // Helper to get charts from message
  function getChartsFromMessage(message: Message) {
    return message.metadata?.charts || []
  }

  // Helper to get tool calls from message
  function getToolCallsFromMessage(message: Message): ToolCall[] {
    return message.metadata?.toolCalls || []
  }

  // Get current room name
  const currentRoomName = computed(() => {
    const room = rooms.value.find((r) => r.roomId === currentRoomId.value)
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
        <template #leading>
          <UDashboardSidebarCollapse />
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-heroicons-clock"
            class="lg:hidden"
            @click="isRoomListOpen = true"
          />
        </template>
        <template #right>
          <UButton
            color="primary"
            variant="solid"
            icon="i-heroicons-plus"
            aria-label="New Chat"
            size="sm"
            class="font-bold"
            @click="createNewChat"
          >
            <span class="hidden sm:inline">New Chat</span>
            <span class="sm:hidden">New</span>
          </UButton>
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
        <!-- Room List Sidebar (Desktop) -->
        <div
          class="hidden lg:flex w-64 border-r border-gray-200 dark:border-gray-800 flex-col bg-gray-50 dark:bg-gray-900/40"
        >
          <div class="p-4 border-b border-gray-200 dark:border-gray-800">
            <h2
              class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest"
            >
              Chat History
            </h2>
          </div>

          <div class="flex-1 overflow-y-auto py-2 px-2">
            <div v-if="loadingRooms" class="space-y-2 py-4 px-2">
              <div v-for="i in 5" :key="i" class="flex items-center gap-3 px-2 py-2">
                <USkeleton class="h-10 w-10 rounded-full" />
                <div class="flex-1 space-y-2">
                  <USkeleton class="h-3 w-3/4" />
                  <USkeleton class="h-2 w-1/2" />
                </div>
              </div>
            </div>

            <UNavigationMenu
              v-else-if="navigationItems.length > 0"
              orientation="vertical"
              variant="link"
              color="primary"
              :highlight="true"
              :items="navigationItems"
              :ui="{
                link: 'px-2 py-2',
                linkLabel: 'text-sm truncate w-full text-left',
                linkLeadingAvatarSize: 'md'
              }"
            >
              <template #item-label="{ item }">
                <div class="flex-1 min-w-0 text-left">
                  <div class="font-medium truncate">
                    {{ item.label }}
                  </div>
                  <div
                    v-if="item.description"
                    class="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5"
                  >
                    {{ item.description }}
                  </div>
                </div>
              </template>
            </UNavigationMenu>

            <div v-else class="text-left py-8 text-sm text-gray-500 px-4">No chat history yet</div>
          </div>
        </div>

        <!-- Room List Drawer (Mobile) -->
        <USlideover v-model:open="isRoomListOpen" title="Chat History" side="left">
          <template #body>
            <div class="flex-1 overflow-y-auto py-2 px-2">
              <div v-if="loadingRooms" class="space-y-2 py-4 px-2">
                <div v-for="i in 5" :key="i" class="flex items-center gap-3 px-2 py-2">
                  <USkeleton class="h-10 w-10 rounded-full" />
                  <div class="flex-1 space-y-2">
                    <USkeleton class="h-3 w-3/4" />
                    <USkeleton class="h-2 w-1/2" />
                  </div>
                </div>
              </div>

              <UNavigationMenu
                v-else-if="navigationItems.length > 0"
                orientation="vertical"
                variant="link"
                color="primary"
                :highlight="true"
                :items="navigationItems"
                :ui="{
                  link: 'px-2 py-2',
                  linkLabel: 'text-sm truncate w-full text-left',
                  linkLeadingAvatarSize: 'md'
                }"
              >
                <template #item-label="{ item }">
                  <div class="flex-1 min-w-0 text-left">
                    <div class="font-medium truncate">
                      {{ item.label }}
                    </div>
                    <div
                      v-if="item.description"
                      class="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5"
                    >
                      {{ item.description }}
                    </div>
                  </div>
                </template>
              </UNavigationMenu>

              <div v-else class="text-left py-8 text-sm text-gray-500 px-4">
                No chat history yet
              </div>
            </div>
          </template>
        </USlideover>

        <!-- Chat Messages Area -->
        <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
          <!-- Messages Container with proper overflow -->
          <div class="flex-1 overflow-y-auto">
            <UContainer class="h-full">
              <div v-if="loadingMessages" class="space-y-6 py-8">
                <div v-for="i in 3" :key="i" class="flex flex-col space-y-4">
                  <div class="flex items-start gap-3">
                    <USkeleton class="h-8 w-8 rounded-full" />
                    <USkeleton class="h-16 w-1/2 rounded-2xl" />
                  </div>
                  <div class="flex items-start justify-end gap-3">
                    <USkeleton class="h-16 w-1/2 rounded-2xl" />
                    <USkeleton class="h-8 w-8 rounded-full" />
                  </div>
                </div>
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
                  avatar: { src: '/media/logo.webp' }
                }"
              >
                <!-- Custom content rendering for each message -->
                <template #content="{ message }">
                  <div class="space-y-4">
                    <!-- Tool calls (shown before text for assistant messages) -->
                    <div
                      v-if="
                        message.role === 'assistant' &&
                        getToolCallsFromMessage(message as any).length > 0
                      "
                      class="space-y-2"
                    >
                      <div class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                        🔧 Tool Calls ({{ getToolCallsFromMessage(message as any).length }})
                      </div>
                      <ChatToolCall
                        v-for="(toolCall, index) in getToolCallsFromMessage(message as any)"
                        :key="`${message.id}-tool-${index}`"
                        :tool-call="toolCall"
                      />
                    </div>

                    <!-- Text content with markdown support -->
                    <div
                      v-if="getTextFromMessage(message)"
                      class="prose prose-sm dark:prose-invert max-w-none"
                    >
                      <MDC :value="getTextFromMessage(message)" />
                    </div>

                    <!-- Inline charts -->
                    <div v-if="getChartsFromMessage(message as any).length > 0" class="space-y-4">
                      <ChatChart
                        v-for="chart in getChartsFromMessage(message as any)"
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
            <UContainer class="py-2 sm:py-4 px-2 sm:px-4">
              <UChatPrompt
                v-model="input"
                :error="error"
                placeholder="Ask Coach Watts..."
                @submit="onSubmit"
              >
                <UChatPromptSubmit :status="status" @stop="() => {}" @reload="() => {}" />
              </UChatPrompt>
            </UContainer>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
