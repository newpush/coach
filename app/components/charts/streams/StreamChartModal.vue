<template>
  <UModal v-model:open="isOpen" :title="title" :ui="{ content: 'max-w-4xl' }">
    <template #body>
      <div v-if="loading" class="flex justify-center items-center h-64">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-gray-400" />
      </div>
      <div v-else-if="error" class="text-center text-red-500 py-8">
        {{ error }}
      </div>
      <div v-else-if="streamData && streamData.length > 0">
        <BaseStreamChart
          :label="title"
          :data-points="streamData"
          :labels="timeData"
          :color="chartColor"
          :y-axis-label="yAxisLabel"
        />
        <div class="mt-4 grid grid-cols-3 gap-4 text-center text-sm">
          <div class="bg-gray-50 dark:bg-gray-800 p-2 rounded">
            <div class="text-gray-500">Average</div>
            <div class="font-bold">{{ average }}</div>
          </div>
          <div class="bg-gray-50 dark:bg-gray-800 p-2 rounded">
            <div class="text-gray-500">Max</div>
            <div class="font-bold">{{ max }}</div>
          </div>
          <div class="bg-gray-50 dark:bg-gray-800 p-2 rounded">
            <div class="text-gray-500">Min</div>
            <div class="font-bold">{{ min }}</div>
          </div>
        </div>
      </div>
      <div v-else class="text-center text-gray-500 py-8">No data available for this stream.</div>
    </template>
    <template #footer>
      <div class="flex justify-end">
        <UButton color="neutral" variant="ghost" label="Close" @click="isOpen = false" />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
  import BaseStreamChart from './BaseStreamChart.vue'

  const props = defineProps<{
    workoutId: string
    streamKey: string
    title: string
    color?: string
    unit?: string
  }>()

  const isOpen = defineModel<boolean>('open')

  const loading = ref(false)
  const error = ref<string | null>(null)
  const streamData = ref<number[]>([])
  const timeData = ref<number[]>([])

  const chartColor = computed(() => props.color || '#3b82f6')
  const yAxisLabel = computed(() => props.unit || '')

  const average = computed(() => {
    if (!streamData.value.length) return '-'
    const sum = streamData.value.reduce((a, b) => a + b, 0)
    return (sum / streamData.value.length).toFixed(1)
  })

  const max = computed(() => {
    if (!streamData.value.length) return '-'
    return Math.max(...streamData.value).toFixed(1)
  })

  const min = computed(() => {
    if (!streamData.value.length) return '-'
    return Math.min(...streamData.value).toFixed(1)
  })

  // Fetch stream data when modal opens
  watch(isOpen, async (val) => {
    if (val && props.workoutId && props.streamKey) {
      await fetchStreamData()
    }
  })

  async function fetchStreamData() {
    loading.value = true
    error.value = null
    try {
      // We reuse the existing workout detail endpoint which includes streams
      // Ideally we might want a specific endpoint for just streams if payload is large,
      // but for now we extract from the full workout object or we can add a specific API.
      // Let's check if we can fetch just the streams or if we already have them in the parent.
      // Assuming we fetch fresh to ensure we get the full array data if it was truncated/optimized elsewhere.

      // Actually, looking at the previous step, the workout detail endpoint returns `streams: true`.
      // So the data might be huge.
      // Let's define a new lightweight endpoint for specific stream data if we want to be efficient,
      // OR just use the /api/workouts/:id response if we assume client has it.
      // BUT the 'streamKey' passed here (e.g. 'torque') matches the DB column name.

      const response = await $fetch<any>(`/api/workouts/${props.workoutId}`)

      if (response && response.streams) {
        // Map the prop streamKey (e.g., 'torque') to the response stream data
        // The API returns streams object with keys like 'torque', 'watts', etc.
        // And they are JSON arrays.

        // Handle case mapping if needed, but we standardized on camelCase/db names
        const key = props.streamKey

        if (response.streams[key] && Array.isArray(response.streams[key])) {
          streamData.value = response.streams[key]
          timeData.value = response.streams.time || []
        } else {
          error.value = `Stream '${props.title}' not found.`
        }
      } else {
        error.value = 'Streams not available for this workout.'
      }
    } catch (e: any) {
      error.value = e.message || 'Failed to load stream data'
    } finally {
      loading.value = false
    }
  }
</script>
