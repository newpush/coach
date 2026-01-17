<template>
  <div
    class="min-h-[120px] p-2 bg-white dark:bg-gray-900 transition-colors flex flex-col relative"
    :class="{
      'opacity-50': isOtherMonth,
      'bg-blue-50 dark:bg-blue-900/20 z-10 shadow-md': isToday,
      'bg-gray-100 dark:bg-gray-800 ring-2 ring-primary-500 ring-inset': isDayDragOver
    }"
    @dragover.prevent="onDayDragOver"
    @dragenter.prevent="onDayDragEnter"
    @dragleave="onDayDragLeave"
    @drop="onDayDrop"
  >
    <!-- Date Number & Wellness Metrics -->
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-2">
        <span
          class="text-xs font-semibold flex items-center justify-center"
          :class="{
            'bg-blue-500 text-white dark:bg-blue-400 dark:text-gray-900 px-2 py-0.5 rounded-full shadow-sm':
              isToday,
            'text-gray-400': isOtherMonth,
            'text-gray-900 dark:text-gray-100': !isOtherMonth && !isToday
          }"
        >
          {{ dayNumber }}
        </span>

        <!-- Wellness Metrics -->
        <button
          v-if="dayWellness"
          class="flex items-center gap-1.5 text-[10px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors cursor-pointer"
          :title="'View wellness details'"
          @click="$emit('wellness-click', date)"
        >
          <span v-if="dayWellness.hrv != null" class="flex items-center gap-0.5">
            <UIcon name="i-heroicons-heart" class="w-2.5 h-2.5" />
            <span class="font-medium">{{ Math.round(dayWellness.hrv) }}</span>
          </span>
          <span v-if="dayWellness.hoursSlept != null" class="flex items-center gap-0.5">
            <UIcon name="i-heroicons-moon" class="w-2.5 h-2.5" />
            <span class="font-medium">{{ dayWellness.hoursSlept.toFixed(1) }}</span>
          </span>
          <span v-if="dayWellness.restingHr != null" class="flex items-center gap-0.5">
            <UIcon name="i-heroicons-heart-20-solid" class="w-2.5 h-2.5" />
            <span class="font-medium">{{ dayWellness.restingHr }}</span>
          </span>
          <span v-if="dayWellness.weight != null" class="flex items-center gap-0.5">
            <UIcon name="i-heroicons-scale" class="w-2.5 h-2.5" />
            <span class="font-medium">{{ dayWellness.weight.toFixed(2) }}</span>
          </span>
        </button>
      </div>
    </div>

    <!-- Activities (flex-1 to push nutrition to bottom) -->
    <div class="space-y-1 flex-1">
      <button
        v-for="activity in activities"
        :key="activity.id"
        class="w-full text-left px-2 py-1 rounded text-xs hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group relative cursor-pointer overflow-hidden"
        :class="{
          'bg-green-50 dark:bg-green-900/20':
            activity.source === 'completed' && !activity.plannedWorkoutId,
          'bg-blue-50 dark:bg-blue-900/20':
            activity.source === 'completed' && activity.plannedWorkoutId,
          'bg-amber-50 dark:bg-amber-900/20':
            activity.source === 'planned' && activity.status === 'planned',
          'bg-red-50 dark:bg-red-900/20': activity.status === 'missed',
          'bg-gray-50 dark:bg-gray-800/50 border-dashed border-gray-300 dark:border-gray-700':
            activity.source === 'note',
          'ring-2 ring-primary-500 ring-offset-1': isDragOver === activity.id
        }"
        @click="$emit('activity-click', activity)"
        @dragover.prevent="onDragOver"
        @dragleave="onDragLeave"
        @drop.stop="(e) => onDrop(e, activity)"
      >
        <!-- Drag Handle -->
        <div
          v-if="
            activity.source === 'completed' ||
            (activity.source === 'planned' && activity.status !== 'completed')
          "
          class="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing z-10 hover:bg-black/5 rounded-bl"
          :draggable="true"
          @dragstart.stop="(e) => onDragStart(e, activity)"
          @click.stop
        >
          <UIcon name="i-heroicons-bars-2" class="w-3 h-3 text-gray-400" />
        </div>

        <!-- Status Dot -->
        <div class="flex items-start gap-1.5">
          <div
            class="w-2 h-2 rounded-full mt-0.5 flex-shrink-0"
            :class="{
              'bg-green-500': activity.source === 'completed' && !activity.plannedWorkoutId,
              'bg-blue-500': activity.source === 'completed' && activity.plannedWorkoutId,
              'bg-amber-500': activity.source === 'planned' && activity.status === 'planned',
              'bg-red-500': activity.status === 'missed',
              'bg-gray-400 dark:bg-gray-600': activity.source === 'note'
            }"
          />

          <div class="flex-1 min-w-0">
            <!-- Title -->
            <div class="font-medium truncate flex items-center gap-1" :title="activity.title">
              <span>{{ activity.title }}</span>
              <UIcon
                v-if="activity.isWeeklyNote"
                name="i-heroicons-calendar-days"
                class="w-3 h-3 text-primary-500"
                title="Weekly Note"
              />
            </div>

            <!-- Note Category -->
            <div
              v-if="activity.source === 'note' && activity.category"
              class="text-[9px] uppercase tracking-wider text-gray-400 font-bold"
            >
              {{ activity.category }}
            </div>

            <!-- Metrics -->
            <div
              v-if="
                activity.duration ||
                activity.plannedDuration ||
                activity.distance ||
                activity.plannedDistance ||
                activity.averageHr ||
                activity.tss ||
                activity.plannedTss
              "
              class="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400 mt-0.5"
            >
              <span class="inline-block w-10 text-left">
                <span v-if="activity.duration || activity.plannedDuration">
                  {{ formatDuration(activity.duration || activity.plannedDuration || 0) }}
                </span>
              </span>
              <span class="inline-block w-11 text-left">
                <span v-if="activity.distance || activity.plannedDistance">
                  {{ formatDistance(activity.distance || activity.plannedDistance || 0) }}
                </span>
              </span>
              <span class="inline-flex items-center gap-0.5 w-8">
                <template v-if="activity.averageHr">
                  <UIcon
                    name="i-heroicons-heart"
                    class="w-2.5 h-2.5 flex-shrink-0 text-red-500 dark:text-red-400"
                  />
                  <span class="text-red-500 dark:text-red-400">{{
                    Math.round(activity.averageHr)
                  }}</span>
                </template>
              </span>
              <span class="inline-flex items-center gap-0.5">
                <template v-if="activity.tss || activity.trimp || activity.plannedTss">
                  <span
                    class="w-3 h-0.5 rounded-full flex-shrink-0"
                    :class="{
                      'bg-green-500': activity.source === 'completed',
                      'bg-amber-500': activity.source === 'planned'
                    }"
                  />
                  <span class="font-medium">{{
                    Math.round(activity.tss ?? activity.trimp ?? activity.plannedTss ?? 0)
                  }}</span>
                </template>
              </span>
            </div>

            <!-- Training Stress Metrics (CTL/ATL/TSB) for completed workouts -->
            <div
              v-if="activity.source === 'completed' && (activity.ctl || activity.atl)"
              class="flex items-center gap-2 text-[9px] text-gray-400 dark:text-gray-500 mt-0.5"
            >
              <UTooltip
                v-if="activity.ctl"
                text="Chronic Training Load - Your fitness level at this point"
              >
                <span class="flex items-center gap-0.5">
                  <span class="text-purple-600 dark:text-purple-400 font-semibold">CTL</span>
                  <span>{{ activity.ctl.toFixed(0) }}</span>
                </span>
              </UTooltip>
              <UTooltip
                v-if="activity.atl"
                text="Acute Training Load - Your fatigue level at this point"
              >
                <span class="flex items-center gap-0.5">
                  <span class="text-yellow-600 dark:text-yellow-400 font-semibold">ATL</span>
                  <span>{{ activity.atl.toFixed(0) }}</span>
                </span>
              </UTooltip>
              <UTooltip
                v-if="activity.ctl && activity.atl"
                :text="`Training Stress Balance: ${getTSBTooltip(activity.ctl - activity.atl)}`"
              >
                <span class="flex items-center gap-0.5">
                  <span class="font-semibold" :class="getTSBColor(activity.ctl - activity.atl)"
                    >TSB</span
                  >
                  <span :class="getTSBColor(activity.ctl - activity.atl)">
                    {{ activity.ctl - activity.atl > 0 ? '+' : ''
                    }}{{ (activity.ctl - activity.atl).toFixed(0) }}
                  </span>
                </span>
              </UTooltip>
            </div>

            <!-- Planned Indicator Badge -->
            <div v-if="activity.source === 'completed' && activity.plannedWorkoutId" class="mt-1">
              <UBadge color="primary" variant="subtle" size="xs">
                <UIcon name="i-heroicons-calendar" class="w-3 h-3" />
                <span class="ml-0.5">Planned</span>
              </UBadge>
            </div>

            <!-- Linked Planned Workout Details -->
            <div
              v-if="activity.linkedPlannedWorkout"
              class="mt-1.5 ml-2 pl-2 border-l-2 border-primary-200 dark:border-primary-800 space-y-0.5 opacity-80"
            >
              <div class="flex items-center gap-1">
                <UIcon name="i-heroicons-link" class="w-2.5 h-2.5 text-primary-500 shrink-0" />
                <div
                  class="text-[10px] text-primary-700 dark:text-primary-300 truncate italic font-medium"
                >
                  {{ activity.linkedPlannedWorkout?.title }}
                </div>
              </div>
              <div class="text-[9px] text-gray-400 dark:text-gray-500 pl-3.5">
                <span v-if="activity.linkedPlannedWorkout?.duration">{{
                  formatDuration(activity.linkedPlannedWorkout?.duration)
                }}</span>
                <span v-if="activity.linkedPlannedWorkout?.tss">
                  • {{ Math.round(activity.linkedPlannedWorkout?.tss || 0) }} TSS</span
                >
              </div>
            </div>

            <!-- Mini Workout Chart (Structured Planned) -->
            <div v-if="activity.source === 'planned' && activity.structuredWorkout" class="mt-1.5">
              <MiniWorkoutChart
                :workout="activity.structuredWorkout"
                class="w-full h-6 opacity-75"
              />
            </div>

            <!-- Mini Zone Chart (Completed Streams) -->
            <div v-if="activity.source === 'completed' && activity.hasStreams" class="mt-1.5">
              <MiniZoneChart
                :workout-id="activity.id"
                :auto-load="false"
                :stream-data="streams?.[activity.id]"
                :user-zones="userZones"
              />
            </div>
          </div>
        </div>
      </button>
    </div>

    <!-- Nutrition Summary (subtle, at bottom) - mt-auto pushes to bottom -->
    <div
      v-if="dayNutrition"
      class="mt-auto pt-2 border-t border-gray-200 dark:border-gray-700 text-[10px] text-gray-500 dark:text-gray-500"
    >
      <div class="grid grid-cols-2 gap-x-2 gap-y-0.5">
        <div v-if="dayNutrition.calories != null" class="flex justify-between">
          <span>Cal:</span>
          <span class="font-medium" :class="getNutritionClass('calories')">
            {{ dayNutrition.calories
            }}{{ dayNutrition.caloriesGoal ? `/${dayNutrition.caloriesGoal}` : '' }}
          </span>
        </div>
        <div v-if="dayNutrition.protein != null" class="flex justify-between">
          <span>Pro:</span>
          <span class="font-medium" :class="getNutritionClass('protein')">
            {{ Math.round(dayNutrition.protein)
            }}{{ dayNutrition.proteinGoal ? `/${Math.round(dayNutrition.proteinGoal)}` : '' }}g
          </span>
        </div>
        <div v-if="dayNutrition.carbs != null" class="flex justify-between">
          <span>Carb:</span>
          <span class="font-medium" :class="getNutritionClass('carbs')">
            {{ Math.round(dayNutrition.carbs)
            }}{{ dayNutrition.carbsGoal ? `/${Math.round(dayNutrition.carbsGoal)}` : '' }}g
          </span>
        </div>
        <div v-if="dayNutrition.fat != null" class="flex justify-between">
          <span>Fat:</span>
          <span class="font-medium" :class="getNutritionClass('fat')">
            {{ Math.round(dayNutrition.fat)
            }}{{ dayNutrition.fatGoal ? `/${Math.round(dayNutrition.fatGoal)}` : '' }}g
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { isSameMonth } from 'date-fns'
  import type { CalendarActivity } from '../../types/calendar'
  import MiniWorkoutChart from '~/components/workouts/MiniWorkoutChart.vue'
  import MiniZoneChart from '~/components/MiniZoneChart.vue'

  const { formatDateUTC, getUserLocalDate } = useFormat()

  const props = defineProps<{
    date: Date
    activities: CalendarActivity[]
    isOtherMonth: boolean
    streams?: Record<string, any>
    userZones?: any
  }>()

  const emit = defineEmits<{
    'activity-click': [activity: CalendarActivity]
    'wellness-click': [date: Date]
    'merge-activity': [data: { source: CalendarActivity; target: CalendarActivity }]
    'link-activity': [data: { planned: CalendarActivity; completed: CalendarActivity }]
    'reschedule-activity': [data: { activity: { id: string; source: string }; date: Date }]
  }>()

  const dayNumber = computed(() => formatDateUTC(props.date, 'd'))
  const isDragOver = ref<string | null>(null)
  const isDayDragOver = ref(false)

  function onDragStart(event: DragEvent, activity: CalendarActivity) {
    if (event.dataTransfer) {
      event.dataTransfer.setData(
        'application/json',
        JSON.stringify({
          id: activity.id,
          title: activity.title,
          source: activity.source,
          date: activity.date // Include date to check if it's a reschedule
        })
      )
      event.dataTransfer.effectAllowed = 'move' // Use move since we can also reschedule
    }
  }

  function onDragOver(event: DragEvent) {
    // Logic could be improved to check if valid target, but for now allow visual feedback
  }

  function onDragLeave(event: DragEvent) {
    // Reset specific drag over state if implemented per-card
  }

  function onDrop(event: DragEvent, targetActivity: CalendarActivity) {
    if (event.dataTransfer) {
      const data = event.dataTransfer.getData('application/json')
      if (data) {
        try {
          const sourceActivity = JSON.parse(data)

          if (sourceActivity.id === targetActivity.id) return

          // Case 1: Linking a planned workout to a completed workout
          if (sourceActivity.source === 'planned' && targetActivity.source === 'completed') {
            emit('link-activity', {
              planned: sourceActivity,
              completed: targetActivity
            })
            return
          }

          // Case 2: Merging two completed workouts
          if (sourceActivity.source === 'completed' && targetActivity.source === 'completed') {
            emit('merge-activity', {
              source: sourceActivity,
              target: targetActivity
            })
          }
        } catch (e) {
          console.error('Error parsing drop data', e)
        }
      }
    }
  }

  // Day cell drag handlers for rescheduling
  function onDayDragOver(event: DragEvent) {
    // Check if dragging a planned workout (optional: inspect DataTransfer items if needed)
    // For now, just allow dropping
    // isDayDragOver.value = true // Handled in DragEnter to avoid flickering?
    // dragover fires continuously
  }

  function onDayDragEnter(event: DragEvent) {
    isDayDragOver.value = true
  }

  function onDayDragLeave(event: DragEvent) {
    // Check if we are really leaving the element and not entering a child
    if (
      event.relatedTarget &&
      (event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)
    ) {
      return
    }
    isDayDragOver.value = false
  }

  function onDayDrop(event: DragEvent) {
    isDayDragOver.value = false
    if (event.dataTransfer) {
      const data = event.dataTransfer.getData('application/json')
      if (data) {
        try {
          const sourceActivity = JSON.parse(data)

          // Only allow rescheduling planned workouts
          if (sourceActivity.source === 'planned') {
            const targetDateStr = formatDateUTC(props.date, 'yyyy-MM-dd')
            const sourceDateStr = sourceActivity.date
              ? formatDateUTC(new Date(sourceActivity.date), 'yyyy-MM-dd')
              : ''

            // Only emit if the date has changed
            if (sourceDateStr !== targetDateStr) {
              emit('reschedule-activity', {
                activity: sourceActivity,
                date: props.date
              })
            }
          }
        } catch (e) {
          console.error('Error parsing drop data', e)
        }
      }
    }
  }

  const isToday = computed(() => {
    return (
      formatDateUTC(props.date, 'yyyy-MM-dd') === formatDateUTC(getUserLocalDate(), 'yyyy-MM-dd')
    )
  })

  // Get nutrition data from any activity on this day (they all have same nutrition data)
  const dayNutrition = computed(() => {
    const activityWithNutrition = props.activities.find((a) => a.nutrition)
    return activityWithNutrition?.nutrition || null
  })

  // Get wellness data from any activity on this day (they all have same wellness data)
  const dayWellness = computed(() => {
    const activityWithWellness = props.activities.find((a) => a.wellness)
    return activityWithWellness?.wellness || null
  })

  function formatDuration(seconds: number | undefined | null): string {
    if (typeof seconds !== 'number' || isNaN(seconds)) return ''

    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)

    if (h > 0) {
      return `${h}h${m > 0 ? `${m}m` : ''}`
    }
    return `${m}m`
  }

  function formatDistance(meters: number): string {
    const km = meters / 1000
    if (km >= 10) {
      return `${Math.round(km)}km`
    } else if (km >= 1) {
      return `${km.toFixed(1)}km`
    }
    return `${Math.round(meters)}m`
  }

  function getTSBColor(tsb: number | null): string {
    if (tsb === null) return 'text-gray-400'
    if (tsb >= 5) return 'text-green-600 dark:text-green-400'
    if (tsb >= -10) return 'text-yellow-600 dark:text-yellow-400'
    if (tsb >= -25) return 'text-blue-600 dark:text-blue-400'
    return 'text-red-600 dark:text-red-400'
  }

  function getTSBTooltip(tsb: number): string {
    if (tsb > 25) return 'Resting too long - fitness declining'
    if (tsb > 5) return 'Fresh and ready to race'
    if (tsb > -10) return 'Maintaining fitness'
    if (tsb > -25) return 'Building fitness'
    if (tsb > -40) return 'High fatigue - caution'
    return 'Severe fatigue - rest needed'
  }

  function getNutritionClass(metric: 'calories' | 'protein' | 'carbs' | 'fat'): string {
    if (!dayNutrition.value) return ''

    const actual = dayNutrition.value[metric]
    const goal = dayNutrition.value[`${metric}Goal` as keyof typeof dayNutrition.value]

    if (actual == null || goal == null) return ''

    const percentage = (actual as number) / (goal as number)

    // Within 90-110% of goal is good (green)
    if (percentage >= 0.9 && percentage <= 1.1) {
      return 'text-green-600 dark:text-green-400'
    }
    // Within 80-120% is okay (amber)
    else if (percentage >= 0.8 && percentage <= 1.2) {
      return 'text-amber-600 dark:text-amber-400'
    }
    // Outside range is concerning (red)
    else {
      return 'text-red-600 dark:text-red-400'
    }
  }
</script>
