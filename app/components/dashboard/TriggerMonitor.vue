<template>
  <div v-if="modelValue" class="fixed bottom-4 right-4 z-50 w-80 sm:w-96 shadow-xl">
    <UCard :ui="{ body: { padding: 'p-0' }, header: { padding: 'p-3' } }">
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-cpu-chip" class="w-5 h-5 text-gray-900 dark:text-white" />
            <h3 class="font-semibold text-sm">Background Tasks</h3>
            <UBadge v-if="activeCount > 0" size="xs" color="primary" variant="subtle">
              {{ activeCount }} running
            </UBadge>
          </div>
          <div class="flex items-center gap-1">
            <UButton
              color="gray"
              variant="ghost"
              size="xs"
              icon="i-heroicons-arrow-path"
              :loading="isLoading"
              @click="refresh"
            />
            <UButton
              color="gray"
              variant="ghost"
              size="xs"
              icon="i-heroicons-x-mark"
              @click="close"
            />
          </div>
        </div>
      </template>

      <div class="max-h-96 overflow-y-auto">
        <div v-if="runs.length === 0" class="p-4 text-center text-gray-500 text-sm">
          No active tasks.
        </div>

        <div v-else class="divide-y divide-gray-100 dark:divide-gray-800">
          <div
            v-for="run in runs"
            :key="run.id"
            class="p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group relative"
          >
            <div class="flex items-start justify-between mb-1">
              <div class="flex items-center gap-2 min-w-0">
                <UIcon
                  v-if="isRunning(run.status)"
                  name="i-heroicons-arrow-path"
                  class="w-4 h-4 animate-spin text-blue-500 shrink-0"
                />
                <UIcon
                  v-else-if="run.status === 'COMPLETED'"
                  name="i-heroicons-check-circle"
                  class="w-4 h-4 text-green-500 shrink-0"
                />
                <UIcon
                  v-else-if="run.status === 'FAILED'"
                  name="i-heroicons-x-circle"
                  class="w-4 h-4 text-red-500 shrink-0"
                />
                <UIcon v-else name="i-heroicons-clock" class="w-4 h-4 text-gray-400 shrink-0" />
                <span class="font-medium text-sm truncate" :title="run.taskIdentifier">
                  {{ formatTaskName(run.taskIdentifier) }}
                </span>
              </div>

              <!-- Status Badge (Hidden on hover if running) -->
              <div :class="{ 'group-hover:opacity-0 transition-opacity': isRunning(run.status) }">
                <Transition mode="out-in" name="slide-fade">
                  <UBadge
                    :key="run.status"
                    :color="getStatusColor(run.status)"
                    size="xs"
                    variant="soft"
                  >
                    {{ run.status }}
                  </UBadge>
                </Transition>
              </div>

              <!-- Cancel Button (Shown on hover if running) -->
              <div
                v-if="isRunning(run.status)"
                class="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <UTooltip text="Stop task">
                  <UButton
                    color="red"
                    variant="soft"
                    size="xs"
                    icon="i-heroicons-stop"
                    :loading="cancellingId === run.id"
                    @click="stopRun(run.id)"
                  />
                </UTooltip>
              </div>
            </div>

            <div class="flex items-center justify-between text-xs text-gray-500 mt-1">
              <span class="font-mono">{{ run.id.slice(-8) }}</span>
              <div class="flex items-center gap-2">
                <span>{{ formatDuration(run) }}</span>
                <span>{{ formatTime(run.startedAt) }}</span>
              </div>
            </div>

            <!-- Error Message -->
            <div
              v-if="run.error"
              class="mt-2 text-xs text-red-600 bg-red-50 dark:bg-red-900/10 p-2 rounded break-words"
            >
              {{ run.error.message || 'Unknown error' }}
            </div>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
  import { useNow } from '@vueuse/core'

  const props = defineProps<{
    modelValue: boolean
  }>()

  const emit = defineEmits(['update:modelValue'])

  const { runs, refresh, isLoading, cancelRun } = useUserRuns()
  const { formatDate } = useFormat()
  const now = useNow({ interval: 1000 })
  const cancellingId = ref<string | null>(null)

  const activeCount = computed(
    () =>
      runs.value.filter((r) =>
        ['EXECUTING', 'QUEUED', 'WAITING_FOR_DEPLOY', 'REATTEMPTING'].includes(r.status)
      ).length
  )

  const close = () => {
    emit('update:modelValue', false)
  }

  const stopRun = async (runId: string) => {
    cancellingId.value = runId
    try {
      await cancelRun(runId)
    } catch (e) {
      // Error handled in composable but we could show a toast here
    } finally {
      cancellingId.value = null
    }
  }

  const isRunning = (status: string) => {
    return ['EXECUTING', 'QUEUED', 'WAITING_FOR_DEPLOY', 'REATTEMPTING'].includes(status)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'EXECUTING':
        return 'blue'
      case 'QUEUED':
        return 'orange'
      case 'WAITING_FOR_DEPLOY':
        return 'yellow'
      case 'COMPLETED':
        return 'green'
      case 'FAILED':
        return 'red'
      case 'CANCELED':
        return 'gray'
      case 'TIMED_OUT':
        return 'red'
      default:
        return 'gray'
    }
  }

  const formatTaskName = (id: string) => {
    return id
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  const formatTime = (isoString: string) => {
    if (!isoString) return ''
    return formatDate(isoString, 'h:mm a')
  }

  const formatDuration = (run: any) => {
    if (!run.startedAt) return ''

    const start = new Date(run.startedAt).getTime()
    let end = now.value.getTime()

    if (run.finishedAt) {
      end = new Date(run.finishedAt).getTime()
    } else if (!isRunning(run.status)) {
      // If not running but no finishedAt (e.g. initial load completed run),
      // maybe we shouldn't show duration or it's unknown.
      // Ideally we have finishedAt.
      return ''
    }

    const diff = Math.max(0, end - start)
    const seconds = Math.floor(diff / 1000)

    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    return `${minutes}m ${seconds % 60}s`
  }
</script>

<style scoped>
  .slide-fade-enter-active,
  .slide-fade-leave-active {
    transition: all 0.3s ease;
  }

  .slide-fade-enter-from {
    opacity: 0;
    transform: translateY(-10px);
  }

  .slide-fade-leave-to {
    opacity: 0;
    transform: translateY(10px);
  }
</style>
