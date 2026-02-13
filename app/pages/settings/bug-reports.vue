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
        <UPagination v-model="page" :page-count="limit" :total="reports?.count || 0" />
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
  }
</script>
