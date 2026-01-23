<template>
  <UModal v-model:open="isOpen" title="Weekly Training Zones">
    <template #body>
      <div v-if="weekData" class="space-y-6">
        <!-- Week Info -->
        <div class="text-sm text-gray-600 dark:text-gray-400">
          Week {{ weekData.weekNumber }} • {{ weekData.completedWorkouts }} completed workout{{
            weekData.completedWorkouts !== 1 ? 's' : ''
          }}
        </div>

        <!-- Summary Stats -->
        <div class="grid grid-cols-3 gap-4 pt-4 border-b border-gray-200 dark:border-gray-700 pb-4">
          <div class="text-center">
            <div class="text-xs text-gray-500 mb-1">Duration</div>
            <div class="text-xl font-bold text-gray-900 dark:text-white">
              {{ formatTime(weekData.totalDuration) }}
            </div>
            <div class="text-xs text-gray-400">
              Target: {{ formatTime(weekData.plannedDuration || 0) }}
            </div>
          </div>
          <div class="text-center">
            <div class="text-xs text-gray-500 mb-1">Distance</div>
            <div class="text-xl font-bold text-gray-900 dark:text-white">
              {{ (weekData.totalDistance / 1000).toFixed(1) }}k
            </div>
            <div class="text-xs text-gray-400">
              Target: {{ ((weekData.plannedDistance || 0) / 1000).toFixed(1) }}k
            </div>
          </div>
          <div class="text-center">
            <div class="text-xs text-gray-500 mb-1">TSS</div>
            <div class="text-xl font-bold text-gray-900 dark:text-white">
              {{ Math.round(weekData.totalTSS) }}
            </div>
            <div class="text-xs text-gray-400">
              Target: {{ Math.round(weekData.plannedTss || 0) }}
            </div>
          </div>
        </div>

        <!-- Zone Distribution Chart -->
        <div>
          <h3 class="text-lg font-semibold mb-3">
            {{ zoneType === 'hr' ? 'Heart Rate' : 'Power' }} Zone Distribution
          </h3>
          <div class="space-y-3">
            <div v-for="(zone, index) in zoneBreakdown" :key="index" class="space-y-1">
              <div class="flex items-center justify-between text-xs">
                <span class="font-medium w-8">{{ zone.name }}</span>
                <div class="text-gray-600 dark:text-gray-400">
                  <span :class="{ 'font-bold text-gray-900 dark:text-white': zone.actualTime > 0 }">
                    {{ formatTime(zone.actualTime) }}
                  </span>
                </div>
              </div>
              <div class="relative w-full h-6 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
                <!-- Planned Bar (Background) -->
                <UTooltip
                  v-if="zone.plannedPerc > 0"
                  :text="'Planned: ' + formatTime(zone.plannedTime)"
                  class="absolute top-0 left-0 h-full bg-gray-300 dark:bg-gray-600 transition-all opacity-50"
                  :style="{ width: zone.plannedPerc + '%' }"
                >
                  <div class="w-full h-full" />
                </UTooltip>
                <!-- Actual Bar (Foreground) -->
                <UTooltip
                  v-if="zone.actualPerc > 0"
                  :text="'Actual: ' + formatTime(zone.actualTime)"
                  class="absolute top-0 left-0 h-full transition-all opacity-90"
                  :style="{
                    width: zone.actualPerc + '%',
                    backgroundColor: zone.color,
                    zIndex: 10
                  }"
                >
                  <div class="w-full h-full" />
                </UTooltip>
              </div>
            </div>
          </div>
        </div>

        <!-- Workout Type Breakdown -->
        <div v-if="workoutTypeBreakdown.length > 0">
          <h3 class="text-lg font-semibold mb-3">Time by Workout Type</h3>
          <div class="space-y-2">
            <div
              v-for="type in workoutTypeBreakdown"
              :key="type.type"
              class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
            >
              <div class="flex items-center gap-2">
                <UIcon
                  :name="getActivityIcon(type.type)"
                  class="w-5 h-5 text-gray-600 dark:text-gray-400"
                />
                <span class="font-medium">{{ type.type }}</span>
              </div>
              <div class="text-right">
                <div class="font-semibold">{{ formatTime(type.duration) }}</div>
                <div class="text-xs text-gray-500">
                  {{ type.count }} workout{{ type.count !== 1 ? 's' : '' }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end">
        <UButton color="neutral" variant="ghost" @click="closeModal"> Close </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
  import { getSportSettingsForActivity } from '~/utils/sportSettings'
  import { getZoneColor } from '~/utils/zone-colors'

  const props = defineProps<{
    modelValue: boolean
    weekData: {
      weekNumber: number
      completedWorkouts: number
      totalDuration: number
      plannedDuration?: number
      totalDistance: number
      plannedDistance?: number
      totalTSS: number
      plannedTss?: number
      workoutIds: string[]
      activities: any[]
      plannedActivities?: any[]
    } | null
    userZones: any
    allSportSettings?: any[]
    streams?: any[]
    ftp?: number
  }>()

  const emit = defineEmits<{
    'update:modelValue': [value: boolean]
  }>()

  const isOpen = computed({
    get: () => props.modelValue,
    set: (value) => emit('update:modelValue', value)
  })

  const aggregatedZones = ref<number[]>([])
  const aggregatedPlannedZones = ref<number[]>([])
  const zoneType = ref<'hr' | 'power'>('hr')
  const loading = ref(false)

  const zoneBreakdown = computed(() => {
    if (!props.userZones) return []

    const zones = zoneType.value === 'hr' ? props.userZones.hrZones : props.userZones.powerZones

    // Scale calculation: based on the maximum total duration of either Actual or Planned for the week
    // This allows bars to be comparable on the same timeline scale.
    // However, if one week is huge, 100% might be too big?
    // Usually we scale to the Max of (AllActualTimes U AllPlannedTimes) * 1.1?
    // Or just use Total Duration of the week as the denominator?
    // Using Total Duration (Actual vs Planned) works for "Distribution", but not for "Volume Comparison".
    // "Volume Comparison" (Progress bar style) is what the user asked for ("bar above...").
    // So we need a common denominator.
    // Let's use Math.max(totalActualDuration, totalPlannedDuration) of the *whole week*.
    const maxWeekDuration = Math.max(
      props.weekData?.totalDuration || 1,
      props.weekData?.plannedDuration || 1
    )

    return zones.map((zone: any, index: number) => {
      const actualTime = aggregatedZones.value[index] || 0
      const plannedTime = aggregatedPlannedZones.value[index] || 0

      return {
        name: zone.name,
        actualTime,
        plannedTime,
        actualPerc: (actualTime / maxWeekDuration) * 100,
        plannedPerc: (plannedTime / maxWeekDuration) * 100,
        color: getZoneColor(index)
      }
    })
  })

  const workoutTypeBreakdown = computed(() => {
    if (!props.weekData) return []

    const typeMap = new Map<string, { count: number; duration: number }>()

    props.weekData.activities.forEach((activity) => {
      const type = activity.type || 'Unknown'
      const existing = typeMap.get(type) || { count: 0, duration: 0 }
      typeMap.set(type, {
        count: existing.count + 1,
        duration: existing.duration + (activity.duration || 0)
      })
    })

    return Array.from(typeMap.entries())
      .map(([type, data]) => ({ type, ...data }))
      .sort((a, b) => b.duration - a.duration)
  })

  function formatTime(seconds: number): string {
    if (!seconds) return '0m'
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)

    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    return `${minutes}m`
  }

  function getActivityIcon(type: string) {
    const t = (type || '').toLowerCase()
    if (t.includes('ride') || t.includes('cycle')) return 'i-heroicons-bolt'
    if (t.includes('run')) return 'i-heroicons-fire'
    if (t.includes('swim')) return 'i-heroicons-beaker'
    if (t.includes('weight') || t.includes('strength')) return 'i-heroicons-trophy'
    return 'i-heroicons-check-circle'
  }

  function closeModal() {
    isOpen.value = false
  }

  function getActivityZones(activity: any) {
    if (!props.allSportSettings || !activity) return props.userZones

    const settings = getSportSettingsForActivity(props.allSportSettings, activity.type || '')
    if (!settings) return props.userZones

    return {
      hrZones: settings.hrZones,
      powerZones: settings.powerZones
    }
  }

  function calculatePlannedZones() {
    // We only support Power for planned workouts currently as we need FTP
    const plannedPowerZones = new Array(8).fill(0)

    if (!props.weekData?.plannedActivities || !props.ftp) return plannedPowerZones

    props.weekData.plannedActivities.forEach((workout) => {
      const steps = workout.structuredWorkout?.steps || []
      steps.forEach((step: any) => {
        const duration = step.duration || step.durationSeconds || 0
        if (!duration) return

        const power = step.power || {}
        let targetWatts = 0

        // Use average of range or exact value
        if (power.value) {
          targetWatts = power.value * props.ftp!
        } else if (power.range) {
          targetWatts = ((power.range.start + power.range.end) / 2) * props.ftp!
        }

        if (targetWatts > 0) {
          const zoneIndex = getZoneIndex(targetWatts, props.userZones.powerZones)
          if (zoneIndex >= 0 && zoneIndex < 8) {
            plannedPowerZones[zoneIndex] += duration
          }
        }
      })
    })

    return plannedPowerZones
  }

  async function fetchZoneData() {
    if (import.meta.server) return
    if (!props.weekData || props.weekData.workoutIds.length === 0) {
      // Even if no completed workouts, we might have planned ones
      // But we need to initialize
      aggregatedZones.value = new Array(8).fill(0)
      aggregatedPlannedZones.value = calculatePlannedZones()
      // Default to power if we have planned power
      if (aggregatedPlannedZones.value.some((v) => v > 0)) {
        zoneType.value = 'power'
      }
      return
    }

    loading.value = true

    try {
      let streams = props.streams

      if (!streams) {
        streams = await $fetch<any[]>('/api/workouts/streams', {
          method: 'POST',
          body: {
            workoutIds: props.weekData.workoutIds,
            keys: ['hrZoneTimes', 'powerZoneTimes', 'heartrate', 'watts', 'time'],
            points: 150
          }
        }).catch(() => [])
      }

      // Aggregate Actuals
      const hrZoneTimes = new Array(8).fill(0)
      const powerZoneTimes = new Array(8).fill(0)
      let hasHrData = false
      let hasPowerData = false

      streams.forEach((stream) => {
        if (!stream) return

        const activity = props.weekData?.activities.find((a) => a.id === stream.workoutId)
        const zones = getActivityZones(activity)
        if (!zones) return

        const timeArray = stream.time

        if (
          stream.hrZoneTimes &&
          Array.isArray(stream.hrZoneTimes) &&
          stream.hrZoneTimes.length > 0
        ) {
          hasHrData = true
          stream.hrZoneTimes.forEach((duration: number, index: number) => {
            if (index < 8) hrZoneTimes[index] += duration
          })
        } else if ('heartrate' in stream && Array.isArray(stream.heartrate) && zones.hrZones) {
          hasHrData = true
          stream.heartrate.forEach((hr: number, index: number) => {
            if (hr === null || hr === undefined) return
            let duration = 1
            if (timeArray && Array.isArray(timeArray) && timeArray.length > index) {
              if (index < timeArray.length - 1) {
                duration = timeArray[index + 1] - timeArray[index]
              } else if (index > 0) {
                duration = timeArray[index] - timeArray[index - 1]
              }
            }
            if (duration < 0) duration = 0
            if (duration > 300) duration = 1
            const zoneIndex = getZoneIndex(hr, zones.hrZones)
            if (zoneIndex >= 0 && zoneIndex < 8) hrZoneTimes[zoneIndex] += duration
          })
        }

        if (
          stream.powerZoneTimes &&
          Array.isArray(stream.powerZoneTimes) &&
          stream.powerZoneTimes.length > 0
        ) {
          hasPowerData = true
          stream.powerZoneTimes.forEach((duration: number, index: number) => {
            if (index < 8) powerZoneTimes[index] += duration
          })
        } else if ('watts' in stream && Array.isArray(stream.watts) && zones.powerZones) {
          hasPowerData = true
          stream.watts.forEach((watts: number, index: number) => {
            if (watts === null || watts === undefined) return
            let duration = 1
            if (timeArray && Array.isArray(timeArray) && timeArray.length > index) {
              if (index < timeArray.length - 1) {
                duration = timeArray[index + 1] - timeArray[index]
              } else if (index > 0) {
                duration = timeArray[index] - timeArray[index - 1]
              }
            }
            if (duration < 0) duration = 0
            if (duration > 300) duration = 1
            const zoneIndex = getZoneIndex(watts, zones.powerZones)
            if (zoneIndex >= 0 && zoneIndex < 8) powerZoneTimes[zoneIndex] += duration
          })
        }
      })

      // Calculate Planned (Always Power for now)
      const plannedZones = calculatePlannedZones()
      aggregatedPlannedZones.value = plannedZones

      // Prefer power if available OR if planned power exists
      const hasPlannedPower = plannedZones.some((v) => v > 0)

      if (hasPowerData || hasPlannedPower) {
        zoneType.value = 'power'
        aggregatedZones.value = powerZoneTimes
      } else if (hasHrData) {
        zoneType.value = 'hr'
        aggregatedZones.value = hrZoneTimes
        // Reset planned for HR mode as we don't have planned HR zones implemented yet
        aggregatedPlannedZones.value = new Array(8).fill(0)
      }
    } catch (e) {
      console.error('Error fetching zone data for modal:', e)
    } finally {
      loading.value = false
    }
  }

  function getZoneIndex(value: number, zones: any[]): number {
    if (!zones) return -1

    for (let i = 0; i < zones.length; i++) {
      const zone = zones[i]
      if (value >= zone.min && value <= zone.max) {
        return i
      }
    }

    if (value > zones[zones.length - 1].max) {
      return zones.length - 1
    }

    return -1
  }

  // Fetch data when modal opens
  watch(
    () => [props.modelValue, props.userZones, props.streams],
    ([isOpen]) => {
      if (isOpen && props.weekData && props.userZones) {
        fetchZoneData()
      }
    }
  )
</script>
