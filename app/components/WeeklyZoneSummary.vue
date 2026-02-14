<template>
  <div v-if="hasData" class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
    <div class="text-[10px] text-gray-500 dark:text-gray-400 mb-1">Training Zones</div>
    <div
      class="w-full h-4 flex gap-[1px] rounded overflow-hidden shadow-sm hover:ring-2 hover:ring-primary-500 transition-all cursor-pointer"
      @click="$emit('click')"
    >
      <UTooltip
        v-for="(segment, index) in zoneSegments"
        :key="index"
        :text="getSegmentTooltip(segment)"
        :popper="{ placement: 'top' }"
        :style="{ width: segment.percentage + '%' }"
        class="h-full"
      >
        <div
          :style="{ backgroundColor: segment.color }"
          class="h-full w-full transition-all duration-200 first:rounded-l last:rounded-r"
        />
      </UTooltip>
    </div>
  </div>
  <div v-else-if="loading" class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
    <div class="text-[10px] text-gray-500 dark:text-gray-400 mb-1">Training Zones</div>
    <div class="w-full h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
  </div>
</template>

<script setup lang="ts">
  import { getZoneColor } from '~/utils/zone-colors'
  import { getPreferredMetric } from '~/utils/sportSettings'

  interface Props {
    workoutIds: string[]
    autoLoad?: boolean
    userZones?: any
    streams?: any[]
  }

  const props = withDefaults(defineProps<Props>(), {
    autoLoad: true,
    userZones: undefined,
    streams: () => []
  })

  defineEmits<{
    click: []
  }>()

  const loading = ref(false)
  const aggregatedZones = ref<number[]>([])
  const zoneType = ref<'hr' | 'power' | 'pace'>('hr')

  const hasData = computed(() => {
    return aggregatedZones.value.length > 0 && aggregatedZones.value.some((v) => v > 0)
  })

  const zoneSegments = computed(() => {
    if (!hasData.value) return []

    const total = aggregatedZones.value.reduce((sum, val) => sum + val, 0)
    if (total === 0) return []

    return aggregatedZones.value
      .map((time, index) => ({
        percentage: (time / total) * 100,
        color: getZoneColor(index),
        zone: index + 1,
        time: time
      }))
      .filter((seg) => seg.percentage > 0)
  })

  function getSegmentTooltip(segment: any) {
    if (!props.userZones) return 'Click for details'

    const zones = zoneType.value === 'hr' ? props.userZones.hrZones : props.userZones.powerZones
    if (!zones) return ''

    const zone = zones[segment.zone - 1]
    if (!zone) return ''

    const hours = Math.floor(segment.time / 3600)
    const minutes = Math.floor((segment.time % 3600) / 60)
    const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`

    const suffix = zoneType.value === 'hr' ? ' (HR)' : ' (Power)'
    return `${zone.name}: ${timeStr} (${segment.percentage.toFixed(1)}%)${suffix}`
  }

  async function fetchData() {
    if (import.meta.server) return
    if (!props.autoLoad && !props.streams) return
    if (props.workoutIds.length === 0 && (!props.streams || props.streams.length === 0)) return

    loading.value = true

    try {
      let streams = props.streams

      if (!streams) {
        // Fetch necessary keys with low resolution fallback to keep payload small
        streams = await $fetch<any[]>('/api/workouts/streams', {
          method: 'POST',
          body: {
            workoutIds: props.workoutIds,
            keys: ['hrZoneTimes', 'powerZoneTimes', 'heartrate', 'watts', 'time'],
            points: 150
          }
        }).catch(() => [])
      }

      // Aggregate zone data
      const hrZoneTimes = new Array(8).fill(0)
      const powerZoneTimes = new Array(8).fill(0)
      let hasHrData = false
      let hasPowerData = false

      streams.forEach((stream) => {
        if (!stream) return

        const timeArray = stream.time

        // Priority 1: Use cached zone times if available (much faster and uses less data)
        if (
          stream.hrZoneTimes &&
          Array.isArray(stream.hrZoneTimes) &&
          stream.hrZoneTimes.length > 0
        ) {
          hasHrData = true
          stream.hrZoneTimes.forEach((duration: number, index: number) => {
            if (index < 8) hrZoneTimes[index] += duration
          })
        } else if (
          'heartrate' in stream &&
          Array.isArray(stream.heartrate) &&
          props.userZones?.hrZones
        ) {
          // Fallback to manual calculation from stream
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

            const zoneIndex = getZoneIndex(hr, props.userZones.hrZones)
            if (zoneIndex >= 0 && zoneIndex < 8) hrZoneTimes[zoneIndex] += duration
          })
        }

        // Priority 1: Use cached zone times if available
        if (
          stream.powerZoneTimes &&
          Array.isArray(stream.powerZoneTimes) &&
          stream.powerZoneTimes.length > 0
        ) {
          hasPowerData = true
          stream.powerZoneTimes.forEach((duration: number, index: number) => {
            if (index < 8) powerZoneTimes[index] += duration
          })
        } else if (
          'watts' in stream &&
          Array.isArray(stream.watts) &&
          props.userZones?.powerZones
        ) {
          // Fallback to manual calculation from stream
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

            const zoneIndex = getZoneIndex(watts, props.userZones.powerZones)
            if (zoneIndex >= 0 && zoneIndex < 8) powerZoneTimes[zoneIndex] += duration
          })
        }
      })

      // Auto-select zone type: respect preference
      if (hasHrData || hasPowerData) {
        zoneType.value = getPreferredMetric(props.userZones, {
          hasHr: hasHrData,
          hasPower: hasPowerData
        })
        aggregatedZones.value = zoneType.value === 'power' ? powerZoneTimes : hrZoneTimes
      }
    } catch (e) {
      console.error('Error fetching weekly zone data:', e)
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

    // If value is above all zones, put it in the highest zone
    if (value > zones[zones.length - 1].max) {
      return zones.length - 1
    }

    return -1
  }

  // Watch for changes in workout IDs or streams
  watch(
    () => [props.workoutIds, props.userZones, props.streams],
    () => {
      if ((props.autoLoad || props.streams) && props.userZones) {
        fetchData()
      }
    },
    { immediate: true }
  )

  // Expose fetch method
  defineExpose({
    fetchData
  })
</script>
