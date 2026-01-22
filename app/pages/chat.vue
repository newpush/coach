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
      console.error('[Chat] onError triggered:', error)
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
      const lastMsg = chat.messages[chat.messages.length - 1]
      if (lastMsg) {
        console.log(
          `[Chat] Watcher: Msg ${lastMsg.id} (${lastMsg.role}) parts updated. Count: ${parts.length}`
        )
      }
    },
    { deep: true }
  )

  // Form submission handler
  const onSubmit = (e?: Event | string) => {
    if (e && typeof e === 'object' && 'preventDefault' in e) e.preventDefault()

    const submittedText = typeof e === 'string' ? e : input.value

    console.log('[Chat Frontend DEBUG] onSubmit called')
    console.log('[Chat Frontend DEBUG] submittedText:', submittedText)
    console.log('[Chat Frontend DEBUG] currentRoomId:', currentRoomId.value)

    if (!submittedText?.trim() || !currentRoomId.value) {
      console.warn('[Chat Frontend DEBUG] Aborting submit: input empty or no roomId')
      return
    }

    const messagePayload = {
      role: 'user',
      content: submittedText
    }
    console.log('[Chat Frontend DEBUG] Calling chat.sendMessage with:', messagePayload)
    ;(chat as any).sendMessage({
      text: submittedText
    })
    input.value = ''
  }

  const onToolApproval = (approval: { approvalId: string; approved: boolean; result?: string }) => {
    console.log('[Chat] Tool Approval:', approval)

    // Use addToolApprovalResponse if available (specific for approvals)
    if (typeof (chat as any).addToolApprovalResponse === 'function') {
      console.log('[Chat] Calling addToolApprovalResponse')
      ;(chat as any).addToolApprovalResponse({
        toolCallId: approval.approvalId,
        result: approval.result || (approval.approved ? 'Approved' : 'Denied')
      })
    }
    // Use addToolResult as fallback or if appropriate
    else if (typeof (chat as any).addToolResult === 'function') {
      console.log('[Chat] Calling addToolResult')
      ;(chat as any).addToolResult({
        toolCallId: approval.approvalId,
        result: approval.result || (approval.approved ? 'Approved' : 'Denied')
      })
    }

    // DEBUG: Inspect chat object to find trigger method
    console.log('[Chat DEBUG] Chat object keys:', Object.keys(chat))

    // Force request if needed
    // 'regenerate' is available and should resend the context including the approval
    if (typeof (chat as any).regenerate === 'function') {
      console.log('[Chat] Triggering regenerate() to send approval...')
      ;(chat as any).regenerate()
    } else {
      console.warn('[Chat] No regenerate method found. Request might hang.')
    }
    return
    // Fallback: Append message manually
    const responsePart = {
      type: 'tool-result', // Use standard tool-result
      toolCallId: approval.approvalId,
      result: approval.result || (approval.approved ? 'Approved' : 'Denied')
    }

    const message = {
      role: 'tool',
      content: [responsePart]
    }

    console.log('[Chat] Sending tool result message (fallback):', message)

    if (typeof (chat as any).append === 'function') {
      ;(chat as any).append(message)
    } else if (typeof (chat as any).sendMessage === 'function') {
      ;(chat as any).sendMessage(message)
    } else {
      console.error(
        '[Chat] No suitable method found to send tool result. Chat object keys:',
        Object.keys(chat)
      )
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
        role:
          msg.senderId === 'ai_agent'
            ? 'assistant'
            : msg.senderId === 'system_tool'
              ? 'tool'
              : 'user',
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
    await loadRooms()

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

  // Get current room name
  const currentRoomName = computed(() => {
    const room = rooms.value.find((r) => r.roomId === currentRoomId.value)
    return room?.roomName || 'Coach Watts'
  })
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
        />

        <!-- Chat Area -->
        <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
          <!-- Messages -->
          <ChatMessageList
            :messages="chatMessages as any"
            :status="chatStatus"
            :loading="loadingMessages"
            @tool-approval="onToolApproval"
          />

          <!-- Input -->
          <ChatInput v-model="input" :status="chatStatus" :error="chat.error" @submit="onSubmit" />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
