<template>
  <div
    class="relative group rounded border transition-all duration-200 cursor-pointer overflow-hidden hover:shadow-md"
    :class="[
      statusColors.bg,
      statusColors.border,
      isPlanned ? 'border-dashed' : 'border-solid'
    ]"
    @click="$emit('click')"
  >
    <!-- TSB Indicator Dot -->
    <div
      v-if="tsbValue !== null && activity.source === 'completed'"
      class="absolute top-1 right-1 w-2 h-2 rounded-full"
      :class="getTSBDotColor(tsbValue)"
      :title="`CTL: ${activity.ctl?.toFixed(1)}, ATL: ${activity.atl?.toFixed(1)}, TSB: ${tsbValue.toFixed(1)}`"
    ></div>

    <!-- Header: Icon & Title -->
    <div class="px-1.5 py-1 flex items-start gap-1.5">
      <UIcon
        :name="activityIcon"
        class="w-3.5 h-3.5 mt-0.5 shrink-0"
        :class="statusColors.icon"
      />
      <div class="min-w-0 flex-1">
        <h4 
          class="text-xs font-medium truncate leading-tight"
          :class="statusColors.text"
        >
          {{ activity.title }}
        </h4>
        
        <!-- Key Metrics Row -->
        <div class="flex items-center gap-2 mt-0.5 text-[10px] opacity-90" :class="statusColors.subtext">
          <!-- Start Time -->
          <span>
            {{ formatStartTime(activity.date) }}
          </span>

          <!-- Duration -->
          <span v-if="activity.duration > 0">
            {{ formatDuration(activity.duration) }}
          </span>
          
          <!-- Distance -->
          <span v-if="activity.distance && activity.distance > 0">
            {{ formatDistance(activity.distance) }}
          </span>
          
          <!-- TSS -->
          <span v-if="activity.tss" class="font-semibold">
            {{ Math.round(activity.tss) }} TSS
          </span>
        </div>
      </div>
    </div>
    
    <!-- Mini Zone Chart (for completed workouts with stream data) -->
    <div v-if="shouldShowZoneChart" class="px-1.5 pb-1">
      <MiniZoneChart :workout-id="activity.id" :auto-load="true" />
    </div>
    
    <!-- Load Bar (Visual indicator of intensity/load) -->
    <div v-if="!shouldShowZoneChart && (activity.tss || activity.plannedTss)" class="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-200 dark:bg-gray-700">
      <div
        class="h-full"
        :class="statusColors.bar"
        :style="{ width: Math.min((activity.tss || activity.plannedTss || 0) / 1.5, 100) + '%' }"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { format } from 'date-fns'
import type { CalendarActivity } from '~/types/calendar'

const props = defineProps<{
  activity: CalendarActivity
}>()

const isPlanned = computed(() => props.activity.source === 'planned')

// Show mini zone chart for completed workouts
// The component will handle cases where stream data isn't available
const shouldShowZoneChart = computed(() => {
  return props.activity.source === 'completed'
})

// Calculate TSB (Training Stress Balance) if CTL and ATL are available
const tsbValue = computed(() => {
  if (props.activity.ctl !== null && props.activity.ctl !== undefined &&
      props.activity.atl !== null && props.activity.atl !== undefined) {
    return props.activity.ctl - props.activity.atl
  }
  return null
})

// Icon mapping based on activity type
const activityIcon = computed(() => {
  const type = props.activity.type?.toLowerCase() || ''
  if (type.includes('ride') || type.includes('cycle')) return 'i-heroicons-bolt' // Placeholder, ideally bike icon
  if (type.includes('run')) return 'i-heroicons-fire' // Placeholder for run
  if (type.includes('swim')) return 'i-heroicons-beaker' // Placeholder for swim
  if (type.includes('weight') || type.includes('strength')) return 'i-heroicons-trophy'
  return 'i-heroicons-check-circle'
})

// Color logic based on status and completion
const statusColors = computed(() => {
  // Missed workout
  if (props.activity.status === 'missed') {
    return {
      bg: 'bg-red-50 dark:bg-red-900/10',
      border: 'border-red-200 dark:border-red-800/30',
      text: 'text-red-700 dark:text-red-400',
      subtext: 'text-red-600/80 dark:text-red-400/80',
      icon: 'text-red-500',
      bar: 'bg-red-500'
    }
  }

  // Completed workout
  if (props.activity.source === 'completed') {
    return {
      bg: 'bg-green-50 dark:bg-green-900/10',
      border: 'border-green-200 dark:border-green-800/30',
      text: 'text-green-800 dark:text-green-300',
      subtext: 'text-green-700/80 dark:text-green-400/80',
      icon: 'text-green-600 dark:text-green-400',
      bar: 'bg-green-500'
    }
  }

  // Planned (future)
  return {
    bg: 'bg-gray-50 dark:bg-gray-800/50',
    border: 'border-gray-200 dark:border-gray-700',
    text: 'text-gray-700 dark:text-gray-300',
    subtext: 'text-gray-500 dark:text-gray-400',
    icon: 'text-gray-400',
    bar: 'bg-gray-400'
  }
})

// Format helpers
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)}km`
  }
  return `${Math.round(meters)}m`
}

function formatStartTime(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'h:mm a')
  } catch {
    return ''
  }
}

// TSB indicator color based on value
function getTSBDotColor(tsb: number): string {
  if (tsb >= 5) return 'bg-green-500'
  if (tsb >= -10) return 'bg-yellow-500'
  return 'bg-red-500'
}
</script>