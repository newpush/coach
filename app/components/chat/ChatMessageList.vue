<script setup lang="ts">
  import { computed } from 'vue'
  import ChatToolCall from '~/components/ChatToolCall.vue'
  import ChatChart from '~/components/ChatChart.vue'
  import ChatToolApproval from '~/components/chat/ChatToolApproval.vue'

  const props = defineProps<{
    messages: any[]
    status: any
    loading: boolean
  }>()

  const emit = defineEmits(['tool-approval'])

  // Filter out tool messages (responses) as they are internal state or handled via UI
  const filteredMessages = computed(() => {
    return props.messages.filter((m) => m.role !== 'tool')
  })

  const handleToolApproval = (response: any) => {
    emit('tool-approval', response)
  }

  // Check if an approval request has been answered in subsequent messages
  const getApprovalResult = (approvalId: string) => {
    // Iterate through all messages (including hidden tool messages)
    for (const msg of props.messages) {
      if (msg.role === 'tool') {
        // Check content (if array)
        if (msg.content && Array.isArray(msg.content)) {
          const part = msg.content.find(
            (p: any) =>
              (p.type === 'tool-result' || p.type === 'tool-approval-response') &&
              (p.toolCallId === approvalId || p.approvalId === approvalId)
          )
          if (part) {
            return part.result || (part.approved ? 'Approved' : 'Denied')
          }
        }

        // Check parts (populated during hydration)
        if (msg.parts && Array.isArray(msg.parts)) {
          const part = msg.parts.find(
            (p: any) =>
              (p.type === 'tool-result' || p.type === 'tool-approval-response') &&
              (p.toolCallId === approvalId || p.approvalId === approvalId)
          )
          if (part) {
            return part.result || (part.approved ? 'Approved' : 'Denied')
          }
        }
      }
    }
    return null
  }
  // Extract charts from both metadata (persisted) and tool parts (immediate)
  const getCharts = (message: any) => {
    const charts = []

    // 1. From Metadata (Persisted)
    if (message.metadata?.charts?.length) {
      charts.push(...message.metadata.charts)
    }

    // 2. From Tool Invocations (Immediate)
    // Only if not already in metadata (to avoid duplicates if we have both)
    if (message.parts && message.parts.length) {
      message.parts.forEach((part: any) => {
        if (
          (part.type === 'tool-invocation' || part.type.startsWith('tool-')) &&
          (part.toolName === 'create_chart' ||
            (part.type.startsWith('tool-') && part.type.includes('create_chart')))
        ) {
          const result = part.result || part.output
          // Check if this chart is already in metadata to avoid duplication
          // (Simple check by title or ID if available, but metadata usually has generated ID)
          // For now, if we have metadata charts, assume they cover it.
          // BUT, during streaming, metadata might be empty.
          if (!message.metadata?.charts?.length && result && result.success) {
            charts.push({
              id: `temp-${part.toolCallId}`,
              ...result // result contains title, type, data, etc.
            })
          }
        }
      })
    }

    return charts
  }
</script>

<template>
  <div class="flex-1 overflow-y-auto">
    <UContainer class="h-full">
      <div v-if="loading" class="space-y-6 py-8">
        <div v-for="i in 3" :key="i" class="flex flex-col space-y-4">
          <div class="flex items-start gap-3">
            <USkeleton class="h-8 w-8 rounded-full" />
            <USkeleton class="h-16 w-1/2 rounded-2xl" />
          </div>
          <div class="flex items-start justify-end gap-3">
            <USkeleton class="h-16 w-1/2 rounded-2xl" />
            <USkeleton class="h-8 w-8 rounded-full" />
          </div>
        </div>
      </div>

      <div v-else class="h-full flex flex-col">
        <UChatMessages :messages="filteredMessages" :status="status">
          <template #content="{ message }">
            <div v-if="message.parts && message.parts.length">
              <template
                v-for="(part, index) in message.parts"
                :key="`${message.id}-${part.type}-${index}`"
              >
                <!-- Text Part -->
                <div
                  v-if="part.type === 'text'"
                  class="prose prose-sm dark:prose-invert max-w-none"
                >
                  <MDC :value="part.text" :cache-key="`${message.id}-${index}`" />
                </div>

                <!-- Tool Approval Request -->
                <ChatToolApproval
                  v-else-if="
                    part.type === 'tool-approval-request' ||
                    (part.type.startsWith('tool-') && (part as any).state === 'approval-requested')
                  "
                  :approval-id="
                    (part as any).approvalId ||
                    (part as any).approval?.id ||
                    (part as any).toolCallId
                  "
                  :tool-call="{
                    toolName:
                      (part as any).toolCall?.toolName ||
                      (part as any).toolName ||
                      part.type.replace('tool-', ''),
                    args: (part as any).toolCall?.args || (part as any).args || (part as any).input
                  }"
                  :result="
                    getApprovalResult(
                      (part as any).approvalId ||
                        (part as any).approval?.id ||
                        (part as any).toolCallId
                    )
                  "
                  @approve="(e) => handleToolApproval({ ...e, approved: true })"
                  @deny="(e) => handleToolApproval({ ...e, approved: false })"
                />

                <!-- Tool Invocation Part (Generic or Specific) -->
                <ChatToolCall
                  v-else-if="
                    (part.type === 'tool-invocation' || part.type.startsWith('tool-')) &&
                    part.type !== 'tool-approval-response'
                  "
                  :tool-call="{
                    name:
                      (part as any).toolName ||
                      (part.type.startsWith('tool-') ? part.type.replace('tool-', '') : ''),
                    args: (part as any).args || (part as any).input,
                    response: (part as any).result || (part as any).output,
                    error: (part as any).errorText || (part as any).error,
                    timestamp:
                      (message as any).createdAt &&
                      !isNaN(new Date((message as any).createdAt).getTime())
                        ? new Date((message as any).createdAt).toISOString()
                        : new Date().toISOString(),
                    status:
                      (part as any).state === 'result' || (part as any).state === 'output-available'
                        ? 'success'
                        : (part as any).state === 'error' ||
                            (part as any).state === 'output-error' ||
                            (part as any).state === 'output-denied'
                          ? 'error'
                          : 'loading'
                  }"
                />

                <!-- Hidden Parts (Internal) -->
                <div v-else-if="part.type === 'tool-approval-response'" class="hidden"></div>

                <!-- Fallback Debug (ignore step-start) -->
                <div
                  v-else-if="part.type !== 'step-start'"
                  class="text-[10px] text-red-500 border border-red-200 p-1 my-1 rounded bg-red-50 font-mono overflow-auto max-h-40"
                >
                  <div>Unknown part type: {{ part.type }}</div>
                  <pre>{{ JSON.stringify(part, null, 2) }}</pre>
                </div>
              </template>
            </div>
            <div v-else class="prose prose-sm dark:prose-invert max-w-none">
              <MDC :value="(message as any).content" />
            </div>

            <!-- Charts (Metadata + Immediate) -->
            <div v-if="getCharts(message).length" class="mt-4 space-y-4">
              <ChatChart v-for="chart in getCharts(message)" :key="chart.id" :chart-data="chart" />
            </div>
          </template>
        </UChatMessages>
      </div>
    </UContainer>
  </div>
</template>
