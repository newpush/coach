<script setup lang="ts">
  definePageMeta({
    layout: 'admin',
    middleware: ['auth', 'admin']
  })

  const showAll = ref(false)
  const {
    data: stats,
    pending,
    refresh
  } = await useFetch('/api/admin/stats/llm/quotas', {
    query: computed(() => ({ all: showAll.value }))
  })

  useHead({
    title: 'LLM Quota Monitoring'
  })

  const getUsageColor = (used: number, limit: number) => {
    const ratio = used / limit
    if (ratio >= 1) return 'error'
    if (ratio >= 0.8) return 'warning'
    return 'success'
  }
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="LLM Quota Monitoring">
        <template #leading>
          <UButton
            to="/admin/stats/llm"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
          />
        </template>
        <template #trailing>
          <UButton
            :label="showAll ? 'Show Only Near Limits' : 'Show All Active Usage'"
            :icon="showAll ? 'i-lucide-filter-x' : 'i-lucide-filter'"
            variant="ghost"
            color="neutral"
            @click="showAll = !showAll"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-6 space-y-6">
        <div v-if="pending" class="flex items-center justify-center p-12">
          <UIcon name="i-lucide-loader-2" class="animate-spin h-8 w-8 text-gray-400" />
        </div>

        <template v-else>
          <div v-if="!stats?.nearLimits?.length" class="text-center py-12">
            <UIcon name="i-lucide-check-circle" class="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h3 class="text-lg font-medium">All clear!</h3>
            <p class="text-gray-500">No users are currently nearing their LLM quotas.</p>
          </div>

          <div v-else class="space-y-8">
            <div
              v-for="group in stats.nearLimits"
              :key="`${group.tier}-${group.operation}`"
              class="space-y-4"
            >
              <div
                class="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-2"
              >
                <div class="flex items-center gap-3">
                  <UBadge
                    :color="
                      group.tier === 'PRO'
                        ? 'primary'
                        : group.tier === 'SUPPORTER'
                          ? 'info'
                          : 'neutral'
                    "
                    variant="soft"
                  >
                    {{ group.tier }}
                  </UBadge>
                  <h3 class="text-lg font-semibold capitalize">
                    {{ group.operation.replace(/_/g, ' ') }}
                  </h3>
                </div>
                <div class="text-sm text-gray-500">
                  Limit: <span class="font-mono">{{ group.limit }}</span> per
                  <span class="font-mono">{{ group.window }}</span>
                </div>
              </div>

              <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead>
                    <tr class="text-left text-xs uppercase text-gray-500">
                      <th class="py-3 px-4">User</th>
                      <th class="py-3 px-4 text-center">Usage</th>
                      <th class="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                    <tr
                      v-for="user in group.users"
                      :key="user.userId"
                      class="hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
                      <td class="py-3 px-4">
                        <div class="font-medium text-gray-900 dark:text-white">
                          {{ user.name || 'Unknown' }}
                        </div>
                        <div class="text-xs text-gray-500">{{ user.email }}</div>
                      </td>
                      <td class="py-3 px-4">
                        <div class="flex flex-col gap-1 items-center">
                          <div
                            class="w-32 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden"
                          >
                            <div
                              class="h-full rounded-full"
                              :class="{
                                'bg-red-500': user.used / group.limit >= 1,
                                'bg-amber-500':
                                  user.used / group.limit >= 0.8 && user.used / group.limit < 1,
                                'bg-green-500': user.used / group.limit < 0.8
                              }"
                              :style="{
                                width: `${Math.min(100, (user.used / group.limit) * 100)}%`
                              }"
                            ></div>
                          </div>
                          <span
                            class="text-xs font-mono font-bold"
                            :class="`text-${getUsageColor(user.used, group.limit)}-500`"
                          >
                            {{ user.used }} / {{ group.limit }}
                          </span>
                        </div>
                      </td>
                      <td class="py-3 px-4 text-right">
                        <UButton
                          :to="`/admin/users/${user.userId}`"
                          icon="i-lucide-user"
                          variant="ghost"
                          color="neutral"
                          size="xs"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
