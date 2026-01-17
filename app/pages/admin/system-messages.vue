<template>
  <div class="flex flex-col flex-1 min-w-0 bg-gray-50 dark:bg-gray-900 min-h-screen">
    <!-- Header simulation -->
    <div
      class="h-16 px-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-gray-900 sticky top-0 z-10"
    >
      <div class="flex items-center gap-4">
        <UDashboardSidebarCollapse />
        <h1 class="text-xl font-semibold text-gray-900 dark:text-white">System Messages</h1>
      </div>
      <div class="flex items-center gap-3">
        <UButton
          icon="i-heroicons-plus"
          label="New Message"
          color="primary"
          @click="openCreateModal"
        />
      </div>
    </div>

    <!-- Body -->
    <div class="p-4 sm:p-6 flex-1 overflow-y-auto">
      <div
        class="bg-white dark:bg-gray-800 rounded-lg shadow ring-1 ring-gray-200 dark:ring-gray-800 overflow-hidden"
      >
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th
                  scope="col"
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  Title
                </th>
                <th
                  scope="col"
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  Type
                </th>
                <th
                  scope="col"
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  Status
                </th>
                <th
                  scope="col"
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  Dismissals
                </th>
                <th
                  scope="col"
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  Created
                </th>
                <th scope="col" class="relative px-6 py-3">
                  <span class="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              <tr v-if="messages.length === 0">
                <td
                  colspan="6"
                  class="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  No system messages found.
                </td>
              </tr>
              <tr
                v-for="msg in messages"
                :key="msg.id"
                class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <td
                  class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white"
                >
                  {{ msg.title }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                  <UBadge :color="getTypeColor(msg.type) as any" variant="subtle">{{
                    msg.type
                  }}</UBadge>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  <UBadge :color="msg.isActive ? 'success' : 'neutral'" variant="subtle">{{
                    msg.isActive ? 'Active' : 'Inactive'
                  }}</UBadge>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {{ msg.dismissals }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {{ new Date(msg.createdAt).toLocaleDateString() }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div class="flex justify-end gap-2">
                    <UButton
                      color="neutral"
                      variant="ghost"
                      icon="i-heroicons-pencil-square-20-solid"
                      @click="openEditModal(msg)"
                    />
                    <UButton
                      color="error"
                      variant="ghost"
                      icon="i-heroicons-trash-20-solid"
                      @click="deleteMessage(msg.id)"
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <UModal v-model:open="isModalOpen">
      <template #content>
        <div class="flex flex-col">
          <div class="px-4 py-4 sm:px-6 border-b border-gray-200 dark:border-gray-800">
            <h3 class="text-base font-semibold leading-6 text-gray-900 dark:text-white">
              {{ editingId ? 'Edit Message' : 'New Message' }}
            </h3>
          </div>

          <div class="px-4 py-5 sm:p-6">
            <UForm :state="state" :schema="schema" @submit="onSubmit">
              <div class="space-y-5">
                <UFormField label="Title" name="title" required>
                  <UInput
                    v-model="state.title"
                    class="w-full"
                    placeholder="e.g., System Maintenance"
                  />
                </UFormField>

                <UFormField label="Content" name="content" required>
                  <UTextarea
                    v-model="state.content"
                    :rows="4"
                    class="w-full"
                    placeholder="Enter the message content here..."
                  />
                </UFormField>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <UFormField label="Type" name="type" required>
                    <USelect
                      v-model="state.type"
                      :items="['INFO', 'WARNING', 'ERROR', 'SUCCESS']"
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField label="Expires At" name="expiresAt">
                    <UInput v-model="state.expiresAt" type="datetime-local" class="w-full" />
                    <p class="text-xs text-gray-500 mt-1">Leave empty for no expiration</p>
                  </UFormField>
                </div>

                <UFormField name="isActive">
                  <UCheckbox v-model="state.isActive" label="Active" />
                </UFormField>
              </div>

              <div
                class="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-200 dark:border-gray-800"
              >
                <UButton color="neutral" variant="ghost" @click="isModalOpen = false"
                  >Cancel</UButton
                >
                <UButton type="submit" color="primary" :loading="saving">Save Message</UButton>
              </div>
            </UForm>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
  import { z } from 'zod'

  definePageMeta({
    layout: 'admin',
    middleware: ['auth', 'admin']
  })

  const {
    data: messagesData,
    pending,
    refresh
  } = await useFetch<{ messages: any[] }>('/api/admin/system-messages')
  const messages = computed(() =>
    (messagesData.value?.messages || []).map((m: any) => ({
      ...m,
      dismissals: m._count?.dismissals || 0
    }))
  )

  const isModalOpen = ref(false)
  const editingId = ref<string | null>(null)
  const saving = ref(false)
  const toast = useToast()

  const state = reactive({
    title: '',
    content: '',
    type: 'INFO' as 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS',
    isActive: true,
    expiresAt: undefined as string | undefined
  })

  const schema = z.object({
    title: z.string().min(1),
    content: z.string().min(1),
    type: z.enum(['INFO', 'WARNING', 'ERROR', 'SUCCESS']),
    isActive: z.boolean(),
    expiresAt: z.string().optional()
  })

  function openCreateModal() {
    editingId.value = null
    state.title = ''
    state.content = ''
    state.type = 'INFO'
    state.isActive = true
    state.expiresAt = undefined
    isModalOpen.value = true
  }

  function openEditModal(row: any) {
    editingId.value = row.id
    state.title = row.title
    state.content = row.content
    state.type = row.type
    state.isActive = row.isActive
    // Format date for datetime-local input (YYYY-MM-DDThh:mm)
    if (row.expiresAt) {
      const d = new Date(row.expiresAt)
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
      state.expiresAt = d.toISOString().slice(0, 16)
    } else {
      state.expiresAt = undefined
    }
    isModalOpen.value = true
  }

  async function deleteMessage(id: string) {
    if (!confirm('Are you sure?')) return
    await $fetch(`/api/admin/system-messages/${id}`, { method: 'DELETE' })
    refresh()
    toast.add({ title: 'Message deleted' })
  }

  function getTypeColor(type: string) {
    switch (type) {
      case 'INFO':
        return 'blue'
      case 'WARNING':
        return 'orange'
      case 'ERROR':
        return 'red'
      case 'SUCCESS':
        return 'green'
      default:
        return 'gray'
    }
  }

  async function onSubmit(event: any) {
    saving.value = true
    try {
      const payload = { ...event.data }
      // Ensure ISO string if present
      if (payload.expiresAt) {
        payload.expiresAt = new Date(payload.expiresAt).toISOString()
      } else {
        payload.expiresAt = null
      }

      if (editingId.value) {
        await $fetch(`/api/admin/system-messages/${editingId.value}`, {
          method: 'PUT',
          body: payload
        })
      } else {
        await $fetch('/api/admin/system-messages', {
          method: 'POST',
          body: payload
        })
      }
      isModalOpen.value = false
      refresh()
      toast.add({ title: 'Saved successfully' })
    } catch (e) {
      console.error(e)
      toast.add({ title: 'Error saving', color: 'error' })
    } finally {
      saving.value = false
    }
  }
</script>
