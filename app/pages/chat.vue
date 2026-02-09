<script setup lang="ts">
  import { ref, computed, onMounted, defineAsyncComponent, watch } from 'vue'
  import { Chat } from '@ai-sdk/vue'
  import { DefaultChatTransport } from 'ai'
  import ChatSidebar from '~/components/chat/ChatSidebar.vue'
  import ChatMessageList from '~/components/chat/ChatMessageList.vue'
  import ChatInput from '~/components/chat/ChatInput.vue'

  const DashboardTriggerMonitorButton = defineAsyncComponent(
    () => import('~/components/dashboard/TriggerMonitorButton.vue')
  )

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

  // State
  const currentRoomId = ref('')
  const loadingMessages = ref(true)
  const rooms = ref<any[]>([])
  const loadingRooms = ref(true)
  const isRoomListOpen = ref(false)
  const input = ref('')

  // Fetch session
  const { data: session } = await useFetch('/api/auth/session')

  const { refresh: refreshRuns } = useUserRuns()

  const route = useRoute()
  const router = useRouter()

  // Initialize Chat class
  const chat = new Chat({
    transport: new DefaultChatTransport({
      api: '/api/chat/messages',
      body: () => ({
        roomId: currentRoomId.value
      })
    }),
    onFinish: ({ message }) => {
      console.log('[Chat] onFinish triggered for message:', message.id)
      refreshRuns()
    },
    onError: (error) => {
      if (error.message && error.message.includes('No tool invocation found')) {
        console.warn(
          '[Chat] Suppressing expected tool invocation error. Refreshing chat to get response.'
        )
        // The backend executed successfully, but the frontend stream parser got confused.
        // We can just reload the messages to show the result.
        setTimeout(() => {
          if (currentRoomId.value) loadMessages(currentRoomId.value)
        }, 1000)
        return
      }
      console.error('[Chat] onError triggered:', error)
      console.error('[Chat] Error Stack:', error.stack)
    },
    onToolCall: (toolCall) => {
      console.log('[Chat] onToolCall triggered:', toolCall.toolCall.toolName)
    }
  })

  const chatMessages = computed(() => chat.messages)
  const chatStatus = computed(() => chat.status)

  // Reactive watcher for debugging parts during streaming
  watch(
    () => {
      const msgs = chat.messages
      if (msgs.length === 0) return undefined
      return msgs[msgs.length - 1]?.parts
    },
    (parts) => {
      if (!parts) return
      /*
      const lastMsg = chat.messages[chat.messages.length - 1]
      if (lastMsg) {
        console.log(
          `[Chat] Watcher: Msg ${lastMsg.id} (${lastMsg.role}) parts updated. Count: ${parts.length}`
        )
      }
      */
    },
    { deep: true }
  )

  // Form submission handler
  const onSubmit = (e?: Event | string) => {
    if (e && typeof e === 'object' && 'preventDefault' in e) e.preventDefault()

    const submittedText = typeof e === 'string' ? e : input.value

    // console.log('[Chat Frontend DEBUG] onSubmit called')
    // console.log('[Chat Frontend DEBUG] submittedText:', submittedText)
    // console.log('[Chat Frontend DEBUG] currentRoomId:', currentRoomId.value)

    if (!submittedText?.trim() || !currentRoomId.value) {
      // console.warn('[Chat Frontend DEBUG] Aborting submit: input empty or no roomId')
      return
    }

    // const messagePayload = {
    //   role: 'user',
    //   content: submittedText
    // }
    // console.log('[Chat Frontend DEBUG] Calling chat.sendMessage with:', messagePayload)
    ;(chat as any).sendMessage({
      text: submittedText
    })
    input.value = ''
  }

  const onToolApproval = (approval: { approvalId: string; approved: boolean; result?: string }) => {
    console.log('[Chat] Tool Approval:', approval)

    // Manually construct the tool approval response message
    const responsePart = {
      type: 'tool-approval-response',
      approvalId: approval.approvalId,
      approved: approval.approved,
      result: approval.result
    }

    const message = {
      role: 'tool',
      content: [responsePart]
    }

    console.log('[Chat] Sending tool approval message via sendMessage:', message)

    if (typeof (chat as any).sendMessage === 'function') {
      ;(chat as any).sendMessage(message)
    } else {
      console.error('[Chat] No sendMessage method found. Chat object keys:', Object.keys(chat))
    }
  }
  // Load initial room and messages
  onMounted(async () => {
    await loadChat()
  })

  async function loadRooms(selectFirst = true) {
    try {
      if (selectFirst) loadingRooms.value = true
      const loadedRooms = await $fetch<any[]>('/api/chat/rooms')
      rooms.value = loadedRooms

      // Select first room if we don't have a current one
      if (selectFirst && !currentRoomId.value && loadedRooms.length > 0 && loadedRooms[0]) {
        await selectRoom(loadedRooms[0].roomId)
      }
    } catch (err: any) {
      console.error('Failed to load rooms:', err)
    } finally {
      loadingRooms.value = false
    }
  }

  async function loadMessages(roomId: string) {
    try {
      loadingMessages.value = true
      const loadedMessages = await $fetch<any[]>(`/api/chat/messages?roomId=${roomId}`)

      // Transform DB messages to AI SDK format (UIMessage)
      const transformedMessages = loadedMessages.map((msg) => ({
        id: msg.id,
        role: msg.role, // Use role from API response (already mapped)
        content: msg.content,
        parts: msg.parts || [{ type: 'text', text: msg.content }],
        createdAt: new Date(msg.createdAt),
        metadata: msg.metadata
      }))

      // Update chat messages
      chat.messages = transformedMessages as any
    } catch (err: any) {
      console.error('Failed to load messages:', err)
    } finally {
      loadingMessages.value = false
    }
  }

  async function loadChat() {
    await loadRooms(false)

    // Check for context from query params
    const workoutId = route.query.workoutId as string
    const isPlanned = route.query.isPlanned === 'true'
    const recommendationId = route.query.recommendationId as string

    if (workoutId || recommendationId) {
      // Create new chat
      await createNewChat()

      let initialText = ''
      if (workoutId) {
        initialText = isPlanned
          ? `I'd like to discuss my upcoming planned workout (ID: ${workoutId}). What should I focus on?`
          : `Please analyze my completed workout with ID ${workoutId}. How did I perform?`
      } else if (recommendationId) {
        initialText = `Can you explain this recommendation (ID: ${recommendationId}) in more detail?`
      }

      if (initialText) {
        chat.sendMessage({
          text: initialText,
          role: 'user'
        } as any)
      }

      // Clear query params
      router.replace({ query: {} })
    } else {
      // No context provided - check if we should continue last chat or start new
      if (rooms.value.length > 0 && rooms.value[0]) {
        const lastRoom = rooms.value[0]
        const lastActivity = lastRoom.index // Timestamp in ms
        const now = Date.now()
        const timeSinceLastActivity = now - lastActivity
        const FIFTEEN_MINUTES = 15 * 60 * 1000

        // If last message/room update was > 15 mins ago, start fresh
        if (timeSinceLastActivity > FIFTEEN_MINUTES) {
          await createNewChat()
        } else {
          await selectRoom(lastRoom.roomId)
        }
      } else {
        // Fallback if no rooms exist (API usually creates one, but just in case)
        await createNewChat()
      }
    }
  }

  async function selectRoom(roomId: string) {
    currentRoomId.value = roomId
    await loadMessages(roomId)
    isRoomListOpen.value = false
  }

  async function createNewChat() {
    try {
      const newRoom = await $fetch<any>('/api/chat/rooms', {
        method: 'POST'
      })

      // Add to rooms list
      rooms.value.unshift(newRoom)

      // Switch to new room
      await selectRoom(newRoom.roomId)
    } catch (err: any) {
      console.error('Failed to create new chat:', err)
    }
  }

  async function deleteRoom(roomId: string) {
    try {
      // If we are in the room being deleted, we need to clear state immediately
      const wasCurrentRoom = currentRoomId.value === roomId

      // Determine the next room to select if we are deleting the current one
      let nextRoomId = ''
      if (wasCurrentRoom) {
        const currentIndex = rooms.value.findIndex((r) => r.roomId === roomId)
        if (currentIndex !== -1 && rooms.value.length > 1) {
          // Select next room, or previous if deleting the last one
          const nextRoom = rooms.value[currentIndex + 1] || rooms.value[currentIndex - 1]
          nextRoomId = nextRoom.roomId
        }
      }

      await $fetch(`/api/chat/rooms/${roomId}`, {
        method: 'DELETE'
      })

      if (wasCurrentRoom) {
        if (nextRoomId) {
          await selectRoom(nextRoomId)
          await loadRooms(false)
        } else {
          // No more rooms left, create a fresh one
          await createNewChat()
          await loadRooms(false)
        }
      } else {
        // Just refresh the list if we deleted a background room
        await loadRooms(false)
      }

      useToast().add({
        title: 'Chat room deleted',
        color: 'success'
      })
    } catch (err: any) {
      console.error('Failed to delete room:', err)
      useToast().add({
        title: 'Error',
        description: 'Failed to delete chat room',
        color: 'error'
      })
    }
  }

  // Get current room info
  const currentRoom = computed(() => rooms.value.find((r) => r.roomId === currentRoomId.value))

  const isCurrentRoomReadOnly = computed(() => currentRoom.value?.isReadOnly || false)

  const currentRoomName = computed(() => {
    return currentRoom.value?.roomName || 'Coach Watts'
  })
