<script setup lang="ts">
  import { watchDebounced } from '@vueuse/core'

  definePageMeta({
    layout: 'admin',
    middleware: ['auth', 'admin']
  })

  const columns = [
    { key: 'createdAt', label: 'Date' },
    { key: 'action', label: 'Action' },
    { key: 'user', label: 'User' },
    { key: 'resourceType', label: 'Resource Type' },
    { key: 'resourceId', label: 'Resource ID' },
    { key: 'ipAddress', label: 'IP Address' },
    { key: 'metadata', label: 'Metadata' }
  ]

  const page = ref(1)
  const limit = ref(20)
  const searchAction = ref('')
  const searchUser = ref('')

  const { data, pending, refresh } = await useFetch('/api/admin/audit-logs', {
    query: {
      page,
      limit,
      action: searchAction,
      userId: searchUser
    },
    watch: [page, searchAction]
  })

  // Debounce user search
  watchDebounced(
    searchUser,
    () => {
      page.value = 1
      refresh()
    },
    { debounce: 500, maxWait: 1000 }
  )

  // Debounce action search
  watchDebounced(
    searchAction,
    () => {
      page.value = 1
      refresh()
    },
    { debounce: 500, maxWait: 1000 }
  )

  const logs = computed(() => data.value?.logs || [])
  const total = computed(() => data.value?.total || 0)

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString()
  }

  useHead({
    title: 'Audit Logs',
    meta: [{ name: 'description', content: 'Coach Watts system audit logs administration.' }]
  })
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Audit Logs" :badge="total">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-heroicons-arrow-path"
            color="neutral"
            variant="ghost"
            :loading="pending"
            @click="() => refresh()"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-6">
        <UDashboardToolbar class="mb-4">
          <template #left>
            <UInput
              v-model="searchAction"
              icon="i-heroicons-magnifying-glass"
              placeholder="Search by action..."
              class="w-64"
            />
            <UInput
              v-model="searchUser"
              icon="i-heroicons-user"
              placeholder="Filter by User ID..."
              class="w-64"
            />
          </template>
        </UDashboardToolbar>

        <div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th
                    v-for="col in columns"
                    :key="col.key"
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    {{ col.label }}
                  </th>
                </tr>
              </thead>
              <tbody
                class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700"
              >
                <tr v-for="row in logs as any[]" :key="row.id">
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {{ formatDate(row.createdAt) }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <UBadge
                      :color="
                        row.action.includes('DELETE') || row.action.includes('REVOKE')
                          ? 'error'
                          : 'primary'
                      "
                      variant="subtle"
                      size="xs"
                    >
                      {{ row.action }}
                    </UBadge>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div v-if="row.user" class="flex flex-col">
                      <span class="text-sm font-medium text-gray-900 dark:text-white">
                        {{ row.user.name || 'Unknown' }}
                      </span>
                      <span class="text-xs text-gray-500">{{ row.user.email }}</span>
                    </div>
                    <span v-else class="text-gray-400 text-xs italic">System / Unknown</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {{ row.resourceType || '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-xs text-gray-400 font-mono">
                    {{ row.resourceId || '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                    {{ row.ipAddress || '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <UPopover>
                      <UButton
                        v-if="row.metadata"
                        color="neutral"
                        variant="ghost"
                        icon="i-heroicons-code-bracket"
                        size="xs"
                        label="View"
                      />
                      <span v-else class="text-gray-400">-</span>

                      <template #content>
                        <div class="p-4 max-w-sm overflow-auto max-h-64">
                          <pre class="text-xs">{{ JSON.stringify(row.metadata, null, 2) }}</pre>
                        </div>
                      </template>
                    </UPopover>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="flex justify-end mt-4">
          <UPagination v-model="page" :page-count="limit" :total="total" />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
