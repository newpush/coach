<script setup lang="ts">
  definePageMeta({
    layout: 'admin',
    middleware: ['auth', 'admin']
  })

  const columns = [
    {
      accessorKey: 'table_name',
      header: 'Table Name',
      id: 'table_name'
    },
    {
      accessorKey: 'row_count',
      header: 'Row Count',
      id: 'row_count'
    },
    {
      accessorKey: 'total_size_bytes',
      header: 'Size',
      id: 'total_size_bytes'
    }
  ]

  interface TableStat {
    table_name: string
    row_count: number
    total_size_bytes: number
  }

  const { data: stats, pending, refresh } = useFetch<TableStat[]>('/api/admin/database')

  const formatBytes = (bytes: number, decimals = 2) => {
    if (!bytes) return '0 Bytes'

    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
  }

  useHead({
    title: 'Database Health - Admin',
    meta: [
      { name: 'description', content: 'Coach Watts database statistics and health monitoring.' }
    ]
  })
</script>

<template>
  <div class="flex-1 overflow-y-auto">
    <!-- Header -->
    <div
      class="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center"
    >
      <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">Database Health</h1>
      <UButton
        icon="i-heroicons-arrow-path"
        color="neutral"
        variant="solid"
        :loading="pending"
        @click="() => refresh()"
      >
        Refresh
      </UButton>
    </div>

    <!-- Body -->
    <div class="p-6">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-base font-semibold leading-6 text-gray-900 dark:text-white">
              Table Statistics
            </h3>
            <p class="text-sm text-gray-500">
              Overview of database tables, record counts, and storage usage.
            </p>
          </div>
        </template>

        <UTable :columns="columns" :data="stats || []" :loading="pending">
          <template #row_count-cell="{ row }">
            {{ row.original.row_count.toLocaleString() }}
          </template>
          <template #total_size_bytes-cell="{ row }">
            {{ formatBytes(row.original.total_size_bytes) }}
          </template>
        </UTable>
      </UCard>
    </div>
  </div>
</template>
