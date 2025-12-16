<template>
  <UTooltip v-if="hasData" :text="tooltipText" :popper="{ placement: 'top' }">
    <div class="w-full h-6 flex gap-[1px] rounded overflow-hidden shadow-sm cursor-help">
      <div
        v-for="(segment, index) in zoneSegments"
        :key="index"
        :style="{
          width: segment.percentage + '%',
          backgroundColor: segment.color
        }"
        class="transition-all duration-200 hover:opacity-80 first:rounded-l last:rounded-r"
      ></div>
    </div>
  </UTooltip>
  <div v-else-if="loading" class="w-full h-6 bg-gray-100 dark:bg-gray-800 rounded animate-pulse"></div>
  <div v-else-if="error" class="w-full h-6 flex items-center justify-center text-xs text-gray-400">
    <!-- Silent fail - no zone data -->
  </div>
</template>

<script setup lang="ts">
interface Props {
  workoutId: string
  autoLoad?: boolean
  streamData?: any
  userZones?: any
}

const props = withDefaults(defineProps<Props>(), {
  autoLoad: true,
  streamData: null,
  userZones: null
})

// Zone colors matching the full ZoneChart component
const zoneColors = [
  'rgb(34, 197, 94)',    // Z1 - Green (Recovery)
  'rgb(59, 130, 246)',   // Z2 - Blue (Endurance)
  'rgb(245, 158, 11)',   // Z3 - Yellow (Tempo)
  'rgb(249, 115, 22)',   // Z4 - Orange (Threshold)
  'rgb(239, 68, 68)',    // Z5 - Red (Anaerobic/VO2 Max)
]

const loading = ref(false)
const error = ref(false)
const streamData = ref<any>(null)
const userZones = ref<any>(null)
const zoneType = ref<'hr' | 'power'>('hr')

const hasData = computed(() => {
  return zoneSegments.value.length > 0
})

const tooltipText = computed(() => {
  if (!hasData.value || !userZones.value || zoneSegments.value.length === 0) return ''
  
  const type = zoneType.value === 'hr' ? 'Heart Rate' : 'Power'
  const zones = zoneType.value === 'hr' ? userZones.value.hrZones : userZones.value.powerZones
  
  if (!zones || zones.length === 0) return ''
  
  // Create simple zone breakdown with percentages only (no time calculation to avoid dependency issues)
  const zoneDetails = zoneSegments.value
    .map((seg) => {
      const zone = zones[seg.zone - 1]
      if (!zone) return null
      
      return `${zone.name}: ${seg.percentage.toFixed(1)}%`
    })
    .filter(Boolean)
    .join('\n')
  
  return `${type} Zone Distribution:\n${zoneDetails}`
})

const zoneSegments = computed(() => {
  if (!streamData.value || !userZones.value) return []
  
  // Check if we have the required data type
  const hasHrData = 'heartrate' in streamData.value && Array.isArray(streamData.value.heartrate)
  const hasPowerData = 'watts' in streamData.value && Array.isArray(streamData.value.watts)
  
  if (!hasHrData && !hasPowerData) return []
  
  const values = zoneType.value === 'hr'
    ? (hasHrData ? streamData.value.heartrate : null)
    : (hasPowerData ? streamData.value.watts : null)
  const zones = zoneType.value === 'hr' ? userZones.value.hrZones : userZones.value.powerZones
  
  if (!values || !zones || values.length === 0) return []
  
  // Calculate time in each zone
  const timeInZones = new Array(zones.length).fill(0)
  let totalSamples = 0
  
  values.forEach((value: number) => {
    if (value === null || value === undefined) return
    
    // Find which zone this value belongs to
    for (let i = 0; i < zones.length; i++) {
      const zone = zones[i]
      if (value >= zone.min && value <= zone.max) {
        timeInZones[i]++
        totalSamples++
        break
      }
      // If above all zones, put in highest zone
      if (i === zones.length - 1 && value > zone.max) {
        timeInZones[i]++
        totalSamples++
        break
      }
    }
  })
  
  if (totalSamples === 0) return []
  
  // Convert to percentages and create segments
  return timeInZones
    .map((time, index) => ({
      percentage: (time / totalSamples) * 100,
      color: zoneColors[index],
      zone: index + 1
    }))
    .filter(seg => seg.percentage > 0) // Only show zones with data
})

// Fetch data
async function fetchData() {
  // If props provided, use them
  if (props.streamData) {
    streamData.value = props.streamData
    userZones.value = props.userZones || { hrZones: getDefaultHrZones(), powerZones: getDefaultPowerZones() }
    
    const hasWatts = props.streamData.watts && Array.isArray(props.streamData.watts) && props.streamData.watts.length > 0
    const hasHr = props.streamData.heartrate && Array.isArray(props.streamData.heartrate) && props.streamData.heartrate.length > 0
    
    if (hasWatts) {
      zoneType.value = 'power'
    } else if (hasHr) {
      zoneType.value = 'hr'
    }
    return
  }

  if (!props.autoLoad) return
  
  loading.value = true
  
  try {
    error.value = false
    // Fetch stream data and user profile in parallel
    const results = await Promise.all([
      $fetch(`/api/workouts/${props.workoutId}/streams`).catch(() => null),
      $fetch('/api/profile').catch(() => null)
    ])
    
    const streams = results[0]
    const profile = results[1]
    
    if (!streams) {
      error.value = true
      loading.value = false
      return
    }
    
    streamData.value = streams
    
    // Set user zones or use defaults
    userZones.value = {
      hrZones: profile?.profile?.hrZones || getDefaultHrZones(),
      powerZones: profile?.profile?.powerZones || getDefaultPowerZones()
    }
    
    // Auto-select zone type: prefer power if available, otherwise use HR
    const hasWatts = streams && 'watts' in streams && streams.watts && Array.isArray(streams.watts) && streams.watts.length > 0
    const hasHr = streams && 'heartrate' in streams && streams.heartrate && Array.isArray(streams.heartrate) && streams.heartrate.length > 0
    
    if (hasWatts) {
      zoneType.value = 'power'
    } else if (hasHr) {
      zoneType.value = 'hr'
    }
  } catch (e) {
    console.error('Error fetching mini zone data:', e)
    error.value = true
  } finally {
    loading.value = false
  }
}

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

// Load data on mount or when props change
watch(() => [props.streamData, props.userZones], () => {
  fetchData()
}, { immediate: true })

// Expose fetch method for manual loading
defineExpose({
  fetchData
})
</script>