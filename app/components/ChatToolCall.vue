<script setup lang="ts">
  interface ToolCall {
    name: string
    args: Record<string, any>
    response: any
    timestamp: string
  }

  const props = defineProps<{
    toolCall: ToolCall
  }>()

  const { formatDate } = useFormat()
  const isExpanded = ref(false)

  // Format tool name for display
  const formatToolName = (name: string) => {
    return name
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  // Format timestamp
  const formatTime = (timestamp: string) => {
    return formatDate(timestamp, 'HH:mm:ss')
  }

  // Check if response has error
  const hasError = computed(() => {
    return (
      props.toolCall.response &&
      typeof props.toolCall.response === 'object' &&
      'error' in props.toolCall.response
    )
  })

  // Get icon for tool
  const getToolIcon = (name: string) => {
    const iconMap: Record<string, string> = {
      get_recent_workouts: 'i-heroicons-chart-bar',
      get_workout_details: 'i-heroicons-document-magnifying-glass',
      get_nutrition_log: 'i-heroicons-cake',
      get_wellness_metrics: 'i-heroicons-heart',
      search_workouts: 'i-heroicons-magnifying-glass',
      get_performance_metrics: 'i-heroicons-chart-pie',
      get_planned_workouts: 'i-heroicons-calendar-days',
      create_planned_workout: 'i-heroicons-plus-circle',
      update_planned_workout: 'i-heroicons-pencil-square',
      delete_planned_workout: 'i-heroicons-trash',
      get_training_availability: 'i-heroicons-clock',
      update_training_availability: 'i-heroicons-calendar',
      generate_training_plan: 'i-heroicons-sparkles',
      get_current_plan: 'i-heroicons-document-text',
      get_workout_stream: 'i-heroicons-chart-bar-square',
      create_chart: 'i-heroicons-presentation-chart-line'
    }
    return iconMap[name] || 'i-heroicons-wrench-screwdriver'
  }

  // Format JSON for display
  const formatJson = (obj: any) => {
    return JSON.stringify(obj, null, 2)
  }

  // Truncate response for preview
  const responsePreview = computed(() => {
    if (hasError.value) {
      return props.toolCall.response.error
    }

    const response = props.toolCall.response
    if (typeof response === 'string') {
      return response.length > 100 ? response.substring(0, 100) + '...' : response
    }

    if (typeof response === 'object') {
      // Show a summary of the object
      if (response.count !== undefined) {
        return `Found ${response.count} results`
      }
      if (response.message) {
        return response.message
      }
      if (response.success) {
        return 'Operation successful'
      }
      return `${Object.keys(response).length} fields returned`
    }

    return String(response)
  })
</script>

<template>
  <div
    class="my-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 overflow-hidden"
  >
    <!-- Tool Call Header -->
    <button
      class="w-full px-4 py-3 flex items-start gap-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      :class="{ 'border-b border-gray-200 dark:border-gray-700': isExpanded }"
      @click="isExpanded = !isExpanded"
    >
      <!-- Icon -->
      <UIcon
        :name="getToolIcon(toolCall.name)"
        class="w-5 h-5 flex-shrink-0 mt-0.5"
        :class="hasError ? 'text-red-500' : 'text-blue-500'"
      />

      <!-- Main Content -->
      <div class="flex-1 min-w-0 flex flex-col items-start">
        <div class="flex items-center justify-between w-full gap-2">
          <span
            class="font-medium text-sm truncate"
            :class="
              hasError ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'
            "
          >
            {{ formatToolName(toolCall.name) }}
          </span>
          <span class="text-xs text-gray-400 flex-shrink-0">
            {{ formatTime(toolCall.timestamp) }}
          </span>
        </div>

        <span
          v-if="!isExpanded"
          class="text-xs text-gray-500 dark:text-gray-400 w-full truncate text-left mt-0.5"
        >
          {{ responsePreview }}
        </span>
      </div>

      <!-- Chevron -->
      <UIcon
        :name="isExpanded ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
        class="w-4 h-4 text-gray-400 flex-shrink-0 mt-1"
      />
    </button>

    <!-- Expanded Details -->
    <div v-if="isExpanded" class="p-4 space-y-4">
      <!-- Arguments -->
      <div v-if="Object.keys(toolCall.args).length > 0">
        <h4
          class="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2"
        >
          <UIcon name="i-heroicons-arrow-right-circle" class="w-4 h-4" />
          Input Parameters
        </h4>
        <div
          class="bg-white dark:bg-gray-950 rounded border border-gray-200 dark:border-gray-800 p-3"
        >
          <pre
            class="text-xs text-gray-600 dark:text-gray-400 overflow-x-auto"
          ><code>{{ formatJson(toolCall.args) }}</code></pre>
        </div>
      </div>

      <!-- Response -->
      <div>
        <h4
          class="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2"
        >
          <UIcon
            :name="hasError ? 'i-heroicons-exclamation-circle' : 'i-heroicons-arrow-left-circle'"
            class="w-4 h-4"
            :class="hasError ? 'text-red-500' : ''"
          />
          {{ hasError ? 'Error' : 'Response' }}
        </h4>
        <div
          class="rounded border p-3 max-h-96 overflow-y-auto"
          :class="
            hasError
              ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900'
              : 'bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800'
          "
        >
          <pre
            class="text-xs overflow-x-auto whitespace-pre-wrap break-words"
            :class="
              hasError ? 'text-red-700 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'
            "
          ><code>{{ formatJson(toolCall.response) }}</code></pre>
        </div>
      </div>
    </div>
  </div>
</template>
