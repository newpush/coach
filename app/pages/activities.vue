<template>
  <div class="h-full flex flex-col">
    <!-- Header / Controls -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 p-4 border-b dark:border-gray-800">
      <div class="flex items-center gap-4 flex-wrap">
        <h1 class="text-2xl font-bold">Activities</h1>
        
        <!-- View Switcher -->
        <div class="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          <UButton
            icon="i-heroicons-calendar"
            :color="viewMode === 'calendar' ? 'white' : 'gray'"
            variant="ghost"
            size="sm"
            @click="viewMode = 'calendar'"
          />
          <UButton
            icon="i-heroicons-list-bullet"
            :color="viewMode === 'list' ? 'white' : 'gray'"
            variant="ghost"
            size="sm"
            @click="viewMode = 'list'"
          />
        </div>

        <!-- Month Navigation -->
        <div class="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          <UButton
            icon="i-heroicons-chevron-left"
            variant="ghost"
            size="sm"
            @click="prevMonth"
          />
          <span class="px-2 text-sm font-semibold min-w-[120px] text-center">
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
          size="xs"
          variant="soft"
          @click="goToToday"
        />
      </div>
      
      <!-- View Options -->
      <div class="flex items-center gap-4 justify-between md:justify-end overflow-x-auto">
        <!-- Legend (Calendar Only) -->
        <div v-if="viewMode === 'calendar'" class="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 shrink-0">
          <div class="flex items-center gap-1.5">
            <div class="w-2 h-2 rounded-full bg-green-500"></div>
            <span>Completed</span>
          </div>
          <div class="flex items-center gap-1.5">
            <div class="w-2 h-2 rounded-full bg-gray-400"></div>
            <span>Planned</span>
          </div>
          <div class="flex items-center gap-1.5">
            <div class="w-2 h-2 rounded-full bg-red-500"></div>
            <span>Missed</span>
          </div>
          <div class="flex items-center gap-1.5 border-l border-gray-300 dark:border-gray-700 pl-3">
            <div class="w-4 h-1 bg-green-500 rounded-sm"></div>
            <span>Load/TSS</span>
          </div>
        </div>

        <UButton
          icon="i-heroicons-arrow-path"
          variant="ghost"
          :loading="status === 'pending'"
          @click="() => { refresh() }"
        />
      </div>
    </div>

    <!-- Content Area -->
    <div class="flex-1 overflow-hidden px-4 pb-4">
      <div v-if="status === 'error'" class="p-4 text-red-500 bg-red-50 rounded-lg">
        Failed to load activities. Please try again.
      </div>

      <!-- Calendar View -->
      <div v-if="viewMode === 'calendar'" class="overflow-x-auto overflow-y-auto h-full">
        <div class="grid grid-cols-[80px_repeat(7,minmax(130px,1fr))] gap-px bg-gray-200 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden min-w-[1000px]">
        
        <!-- Header Row -->
        <div class="p-2 text-xs font-semibold text-center text-gray-500 bg-gray-50 dark:bg-gray-800">
          Summary
        </div>
        <div
          v-for="day in weekDays"
          :key="day"
          class="p-2 text-xs font-semibold text-center text-gray-500 bg-gray-50 dark:bg-gray-800"
        >
          {{ day }}
        </div>

        <!-- Weeks -->
        <template v-for="(week, wIndex) in calendarWeeks" :key="wIndex">
          <!-- Weekly Summary Column -->
          <div class="bg-gray-50 dark:bg-gray-800/50 p-2 flex flex-col justify-center gap-1 text-xs min-h-[120px]">
            <div class="font-bold text-gray-900 dark:text-gray-100">
                Week {{ week[0] ? getWeekNumber(week[0].date) : '' }}
            </div>
            
            <div class="mt-2 space-y-1 text-gray-500">
              <div class="flex justify-between">
                <span>Dur</span>
                <span class="font-medium text-gray-700 dark:text-gray-300">
                  {{ formatDuration(getWeekSummary(week).duration) }}
                </span>
              </div>
              <div class="flex justify-between">
                <span>Dist</span>
                <span class="font-medium text-gray-700 dark:text-gray-300">
                  {{ formatDistance(getWeekSummary(week).distance) }}
                </span>
              </div>
              <div class="flex justify-between">
                <span>Load</span>
                <span class="font-medium text-gray-700 dark:text-gray-300">
                  {{ Math.round(getWeekSummary(week).tss) }}
                </span>
              </div>
            </div>
          </div>

          <!-- Day Cells -->
          <CalendarDayCell
            v-for="(day, dIndex) in week"
            :key="dIndex"
            :date="day.date"
            :activities="day.activities"
            :is-other-month="day.isOtherMonth"
            @activity-click="openActivity"
          />
        </template>
        </div>
      </div>

      <!-- List View -->
      <div v-else class="bg-white dark:bg-gray-900 rounded-lg shadow overflow-hidden h-full flex flex-col">
        <!-- Debug: Activities count -->
        <!-- <div class="p-2 text-xs text-gray-500 border-b dark:border-gray-800">
          Showing {{ sortedActivities.length }} activities
        </div> -->

        <UTable
          :rows="sortedActivities"
          :columns="listColumns"
          @select="openActivity"
          :loading="status === 'pending'"
          class="flex-1"
          :ui="{
            th: { base: 'text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky top-0 bg-white dark:bg-gray-900 z-10' },
            td: { base: 'text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap' }
          }"
        >
          <template #type-data="{ row }">
            <UIcon :name="getActivityIcon(row.type)" class="w-4 h-4" />
          </template>
          
          <template #date-data="{ row }">
            {{ formatDateSafe(row.date) }}
          </template>

          <template #duration-data="{ row }">
            {{ formatDurationDetailed(row.duration || row.plannedDuration || 0) }}
          </template>

          <template #distance-data="{ row }">
            <span v-if="row.distance || row.plannedDistance">
              {{ ((row.distance || row.plannedDistance) / 1000).toFixed(2) }} km
            </span>
            <span v-else>-</span>
          </template>

          <template #tss-data="{ row }">
             <span v-if="row.tss || row.plannedTss">
              {{ Math.round(row.tss || row.plannedTss) }}
             </span>
             <span v-else>-</span>
          </template>
        </UTable>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, format, addMonths, subMonths, isSameMonth, getISOWeek } from 'date-fns'
