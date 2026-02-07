<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-clock" class="w-5 h-5 text-primary" />
          <h2 class="text-xl font-semibold">Recent Activity</h2>
        </div>
        <UButton size="sm" variant="ghost" :loading="refreshing" @click="refresh">
          <UIcon name="i-heroicons-arrow-path" />
          Refresh
        </UButton>
      </div>
    </template>

    <div class="flex flex-col flex-1 w-full">
      <!-- Filters -->
      <div class="flex items-center gap-2 px-4 py-3.5 border-b border-accented">
        <UInput
          v-model="globalFilter"
          class="max-w-sm min-w-[12ch]"
          placeholder="Filter operations..."
          icon="i-heroicons-magnifying-glass"
        />

        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          class="ml-auto"
          :loading="refreshing"
          @click="refresh"
        >
          <UIcon name="i-heroicons-arrow-path" />
          Refresh
        </UButton>
      </div>

      <!-- Table -->
      <UTable
        ref="table"
        v-model:global-filter="globalFilter"
        v-model:sorting="sorting"
        :data="data?.items || []"
        :columns="columns"
        :loading="loading"
        loading-color="primary"
        loading-animation="carousel"
        :empty="emptyState"
        class="flex-1"
      />

      <!-- Pagination -->
      <div
        v-if="data?.items && data.items.length > 0"
        class="flex items-center justify-between px-4 py-3.5 border-t border-accented text-sm"
      >
        <div class="text-muted">
          Showing {{ data.pagination.from }} to {{ data.pagination.to }} of
          {{ data.pagination.total }} records
        </div>
        <div class="flex gap-2">
          <UButton
            size="sm"
            variant="outline"
            color="neutral"
            :disabled="currentPage === 1"
            icon="i-heroicons-chevron-left"
            @click="goToPage(currentPage - 1)"
          >
            Previous
          </UButton>
          <UButton
            size="sm"
            variant="outline"
            color="neutral"
            :disabled="currentPage === data.pagination.totalPages"
            trailing-icon="i-heroicons-chevron-right"
            @click="goToPage(currentPage + 1)"
          >
            Next
          </UButton>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
  import { h, resolveComponent } from 'vue'
  import type { TableColumn } from '@nuxt/ui'

  const { formatDateTime } = useFormat()

  const UBadge = resolveComponent('UBadge')
  const UButton = resolveComponent('UButton')
  const UIcon = resolveComponent('UIcon')

  interface UsageItem {
    id: string
    operation: string
    model: string | null
    entityType: string | null
    entityId: string | null
    tokens: number | null
    cost: number | null
    duration: number | null
    retries: number | null
    success: boolean
    errorType: string | null
    createdAt: string
  }

  const router = useRouter()
  const refreshing = ref(false)
  const currentPage = ref(1)
  const pageSize = ref(20)
  const globalFilter = ref('')
  const sorting = ref([
    {
      id: 'createdAt',
      desc: true
    }
  ])
  const table = useTemplateRef('table')

  const emptyState = 'No AI usage data yet. Start using AI features to see analytics here.'

  const {
    data,
    status,
    refresh: refreshData
  } = await useFetch('/api/analytics/llm-usage/history', {
    query: computed(() => ({
      page: currentPage.value,
      pageSize: pageSize.value
    })),
    immediate: true,
    server: false,
    watch: [currentPage]
  })

  const loading = computed(() => status.value === 'pending')

  const columns: TableColumn<UsageItem>[] = [
    {
      accessorKey: 'createdAt',
      header: ({ column }) => {
        const isSorted = column.getIsSorted()
        return h(UButton, {
          color: 'neutral',
          variant: 'ghost',
          label: 'Timestamp',
          icon: isSorted
            ? isSorted === 'asc'
              ? 'i-heroicons-arrow-up'
              : 'i-heroicons-arrow-down'
            : 'i-heroicons-arrows-up-down',
          class: '-mx-2.5',
          onClick: () => column.toggleSorting(column.getIsSorted() === 'asc')
        })
      },
      cell: ({ row }) => {
        return h('div', { class: 'text-muted' }, formatDateTime(row.getValue('createdAt')))
      }
    },
    {
      accessorKey: 'operation',
      header: 'Operation',
      cell: ({ row }) => {
        const item = row.original
        return h(
          'div',
          { class: 'space-y-1' },
          [
            h('div', { class: 'font-medium' }, formatOperation(item.operation)),
            item.entityType ? h('div', { class: 'text-xs text-muted' }, item.entityType) : null
          ].filter(Boolean)
        )
      }
    },
    {
      accessorKey: 'model',
      header: 'Model',
      cell: ({ row }) => {
        const model = row.getValue('model') as string | null
        const isFlash = model?.toLowerCase().includes('flash')
        return h(
          UBadge,
          {
            class: 'capitalize',
            variant: 'subtle',
            color: isFlash ? 'info' : 'secondary',
            size: 'xs'
          },
          () => (isFlash ? 'Flash' : 'Pro')
        )
      }
    },
    {
      accessorKey: 'tokens',
      header: ({ column }) => {
        const isSorted = column.getIsSorted()
        return h(
          'div',
          { class: 'text-right' },
          h(UButton, {
            color: 'neutral',
            variant: 'ghost',
            label: 'Tokens',
            icon: isSorted
              ? isSorted === 'asc'
                ? 'i-heroicons-arrow-up'
                : 'i-heroicons-arrow-down'
              : 'i-heroicons-arrows-up-down',
            class: '-mx-2.5',
            onClick: () => column.toggleSorting(column.getIsSorted() === 'asc')
          })
        )
      },
      cell: ({ row }) => {
        return h('div', { class: 'text-right text-muted' }, formatNumber(row.getValue('tokens')))
      }
    },
    {
      accessorKey: 'duration',
      header: ({ column }) => {
        const isSorted = column.getIsSorted()
        return h(
          'div',
          { class: 'text-right' },
          h(UButton, {
            color: 'neutral',
            variant: 'ghost',
            label: 'Duration',
            icon: isSorted
              ? isSorted === 'asc'
                ? 'i-heroicons-arrow-up'
                : 'i-heroicons-arrow-down'
              : 'i-heroicons-arrows-up-down',
            class: '-mx-2.5',
            onClick: () => column.toggleSorting(column.getIsSorted() === 'asc')
          })
        )
      },
      cell: ({ row }) => {
        const duration = row.getValue('duration') as number | null
        return h(
          'div',
          { class: 'text-right text-muted' },
          `${((duration ?? 0) / 1000).toFixed(2)}s`
        )
      }
    },
    {
      accessorKey: 'cost',
      header: ({ column }) => {
        const isSorted = column.getIsSorted()
        return h(
          'div',
          { class: 'text-right' },
          h(UButton, {
            color: 'neutral',
            variant: 'ghost',
            label: 'Cost',
            icon: isSorted
              ? isSorted === 'asc'
                ? 'i-heroicons-arrow-up'
                : 'i-heroicons-arrow-down'
              : 'i-heroicons-arrows-up-down',
            class: '-mx-2.5',
            onClick: () => column.toggleSorting(column.getIsSorted() === 'asc')
          })
        )
      },
      cell: ({ row }) => {
        const cost = row.getValue('cost') as number | null
        return h('div', { class: 'text-right text-muted' }, formatCost(cost))
      }
    },
    {
      accessorKey: 'success',
      header: () => h('div', { class: 'text-center' }, 'Status'),
      cell: ({ row }) => {
        const success = row.getValue('success') as boolean
        return h(
          'div',
          { class: 'flex justify-center' },
          h(
            UBadge,
            {
              color: success ? 'success' : 'error',
              variant: 'subtle',
              size: 'xs'
            },
            () => (success ? 'Success' : 'Failed')
          )
        )
      }
    },
    {
      id: 'actions',
      header: () => h('div', { class: 'text-center' }, 'Actions'),
      cell: ({ row }) => {
        return h(
          'div',
          { class: 'flex justify-center' },
          h(UButton, {
            icon: 'i-heroicons-eye',
            color: 'neutral',
            variant: 'ghost',
            size: 'xs',
            'aria-label': 'View details',
            onClick: () => viewDetails(row.original.id)
          })
        )
      }
    }
  ]

  async function refresh() {
    refreshing.value = true
    await refreshData()
    refreshing.value = false
  }

  function goToPage(page: number) {
    currentPage.value = page
  }

  function viewDetails(id: string) {
    router.push(`/ai/logs/${id}`)
  }

  function formatNumber(num: number | null | undefined): string {
    if (!num || num === 0) return '0'
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M'
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K'
    }
    return num.toString()
  }

  function formatCost(cost: number | null | undefined): string {
    if (cost === null || cost === undefined) return '-'
    return `$${cost.toFixed(2)}`
  }

  function formatOperation(op: string): string {
    return op
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }
</script>
