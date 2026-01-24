<template>
  <div class="space-y-3 sm:space-y-6">
    <!-- Header / Overview -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
      <div>
        <h2 class="text-2xl font-bold">{{ plan.goal?.title || plan.name || 'Untitled Plan' }}</h2>
        <div class="flex items-center gap-2 text-muted mt-1">
          <UIcon name="i-heroicons-calendar" class="w-4 h-4" />
          <span>Target: {{ formatDateUTC(plan.targetDate) }}</span>
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
            color="primary"
            variant="ghost"
            icon="i-heroicons-squares-plus"
            @click="showTimelineEditor = true"
          >
            <span class="hidden sm:inline">Edit Structure</span>
          </UButton>
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

    <!-- Plan Structure Editor Modal -->
    <UModal
      v-model:open="showTimelineEditor"
      title="Edit Plan Structure"
      :ui="{ width: 'sm:max-w-2xl' }"
    >
      <template #body>
        <div class="p-4 sm:p-6">
          <PlanTimelineEditor
            :plan-id="plan.id"
            :blocks="plan.blocks"
            :start-date="plan.startDate"
            @save="onStructureSaved"
            @cancel="showTimelineEditor = false"
          />
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
          ? `Week ${selectedWeek.weekNumber}: ${formatDateUTC(selectedWeek.startDate, 'MMM d')} - ${formatDateUTC(selectedWeek.endDate, 'MMM d')}`
          : undefined
      "
      :start-date="selectedWeek?.startDate"
      :end-date="selectedWeek?.endDate"
      @generate="generatePlanWithAI"
    />

    <!-- Plan Timeline (Proportional) -->
    <div class="space-y-2">
      <div class="flex justify-between items-end px-1">
        <h3 class="text-xs font-bold uppercase tracking-widest text-muted">Season Timeline</h3>
        <div class="text-[10px] text-muted font-mono">{{ totalWeeksInPlan }} Weeks Total</div>
      </div>

      <div
        class="relative w-full h-14 bg-gray-100/50 dark:bg-gray-900/50 rounded-xl overflow-hidden flex shadow-inner border border-gray-200 dark:border-gray-800"
      >
        <div
          v-for="block in plan.blocks"
          :key="block.id"
          class="h-full relative border-r last:border-r-0 border-gray-200/50 dark:border-gray-800/50 transition-all cursor-pointer group bg-white/40 dark:bg-gray-800/20 hover:bg-white/60 dark:hover:bg-gray-800/40"
          :style="{ flex: block.durationWeeks }"
          :class="[selectedBlockId === block.id ? 'z-10' : '']"
          @click="selectedBlockId = block.id"
        >
          <!-- Label -->
          <div
            class="absolute inset-0 flex flex-col items-center justify-center p-1 text-center pointer-events-none pb-2"
          >
            <span
              class="text-[10px] sm:text-xs font-black uppercase tracking-tight truncate w-full px-1"
              :class="
                selectedBlockId === block.id
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-gray-600 dark:text-gray-400'
              "
            >
              {{ block.name.split(' ')[0] }}
            </span>
            <span
              class="text-[8px] sm:text-[9px] font-bold text-gray-400 dark:text-gray-500 tabular-nums"
            >
              {{ block.durationWeeks }} WEEKS
            </span>
          </div>

          <!-- Bottom Accent Bar -->
          <div
            class="absolute bottom-0 left-0 right-0 transition-all duration-300"
            :style="{
              backgroundColor: getBlockTypeColor(block.type),
              height: selectedBlockId === block.id ? '6px' : '4px'
            }"
            :class="
              selectedBlockId === block.id ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'
            "
          />

          <!-- Selection Glow -->
          <div
            v-if="selectedBlockId === block.id"
            class="absolute inset-0 ring-2 ring-inset ring-primary-500/20 pointer-events-none"
          />
        </div>

        <!-- Event Markers -->
        <template v-for="event in eventMarkers" :key="event.id">
          <UTooltip :text="`${event.title} (${formatDateUTC(event.date, 'MMM d')})`">
            <div
              class="absolute top-0 bottom-0 w-0.5 bg-white/60 dark:bg-white/40 z-20 pointer-events-auto"
              :style="{ left: `${event.position}%` }"
            >
              <div
                class="absolute -bottom-1 -left-1 w-2 h-2 bg-white rounded-full border border-gray-400"
              />
            </div>
          </UTooltip>
        </template>

        <!-- "Now" indicator overlay -->
        <div
          v-if="currentBlockPosition !== null"
          class="absolute top-0 bottom-0 w-1 bg-primary-500 z-20 shadow-[0_0_10px_rgba(0,220,130,0.5)]"
          :style="{ left: `${currentBlockPosition}%` }"
        >
          <div
            class="absolute -top-1 -left-1 w-3 h-3 bg-primary-500 rounded-full border-2 border-white dark:border-gray-900"
          />
          <div
            class="absolute -top-5 left-1/2 -translate-x-1/2 bg-primary-600 text-[8px] text-white px-1.5 py-0.5 rounded-full shadow-sm font-bold uppercase tracking-wider whitespace-nowrap"
          >
            Now
          </div>
        </div>
      </div>
    </div>

    <!-- Active Week View -->
    <div
      v-if="selectedBlock"
      class="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700"
    >
      <!-- Header -->
      <div
        class="p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4"
      >
        <h3 class="font-semibold text-lg">{{ selectedBlock.name }} - Overview</h3>

        <div v-if="selectedBlock.weeks?.length > 0" class="flex flex-wrap gap-2 w-full sm:w-auto">
          <UTooltip text="Show independent workouts not part of this plan">
            <UButton
              :icon="showIndependentWorkouts ? 'i-heroicons-eye' : 'i-heroicons-eye-slash'"
              :color="showIndependentWorkouts ? 'primary' : 'neutral'"
              variant="ghost"
              size="xs"
              :loading="fetchingIndependent"
              @click="showIndependentWorkouts = !showIndependentWorkouts"
            />
          </UTooltip>
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
        <!-- 1. Case: Block has NO weeks (Failure or corrupted state) -->
        <div
          v-if="!selectedBlock.weeks || selectedBlock.weeks.length === 0"
          class="py-12 text-center space-y-4"
        >
          <div
            class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-500 mb-2"
          >
            <UIcon name="i-heroicons-exclamation-circle" class="w-10 h-10" />
          </div>
          <div>
            <h4 class="text-lg font-bold text-gray-900 dark:text-white">Empty Phase</h4>
            <p class="text-sm text-muted max-w-xs mx-auto mt-1">
              This phase hasn't been initialized yet. Would you like the AI to design the weekly
              structure?
            </p>
          </div>
          <UButton
            size="lg"
            color="primary"
            icon="i-heroicons-sparkles"
            :loading="generatingWorkouts"
            @click="generateWorkoutsForBlock"
          >
            Initialize Phase Structure
          </UButton>
        </div>

        <!-- 2. Case: Block has weeks, show Active Week -->
        <div v-else-if="selectedWeek" class="space-y-3 sm:space-y-4">
          <!-- Week Stats (Interactive Tuning) -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-3 sm:mb-4">
            <!-- 1. Focus Tuning -->
            <UPopover :ui="{ content: 'w-64 p-4' }">
              <div
                class="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg cursor-pointer hover:ring-1 hover:ring-primary-500/50 transition-all group"
              >
                <div class="flex justify-between items-center mb-0.5">
                  <div class="text-[10px] uppercase font-bold text-muted tracking-wider">Focus</div>
                  <UIcon
                    name="i-heroicons-pencil"
                    class="w-3 h-3 text-primary-500 opacity-0 group-hover:opacity-100"
                  />
                </div>
                <div class="font-bold text-sm sm:text-base truncate">
                  {{ selectedWeek.focusLabel || selectedWeek.focus || selectedBlock.primaryFocus }}
                </div>
              </div>

              <template #content>
                <div class="space-y-3">
                  <div class="font-bold text-xs uppercase tracking-widest text-muted">
                    Change Week Focus
                  </div>
                  <USelect
                    :model-value="selectedWeek.focusKey || selectedWeek.focus"
                    :items="TRAINING_BLOCK_FOCUSES"
                    value-key="value"
                    size="sm"
                    class="w-full"
                    @update:model-value="updateWeekFocus"
                  />
                  <p class="text-[10px] italic text-muted leading-tight">
                    Changing the focus will help the AI design better workouts when you next "Plan
                    with AI".
                  </p>
                </div>
              </template>
            </UPopover>

            <!-- 2. Volume Tuning -->
            <UPopover :ui="{ content: 'w-48 p-4' }">
              <div
                class="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg cursor-pointer hover:ring-1 hover:ring-primary-500/50 transition-all group"
              >
                <div class="flex justify-between items-center mb-0.5">
                  <div class="text-[10px] uppercase font-bold text-muted tracking-wider">
                    Volume
                  </div>
                  <UIcon
                    name="i-heroicons-pencil"
                    class="w-3 h-3 text-primary-500 opacity-0 group-hover:opacity-100"
                  />
                </div>
                <div class="font-bold text-sm sm:text-base tabular-nums">
                  {{ Math.round((selectedWeek.volumeTargetMinutes / 60) * 10) / 10 }}h
                </div>
              </div>

              <template #content>
                <div class="space-y-3">
                  <div class="font-bold text-xs uppercase tracking-widest text-muted">
                    Target Hours
                  </div>
                  <div class="flex items-center gap-2">
                    <UInput
                      :model-value="Math.round((selectedWeek.volumeTargetMinutes / 60) * 10) / 10"
                      type="number"
                      step="0.5"
                      min="0"
                      size="sm"
                      class="flex-1"
                      @update:model-value="(v) => updateWeekVolume(Number(v))"
                    />
                    <span class="text-xs font-bold text-muted">HRS</span>
                  </div>
                </div>
              </template>
            </UPopover>

            <!-- 3. TSS Tuning -->
            <UPopover :ui="{ content: 'w-48 p-4' }">
              <div
                class="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg cursor-pointer hover:ring-1 hover:ring-primary-500/50 transition-all group"
              >
                <div class="flex justify-between items-center mb-0.5">
                  <div class="text-[10px] uppercase font-bold text-muted tracking-wider">TSS</div>
                  <UIcon
                    name="i-heroicons-pencil"
                    class="w-3 h-3 text-primary-500 opacity-0 group-hover:opacity-100"
                  />
                </div>
                <div class="font-bold text-sm sm:text-base tabular-nums">
                  {{ selectedWeek.tssTarget }}
                </div>
              </div>

              <template #content>
                <div class="space-y-3">
                  <div class="font-bold text-xs uppercase tracking-widest text-muted">
                    Target TSS
                  </div>
                  <UInput
                    :model-value="selectedWeek.tssTarget"
                    type="number"
                    min="0"
                    size="sm"
                    class="w-full"
                    @update:model-value="(v) => updateWeekTss(Number(v))"
                  />
                </div>
              </template>
            </UPopover>

            <!-- 4. Type Tuning -->
            <div
              class="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg cursor-pointer hover:ring-1 hover:ring-primary-500/50 transition-all group select-none"
              @click="toggleWeekRecovery"
            >
              <div class="flex justify-between items-center mb-0.5">
                <div class="text-[10px] uppercase font-bold text-muted tracking-wider">Type</div>
                <UIcon
                  name="i-heroicons-arrows-right-left"
                  class="w-3 h-3 text-primary-500 opacity-0 group-hover:opacity-100"
                />
              </div>
              <div
                class="font-bold text-sm sm:text-base"
                :class="
                  selectedWeek.isRecovery
                    ? 'text-green-500'
                    : 'text-primary-600 dark:text-primary-400'
                "
              >
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
                        v-if="visibleWorkouts.some((w: any) => !w.structuredWorkout)"
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
                  v-for="workout in visibleWorkouts"
                  :key="workout.id"
                  class="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors group"
                  draggable="true"
                  :class="{
                    'opacity-50': draggingId === workout.id,
                    'bg-independent-stripes': workout.isIndependent
                  }"
                  @dragstart="onDragStart($event, workout)"
                  @dragover.prevent
                  @drop="onDrop($event, workout)"
                  @click="navigateToWorkout(workout.id)"
                >
                  <td class="pl-2 text-center cursor-move text-gray-300 group-hover:text-gray-500">
                    <UTooltip v-if="workout.isIndependent" text="Link to Plan">
                      <UButton
                        :icon="
                          hoveredLinkId === workout.id
                            ? 'i-heroicons-link'
                            : 'i-heroicons-link-slash'
                        "
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        @mouseenter="hoveredLinkId = workout.id"
                        @mouseleave="hoveredLinkId = null"
                        @click.stop="linkWorkout(workout)"
                      />
                    </UTooltip>
                    <UTooltip v-else text="Unlink from Plan">
                      <UButton
                        :icon="
                          hoveredLinkId === workout.id
                            ? 'i-heroicons-link-slash'
                            : 'i-heroicons-link'
                        "
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        @mouseenter="hoveredLinkId = workout.id"
                        @mouseleave="hoveredLinkId = null"
                        @click.stop="unlinkWorkout(workout)"
                      />
                    </UTooltip>
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
                        variant="ghost"
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
              v-for="workout in visibleWorkouts"
              :key="workout.id"
              class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 flex items-center gap-2.5 cursor-pointer active:bg-gray-50 dark:active:bg-gray-700 w-full"
              :class="{ 'bg-independent-stripes border-dashed': workout.isIndependent }"
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
                    <UButton
                      v-if="workout.isIndependent"
                      icon="i-heroicons-link-slash"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      @click.stop="linkWorkout(workout)"
                    />
                    <UButton
                      v-else
                      icon="i-heroicons-link"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      @click.stop="unlinkWorkout(workout)"
                    />
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
                      variant="ghost"
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
        :workouts="visibleWorkouts"
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
  import PlanTimelineEditor from '~/components/plans/PlanTimelineEditor.vue'
  import { TRAINING_BLOCK_FOCUSES } from '~/utils/training-constants'
  import {
    getWorkoutIcon,
    getWorkoutColorClass as getIconColorClass,
    getWorkoutBorderColorClass as getSportColorClass
  } from '~/utils/activity-types'

  const { formatDate, formatDateUTC, getUserLocalDate, timezone } = useFormat()

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
  const showTimelineEditor = ref(false)
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
  const hoveredLinkId = ref<string | null>(null)
  const publishingId = ref<string | null>(null)
  const toast = useToast()

  // Independent Workouts Logic
  const showIndependentWorkouts = ref(true)
  const independentWorkouts = ref<any[]>([])
  const fetchingIndependent = ref(false)

  function onStructureSaved() {
    console.log('[Dashboard] Structure saved, refreshing plan')
    showTimelineEditor.value = false
    emit('refresh')
  }

  // Week Tuning Methods
  async function updateWeekFocus(value: string) {
    if (!selectedWeek.value) return
    const focus = TRAINING_BLOCK_FOCUSES.find((f) => f.value === value)
    if (!focus) return

    try {
      console.log('[Dashboard] Updating week focus', {
        weekId: selectedWeek.value.id,
        focus: value
      })
      await $fetch(`/api/plans/weeks/${selectedWeek.value.id}`, {
        method: 'PATCH',
        body: {
          focusKey: focus.value,
          focusLabel: focus.label,
          isRecovery: focus.value === 'RECOVERY'
        }
      })
      emit('refresh')
      toast.add({ title: 'Week focus updated', color: 'success' })
    } catch (e) {
      console.error('[Dashboard] Failed to update week focus', e)
      toast.add({ title: 'Failed to update focus', color: 'error' })
    }
  }

  async function updateWeekVolume(hours: number) {
    if (!selectedWeek.value) return
    try {
      console.log('[Dashboard] Updating week volume', { weekId: selectedWeek.value.id, hours })
      await $fetch(`/api/plans/weeks/${selectedWeek.value.id}`, {
        method: 'PATCH',
        body: { volumeTargetMinutes: Math.round(hours * 60) }
      })
      emit('refresh')
      toast.add({ title: 'Volume target updated', color: 'success' })
    } catch (e) {
      console.error('[Dashboard] Failed to update volume', e)
      toast.add({ title: 'Failed to update volume', color: 'error' })
    }
  }

  async function updateWeekTss(tss: number) {
    if (!selectedWeek.value) return
    try {
      console.log('[Dashboard] Updating week TSS', { weekId: selectedWeek.value.id, tss })
      await $fetch(`/api/plans/weeks/${selectedWeek.value.id}`, {
        method: 'PATCH',
        body: { tssTarget: tss }
      })
      emit('refresh')
      toast.add({ title: 'TSS target updated', color: 'success' })
    } catch (e) {
      console.error('[Dashboard] Failed to update TSS', e)
      toast.add({ title: 'Failed to update TSS', color: 'error' })
    }
  }

  async function toggleWeekRecovery() {
    if (!selectedWeek.value) return
    try {
      const newState = !selectedWeek.value.isRecovery
      console.log('[Dashboard] Toggling week recovery state', {
        weekId: selectedWeek.value.id,
        isRecovery: newState
      })
      await $fetch(`/api/plans/weeks/${selectedWeek.value.id}`, {
        method: 'PATCH',
        body: { isRecovery: newState }
      })
      emit('refresh')
      toast.add({
        title: `Week set to ${newState ? 'Recovery' : 'Training'}`,
        color: 'success'
      })
    } catch (e) {
      console.error('[Dashboard] Failed to toggle recovery state', e)
      toast.add({ title: 'Failed to update week type', color: 'error' })
    }
  }

  watch([showIndependentWorkouts, selectedWeekId], async ([show, weekId]) => {
    if (show && weekId && selectedWeek.value) {
      console.log('[Dashboard] Fetching independent workouts for week', { weekId })
      fetchingIndependent.value = true
      try {
        const workouts = await $fetch('/api/planned-workouts', {
          query: {
            startDate: selectedWeek.value.startDate,
            endDate: selectedWeek.value.endDate,
            independentOnly: true,
            limit: 50
          }
        })
        independentWorkouts.value = workouts
      } catch (e) {
        console.error('[Dashboard] Failed to fetch independent workouts', e)
      } finally {
        fetchingIndependent.value = false
      }
    } else {
      independentWorkouts.value = []
    }
  })

  const visibleWorkouts = computed(() => {
    if (!selectedWeek.value) return []
    const baseWorkouts = selectedWeek.value.workouts || []

    if (!showIndependentWorkouts.value) return baseWorkouts

    const baseIds = new Set(baseWorkouts.map((w: any) => w.id))

    const extras = independentWorkouts.value
      .filter((w: any) => !baseIds.has(w.id))
      .map((w: any) => ({
        ...w,
        isIndependent: true,
        syncStatus: w.syncStatus || 'LOCAL_ONLY'
      }))

    const allVisible = [...baseWorkouts, ...extras].sort(
      (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )
    console.log('[Dashboard] visibleWorkouts computed', {
      total: allVisible.length,
      planWorkouts: baseWorkouts.length,
      independent: extras.length
    })
    return allVisible
  })

  // Background Task Monitoring
  const { refresh: refreshRuns } = useUserRuns()
  const { onTaskCompleted } = useUserRunsState()

  // Listeners
  onTaskCompleted('generate-training-block', async (run) => {
    console.log('[Dashboard] Task generate-training-block completed', {
      runId: run.id,
      status: run.status
    })
    emit('refresh')
    generatingWorkouts.value = false
    generatingBlockId.value = null
    toast.add({ title: 'Block Generated', color: 'success' })

    // Wait for refresh to propagate, then trigger structure generation if needed
    nextTick(() => {
      if (selectedBlockId.value) {
        console.log('[Dashboard] Auto-triggering structure generation after block refresh')
        generateAllStructureForWeek()
      }
    })
  })

  onTaskCompleted('generate-structured-workout', async (run) => {
    console.log('[Dashboard] Task generate-structured-workout completed', { runId: run.id })
    emit('refresh')
    generatingStructureForWorkoutId.value = null
  })

  onTaskCompleted('adapt-training-plan', async (run) => {
    console.log('[Dashboard] Task adapt-training-plan completed', { runId: run.id })
    emit('refresh')
    adapting.value = null
    toast.add({
      title: 'Adaptation Complete',
      description: 'Your plan has been updated.',
      color: 'success'
    })
  })

  onTaskCompleted('generate-weekly-plan', async (run) => {
    console.log('[Dashboard] Task generate-weekly-plan completed', { runId: run.id })
    emit('refresh')
    generatingWorkouts.value = false
    toast.add({ title: 'Plan Updated', description: 'Check the new schedule.', color: 'info' })
  })

  // Computed
  const currentBlock = computed(() => {
    // Find block encompassing "today" in user's timezone
    const today = getUserLocalDate()
    const todayTime = today.getTime()

    const found =
      props.plan.blocks.find((b: any) => {
        const start = new Date(b.startDate).getTime()
        const end = start + b.durationWeeks * 7 * 24 * 3600 * 1000 - 1
        return todayTime >= start && todayTime <= end
      }) || props.plan.blocks[0]

    console.log('[Dashboard] currentBlock computed', { name: found?.name, id: found?.id })
    return found
  })

  const selectedBlock = computed(() => {
    const block = props.plan.blocks.find((b: any) => b.id === selectedBlockId.value)
    console.log('[Dashboard] selectedBlock computed', {
      id: selectedBlockId.value,
      name: block?.name,
      weeksCount: block?.weeks?.length
    })
    return block
  })

  const selectedWeek = computed(() => {
    const week = selectedBlock.value?.weeks.find((w: any) => w.id === selectedWeekId.value)
    console.log('[Dashboard] selectedWeek computed', {
      id: selectedWeekId.value,
      weekNumber: week?.weekNumber,
      hasWorkouts: !!week?.workouts?.length
    })
    return week
  })

  const totalWeeksInPlan = computed(() => {
    return props.plan.blocks.reduce((acc: number, b: any) => acc + b.durationWeeks, 0)
  })

  const currentBlockPosition = computed(() => {
    if (!props.plan.blocks.length) return null

    // Find how many weeks from start to current block
    const today = getUserLocalDate()
    const todayTime = today.getTime()

    let weeksAccumulated = 0
    let found = false

    for (const b of props.plan.blocks) {
      const start = new Date(b.startDate).getTime()
      const end = start + b.durationWeeks * 7 * 24 * 3600 * 1000 - 1

      if (todayTime >= start && todayTime <= end) {
        // We are in this block. Find exact week within block
        const diffDays = Math.max(0, Math.floor((todayTime - start) / (1000 * 3600 * 24)))
        const weekOffset = Math.min(b.durationWeeks - 1, Math.floor(diffDays / 7))
        weeksAccumulated += weekOffset + 0.5 // Place it in middle of current week
        found = true
        break
      }

      if (todayTime < start) {
        // We haven't reached this block yet (future)
        break
      }

      weeksAccumulated += b.durationWeeks
    }

    return found ? (weeksAccumulated / totalWeeksInPlan.value) * 100 : null
  })

  const eventMarkers = computed(() => {
    if (!props.plan.goal?.events?.length || !props.plan.startDate) return []

    const planStart = new Date(props.plan.startDate).getTime()
    const planEnd = planStart + totalWeeksInPlan.value * 7 * 24 * 3600 * 1000

    return props.plan.goal.events
      .map((event: any) => {
        const eventTime = new Date(event.date).getTime()
        if (eventTime < planStart || eventTime > planEnd) return null

        const position = ((eventTime - planStart) / (planEnd - planStart)) * 100
        return {
          ...event,
          position
        }
      })
      .filter(Boolean)
  })

  // Helpers
  function formatDay(d: string) {
    return formatDateUTC(d, 'EEE, MMM d')
  }

  function getBlockTypeColor(type: string) {
    const colors: Record<string, string> = {
      PREP: 'rgb(148, 163, 184)', // Slate 400
      BASE: 'rgb(59, 130, 246)', // Blue
      BUILD: 'rgb(245, 158, 11)', // Amber
      PEAK: 'rgb(239, 68, 68)', // Red
      RACE: 'rgb(168, 85, 247)', // Purple
      TRANSITION: 'rgb(16, 185, 129)' // Green
    }
    return colors[type] || 'rgb(0, 220, 130)' // Brand Green
  }

  function isLocalWorkout(workout: any) {
    return (
      workout.syncStatus === 'LOCAL_ONLY' ||
      (workout.externalId &&
        (workout.externalId.startsWith('ai_gen_') || workout.externalId.startsWith('ai-gen-')))
    )
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

    // Find source in either list
    let sourceWorkout = selectedWeek.value.workouts.find((w: any) => w.id === sourceId)
    if (!sourceWorkout) {
      sourceWorkout = independentWorkouts.value.find((w: any) => w.id === sourceId)
    }

    if (!sourceWorkout) return

    // Optimistic Swap Dates
    const sourceDate = sourceWorkout.date
    const targetDate = targetWorkout.date

    // Swap in UI (mutating reactive objects)
    sourceWorkout.date = targetDate
    targetWorkout.date = sourceDate

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
      toast.add({ title: 'Failed to move', color: 'error' })
    }
  }

  async function linkWorkout(workout: any) {
    if (!selectedWeek.value?.id) return
    try {
      console.log('[Dashboard] Linking workout to week', {
        workoutId: workout.id,
        weekId: selectedWeek.value.id
      })
      await $fetch(`/api/workouts/planned/${workout.id}/link`, {
        method: 'POST',
        body: { trainingWeekId: selectedWeek.value.id }
      })

      // Optimistically remove from independent list
      independentWorkouts.value = independentWorkouts.value.filter((w) => w.id !== workout.id)

      emit('refresh')
      toast.add({ title: 'Workout Linked', color: 'success' })
    } catch (e) {
      console.error('[Dashboard] Link failed', e)
      toast.add({ title: 'Failed to link', color: 'error' })
    }
  }

  async function unlinkWorkout(workout: any) {
    try {
      console.log('[Dashboard] Unlinking workout', { workoutId: workout.id })
      await $fetch(`/api/workouts/planned/${workout.id}/unlink`, {
        method: 'POST'
      })

      // Optimistically add to independent list if showing
      if (showIndependentWorkouts.value) {
        if (!independentWorkouts.value.some((w) => w.id === workout.id)) {
          independentWorkouts.value.push({ ...workout })
        }
      }

      emit('refresh')
      toast.add({ title: 'Workout Unlinked', color: 'success' })
    } catch (e) {
      console.error('[Dashboard] Unlink failed', e)
      toast.add({ title: 'Failed to unlink', color: 'error' })
    }
  }

  async function generateWorkoutsForBlock() {
    if (!selectedBlockId.value) return

    const blockId = selectedBlockId.value
    console.log('[Dashboard] Starting generateWorkoutsForBlock', { blockId })
    generatingWorkouts.value = true
    generatingBlockId.value = blockId

    try {
      const response: any = await $fetch('/api/plans/generate-block', {
        method: 'POST',
        body: { blockId }
      })
      console.log('[Dashboard] API response for generate-block', response)
      refreshRuns()

      toast.add({
        title: 'Generation Started',
        description: 'AI is designing your training block. Please wait...',
        color: 'info'
      })
    } catch (error: any) {
      console.error('[Dashboard] API error for generate-block', error)
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
      console.log('[Dashboard] Generating structure for workout', { workoutId })
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
      console.error('[Dashboard] Structure generation failed', error)
      toast.add({
        title: 'Generation Failed',
        description: error.data?.message || 'Failed to generate structure',
        color: 'error'
      })
      generatingStructureForWorkoutId.value = null
    }
  }

  async function generateAllStructureForWeek() {
    if (!visibleWorkouts.value.length) return

    // Find workouts without structure
    const pendingWorkouts = visibleWorkouts.value.filter((w: any) => !w.structuredWorkout)
    console.log('[Dashboard] generateAllStructureForWeek', { count: pendingWorkouts.length })

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
      generatingAllStructures.value = false
    }
  }

  async function adaptPlan(type: string) {
    adapting.value = type
    try {
      console.log('[Dashboard] Adapting plan', { type })
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
      console.error('[Dashboard] Adaptation failed', error)
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
      console.log('[Dashboard] Abandoning plan', { id: props.plan.id })
      await $fetch(`/api/plans/${props.plan.id}/abandon`, { method: 'POST' })
      toast.add({ title: 'Plan Abandoned', color: 'success' })
      emit('refresh')
      showAbandonModal.value = false
    } catch (error: any) {
      console.error('[Dashboard] Abandon failed', error)
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
      console.log('[Dashboard] Saving plan as template', {
        id: props.plan.id,
        name: templateName.value
      })
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
      console.error('[Dashboard] Save template failed', error)
      toast.add({ title: 'Failed to save template', description: error.message, color: 'error' })
    } finally {
      savingTemplate.value = false
    }
  }

  async function generatePlanWithAI(instructions: string, anchorWorkoutIds?: string[]) {
    if (!selectedBlockId.value || !selectedWeekId.value) return

    showAIPlanModal.value = false
    generatingWorkouts.value = true

    try {
      console.log('[Dashboard] Starting generate-ai-week', { weekId: selectedWeekId.value })
      await $fetch('/api/plans/generate-ai-week', {
        method: 'POST',
        body: {
          blockId: selectedBlockId.value,
          weekId: selectedWeekId.value,
          instructions,
          anchorWorkoutIds
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
      console.error('[Dashboard] AI planning failed', error)
      toast.add({
        title: 'Generation Failed',
        description: error.data?.message || 'Failed to start AI planning',
        color: 'error'
      })
      generatingWorkouts.value = false
    }
  }

  async function publishWorkout(workout: any) {
    if (!workout.id) return
    publishingId.value = workout.id
    try {
      console.log('[Dashboard] Publishing workout to Intervals.icu', { id: workout.id })
      const response: any = await $fetch(`/api/workouts/planned/${workout.id}/publish`, {
        method: 'POST'
      })
      if (response.success && response.workout) {
        workout.syncStatus = response.workout.syncStatus
        workout.externalId = response.workout.externalId
        workout.lastSyncedAt = response.workout.lastSyncedAt
        toast.add({
          title: isLocalWorkout(workout) ? 'Published' : 'Updated',
          description: response.message || 'Workout synced with Intervals.icu.',
          color: 'success'
        })
      }
    } catch (error: any) {
      console.error('[Dashboard] Publish failed', error)
      toast.add({
        title: 'Sync Failed',
        description: error.data?.message || 'Failed to sync workout with Intervals.icu',
        color: 'error'
      })
    } finally {
      publishingId.value = null
    }
  }

  // Watchers to auto-select defaults
  watch(
    () => props.plan,
    (newPlan) => {
      console.log('[Dashboard] plan watcher triggered', {
        hasPlan: !!newPlan,
        blocksCount: newPlan?.blocks?.length
      })
      if (newPlan && newPlan.blocks.length > 0) {
        const currentBlockObj = newPlan.blocks.find((b: any) => b.id === selectedBlockId.value)

        if (currentBlockObj) {
          const weekExists = currentBlockObj.weeks.some((w: any) => w.id === selectedWeekId.value)
          if (!weekExists && currentBlockObj.weeks.length > 0) {
            const today = getUserLocalDate()
            const todayTime = today.getTime()
            const activeWeek = currentBlockObj.weeks.find((w: any) => {
              const start = new Date(w.startDate).getTime()
              const end = new Date(w.endDate).getTime()
              return todayTime >= start && todayTime <= end
            })
            selectedWeekId.value = activeWeek ? activeWeek.id : currentBlockObj.weeks[0].id
            console.log('[Dashboard] selectedWeekId updated (recovery)', {
              id: selectedWeekId.value
            })
          }
          return
        }

        const today = getUserLocalDate()
        const todayTime = today.getTime()
        const getBlockRange = (b: any) => {
          const start = new Date(b.startDate).getTime()
          const end = start + b.durationWeeks * 7 * 24 * 3600 * 1000 - 1
          return { start, end }
        }

        let targetBlock = newPlan.blocks[0]
        const activeBlock = newPlan.blocks.find((b: any) => {
          const { start, end } = getBlockRange(b)
          return todayTime >= start && todayTime <= end
        })

        if (activeBlock) {
          targetBlock = activeBlock
        } else {
          const firstBlock = newPlan.blocks[0]
          const lastBlock = newPlan.blocks[newPlan.blocks.length - 1]
          const { end: lastEnd } = getBlockRange(lastBlock)
          if (todayTime > lastEnd) {
            targetBlock = lastBlock
          } else {
            targetBlock =
              newPlan.blocks.find((b: any) => {
                const { end } = getBlockRange(b)
                return end >= todayTime
              }) || lastBlock
          }
        }

        selectedBlockId.value = targetBlock.id
        console.log('[Dashboard] selectedBlockId initial set', { id: selectedBlockId.value })

        if (targetBlock.weeks.length > 0) {
          const currentWeek = targetBlock.weeks.find((w: any) => {
            const start = new Date(w.startDate).getTime()
            const end = new Date(w.endDate).getTime()
            return todayTime >= start && todayTime <= end
          })

          if (currentWeek) {
            selectedWeekId.value = currentWeek.id
          } else {
            const lastWeek = targetBlock.weeks[targetBlock.weeks.length - 1]
            const endLast = new Date(lastWeek.endDate).getTime()
            selectedWeekId.value = todayTime > endLast ? lastWeek.id : targetBlock.weeks[0].id
          }
          console.log('[Dashboard] selectedWeekId initial set', { id: selectedWeekId.value })
        }

        if (props.shouldAutoGenerate) {
          nextTick(() => {
            generateAllStructureForWeek()
            emit('generation-started')
          })
        }
      }
    },
    { immediate: true }
  )

  watch(selectedBlockId, (newId) => {
    if (newId) {
      console.log('[Dashboard] block manually changed', { newId })
      const block = props.plan.blocks.find((b: any) => b.id === newId)
      if (block && block.weeks.length > 0) {
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
          console.log('[Dashboard] week reset due to block change', { id: selectedWeekId.value })
        }
      }
    }
  })
</script>
