<script setup lang="ts">
  import { z } from 'zod'

  definePageMeta({
    layout: 'admin',
    middleware: ['auth', 'admin']
  })

  useHead({
    title: 'AI Logs'
  })

  // Query Params State
  const page = ref(1)
  const limit = ref(20)
  const search = ref('')
  const feedback = ref('ANY') // ANY, THUMBS_UP, THUMBS_DOWN, COMMENT
  const operation = ref('')
  const model = ref('')
  const status = ref('') // '', success, failure
  const userId = ref('')

  // Debounce search
  const searchDebounced = refDebounced(search, 500)

  // Fetch Data
  const { data, pending, refresh } = await useFetch('/api/admin/ai/logs', {
    query: computed(() => ({
      page: page.value,
      limit: limit.value,
      search: searchDebounced.value,
      feedback: feedback.value === 'ANY' ? undefined : feedback.value,
      operation: operation.value || undefined,
      model: model.value || undefined,
      status: status.value || undefined,
      userId: userId.value || undefined
    })),
    watch: [page, limit, searchDebounced, feedback, operation, model, status, userId]
  })

  // Options for filters
  const feedbackOptions = [
    { label: 'All Feedback', value: 'ANY' },
    { label: 'Thumbs Up', value: 'THUMBS_UP' },
    { label: 'Thumbs Down', value: 'THUMBS_DOWN' },
    { label: 'With Comment', value: 'COMMENT' }
  ]

  const statusOptions = [
    { label: 'All Status', value: '' },
    { label: 'Success', value: 'success' },
    { label: 'Failure', value: 'failure' }
  ]

  const operationOptions = computed(() => {
    const ops = data.value?.filters?.operations || []
    return [
      { label: 'All Operations', value: '' },
      ...ops.map((op) => ({ label: op.replace(/_/g, ' '), value: op }))
    ]
  })

  const modelOptions = computed(() => {
    const models = data.value?.filters?.models || []
    return [{ label: 'All Models', value: '' }, ...models.map((m) => ({ label: m, value: m }))]
  })

  // Table Columns
  const columns = [
    { key: 'createdAt', label: 'Time' },
    { key: 'user', label: 'User' },
    { key: 'operation', label: 'Operation' },
    { key: 'model', label: 'Model' },
    { key: 'feedback', label: 'Feedback' },
    { key: 'status', label: 'Status' },
    { key: 'cost', label: 'Cost/Tokens' },
    { key: 'actions' }
  ]

  // Expand Row for details
  const expandedRows = ref<Set<string>>(new Set())
  const toggleExpand = (id: string) => {
    if (expandedRows.value.has(id)) {
      expandedRows.value.delete(id)
    } else {
      expandedRows.value.add(id)
    }
  }

  // Reset Filters
  const resetFilters = () => {
    search.value = ''
    feedback.value = 'ANY'
    operation.value = ''
    model.value = ''
    status.value = ''
    userId.value = ''
    page.value = 1
  }
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!-- Header -->
    <div
      class="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-gray-900 shrink-0"
    >
      <div class="flex items-center gap-4">
        <h1 class="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <UIcon name="i-lucide-brain-circuit" class="w-6 h-6 text-primary-500" />
          AI Logs
        </h1>
        <UBadge v-if="data?.pagination.total" color="neutral" variant="subtle" size="xs">
          {{ data.pagination.total }} logs
        </UBadge>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          :loading="pending"
          @click="refresh"
        />
      </div>
    </div>

    <!-- Filters -->
    <div
      class="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 space-y-4 shrink-0"
    >
      <div class="flex flex-wrap gap-4">
        <UInput v-model="search" icon="i-lucide-search" placeholder="Search logs..." class="w-64" />

        <USelectMenu
          v-model="feedback"
          :items="feedbackOptions"
          value-attribute="value"
          option-attribute="label"
          placeholder="Filter Feedback"
          class="w-40"
        >
          <template #label>
            <span v-if="feedback === 'ANY'">All Feedback</span>
            <span v-else-if="feedback === 'THUMBS_UP'">Thumbs Up</span>
            <span v-else-if="feedback === 'THUMBS_DOWN'">Thumbs Down</span>
            <span v-else-if="feedback === 'COMMENT'">With Comment</span>
          </template>
        </USelectMenu>

        <USelectMenu
          v-model="operation"
          :items="operationOptions"
          value-attribute="value"
          option-attribute="label"
          placeholder="Operation"
          class="w-48"
        />

        <USelectMenu
          v-model="model"
          :items="modelOptions"
          value-attribute="value"
          option-attribute="label"
          placeholder="Model"
          class="w-48"
        />

        <USelectMenu
          v-model="status"
          :items="statusOptions"
          value-attribute="value"
          option-attribute="label"
          placeholder="Status"
          class="w-32"
        />

        <UButton
          v-if="search || feedback !== 'ANY' || operation || model || status"
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          @click="resetFilters"
        >
          Clear
        </UButton>
      </div>
    </div>

    <!-- Table Content -->
    <div class="flex-1 overflow-auto bg-gray-50 dark:bg-gray-950 p-4">
      <UCard :ui="{ body: 'p-0', header: 'p-0' }" class="min-h-full">
        <div class="overflow-x-auto">
          <table class="w-full text-sm text-left">
            <thead
              class="text-xs uppercase bg-gray-50 dark:bg-gray-900/50 text-gray-500 sticky top-0 z-10"
            >
              <tr>
                <th class="px-4 py-3 font-medium">Time</th>
                <th class="px-4 py-3 font-medium">User</th>
                <th class="px-4 py-3 font-medium">Operation</th>
                <th class="px-4 py-3 font-medium">Model</th>
                <th class="px-4 py-3 font-medium">Feedback</th>
                <th class="px-4 py-3 font-medium text-center">Status</th>
                <th class="px-4 py-3 font-medium text-right">Cost</th>
                <th class="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-gray-900">
              <template v-for="log in data?.logs" :key="log.id">
                <tr
                  class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                  @click="toggleExpand(log.id)"
                >
                  <td class="px-4 py-3 whitespace-nowrap text-gray-500">
                    <div class="flex flex-col">
                      <span>{{ new Date(log.createdAt).toLocaleDateString() }}</span>
                      <span class="text-xs">{{
                        new Date(log.createdAt).toLocaleTimeString()
                      }}</span>
                    </div>
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-2">
                      <UAvatar
                        :src="log.user?.image"
                        :alt="log.user?.name || log.user?.email"
                        size="xs"
                      />
                      <div class="flex flex-col">
                        <span class="font-medium text-gray-900 dark:text-white">{{
                          log.user?.name || 'Unknown'
                        }}</span>
                        <span class="text-xs text-gray-500">{{ log.user?.email }}</span>
                      </div>
                    </div>
                  </td>
                  <td class="px-4 py-3">
                    <UBadge color="neutral" variant="soft" size="xs" class="capitalize">
                      {{ log.operation.replace(/_/g, ' ') }}
                    </UBadge>
                  </td>
                  <td class="px-4 py-3 text-xs font-mono text-gray-500">
                    {{ log.model }}
                  </td>
                  <td class="px-4 py-3">
                    <div v-if="log.feedback" class="flex items-center gap-1.5">
                      <UIcon
                        :name="
                          log.feedback === 'THUMBS_UP'
                            ? 'i-lucide-thumbs-up'
                            : 'i-lucide-thumbs-down'
                        "
                        :class="log.feedback === 'THUMBS_UP' ? 'text-green-500' : 'text-red-500'"
                        class="w-4 h-4"
                      />
                      <span
                        v-if="log.feedbackText"
                        class="text-xs text-gray-500 italic truncate max-w-[150px]"
                      >
                        "{{ log.feedbackText }}"
                      </span>
                    </div>
                    <span v-else class="text-gray-400 text-xs">-</span>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <UIcon
                      :name="log.success ? 'i-lucide-check-circle' : 'i-lucide-x-circle'"
                      :class="log.success ? 'text-green-500' : 'text-red-500'"
                      class="w-5 h-5"
                    />
                  </td>
                  <td class="px-4 py-3 text-right">
                    <div class="flex flex-col items-end">
                      <span class="font-mono font-medium text-emerald-600 dark:text-emerald-400">
                        ${{ (log.estimatedCost || 0).toFixed(5) }}
                      </span>
                      <span class="text-xs text-gray-500 font-mono">
                        {{ log.totalTokens?.toLocaleString() || 0 }} toks
                      </span>
                    </div>
                  </td>
                  <td class="px-4 py-3 text-right">
                    <UButton
                      :icon="
                        expandedRows.has(log.id) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'
                      "
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      @click.stop="toggleExpand(log.id)"
                    />
                  </td>
                </tr>
                <!-- Details Row -->
                <tr v-if="expandedRows.has(log.id)" class="bg-gray-50 dark:bg-gray-800/50">
                  <td colspan="8" class="p-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <h4 class="font-semibold mb-2 text-gray-700 dark:text-gray-300">Details</h4>
                        <dl class="space-y-1">
                          <div class="flex justify-between">
                            <dt class="text-gray-500">Duration:</dt>
                            <dd class="font-mono">{{ log.durationMs }}ms</dd>
                          </div>
                          <div class="flex justify-between">
                            <dt class="text-gray-500">Log ID:</dt>
                            <dd class="font-mono text-xs">{{ log.id }}</dd>
                          </div>
                          <div v-if="!log.success" class="mt-2 text-red-500">
                            <dt class="font-semibold">Error:</dt>
                            <dd
                              class="font-mono text-xs bg-red-100 dark:bg-red-900/20 p-2 rounded mt-1"
                            >
                              {{ log.errorType }}: {{ log.errorMessage }}
                            </dd>
                          </div>
                        </dl>
                      </div>
                      <div v-if="log.feedback || log.feedbackText">
                        <h4 class="font-semibold mb-2 text-gray-700 dark:text-gray-300">
                          Full Feedback
                        </h4>
                        <div
                          class="bg-white dark:bg-gray-900 p-3 rounded border border-gray-200 dark:border-gray-700"
                        >
                          <div class="flex items-center gap-2 mb-2">
                            <UIcon
                              v-if="log.feedback"
                              :name="
                                log.feedback === 'THUMBS_UP'
                                  ? 'i-lucide-thumbs-up'
                                  : 'i-lucide-thumbs-down'
                              "
                              :class="
                                log.feedback === 'THUMBS_UP' ? 'text-green-500' : 'text-red-500'
                              "
                            />
                            <span class="font-medium">{{ log.feedback }}</span>
                          </div>
                          <p
                            v-if="log.feedbackText"
                            class="text-gray-600 dark:text-gray-400 italic"
                          >
                            "{{ log.feedbackText }}"
                          </p>
                        </div>
                      </div>
                    </div>
                    <div class="mt-4 flex justify-end">
                      <UButton
                        :to="`/admin/llm/logs/${log.id}`"
                        label="View Full Log Trace"
                        color="primary"
                        variant="soft"
                        size="xs"
                        icon="i-lucide-external-link"
                      />
                    </div>
                  </td>
                </tr>
              </template>

              <tr v-if="!data?.logs.length && !pending">
                <td colspan="8" class="p-8 text-center text-gray-500">
                  <UIcon name="i-lucide-search" class="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  No logs found matching your filters.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div
          class="p-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between"
        >
          <span class="text-sm text-gray-500">
            Page {{ page }} of {{ data?.pagination.totalPages || 1 }}
          </span>
          <div class="flex gap-2">
            <UButton
              icon="i-lucide-chevron-left"
              color="neutral"
              variant="ghost"
              :disabled="page <= 1"
              @click="page--"
            />
            <UButton
              icon="i-lucide-chevron-right"
              color="neutral"
              variant="ghost"
              :disabled="page >= (data?.pagination.totalPages || 1)"
              @click="page++"
            />
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
