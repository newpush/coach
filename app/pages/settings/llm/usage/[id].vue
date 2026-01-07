<template>
  <div class="space-y-6">
    <!-- Back Button -->
    <UButton variant="ghost" @click="$router.back()">
      <UIcon name="i-heroicons-arrow-left" />
      Back to AI Settings
    </UButton>

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin" />
    </div>

    <!-- Detail View -->
    <template v-else-if="data">
      <!-- Header Card -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <UIcon
                :name="data.success ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                :class="data.success ? 'text-success-500' : 'text-error-500'"
                class="w-6 h-6"
              />
              <div>
                <h1 class="text-2xl font-bold">{{ formatOperation(data.operation) }}</h1>
                <p class="text-sm text-muted">{{ formatDate(data.createdAt) }}</p>
              </div>
            </div>
            <UBadge :color="data.success ? 'success' : 'error'" variant="subtle">
              {{ data.success ? 'Success' : 'Failed' }}
            </UBadge>
          </div>
        </template>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <div class="text-sm text-muted mb-1">Model</div>
            <div class="font-semibold">{{ data.model }}</div>
            <UBadge
              v-if="data.modelType"
              :color="data.modelType === 'flash' ? 'info' : 'primary'"
              variant="subtle"
              size="xs"
              class="mt-1"
            >
              {{ data.modelType }}
            </UBadge>
          </div>

          <div>
            <div class="text-sm text-muted mb-1">Total Tokens</div>
            <div class="font-semibold">{{ formatNumber(data.totalTokens) }}</div>
            <div class="text-xs text-muted mt-1">
              {{ data.promptTokens ?? 0 }} in / {{ data.completionTokens ?? 0 }} out
            </div>
          </div>

          <div>
            <div class="text-sm text-muted mb-1">Cost</div>
            <div class="font-semibold font-mono">${{ (data.estimatedCost ?? 0).toFixed(4) }}</div>
          </div>

          <div>
            <div class="text-sm text-muted mb-1">Duration</div>
            <div class="font-semibold">{{ ((data.durationMs ?? 0) / 1000).toFixed(2) }}s</div>
            <div v-if="data.retryCount > 0" class="text-xs text-muted mt-1">
              {{ data.retryCount }} {{ data.retryCount === 1 ? 'retry' : 'retries' }}
            </div>
          </div>
        </div>

        <div v-if="data.entityType" class="mt-4 pt-4 border-t">
          <div class="text-sm text-muted mb-1">Related Entity</div>
          <div class="font-medium">{{ data.entityType }}</div>
          <div v-if="data.entityId" class="text-xs text-muted font-mono">
            ID: {{ data.entityId }}
          </div>
        </div>
      </UCard>

      <!-- Error Details (if failed) -->
      <UCard v-if="!data.success">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-red-500" />
            <h2 class="text-xl font-semibold">Error Details</h2>
          </div>
        </template>

        <div class="space-y-4">
          <div v-if="data.errorType">
            <div class="text-sm text-muted mb-1">Error Type</div>
            <UBadge color="error" variant="subtle">
              {{ data.errorType }}
            </UBadge>
          </div>

          <div v-if="data.errorMessage">
            <div class="text-sm text-muted mb-1">Error Message</div>
            <div
              class="p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg"
            >
              <pre class="text-sm whitespace-pre-wrap font-mono">{{ data.errorMessage }}</pre>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Prompt -->
      <UCard v-if="data.promptFull || data.promptPreview">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-chat-bubble-left" class="w-5 h-5 text-blue-500" />
            <h2 class="text-xl font-semibold">Prompt</h2>
          </div>
        </template>

        <div
          class="p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg max-h-96 overflow-y-auto"
        >
          <pre class="text-sm whitespace-pre-wrap">{{ data.promptFull || data.promptPreview }}</pre>
        </div>
        <div v-if="!data.promptFull && data.promptPreview" class="mt-2 text-xs text-muted">
          Note: Only preview available (first 500 characters). Full prompts are stored for newer
          records.
        </div>
      </UCard>

      <!-- Response -->
      <UCard v-if="data.responseFull || data.responsePreview">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-chat-bubble-left-right" class="w-5 h-5 text-green-500" />
            <h2 class="text-xl font-semibold">Response</h2>
          </div>
        </template>

        <div
          class="p-4 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg max-h-96 overflow-y-auto"
        >
          <pre class="text-sm whitespace-pre-wrap">{{
            data.responseFull || data.responsePreview
          }}</pre>
        </div>
        <div v-if="!data.responseFull && data.responsePreview" class="mt-2 text-xs text-muted">
          Note: Only preview available (first 500 characters). Full responses are stored for newer
          records.
        </div>
      </UCard>
    </template>

    <!-- Error State -->
    <UCard v-else>
      <div class="text-center py-8">
        <UIcon name="i-heroicons-exclamation-circle" class="w-12 h-12 mx-auto text-red-500 mb-4" />
        <h2 class="text-xl font-semibold mb-2">Record Not Found</h2>
        <p class="text-muted mb-4">The requested usage record could not be found.</p>
        <UButton @click="$router.back()"> Go Back </UButton>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
  const route = useRoute()
  const loading = ref(true)

  definePageMeta({
    middleware: 'auth'
  })

  interface LlmUsage {
    id: string
    success: boolean
    createdAt: string
    model: string
    provider: string
    operation: string
    modelType: string | null
    totalTokens: number | null
    promptTokens: number | null
    completionTokens: number | null
    estimatedCost: number | null
    durationMs: number | null
    retryCount: number
    entityType: string | null
    entityId: string | null
    errorType: string | null
    errorMessage: string | null
    promptFull: string | null
    promptPreview: string | null
    responseFull: string | null
    responsePreview: string | null
  }

  const id = computed(() => route.params.id as string)

  const { data } = await useFetch<LlmUsage>(`/api/analytics/llm-usage/${id.value}`, {
    lazy: true,
    server: false
  })

  watchEffect(() => {
    if (data.value !== undefined) {
      loading.value = false
    }
  })

  function formatNumber(num: number | null | undefined): string {
    if (!num || num === 0) return '0'
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M'
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K'
    }
    return num.toLocaleString()
  }

  function formatOperation(op: string): string {
    return op
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  function formatDate(date: string): string {
    const d = new Date(date)
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  useHead(() => {
    return {
      title: data.value ? `AI Usage: ${formatOperation(data.value.operation)}` : 'AI Usage Details',
      meta: [
        {
          name: 'description',
          content: 'Detailed breakdown of AI operation, token usage, and costs.'
        }
      ]
    }
  })
</script>