import type { CalendarActivity } from '~/types/calendar'

const currentDate = ref(new Date())
const viewMode = ref<'calendar' | 'list'>('calendar')
const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// API Fetch
const { data: activities, status, refresh } = await useFetch<CalendarActivity[]>('/api/calendar', {
  query: computed(() => {
    const start = startOfWeek(startOfMonth(currentDate.value), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(currentDate.value), { weekStartsOn: 1 })
    return {
      startDate: start.toISOString(),
      endDate: end.toISOString()
    }
  }),
  watch: [currentDate]
})

// Calendar Logic
const calendarWeeks = computed(() => {
  const start = startOfWeek(startOfMonth(currentDate.value), { weekStartsOn: 1 })
  const end = endOfWeek(endOfMonth(currentDate.value), { weekStartsOn: 1 })
  
  const days = eachDayOfInterval({ start, end })
  const weeks = []
  let currentWeek = []
  
  for (const day of days) {
    const dayActivities = (activities.value || []).filter(a => {
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
  return weekDays.reduce((acc, day) => {
    day.activities.forEach((act: CalendarActivity) => {
      acc.duration += (act.duration || act.plannedDuration || 0)
      acc.distance += (act.distance || act.plannedDistance || 0)
      acc.tss += (act.tss || act.plannedTss || 0)
    })
    return acc
  }, { duration: 0, distance: 0, tss: 0 })
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  return `${h}h`
}

function formatDistance(meters: number): string {
  return `${Math.round(meters / 1000)}k`
}

function openActivity(activity: CalendarActivity) {
  if (activity.source === 'completed') {
    navigateTo(`/workouts/${activity.id}`)
  } else {
    // Navigate to plan editor or modal?
    console.log('Open plan:', activity.id)
  }
}

// List View Helpers
const sortedActivities = computed(() => {
  if (!activities.value) return []
  return [...activities.value].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
})

const listColumns = [
  { key: 'type', label: 'Type' },
  { key: 'date', label: 'Date' },
  { key: 'title', label: 'Name' },
  { key: 'duration', label: 'Time' },
  { key: 'distance', label: 'Distance' },
  { key: 'tss', label: 'Load' }
].map(c => ({ ...c, id: c.key }))

function formatDateSafe(dateStr: string) {
  try {
    return format(new Date(dateStr), 'EEE dd MMM yyyy h:mm a')
  } catch {
    return dateStr
  }
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
</script>