</script>

<template>
  <UDashboardPanel id="chat" :ui="{ body: 'p-0' }">
    <!-- ... header remains same ... -->
    <template #header>
      <UDashboardNavbar :title="currentRoomName">
        <template #leading>
          <UDashboardSidebarCollapse />
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-heroicons-clock"
            @click="isRoomListOpen = true"
          />
        </template>
        <template #right>
          <ClientOnly>
            <DashboardTriggerMonitorButton />
          </ClientOnly>
          <UButton
            to="/settings/ai"
            icon="i-heroicons-cog-6-tooth"
            color="neutral"
            variant="outline"
            size="sm"
            class="font-bold"
            aria-label="AI Settings"
          >
            <span class="hidden sm:inline">Settings</span>
          </UButton>
          <UButton
            color="primary"
            variant="solid"
            icon="i-heroicons-chat-bubble-left-right"
            aria-label="New Chat"
            size="sm"
            class="font-bold"
            @click="createNewChat"
          >
            <span class="hidden sm:inline">New Chat</span>
            <span class="sm:hidden">Chat</span>
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex h-full">
        <!-- Sidebar and Mobile Drawer -->
        <ChatSidebar
          v-model:is-open="isRoomListOpen"
          :rooms="rooms"
          :current-room-id="currentRoomId"
          :loading="loadingRooms"
          @select="selectRoom"
          @delete="deleteRoom"
        />

        <!-- Chat Area -->
        <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
          <!-- Read-only Banner -->
          <div
            v-if="isCurrentRoomReadOnly"
            class="p-2 sm:p-4 border-b border-warning-200 bg-warning-50 dark:border-warning-900/50 dark:bg-warning-950/20"
          >
            <UAlert
              color="warning"
              variant="subtle"
              icon="i-heroicons-information-circle"
              title="Legacy Chat"
              description="This chat was created before the AI engine update and is now read-only. Please start a new chat to continue the conversation."
            >
              <template #actions>
                <UButton
                  color="warning"
                  variant="outline"
                  size="xs"
                  label="New Chat"
                  @click="createNewChat"
                />
              </template>
            </UAlert>
          </div>

          <!-- Messages -->
          <ChatMessageList
            :messages="chatMessages as any"
            :status="chatStatus"
            :loading="loadingMessages"
            @tool-approval="onToolApproval"
          />

          <!-- Input -->
          <ChatInput
            v-model="input"
            :status="chatStatus"
            :error="chat.error"
            :disabled="isCurrentRoomReadOnly"
            @submit="onSubmit"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
