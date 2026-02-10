<script setup lang="ts">
  import { refDebounced } from '@vueuse/core'

  definePageMeta({
    layout: 'admin',
    middleware: ['auth', 'admin']
  })

  const page = ref(1)
  const pageCount = ref(10)
  const search = ref('')

  // Debounce search to avoid too many requests
  const debouncedSearch = refDebounced(search, 300)

  // Reset page when search changes
  watch(debouncedSearch, () => {
    page.value = 1
  })

  const { data, pending, refresh } = await useFetch('/api/admin/users', {
    query: {
      page,
      limit: pageCount,
      q: debouncedSearch
    },
    watch: [page, pageCount, debouncedSearch]
  })

  const users = computed(() => data.value?.users || [])
  const total = computed(() => data.value?.total || 0)

  const impersonating = ref<string | null>(null)
  const toast = useToast()

  async function impersonateUser(userId: string) {
    impersonating.value = userId
    try {
      await $fetch('/api/admin/impersonate', {
        method: 'POST',
        body: { userId }
      })

      toast.add({
        title: 'Success',
        description: 'Redirecting to impersonated user dashboard...',
        color: 'success'
      })

      // Force hard reload to ensure cookies are picked up and session is re-evaluated
      window.location.href = '/dashboard'
    } catch (error) {
      toast.add({
        title: 'Error',
        description: 'Failed to impersonate user',
        color: 'error'
      })
    } finally {
      impersonating.value = null
    }
  }

  useHead({
    title: 'User Management',
    meta: [{ name: 'description', content: 'Coach Watts user administration and management.' }]
  })
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Users Management">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-6">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div
            class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-center gap-4"
          >
            <div>
              <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Registered Users</h2>
              <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Manage and troubleshoot user accounts
              </p>
            </div>
            <div class="flex items-center gap-3 w-full sm:w-auto">
              <UInput
                v-model="search"
                icon="i-lucide-search"
                placeholder="Search users..."
                class="w-full sm:w-64"
              >
                <template v-if="search" #trailing>
                  <UButton
                    color="neutral"
                    variant="link"
                    icon="i-lucide-x"
                    :padded="false"
                    @click="search = ''"
                  />
                </template>
              </UInput>
              <UButton
                icon="i-lucide-rotate-cw"
                color="neutral"
                variant="ghost"
                :loading="pending"
                @click="() => refresh()"
              />
            </div>
          </div>

          <div v-if="pending" class="p-8 text-center text-gray-600 dark:text-gray-400">
            <UIcon name="i-lucide-loader-2" class="animate-spin h-8 w-8 mx-auto mb-2" />
            Loading users...
          </div>

          <div v-else-if="!users.length" class="p-8 text-center text-gray-600 dark:text-gray-400">
            No users found.
          </div>

          <div v-else>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead class="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th
                      class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                    >
                      User
                    </th>
                    <th
                      class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                    >
                      Integrations
                    </th>
                    <th
                      class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                    >
                      Stats
                    </th>
                    <th
                      class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                    >
                      LLM Usage
                    </th>
                    <th
                      class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                    >
                      Joined
                    </th>
                    <th
                      class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                    >
                      LLM Spending
                    </th>
                    <th
                      class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody
                  class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700"
                >
                  <tr v-for="user in users as any[]" :key="user.id">
                    <td class="px-6 py-4 whitespace-nowrap">
                      <div class="flex items-center gap-3">
                        <UAvatar :src="user.image || undefined" :alt="user.name || ''" size="sm" />
                        <div>
                          <div class="text-sm font-medium text-gray-900 dark:text-white">
                            {{ user.name || 'No name' }}
                          </div>
                          <div class="text-xs text-gray-500 dark:text-gray-400">
                            {{ user.email }}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                      <div class="flex gap-1 flex-wrap max-w-[200px]">
                        <UBadge
                          v-for="integration in user.integrations"
                          :key="integration.provider"
                          size="xs"
                          color="neutral"
                          variant="subtle"
                        >
                          {{ integration.provider }}
                        </UBadge>
                        <span v-if="!user.integrations?.length" class="text-xs text-gray-400 italic"
                          >None</span
                        >
                      </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                      <div class="text-xs space-y-1">
                        <div>
                          <span class="font-bold">{{ user._count?.workouts || 0 }}</span> workouts
                        </div>
                        <div>
                          <span class="font-bold">{{ user._count?.plannedWorkouts || 0 }}</span>
                          planned
                        </div>
                        <div>
                          <span class="font-bold">{{ user._count?.nutrition || 0 }}</span> meals
                        </div>
                        <div>
                          <span class="font-bold">{{ user._count?.chatParticipations || 0 }}</span>
                          chats
                        </div>
                      </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                      <div class="text-xs">
                        <span class="font-bold">{{ user.llmUsage?.count || 0 }}</span> calls
                      </div>
                    </td>
                    <td
                      class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400"
                    >
                      {{ new Date(user.createdAt).toLocaleDateString() }}
                    </td>
                    <td
                      class="px-6 py-4 whitespace-nowrap text-sm font-medium text-emerald-600 dark:text-emerald-400"
                    >
                      {{
                        new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: 'USD'
                        }).format(user.llmUsage?.cost || 0)
                      }}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div class="flex justify-end gap-2">
                        <UButton
                          :to="`/admin/users/${user.id}`"
                          color="neutral"
                          variant="ghost"
                          icon="i-lucide-eye"
                          size="xs"
                          aria-label="View Details"
                        />
                        <UButton
                          color="neutral"
                          variant="ghost"
                          icon="i-lucide-user-cog"
                          label="Impersonate"
                          size="xs"
                          :loading="impersonating === user.id"
                          @click="impersonateUser(user.id)"
                        />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Pagination -->
            <div
              class="px-6 py-4 flex items-center justify-between border-t border-gray-200 dark:border-gray-700"
            >
              <p class="text-sm text-gray-500">Page {{ page }} ({{ total }} users)</p>
              <UPagination v-model:page="page" :total="total" :items-per-page="pageCount" />
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
