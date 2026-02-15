<template>
  <UDashboardPanel id="planned-workout-details">
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <span class="hidden sm:inline">{{ workout?.title || 'Workout Details' }}</span>
        </template>
        <template #leading>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-heroicons-arrow-left"
            class="hidden sm:flex"
            @click="goBack"
          >
            Back
          </UButton>
        </template>
        <template #right>
          <TriggerMonitorButton />

          <!-- Primary Actions -->
          <UButton
            v-if="workout"
            color="neutral"
            variant="outline"
            size="sm"
            class="font-bold"
            :icon="isLocalWorkout ? 'i-heroicons-cloud-arrow-up' : 'i-heroicons-arrow-path'"
            @click="showPublishModal = true"
          >
            <span class="hidden sm:inline">{{ isLocalWorkout ? 'Publish' : 'Update' }}</span>
          </UButton>

          <!-- Secondary Actions Dropdown -->
          <UDropdownMenu
            v-if="secondaryMenuItems[0]?.length"
            :items="secondaryMenuItems"
            :popper="{ placement: 'bottom-end' }"
          >
            <UButton
              icon="i-heroicons-ellipsis-vertical"
              color="neutral"
              variant="outline"
              size="sm"
            />
          </UDropdownMenu>

          <UButton
            v-if="workout"
            icon="i-heroicons-chat-bubble-left-right"
            color="primary"
            variant="solid"
            size="sm"
            class="font-bold"
            @click="chatAboutWorkout"
          >
            <span class="hidden sm:inline">Chat</span>
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-4xl mx-auto w-full p-4 sm:p-6 space-y-4 sm:space-y-6">
        <!-- Loading State -->
        <div v-if="loading" class="space-y-6">
          <UCard>
            <div class="flex items-center justify-between mb-4">
              <div class="space-y-2">
                <USkeleton class="h-8 w-64" />
                <USkeleton class="h-4 w-48" />
              </div>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
              <USkeleton v-for="i in 4" :key="i" class="h-16 w-full rounded-lg" />
            </div>
          </UCard>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <USkeleton v-for="i in 3" :key="i" class="h-24 w-full rounded-xl" />
          </div>
          <USkeleton class="h-64 w-full rounded-xl" />
        </div>

        <!-- Workout Content -->
        <div v-else-if="workout" class="space-y-4 sm:space-y-5">
          <!-- Header Card -->
          <div
            class="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 sm:p-5 overflow-hidden relative"
          >
            <div class="flex items-start gap-4">
              <div
                class="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800/40 flex items-center justify-center flex-shrink-0"
              >
                <UIcon name="i-heroicons-calendar-days" class="w-5 h-5 text-primary-500" />
              </div>
              <div class="min-w-0 flex-1">
                <h1 class="text-2xl sm:text-[2rem] font-black tracking-tight break-words">
                  {{ workout.title }}
                </h1>
                <div class="flex flex-wrap items-center gap-2 mt-2">
                  <UBadge color="neutral" variant="soft" size="sm" class="font-bold">
                    {{ workout.type }}
                  </UBadge>
                  <UBadge
                    :color="workout.completed ? 'success' : 'warning'"
                    variant="soft"
                    size="sm"
                    class="font-bold"
                  >
                    {{ workout.completed ? 'Completed' : 'Planned' }}
                  </UBadge>
                  <UBadge color="neutral" variant="soft" size="sm" class="font-medium">
                    {{ formatDate(workout.date) }}
                  </UBadge>
                  <UBadge
                    color="neutral"
                    variant="soft"
                    size="sm"
                    class="font-bold cursor-pointer"
                    @click="openTimeModal"
                  >
                    <span class="inline-flex items-center gap-1">
                      <UIcon name="i-heroicons-clock" class="w-3.5 h-3.5" />
                      {{ workout.startTime || 'Set Time' }}
                      <UIcon name="i-heroicons-pencil-square" class="w-3 h-3" />
                    </span>
                  </UBadge>
                </div>
                <div v-if="workout.description" class="mt-2.5">
                  <p
                    class="text-sm break-words whitespace-pre-wrap text-gray-600 dark:text-gray-300"
                    :class="{ 'line-clamp-2': !showFullDescription }"
                  >
                    {{ workout.description }}
                  </p>
                  <UButton
                    v-if="descriptionTooLong"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    class="mt-1 -ml-2"
                    :label="showFullDescription ? 'Show less' : 'Show more'"
                    @click="showFullDescription = !showFullDescription"
                  />
                </div>
              </div>
            </div>

            <!-- Training Context -->
            <div
              v-if="workout.trainingWeek"
              class="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700"
            >
              <div class="flex items-center justify-between gap-3">
                <div class="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Training Context
                </div>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :label="showTrainingContextDetails ? 'Hide details' : 'Show details'"
                  @click="showTrainingContextDetails = !showTrainingContextDetails"
                />
              </div>
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-1.5">
                {{ trainingContextSummary }}
              </p>
              <div
                v-if="showTrainingContextDetails"
                class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3"
              >
                <div
                  class="p-3 rounded-xl bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800"
                >
                  <div class="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                    Goal / Plan
                  </div>
                  <div class="text-sm font-semibold text-gray-900 dark:text-white">
                    {{
                      workout.trainingWeek.block.plan.goal?.title ||
                      workout.trainingWeek.block.plan.name ||
                      'General Plan'
                    }}
                  </div>
                </div>
                <div
                  class="p-3 rounded-xl bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800"
                >
                  <div class="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                    Block
                  </div>
                  <div class="text-sm font-semibold text-gray-900 dark:text-white">
                    {{ workout.trainingWeek.block.name }}
                  </div>
                </div>
                <div
                  class="p-3 rounded-xl bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800"
                >
                  <div class="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                    Week
                  </div>
                  <div class="text-sm font-semibold text-gray-900 dark:text-white">
                    {{ workout.trainingWeek.weekNumber }}
                  </div>
                </div>
                <div
                  class="p-3 rounded-xl bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800"
                >
                  <div class="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                    Focus
                  </div>
                  <div class="text-sm font-semibold text-gray-900 dark:text-white">
                    {{ workout.trainingWeek.focus || workout.trainingWeek.block.primaryFocus }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Extended Stats Grid -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              v-for="kpi in workoutKpis"
              :key="kpi.label"
              class="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden relative group hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
            >
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <UIcon :name="kpi.icon" class="w-5 h-5" :class="kpi.iconColor" />
                  <span class="text-xs font-bold uppercase text-gray-500 tracking-wider">{{
                    kpi.label
                  }}</span>
                </div>
                <span
                  class="text-[10px] font-bold uppercase tracking-wide"
                  :class="kpi.statusColor"
                >
                  {{ kpi.status }}
                </span>
              </div>

              <div class="flex items-baseline gap-1 mb-2">
                <span class="text-2xl font-black text-gray-900 dark:text-white">{{
                  kpi.actual
                }}</span>
                <span v-if="kpi.unit" class="text-sm font-bold text-gray-400">{{ kpi.unit }}</span>
              </div>

              <div class="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                {{ kpi.detail }}
              </div>

              <div
                class="absolute bottom-0 left-0 h-0.5 bg-primary-500 w-full transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300"
              />
            </div>
          </div>

          <!-- Run/Swim Details -->
          <div
            v-if="workout.type === 'Run' || workout.type === 'Swim'"
            class="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            <!-- ... existing fields ... -->
          </div>

          <div
            v-if="coachAdviceText"
            class="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 sm:p-6 border border-blue-100 dark:border-blue-800"
          >
            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-blue-100 dark:bg-blue-800 rounded-full flex-shrink-0">
                    <UIcon
                      name="i-heroicons-chat-bubble-bottom-center-text"
                      class="w-6 h-6 text-blue-600 dark:text-blue-300"
                    />
                  </div>
                  <h3 class="font-semibold text-lg text-blue-900 dark:text-blue-100">
                    Coach's Advice
                  </h3>
                </div>

                <!-- AI Feedback -->
                <AiFeedback
                  v-if="llmUsageId"
                  :llm-usage-id="llmUsageId"
                  :initial-feedback="initialFeedback"
                  :initial-feedback-text="initialFeedbackText"
                  class="flex-shrink-0"
                />
              </div>

              <p class="text-blue-800 dark:text-blue-200 italic break-words">
                "{{ coachAdviceText }}"
              </p>
            </div>
          </div>

          <!-- Workout Visualization -->
          <component
            :is="getWorkoutComponent(workout.type)"
            v-if="workout.structuredWorkout"
            :workout="workout"
            :user-ftp="userFtp"
            :generating="generating"
            @add-messages="openMessageModal"
            @adjust="openAdjustModal"
            @regenerate="generateStructure"
          />

          <!-- No Structured Data -->
          <div
            v-else
            class="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-6"
          >
            <div class="text-center py-8">
              <UIcon name="i-heroicons-chart-bar" class="w-12 h-12 text-muted mx-auto mb-3" />
              <h3 class="text-lg font-semibold mb-2">No Structured Workout Data</h3>
              <p class="text-sm text-muted mb-4">
                This workout doesn't have detailed interval structure yet.
              </p>
              <UButton
                size="sm"
                color="primary"
                variant="soft"
                :loading="generating"
                :disabled="generating"
                @click="generateStructure"
              >
                {{ generating ? 'Generating Structure...' : 'Generate Workout Structure' }}
              </UButton>
            </div>
          </div>

          <!-- Coaching Messages Timeline -->
          <WorkoutMessagesTimeline
            v-if="workout.structuredWorkout?.messages?.length"
            :workout="workout.structuredWorkout"
          />

          <!-- Nutrition & Fueling Prep -->
          <NutritionPrepCard
            v-if="fuelingPlan"
            :fueling-plan="fuelingPlan"
            :fuel-state="fuelState"
            :is-gut-training="workout?.fuelingStrategy === 'HIGH_CARB_TEST' || fuelState === 3"
          />
        </div>

        <!-- Error State -->
        <div v-else class="text-center py-20">
          <UIcon
            name="i-heroicons-exclamation-circle"
            class="w-16 h-16 text-red-500 mx-auto mb-4"
          />
          <h3 class="text-xl font-semibold mb-2">
            {{ loadError?.statusCode === 403 ? 'Access Denied' : 'Workout Not Found' }}
          </h3>
          <p class="text-muted mb-4">
            {{
              loadError?.statusCode === 403
                ? "You don't have permission to view this planned workout."
                : "The planned workout you're looking for doesn't exist."
            }}
          </p>
          <UButton color="primary" @click="goBack">Go Back</UButton>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Modals -->
  <UModal
    v-if="showAdjustModal"
    v-model:open="showAdjustModal"
    title="Adjust Workout"
    description="Modify parameters and give feedback to AI to redesign this session."
  >
    <template #body>
      <div class="p-6 flex flex-col gap-5">
        <div class="w-full">
          <label class="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-200"
            >Duration (minutes)</label
          >
          <UInput
            v-model.number="adjustForm.durationMinutes"
            type="number"
            step="5"
            class="w-full"
          />
        </div>

        <div class="w-full">
          <label class="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-200"
            >Intensity</label
          >
          <USelect
            v-model="adjustForm.intensity"
            :items="['recovery', 'easy', 'moderate', 'hard', 'very_hard']"
            class="w-full"
          />
        </div>

        <div class="w-full">
          <label class="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-200"
            >Feedback / Instructions</label
          >
          <UTextarea
            v-model="adjustForm.feedback"
            placeholder="e.g. 'Make the intervals longer', 'I want more rest', 'Focus on cadence'"
            :rows="3"
            class="w-full"
          />
        </div>

        <div class="flex justify-end pt-2 gap-2">
          <UButton variant="ghost" @click="showAdjustModal = false">Cancel</UButton>
          <UButton color="primary" :loading="adjusting" @click="submitAdjustment"
            >Apply Changes</UButton
          >
        </div>
      </div>
    </template>
  </UModal>

  <UModal
    v-if="showMessageModal"
    v-model:open="showMessageModal"
    title="Add Coaching Messages"
    description="Generate engaging text messages to display during your workout."
  >
    <template #body>
      <div class="p-6 flex flex-col gap-5">
        <div class="w-full">
          <label class="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-200"
            >Coach Tone</label
          >
          <USelect
            v-model="messageForm.tone"
            :items="['Motivational', 'Drill Sergeant', 'Technical', 'Funny', 'Supportive', 'Stoic']"
            class="w-full"
          />
        </div>

        <div class="w-full">
          <label class="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-200"
            >Additional Context</label
          >
          <UTextarea
            v-model="messageForm.context"
            placeholder="e.g. 'Emphasize high cadence', 'Remind me to drink', 'This is prep for a climbing race'"
            :rows="3"
            class="w-full"
          />
        </div>

        <div class="flex justify-end pt-2 gap-2">
          <UButton variant="ghost" @click="showMessageModal = false">Cancel</UButton>
          <UButton color="primary" :loading="generatingMessages" @click="submitMessages"
            >Generate Messages</UButton
          >
        </div>
      </div>
    </template>
  </UModal>

  <UModal
    v-if="showDownloadModal"
    v-model:open="showDownloadModal"
    title="Download Workout"
    description="Select a format to download this workout."
  >
    <template #body>
      <div class="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <UButton
          block
          color="primary"
          variant="soft"
          icon="i-heroicons-document-text"
          label="Zwift (.zwo)"
          @click="downloadWorkout('zwo')"
        />
        <UButton
          block
          color="primary"
          variant="soft"
          icon="i-heroicons-cpu-chip"
          label="Garmin (.fit)"
          @click="downloadWorkout('fit')"
        />
      </div>
    </template>
    <template #footer>
      <UButton label="Close" color="neutral" variant="ghost" @click="showDownloadModal = false" />
    </template>
  </UModal>

  <UModal
    v-if="showPublishModal"
    v-model:open="showPublishModal"
    :title="isLocalWorkout ? 'Publish to Intervals.icu' : 'Update on Intervals.icu'"
    :description="
      isLocalWorkout
        ? 'Sync this workout to your Intervals.icu calendar.'
        : 'Push local changes to Intervals.icu.'
    "
  >
    <template #body>
      <div class="p-6 space-y-4">
        <p class="text-sm text-gray-600 dark:text-gray-300">
          This will {{ isLocalWorkout ? 'create a new' : 'update the' }} workout on your
          Intervals.icu calendar for <strong>{{ formatDate(workout.date) }}</strong
          >.
        </p>
        <div class="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg text-sm">
          <ul class="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400">
            <li>Structured intervals will be {{ isLocalWorkout ? 'included' : 'updated' }}</li>
            <li>TSS and duration targets will be synced</li>
            <li>Any coaching messages will be added</li>
          </ul>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="showPublishModal = false" />
        <UButton
          :label="isLocalWorkout ? 'Publish Workout' : 'Update Workout'"
          color="primary"
          :loading="publishing"
          @click="publishWorkout"
        />
      </div>
    </template>
  </UModal>

  <UModal
    v-model:open="showEjectModal"
    title="Eject from Plan"
    description="Make this workout independent."
  >
    <template #body>
      <div class="p-6 space-y-4">
        <div class="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg flex items-start gap-3">
          <UIcon
            name="i-heroicons-exclamation-triangle"
            class="w-5 h-5 text-yellow-600 flex-shrink-0"
          />
          <div class="text-sm text-yellow-800 dark:text-yellow-200">
            <p class="font-medium">You are about to unlink this workout from your training plan.</p>
            <p class="mt-1">
              It will become an "Independent Workout" and will no longer be counted towards the
              plan's weekly structure or stats unless you re-link it later.
            </p>
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <UButton label="Eject Workout" color="error" :loading="ejecting" @click="ejectWorkout" />
    </template>
  </UModal>

  <UModal
    v-model:open="showDeleteModal"
    title="Delete Planned Workout"
    description="This action cannot be undone."
  >
    <template #body>
      <div class="p-6 space-y-4">
        <div class="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg flex items-start gap-3">
          <UIcon
            name="i-heroicons-exclamation-triangle"
            class="w-5 h-5 text-red-600 flex-shrink-0"
          />
          <div class="text-red-800 dark:text-red-200">
            <p class="font-medium">Are you sure you want to delete this workout?</p>
            <p class="mt-1">
              This will permanently remove the planned workout from Coach Wattz. If it was synced to
              Intervals.icu, it will also be deleted from there.
            </p>
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="showDeleteModal = false" />
        <UButton label="Delete Workout" color="error" :loading="deleting" @click="deleteWorkout" />
      </div>
    </template>
  </UModal>

  <UModal
    v-model:open="isShareModalOpen"
    title="Share Workout"
    description="Anyone with this link can view this planned workout. The link will expire in 30 days."
  >
    <template #body>
      <div class="space-y-4">
        <div v-if="generatingShareLink" class="flex items-center justify-center py-8">
          <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary" />
        </div>
        <div v-else-if="shareLink" class="space-y-4">
          <div class="flex gap-2">
            <UInput v-model="shareLink" readonly class="flex-1" />
            <UButton
              icon="i-heroicons-clipboard"
              color="neutral"
              variant="outline"
              @click="copyToClipboard"
            >
              Copy
            </UButton>
          </div>
          <p class="text-xs text-gray-500">
            This link provides read-only access to this specific workout.
          </p>
        </div>
        <div v-else class="flex flex-col items-center justify-center py-8 text-center">
          <UIcon name="i-heroicons-link" class="w-8 h-8 text-gray-400 mb-2" />
          <p class="text-gray-600 mb-4">Click below to generate a shareable link.</p>
          <UButton color="primary" :loading="generatingShareLink" @click="generateShareLink">
            Generate Link
          </UButton>
        </div>
      </div>
    </template>
    <template #footer>
      <UButton label="Close" color="neutral" variant="ghost" @click="isShareModalOpen = false" />
    </template>
  </UModal>

  <UModal
    v-if="showTimeModal"
    v-model:open="showTimeModal"
    title="Set Start Time"
    description="Adjust the starting time for this workout."
  >
    <template #body>
      <div class="p-6 flex flex-col gap-5">
        <div class="w-full">
          <label class="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-200"
            >Start Time</label
          >
          <UInput v-model="timeForm.startTime" type="time" class="w-full" />
        </div>

        <div class="flex justify-end pt-2 gap-2">
          <UButton variant="ghost" @click="showTimeModal = false">Cancel</UButton>
          <UButton color="primary" :loading="updatingTime" @click="submitTime">Update Time</UButton>
        </div>
      </div>
    </template>
  </UModal>

  <UModal
    v-if="showStructureModal"
    v-model:open="showStructureModal"
    title="Edit Workout Structure"
    description="Modify the workout steps using Intervals.icu text format."
    :ui="{ content: 'sm:max-w-2xl' }"
  >
    <template #body>
      <div class="p-6 flex flex-col gap-4">
        <div
          class="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg text-xs text-blue-800 dark:text-blue-200"
        >
          <p class="font-bold mb-1 uppercase tracking-wider">Format Tips:</p>
          <ul class="list-disc list-inside space-y-0.5 opacity-80">
            <li>- 10m 50% (Duration and intensity)</li>
            <li>- Interval 5m 100% 90rpm (Name and cadence)</li>
            <li>4x (Repeats, indent steps below)</li>
            <li>Use "m" for minutes, "s" for seconds, "%" for power, "% LTHR" for heart rate.</li>
          </ul>
        </div>

        <UTextarea
          v-model="structureText"
          placeholder="- Warmup 10m 50%\n- 4x\n  - 1m 100%\n  - 1m 50%\n- Cooldown 5m 40%"
          :rows="12"
          autofocus
          class="font-mono text-sm"
        />

        <div class="flex justify-end pt-2 gap-2">
          <UButton variant="ghost" @click="showStructureModal = false">Cancel</UButton>
          <UButton color="primary" :loading="savingStructure" @click="saveStructure"
            >Save Structure</UButton
          >
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
  import WorkoutChart from '~/components/workouts/WorkoutChart.vue'
  import WorkoutMessagesTimeline from '~/components/workouts/WorkoutMessagesTimeline.vue'
  import RideView from '~/components/workouts/planned/RideView.vue'
  import RunView from '~/components/workouts/planned/RunView.vue'
  import SwimView from '~/components/workouts/planned/SwimView.vue'
  import StrengthView from '~/components/workouts/planned/StrengthView.vue'
  import TriggerMonitorButton from '~/components/dashboard/TriggerMonitorButton.vue'
  import AiFeedback from '~/components/AiFeedback.vue'

  definePageMeta({
    middleware: 'auth'
  })

  const route = useRoute()
  const router = useRouter()
  const toast = useToast()
  const { formatDateUTC, getUserLocalDate, timezone } = useFormat()

  const loading = ref(true)
  const generating = ref(false)
  const adjusting = ref(false)
  const generatingMessages = ref(false)
  const showDeleteModal = ref(false)
  const deleting = ref(false)
  const showAdjustModal = ref(false)
  const showTimeModal = ref(false)
  const updatingTime = ref(false)
  const showMessageModal = ref(false)
  const showDownloadModal = ref(false)
  const showPublishModal = ref(false)
  const showFullDescription = ref(false)
  const showTrainingContextDetails = ref(false)
  const adjustForm = reactive({
    durationMinutes: 60,
    intensity: 'moderate',
    feedback: ''
  })
  const timeForm = reactive({
    startTime: ''
  })
  const messageForm = reactive({
    tone: 'Motivational',
    context: ''
  })
  const workout = ref<any>(null)
  const loadError = ref<{ statusCode?: number; message?: string } | null>(null)
  const userFtp = ref<number | undefined>(undefined)
  const llmUsageId = ref<string | undefined>(undefined)
  const initialFeedback = ref<string | null>(null)
  const initialFeedbackText = ref<string | null>(null)
  const dayNutrition = ref<any>(null)
  const nutritionSettings = ref<any>(null)
  const workoutFuelingPlan = ref<any>(null)

  const fuelingPlan = computed(() => {
    if (workoutFuelingPlan.value?.windows?.length) return workoutFuelingPlan.value

    const dayPlan = dayNutrition.value?.fuelingPlan
    if (!dayPlan) return null

    const workoutId = workout.value?.id
    const windows = Array.isArray(dayPlan.windows) ? dayPlan.windows : []
    if (!workoutId || windows.length === 0) return dayPlan

    const matchedWindows = windows.filter((w: any) => w?.plannedWorkoutId === workoutId)
    if (matchedWindows.length === 0) return dayPlan

    return {
      ...dayPlan,
      windows: matchedWindows
    }
  })
  const fuelState = computed(() => {
    if (!fuelingPlan.value) return 1
    const intra = fuelingPlan.value.windows?.find((w: any) => w.type === 'INTRA_WORKOUT')
    if (intra?.description?.includes('State 3')) return 3
    if (intra?.description?.includes('State 2')) return 2
    return 1
  })

  // Background Task Monitoring
  const { refresh: refreshRuns } = useUserRuns()
  const { onTaskCompleted } = useUserRunsState()

  const userStore = useUserStore()

  // Share functionality
  const isShareModalOpen = ref(false)
  const shareLink = ref('')
  const generatingShareLink = ref(false)
  const publishing = ref(false)

  // Eject logic
  const showEjectModal = ref(false)
  const ejecting = ref(false)

  const showStructureModal = ref(false)
  const structureText = ref('')
  const savingStructure = ref(false)

  const secondaryMenuItems = computed(() => {
    const items = []

    // Edit Structure action
    if (workout.value) {
      items.push({
        label: 'Edit Structure',
        icon: 'i-heroicons-pencil',
        onSelect: () => {
          editStructure()
        }
      })
    }

    // Mark Complete action
    if (workout.value && !workout.value.completed) {
      items.push({
        label: 'Mark Complete',
        icon: 'i-heroicons-check',
        onSelect: () => {
          markComplete()
        }
      })
    }

    // Download action
    if (workout.value?.structuredWorkout) {
      items.push({
        label: 'Download',
        icon: 'i-heroicons-arrow-down-tray',
        onSelect: () => {
          showDownloadModal.value = true
        }
      })
    }

    // Eject action
    if (workout.value?.trainingWeekId) {
      items.push({
        label: 'Eject from Plan',
        icon: 'i-heroicons-link-slash',
        onSelect: () => {
          showEjectModal.value = true
        }
      })
    }

    // Share action
    if (workout.value) {
      items.push({
        label: 'Share Workout',
        icon: 'i-heroicons-share',
        onSelect: () => {
          isShareModalOpen.value = true
        }
      })
    }

    // Delete action (always last, potentially in a separate group if we wanted)
    if (workout.value) {
      items.push({
        label: 'Delete',
        icon: 'i-heroicons-trash',
        color: 'error' as const,
        onSelect: () => {
          showDeleteModal.value = true
        }
      })
    }

    return [items]
  })

  // Listeners
  onTaskCompleted('generate-workout-messages', async (run) => {
    await fetchWorkout()
    generatingMessages.value = false
    toast.add({
      title: 'Messages Ready',
      description: 'Coaching messages have been added to your workout.',
      color: 'success',
      icon: 'i-heroicons-chat-bubble-left-ellipsis'
    })
  })

  onTaskCompleted('adjust-structured-workout', async (run) => {
    await fetchWorkout()
    adjusting.value = false
    toast.add({
      title: 'Adjustment Complete',
      description: 'Your workout has been updated based on your feedback.',
      color: 'success',
      icon: 'i-heroicons-check-circle'
    })
  })

  onTaskCompleted('generate-structured-workout', async (run) => {
    await fetchWorkout()
    generating.value = false
    toast.add({
      title: 'Structure Generated',
      description: 'Workout structure is ready.',
      color: 'success',
      icon: 'i-heroicons-check-circle'
    })
  })

  const isLocalWorkout = computed(() => {
    if (!workout.value) return false
    // Show publish if explicitly marked as LOCAL_ONLY, PENDING, FAILED
    // OR if externalId looks like a generated one (starts with ai_gen_ or ai-gen-)
    // OR if syncStatus is missing but externalId is generated
    return (
      workout.value.syncStatus !== 'SYNCED' ||
      (workout.value.externalId &&
        (workout.value.externalId.startsWith('ai_gen_') ||
          workout.value.externalId.startsWith('ai-gen-')))
    )
  })

  const descriptionTooLong = computed(() => {
    const description = workout.value?.description
    return typeof description === 'string' && description.length > 180
  })

  const trainingContextSummary = computed(() => {
    const week = workout.value?.trainingWeek
    if (!week) return ''

    const planLabel = week.block?.plan?.goal?.title || week.block?.plan?.name || 'General Plan'
    const blockLabel = week.block?.name || 'No block'
    const weekLabel = week.weekNumber ? `Week ${week.weekNumber}` : null
    const focusLabel = week.focus || week.block?.primaryFocus || 'No focus'

    return [planLabel, blockLabel, weekLabel, focusLabel].filter(Boolean).join(' • ')
  })

  const coachAdviceText = computed(() => {
    const structuredAdvice = workout.value?.structuredWorkout?.coachInstructions
    if (typeof structuredAdvice === 'string' && structuredAdvice.trim().length) {
      return structuredAdvice.trim()
    }

    const topLevelAdvice = workout.value?.coachInstructions
    if (typeof topLevelAdvice === 'string' && topLevelAdvice.trim().length) {
      return topLevelAdvice.trim()
    }

    return ''
  })

  const displayDuration = computed(() => {
    if (workout.value?.durationSec) return workout.value.durationSec
    // Fallback to structured workout total duration if available
    if (workout.value?.structuredWorkout?.steps) {
      return workout.value.structuredWorkout.steps.reduce(
        (sum: number, step: any) => sum + (step.durationSeconds || step.duration || 0),
        0
      )
    }
    return 0
  })

  const displayTss = computed(() => {
    if (workout.value?.tss) return workout.value.tss
    // TSS calculation from structure is complex without user FTP, so we might just leave it 0 or try to estimate
    // For now, just return 0 if null
    return 0
  })

  const workoutKpis = computed(() => {
    const durationMin = Math.round(displayDuration.value / 60)
    const tss = Math.round(displayTss.value || 0)
    const intensity = workout.value?.workIntensity || 0
    const intensityPct = Math.round(intensity * 100)

    return [
      {
        label: 'Duration',
        actual: formatDuration(displayDuration.value),
        unit: '',
        icon: 'i-heroicons-clock',
        iconColor: 'text-primary-500',
        status: getDurationBand(durationMin),
        statusColor: 'text-primary-500',
        detail: 'Planned session length'
      },
      {
        label: 'Stress',
        actual: tss,
        unit: '',
        icon: 'i-heroicons-bolt',
        iconColor: 'text-amber-500',
        status: getTssBand(tss),
        statusColor: getTssBandColor(tss),
        detail: 'Training stress score'
      },
      {
        label: 'Intensity',
        actual: intensityPct,
        unit: '%',
        icon: 'i-heroicons-fire',
        iconColor: 'text-green-500',
        status: getIntensityBand(intensity),
        statusColor: getIntensityBandColor(intensity),
        detail: `Intensity factor ${intensity.toFixed(2)}`
      }
    ]
  })

  function getDurationBand(minutes: number) {
    if (minutes >= 180) return 'very long'
    if (minutes >= 120) return 'long'
    if (minutes >= 75) return 'medium'
    return 'short'
  }

  function getTssBand(tss: number) {
    if (tss >= 110) return 'very hard'
    if (tss >= 80) return 'hard'
    if (tss >= 50) return 'moderate'
    return 'easy'
  }

  function getTssBandColor(tss: number) {
    if (tss >= 110) return 'text-red-500'
    if (tss >= 80) return 'text-orange-500'
    if (tss >= 50) return 'text-amber-500'
    return 'text-green-500'
  }

  function getIntensityBand(intensity: number) {
    if (intensity >= 0.9) return 'very hard'
    if (intensity >= 0.8) return 'hard'
    if (intensity >= 0.65) return 'moderate'
    return 'easy'
  }

  function getIntensityBandColor(intensity: number) {
    if (intensity >= 0.9) return 'text-red-500'
    if (intensity >= 0.8) return 'text-orange-500'
    if (intensity >= 0.65) return 'text-amber-500'
    return 'text-green-500'
  }

  async function deleteWorkout() {
    if (!workout.value?.id) return
    deleting.value = true
    try {
      await $fetch(`/api/planned-workouts/${workout.value.id}`, {
        method: 'DELETE'
      })
      toast.add({
        title: 'Workout Deleted',
        description: 'The planned workout has been removed.',
        color: 'success'
      })
      showDeleteModal.value = false
      router.push('/activities') // Or wherever appropriate
    } catch (error: any) {
      toast.add({
        title: 'Delete Failed',
        description: error.data?.message || 'Failed to delete workout',
        color: 'error'
      })
    } finally {
      deleting.value = false
    }
  }

  async function publishWorkout() {
    if (!workout.value?.id) return

    publishing.value = true
    try {
      const response: any = await $fetch(`/api/workouts/planned/${workout.value.id}/publish`, {
        method: 'POST'
      })

      // Update local state
      if (response.success && response.workout) {
        workout.value = response.workout
        showPublishModal.value = false

        toast.add({
          title: 'Published',
          description: 'Workout published to Intervals.icu successfully.',
          color: 'success'
        })
      }
    } catch (error: any) {
      console.error('Failed to publish workout:', error)
      toast.add({
        title: 'Publish Failed',
        description: error.data?.message || 'Failed to publish workout to Intervals.icu',
        color: 'error'
      })
    } finally {
      publishing.value = false
    }
  }

  async function ejectWorkout() {
    if (!workout.value?.id) return
    ejecting.value = true
    try {
      // Re-use the link API but pass null trainingWeekId
      await $fetch(`/api/workouts/planned/${workout.value.id}/link`, {
        method: 'POST',
        body: { trainingWeekId: null }
      })

      // Update local state
      workout.value.trainingWeekId = null
      workout.value.trainingWeek = null // Clear relationship data in UI

      showEjectModal.value = false
      toast.add({
        title: 'Workout Ejected',
        description: 'This workout is now independent of the training plan.',
        color: 'success'
      })
    } catch (error: any) {
      toast.add({
        title: 'Failed to eject',
        description: error.data?.message || 'Error ejecting workout',
        color: 'error'
      })
    } finally {
      ejecting.value = false
    }
  }

  function downloadWorkout(format: string) {
    if (!workout.value?.id) return
    // Use window.location.href to trigger download, avoiding popup blockers for direct user actions usually
    // But _blank is safer for files sometimes. Let's try direct nav.
    window.location.href = `/api/workouts/planned/${workout.value.id}/download/${format}`
  }

  function editStructure() {
    if (!workout.value) return

    // Convert current JSON structure to text
    const workoutData = {
      title: workout.value.title,
      description: workout.value.description || '',
      type: workout.value.type || '',
      steps: workout.value.structuredWorkout?.steps || [],
      exercises: workout.value.structuredWorkout?.exercises || [],
      messages: []
    }

    // Since we're in Nuxt, we can import WorkoutConverter if exported from utils
    // or just implement a simple conversion here.
    // Actually WorkoutConverter is in server/utils, not app/utils.
    // I should move it or implement a local version.
    // Wait, let's see if WorkoutConverter is already used in frontend.
    // It's not. I'll use a simple manual conversion for now or just trust the API will handle it if I send text.
    // But I need to SHOW the text to the user.

    // I'll define a simple local toIntervalsText function.
    structureText.value = toIntervalsText(workoutData)
    showStructureModal.value = true
  }

  function toIntervalsText(data: any): string {
    const lines: string[] = []

    if (data.type === 'Gym' || data.type === 'WeightTraining') {
      if (data.exercises && data.exercises.length > 0) {
        data.exercises.forEach((ex: any) => {
          lines.push(`- **${ex.name}**`)
          let details = ''
          if (ex.sets) details += `${ex.sets} sets`
          if (ex.reps) details += ` x ${ex.reps} reps`
          if (ex.weight) details += ` @ ${ex.weight}`
          if (details) lines.push(`  - ${details}`)
          if (ex.rest) lines.push(`  - Rest: ${ex.rest}`)
          if (ex.notes) lines.push(`  - Note: ${ex.notes}`)
        })
        return lines.join('\n')
      }
    }

    const formatSteps = (steps: any[], indent = '') => {
      steps.forEach((step: any) => {
        if (step.steps && step.steps.length > 0) {
          const reps = step.reps || 1
          lines.push(`${indent}${reps}x`)
          formatSteps(step.steps, indent + '  ')
          return
        }

        let line = `${indent}-`
        if (step.name) line += ` ${step.name}`

        // Duration
        if (step.durationSeconds) {
          const mins = Math.floor(step.durationSeconds / 60)
          const secs = step.durationSeconds % 60
          if (mins > 0 && secs === 0) line += ` ${mins}m`
          else if (mins === 0) line += ` ${secs}s`
          else line += ` ${mins}m${secs}s`
        } else if (step.distance) {
          line += ` ${step.distance}m`
        }

        // Intensity
        if (step.power) {
          if (step.power.range)
            line += ` ${Math.round(step.power.range.start * 100)}-${Math.round(step.power.range.end * 100)}%`
          else if (step.power.value) line += ` ${Math.round(step.power.value * 100)}%`
        } else if (step.heartRate) {
          if (step.heartRate.range)
            line += ` ${Math.round(step.heartRate.range.start * 100)}-${Math.round(step.heartRate.range.end * 100)}% LTHR`
          else if (step.heartRate.value) line += ` ${Math.round(step.heartRate.value * 100)}% LTHR`
        }

        if (step.cadence) line += ` ${step.cadence}rpm`

        lines.push(line)
      })
    }

    if (data.steps && data.steps.length > 0) {
      formatSteps(data.steps)
    }

    return lines.join('\n')
  }

  async function saveStructure() {
    if (!workout.value?.id) return
    savingStructure.value = true
    try {
      await $fetch(`/api/workouts/planned/${workout.value.id}/structure`, {
        method: 'PATCH',
        body: { text: structureText.value }
      })
      toast.add({
        title: 'Structure Updated',
        description: 'The workout structure has been updated.',
        color: 'success'
      })
      showStructureModal.value = false
      // Refresh workout data
      await fetchWorkout()
    } catch (error: any) {
      toast.add({
        title: 'Update Failed',
        description: error.data?.message || 'Failed to update structure',
        color: 'error'
      })
    } finally {
      savingStructure.value = false
    }
  }

  const generateShareLink = async () => {
    if (!workout.value?.id) return

    generatingShareLink.value = true
    try {
      const response = await $fetch('/api/share/generate', {
        method: 'POST',
        body: {
          resourceType: 'PLANNED_WORKOUT',
          resourceId: workout.value.id
        }
      })
      shareLink.value = response.url
    } catch (error) {
      console.error('Failed to generate share link:', error)
      toast.add({
        title: 'Error',
        description: 'Failed to generate share link. Please try again.',
        color: 'error'
      })
    } finally {
      generatingShareLink.value = false
    }
  }

  const copyToClipboard = () => {
    if (!shareLink.value) return

    navigator.clipboard.writeText(shareLink.value)
    toast.add({
      title: 'Copied',
      description: 'Share link copied to clipboard.',
      color: 'success'
    })
  }

  watch(isShareModalOpen, (newValue) => {
    if (newValue && workout.value?.shareToken) {
      // If token exists (would need API to return it), could pre-fill.
      // For now we regenerate or check if we store it.
      // The API generates a new token or returns existing one.
    }
  })

  async function fetchWorkout() {
    loading.value = true
    loadError.value = null
    workoutFuelingPlan.value = null
    try {
      const data: any = await $fetch(`/api/workouts/planned/${route.params.id}`)
      workout.value = data.workout
      userFtp.value = data.userFtp
      llmUsageId.value = data.llmUsageId
      initialFeedback.value = data.initialFeedback
      initialFeedbackText.value = data.initialFeedbackText

      // Fetch nutrition for the workout date
      if (workout.value?.date) {
        try {
          const dateStr = formatDateUTC(new Date(workout.value.date), 'yyyy-MM-dd')
          const [nData, sData, wFueling] = await Promise.all([
            $fetch<any>(`/api/nutrition/${dateStr}`),
            $fetch<any>('/api/profile/nutrition'),
            $fetch<any>(`/api/workouts/planned/${workout.value.id}/fueling`)
          ])

          if (nData) {
            dayNutrition.value = nData
          }
          if (sData) {
            nutritionSettings.value = sData.settings
          }
          if (wFueling?.fuelingPlan) {
            workoutFuelingPlan.value = wFueling.fuelingPlan
          }
        } catch (e) {
          console.error('Failed to fetch nutrition or settings for workout date', e)
        }
      }

      // Init form
      if (workout.value) {
        showFullDescription.value = false
        showTrainingContextDetails.value = false
        adjustForm.durationMinutes = Math.round(workout.value.durationSec / 60)
        adjustForm.intensity =
          workout.value.workIntensity > 0.8
            ? 'hard'
            : workout.value.workIntensity > 0.6
              ? 'moderate'
              : 'easy'
      }
    } catch (error) {
      console.error('Failed to fetch workout', error)
      workout.value = null
      const statusCode = (error as any)?.statusCode || (error as any)?.data?.statusCode
      const message = (error as any)?.data?.message || (error as any)?.message
      loadError.value = { statusCode, message }
    } finally {
      loading.value = false
    }
  }

  function openAdjustModal() {
    adjustForm.feedback = ''
    if (workout.value) {
      adjustForm.durationMinutes = Math.round(workout.value.durationSec / 60)
      // approximate intensity mapping
      const i = workout.value.workIntensity || 0.7
      adjustForm.intensity =
        i > 0.9
          ? 'very_hard'
          : i > 0.8
            ? 'hard'
            : i > 0.6
              ? 'moderate'
              : i > 0.4
                ? 'easy'
                : 'recovery'
    }
    showAdjustModal.value = true
  }

  function openTimeModal() {
    timeForm.startTime = workout.value?.startTime || ''
    showTimeModal.value = true
  }

  async function submitTime() {
    if (!workout.value?.id) return
    updatingTime.value = true
    try {
      await $fetch(`/api/planned-workouts/${workout.value.id}`, {
        method: 'PATCH',
        body: { startTime: timeForm.startTime }
      })
      workout.value.startTime = timeForm.startTime
      toast.add({
        title: 'Time Updated',
        description: 'The workout start time has been updated.',
        color: 'success'
      })
      showTimeModal.value = false
    } catch (error: any) {
      toast.add({
        title: 'Update Failed',
        description: error.data?.message || 'Failed to update start time',
        color: 'error'
      })
    } finally {
      updatingTime.value = false
    }
  }

  function openMessageModal() {
    messageForm.context = ''
    showMessageModal.value = true
  }

  async function submitMessages() {
    generatingMessages.value = true
    try {
      await $fetch(`/api/workouts/planned/${route.params.id}/messages`, {
        method: 'POST',
        body: messageForm
      })
      refreshRuns()

      toast.add({
        title: 'Writing Messages...',
        description: 'Coach is generating your cues. This may take a moment.',
        color: 'success'
      })

      showMessageModal.value = false
    } catch (error: any) {
      generatingMessages.value = false
      toast.add({
        title: 'Generation Failed',
        description: error.data?.message || 'Failed to generate messages',
        color: 'error'
      })
    }
  }

  async function submitAdjustment() {
    adjusting.value = true
    try {
      await $fetch(`/api/workouts/planned/${route.params.id}/adjust`, {
        method: 'POST',
        body: adjustForm
      })
      refreshRuns()

      toast.add({
        title: 'Adjustment Started',
        description: 'AI is redesigning your workout. This may take a moment.',
        color: 'success'
      })

      showAdjustModal.value = false
    } catch (error: any) {
      adjusting.value = false
      toast.add({
        title: 'Adjustment Failed',
        description: error.data?.message || 'Failed to submit adjustment',
        color: 'error'
      })
    }
  }

  async function generateStructure() {
    generating.value = true
    try {
      await $fetch(`/api/workouts/planned/${route.params.id}/generate-structure`, {
        method: 'POST'
      })
      refreshRuns()

      toast.add({
        title: 'Generation Started',
        description: 'AI is generating the workout structure. This may take up to 30 seconds.',
        color: 'success'
      })
    } catch (error: any) {
      generating.value = false
      console.error('Error generating workout structure:', error)
      toast.add({
        title: 'Generation Failed',
        description: error.data?.message || 'Failed to generate structure',
        color: 'error',
        duration: 6000
      })
    }
  }

  async function markComplete() {
    // TODO: Implement mark complete functionality
    toast.add({
      title: 'Feature Coming Soon',
      description: 'Manual workout completion is not yet implemented',
      color: 'info'
    })
  }

  function goBack() {
    router.back()
  }

  // Chat about workout
  function chatAboutWorkout() {
    if (!workout.value) return
    navigateTo({
      path: '/chat',
      query: { workoutId: workout.value.id, isPlanned: 'true' }
    })
  }

  function formatDate(d: string | Date) {
    return new Date(d).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  }

  function formatDuration(seconds: number | null | undefined) {
    if (!seconds) return '0m'
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)

    if (hours > 0) {
      return `${hours}h ${mins}m`
    }
    return `${mins}m`
  }

  function formatPace(seconds: number, meters: number) {
    if (!seconds || !meters) return '-'
    const minutes = seconds / 60
    const km = meters / 1000
    const paceDec = minutes / km

    const pMin = Math.floor(paceDec)
    const pSec = Math.round((paceDec - pMin) * 60)

    return `${pMin}:${pSec.toString().padStart(2, '0')}`
  }

  function getWorkoutComponent(type: string) {
    switch (type) {
      case 'Ride':
      case 'VirtualRide':
        return RideView
      case 'Run':
        return RunView
      case 'Swim':
        return SwimView
      case 'Gym':
      case 'WeightTraining':
        return StrengthView
      default:
        return RideView
    }
  }

  useHead(() => ({
    title: workout.value ? `${workout.value.title} - Planned Workout` : 'Planned Workout'
  }))

  onMounted(() => {
    fetchWorkout()
  })
</script>
