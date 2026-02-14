<template>
  <div class="space-y-6">
    <UCard :ui="{ body: 'hidden' }">
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-xl font-bold uppercase tracking-tight text-gray-900 dark:text-white">
              My Bug Reports
            </h2>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              Track the status of the issues you've reported.
            </p>
          </div>
          <div class="flex items-center gap-3">
            <USelect
              v-model="filterStatus"
              placeholder="Status"
              :options="statusOptions"
              class="w-32"
              size="sm"
              clearable
            />
            <UButton
              icon="i-heroicons-arrow-path"
              color="neutral"
              variant="ghost"
              :loading="pending"
              @click="() => refresh()"
            />
          </div>
        </div>
      </template>
    </UCard>

    <UCard>
      <div class="overflow-x-auto -mx-4 sm:mx-0">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead class="bg-gray-50 dark:bg-gray-800/50">
            <tr>
              <th
                scope="col"
                class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                Status
              </th>
              <th
                scope="col"
                class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                Title
              </th>
              <th
                scope="col"
                class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                Created
              </th>
              <th scope="col" class="relative px-4 py-3">
                <span class="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            <tr v-if="!reports?.reports?.length">
              <td
                colspan="4"
                class="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400"
              >
                No bug reports found.
              </td>
            </tr>
            <tr
              v-for="report in reports?.reports"
              :key="report.id"
              class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                <UBadge :color="getStatusColor(report.status)" variant="subtle">
                  {{ report.status }}
                </UBadge>
              </td>
              <td
                class="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white"
              >
                {{ report.title }}
              </td>
              <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                {{ new Date(report.createdAt).toLocaleDateString() }}
              </td>
              <td class="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                <UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-heroicons-eye"
                  size="xs"
                  @click="openDetailModal(report)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div
        v-if="(reports?.totalPages ?? 0) > 1"
        class="px-4 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end"
      >
        <UPagination v-model:page="page" :items-per-page="limit" :total="reports?.count || 0" />
      </div>
    </UCard>

    <!-- Detail Modal -->
    <UModal v-model:open="isModalOpen">
      <template #content>
        <div class="flex flex-col max-h-[80vh]">
          <div class="px-4 py-4 sm:px-6 border-b border-gray-200 dark:border-gray-800">
            <h3 class="text-base font-semibold leading-6 text-gray-900 dark:text-white">
              Bug Report Details
            </h3>
          </div>

          <div class="px-4 py-5 sm:p-6 overflow-y-auto space-y-4">
            <div v-if="selectedReport">
              <div class="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >Status</label
                  >
                  <div class="mt-1">
                    <UBadge :color="getStatusColor(selectedReport.status)" variant="subtle">
                      {{ selectedReport.status }}
                    </UBadge>
                  </div>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >Created</label
                  >
                  <p class="text-gray-900 dark:text-white mt-1">
                    {{ new Date(selectedReport.createdAt).toLocaleString() }}
                  </p>
                </div>
              </div>

              <div class="space-y-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >Title</label
                  >
                  <p
                    class="text-gray-900 dark:text-white mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded"
                  >
                    {{ selectedReport.title }}
                  </p>
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >Description</label
                  >
                  <p
                    class="text-gray-900 dark:text-white mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded whitespace-pre-wrap"
                  >
                    {{ selectedReport.description }}
                  </p>
                </div>

                <div v-if="selectedReport.chatRoom">
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >Related Chat</label
                  >
                  <p
                    class="text-gray-900 dark:text-white mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded"
                  >
                    {{ selectedReport.chatRoom.name }}
                  </p>
                </div>

                <div v-if="selectedReport.logs">
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >Logs Attached</label
                  >
                  <div class="mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded overflow-x-auto">
                    <pre class="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{{
                      selectedReport.logs
                    }}</pre>
                  </div>
                </div>
              </div>

              <!-- Comments Section -->
              <div class="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800">
                <h4
                  class="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2"
                >
                  <UIcon name="i-heroicons-chat-bubble-left-right" />
                  Developer & User Comments
                </h4>

                <div class="space-y-4 mb-6">
                  <div v-if="pendingComments" class="flex justify-center py-4">
                    <UIcon name="i-heroicons-arrow-path" class="animate-spin text-gray-400" />
                  </div>
                  <div
                    v-else-if="comments.length === 0"
                    class="text-center py-4 text-sm text-gray-500 italic"
                  >
                    No comments yet.
                  </div>
                  <div
                    v-for="comment in comments"
                    :key="comment.id"
                    class="flex gap-3"
                    :class="{ 'flex-row-reverse': !comment.isAdmin }"
                  >
                    <UAvatar
                      :src="comment.user.image"
                      :alt="comment.user.name"
                      size="xs"
                      class="shrink-0"
                    />
                    <div
                      class="flex flex-col max-w-[80%]"
                      :class="{ 'items-end': !comment.isAdmin }"
                    >
                      <div class="flex items-center gap-2 mb-1">
                        <span class="text-xs font-medium text-gray-900 dark:text-white">
                          {{ comment.user.name || comment.user.email }}
                        </span>
                        <UBadge v-if="comment.isAdmin" color="primary" variant="subtle" size="xs"
                          >Admin</UBadge
                        >
                        <span class="text-[10px] text-gray-500">
                          {{
                            new Date(comment.createdAt).toLocaleString([], {
                              dateStyle: 'short',
                              timeStyle: 'short'
                            })
                          }}
                        </span>
                      </div>
                      <div
                        class="px-3 py-2 rounded-lg text-sm"
                        :class="
                          !comment.isAdmin
                            ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-900 dark:text-primary-100 rounded-tr-none'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-tl-none'
                        "
                      >
                        {{ comment.content }}
                      </div>
                    </div>
                  </div>
                </div>

                <div class="flex gap-2">
                  <UTextarea
                    v-model="newComment"
                    placeholder="Add more information or a question..."
                    autoresize
                    :rows="1"
                    class="flex-1"
                    @keydown.enter.prevent="addComment"
                  />
                  <UButton
                    icon="i-heroicons-paper-airplane"
                    color="primary"
                    :loading="sendingComment"
                    :disabled="!newComment.trim()"
                    @click="addComment"
                  />
                </div>
              </div>
            </div>
          </div>
          <div
            class="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 sm:px-6 sm:flex sm:flex-row-reverse border-t border-gray-200 dark:border-gray-800"
          >
            <UButton color="neutral" variant="ghost" @click="isModalOpen = false">Close</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
  definePageMeta({
    middleware: 'auth'
  })

  useHead({
    title: 'My Bug Reports',
    meta: [{ name: 'description', content: "Track the status of the issues you've reported." }]
  })

  const page = ref(1)
  const limit = 10
  const filterStatus = ref<string | undefined>()

  // Reset page when filter changes
  watch(filterStatus, () => {
    page.value = 1
  })

  const {
    data: reports,
    pending,
    refresh
  } = await useFetch('/api/profile/bug-reports', {
    query: {
      page,
      limit,
      status: filterStatus
    },
    watch: [page, filterStatus]
  })

  const isModalOpen = ref(false)
  const selectedReport = ref<any>(null)

  const statusOptions = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']

  function getStatusColor(status: string) {
    switch (status) {
      case 'OPEN':
        return 'error'
      case 'IN_PROGRESS':
        return 'warning'
      case 'RESOLVED':
        return 'success'
      case 'CLOSED':
        return 'neutral'
      default:
        return 'neutral'
    }
  }

  function openDetailModal(report: any) {
    selectedReport.value = report
    isModalOpen.value = true
    fetchComments()
  }

  const comments = ref<any[]>([])
  const pendingComments = ref(false)
  const newComment = ref('')
  const sendingComment = ref(false)
  const toast = useToast()

  async function fetchComments() {
    if (!selectedReport.value) return
    pendingComments.value = true
    try {
      comments.value = await $fetch(`/api/profile/bug-reports/${selectedReport.value.id}/comments`)
    } catch (error) {
      console.error('Failed to fetch comments:', error)
    } finally {
      pendingComments.value = false
    }
  }

  async function addComment() {
    if (!newComment.value.trim() || !selectedReport.value) return
    sendingComment.value = true
    try {
      const comment = await $fetch(`/api/profile/bug-reports/${selectedReport.value.id}/comments`, {
        method: 'POST',
        body: { content: newComment.value }
      })
      comments.value.push(comment)
      newComment.value = ''
    } catch (error) {
      console.error('Failed to add comment:', error)
      toast.add({ title: 'Failed to add comment', color: 'error' })
    } finally {
      sendingComment.value = false
    }
  }
</script>
