<template>
  <div class="space-y-6">
    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-8">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
        <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">Calculating advanced metrics...</p>
      </div>
    </div>

    <!-- Data Display -->
    <div v-else-if="data && data.advanced" class="space-y-6">
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <!-- 1. Aerobic Decoupling (Drift) & EF Decay -->
        <div
          class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 border-l-4"
          :class="getDriftColor(data.advanced.decoupling)"
        >
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Aerobic Decoupling
            </h3>
            <UPopover mode="hover">
              <UIcon
                name="i-heroicons-information-circle"
                class="w-4 h-4 text-gray-400 cursor-help"
              />
              <template #content>
                <div class="p-3 text-xs max-w-xs">
                  Measures the drift between Power and Heart Rate. &lt; 5% is good aerobic fitness.
                  &gt; 5% indicates fatigue.
                </div>
              </template>
            </UPopover>
          </div>

          <div v-if="data.advanced.decoupling !== null">
            <div class="text-3xl font-bold text-gray-900 dark:text-white">
              {{ data.advanced.decoupling.toFixed(1) }}%
            </div>
            <div class="text-xs text-gray-500 mt-2">
              <span
                v-if="data.advanced.decoupling < 5"
                class="text-green-600 dark:text-green-400 font-medium"
                >Good Endurance</span
              >
              <span v-else class="text-amber-600 dark:text-amber-400 font-medium">High Drift</span>
            </div>

            <!-- EF Decay Chart -->
            <div
              v-if="data.chartData && data.chartData.ef && data.chartData.ef.length > 0"
              class="mt-4 h-24"
            >
              <Line :data="getEfChartData()" :options="getSparklineOptions('Efficiency Factor')" />
            </div>
          </div>
          <div v-else class="text-gray-400 text-sm italic">
            Not enough steady data to calculate.
          </div>
        </div>

        <!-- 2. W' Balance (Anaerobic Battery) -->
        <div
          class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 border-l-4 border-purple-500"
        >
          <div class="flex items-center justify-between mb-2">
            <div class="flex flex-col">
              <h3
                class="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                Anaerobic Battery (W' Bal)
              </h3>
              <div v-if="data.advanced.ftpUsed" class="text-[10px] text-gray-400 font-medium">
                USING {{ data.advanced.ftpUsed }}W FTP
              </div>
            </div>
            <UPopover mode="hover">
              <UIcon
                name="i-heroicons-information-circle"
                class="w-4 h-4 text-gray-400 cursor-help"
              />
              <template #content>
                <div class="p-3 text-xs max-w-xs">
                  Your "matchbook". Shows how much anaerobic energy you have left. Drains above FTP,
                  recharges below.
                </div>
              </template>
            </UPopover>
          </div>

          <div v-if="data.advanced.wPrime">
            <div class="text-3xl font-bold text-gray-900 dark:text-white">
              {{ Math.round(data.advanced.wPrime.minWPrimeBalance / 1000) }} kJ
            </div>
            <div class="text-xs text-gray-500 mt-2">Lowest Point (Max Depletion)</div>

            <!-- W' Balance Chart -->
            <div
              v-if="data.chartData && data.chartData.wPrime && data.chartData.wPrime.length > 0"
              class="mt-4 h-24"
            >
              <Line
                :data="getWPrimeChartData()"
                :options="getSparklineOptions('W\' Balance (J)')"
              />
            </div>
          </div>
          <div v-else class="text-gray-400 text-sm italic">Requires Power and FTP data.</div>
        </div>

        <!-- 3. Quadrant Analysis (Pedaling Style) -->
        <div
          class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 border-l-4 border-orange-500"
        >
          <div class="flex items-center justify-between mb-2">
            <div class="flex flex-col">
              <h3
                class="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                Cadence Profile
              </h3>
              <div v-if="data.advanced.ftpUsed" class="text-[10px] text-gray-400 font-medium">
                USING {{ data.advanced.ftpUsed }}W FTP
              </div>
            </div>
            <UPopover mode="hover">
              <UIcon
                name="i-heroicons-information-circle"
                class="w-4 h-4 text-gray-400 cursor-help"
              />
              <template #content>
                <div class="p-3 text-xs max-w-xs">
                  Distribution of pedaling style based on Power and Cadence.
                </div>
              </template>
            </UPopover>
          </div>

          <div v-if="data.advanced.quadrants" class="space-y-3">
            <!-- Q1: Sprint -->
            <div class="space-y-1">
              <div class="flex justify-between text-xs">
                <span>Sprint (Hi Pwr / Hi Cad)</span>
                <span class="font-medium"
                  >{{ data.advanced.quadrants.distribution.q1.toFixed(1) }}%</span
                >
              </div>
              <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                <div
                  class="bg-red-500 h-1.5 rounded-full"
                  :style="{ width: `${data.advanced.quadrants.distribution.q1}%` }"
                />
              </div>
            </div>

            <!-- Q2: Grind -->
            <div class="space-y-1">
              <div class="flex justify-between text-xs">
                <span>Grind (Hi Pwr / Lo Cad)</span>
                <span class="font-medium"
                  >{{ data.advanced.quadrants.distribution.q2.toFixed(1) }}%</span
                >
              </div>
              <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                <div
                  class="bg-orange-500 h-1.5 rounded-full"
                  :style="{ width: `${data.advanced.quadrants.distribution.q2}%` }"
                />
              </div>
            </div>

            <!-- Q4: Spin -->
            <div class="space-y-1">
              <div class="flex justify-between text-xs">
                <span>Spin (Lo Pwr / Hi Cad)</span>
                <span class="font-medium"
                  >{{ data.advanced.quadrants.distribution.q4.toFixed(1) }}%</span
                >
              </div>
              <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                <div
                  class="bg-yellow-400 h-1.5 rounded-full"
                  :style="{ width: `${data.advanced.quadrants.distribution.q4}%` }"
                />
              </div>
            </div>
            <!-- Q3: Recovery (Optional to show if dominant) -->
            <div class="text-xs text-gray-400 text-right mt-1">
              Recovery/Coast: {{ data.advanced.quadrants.distribution.q3.toFixed(1) }}%
            </div>
          </div>
          <div v-else class="text-gray-400 text-sm italic">Requires Power and Cadence data.</div>
        </div>

        <!-- 4. Coasting Analysis -->
        <div
          class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 border-l-4 border-blue-500"
        >
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Micro-Rests
            </h3>
            <UPopover mode="hover">
              <UIcon
                name="i-heroicons-information-circle"
                class="w-4 h-4 text-gray-400 cursor-help"
              />
              <template #content>
                <div class="p-3 text-xs max-w-xs">
                  Time spent moving but not pedaling (0 watts or 0 cadence). Helps analyze
                  efficiency and recovery.
                </div>
              </template>
            </UPopover>
          </div>

          <div v-if="data.advanced.coasting">
            <div class="flex items-end gap-2">
              <span class="text-3xl font-bold text-gray-900 dark:text-white">
                {{ formatDuration(data.advanced.coasting.totalTime) }}
              </span>
              <span class="text-sm text-gray-500 mb-1">
                ({{ data.advanced.coasting.percentTime.toFixed(1) }}%)
              </span>
            </div>

            <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mt-3">
              <div
                class="bg-blue-600 h-2.5 rounded-full"
                :style="{ width: `${Math.min(100, data.advanced.coasting.percentTime)}%` }"
              />
            </div>

            <div class="text-xs text-gray-500 mt-2">
              {{ data.advanced.coasting.eventCount }} coasting events detected
            </div>
          </div>
          <div v-else class="text-gray-400 text-sm italic">No power/cadence data available.</div>
        </div>

        <!-- 5. Matches Burnt -->
        <div
          class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 border-l-4 border-red-500"
        >
          <div class="flex items-center justify-between mb-2">
            <div class="flex flex-col">
              <h3
                class="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                Matches Burnt
              </h3>
              <div v-if="data.advanced.ftpUsed" class="text-[10px] text-gray-400 font-medium">
                USING {{ data.advanced.ftpUsed }}W FTP
              </div>
            </div>
            <UPopover mode="hover">
              <UIcon
                name="i-heroicons-information-circle"
                class="w-4 h-4 text-gray-400 cursor-help"
              />
              <template #content>
                <div class="p-3 text-xs max-w-xs">
                  Surges above 120% FTP that require significant recovery. "Burning a match"
                  depletes your anaerobic battery.
                </div>
              </template>
            </UPopover>
          </div>

          <div v-if="data.advanced.surges">
            <div class="flex items-baseline gap-2">
              <div class="text-3xl font-bold text-gray-900 dark:text-white">
                {{ data.advanced.surges.length }}
              </div>
              <div class="text-sm text-gray-500">surges >120% FTP</div>
            </div>

            <div
              v-if="data.advanced.surges.length > 0"
              class="mt-3 text-xs text-gray-600 dark:text-gray-400"
            >
              Avg Duration:
              {{
                Math.round(
                  data.advanced.surges.reduce((a: any, b: any) => a + b.duration, 0) /
                    data.advanced.surges.length
                )
              }}s
            </div>
          </div>
          <div v-else class="text-gray-400 text-sm italic">No surge data available.</div>
        </div>

        <!-- 6. Fatigue Sensitivity (Late Fade) -->
        <div
          class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 border-l-4"
          :class="getFadeColor(data.advanced.fatigueSensitivity?.decay)"
        >
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Endurance Fade
            </h3>
            <UPopover mode="hover">
              <UIcon
                name="i-heroicons-information-circle"
                class="w-4 h-4 text-gray-400 cursor-help"
              />
              <template #content>
                <div class="p-3 text-xs max-w-xs">
                  Efficiency loss (Power/HR) comparing the first 20% vs the last 20% of the workout.
                  Higher decay indicates faster fatigue.
                </div>
              </template>
            </UPopover>
          </div>

          <div v-if="data.advanced.fatigueSensitivity">
            <div class="text-3xl font-bold text-gray-900 dark:text-white">
              {{ data.advanced.fatigueSensitivity.decay.toFixed(1) }}%
            </div>
            <div class="text-xs text-gray-500 mt-2">
              <span
                v-if="data.advanced.fatigueSensitivity.decay < 5"
                class="text-green-600 dark:text-green-400 font-medium"
                >Strong Finish</span
              >
              <span
                v-else-if="data.advanced.fatigueSensitivity.decay < 10"
                class="text-amber-600 dark:text-amber-400 font-medium"
                >Moderate Fatigue</span
              >
              <span v-else class="text-red-600 dark:text-red-400 font-medium"
                >High Efficiency Loss</span
              >
            </div>
          </div>
          <div v-else class="text-gray-400 text-sm italic">
            Requires Power and HR data for full duration.
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- 7. Stability Metrics -->
        <div
          class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 border-l-4 border-emerald-500"
        >
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Effort Stability
            </h3>
            <UPopover mode="hover">
              <UIcon
                name="i-heroicons-information-circle"
                class="w-4 h-4 text-gray-400 cursor-help"
              />
              <template #content>
                <div class="p-3 text-xs max-w-xs">
                  Variation in effort (Power/Pace). Lower percentage means more stable and
                  disciplined delivery.
                </div>
              </template>
            </UPopover>
          </div>

          <div v-if="data.advanced.powerStability || data.advanced.paceStability">
            <div class="flex items-baseline gap-4">
              <div v-if="data.advanced.powerStability">
                <div class="text-3xl font-bold text-gray-900 dark:text-white">
                  {{ data.advanced.powerStability.overallCoV.toFixed(1) }}%
                </div>
                <div class="text-[10px] text-gray-500 uppercase">Power Variation</div>
              </div>
              <div v-if="data.advanced.paceStability">
                <div class="text-3xl font-bold text-gray-900 dark:text-white">
                  {{ data.advanced.paceStability.overallCoV.toFixed(1) }}%
                </div>
                <div class="text-[10px] text-gray-500 uppercase">Pace Variation</div>
              </div>
            </div>

            <div class="mt-4 flex gap-1">
              <div
                v-for="i in (
                  data.advanced.powerStability || data.advanced.paceStability
                ).intervalStability.slice(0, 8)"
                :key="i.index"
                class="flex-1 h-8 rounded-xs"
                :class="i.cov < 5 ? 'bg-green-500' : i.cov < 10 ? 'bg-amber-500' : 'bg-red-500'"
                :title="`${i.label}: ${i.cov.toFixed(1)}% variation`"
              />
            </div>
            <div class="text-[10px] text-gray-400 mt-1">Stability per interval (Work segments)</div>
          </div>
          <div v-else class="text-gray-400 text-sm italic">
            Not enough steady data to calculate.
          </div>
        </div>

        <!-- 8. Recovery Rate Trend -->
        <div
          v-if="data.advanced.recoveryTrend && data.advanced.recoveryTrend.length > 0"
          class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 border-l-4 border-green-400"
        >
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              HR Recovery Trend
            </h3>
            <UPopover mode="hover">
              <UIcon
                name="i-heroicons-information-circle"
                class="w-4 h-4 text-gray-400 cursor-help"
              />
              <template #content>
                <div class="p-3 text-xs max-w-xs">
                  How much your heart rate drops in the first 60 seconds after each work interval.
                  Consistent or improving drops indicate good fitness.
                </div>
              </template>
            </UPopover>
          </div>

          <div class="h-40">
            <Line :data="getRecoveryTrendChartData()" :options="getRecoveryChartOptions()" />
          </div>
        </div>
      </div>

      <!-- Detailed Match Analysis Table -->
      <div
        v-if="data.advanced.surges && data.advanced.surges.length > 0"
        class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden"
      >
        <div
          class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          @click="showMatches = !showMatches"
        >
          <div class="flex items-center gap-2">
            <UIcon
              :name="showMatches ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
              class="w-5 h-5 text-gray-500"
            />
            <h3 class="text-lg font-bold text-gray-900 dark:text-white">Match Analysis Details</h3>
          </div>
        </div>

        <div v-if="showMatches" class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  Start Time
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  Duration
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  Avg Power
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  Max Power
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  Recovery Cost (60s)
                </th>
              </tr>
            </thead>
            <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              <tr v-for="(surge, idx) in data.advanced.surges" :key="idx">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ formatTime(surge.start_time) }}
                </td>
                <td
                  class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white"
                >
                  {{ surge.duration }}s
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-amber-600 font-bold">
                  {{ surge.avg_power }}W
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                  {{ surge.max_power }}W
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ surge.cost_avg_power }}W avg
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { Line } from 'vue-chartjs'
  import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
  } from 'chart.js'

  ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
  )

  const props = defineProps<{
    workoutId: string
    publicToken?: string
  }>()

  const loading = ref(true)
  const data = ref<any>(null)
  const showMatches = ref(false)

  async function fetchData() {
    loading.value = true
    try {
      const endpoint = props.publicToken
        ? `/api/share/workouts/${props.publicToken}/intervals`
        : `/api/workouts/${props.workoutId}/intervals`

      data.value = await $fetch(endpoint)
    } catch (e) {
      console.error(e)
    } finally {
      loading.value = false
    }
  }

  function getDriftColor(val: number | null) {
    if (val === null) return 'border-gray-200 dark:border-gray-700'
    if (val < 5) return 'border-green-500' // Good
    if (val < 10) return 'border-yellow-500' // Moderate
    return 'border-red-500' // High
  }

  function getFadeColor(val: number | null | undefined) {
    if (val === undefined || val === null) return 'border-gray-200 dark:border-gray-700'
    if (val < 5) return 'border-green-500' // Excellent
    if (val < 10) return 'border-amber-500' // Warning
    return 'border-red-500' // Heavy Fade
  }

  function formatDuration(seconds: number) {
    const mins = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    return `${mins}m ${secs}s`
  }

  function formatTime(seconds: number) {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.round(seconds % 60)

    if (hours > 0)
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Chart Helpers
  function getSparklineOptions(label: string) {
    const isDark = document.documentElement.classList.contains('dark')

    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index' as const,
          intersect: false,
          callbacks: {
            label: (ctx: any) => `${label}: ${Math.round(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: { display: false },
        y: {
          display: false,
          beginAtZero: false
        }
      },
      elements: {
        point: { radius: 0, hoverRadius: 4 },
        line: { borderWidth: 2 }
      },
      layout: { padding: 0 }
    }
  }

  function getWPrimeChartData() {
    if (!data.value?.chartData?.wPrime) return { labels: [], datasets: [] }

    const values = data.value.chartData.wPrime
    // Ensure we have labels matching the data length (approx)
    // We can just use indices for sparklines as X axis is hidden
    const labels = values.map((_: any, i: number) => i)

    return {
      labels,
      datasets: [
        {
          label: "W' Balance",
          data: values,
          borderColor: 'rgb(168, 85, 247)', // Purple
          backgroundColor: 'rgba(168, 85, 247, 0.1)',
          fill: true,
          tension: 0.1
        }
      ]
    }
  }

  function getEfChartData() {
    if (!data.value?.chartData?.ef) return { labels: [], datasets: [] }

    const values = data.value.chartData.ef
    const labels = values.map((_: any, i: number) => i)

    return {
      labels,
      datasets: [
        {
          label: 'Efficiency Factor',
          data: values,
          borderColor: 'rgb(34, 197, 94)', // Green
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          fill: false,
          tension: 0.4
        }
      ]
    }
  }

  function getRecoveryTrendChartData() {
    if (!data.value?.advanced?.recoveryTrend) return { labels: [], datasets: [] }

    const trends = data.value.advanced.recoveryTrend
    const labels = trends.map((t: any) => `Interval ${t.intervalIndex + 1}`)
    const drops = trends.map((t: any) => t.drop60s)

    return {
      labels,
      datasets: [
        {
          label: 'HR Drop (60s)',
          data: drops,
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6
        }
      ]
    }
  }

  function getRecoveryChartOptions() {
    const isDark = document.documentElement.classList.contains('dark')

    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: any) => `Recovery: -${ctx.parsed.y} bpm`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: isDark ? '#9CA3AF' : '#4B5563' },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          ticks: { color: isDark ? '#9CA3AF' : '#4B5563' },
          grid: { color: isDark ? 'rgba(75, 85, 99, 0.2)' : 'rgba(209, 213, 219, 0.4)' },
          title: {
            display: true,
            text: 'BPM Drop',
            color: isDark ? '#9CA3AF' : '#4B5563'
          }
        }
      }
    }
  }

  onMounted(() => {
    fetchData()
  })
</script>
