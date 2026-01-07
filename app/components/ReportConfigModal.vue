<template>
  <div class="p-6 space-y-6">
    <!-- Report Type Selection -->
    <div>
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        What would you like to analyze?
      </label>
      <USelect
        v-model="config.dataType"
        :items="dataTypeOptions"
        placeholder="Select data type"
        value-key="value"
        :ui="{ content: 'min-w-fit' }"
      />
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
        {{ selectedDataTypeDescription }}
      </p>
    </div>

    <!-- Timeframe Selection -->
    <div>
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Timeframe
      </label>
      <URadioGroup v-model="config.timeframeType" :options="timeframeTypeOptions" class="mb-3" />

      <!-- Days Selection -->
      <div v-if="config.timeframeType === 'days'">
        <UInput
          v-model.number="config.days"
          type="number"
          min="1"
          max="90"
          placeholder="Number of days"
        >
          <template #trailing>
            <span class="text-gray-400 text-sm">days</span>
          </template>
        </UInput>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Analyze the last {{ config.days || 0 }} days of data
        </p>
      </div>

      <!-- Count Selection -->
      <div v-else-if="config.timeframeType === 'count'">
        <UInput
          v-model.number="config.count"
          type="number"
          min="1"
          max="50"
          :placeholder="`Number of ${config.dataType === 'workouts' ? 'workouts' : 'nutrition days'}`"
        >
          <template #trailing>
            <span class="text-gray-400 text-sm">
              {{ config.dataType === 'workouts' ? 'workouts' : 'days' }}
            </span>
          </template>
        </UInput>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Analyze the last {{ config.count || 0 }}
          {{ config.dataType === 'workouts' ? 'workouts' : 'nutrition days' }}
        </p>
      </div>

      <!-- Date Range Selection -->
      <div v-else-if="config.timeframeType === 'range'">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-gray-600 dark:text-gray-400 mb-1">From</label>
            <UInput v-model="config.startDate" type="date" :max="config.endDate || todayDate" />
          </div>
          <div>
            <label class="block text-xs text-gray-600 dark:text-gray-400 mb-1">To</label>
            <UInput v-model="config.endDate" type="date" :min="config.startDate" :max="todayDate" />
          </div>
        </div>
      </div>
    </div>

    <!-- Workout Type Filter (only for workouts) -->
    <div v-if="config.dataType === 'workouts' || config.dataType === 'both'">
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Workout Types (Optional)
      </label>
      <USelect
        v-model="config.workoutTypes"
        :items="workoutTypeOptions"
        multiple
        placeholder="All workout types"
        value-key="value"
        :ui="{ content: 'min-w-fit' }"
      />
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
        Leave empty to include all workout types
      </p>
    </div>

    <!-- Report Focus -->
    <div>
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Report Focus
      </label>
      <USelect
        v-model="config.focusArea"
        :items="focusAreaOptions"
        placeholder="General Analysis"
        value-key="value"
        :ui="{ content: 'min-w-fit' }"
      />
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
        {{ selectedFocusDescription }}
      </p>
    </div>

    <!-- Summary of Configuration -->
    <UAlert
      color="info"
      variant="soft"
      icon="i-heroicons-information-circle"
      :title="configSummary"
      class="text-sm"
    />

    <!-- Action Buttons -->
    <div class="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
      <UButton color="neutral" variant="ghost" @click="emit('close')"> Cancel </UButton>
      <UButton color="primary" :disabled="!isConfigValid" @click="handleGenerate">
        <UIcon name="i-heroicons-sparkles" class="w-4 h-4 mr-2" />
        Generate Report
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
  const { formatDate, getUserLocalDate } = useFormat()

  interface ReportConfig {
    dataType: 'workouts' | 'nutrition' | 'both'
    timeframeType: 'days' | 'count' | 'range'
    days?: number
    count?: number
    startDate?: string
    endDate?: string
    workoutTypes: string[]
    focusArea: string
  }

  const emit = defineEmits<{
    generate: [config: ReportConfig]
    close: []
  }>()

  const todayDate = computed(() => {
    return getUserLocalDate().toISOString().split('T')[0]
  })

  // Default configuration
  const config = ref<ReportConfig>({
    dataType: 'workouts',
    timeframeType: 'days',
    days: 7,
    count: 3,
    startDate: '',
    endDate: todayDate.value,
    workoutTypes: [],
    focusArea: 'general'
  })

  const dataTypeOptions = [
    {
      value: 'workouts',
      label: 'Workouts Only',
      icon: 'i-heroicons-chart-bar',
      description: 'Analyze training sessions and performance'
    },
    {
      value: 'nutrition',
      label: 'Nutrition Only',
      icon: 'i-heroicons-cake',
      description: 'Analyze dietary intake and nutrition patterns'
    },
    {
      value: 'both',
      label: 'Workouts & Nutrition',
      icon: 'i-heroicons-squares-2x2',
      description: 'Comprehensive analysis of training and nutrition'
    }
  ]

  const timeframeTypeOptions = [
    { value: 'days', label: 'Last N Days' },
    { value: 'count', label: 'Last N Items' },
    { value: 'range', label: 'Date Range' }
  ]

  const workoutTypeOptions = [
    { value: 'Ride', label: 'Ride (Cycling)' },
    { value: 'Run', label: 'Run' },
    { value: 'Swim', label: 'Swim' },
    { value: 'WeightTraining', label: 'Weight Training' },
    { value: 'Walk', label: 'Walk' },
    { value: 'VirtualRide', label: 'Virtual Ride' },
    { value: 'Hike', label: 'Hike' },
    { value: 'Yoga', label: 'Yoga' },
    { value: 'Other', label: 'Other' }
  ]

  const focusAreaOptions = [
    {
      value: 'general',
      label: 'General Analysis',
      icon: 'i-heroicons-document-text',
      description: 'Comprehensive overview and insights'
    },
    {
      value: 'performance',
      label: 'Performance Trends',
      icon: 'i-heroicons-arrow-trending-up',
      description: 'Focus on progress and performance metrics'
    },
    {
      value: 'recovery',
      label: 'Recovery & Fatigue',
      icon: 'i-heroicons-heart',
      description: 'Analyze recovery patterns and training load'
    },
    {
      value: 'consistency',
      label: 'Training Consistency',
      icon: 'i-heroicons-calendar',
      description: 'Evaluate adherence and consistency'
    },
    {
      value: 'nutrition',
      label: 'Nutrition Quality',
      icon: 'i-heroicons-beaker',
      description: 'Deep dive into dietary patterns'
    }
  ]

  const selectedDataTypeDescription = computed(() => {
    const option = dataTypeOptions.find((opt) => opt.value === config.value.dataType)
    return option?.description || ''
  })

  const selectedFocusDescription = computed(() => {
    const option = focusAreaOptions.find((opt) => opt.value === config.value.focusArea)
    return option?.description || ''
  })

  const configSummary = computed(() => {
    let summary = 'Report will analyze '

    // Data type
    if (config.value.dataType === 'workouts') {
      summary += 'workouts '
    } else if (config.value.dataType === 'nutrition') {
      summary += 'nutrition '
    } else {
      summary += 'workouts & nutrition '
    }

    // Timeframe
    if (config.value.timeframeType === 'days' && config.value.days) {
      summary += `from the last ${config.value.days} days`
    } else if (config.value.timeframeType === 'count' && config.value.count) {
      summary += `for the last ${config.value.count} ${config.value.dataType === 'workouts' ? 'workouts' : 'nutrition days'}`
    } else if (
      config.value.timeframeType === 'range' &&
      config.value.startDate &&
      config.value.endDate
    ) {
      summary += `from ${formatDate(config.value.startDate)} to ${formatDate(config.value.endDate)}`
    }

    // Workout types
    if (config.value.workoutTypes.length > 0) {
      summary += `, filtered to: ${config.value.workoutTypes.join(', ')}`
    }

    return summary
  })

  const isConfigValid = computed(() => {
    if (config.value.timeframeType === 'days') {
      return config.value.days && config.value.days > 0 && config.value.days <= 90
    } else if (config.value.timeframeType === 'count') {
      return config.value.count && config.value.count > 0 && config.value.count <= 50
    } else if (config.value.timeframeType === 'range') {
      return (
        config.value.startDate &&
        config.value.endDate &&
        config.value.startDate <= config.value.endDate
      )
    }
    return false
  })

  const handleGenerate = () => {
    if (!isConfigValid.value) return
    emit('generate', { ...config.value })
    emit('close')
  }
</script>
