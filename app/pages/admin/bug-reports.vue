<template>
  <div class="flex flex-col flex-1 min-w-0 bg-gray-50 dark:bg-gray-900 min-h-screen">
    <!-- Header -->
    <div
      class="h-16 px-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-gray-900 sticky top-0 z-10"
    >
      <div class="flex items-center gap-4">
        <UDashboardSidebarCollapse />
        <h1 class="text-xl font-semibold text-gray-900 dark:text-white">Bug Reports</h1>
      </div>
      <div class="flex items-center gap-3">
        <USelect
          v-model="filterStatus"
          placeholder="Filter by Status"
          :options="statusOptions"
          class="w-40"
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
                  Status
                </th>
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
                  User
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
              <tr v-if="!reports?.reports?.length">
                <td
                  colspan="5"
                  class="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  No bug reports found.
                </td>
              </tr>
              <tr
                v-for="report in reports?.reports"
                :key="report.id"
                class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                  <UBadge :color="getStatusColor(report.status)" variant="subtle">{{
                    report.status
                  }}</UBadge>
                </td>
                <td
                  class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white"
                >
                  {{ report.title }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  <div class="flex flex-col">
                    <span class="text-gray-900 dark:text-white">{{ report.user.name }}</span>
                    <span class="text-xs">{{ report.user.email }}</span>
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {{ new Date(report.createdAt).toLocaleDateString() }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <UButton
                    color="neutral"
                    variant="ghost"
                    icon="i-heroicons-eye-20-solid"
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
          class="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end"
        >
          <UPagination v-model="page" :page-count="limit" :total="reports?.count || 0" />
        </div>
      </div>
    </div>

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
                  <USelect
                    v-model="selectedReport.status"
                    :options="statusOptions"
                    @change="updateStatus"
                  />
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

                <div v-if="selectedReport.context">
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >Context</label
                  >
                  <div class="mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded overflow-x-auto">
                    <pre class="text-xs text-gray-800 dark:text-gray-200">{{
                      JSON.stringify(selectedReport.context, null, 2)
                    }}</pre>
                  </div>
                </div>

                <div v-if="selectedReport.logs">
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >Logs</label
                  >
                  <div class="mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded overflow-x-auto">
                    <pre class="text-xs text-gray-800 dark:text-gray-200">{{
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
  import type { BugStatus } from '@prisma/client'

  definePageMeta({
    layout: 'admin',
    middleware: ['auth', 'admin']
  })

  const page = ref(1)
  const limit = 10
  const filterStatus = ref<string | undefined>()

  const {
    data: reports,
    pending,
    refresh
  } = await useFetch('/api/admin/bug-reports', {
    query: {
      page,
      limit,
      status: filterStatus
    },
    watch: [page, filterStatus]
  })

  const isModalOpen = ref(false)
  const selectedReport = ref<any>(null)
  const toast = useToast()

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
    selectedReport.value = JSON.parse(JSON.stringify(report)) // Deep copy
    isModalOpen.value = true
  }

  async function updateStatus() {
    if (!selectedReport.value) return

    try {
      await $fetch(`/api/admin/bug-reports/${selectedReport.value.id}`, {
        method: 'PUT',
        body: { status: selectedReport.value.status }
      })

      toast.add({ title: 'Status updated', color: 'success' })
      refresh()
    } catch (error) {
      console.error(error)
      toast.add({ title: 'Failed to update status', color: 'error' })
    }
  }
</script>
