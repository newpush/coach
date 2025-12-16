<template>
  <div v-if="hasData" class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
    <div class="text-[10px] text-gray-500 dark:text-gray-400 mb-1">Training Zones</div>
    <UTooltip text="Click for details" :popper="{ placement: 'right' }">
      <div
        class="w-full h-4 flex gap-[1px] rounded overflow-hidden shadow-sm cursor-pointer hover:ring-2 hover:ring-primary-500 transition-all"
        @click="$emit('click')"
      >
        <div
          v-for="(segment, index) in zoneSegments"
          :key="index"
          :style="{
            width: segment.percentage + '%',
            backgroundColor: segment.color
          }"
          class="transition-all duration-200 first:rounded-l last:rounded-r"
        ></div>
      </div>
    </UTooltip>
  </div>
  <div v-else-if="loading" class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
    <div class="text-[10px] text-gray-500 dark:text-gray-400 mb-1">Training Zones</div>
    <div class="w-full h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse"></div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  workoutIds: string[]
  autoLoad?: boolean
  userZones: any
  streams?: any[]
}

const props = withDefaults(defineProps<Props>(), {
  autoLoad: true,
  userZones: null,
  streams: null
})

defineEmits<{
  'click': []
}>()

// Zone colors matching the MiniZoneChart component
const zoneColors = [
  'rgb(34, 197, 94)',    // Z1 - Green
  'rgb(59, 130, 246)',   // Z2 - Blue
  'rgb(245, 158, 11)',   // Z3 - Yellow
  'rgb(249, 115, 22)',   // Z4 - Orange
  'rgb(239, 68, 68)',    // Z5 - Red
]

const loading = ref(false)
const aggregatedZones = ref<number[]>([])
const zoneType = ref<'hr' | 'power'>('hr')

const hasData = computed(() => {
  return aggregatedZones.value.length > 0 && aggregatedZones.value.some(v => v > 0)
})

const zoneSegments = computed(() => {
  if (!hasData.value) return []
  
  const total = aggregatedZones.value.reduce((sum, val) => sum + val, 0)
  if (total === 0) return []
  
  return aggregatedZones.value
    .map((time, index) => ({
      percentage: (time / total) * 100,
      color: zoneColors[index],
      zone: index + 1,
      time: time
    }))
    .filter(seg => seg.percentage > 0)
})

const tooltipText = computed(() => {
  if (!hasData.value || !props.userZones) return ''
  
  const type = zoneType.value === 'hr' ? 'Heart Rate' : 'Power'
  const zones = zoneType.value === 'hr' ? props.userZones.hrZones : props.userZones.powerZones
  
  if (!zones || zones.length === 0) return ''
  
  const zoneDetails = zoneSegments.value
    .map((seg) => {
      const zone = zones[seg.zone - 1]
      if (!zone) return null
      
      const hours = Math.floor(seg.time / 3600)
      const minutes = Math.floor((seg.time % 3600) / 60)
      const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
      
      return `${zone.name}: ${timeStr} (${seg.percentage.toFixed(1)}%)`
    })
    .filter(Boolean)
    .join('\n')
  
  return `Weekly ${type} Zone Distribution:\n${zoneDetails}`
})

async function fetchData() {
  if (!props.autoLoad && !props.streams) return
  if (props.workoutIds.length === 0 && (!props.streams || props.streams.length === 0)) return
  
  loading.value = true
  
  try {
    let streams = props.streams
    
    if (!streams) {
      // Fetch stream data for all workouts in one request
      streams = await $fetch<any[]>('/api/workouts/streams', {
        method: 'POST',
        body: { workoutIds: props.workoutIds }
      }).catch(() => [])
    }
    
    // Aggregate zone data
    const hrZoneTimes = new Array(5).fill(0)
    const powerZoneTimes = new Array(5).fill(0)
    let hasHrData = false
    let hasPowerData = false
    
    streams.forEach(stream => {
      if (!stream) return
      
      // Process HR zones
      if ('heartrate' in stream && Array.isArray(stream.heartrate) && props.userZones?.hrZones) {
        hasHrData = true
        stream.heartrate.forEach((hr: number) => {
          if (hr === null || hr === undefined) return
          const zoneIndex = getZoneIndex(hr, props.userZones.hrZones)
          if (zoneIndex >= 0) hrZoneTimes[zoneIndex]++
        })
      }
      
      // Process Power zones
      if ('watts' in stream && Array.isArray(stream.watts) && props.userZones?.powerZones) {
        hasPowerData = true
        stream.watts.forEach((watts: number) => {
          if (watts === null || watts === undefined) return
          const zoneIndex = getZoneIndex(watts, props.userZones.powerZones)
          if (zoneIndex >= 0) powerZoneTimes[zoneIndex]++
        })
      }
    })
    
    // Prefer power if available, otherwise use HR
    if (hasPowerData) {
      zoneType.value = 'power'
      aggregatedZones.value = powerZoneTimes
    } else if (hasHrData) {
      zoneType.value = 'hr'
      aggregatedZones.value = hrZoneTimes
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
watch(() => [props.workoutIds, props.userZones, props.streams], () => {
  if ((props.autoLoad || props.streams) && props.userZones) {
    fetchData()
  }
}, { immediate: true })

// Expose fetch method
defineExpose({
  fetchData
})
</script>