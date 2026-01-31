<script setup lang="ts">
  import { computed } from 'vue'

  const props = defineProps<{
    rooms: any[]
    currentRoomId: string
    loading: boolean
  }>()

  const emit = defineEmits<{
    (e: 'select' | 'delete', roomId: string): void
  }>()

  const roomToDelete = ref<string | null>(null)
  const isDeleteModalOpen = ref(false)
  const isReportModalOpen = ref(false)
  const reportRoomId = ref<string | null>(null)

  // Share Modal State
  const isShareModalOpen = ref(false)
  const shareLink = ref('')
  const generatingShareLink = ref(false)
  const sharedRoomName = ref('')
  const toast = useToast()

  function confirmDelete(roomId: string) {
    roomToDelete.value = roomId
    isDeleteModalOpen.value = true
  }

  function confirmReport(roomId: string) {
    reportRoomId.value = roomId
    isReportModalOpen.value = true
  }

  function handleDelete() {
    if (roomToDelete.value) {
      emit('delete', roomToDelete.value)
      isDeleteModalOpen.value = false
      roomToDelete.value = null
    }
  }

  async function createPublicChat(room: any) {
    sharedRoomName.value = room.roomName || 'Chat'
    isShareModalOpen.value = true
    generatingShareLink.value = true
    shareLink.value = ''

    try {
      const response = await $fetch<any>('/api/share/generate', {
        method: 'POST',
        body: {
          resourceType: 'CHAT_ROOM',
          resourceId: room.roomId
        }
      })
      shareLink.value = response.url
    } catch (error) {
      console.error('Failed to generate share link:', error)
      toast.add({
        title: 'Error',
        description: 'Failed to generate share link. Please try again.',
        color: 'error'
      })
      isShareModalOpen.value = false
    } finally {
      generatingShareLink.value = false
    }
  }

  function copyToClipboard(text: string, title = 'Copied', description = 'Copied to clipboard.') {
    navigator.clipboard.writeText(text)
    toast.add({
      title,
      description,
      color: 'success'
    })
  }

  const getDropdownItems = (room: any) => [
    [
      {
        label: 'Share Chat',
        icon: 'i-heroicons-share',
        onSelect: () => createPublicChat(room)
      },
      {
        label: 'Copy Room ID',
        icon: 'i-heroicons-clipboard',
        onSelect: () =>
          copyToClipboard(room.roomId, 'Room ID Copied', 'The chat room ID has been copied.')
      }
    ],
    [
      {
        label: 'Report Issue',
        icon: 'i-heroicons-flag',
        onSelect: () => confirmReport(room.roomId)
      },
      {
        label: 'Delete Room',
        icon: 'i-heroicons-trash',
        color: 'error' as const,
        onSelect: () => confirmDelete(room.roomId)
      }
    ]
  ]

  const navigationItems = computed(() => {
    return props.rooms.map((room) => ({
      label: room.roomName,
      avatar: { src: room.avatar, size: 'md' as const },
      value: room.roomId,
      active: room.roomId === props.currentRoomId,
      description: room.lastMessage?.content
        ? room.lastMessage.content.substring(0, 50) +
          (room.lastMessage.content.length > 50 ? '...' : '')
        : undefined,
      onSelect: () => emit('select', room.roomId),
      dropdownItems: getDropdownItems(room)
    }))
  })
</script>

<template>
  <div class="flex-1 overflow-y-auto py-2 px-1">
    <div v-if="loading" class="space-y-2 py-4 px-1">
      <div v-for="i in 5" :key="i" class="flex items-center gap-2 px-1 py-2">
        <USkeleton class="h-9 w-9 rounded-full" />
        <div class="flex-1 space-y-2">
          <USkeleton class="h-3 w-3/4" />
          <USkeleton class="h-2 w-1/2" />
        </div>
      </div>
    </div>

    <UNavigationMenu
      v-else-if="navigationItems.length > 0"
      orientation="vertical"
      :items="navigationItems"
      class="px-1"
      :ui="{ link: 'justify-start' }"
    >
      <template #item="{ item }">
        <div
          class="flex items-center gap-2 w-full group py-1.5 px-1.5 cursor-pointer relative text-left"
          @click="item.onSelect?.()"
        >
          <UAvatar v-if="item.avatar" v-bind="item.avatar" size="sm" />
          <div class="flex-1 min-w-0 text-left">
            <p
              class="text-sm font-medium truncate text-left"
              :class="item.active ? 'text-primary' : 'text-gray-900 dark:text-white'"
            >
              {{ item.label }}
            </p>
            <p
              v-if="item.description"
              class="text-xs text-gray-500 dark:text-gray-400 truncate text-left"
            >
              {{ item.description }}
            </p>
          </div>

          <UDropdownMenu :items="item.dropdownItems" :content="{ align: 'end' }">
            <UButton
              icon="i-heroicons-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              size="xs"
              class="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity -mr-1"
              @click.stop
            />
          </UDropdownMenu>
        </div>
      </template>
    </UNavigationMenu>

    <div v-else class="text-left py-8 text-sm text-gray-500 px-4">No chat history yet</div>

    <!-- Share Modal -->
    <UModal
      v-model:open="isShareModalOpen"
      :title="`Share Chat: ${sharedRoomName}`"
      description="Anyone with this link can view this chat history. The link will expire in 30 days."
    >
      <template #body>
        <div v-if="generatingShareLink" class="flex items-center justify-center py-8">
          <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary" />
        </div>
        <div v-else-if="shareLink" class="space-y-4">
          <div class="flex gap-2">
            <UInput v-model="shareLink" readonly class="flex-1" />
            <UButton
              icon="i-heroicons-clipboard"
              color="neutral"
              variant="outline"
              @click="copyToClipboard(shareLink)"
            >
              Copy
            </UButton>
          </div>
          <p class="text-xs text-gray-500">
            This link provides read-only access to this specific chat history.
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end">
          <UButton
            label="Close"
            color="neutral"
            variant="ghost"
            @click="isShareModalOpen = false"
          />
        </div>
      </template>
    </UModal>

    <!-- Report Issue Modal -->
    <UModal
      v-model:open="isReportModalOpen"
      title="Report Issue"
      description="Help us improve the chat experience."
    >
      <template #body>
        <AiFeedbackForm
          :room-id="reportRoomId"
          @cancel="isReportModalOpen = false"
          @submit="isReportModalOpen = false"
        />
      </template>
    </UModal>

    <!-- Delete Confirmation Modal -->
    <UModal v-model:open="isDeleteModalOpen" title="Delete Chat Room">
      <template #body>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Are you sure you want to delete this chat room? This action will remove it from your chat
          list.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton color="neutral" variant="ghost" @click="isDeleteModalOpen = false">
            Cancel
          </UButton>
          <UButton color="error" @click="handleDelete"> Delete Room </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
