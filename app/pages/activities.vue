<template>
  <UDashboardPanel id="activities">
    <template #header>
      <UDashboardNavbar title="Activities">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <!-- View Switcher -->
            <div class="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <UButton
                icon="i-heroicons-calendar"
                :color="viewMode === 'calendar' ? 'primary' : 'neutral'"
                variant="ghost"
                size="sm"
                @click="viewMode = 'calendar'"
              />
              <UButton
                icon="i-heroicons-list-bullet"
                :color="viewMode === 'list' ? 'primary' : 'neutral'"
                variant="ghost"
                size="sm"
                @click="viewMode = 'list'"
              />
            </div>

            <!-- Month Navigation -->
            <div class="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <UButton
                icon="i-heroicons-chevron-left"
                variant="ghost"
                size="sm"
                @click="prevMonth"
              />
              <span
                class="px-2 text-xs sm:text-sm font-semibold min-w-[80px] sm:min-w-[120px] text-center"
              >
                {{ currentMonthLabel }}
              </span>
              <UButton
                icon="i-heroicons-chevron-right"
                variant="ghost"
                size="sm"
                @click="nextMonth"
              />
            </div>

            <UButton
              v-if="!isCurrentMonth"
              label="Today"
              size="sm"
              variant="outline"
              color="neutral"
              class="font-bold hidden sm:flex"
              @click="goToToday"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="h-full flex flex-col">
        <Head>
          <Title>Activities</Title>
          <Meta
            name="description"
            content="View your training calendar, analyze completed workouts, and plan future sessions."
          />
        </Head>

        <!-- Secondary Controls -->
        <div
          class="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 border-b dark:border-gray-800"
        >
          <div class="flex items-center gap-4 flex-wrap">
            <!-- Legend (Calendar Only) -->
            <div
              v-if="viewMode === 'calendar'"
              class="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 shrink-0"
            >
              <div class="flex items-center gap-1.5">
                <div class="w-2 h-2 rounded-full bg-green-500" />
                <span>Completed</span>
              </div>
              <div class="flex items-center gap-1.5">
                <div class="w-2 h-2 rounded-full bg-blue-500" />
                <span>From Plan</span>
              </div>
              <div class="flex items-center gap-1.5">
                <div class="w-2 h-2 rounded-full bg-amber-500" />
                <span>Planned</span>
              </div>
              <div class="flex items-center gap-1.5">
                <div class="w-2 h-2 rounded-full bg-red-500" />
                <span>Missed</span>
              </div>
              <div
                class="flex items-center gap-1.5 border-l border-gray-300 dark:border-gray-700 pl-3"
              >
                <div class="w-4 h-1 bg-green-500 rounded-sm" />
                <span>TSS</span>
              </div>
            </div>
          </div>

          <!-- List View Controls -->
          <div class="flex items-center gap-4 justify-between md:justify-end overflow-x-auto">
            <UInput
              v-if="viewMode === 'list'"
              v-model="tableSearch"
              icon="i-heroicons-magnifying-glass"
              placeholder="Filter..."
              size="sm"
              class="w-48"
            />

            <UDropdownMenu
              v-if="viewMode === 'list'"
              :items="columnMenuItems"
              :content="{ align: 'end' }"
              :disabled="columnMenuItems.length === 0"
            >
              <UButton
                label="Columns"
                color="neutral"
                variant="outline"
                trailing-icon="i-heroicons-chevron-down"
                size="sm"
                class="font-bold"
                aria-label="Toggle columns"
                :disabled="columnMenuItems.length === 0"
              />
            </UDropdownMenu>

            <UButton
              to="/workouts/upload"
              icon="i-heroicons-cloud-arrow-up"
              color="neutral"
              variant="outline"
              size="sm"
              class="font-bold"
            >
              <span class="hidden sm:inline">Upload</span>
            </UButton>

            <UButton
              icon="i-heroicons-arrow-path"
              color="neutral"
              variant="outline"
              size="sm"
              class="font-bold"
              :loading="status === 'pending' || integrationStore.syncingData"
              @click="handleRefresh"
            >
              <span class="hidden sm:inline">Refresh</span>
            </UButton>
          </div>
        </div>

        <!-- Content Area -->
        <div class="flex-1 overflow-hidden p-4">
          <div v-if="status === 'error'" class="p-4 text-red-500 bg-red-50 rounded-lg">
            Failed to load activities. Please try again.
          </div>

          <!-- Calendar View -->
          <div v-if="viewMode === 'calendar'" class="overflow-x-auto overflow-y-auto h-full">
            <!-- Desktop Grid View (hidden on mobile) -->
            <div
              class="hidden lg:grid grid-cols-[80px_repeat(7,minmax(130px,1fr))] gap-px bg-gray-200 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden min-w-[1000px]"
            >
              <!-- Header Row -->
              <div
                class="bg-gray-50 dark:bg-gray-800 p-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700"
              >
                Week
              </div>
              <div
                v-for="day in weekDays"
                :key="day"
                class="bg-gray-50 dark:bg-gray-800 p-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 text-center"
              >
                {{ day }}
              </div>

              <!-- Week Rows -->
              <template v-for="(week, weekIdx) in calendarWeeks" :key="weekIdx">
                <!-- Week Summary Cell -->
                <div
                  class="bg-gray-50 dark:bg-gray-800/50 p-2 flex flex-col justify-between border-r border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  @click="openWeekZoneDetail(week)"
                >
                  <div class="text-xs font-bold text-gray-400">
                    W{{ week[0] ? getWeekNumber(week[0].date) : '' }}
                  </div>
                  <div class="space-y-1 mt-2">
                    <div class="flex items-center justify-between text-[10px]">
                      <span class="text-gray-500">Time:</span>
                      <span class="font-bold">{{
                        formatDuration(getWeekSummary(week).duration)
                      }}</span>
                    </div>
                    <div class="flex items-center justify-between text-[10px]">
                      <span class="text-gray-500">Dist:</span>
                      <span class="font-bold">{{
                        formatDistance(getWeekSummary(week).distance)
                      }}</span>
                    </div>
                    <div class="flex items-center justify-between text-[10px]">
                      <span class="text-gray-500">TSS:</span>
                      <span class="font-bold text-green-600 dark:text-green-400">{{
                        Math.round(getWeekSummary(week).tss || getWeekSummary(week).plannedTss)
                      }}</span>
                    </div>

                    <!-- Training Stress Trends -->
                    <div
                      v-if="getWeekSummary(week).ctl !== null"
                      class="pt-1 mt-1 border-t border-gray-200 dark:border-gray-700"
                    >
                      <div class="flex items-center justify-between text-[10px]">
                        <span class="text-gray-500">Fitness:</span>
                        <span class="font-bold text-blue-600">{{
                          Math.round(getWeekSummary(week).ctl!)
                        }}</span>
                      </div>
                      <div class="flex items-center justify-between text-[10px]">
                        <span class="text-gray-500">Form:</span>
                        <UTooltip :text="getFormStatusTooltip(getWeekSummary(week).tsb)">
                          <span class="font-bold" :class="getTSBColor(getWeekSummary(week).tsb!)">
                            {{ Math.round(getWeekSummary(week).tsb!) }}
                          </span>
                        </UTooltip>
                      </div>
                      <div
                        class="text-[8px] text-center mt-0.5 font-medium uppercase tracking-tighter"
                        :class="getTSBColor(getWeekSummary(week).tsb!)"
                      >
                        {{ getFormStatusText(getWeekSummary(week).tsb) }}
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Day Cells -->
                <CalendarDayCell
                  v-for="day in week"
                  :key="day.date.toISOString()"
                  :date="day.date"
                  :activities="day.activities"
                  :is-other-month="day.isOtherMonth"
                  :is-today="isTodayDate(day.date)"
                  :streams="streamsMap"
                  :user-zones="userZones"
                  @activity-click="openActivity"
                  @wellness-click="openWellnessModal"
                  @merge-activity="onMergeActivity"
                  @link-activity="onLinkActivity"
                />
              </template>
            </div>

            <!-- Mobile List View for Calendar (simplified) -->
            <div class="lg:hidden space-y-4">
              <div
                v-for="(week, weekIdx) in calendarWeeks"
                :key="'mob-week-' + weekIdx"
                class="space-y-2"
              >
                <div
                  class="flex items-center justify-between bg-gray-100 dark:bg-gray-800 p-2 rounded-lg sticky top-0 z-10"
                >
                  <span class="text-xs font-bold uppercase"
                    >Week {{ week[0] ? getWeekNumber(week[0].date) : '' }}</span
                  >
                  <div class="flex items-center gap-3 text-[10px]">
                    <span>{{
                      formatDuration(
                        getWeekSummary(week).duration || getWeekSummary(week).plannedDuration
                      )
                    }}</span>
                    <span>{{ formatDistance(getWeekSummary(week).distance) }}</span>
                    <span class="text-green-600 font-bold"
                      >{{
                        Math.round(getWeekSummary(week).tss || getWeekSummary(week).plannedTss)
                      }}
                      TSS</span
                    >
                  </div>
                </div>

                <div
                  v-for="day in week"
                  :key="'mob-day-' + day.date.toISOString()"
                  class="space-y-1"
                >
                  <div v-if="day.activities.length > 0 || isTodayDate(day.date)" class="flex gap-2">
                    <div class="w-12 text-center shrink-0 pt-1">
                      <div class="text-[10px] uppercase text-gray-500">
                        {{ format(day.date, 'EEE') }}
                      </div>
                      <div
                        class="w-8 h-8 mx-auto flex items-center justify-center rounded-full text-sm font-bold mt-0.5"
                        :class="[
                          isTodayDate(day.date)
                            ? 'bg-primary-500 text-white'
                            : 'text-gray-700 dark:text-gray-300',
                          day.isOtherMonth ? 'opacity-30' : ''
                        ]"
                      >
                        {{ format(day.date, 'd') }}
                      </div>
                    </div>

                    <div class="flex-1 space-y-1 pb-4">
                      <!-- Wellness/Nutrition summary -->
                      <div
                        v-if="day.activities.some((a) => a.wellness || a.nutrition)"
                        class="flex gap-2 mb-1"
                      >
                        <div
                          v-if="day.activities.find((a) => a.wellness)?.wellness?.recoveryScore"
                          class="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-[10px] font-bold text-blue-600 dark:text-blue-400"
                        >
                          {{ day.activities.find((a) => a.wellness)?.wellness?.recoveryScore }}% REC
                        </div>
                        <div
                          v-if="day.activities.find((a) => a.nutrition)?.nutrition?.calories"
                          class="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-900/30 text-[10px] font-bold text-amber-600 dark:text-amber-400"
                        >
                          {{
                            Math.round(
                              day.activities.find((a) => a.nutrition)?.nutrition?.calories || 0
                            )
                          }}
                          KCAL
                        </div>
                      </div>

                      <!-- Actual activities -->
                      <div
                        v-for="activity in day.activities.filter((a) => a.id)"
                        :key="activity.id"
                        class="p-2 rounded-lg border dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm flex items-center justify-between gap-3"
                        @click="openActivity(activity)"
                      >
                        <div class="flex items-center gap-3 overflow-hidden">
                          <UIcon
                            :name="getActivityIcon(activity.type || '')"
                            class="w-5 h-5 shrink-0"
                            :class="
                              activity.source === 'completed' ? 'text-green-500' : 'text-amber-500'
                            "
                          />
                          <div class="truncate">
                            <div class="text-xs font-bold truncate">{{ activity.title }}</div>
                            <div class="text-[10px] text-gray-500">
                              {{
                                formatDurationCompact(
                                  activity.duration || activity.plannedDuration || 0
                                )
                              }}
                              •
                              {{
                                formatDistance(activity.distance || activity.plannedDistance || 0)
                              }}
                            </div>
                          </div>
                        </div>
                        <div
                          v-if="activity.tss || activity.plannedTss"
                          class="text-xs font-bold text-green-600 shrink-0"
                        >
                          {{ Math.round(activity.tss || activity.plannedTss || 0) }}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- List View -->
          <div
            v-else
            class="bg-white dark:bg-gray-900 rounded-lg shadow overflow-x-auto h-full flex flex-col"
          >
            <UTable
              ref="table"
              v-model:column-visibility="columnVisibility"
              :data="sortedActivities"
              :columns="availableColumns"
              :loading="status === 'pending'"
              class="flex-1 w-full"
              empty="No activities found for this month"
              :ui="{
                root: 'w-full',
                base: 'w-full table-auto',
                th: 'text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky top-0 bg-white dark:bg-gray-900 z-10 px-4 py-3',
                td: 'text-sm text-gray-900 dark:text-gray-100 cursor-pointer px-4 py-3',
                tbody: 'divide-y divide-gray-200 dark:divide-gray-800'
              }"
              @select="(_, row) => openActivity(row.original)"
            >
              <template #type-cell="{ row }">
                <div class="flex items-center gap-2">
                  <UIcon
                    :name="getActivityIcon(row.original.type || '')"
                    class="w-4 h-4 flex-shrink-0"
                  />
                  <span class="hidden sm:inline">{{ row.original.type }}</span>
                </div>
              </template>

              <template #date-cell="{ row }">
                <div class="whitespace-nowrap">
                  {{ formatDateForList(row.original.date) }}
                </div>
              </template>

              <template #title-cell="{ row }">
                <div class="max-w-xs truncate" :title="row.original.title">
                  {{ row.original.title }}
                </div>
              </template>

              <template #duration-cell="{ row }">
                <span v-if="row.original.duration || row.original.plannedDuration">
                  {{
                    formatDurationCompact(
                      row.original.duration || row.original.plannedDuration || 0
                    )
                  }}
                </span>
                <span v-else class="text-gray-400">-</span>
              </template>

              <template #distance-cell="{ row }">
                <span
                  v-if="row.original.distance || row.original.plannedDistance"
                  class="whitespace-nowrap"
                >
                  {{
                    ((row.original.distance || row.original.plannedDistance || 0) / 1000).toFixed(1)
                  }}
                  km
                </span>
                <span v-else class="text-gray-400">-</span>
              </template>

              <template #averageHr-cell="{ row }">
                <span
                  v-if="row.original.averageHr"
                  class="flex items-center gap-1 text-red-500 dark:text-red-400"
                >
                  <UIcon name="i-heroicons-heart" class="w-3.5 h-3.5" />
                  <span class="font-medium">{{ Math.round(row.original.averageHr) }}</span>
                </span>
                <span v-else class="text-gray-400">-</span>
              </template>

              <template #intensity-cell="{ row }">
                <span v-if="row.original.intensity != null">
                  {{ (row.original.intensity * 100).toFixed(0) }}%
                </span>
                <span v-else class="text-gray-400">-</span>
              </template>

              <template #tss-cell="{ row }">
                <span v-if="row.original.tss || row.original.plannedTss">
                  {{ Math.round(row.original.tss || row.original.plannedTss || 0) }}
                </span>
                <span v-else class="text-gray-400">-</span>
              </template>

              <template #rpe-cell="{ row }">
                <span v-if="row.original.rpe"> {{ row.original.rpe }}/10 </span>
                <span v-else class="text-gray-400">-</span>
              </template>

              <template #trainingLoad-cell="{ row }">
                <span v-if="row.original.trainingLoad">
                  {{ Math.round(row.original.trainingLoad) }}
                </span>
                <span v-else class="text-gray-400">-</span>
              </template>

              <template #trimp-cell="{ row }">
                <span v-if="row.original.trimp">
                  {{ Math.round(row.original.trimp) }}
                </span>
                <span v-else class="text-gray-400">-</span>
              </template>

              <template #sessionRpe-cell="{ row }">
                <span v-if="row.original.sessionRpe">
                  {{ row.original.sessionRpe }}
                </span>
                <span v-else class="text-gray-400">-</span>
              </template>

              <template #feel-cell="{ row }">
                <span v-if="row.original.feel"> {{ row.original.feel }}/5 </span>
                <span v-else class="text-gray-400">-</span>
              </template>
              <template #averageWatts-cell="{ row }">
                <span v-if="row.original.averageWatts" class="font-medium">
                  {{ Math.round(row.original.averageWatts) }}W
                </span>
                <span v-else class="text-gray-400">-</span>
              </template>

              <template #normalizedPower-cell="{ row }">
                <span v-if="row.original.normalizedPower" class="font-medium">
                  {{ Math.round(row.original.normalizedPower) }}W
                </span>
                <span v-else class="text-gray-400">-</span>
              </template>

              <template #weightedAvgWatts-cell="{ row }">
                <span v-if="row.original.weightedAvgWatts" class="font-medium">
                  {{ Math.round(row.original.weightedAvgWatts) }}W
                </span>
                <span v-else class="text-gray-400">-</span>
              </template>

              <template #kilojoules-cell="{ row }">
                <span v-if="row.original.kilojoules">
                  {{ Math.round(row.original.kilojoules) }} kJ
                </span>
                <span v-else class="text-gray-400">-</span>
              </template>

              <template #calories-cell="{ row }">
                <span v-if="row.original.calories">
                  {{ Math.round(row.original.calories) }} kcal
                </span>
                <span v-else class="text-gray-400">-</span>
              </template>

              <template #elapsedTime-cell="{ row }">
                <span v-if="row.original.elapsedTime">
                  {{ formatDurationCompact(row.original.elapsedTime) }}
                </span>
                <span v-else class="text-gray-400">-</span>
              </template>

              <template #deviceName-cell="{ row }">
                <span v-if="row.original.deviceName" class="text-xs">
                  {{ row.original.deviceName }}
                </span>
                <span v-else class="text-gray-400">-</span>
              </template>

              <template #commute-cell="{ row }">
                <UBadge v-if="row.original.commute" color="info" variant="subtle" size="xs">
                  Commute
                </UBadge>
                <span v-else class="text-gray-400">-</span>
              </template>

              <template #isPrivate-cell="{ row }">
                <UIcon
                  v-if="row.original.isPrivate"
                  name="i-heroicons-lock-closed"
                  class="text-gray-500"
                />
                <span v-else class="text-gray-400">-</span>
              </template>

              <template #gearId-cell="{ row }">
                <span v-if="row.original.gearId" class="text-xs">
                  {{ row.original.gearId }}
                </span>
                <span v-else class="text-gray-400">-</span>
              </template>

              <template #source-cell="{ row }">
                <UBadge
                  :color="row.original.source === 'completed' ? 'success' : 'neutral'"
                  variant="subtle"
                  size="xs"
                >
                  {{ row.original.source === 'completed' ? 'Completed' : 'Planned' }}
                </UBadge>
              </template>

              <template #status-cell="{ row }">
                <UBadge
                  :color="
                    row.original.status === 'completed'
                      ? 'success'
                      : row.original.status === 'missed'
                        ? 'error'
                        : 'neutral'
                  "
                  variant="subtle"
                  size="xs"
                >
                  {{ row.original.status }}
                </UBadge>
              </template>
            </UTable>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Modals -->
  <PlannedWorkoutModal
    v-model="showPlannedWorkoutModal"
    :planned-workout="selectedPlannedWorkout"
    @completed="handlePlannedWorkoutCompleted"
    @deleted="handlePlannedWorkoutDeleted"
  />

  <WorkoutQuickViewModal
    v-model="showWorkoutModal"
    :workout="selectedWorkout"
    @deleted="handleWorkoutDeleted"
    @updated="() => refresh()"
  />

  <WellnessModal
    v-if="showWellnessModal"
    v-model:open="showWellnessModal"
    :date="selectedWellnessDate"
  />

  <WeeklyZoneDetailModal
    v-model="showWeekZoneModal"
    :week-data="selectedWeekData"
    :user-zones="userZones"
    :streams="selectedWeekStreams"
  />

  <UModal
    v-model:open="showMergeModal"
    title="Merge Workouts?"
    description="This action cannot be undone."
    :prevent-close="isMerging"
  >
    <template #body>
      <p class="text-gray-700 dark:text-gray-300">
        Do you want to merge <strong>{{ mergeSource?.title }}</strong> into
        <strong>{{ mergeTarget?.title }}</strong
        >?
      </p>
      <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
        The dragged workout will be marked as a duplicate, and the target workout will be kept as
        the primary version.
      </p>
    </template>

    <template #footer>
      <div class="flex justify-end gap-3 w-full">
        <UButton
          color="neutral"
          variant="ghost"
          :disabled="isMerging"
          @click="showMergeModal = false"
          >Cancel</UButton
        >
        <UButton color="primary" :loading="isMerging" @click="confirmMerge">Merge</UButton>
      </div>
    </template>
  </UModal>

  <UModal
    v-model:open="showLinkModal"
    title="Link Workouts?"
    description="This will mark the planned workout as completed by this activity."
    :prevent-close="isLinking"
  >
    <template #body>
      <p class="text-gray-700 dark:text-gray-300">
        Do you want to link the planned workout <strong>{{ linkPlanned?.title }}</strong> to the
        completed activity <strong>{{ linkCompleted?.title }}</strong
        >?
      </p>
    </template>

    <template #footer>
      <div class="flex justify-end gap-3 w-full">
        <UButton
          color="neutral"
          variant="ghost"
          :disabled="isLinking"
          @click="showLinkModal = false"
          >Cancel</UButton
        >
        <UButton color="primary" :loading="isLinking" @click="confirmLink">Link</UButton>
      </div>
    </template>
  </UModal>

  <UModal
    v-if="showMatcherModal"
    v-model:open="showMatcherModal"
    title="Link Workouts"
    description="Manually match completed activities with planned workouts."
    :ui="{ content: 'sm:max-w-4xl' }"
  >
    <template #body>
      <div class="p-3 sm:p-6">
        <WorkoutMatcher
          :completed-workouts="unlinkedCompletedWorkouts"
          :planned-workouts="unlinkedPlannedWorkouts"
          @matched="onWorkoutsMatched"
        />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
  import {
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    format,
    addMonths,
    subMonths,
    isSameMonth,
    getISOWeek,
    isToday as isTodayDate
  } from 'date-fns'
  import { useStorage } from '@vueuse/core'
  import type { CalendarActivity } from '../../types/calendar'
  import WorkoutMatcher from '~/components/workouts/WorkoutMatcher.vue'

  definePageMeta({
    middleware: 'auth',
    layout: 'default'
  })

  const integrationStore = useIntegrationStore()

  // Modal state
  const showPlannedWorkoutModal = ref(false)
  const selectedPlannedWorkout = ref<any>(null)
  const showWorkoutModal = ref(false)
  const selectedWorkout = ref<any>(null)
  const showWellnessModal = ref(false)
  const selectedWellnessDate = ref<Date | null>(null)
  const showWeekZoneModal = ref(false)
  const selectedWeekData = ref<any>(null)
  const selectedWeekStreams = ref<any[]>([])
  const showMergeModal = ref(false)
  const mergeSource = ref<CalendarActivity | null>(null)
  const mergeTarget = ref<CalendarActivity | null>(null)
  const isMerging = ref(false)
  const showMatcherModal = ref(false)

  const showLinkModal = ref(false)
  const linkPlanned = ref<CalendarActivity | null>(null)
  const linkCompleted = ref<CalendarActivity | null>(null)
  const isLinking = ref(false)

  const currentDate = ref(new Date())
  const viewMode = ref<'calendar' | 'list'>('calendar')
  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  // API Fetch
  const {
    data: activities,
    status,
    refresh
  } = await useFetch<CalendarActivity[]>('/api/calendar', {
    query: computed(() => {
      const start = format(
        startOfWeek(startOfMonth(currentDate.value), { weekStartsOn: 1 }),
        'yyyy-MM-dd'
      )
      const end = format(
        endOfWeek(endOfMonth(currentDate.value), { weekStartsOn: 1 }),
        'yyyy-MM-dd'
      )
      return {
        startDate: start,
        endDate: end
      }
    }),
    watch: [currentDate]
  })

  // Bulk fetch streams for visible activities
  const streamsMap = ref<Record<string, any>>({})
  const streamsLoading = ref(false)

  watch(
    activities,
    async (newActivities) => {
      if (!newActivities?.length) {
        streamsMap.value = {}
        return
      }

      const ids = newActivities.filter((a) => a.source === 'completed').map((a) => a.id)

      if (ids.length === 0) return

      streamsLoading.value = true
      try {
        const streams = await $fetch<any[]>('/api/workouts/streams', {
          method: 'POST',
          body: { workoutIds: ids }
        })

        // Create map
        const map: Record<string, any> = {}
        streams.forEach((s) => (map[s.workoutId] = s))
        streamsMap.value = map
      } catch (e) {
        console.error('Error fetching bulk streams:', e)
      } finally {
        streamsLoading.value = false
      }
    },
    { immediate: true }
  )

  // User Profile for Zones
  const { data: profile } = await useFetch<any>('/api/profile')

  const userZones = computed(() => {
    return {
      hrZones: profile.value?.profile?.hrZones || getDefaultHrZones(),
      powerZones: profile.value?.profile?.powerZones || getDefaultPowerZones()
    }
  })

  function getDefaultHrZones() {
    return [
      { name: 'Z1', min: 60, max: 120 },
      { name: 'Z2', min: 121, max: 145 },
      { name: 'Z3', min: 146, max: 160 },
      { name: 'Z4', min: 161, max: 175 },
      { name: 'Z5', min: 176, max: 220 }
    ]
  }

  function getDefaultPowerZones() {
    return [
      { name: 'Z1', min: 0, max: 137 },
      { name: 'Z2', min: 138, max: 187 },
      { name: 'Z3', min: 188, max: 225 },
      { name: 'Z4', min: 226, max: 262 },
      { name: 'Z5', min: 263, max: 999 }
    ]
  }

  // Calendar Logic
  const calendarWeeks = computed(() => {
    const start = startOfWeek(startOfMonth(currentDate.value), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(currentDate.value), { weekStartsOn: 1 })

    const days = eachDayOfInterval({ start, end })
    const weeks = []
    let currentWeek = []

    for (const day of days) {
      const dayActivities = (activities.value || []).filter((a) => {
        // Simple date string match (YYYY-MM-DD)
        return a.date.split('T')[0] === format(day, 'yyyy-MM-dd')
      })

      currentWeek.push({
        date: day,
        activities: dayActivities,
        isOtherMonth: !isSameMonth(day, currentDate.value)
      })

      if (currentWeek.length === 7) {
        weeks.push(currentWeek)
        currentWeek = []
      }
    }

    return weeks
  })

  const currentMonthLabel = computed(() => format(currentDate.value, 'MMMM yyyy'))

  const isCurrentMonth = computed(() => isSameMonth(currentDate.value, new Date()))

  // Navigation
  function nextMonth() {
    currentDate.value = addMonths(currentDate.value, 1)
  }

  function prevMonth() {
    currentDate.value = subMonths(currentDate.value, 1)
  }

  function goToToday() {
    currentDate.value = new Date()
  }

  // Helpers
  function getWeekNumber(date: Date) {
    return getISOWeek(date)
  }

  function getWeekSummary(weekDays: any[]) {
    let lastCTL: number | null = null
    let lastATL: number | null = null
    let lastTSB: number | null = null

    return weekDays.reduce(
      (acc, day) => {
        day.activities.forEach((act: CalendarActivity) => {
          // Only count completed activities for actual totals
          if (act.source === 'completed') {
            acc.duration += act.duration || 0
            acc.distance += act.distance || 0
            acc.tss += act.tss ?? act.trimp ?? 0

            // Track the last (most recent) CTL/ATL values in the week
            if (act.ctl !== null && act.ctl !== undefined) lastCTL = act.ctl
            if (act.atl !== null && act.atl !== undefined) lastATL = act.atl
          } else if (act.source === 'planned' && act.status !== 'completed_plan') {
            // Only count planned activities if they haven't been completed yet
            // to avoid double counting
            acc.plannedDuration += act.plannedDuration || 0
            acc.plannedTss += act.plannedTss || 0
          }
        })

        // Calculate TSB from last available CTL/ATL
        if (lastCTL !== null && lastATL !== null) {
          lastTSB = lastCTL - lastATL
        }

        return {
          ...acc,
          ctl: lastCTL,
          atl: lastATL,
          tsb: lastTSB
        }
      },
      {
        duration: 0,
        distance: 0,
        tss: 0,
        plannedDuration: 0,
        plannedTss: 0,
        ctl: null as number | null,
        atl: null as number | null,
        tsb: null as number | null
      }
    )
  }

  function getTSBColor(tsb: number | null): string {
    if (tsb === null) return 'text-gray-400'
    if (tsb >= 5) return 'text-green-600 dark:text-green-400'
    if (tsb >= -10) return 'text-yellow-600 dark:text-yellow-400'
    if (tsb >= -25) return 'text-blue-600 dark:text-blue-400'
    return 'text-red-600 dark:text-red-400'
  }

  function getFormStatusText(tsb: number | null): string {
    if (tsb === null) return ''
    if (tsb > 25) return 'No Fitness'
    if (tsb > 5) return 'Peak Form'
    if (tsb > -10) return 'Maintenance'
    if (tsb > -25) return 'Building'
    if (tsb > -40) return 'Caution'
    return 'Overreaching'
  }

  function getFormStatusTooltip(tsb: number | null): string {
    if (tsb === null) return ''
    if (tsb > 25) return 'Resting too long - fitness declining'
    if (tsb > 5) return 'Fresh and ready to race - peak performance zone'
    if (tsb > -10) return 'Neutral zone - maintaining fitness'
    if (tsb > -25) return 'Optimal training zone - building fitness'
    if (tsb > -40) return 'High fatigue - injury risk increasing'
    return 'Severe fatigue - rest needed immediately'
  }

  function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600)
    return `${h}h`
  }

  function formatDistance(meters: number): string {
    return `${Math.round(meters / 1000)}k`
  }

  async function openActivity(activity: CalendarActivity) {
    if (activity.source === 'completed') {
      // Open quick view modal for completed workouts
      await openWorkoutModal(activity.id)
    } else {
      // Open planned workout modal
      await openPlannedWorkoutModal(activity.id)
    }
  }

  async function openPlannedWorkoutModal(plannedWorkoutId: string) {
    try {
      const plannedWorkout = await $fetch(`/api/planned-workouts/${plannedWorkoutId}`)
      selectedPlannedWorkout.value = plannedWorkout
      showPlannedWorkoutModal.value = true
    } catch (error) {
      console.error('Error fetching planned workout:', error)
    }
  }

  async function openWorkoutModal(workoutId: string) {
    try {
      const workout = await $fetch(`/api/workouts/${workoutId}`)
      selectedWorkout.value = workout
      showWorkoutModal.value = true
    } catch (error) {
      console.error('Error fetching workout:', error)
    }
  }

  function handlePlannedWorkoutCompleted() {
    showPlannedWorkoutModal.value = false
    selectedPlannedWorkout.value = null
    refresh() // Refresh the activities list
  }

  function handlePlannedWorkoutDeleted() {
    showPlannedWorkoutModal.value = false
    selectedPlannedWorkout.value = null
    refresh() // Refresh the activities list
  }

  function handleWorkoutDeleted() {
    showWorkoutModal.value = false
    selectedWorkout.value = null
    refresh() // Refresh the activities list
  }

  function openWellnessModal(date: Date) {
    selectedWellnessDate.value = date
    showWellnessModal.value = true
  }

  function onMergeActivity({
    source,
    target
  }: {
    source: CalendarActivity
    target: CalendarActivity
  }) {
    // Only allow merging completed workouts for now
    if (source.source !== 'completed' || target.source !== 'completed') {
      return // Or show a toast saying can only merge completed workouts
    }

    mergeSource.value = source
    mergeTarget.value = target
    showMergeModal.value = true
  }

  function onLinkActivity({
    planned,
    completed
  }: {
    planned: CalendarActivity
    completed: CalendarActivity
  }) {
    linkPlanned.value = planned
    linkCompleted.value = completed
    showLinkModal.value = true
  }

  async function confirmLink() {
    if (!linkPlanned.value || !linkCompleted.value) return

    isLinking.value = true
    try {
      await $fetch(`/api/workouts/${linkCompleted.value.id}/link`, {
        method: 'POST',
        body: {
          plannedWorkoutId: linkPlanned.value.id
        }
      })

      // Refresh activities
      await refresh()

      showLinkModal.value = false
      linkPlanned.value = null
      linkCompleted.value = null

      const toast = useToast()
      toast.add({
        title: 'Workouts linked',
        description: 'The workout has been successfully linked to the planned activity.',
        color: 'success'
      })
    } catch (error: any) {
      console.error('Link failed:', error)
      const toast = useToast()
      toast.add({
        title: 'Link failed',
        description: error.data?.message || 'Could not link workouts.',
        color: 'error'
      })
    } finally {
      isLinking.value = false
    }
  }

  async function confirmMerge() {
    if (!mergeSource.value || !mergeTarget.value) return

    isMerging.value = true
    try {
      await $fetch('/api/workouts/merge', {
        method: 'POST',
        body: {
          primaryWorkoutId: mergeTarget.value.id,
          secondaryWorkoutId: mergeSource.value.id
        }
      })

      // Refresh activities
      await refresh()

      showMergeModal.value = false
      mergeSource.value = null
      mergeTarget.value = null

      const toast = useToast()
      toast.add({
        title: 'Workouts merged',
        description: 'The workouts have been successfully merged.',
        color: 'success'
      })
    } catch (error: any) {
      console.error('Merge failed:', error)
      const toast = useToast()
      toast.add({
        title: 'Merge failed',
        description: error.data?.message || 'Could not merge workouts.',
        color: 'error'
      })
    } finally {
      isMerging.value = false
    }
  }

  // List View Helpers
  const tableSearch = ref('')
  const table = useTemplateRef('table')

  const availableColumns = [
    { accessorKey: 'type', header: 'Type', id: 'type' },
    { accessorKey: 'date', header: 'Date', id: 'date' },
    { accessorKey: 'title', header: 'Name', id: 'title' },
    { accessorKey: 'duration', header: 'Duration', id: 'duration' },
    { accessorKey: 'distance', header: 'Distance', id: 'distance' },
    { accessorKey: 'averageHr', header: 'Avg HR', id: 'averageHr' },
    { accessorKey: 'intensity', header: 'Intensity', id: 'intensity' },
    { accessorKey: 'tss', header: 'TSS', id: 'tss' },
    { accessorKey: 'trainingLoad', header: 'Training Load', id: 'trainingLoad' },
    { accessorKey: 'trimp', header: 'TRIMP', id: 'trimp' },
    { accessorKey: 'rpe', header: 'RPE', id: 'rpe' },
    { accessorKey: 'sessionRpe', header: 'Session RPE', id: 'sessionRpe' },
    { accessorKey: 'feel', header: 'Feel', id: 'feel' },
    { accessorKey: 'averageWatts', header: 'Avg Power', id: 'averageWatts' },
    { accessorKey: 'normalizedPower', header: 'NP', id: 'normalizedPower' },
    { accessorKey: 'weightedAvgWatts', header: 'Weighted Power', id: 'weightedAvgWatts' },
    { accessorKey: 'kilojoules', header: 'kJ', id: 'kilojoules' },
    { accessorKey: 'calories', header: 'Calories', id: 'calories' },
    { accessorKey: 'elapsedTime', header: 'Elapsed Time', id: 'elapsedTime' },
    { accessorKey: 'deviceName', header: 'Device', id: 'deviceName' },
    { accessorKey: 'commute', header: 'Commute', id: 'commute' },
    { accessorKey: 'isPrivate', header: 'Private', id: 'isPrivate' },
    { accessorKey: 'gearId', header: 'Gear', id: 'gearId' },
    { accessorKey: 'source', header: 'Source', id: 'source' },
    { accessorKey: 'status', header: 'Status', id: 'status' }
  ]

  // Use column visibility state that persists in localStorage
  // Default: hide some of the more advanced columns
  const columnVisibility = useStorage<Record<string, boolean>>(
    'activities-list-columns-visibility',
    {
      trainingLoad: false,
      trimp: false,
      sessionRpe: false,
      feel: false,
      normalizedPower: false,
      weightedAvgWatts: false,
      kilojoules: false,
      calories: false,
      elapsedTime: false,
      deviceName: false,
      commute: false,
      isPrivate: false,
      gearId: false
    }
  )

  const columnMenuItems = computed(() => {
    return availableColumns.map((column) => ({
      label: column.header as string,
      type: 'checkbox' as const,
      checked: columnVisibility.value[column.id] !== false,
      onUpdateChecked(checked: boolean) {
        columnVisibility.value = {
          ...columnVisibility.value,
          [column.id]: checked
        }
      },
      onSelect(e: Event) {
        e.preventDefault()
      }
    }))
  })

  const sortedActivities = computed(() => {
    if (!activities.value) return []

    let result = [...activities.value].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )

    if (tableSearch.value) {
      const q = tableSearch.value.toLowerCase()
      result = result.filter(
        (a) =>
          (a.title || '').toLowerCase().includes(q) ||
          (a.type || '').toLowerCase().includes(q) ||
          (a.status || '').toLowerCase().includes(q)
      )
    }

    return result
  })

  function formatDateForList(dateStr: string) {
    try {
      const date = new Date(dateStr)
      return format(date, 'MMM dd, yyyy HH:mm')
    } catch {
      return dateStr
    }
  }

  function formatDateSafe(dateStr: string) {
    try {
      return format(new Date(dateStr), 'EEE dd MMM yyyy h:mm a')
    } catch {
      return dateStr
    }
  }

  function formatDurationCompact(seconds: number): string {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)

    if (h > 0) {
      return `${h}h ${m}m`
    }
    return `${m}m`
  }

  function getActivityIcon(type: string) {
    const t = (type || '').toLowerCase()
    if (t.includes('ride') || t.includes('cycle')) return 'i-heroicons-bolt'
    if (t.includes('run')) return 'i-heroicons-fire'
    if (t.includes('swim')) return 'i-heroicons-beaker'
    if (t.includes('weight') || t.includes('strength')) return 'i-heroicons-trophy'
    return 'i-heroicons-check-circle'
  }

  function formatDurationDetailed(seconds: number): string {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  function getWeekWorkoutIds(week: any[]): string[] {
    const ids: string[] = []
    week.forEach((day) => {
      day.activities.forEach((activity: CalendarActivity) => {
        if (activity.source === 'completed') {
          ids.push(activity.id)
        }
      })
    })
    return ids
  }

  function getWeekStreams(week: any[]): any[] {
    const ids = getWeekWorkoutIds(week)
    return ids.map((id) => streamsMap.value[id]).filter(Boolean)
  }

  function openWeekZoneDetail(week: any[]) {
    const summary = getWeekSummary(week)
    const completedActivities: CalendarActivity[] = []

    week.forEach((day) => {
      day.activities.forEach((activity: CalendarActivity) => {
        if (activity.source === 'completed') {
          completedActivities.push(activity)
        }
      })
    })

    selectedWeekData.value = {
      weekNumber: week[0] ? getWeekNumber(week[0].date) : 0,
      completedWorkouts: completedActivities.length,
      totalDuration: summary.duration || summary.plannedDuration,
      totalDistance: summary.distance,
      totalTSS: summary.tss || summary.plannedTss,
      workoutIds: getWeekWorkoutIds(week),
      activities: completedActivities
    }

    selectedWeekStreams.value = getWeekStreams(week)

    showWeekZoneModal.value = true
  }

  const unlinkedCompletedWorkouts = computed(() => {
    if (!activities.value) return []
    return activities.value.filter((a) => a.source === 'completed' && !a.plannedWorkoutId) // Assuming CalendarActivity has plannedWorkoutId if linked, or we can infer
  })

  const unlinkedPlannedWorkouts = computed(() => {
    if (!activities.value) return []
    return activities.value.filter((a) => a.source === 'planned' && a.status !== 'completed')
  })

  function onWorkoutsMatched() {
    refresh()
    // showMatcherModal.value = false // Optional: keep open to match more
  }

  async function handleRefresh() {
    await integrationStore.syncAllData()
    await refresh()
  }
</script>
