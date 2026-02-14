<template>
  <div v-if="hasData" class="w-full h-6 flex gap-[1px] rounded overflow-hidden shadow-sm">
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
        class="h-full w-full transition-all duration-200 hover:opacity-80 first:rounded-l last:rounded-r"
      />
    </UTooltip>
  </div>
  <div v-else-if="loading" class="w-full h-6 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
  <div v-else-if="error" class="w-full h-6 flex items-center justify-center text-xs text-gray-400">
    <!-- Silent fail - no zone data -->
  </div>
</template>

<script setup lang="ts">
  import { getZoneColor } from '~/utils/zone-colors'
  import { getPreferredMetric } from '~/utils/sportSettings'

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

  const loading = ref(false)
  const error = ref(false)
  const dataStream = ref<any>(null)
  const zonesData = ref<any>(null)
  const zoneType = ref<'hr' | 'power' | 'pace'>('hr')

  const hasData = computed(() => {
    return zoneSegments.value.length > 0
  })

  function getSegmentTooltip(segment: any) {
    if (!zonesData.value) return ''
    const zones = zoneType.value === 'hr' ? zonesData.value.hrZones : zonesData.value.powerZones
    if (!zones) return ''

    const zone = zones[segment.zone - 1]
    if (!zone) return ''

    const suffix = zoneType.value === 'hr' ? ' (HR)' : ' (Power)'
    return `${zone.name}: ${segment.percentage.toFixed(1)}%${suffix}`
  }

  const zoneSegments = computed(() => {
    if (!dataStream.value || !zonesData.value) return []

    // Check if we have the required data type
    const hasHrData = 'heartrate' in dataStream.value && Array.isArray(dataStream.value.heartrate)
    const hasPowerData = 'watts' in dataStream.value && Array.isArray(dataStream.value.watts)
    const hasCachedHrZones =
      'hrZoneTimes' in dataStream.value &&
      Array.isArray(dataStream.value.hrZoneTimes) &&
      dataStream.value.hrZoneTimes.length > 0
    const hasCachedPowerZones =
      'powerZoneTimes' in dataStream.value &&
      Array.isArray(dataStream.value.powerZoneTimes) &&
      dataStream.value.powerZoneTimes.length > 0

    if (!hasHrData && !hasPowerData && !hasCachedHrZones && !hasCachedPowerZones) return []

    // Use cached zone times if available
    if (zoneType.value === 'hr' && hasCachedHrZones) {
      const cached = dataStream.value.hrZoneTimes as number[]
      const total = cached.reduce((a, b) => a + b, 0)
      if (total === 0) return []
      return cached
        .map((time, index) => ({
          percentage: (time / total) * 100,
          color: getZoneColor(index),
          zone: index + 1
        }))
        .filter((seg) => seg.percentage > 0)
    }

    if (zoneType.value === 'power' && hasCachedPowerZones) {
      const cached = dataStream.value.powerZoneTimes as number[]
      const total = cached.reduce((a, b) => a + b, 0)
      if (total === 0) return []
      return cached
        .map((time, index) => ({
          percentage: (time / total) * 100,
          color: getZoneColor(index),
          zone: index + 1
        }))
        .filter((seg) => seg.percentage > 0)
    }

    const values =
      zoneType.value === 'hr'
        ? hasHrData
          ? dataStream.value.heartrate
          : null
        : hasPowerData
          ? dataStream.value.watts
          : null
    const zones = zoneType.value === 'hr' ? zonesData.value.hrZones : zonesData.value.powerZones

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
        color: getZoneColor(index),
        zone: index + 1
      }))
      .filter((seg) => seg.percentage > 0) // Only show zones with data
  })

  // Fetch data
  async function fetchData() {
    // If props provided, use them
    if (props.streamData) {
      dataStream.value = props.streamData
      zonesData.value = props.userZones || {
        hrZones: getDefaultHrZones(),
        powerZones: getDefaultPowerZones()
      }

      const hasWatts =
        props.streamData.watts &&
        Array.isArray(props.streamData.watts) &&
        props.streamData.watts.length > 0
      const hasHr =
        props.streamData.heartrate &&
        Array.isArray(props.streamData.heartrate) &&
        props.streamData.heartrate.length > 0
      const hasCachedHr =
        props.streamData.hrZoneTimes &&
        Array.isArray(props.streamData.hrZoneTimes) &&
        props.streamData.hrZoneTimes.length > 0
      const hasCachedPower =
        props.streamData.powerZoneTimes &&
        Array.isArray(props.streamData.powerZoneTimes) &&
        props.streamData.powerZoneTimes.length > 0

      if (hasHr || hasCachedHr || hasWatts || hasCachedPower) {
        zoneType.value = getPreferredMetric(zonesData.value, {
          hasHr: !!(hasHr || hasCachedHr),
          hasPower: !!(hasWatts || hasCachedPower)
        })
      }
      return
    }

    if (!props.autoLoad) return

    loading.value = true

    try {
      error.value = false

      // Use props.userZones if available, otherwise fetch profile
      let profile = null
      if (!props.userZones) {
        // Fetch stream data and user profile in parallel if zones missing
        const results = await Promise.all([
          $fetch(`/api/workouts/${props.workoutId}/streams`).catch(() => null),
          $fetch('/api/profile').catch(() => null)
        ])
        dataStream.value = results[0]
        profile = results[1]
      } else {
        // Just fetch streams
        dataStream.value = await $fetch(`/api/workouts/${props.workoutId}/streams`).catch(
          () => null
        )
      }

      const streams = dataStream.value

      if (!streams) {
        error.value = true
        loading.value = false
        return
      }

      // Set user zones or use defaults
      const sportSettings = profile?.profile?.sportSettings || []
      const defaultProfile = sportSettings.find((s: any) => s.isDefault)

      zonesData.value = props.userZones || {
        hrZones: defaultProfile?.hrZones || getDefaultHrZones(),
        powerZones: defaultProfile?.powerZones || getDefaultPowerZones(),
        loadPreference: defaultProfile?.loadPreference
      }

      // Auto-select zone type: respect loadPreference
      const hasWatts =
        streams &&
        'watts' in streams &&
        streams.watts &&
        Array.isArray(streams.watts) &&
        streams.watts.length > 0
      const hasHr =
        streams &&
        'heartrate' in streams &&
        streams.heartrate &&
        Array.isArray(streams.heartrate) &&
        streams.heartrate.length > 0
      const hasCachedHr =
        streams &&
        'hrZoneTimes' in streams &&
        streams.hrZoneTimes &&
        Array.isArray(streams.hrZoneTimes) &&
        streams.hrZoneTimes.length > 0
      const hasCachedPower =
        streams &&
        'powerZoneTimes' in streams &&
        streams.powerZoneTimes &&
        Array.isArray(streams.powerZoneTimes) &&
        streams.powerZoneTimes.length > 0

      if (hasHr || hasCachedHr || hasWatts || hasCachedPower) {
        zoneType.value = getPreferredMetric(zonesData.value, {
          hasHr: !!(hasHr || hasCachedHr),
          hasPower: !!(hasWatts || hasCachedPower)
        })
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
      { name: 'Z1 Recovery', min: 0, max: 120 },
      { name: 'Z2 Aerobic', min: 121, max: 145 },
      { name: 'Z3 Tempo', min: 146, max: 160 },
      { name: 'Z4 SubThreshold', min: 161, max: 175 },
      { name: 'Z5 SuperThreshold', min: 176, max: 185 },
      { name: 'Z6 Aerobic Capacity', min: 186, max: 200 },
      { name: 'Z7 Anaerobic', min: 201, max: 220 }
    ]
  }

  function getDefaultPowerZones() {
    return [
      { name: 'Z1 Active Recovery', min: 0, max: 137 },
      { name: 'Z2 Endurance', min: 138, max: 187 },
      { name: 'Z3 Tempo', min: 188, max: 225 },
      { name: 'SS Sweet Spot', min: 226, max: 240 },
      { name: 'Z4 Threshold', min: 241, max: 262 },
      { name: 'Z5 VO2 Max', min: 263, max: 300 },
      { name: 'Z6 Anaerobic', min: 301, max: 400 },
      { name: 'Z7 Neuromuscular', min: 401, max: 999 }
    ]
  }

  // Load data on mount or when props change
  watch(
    () => [props.streamData, props.userZones],
    () => {
      fetchData()
    },
    { immediate: true }
  )

  // Expose fetch method for manual loading
  defineExpose({
    fetchData
  })
</script>
