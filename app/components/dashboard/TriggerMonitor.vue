<template>
  <div v-if="modelValue" class="fixed bottom-4 right-4 z-50 w-80 sm:w-96 shadow-xl">
    <UCard :ui="{ body: 'p-0', header: 'p-3' }">
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-cpu-chip" class="w-5 h-5 text-gray-900 dark:text-white" />
            <div class="flex items-center gap-1.5">
              <h3 class="font-semibold text-sm">Background Tasks</h3>
              <UTooltip
                :text="
                  isConnected ? 'Real-time updates active' : 'Polling mode (WebSocket disconnected)'
                "
              >
                <div
                  class="w-2 h-2 rounded-full shrink-0 cursor-help"
                  :class="
                    isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'
                  "
                />
              </UTooltip>
            </div>
            <UBadge v-if="activeCount > 0" size="xs" color="primary" variant="subtle">
              {{ activeCount }} running
            </UBadge>
          </div>
          <div class="flex items-center gap-1">
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-heroicons-arrow-path"
              :loading="isLoading"
              @click="refresh"
            />
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-heroicons-x-mark"
              @click="close"
            />
          </div>
        </div>
      </template>

      <div class="max-h-96 overflow-y-auto flex flex-col">
        <div v-if="displayedRuns.length === 0" class="p-4 text-center text-gray-500 text-sm">
          No active tasks.
        </div>

        <div v-else class="divide-y divide-gray-100 dark:divide-gray-800">
          <div
            v-for="run in displayedRuns"
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
                    color="error"
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

        <div
          v-if="hasMoreHistory"
          class="p-2 text-center border-t border-gray-100 dark:border-gray-800"
        >
          <UButton variant="ghost" size="xs" color="neutral" @click="loadMore">
            Load previous runs
          </UButton>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
  import { useNow } from '@vueuse/core'
  import { ACTIVE_STATUSES } from '~/composables/useUserRuns'

  const props = defineProps<{
    modelValue: boolean
  }>()

  const emit = defineEmits(['update:modelValue'])

  const { runs, refresh, isLoading, cancelRun, isConnected } = useUserRuns()
  const { formatDate } = useFormat()
  const now = useNow({ interval: 1000 })
  const cancellingId = ref<string | null>(null)

  const activeCount = computed(
    () => runs.value.filter((r) => ACTIVE_STATUSES.includes(r.status)).length
  )

  // Initialize based on current state to prevent flash
  const historyLimit = ref(activeCount.value > 0 ? 0 : 5)

  const displayedRuns = computed(() => {
    const active: any[] = []
    const history: any[] = []

    // Runs are already sorted by date desc from the store
    runs.value.forEach((run) => {
      if (isRunning(run.status)) {
        active.push(run)
      } else {
        history.push(run)
      }
    })

    return [...active, ...history.slice(0, historyLimit.value)]
  })

  const hasMoreHistory = computed(() => {
    const historyCount = runs.value.filter((r) => !isRunning(r.status)).length
    return historyCount > historyLimit.value
  })

  const loadMore = () => {
    historyLimit.value += 10
  }

  // Handle open/close and refresh logic
  watch(
    () => props.modelValue,
    async (isOpen) => {
      if (isOpen) {
        // Set initial state immediately based on current store data
        // This prevents the "flash" of history while the refresh happens
        if (activeCount.value > 0) {
          historyLimit.value = 0
        } else {
          historyLimit.value = 5
        }

        // Force refresh from API to ensure we have latest state
        await refresh()

        // Re-evaluate after refresh in case status changed
        if (activeCount.value > 0) {
          historyLimit.value = 0
        }
      }
    },
    { immediate: true }
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
    return ACTIVE_STATUSES.includes(status)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'EXECUTING':
        return 'primary'
      case 'QUEUED':
        return 'warning'
      case 'REATTEMPTING':
        return 'warning'
      case 'WAITING_FOR_DEPLOY':
        return 'warning'
      case 'PENDING_VERSION':
        return 'warning'
      case 'FROZEN':
        return 'neutral'
      case 'DELAYED':
        return 'neutral'
      case 'COMPLETED':
        return 'success'
      case 'FAILED':
        return 'error'
      case 'CANCELED':
        return 'neutral'
      case 'TIMED_OUT':
        return 'error'
      case 'CRASHED':
        return 'error'
      case 'SYSTEM_FAILURE':
        return 'error'
      default:
        return 'neutral'
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
