<script setup lang="ts">
  definePageMeta({
    layout: 'admin',
    middleware: ['auth', 'admin']
  })

  type EnvResponse = {
    env: Record<string, string>
    runtimeConfig: {
      public: Record<string, any>
      private: Record<string, any>
    }
  }

  const { data, pending, refresh } = await useFetch<EnvResponse>('/api/admin/debug/env')
  const searchQuery = ref('')

  const filteredRows = computed(() => {
    if (!data.value) return []
    const query = searchQuery.value.toLowerCase()

    const rows = []

    // System Env
    if (data.value.env) {
      for (const [key, value] of Object.entries(data.value.env)) {
        rows.push({ key, value, type: 'System Env', class: 'text-gray-500' })
      }
    }

    // Public Config
    if (data.value.runtimeConfig?.public) {
      for (const [key, value] of Object.entries(data.value.runtimeConfig.public)) {
        rows.push({
          key: `public.${key}`,
          value,
          type: 'Runtime (Public)',
          class: 'text-green-500'
        })
      }
    }

    // Private Config
    if (data.value.runtimeConfig?.private) {
      for (const [key, value] of Object.entries(data.value.runtimeConfig.private)) {
        rows.push({
          key: `private.${key}`,
          value,
          type: 'Runtime (Private)',
          class: 'text-amber-500'
        })
      }
    }

    if (!query) return rows

    return rows.filter(
      (row) =>
        row.key.toLowerCase().includes(query) || String(row.value).toLowerCase().includes(query)
    )
  })
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Environment Variables Debug">
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
      <div class="p-4 sm:p-6">
        <UCard :ui="{ body: { padding: 'p-0 sm:p-0' } }">
          <template #header>
            <div class="px-4 py-3">
              <UInput
                v-model="searchQuery"
                icon="i-heroicons-magnifying-glass-20-solid"
                placeholder="Search variables and config..."
                class="max-w-md w-full"
              />
            </div>
          </template>

          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th
                    scope="col"
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    Key
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
                    Value
                  </th>
                </tr>
              </thead>
              <tbody
                class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700"
              >
                <tr
                  v-for="row in filteredRows"
                  :key="row.key + row.type"
                  class="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
                >
                  <td
                    class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white font-mono select-all"
                  >
                    {{ row.key }}
                  </td>
                  <td
                    class="px-6 py-4 whitespace-nowrap text-xs font-bold uppercase tracking-wider"
                    :class="row.class"
                  >
                    {{ row.type }}
                  </td>
                  <td
                    class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 font-mono select-all break-all"
                  >
                    {{ row.value }}
                  </td>
                </tr>
                <tr v-if="filteredRows.length === 0">
                  <td
                    colspan="3"
                    class="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400"
                  >
                    No variables found matching your search.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
