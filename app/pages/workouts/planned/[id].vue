<template>
  <UDashboardPanel id="planned-workout-details">
    <template #header>
      <UDashboardNavbar :title="workout?.title || 'Workout Details'">
        <template #leading>
          <UButton color="neutral" variant="ghost" icon="i-heroicons-arrow-left" @click="goBack">
            Back
          </UButton>
        </template>
        <template #right>
          <UButton
            v-if="workout?.structuredWorkout"
            color="neutral"
            variant="outline"
            size="sm"
            class="font-bold"
            icon="i-heroicons-arrow-down-tray"
            @click="showDownloadModal = true"
          >
            <span class="hidden sm:inline">Download</span>
          </UButton>

          <UButton
            v-if="workout"
            color="primary"
            variant="outline"
            size="sm"
            class="font-bold"
            :icon="isLocalWorkout ? 'i-heroicons-cloud-arrow-up' : 'i-heroicons-arrow-path'"
            @click="showPublishModal = true"
          >
            <span class="hidden sm:inline">{{
              isLocalWorkout ? 'Publish' : 'Update Intervals'
            }}</span>
          </UButton>

          <UButton
            v-if="workout?.trainingWeekId"
            color="neutral"
            variant="outline"
            size="sm"
            class="font-bold"
            icon="i-heroicons-link-slash"
            @click="showEjectModal = true"
          >
            <span class="hidden sm:inline">Eject</span>
          </UButton>

          <UButton
            v-if="workout"
            color="neutral"
            variant="outline"
            size="sm"
            class="font-bold"
            icon="i-heroicons-share"
            @click="isShareModalOpen = true"
          >
            <span class="hidden sm:inline">Share</span>
          </UButton>
          <UButton
            v-if="workout"
            icon="i-heroicons-chat-bubble-left-right"
            color="primary"
            variant="outline"
            size="sm"
            class="font-bold"
            @click="chatAboutWorkout"
          >
            <span class="hidden sm:inline">Chat about this workout</span>
            <span class="sm:hidden">Chat</span>
          </UButton>
          <UButton
            v-if="workout && !workout.completed"
            size="sm"
            color="primary"
            variant="solid"
            class="font-bold"
            icon="i-heroicons-check"
            @click="markComplete"
          >
            <span class="hidden sm:inline">Mark Complete</span>
            <span class="sm:hidden">Done</span>
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-3 sm:p-6 max-w-6xl mx-auto space-y-4 sm:space-y-6">
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
        <div v-else-if="workout" class="space-y-6">
          <!-- Header Card -->
          <div
            class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6"
          >
            <div class="flex flex-col sm:flex-row items-start justify-between mb-4 gap-4">
              <div class="flex-1 min-w-0 w-full">
                <h1 class="text-2xl sm:text-3xl font-bold mb-2 break-words">{{ workout.title }}</h1>
                <div class="flex flex-wrap items-center gap-2 sm:gap-3 text-sm text-muted">
                  <div class="flex items-center gap-1 flex-shrink-0">
                    <UIcon name="i-heroicons-calendar" class="w-4 h-4" />
                    <span class="whitespace-nowrap">{{ formatDate(workout.date) }}</span>
                  </div>
                  <span class="hidden sm:inline">•</span>
                  <div class="flex items-center gap-1 flex-shrink-0">
                    <UIcon name="i-heroicons-clock" class="w-4 h-4" />
                    <span class="whitespace-nowrap">{{ formatDuration(displayDuration) }}</span>
                  </div>
                  <span class="hidden sm:inline">•</span>
                  <div class="flex items-center gap-1 flex-shrink-0">
                    <UIcon name="i-heroicons-bolt" class="w-4 h-4" />
                    <span class="whitespace-nowrap">{{ Math.round(displayTss) }} TSS</span>
                  </div>
                  <span class="hidden sm:inline">•</span>
                  <UBadge
                    :color="workout.completed ? 'success' : 'warning'"
                    size="sm"
                    class="whitespace-nowrap"
                  >
                    {{ workout.completed ? 'Completed' : 'Planned' }}
                  </UBadge>
                </div>
              </div>
              <div class="flex-shrink-0 self-end sm:self-start">
                <div class="text-right">
                  <div class="text-xs text-muted">Type</div>
                  <div class="text-lg font-bold text-primary">{{ workout.type }}</div>
                </div>
              </div>
            </div>

            <!-- Description -->
            <div v-if="workout.description" class="mt-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div class="text-sm text-muted mb-1">Description</div>
              <p class="text-sm break-words whitespace-pre-wrap">{{ workout.description }}</p>
            </div>

            <!-- Training Context -->
            <div
              v-if="workout.trainingWeek"
              class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700"
            >
              <div class="text-xs text-muted mb-2">Training Context</div>
              <div class="flex flex-wrap gap-2 text-sm">
                <UBadge
                  v-if="workout.trainingWeek.block.plan.goal"
                  color="neutral"
                  variant="soft"
                  class="whitespace-normal h-auto text-left max-w-full"
                >
                  <span class="truncate block w-full"
                    >Goal: {{ workout.trainingWeek.block.plan.goal.title }}</span
                  >
                </UBadge>
                <UBadge
                  v-else-if="workout.trainingWeek.block.plan.name"
                  color="neutral"
                  variant="soft"
                  class="whitespace-normal h-auto text-left max-w-full"
                >
                  <span class="truncate block w-full"
                    >Plan: {{ workout.trainingWeek.block.plan.name }}</span
                  >
                </UBadge>
                <UBadge color="neutral" variant="soft" class="whitespace-nowrap">
                  {{ workout.trainingWeek.block.name }}
                </UBadge>
                <UBadge color="neutral" variant="soft" class="whitespace-nowrap">
                  Week {{ workout.trainingWeek.weekNumber }}
                </UBadge>
                <UBadge
                  color="neutral"
                  variant="soft"
                  class="whitespace-normal h-auto text-left max-w-full"
                >
                  <span class="truncate block w-full"
                    >Focus:
                    {{
                      workout.trainingWeek.focus || workout.trainingWeek.block.primaryFocus
                    }}</span
                  >
                </UBadge>
              </div>
            </div>
          </div>

          <!-- Extended Stats Grid -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
            >
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <UIcon name="i-heroicons-clock" class="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div class="text-xs text-muted">Planned Duration</div>
                  <div class="text-2xl font-bold">{{ formatDuration(workout.durationSec) }}</div>
                </div>
              </div>
            </div>

            <div
              class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
            >
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center">
                  <UIcon name="i-heroicons-bolt" class="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <div class="text-xs text-muted">Training Stress</div>
                  <div class="text-2xl font-bold">{{ Math.round(workout.tss) }}</div>
                </div>
              </div>
            </div>

            <div
              class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
            >
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
                  <UIcon name="i-heroicons-fire" class="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <div class="text-xs text-muted">Intensity</div>
                  <div class="text-2xl font-bold">
                    {{ Math.round((workout.workIntensity || 0) * 100) }}%
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Run/Swim Details -->
          <div
            v-if="workout.type === 'Run' || workout.type === 'Swim'"
            class="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            <div
              v-if="workout.distanceMeters"
              class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
            >
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                  <UIcon name="i-heroicons-map" class="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <div class="text-xs text-muted">Distance</div>
                  <div class="text-2xl font-bold">
                    {{ (workout.distanceMeters / 1000).toFixed(1) }} km
                  </div>
                </div>
              </div>
            </div>

            <!-- Pace (Estimated) -->
            <div
              v-if="workout.type === 'Run' && workout.distanceMeters && workout.durationSec"
              class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
            >
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-indigo-500/10 rounded-lg flex items-center justify-center">
                  <UIcon name="i-heroicons-forward" class="w-5 h-5 text-indigo-500" />
                </div>
                <div>
                  <div class="text-xs text-muted">Est. Pace</div>
                  <div class="text-2xl font-bold">
                    {{ formatPace(workout.durationSec, workout.distanceMeters) }} /km
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Coach Instructions -->
          <div
            v-if="workout.structuredWorkout?.coachInstructions"
            class="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 border border-blue-100 dark:border-blue-800"
          >
            <div class="flex items-start gap-4">
              <div class="p-2 bg-blue-100 dark:bg-blue-800 rounded-full">
                <UIcon
                  name="i-heroicons-chat-bubble-bottom-center-text"
                  class="w-6 h-6 text-blue-600 dark:text-blue-300"
                />
              </div>
              <div>
                <h3 class="font-semibold text-lg text-blue-900 dark:text-blue-100">
                  Coach's Advice
                </h3>
                <p class="text-blue-800 dark:text-blue-200 mt-2 italic">
                  "{{ workout.structuredWorkout.coachInstructions }}"
                </p>
              </div>
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
            class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
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

          <!-- Completed Workout Link -->
          <div
            v-if="workout.completedWorkouts && workout.completedWorkouts.length > 0"
            class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
          >
            <h3 class="text-lg font-semibold mb-4">Linked Completed Activities</h3>
            <div class="space-y-3">
              <NuxtLink
                v-for="completed in workout.completedWorkouts"
                :key="completed.id"
                :to="`/workouts/${completed.id}`"
                class="block p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary transition-colors"
              >
                <div class="flex items-center justify-between">
                  <div class="flex-1">
                    <div class="font-semibold">{{ completed.title }}</div>
                    <div class="text-xs text-muted mt-1">
                      {{ formatDate(completed.date) }}
                    </div>
                  </div>
                  <div class="flex gap-4 text-sm">
                    <div class="text-right">
                      <div class="text-xs text-muted">Duration</div>
                      <div class="font-semibold">{{ formatDuration(completed.durationSec) }}</div>
                    </div>
                    <div class="text-right">
                      <div class="text-xs text-muted">TSS</div>
                      <div class="font-semibold">{{ Math.round(completed.tss || 0) }}</div>
                    </div>
                    <div v-if="completed.normalizedPower" class="text-right">
                      <div class="text-xs text-muted">NP</div>
                      <div class="font-semibold">{{ completed.normalizedPower }}W</div>
                    </div>
                  </div>
                </div>
              </NuxtLink>
            </div>
          </div>

          <!-- Stats Grid -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
            >
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <UIcon name="i-heroicons-clock" class="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div class="text-xs text-muted">Planned Duration</div>
                  <div class="text-2xl font-bold">{{ formatDuration(displayDuration) }}</div>
                </div>
              </div>
            </div>

            <div
              class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
            >
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center">
                  <UIcon name="i-heroicons-bolt" class="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <div class="text-xs text-muted">Training Stress</div>
                  <div class="text-2xl font-bold">{{ Math.round(displayTss) }}</div>
                </div>
              </div>
            </div>

            <div
              class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
            >
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
                  <UIcon name="i-heroicons-fire" class="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <div class="text-xs text-muted">Intensity</div>
                  <div class="text-2xl font-bold">
                    {{ Math.round((workout.workIntensity || 0) * 100) }}%
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Coaching Messages Timeline -->
          <WorkoutMessagesTimeline
            v-if="workout.structuredWorkout?.messages?.length"
            :workout="workout.structuredWorkout"
          />
        </div>

        <!-- Error State -->
        <div v-else class="text-center py-20">
          <UIcon
            name="i-heroicons-exclamation-circle"
            class="w-16 h-16 text-red-500 mx-auto mb-4"
          />
          <h3 class="text-xl font-semibold mb-2">Workout Not Found</h3>
          <p class="text-muted mb-4">The planned workout you're looking for doesn't exist.</p>
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
        <div class="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg text-sm">
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
      <div class="flex justify-end gap-2">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="showEjectModal = false" />
        <UButton label="Eject Workout" color="error" :loading="ejecting" @click="ejectWorkout" />
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
</template>

