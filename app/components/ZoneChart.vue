<template>
  <div class="space-y-4">
    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-8">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
        <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">Loading zone data...</p>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="text-center py-8">
      <p class="text-sm text-gray-600 dark:text-gray-400">{{ error }}</p>
    </div>

    <!-- No Data State -->
    <div v-else-if="!hasZoneData" class="text-center py-8 bg-gray-50 dark:bg-gray-900 rounded-lg">
      <p class="text-sm text-gray-600 dark:text-gray-400">No zone data available</p>
      <p class="text-xs text-gray-500 dark:text-gray-500 mt-2">
        {{
          !hasStreamData
            ? 'Stream data not available for this workout'
            : 'No HR or Power data available'
        }}
      </p>
    </div>

    <!-- Zone Chart -->
    <div v-else class="space-y-4">
      <!-- Zone Type Selector -->
      <div v-if="hasHrData && hasPowerData" class="flex gap-2">
        <button
          v-for="type in ['hr', 'power'] as const"
          :key="type"
          :class="[
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            selectedZoneType === type
              ? 'bg-primary-500 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
          ]"
          @click="selectedZoneType = type as 'hr' | 'power'"
        >
          {{ type === 'hr' ? 'Heart Rate Zones' : 'Power Zones' }}
        </button>
      </div>

      <!-- Chart Container -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <!-- Stacked Bar Chart -->
        <div v-if="chartData.datasets.length > 0">
          <div class="mb-4">
            <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300">
              {{ selectedZoneType === 'hr' ? 'Heart Rate' : 'Power' }} Zone Distribution
            </h3>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Color-coded timeline showing which zone you were in throughout the workout
            </p>
          </div>
          <div style="height: 200px; position: relative">
            <Bar :data="chartData" :options="chartOptions" />
          </div>
        </div>

        <!-- Zone Legend -->
        <div class="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          <div v-for="(zone, index) in currentZones" :key="index" class="flex items-center gap-2">
            <div
              class="w-4 h-4 rounded"
              :style="{ backgroundColor: getZoneColor(Number(index)) }"
            />
            <div class="text-xs">
              <div class="font-medium text-gray-700 dark:text-gray-300">{{ zone.name }}</div>
              <div class="text-gray-500 dark:text-gray-400">
                {{ zone.min }}-{{ zone.max }} {{ selectedZoneType === 'hr' ? 'bpm' : 'W' }}
              </div>
            </div>
          </div>
        </div>

        <!-- Training Distribution Profile -->
        <div v-if="trainingProfile" class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">
              Training Distribution Profile
            </h4>
          </div>
          <div :class="getProfileBadgeClass(trainingProfile.type)" class="p-4 rounded-lg">
            <div class="flex items-start gap-3">
              <div class="flex-shrink-0">
                <UIcon :name="getProfileIcon(trainingProfile.type)" class="w-8 h-8" />
              </div>
              <div class="flex-1">
                <h5 class="font-bold text-lg mb-1">{{ trainingProfile.type }}</h5>
                <p class="text-sm opacity-90">{{ trainingProfile.description }}</p>
                <div class="mt-2 text-xs opacity-75">
                  <span class="font-medium">Zone Distribution:</span>
                  {{ trainingProfile.distribution }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Time in Zone Summary -->
        <div v-if="timeInZones.length > 0" class="mt-6">
          <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Time in Zone Summary
          </h4>
          <div class="space-y-2">
            <div v-for="(zone, index) in currentZones" :key="index" class="relative">
              <div class="flex justify-between text-xs mb-1">
                <span class="font-medium text-gray-600 dark:text-gray-400">{{ zone.name }}</span>
                <span class="text-gray-500 dark:text-gray-400">
                  {{ formatDuration(timeInZones[Number(index)] || 0) }}
                  ({{
                    totalTime > 0
                      ? (((timeInZones[Number(index)] || 0) / totalTime) * 100).toFixed(1)
                      : 0
                  }}%)
                </span>
              </div>
              <div class="h-2 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  class="h-full transition-all duration-500"
                  :style="{
                    width:
                      (totalTime > 0 ? ((timeInZones[Number(index)] || 0) / totalTime) * 100 : 0) +
                      '%',
                    backgroundColor: getZoneColor(Number(index))
                  }"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { Bar } from 'vue-chartjs'
  import {
    Chart as ChartJS,
    Title,
    Tooltip,
    Legend,
    BarElement,
    CategoryScale,
    LinearScale,
    type ChartOptions
  } from 'chart.js'
  import { getZoneColor } from '~/utils/zone-colors'
  import { getPreferredMetric } from '~/utils/sportSettings'

  ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale)

  interface Props {
    workoutId: string
    publicToken?: string
    activityType?: string
    streamData?: any
  }

  const props = defineProps<Props>()

  const loading = ref(true)
  const error = ref<string | null>(null)
  const localStreamData = ref<any>(null)
  const userZones = ref<any>(null)
  const selectedZoneType = ref<'hr' | 'power' | 'pace'>('hr')

  // Computed properties
  const hasStreamData = computed(() => {
    return !!(
      localStreamData.value &&
      (localStreamData.value.heartrate ||
        localStreamData.value.watts ||
        localStreamData.value.hrZoneTimes ||
        localStreamData.value.powerZoneTimes)
    )
  })

  const hasHrData = computed(() => {
    return !!(
      localStreamData.value?.heartrate?.length > 0 || localStreamData.value?.hrZoneTimes?.length > 0
    )
  })

  const hasPowerData = computed(() => {
    return !!(
      localStreamData.value?.watts?.length > 0 || localStreamData.value?.powerZoneTimes?.length > 0
    )
  })

  const hasZoneData = computed(() => {
    return hasStreamData.value && currentZones.value && currentZones.value.length > 0
  })

  const currentZones = computed(() => {
    if (!userZones.value) return []
    return selectedZoneType.value === 'hr' ? userZones.value.hrZones : userZones.value.powerZones
  })

  const timeInZones = ref<number[]>([])
  const totalTime = ref(0)

  // Watch for data changes to update timeInZones if cached data is present
  watch(
    [localStreamData, selectedZoneType],
    () => {
      if (!localStreamData.value) return

      if (selectedZoneType.value === 'hr' && localStreamData.value.hrZoneTimes?.length > 0) {
        timeInZones.value = localStreamData.value.hrZoneTimes
        totalTime.value = timeInZones.value.reduce((a, b) => a + b, 0)
      } else if (
        selectedZoneType.value === 'power' &&
        localStreamData.value.powerZoneTimes?.length > 0
      ) {
        timeInZones.value = localStreamData.value.powerZoneTimes
        totalTime.value = timeInZones.value.reduce((a, b) => a + b, 0)
      }
    },
    { immediate: true }
  )

  // Training distribution profile
  interface TrainingProfile {
    type: 'Polarized' | 'Pyramidal' | 'Threshold' | 'HIIT' | 'Base' | 'Mixed'
    description: string
    distribution: string
    confidence: number
  }

  const trainingProfile = computed<TrainingProfile | null>(() => {
    if (timeInZones.value.length < 5 || totalTime.value === 0) return null

    // Calculate percentages for each zone
    const percentages = timeInZones.value.map((time) => (time / totalTime.value) * 100)

    // Categorize zones into groups (with null checks)
    const z1z2 = (percentages[0] || 0) + (percentages[1] || 0) // Easy/Endurance (Z1+Z2)
    const z3 = percentages[2] || 0 // Tempo (Z3)
    const z4z5 = (percentages[3] || 0) + (percentages[4] || 0) // Threshold/VO2 Max (Z4+Z5)

    // Detection logic with confidence scoring
    let profile: TrainingProfile

    // HIIT: >30% in Z4-Z5, minimal Z1-Z2
    if (z4z5 > 30 && z1z2 < 50) {
      profile = {
        type: 'HIIT',
        description: 'High-intensity interval training with significant time at maximum effort',
        distribution: `${z4z5.toFixed(0)}% high intensity, ${z3.toFixed(0)}% tempo, ${z1z2.toFixed(0)}% easy`,
        confidence: Math.min(100, z4z5 * 2)
      }
    }
    // Threshold: >40% in Z3-Z4
    else if (z3 + (percentages[3] || 0) > 40) {
      profile = {
        type: 'Threshold',
        description: 'Sustained effort at or near lactate threshold, building race-pace endurance',
        distribution: `${(z3 + (percentages[3] || 0)).toFixed(0)}% tempo/threshold, ${z1z2.toFixed(0)}% easy, ${(percentages[4] || 0).toFixed(0)}% hard`,
        confidence: Math.min(100, (z3 + (percentages[3] || 0)) * 1.5)
      }
    }
    // Polarized: >70% in Z1-Z2 and >15% in Z4-Z5, <15% in Z3
    else if (z1z2 > 70 && z4z5 > 15 && z3 < 15) {
      profile = {
        type: 'Polarized',
        description:
          'Optimal training distribution: easy base work with intense intervals, avoiding moderate zones',
        distribution: `${z1z2.toFixed(0)}% easy, ${z3.toFixed(0)}% tempo, ${z4z5.toFixed(0)}% hard`,
        confidence: Math.min(100, (z1z2 + z4z5) / 2)
      }
    }
    // Base: >80% in Z1-Z2
    else if (z1z2 > 80) {
      profile = {
        type: 'Base',
        description:
          'Aerobic base building with easy, sustainable effort for endurance development',
        distribution: `${z1z2.toFixed(0)}% easy aerobic, ${z3.toFixed(0)}% tempo, ${z4z5.toFixed(0)}% hard`,
        confidence: Math.min(100, z1z2)
      }
    }
    // Pyramidal: Progressive decrease from Z2 to Z5
    else if (
      (percentages[1] || 0) > (percentages[2] || 0) &&
      (percentages[2] || 0) > (percentages[3] || 0)
    ) {
      profile = {
        type: 'Pyramidal',
        description:
          'Traditional volume-based training with most time at moderate intensity, tapering to high intensity',
        distribution: `${z1z2.toFixed(0)}% easy, ${z3.toFixed(0)}% tempo, ${z4z5.toFixed(0)}% hard`,
        confidence: 70
      }
    }
    // Mixed: Doesn't fit clear pattern
    else {
      profile = {
        type: 'Mixed',
        description:
          'Varied intensity distribution across multiple zones, typical of group rides or races',
        distribution: `${z1z2.toFixed(0)}% easy, ${z3.toFixed(0)}% tempo, ${z4z5.toFixed(0)}% hard`,
        confidence: 60
      }
    }

    return profile
  })

  // Calculate zone distribution for chart
  const chartData = computed(() => {
    if (!hasZoneData.value || !localStreamData.value) {
      return { labels: [], datasets: [] }
    }

    const time = localStreamData.value.time || []
    const values =
      selectedZoneType.value === 'hr'
        ? localStreamData.value.heartrate
        : localStreamData.value.watts

    if (!values || values.length === 0) {
      return { labels: [], datasets: [] }
    }

    // Sample data for performance (every 30 seconds or every 30th point)
    const sampleRate = Math.max(1, Math.floor(values.length / 200))
    const sampledTime = time.filter((_: any, i: number) => i % sampleRate === 0)
    const sampledValues = values.filter((_: any, i: number) => i % sampleRate === 0)

    // Calculate which zone each point belongs to
    const zoneData = currentZones.value.map(() => new Array(sampledTime.length).fill(0))

    sampledValues.forEach((value: number, i: number) => {
      const zoneIndex = getZoneIndex(value)
      if (zoneIndex >= 0) {
        zoneData[zoneIndex][i] = 1 // Mark this zone as active at this time
      }
    })

    return {
      labels: sampledTime.map((t: number) => formatTime(t)),
      datasets: currentZones.value.map((zone: any, index: number) => ({
        label: zone.name,
        data: zoneData[index],
        backgroundColor: getZoneColor(index),
        borderWidth: 0,
        barThickness: 'flex',
        maxBarThickness: 10
      }))
    }
  })

  // Calculate summary stats whenever chart data inputs change
  watch(
    () => [localStreamData.value, currentZones.value],
    () => {
      if (!localStreamData.value || !currentZones.value) return

      const time = localStreamData.value.time || []
      const values =
        selectedZoneType.value === 'hr'
          ? localStreamData.value.heartrate
          : localStreamData.value.watts

      if (!values || values.length === 0) {
        timeInZones.value = []
        totalTime.value = 0
        return
      }

      // Sample data for performance
      const sampleRate = Math.max(1, Math.floor(values.length / 200))
      const sampledTime = time.filter((_: any, i: number) => i % sampleRate === 0)
      const sampledValues = values.filter((_: any, i: number) => i % sampleRate === 0)

      const timeInZonesCalc = new Array(currentZones.value.length).fill(0)

      sampledValues.forEach((value: number, i: number) => {
        const zoneIndex = getZoneIndex(value)
        if (zoneIndex >= 0) {
          // Calculate time in zone (approximate from sample rate)
          if (i > 0) {
            const timeDiff = sampledTime[i] - sampledTime[i - 1]
            timeInZonesCalc[zoneIndex] += timeDiff
          }
        }
      })

      timeInZones.value = timeInZonesCalc
      totalTime.value = sampledTime[sampledTime.length - 1] - sampledTime[0]
    }
  )

  const chartOptions = computed<ChartOptions<'bar'>>(() => {
    const isDark =
      typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index' as const,
        intersect: false
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            title: (context: any) => {
              return `Time: ${context[0].label}`
            },
            label: (context: any) => {
              if (context.parsed.y === 1) {
                return context.dataset.label
              }
              return null
            },
            footer: (contexts: any) => {
              const activeZones = contexts.filter((c: any) => c.parsed.y === 1)
              if (activeZones.length > 0) {
                return `Active Zone: ${activeZones[0].dataset.label}`
              }
              return ''
            }
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          ticks: {
            color: isDark ? '#9CA3AF' : '#6B7280',
            maxRotation: 0,
            autoSkipPadding: 50,
            font: {
              size: 10
            }
          },
          grid: {
            display: false
          }
        },
        y: {
          stacked: true,
          display: false,
          max: 1
        }
      },
      layout: {
        padding: {
          left: 5,
          right: 5,
          top: 5,
          bottom: 5
        }
      }
    }
  })

  // Helper functions
  function getZoneIndex(value: number): number {
    if (!currentZones.value || currentZones.value.length === 0) return -1

    for (let i = 0; i < currentZones.value.length; i++) {
      const zone = currentZones.value[i]
      if (value >= zone.min && value <= zone.max) {
        return i
      }
    }

    // If value is above all zones, put it in the highest zone
    if (value > currentZones.value[currentZones.value.length - 1].max) {
      return currentZones.value.length - 1
    }

    return -1
  }

  function formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}`
    }
    return `${minutes}min`
  }

  function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`
    }
    return `${secs}s`
  }

  // Fetch data
  async function fetchData() {
    if (!props.workoutId) return

    // Sync ref with prop if provided
    if (props.streamData) {
      localStreamData.value = props.streamData
    }

    loading.value = true
    error.value = null

    try {
      // Fetch stream data if not provided via props and not already fetched
      if (!localStreamData.value) {
        const url = props.publicToken
          ? `/api/share/workouts/${props.publicToken}/streams`
          : `/api/workouts/${props.workoutId}/streams`

        localStreamData.value = await $fetch<any>(url)
      }

      if (props.workoutId && !userZones.value) {
        // Try to get from workout if provided (it usually includes user)
        const workout = (props as any).workout
        if (workout?.user) {
          const settings = workout.user.sportSettings || []
          const defaultProfile = settings.find((s: any) => s.isDefault)

          userZones.value = {
            hrZones: defaultProfile?.hrZones || workout.user.hrZones || getDefaultHrZones(),
            powerZones:
              defaultProfile?.powerZones || workout.user.powerZones || getDefaultPowerZones(),
            loadPreference: defaultProfile?.loadPreference
          }
        } else {
          // Fetch full profile
          const profile = await $fetch<any>('/api/profile').catch(() => null)
          if (profile?.profile) {
            const sportSettings = profile.profile.sportSettings || []
            let activeProfile = sportSettings.find((s: any) => s.isDefault)

            if (props.activityType) {
              const match = sportSettings.find(
                (s: any) => !s.isDefault && s.types && s.types.includes(props.activityType)
              )
              if (match) activeProfile = match
            }

            userZones.value = {
              hrZones: activeProfile?.hrZones || getDefaultHrZones(),
              powerZones: activeProfile?.powerZones || getDefaultPowerZones(),
              loadPreference: activeProfile?.loadPreference
            }
          }
        }
      }

      // Auto-select zone type based on available data and preference
      if (hasHrData.value || hasPowerData.value) {
        selectedZoneType.value = getPreferredMetric(userZones.value, {
          hasHr: hasHrData.value,
          hasPower: hasPowerData.value
        })
      }
    } catch (e: any) {
      console.error('Error fetching zone data:', e)
      error.value = e.data?.message || 'Failed to load zone data'
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

  function getProfileBadgeClass(type: string) {
    const base = 'border shadow-sm'
    switch (type) {
      case 'HIIT':
        return `${base} bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300`
      case 'Threshold':
        return `${base} bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-300`
      case 'Polarized':
        return `${base} bg-primary-50 border-primary-200 text-primary-700 dark:bg-primary-900/20 dark:border-primary-800 dark:text-primary-300`
      case 'Base':
        return `${base} bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300`
      case 'Pyramidal':
        return `${base} bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300`
      default:
        return `${base} bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300`
    }
  }

  function getProfileIcon(type: string) {
    switch (type) {
      case 'HIIT':
        return 'i-lucide-zap'
      case 'Threshold':
        return 'i-lucide-flame'
      case 'Polarized':
        return 'i-lucide-arrow-up-right'
      case 'Base':
        return 'i-lucide-mountain'
      case 'Pyramidal':
        return 'i-lucide-bar-chart'
      default:
        return 'i-lucide-activity'
    }
  }

  onMounted(() => {
    fetchData()
  })
</script>
