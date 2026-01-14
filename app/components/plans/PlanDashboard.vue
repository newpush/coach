<template>
  <div class="space-y-3 sm:space-y-6">
    <!-- Header / Overview -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
      <div>
        <h2 class="text-2xl font-bold">{{ plan.goal?.title || plan.name || 'Untitled Plan' }}</h2>
        <div class="flex items-center gap-2 text-muted mt-1">
          <UIcon name="i-heroicons-calendar" class="w-4 h-4" />
          <span>Target: {{ formatDate(plan.targetDate) }}</span>
          <span class="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">{{
            plan.strategy
          }}</span>
        </div>
      </div>
      <div
        class="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-end w-full sm:w-auto border-t sm:border-t-0 border-gray-100 dark:border-gray-800 pt-3 sm:pt-0"
      >
        <div class="flex flex-col items-start sm:items-end">
          <div class="text-sm text-muted">Current Phase</div>
          <div class="font-bold text-lg text-primary">{{ currentBlock?.name || 'Prep' }}</div>
        </div>
        <div class="flex gap-2 justify-end mt-0 sm:mt-1">
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-heroicons-adjustments-horizontal"
            @click="showAdaptModal = true"
          >
            <span class="hidden sm:inline">Adapt</span>
          </UButton>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-heroicons-bookmark"
            @click="showSaveTemplateModal = true"
          >
            <span class="hidden sm:inline">Save</span>
          </UButton>
          <UButton
            size="xs"
            color="error"
            variant="ghost"
            icon="i-heroicons-trash"
            @click="showAbandonModal = true"
          />
        </div>
      </div>
    </div>

    <!-- Abandon Plan Modal -->
    <UModal
      v-model:open="showAbandonModal"
      title="Abandon Training Plan"
      description="Are you sure you want to abandon this plan?"
    >
      <template #body>
        <div class="p-6 space-y-4">
          <div
            class="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg text-sm text-red-800 dark:text-red-200 flex gap-3"
          >
            <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 flex-shrink-0" />
            <div>
              <p class="font-bold">This action cannot be undone.</p>
              <p class="mt-1">
                All future planned workouts will be removed. Past completed workouts will remain in
                your history.
              </p>
            </div>
          </div>

          <div class="flex justify-end gap-2 mt-4">
            <UButton color="neutral" variant="ghost" @click="showAbandonModal = false"
              >Cancel</UButton
            >
            <UButton color="error" :loading="abandoning" @click="confirmAbandon"
              >Abandon Plan</UButton
            >
          </div>
        </div>
      </template>
    </UModal>

    <!-- Save Template Modal -->
    <UModal v-model:open="showSaveTemplateModal" title="Save as Template">
      <template #body>
        <div class="p-6 space-y-4">
          <p class="text-sm text-muted">Save this plan structure to reuse later.</p>
          <UFormField label="Template Name" required>
            <UInput v-model="templateName" placeholder="e.g. My Base Builder" class="w-full" />
          </UFormField>
          <UFormField label="Description">
            <UTextarea
              v-model="templateDescription"
              placeholder="Notes about this plan..."
              class="w-full"
            />
          </UFormField>

          <div class="flex justify-end gap-2 mt-4">
            <UButton color="neutral" variant="ghost" @click="showSaveTemplateModal = false"
              >Cancel</UButton
            >
            <UButton color="primary" :loading="savingTemplate" @click="saveTemplate">Save</UButton>
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="showAdaptModal"
      title="Adapt Training Plan"
      description="Adjust your plan to handle missed workouts or schedule changes."
    >
      <template #body>
        <div class="p-6 space-y-4">
          <p class="text-sm text-muted">
            Life happens. Use these tools to adjust your plan to your current reality.
          </p>

          <div class="grid grid-cols-1 gap-3">
            <UButton
              block
              variant="outline"
              color="primary"
              icon="i-heroicons-forward"
              :loading="adapting === 'RECALCULATE_WEEK'"
              @click="adaptPlan('RECALCULATE_WEEK')"
            >
              Recalculate Remaining Week
            </UButton>
            <p class="text-[10px] text-muted text-center px-4">
              AI will look at your missed workouts and reschedule the rest of the week for optimal
              load.
            </p>

            <UButton
              block
              variant="outline"
              color="primary"
              icon="i-heroicons-arrow-right-circle"
              :loading="adapting === 'PUSH_FORWARD'"
              @click="adaptPlan('PUSH_FORWARD')"
            >
              Push Schedule Forward 1 Day
            </UButton>
            <p class="text-[10px] text-muted text-center px-4">
              Shifts all future planned workouts by one day.
            </p>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Plan with AI Modal -->
    <PlanAIModal
      v-model="showAIPlanModal"
      :loading="generatingWorkouts"
      :week-label="
        selectedWeek
          ? `Week ${selectedWeek.weekNumber}: ${formatDate(selectedWeek.startDate, 'MMM d')} - ${formatDate(selectedWeek.endDate, 'MMM d')}`
          : undefined
      "
      @generate="generatePlanWithAI"
    />

    <!-- Block Timeline -->
    <div class="relative pt-6 pb-2 overflow-x-auto w-full">
      <div class="min-w-[600px] relative px-2">
        <div class="h-2 bg-gray-200 dark:bg-gray-800 rounded-full w-full absolute top-9 z-0" />
        <div class="relative z-10 flex justify-between">
          <div
            v-for="block in plan.blocks"
            :key="block.id"
            class="flex flex-col items-center cursor-pointer group flex-1"
            @click="selectedBlockId = block.id"
          >
            <div v-if="generatingBlockId === block.id" class="mb-2 z-10 bg-white dark:bg-gray-900">
              <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin text-primary" />
            </div>
            <div
              v-else
              class="w-4 h-4 rounded-full border-2 transition-all mb-2 bg-white dark:bg-gray-900 z-10"
              :class="getBlockStatusColor(block)"
            />
            <div
              class="text-xs font-semibold text-center px-1"
              :class="selectedBlockId === block.id ? 'text-primary' : 'text-muted'"
            >
              {{ block.name }}
            </div>
            <div class="text-[10px] text-muted">{{ block.durationWeeks }}w</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Active Week View -->
    <div
      v-if="selectedBlock"
      class="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700"
    >
      <div
        class="p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4"
      >
        <h3 class="font-semibold text-lg">{{ selectedBlock.name }} - Overview</h3>
        <div class="flex flex-wrap gap-2 w-full sm:w-auto">
          <UButton
            size="xs"
            color="primary"
            variant="soft"
            icon="i-heroicons-sparkles"
            class="flex-1 sm:flex-none justify-center"
            @click="showAIPlanModal = true"
          >
            Plan with AI
          </UButton>
          <div class="flex overflow-x-auto pb-1 sm:pb-0 gap-1 flex-1 sm:flex-none">
            <UButton
              v-for="week in selectedBlock.weeks"
              :key="week.id"
              size="xs"
              :variant="selectedWeekId === week.id ? 'solid' : 'ghost'"
              class="whitespace-nowrap"
              @click="selectedWeekId = week.id"
            >
              Week {{ week.weekNumber }}
            </UButton>
          </div>
        </div>
      </div>

      <div class="p-3 sm:p-4">
        <div v-if="selectedWeek" class="space-y-3 sm:space-y-4">
          <!-- Week Stats -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-3 sm:mb-4">
            <div class="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div class="text-xs text-muted">Focus</div>
              <div class="font-bold">{{ selectedWeek.focus || selectedBlock.primaryFocus }}</div>
            </div>
            <div class="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div class="text-xs text-muted">Volume</div>
              <div class="font-bold">
                {{ Math.round((selectedWeek.volumeTargetMinutes / 60) * 10) / 10 }}h
              </div>
            </div>
            <div class="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div class="text-xs text-muted">TSS</div>
              <div class="font-bold">{{ selectedWeek.tssTarget }}</div>
            </div>
            <div class="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div class="text-xs text-muted">Type</div>
              <div class="font-bold" :class="selectedWeek.isRecovery ? 'text-green-500' : ''">
                {{ selectedWeek.isRecovery ? 'Recovery' : 'Training' }}
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2 text-xs text-muted mb-2 px-1">
            <UIcon name="i-heroicons-information-circle" class="w-4 h-4" />
            <span>Tip: Drag and drop rows to reorder workouts within the week.</span>
          </div>

          <!-- Workouts Table (Desktop) -->
          <div class="hidden sm:block overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 dark:bg-gray-900 text-muted">
                <tr>
                  <th class="w-8" />
                  <th class="px-4 py-2 text-left w-10" />
                  <th class="px-4 py-2 text-left">Day</th>
                  <th class="px-4 py-2 text-left">Workout</th>
                  <th class="px-4 py-2 text-left">Targets</th>
                  <th class="px-4 py-2 text-center">
                    <div class="flex items-center justify-center gap-1">
                      <UIcon
                        name="i-heroicons-chart-bar"
                        class="w-4 h-4 inline"
                        title="Structured Workout"
                      />
                      <UButton
                        v-if="selectedWeek?.workouts.some((w: any) => !w.structuredWorkout)"
                        size="xs"
                        color="primary"
                        variant="ghost"
                        icon="i-heroicons-sparkles"
                        title="Generate structure for all workouts in this week"
                        :loading="generatingAllStructures"
                        @click="generateAllStructureForWeek"
                      />
                    </div>
                  </th>
                  <th class="px-4 py-2 text-right">Status</th>
                  <th class="w-10 px-2 py-2" />
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                <tr
                  v-for="workout in selectedWeek.workouts"
                  :key="workout.id"
                  class="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors group"
                  draggable="true"
                  :class="{ 'opacity-50': draggingId === workout.id }"
                  @dragstart="onDragStart($event, workout)"
                  @dragover.prevent
                  @drop="onDrop($event, workout)"
                  @click="navigateToWorkout(workout.id)"
                >
                  <td class="pl-2 text-center cursor-move text-gray-300 group-hover:text-gray-500">
                    <UIcon name="i-heroicons-bars-2" class="w-4 h-4" />
                  </td>
                  <td
                    class="px-4 py-3 text-center border-l-4"
                    :class="getSportColorClass(workout.type)"
                  >
                    <UIcon
                      :name="getWorkoutIcon(workout.type)"
                      class="w-5 h-5"
                      :class="getIconColorClass(workout.type)"
                    />
                  </td>
                  <td class="px-4 py-3 font-medium hidden sm:table-cell">
                    {{ formatDay(workout.date) }}
                  </td>
                  <td class="px-4 py-3">
                    <div class="font-semibold">{{ workout.title }}</div>
                    <div class="text-xs text-muted">{{ workout.type }}</div>
                  </td>
                  <td class="px-4 py-3">
                    <div v-if="workout.type === 'Ride' || workout.type === 'VirtualRide'">
                      {{ Math.round(workout.durationSec / 60) }}m
                    </div>
                    <div v-else-if="workout.type === 'Run'">
                      {{ Math.round(workout.durationSec / 60) }}m
                      <span v-if="workout.distanceMeters"
                        >/ {{ Math.round((workout.distanceMeters / 1000) * 10) / 10 }} km</span
                      >
                    </div>
                    <div v-else-if="workout.type === 'Swim'">
                      {{ Math.round(workout.distanceMeters || 0) }}m
                    </div>
                    <div v-else-if="workout.type === 'Gym' || workout.type === 'WeightTraining'">
                      {{ Math.round(workout.durationSec / 60) }}m
                      <div v-if="workout.targetArea" class="text-xs text-muted mt-0.5">
                        Focus: {{ workout.targetArea }}
                      </div>
                    </div>
                    <div v-else>-</div>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <div class="flex justify-center">
                      <MiniWorkoutChart
                        v-if="workout.structuredWorkout"
                        :workout="workout.structuredWorkout"
                      />
                      <UButton
                        v-else
                        size="xs"
                        color="neutral"
                        variant="ghost"
                        icon="i-heroicons-sparkles"
                        :loading="generatingStructureForWorkoutId === workout.id"
                        title="Generate Structured Workout"
                        @click.stop="generateStructureForWorkout(workout.id)"
                      />
                    </div>
                  </td>
                  <td class="px-4 py-3 text-right whitespace-nowrap">
                    <UBadge :color="workout.completed ? 'success' : 'neutral'" size="xs">
                      {{ workout.completed ? 'Done' : 'Planned' }}
                    </UBadge>
                  </td>
                  <td class="px-2 py-3 text-center w-10">
                    <UTooltip
                      :text="
                        isLocalWorkout(workout)
                          ? 'Publish to Intervals.icu'
                          : 'Update on Intervals.icu'
                      "
                    >
                      <UButton
                        v-if="workout.type !== 'Rest' && workout.type !== 'Active Recovery'"
                        size="xs"
                        color="neutral"
                        :variant="isLocalWorkout(workout) ? 'ghost' : 'soft'"
                        :icon="
                          isLocalWorkout(workout)
                            ? 'i-heroicons-cloud-arrow-up'
                            : 'i-heroicons-arrow-path'
                        "
                        :loading="publishingId === workout.id"
                        @click.stop="publishWorkout(workout)"
                      />
                    </UTooltip>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Workouts List (Mobile) -->
          <div class="block sm:hidden space-y-2">
            <div
              v-for="workout in selectedWeek.workouts"
              :key="workout.id"
              class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 flex items-center gap-2.5 cursor-pointer active:bg-gray-50 dark:active:bg-gray-700 w-full"
              @click="navigateToWorkout(workout.id)"
            >
              <div
                class="p-2 rounded-full bg-gray-50 dark:bg-gray-900 border flex-shrink-0"
                :class="getSportColorClass(workout.type)"
              >
                <UIcon
                  :name="getWorkoutIcon(workout.type)"
                  class="w-5 h-5"
                  :class="getIconColorClass(workout.type)"
                />
              </div>

              <div class="flex-1 min-w-0">
                <div class="flex justify-between items-center mb-1">
                  <span class="text-xs font-semibold text-gray-500">{{
                    formatDay(workout.date)
                  }}</span>
                  <div class="flex items-center gap-2">
                    <UBadge
                      :color="workout.completed ? 'success' : 'neutral'"
                      size="xs"
                      variant="subtle"
                    >
                      {{ workout.completed ? 'Done' : 'Planned' }}
                    </UBadge>
                    <UButton
                      v-if="workout.type !== 'Rest' && workout.type !== 'Active Recovery'"
                      size="xs"
                      color="neutral"
                      :variant="isLocalWorkout(workout) ? 'ghost' : 'soft'"
                      :icon="
                        isLocalWorkout(workout)
                          ? 'i-heroicons-cloud-arrow-up'
                          : 'i-heroicons-arrow-path'
                      "
                      :loading="publishingId === workout.id"
                      @click.stop="publishWorkout(workout)"
                    />
                  </div>
                </div>
                <div class="font-bold truncate text-sm">{{ workout.title }}</div>
                <div class="text-xs text-muted mt-0.5 truncate">
                  <span v-if="workout.type === 'Ride' || workout.type === 'VirtualRide'"
                    >{{ Math.round(workout.durationSec / 60) }}m</span
                  >
                  <span v-else-if="workout.type === 'Run'"
                    >{{ Math.round(workout.durationSec / 60) }}m
                    <span v-if="workout.distanceMeters"
                      >/ {{ Math.round((workout.distanceMeters / 1000) * 10) / 10 }} km</span
                    ></span
                  >
                  <span v-else>{{ Math.round(workout.durationSec / 60) }}m</span>
                  <span class="mx-1">•</span>
                  <span>{{ workout.type }}</span>
                </div>
              </div>

              <div class="flex-shrink-0" @click.stop>
                <MiniWorkoutChart
                  v-if="workout.structuredWorkout"
                  :workout="workout.structuredWorkout"
                  class="w-12 h-8"
                />
                <UButton
                  v-else
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-heroicons-sparkles"
                  :loading="generatingStructureForWorkoutId === workout.id"
                  @click.stop="generateStructureForWorkout(workout.id)"
                />
              </div>
            </div>
          </div>

          <!-- Empty State (Shared) -->
          <div
            v-if="selectedWeek.workouts.length === 0"
            class="px-4 py-8 text-center text-muted border-t sm:border-t-0 border-gray-100 dark:border-gray-800"
          >
            <div
              v-if="isGenerating"
              class="flex flex-col items-center justify-center space-y-2 text-yellow-600 py-8"
            >
              <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin" />
              <span class="font-medium animate-pulse">Generating Workouts...</span>
              <span class="text-xs text-muted"
                >This may take a minute as AI designs your optimal week.</span
              >
            </div>
            <div v-else>
              No workouts generated for this week yet.
              <div class="mt-2 flex justify-center">
                <UButton
                  size="xs"
                  color="primary"
                  variant="soft"
                  :loading="generatingWorkouts"
                  @click="generateWorkoutsForBlock"
                >
                  Generate Workouts
                </UButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Zone Distribution Chart -->
      <WeeklyZoneSummary
        v-if="selectedWeek"
        :workouts="selectedWeek.workouts"
        :loading="generatingAllStructures"
        @generate="generateAllStructureForWeek"
      />

      <!-- Week Explanation / Coach's Note -->
      <div
        v-if="selectedWeek?.explanation"
        class="mt-4 p-4 bg-primary/5 dark:bg-primary/10 rounded-lg border border-primary/20"
      >
        <div class="flex items-center gap-2 mb-2 text-primary font-semibold">
          <UIcon name="i-heroicons-chat-bubble-left-right" class="w-5 h-5" />
          <h3>Coach's Note</h3>
        </div>
        <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          {{ selectedWeek.explanation }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import MiniWorkoutChart from '~/components/workouts/MiniWorkoutChart.vue'
  import WeeklyZoneSummary from '~/components/ui/WeeklyZoneSummary.vue'
  import PlanAIModal from '~/components/plans/PlanAIModal.vue'
  import {
    getWorkoutIcon,
    getWorkoutColorClass as getIconColorClass,
    getWorkoutBorderColorClass as getSportColorClass
  } from '~/utils/activity-types'

  const { formatDate, getUserLocalDate, timezone } = useFormat()

  const props = defineProps<{
    plan: any
    userFtp?: number
    isGenerating?: boolean
    shouldAutoGenerate?: boolean
  }>()

  const emit = defineEmits(['refresh', 'generation-started'])

  const selectedBlockId = ref<string | null>(null)
  const selectedWeekId = ref<string | null>(null)
  const showAdaptModal = ref(false)
  const showSaveTemplateModal = ref(false)
  const showAbandonModal = ref(false)
  const showAIPlanModal = ref(false)
  const templateName = ref('')
  const templateDescription = ref('')
  const savingTemplate = ref(false)
  const abandoning = ref(false)
  const generatingWorkouts = ref(false)
  const generatingBlockId = ref<string | null>(null)
  const generatingStructureForWorkoutId = ref<string | null>(null)
  const generatingAllStructures = ref(false)
  const adapting = ref<string | null>(null)
  const draggingId = ref<string | null>(null)
  const publishingId = ref<string | null>(null)
  const toast = useToast()

  // Background Task Monitoring
  const { refresh: refreshRuns } = useUserRuns()
  const { onTaskCompleted } = useUserRunsState()

  // Listeners
  onTaskCompleted('generate-training-block', async () => {
    emit('refresh')
    generatingWorkouts.value = false
    generatingBlockId.value = null
    toast.add({ title: 'Block Generated', color: 'success' })

    // Wait for refresh to propagate, then trigger structure generation if needed
    nextTick(() => {
      if (selectedBlockId.value) {
        generateAllStructureForWeek()
      }
    })
  })

  onTaskCompleted('generate-structured-workout', async (run) => {
    emit('refresh')
    generatingStructureForWorkoutId.value = null
    // If we were running a batch, we might want to check progress, but simplicity:
    // If generatingAllStructures is true, we can check if all are done or just wait for all triggers.
    // The previous logic was polling. Here we get an event per workout.
    // We can rely on the user seeing them update or just leave generatingAllStructures true until
    // we detect all are done (complex state tracking).
    // For now, let's keep it simple: we don't turn off generatingAllStructures here
    // unless we track the count.
    // Actually, `generateAllStructureForWeek` sets it to false immediately after triggering batch in the new logic below?
    // No, we should probably just let the UI update.
  })

  onTaskCompleted('adapt-training-plan', async () => {
    emit('refresh')
    adapting.value = null
    toast.add({
      title: 'Adaptation Complete',
      description: 'Your plan has been updated.',
      color: 'success'
    })
  })

  onTaskCompleted('generate-weekly-plan', async () => {
    emit('refresh')
    generatingWorkouts.value = false
    toast.add({ title: 'Plan Updated', description: 'Check the new schedule.', color: 'info' })
  })

  // Computed
  const currentBlock = computed(() => {
    // Find block encompassing "today" in user's timezone
    const today = getUserLocalDate()
    const todayTime = today.getTime()

    return (
      props.plan.blocks.find((b: any) => {
        const start = new Date(b.startDate).getTime()
        const end = start + b.durationWeeks * 7 * 24 * 3600 * 1000 - 1
        return todayTime >= start && todayTime <= end
      }) || props.plan.blocks[0]
    )
  })

  const selectedBlock = computed(() =>
    props.plan.blocks.find((b: any) => b.id === selectedBlockId.value)
  )
  const selectedWeek = computed(() =>
    selectedBlock.value?.weeks.find((w: any) => w.id === selectedWeekId.value)
  )

  // Helpers
  function formatDay(d: string) {
    return formatDate(d, 'EEE, MMM d')
  }

  function getBlockStatusColor(block: any) {
    if (selectedBlockId.value === block.id) return 'bg-white border-primary scale-125'
    // Logic for past/future based on date could go here
    return 'bg-primary border-primary'
  }

  function isLocalWorkout(workout: any) {
    return (
      workout.syncStatus === 'LOCAL_ONLY' ||
      (workout.externalId &&
        (workout.externalId.startsWith('ai_gen_') || workout.externalId.startsWith('ai-gen-')))
    )
  }

  async function publishWorkout(workout: any) {
    if (!workout.id) return

    publishingId.value = workout.id
    try {
      const response: any = await $fetch(`/api/workouts/planned/${workout.id}/publish`, {
        method: 'POST'
      })

      // Update local state
      if (response.success && response.workout) {
        // Direct mutation of the prop object (Vue reactivity handles this)
        workout.syncStatus = response.workout.syncStatus
        workout.externalId = response.workout.externalId
        workout.lastSyncedAt = response.workout.lastSyncedAt

        toast.add({
          title: isLocalWorkout(workout) ? 'Published' : 'Updated', // Check logic might be inverted here since we just updated it? No, checking response state.
          description: response.message || 'Workout synced with Intervals.icu.',
          color: 'success'
        })
      }
    } catch (error: any) {
      console.error('Failed to publish/sync workout:', error)
      toast.add({
        title: 'Sync Failed',
        description: error.data?.message || 'Failed to sync workout with Intervals.icu',
        color: 'error'
      })
    } finally {
      publishingId.value = null
    }
  }

  function navigateToWorkout(workoutId: string) {
    navigateTo(`/workouts/planned/${workoutId}`)
  }

  function onDragStart(event: DragEvent, workout: any) {
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', workout.id)
    }
    draggingId.value = workout.id
  }

  async function onDrop(event: DragEvent, targetWorkout: any) {
    const sourceId = draggingId.value
    draggingId.value = null

    if (!sourceId || sourceId === targetWorkout.id) return

    // Find source in list
    const sourceWorkout = selectedWeek.value.workouts.find((w: any) => w.id === sourceId)
    if (!sourceWorkout) return

    // Optimistic Swap Dates
    const sourceDate = sourceWorkout.date
    const targetDate = targetWorkout.date

    // Swap in UI (mutating prop/local state temporarily)
    sourceWorkout.date = targetDate
    targetWorkout.date = sourceDate

    // Re-sort list by date to reflect visual change
    selectedWeek.value.workouts.sort(
      (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    // Call API
    try {
      await $fetch(`/api/workouts/planned/${sourceId}/move`, {
        method: 'POST',
        body: { targetDate: targetDate }
      })
      toast.add({ title: 'Workout moved', color: 'success' })
      emit('refresh')
    } catch (error) {
      // Revert on fail
      sourceWorkout.date = sourceDate
      targetWorkout.date = targetDate
      selectedWeek.value.workouts.sort(
        (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()
      )
      toast.add({ title: 'Failed to move', color: 'error' })
    }
  }

  async function generateWorkoutsForBlock() {
    if (!selectedBlockId.value) return

    const blockId = selectedBlockId.value
    generatingWorkouts.value = true
    generatingBlockId.value = blockId

    try {
      await $fetch('/api/plans/generate-block', {
        method: 'POST',
        body: { blockId }
      })
      refreshRuns()

      toast.add({
        title: 'Generation Started',
        description: 'AI is designing your training block. Please wait...',
        color: 'info'
      })
    } catch (error: any) {
      generatingWorkouts.value = false
      generatingBlockId.value = null
      toast.add({
        title: 'Generation Failed',
        description: error.data?.message || 'Failed to trigger generation',
        color: 'error'
      })
    }
  }

  async function generateStructureForWorkout(workoutId: string) {
    generatingStructureForWorkoutId.value = workoutId
    try {
      await $fetch(`/api/workouts/planned/${workoutId}/generate-structure`, {
        method: 'POST'
      })
      refreshRuns()

      toast.add({
        title: 'Generating...',
        description: 'AI is designing your workout structure. This takes a moment.',
        color: 'info'
      })
    } catch (error: any) {
      toast.add({
        title: 'Generation Failed',
        description: error.data?.message || 'Failed to generate structure',
        color: 'error'
      })
      generatingStructureForWorkoutId.value = null
    }
  }

  async function generateAllStructureForWeek() {
    if (!selectedWeek.value) return

    // Find workouts without structure
    const pendingWorkouts = selectedWeek.value.workouts.filter((w: any) => !w.structuredWorkout)

    if (pendingWorkouts.length === 0) return

    generatingAllStructures.value = true
    toast.add({
      title: 'Batch Generation Started',
      description: `Designing ${pendingWorkouts.length} workouts. This will take a minute...`,
      color: 'info'
    })

    try {
      // Process in batches of 3 to avoid overwhelming the server/LLM
      const batchSize = 3
      for (let i = 0; i < pendingWorkouts.length; i += batchSize) {
        const batch = pendingWorkouts.slice(i, i + batchSize)
        await Promise.all(
          batch.map((w: any) =>
            $fetch(`/api/workouts/planned/${w.id}/generate-structure`, { method: 'POST' }).catch(
              (e) => console.error(`Failed to generate for ${w.id}`, e)
            )
          )
        )
      }
      refreshRuns()

      toast.add({
        title: 'Generation Queued',
        description: 'Waiting for AI to finish designing workouts...',
        color: 'info'
      })
    } catch (error) {
      console.error('Batch generation failed', error)
      toast.add({ title: 'Batch Generation Failed', color: 'error' })
    } finally {
      // We stop the spinner here, and let individual updates happen via WebSocket
      generatingAllStructures.value = false
    }
  }

  async function adaptPlan(type: string) {
    adapting.value = type
    try {
      await $fetch('/api/plans/adapt', {
        method: 'POST',
        body: {
          planId: props.plan.id,
          adaptationType: type
        }
      })
      refreshRuns()

      toast.add({
        title: 'Adaptation Started',
        description: 'AI is recalculating your plan. Check back in a minute.',
        color: 'success'
      })

      showAdaptModal.value = false
    } catch (error: any) {
      toast.add({
        title: 'Adaptation Failed',
        description: error.data?.message || 'Failed to trigger adaptation',
        color: 'error'
      })
      adapting.value = null
    }
  }

  async function confirmAbandon() {
    abandoning.value = true
    try {
      await $fetch(`/api/plans/${props.plan.id}/abandon`, { method: 'POST' })
      toast.add({ title: 'Plan Abandoned', color: 'success' })
      emit('refresh')
      showAbandonModal.value = false
    } catch (error: any) {
      toast.add({ title: 'Failed to abandon plan', description: error.message, color: 'error' })
    } finally {
      abandoning.value = false
    }
  }

  async function saveTemplate() {
    if (!templateName.value) {
      toast.add({ title: 'Name required', color: 'error' })
      return
    }

    savingTemplate.value = true
    try {
      await $fetch(`/api/plans/${props.plan.id}/save-template`, {
        method: 'POST',
        body: {
          name: templateName.value,
          description: templateDescription.value
        }
      })
      toast.add({ title: 'Template Saved', color: 'success' })
      showSaveTemplateModal.value = false
    } catch (error: any) {
      toast.add({ title: 'Failed to save template', description: error.message, color: 'error' })
    } finally {
      savingTemplate.value = false
    }
  }

  async function generatePlanWithAI(instructions: string) {
    if (!selectedBlockId.value || !selectedWeekId.value) return

    showAIPlanModal.value = false
    generatingWorkouts.value = true

    try {
      await $fetch('/api/plans/generate-ai-week', {
        method: 'POST',
        body: {
          blockId: selectedBlockId.value,
          weekId: selectedWeekId.value,
          instructions
        }
      })
      refreshRuns()

      toast.add({
        title: 'Plan Generation Started',
        description:
          'AI is redesigning your week based on your instructions. This may take a minute.',
        color: 'success'
      })
    } catch (error: any) {
      console.error(error)
      toast.add({
        title: 'Generation Failed',
        description: error.data?.message || 'Failed to start AI planning',
        color: 'error'
      })
      generatingWorkouts.value = false
    }
  }

  // Watchers to auto-select defaults
  watch(
    () => props.plan,
    (newPlan) => {
      // Only auto-select if we don't have a selection already, OR if the plan ID actually changed (loaded a new plan)
      // This prevents resetting the selection on every 'refresh' poll which updates the same plan object
      if (newPlan && newPlan.blocks.length > 0) {
        // Check if we are already viewing a valid block/week for this plan
        const isSamePlan =
          selectedBlockId.value && newPlan.blocks.some((b: any) => b.id === selectedBlockId.value)

        if (isSamePlan) {
          // We are already looking at a block in this plan.
          // Just update the reactive data, don't change selection.
          return
        }

        // 1. Determine Active Block
        const today = getUserLocalDate()
        const todayTime = today.getTime()

        const activeBlock =
          newPlan.blocks.find((b: any) => {
            const start = new Date(b.startDate).getTime()
            const end = start + b.durationWeeks * 7 * 24 * 3600 * 1000 - 1
            return todayTime >= start && todayTime <= end
          }) || newPlan.blocks[0]

        selectedBlockId.value = activeBlock.id

        // 2. Determine Active Week within that block
        if (activeBlock.weeks.length > 0) {
          const currentWeek = activeBlock.weeks.find((w: any) => {
            const start = new Date(w.startDate).getTime()
            const end = new Date(w.endDate).getTime()
            return todayTime >= start && todayTime <= end
          })
          selectedWeekId.value = currentWeek ? currentWeek.id : activeBlock.weeks[0].id
        }

        // 3. Auto-trigger structure generation if requested
        if (props.shouldAutoGenerate) {
          // Wait a tick for computed properties to update
          nextTick(() => {
            generateAllStructureForWeek()
            emit('generation-started')
          })
        }
      }
    },
    { immediate: true }
  )

  // Watch specifically for the auto-generate prop to change
  watch(
    () => props.shouldAutoGenerate,
    (should) => {
      if (should) {
        nextTick(() => {
          generateAllStructureForWeek()
          emit('generation-started')
        })
      }
    }
  )

  // When user manually changes block, update week
  watch(selectedBlockId, (newId) => {
    if (newId) {
      const block = props.plan.blocks.find((b: any) => b.id === newId)
      if (block && block.weeks.length > 0) {
        // Only reset if the current selected week is NOT in this block
        const weekInBlock = block.weeks.find((w: any) => w.id === selectedWeekId.value)
        if (!weekInBlock) {
          const today = getUserLocalDate()
          const todayTime = today.getTime()
          const currentWeek = block.weeks.find((w: any) => {
            return (
              new Date(w.startDate).getTime() <= todayTime &&
              new Date(w.endDate).getTime() >= todayTime
            )
          })
          selectedWeekId.value = currentWeek ? currentWeek.id : block.weeks[0].id
        }
      }
    }
  })
</script>