<script setup lang="ts">
  import WorkoutChart from '~/components/workouts/WorkoutChart.vue'
  import WorkoutMessagesTimeline from '~/components/workouts/WorkoutMessagesTimeline.vue'
  import RideView from '~/components/workouts/planned/RideView.vue'
  import RunView from '~/components/workouts/planned/RunView.vue'
  import SwimView from '~/components/workouts/planned/SwimView.vue'
  import StrengthView from '~/components/workouts/planned/StrengthView.vue'

  definePageMeta({
    middleware: 'auth'
  })

  const route = useRoute()
  const router = useRouter()
  const toast = useToast()

  const loading = ref(true)
  const generating = ref(false)
  const adjusting = ref(false)
  const generatingMessages = ref(false)
  const showAdjustModal = ref(false)
  const showMessageModal = ref(false)
  const showDownloadModal = ref(false)
  const showPublishModal = ref(false)
  const adjustForm = reactive({
    durationMinutes: 60,
    intensity: 'moderate',
    feedback: ''
  })
  const messageForm = reactive({
    tone: 'Motivational',
    context: ''
  })
  const workout = ref<any>(null)
  const userFtp = ref<number | undefined>(undefined)

  // Background Task Monitoring
  const { refresh: refreshRuns } = useUserRuns()
  const { onTaskCompleted } = useUserRunsState()

  // Share functionality
  const isShareModalOpen = ref(false)
  const shareLink = ref('')
  const generatingShareLink = ref(false)
  const publishing = ref(false)

  // Eject logic
  const showEjectModal = ref(false)
  const ejecting = ref(false)

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

  const displayDuration = computed(() => {
    if (workout.value?.durationSec) return workout.value.durationSec
    // Fallback to structured workout total duration if available
    if (workout.value?.structuredWorkout?.steps) {
      return workout.value.structuredWorkout.steps.reduce(
        (sum: number, step: any) => sum + (step.durationSeconds || 0),
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
    try {
      const data: any = await $fetch(`/api/workouts/planned/${route.params.id}`)
      workout.value = data.workout
      userFtp.value = data.userFtp

      // Init form
      if (workout.value) {
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
      toast.add({
        title: 'Generation Failed',
        description: error.data?.message || 'Failed to generate structure',
        color: 'error'
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
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
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
