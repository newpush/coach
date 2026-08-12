<template>
  <div
    class="bg-white dark:bg-gray-900 rounded-none sm:rounded-xl shadow-none sm:shadow p-6 border-x-0 sm:border-x border-y border-gray-100 dark:border-gray-800"
  >
    <div
      v-if="loading"
      class="flex flex-col items-center justify-center py-12 text-gray-600 dark:text-gray-400"
    >
      <div
        class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mb-4"
      />
      <p class="text-xs font-black uppercase tracking-widest">Analyzing Pacing...</p>
    </div>

    <div v-else-if="error" class="py-12 text-center">
      <UIcon name="i-heroicons-exclamation-triangle" class="w-12 h-12 text-red-500 mx-auto mb-4" />
      <p class="text-sm font-black text-red-600 dark:text-red-400 uppercase tracking-tight">
        {{ error }}
      </p>
      <p class="mt-2 text-xs font-bold text-gray-500 uppercase tracking-widest">
        Pacing data unavailable for this session.
      </p>
    </div>

    <div v-else-if="streams" class="space-y-10">
      <!-- Summary Metrics -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          class="p-5 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/50 group transition-all cursor-pointer hover:border-blue-500/50 active:scale-[0.98]"
          @click="
            () => {
              void emit('open-metric', {
                key: primaryMetricKey,
                value: primaryMetricValue,
                unit: primaryMetricUnit
              })
            }
          "
        >
          <div class="flex items-center justify-between mb-4">
            <span
              class="block text-[10px] font-black uppercase text-blue-600 dark:text-blue-400 tracking-[0.2em]"
              >{{ primaryMetricLabel }}</span
            >
            <UIcon
              name="i-heroicons-magnifying-glass-circle"
              class="w-4 h-4 text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </div>
          <span class="text-3xl font-black text-blue-900 dark:text-blue-100 tracking-tight">{{
            formattedPrimaryMetric
          }}</span>
        </div>

        <div
          class="p-5 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800/50 group transition-all cursor-pointer hover:border-indigo-500/50 active:scale-[0.98]"
          @click="
            () => {
              void emit('open-metric', {
                key: 'Consistency Variance',
                value: formattedVariabilityValue,
                unit: variabilityUnit
              })
            }
          "
        >
          <div class="flex items-center justify-between mb-4">
            <span
              class="block text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-[0.2em]"
              >Consistency Variance</span
            >
            <UIcon
              name="i-heroicons-magnifying-glass-circle"
              class="w-4 h-4 text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </div>
          <span class="text-3xl font-black text-indigo-900 dark:text-indigo-100 tracking-tight">
            {{ formattedVariabilityValue }}
            <span
              v-if="formattedVariabilityValue !== 'N/A'"
              class="text-xs font-bold text-indigo-400 uppercase ml-1"
            >
              {{ variabilityUnit }}
            </span>
          </span>
        </div>

        <div
          v-if="streams.pacingStrategy && splitVerdictApplicable"
          class="p-5 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800/50 md:col-span-2 lg:col-span-1 group transition-all cursor-pointer hover:border-emerald-500/50 active:scale-[0.98]"
          @click="
            () => {
              emit('open-metric', {
                key: 'Execution Strategy',
                value: formatStrategy(streams?.pacingStrategy?.strategy ?? '')
              })
            }
          "
        >
          <div class="flex items-center justify-between mb-4">
            <span
              class="block text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-[0.2em]"
              >Execution Strategy</span
            >
            <UIcon
              name="i-heroicons-magnifying-glass-circle"
              class="w-4 h-4 text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </div>
          <span
            class="block text-2xl font-black text-emerald-900 dark:text-emerald-100 uppercase tracking-tight"
            >{{ formatStrategy(streams.pacingStrategy.strategy) }}</span
          >
          <span
            class="block text-[10px] text-emerald-700 dark:text-emerald-300 font-medium italic mt-2"
            >{{ streams.pacingStrategy.description }}</span
          >
        </div>

        <!--
          Session shapes whose distance splits are not comparable get an
          explanation in place of the verdict, never a missing tile (CW-436).
        -->
        <div
          v-else-if="streams.pacingStrategy"
          class="p-5 bg-gray-50 dark:bg-gray-900/40 rounded-xl border border-gray-200 dark:border-gray-800 md:col-span-2 lg:col-span-1"
        >
          <!--
            No magnifying-glass affordance here: every other tile opens a metric
            modal on click, so borrowing the icon on a tile that cannot would read
            as broken rather than as deliberately withheld.
          -->
          <div class="flex items-center justify-between mb-4">
            <span
              class="block text-[10px] font-black uppercase text-gray-500 dark:text-gray-400 tracking-[0.2em]"
              >Execution Strategy</span
            >
          </div>
          <span
            class="block text-2xl font-black text-gray-700 dark:text-gray-300 uppercase tracking-tight"
            >Not Graded</span
          >
          <span class="block text-[10px] text-gray-500 dark:text-gray-400 font-medium italic mt-2"
            >Distance splits are not comparable for a session shaped like this one.</span
          >
        </div>
      </div>

      <!-- Lap Splits Table -->
      <div v-if="streams.lapSplits && streams.lapSplits.length > 0">
        <div
          class="flex items-center justify-between mb-4 group cursor-pointer"
          @click="
            () => {
              showSplits = !showSplits
            }
          "
        >
          <div class="flex items-center gap-2">
            <h3 class="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
              Distance Splits
            </h3>
            <UIcon
              :name="showSplits ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
              class="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors"
            />
          </div>
        </div>

        <p
          v-if="showSplits"
          class="-mt-2 mb-4 text-xs font-medium text-gray-500 dark:text-gray-400"
        >
          Automatic markers cut at a fixed distance each. These are not laps and not this workout's
          work intervals.
        </p>

        <div v-if="showSplits" class="overflow-hidden">
          <table class="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
            <thead class="bg-gray-50/50 dark:bg-gray-950/50">
              <tr>
                <th
                  class="px-5 py-3 text-left text-[9px] font-black text-gray-400 uppercase tracking-widest"
                >
                  Split
                </th>
                <th
                  class="px-5 py-3 text-left text-[9px] font-black text-gray-400 uppercase tracking-widest"
                >
                  Distance
                </th>
                <th
                  class="px-5 py-3 text-left text-[9px] font-black text-gray-400 uppercase tracking-widest"
                >
                  Time
                </th>
                <th
                  class="px-5 py-3 text-left text-[9px] font-black text-gray-400 uppercase tracking-widest"
                >
                  {{ splitMetricLabel }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
              <tr
                v-for="split in streams.lapSplits"
                :key="split.lap"
                :class="getSplitClass(split, streams.lapSplits)"
              >
                <td class="px-5 py-4 text-sm font-black text-gray-900 dark:text-white">
                  {{ split.lap }}
                </td>
                <td class="px-5 py-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  {{ formatDistance(split.distance) }}
                </td>
                <td
                  class="px-5 py-4 text-sm font-medium text-gray-600 dark:text-gray-400 tabular-nums"
                >
                  {{ formatTime(split.time) }}
                </td>
                <td class="px-5 py-4 text-sm font-black text-gray-900 dark:text-white tabular-nums">
                  {{ formatSplitMetric(split) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Pacing Strategy Details -->
      <div
        v-if="streams.pacingStrategy && splitVerdictApplicable"
        class="pt-6 border-t border-gray-100 dark:border-gray-800"
      >
        <h3 class="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">
          Split Strategy
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="p-4 bg-gray-50 dark:bg-gray-950 rounded-xl">
            <span class="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2 block"
              >First Half</span
            >
            <span class="text-xl font-black text-gray-900 dark:text-white tabular-nums">{{
              formatHalfMetric(streams.pacingStrategy.firstHalfPace)
            }}</span>
          </div>
          <div class="p-4 bg-gray-50 dark:bg-gray-950 rounded-xl">
            <span class="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2 block"
              >Second Half</span
            >
            <span class="text-xl font-black text-gray-900 dark:text-white tabular-nums">{{
              formatHalfMetric(streams.pacingStrategy.secondHalfPace)
            }}</span>
          </div>
          <div
            class="p-4 rounded-xl tabular-nums"
            :class="getDifferenceBgClass(streams.pacingStrategy.paceDifference)"
          >
            <span class="text-[9px] font-black uppercase tracking-widest mb-2 block opacity-70">{{
              differenceLabel
            }}</span>
            <span class="text-xl font-black">{{
              formatDifference(streams.pacingStrategy.paceDifference)
            }}</span>
          </div>
        </div>
        <div class="mt-6">
          <div class="flex items-center justify-between mb-2">
            <span class="text-[10px] font-black text-gray-400 uppercase tracking-widest"
              >Steady State Integrity</span
            >
            <span class="text-[10px] font-black text-gray-900 dark:text-white tracking-widest"
              >{{ streams.pacingStrategy.evenness ?? 0 }}/100</span
            >
          </div>
          <div class="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden shadow-inner">
            <div
              class="h-full transition-all duration-1000 ease-out"
              :style="{ width: (streams.pacingStrategy.evenness ?? 0) + '%' }"
              :class="getEvennessClass(streams.pacingStrategy.evenness ?? 0)"
            />
          </div>
        </div>
      </div>

      <!--
        The halves, the delta and the evenness grade are all verdicts drawn from a
        first-half vs second-half comparison, so they are withheld together for a
        session whose distance splits are not comparable. The split rows above and
        the consistency variance measurement are untouched (CW-436).
      -->
      <div
        v-else-if="streams.pacingStrategy"
        class="pt-6 border-t border-gray-100 dark:border-gray-800"
      >
        <h3 class="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">
          Split Strategy
        </h3>
        <div
          class="p-5 bg-gray-50 dark:bg-gray-950 rounded-xl border border-gray-100 dark:border-gray-800"
        >
          <div class="flex items-start gap-3">
            <UIcon
              name="i-heroicons-information-circle"
              class="w-5 h-5 text-gray-400 shrink-0 mt-0.5"
            />
            <div>
              <p
                class="text-[10px] font-black text-gray-700 dark:text-gray-300 uppercase tracking-widest mb-2"
              >
                Not graded for this session
              </p>
              <p class="text-sm font-medium text-gray-600 dark:text-gray-400 leading-relaxed">
                These splits are cut at a fixed distance each, not at your efforts, so a single
                split can hold part of a hard effort and part of a recovery. Comparing the first
                half against the second half here would tell you where the splits landed, not how
                you paced the session. Your split times and the consistency variance above are
                measured as usual.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Surges Detection -->
      <div
        v-if="streams.surges && streams.surges.length > 0"
        class="pt-6 border-t border-gray-100 dark:border-gray-800"
      >
        <div class="flex items-center justify-between mb-6">
          <h3 class="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
            Pacing Surges
          </h3>
          <UBadge
            color="warning"
            variant="soft"
            size="xs"
            class="font-black uppercase tracking-widest text-[9px]"
          >
            {{ streams.surges.length }} Surges Detected
          </UBadge>
        </div>

        <!-- Visual Timeline -->
        <div
          class="relative h-12 bg-gray-100 dark:bg-gray-950 rounded-xl mb-6 overflow-hidden shadow-inner"
        >
          <!-- Surge markers -->
          <div
            v-for="(surge, index) in validSurges"
            :key="surge.time ?? index"
            class="absolute top-0 bottom-0 w-0.5 bg-amber-500/40 hover:bg-amber-500 transition-all cursor-crosshair"
            :style="{ left: getSurgePosition(surge.time) + '%' }"
            :title="`${formatTime(surge.time)} - +${formatSurgeIncrease(surge.increase)}`"
          />
        </div>

        <!-- Compact Summary Grid -->
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <div
            v-for="(surge, index) in (streams.surges || [])
              .filter((s) => s && s.time !== undefined)
              .slice(0, 12)"
            :key="index"
            class="p-3 bg-gray-50 dark:bg-gray-950 rounded-xl group"
          >
            <div
              class="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 tabular-nums"
            >
              {{ formatTime(surge.time) }}
            </div>
            <div class="text-sm font-black text-amber-600 dark:text-amber-400 tabular-nums">
              +{{ formatSurgeIncrease(surge.increase) }}
            </div>
          </div>
        </div>

        <UButton
          v-if="streams.surges.length > 12 && !showAllSurges"
          color="neutral"
          variant="ghost"
          size="xs"
          class="mt-6 font-black uppercase tracking-widest text-[9px]"
          @click="
            () => {
              showAllSurges = true
            }
          "
        >
          Audit {{ streams.surges.length - 12 }} Additional Surges
        </UButton>

        <div
          v-if="showAllSurges && streams.surges.length > 12"
          class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mt-3"
        >
          <div
            v-for="(surge, index) in (streams.surges || [])
              .filter((s) => s && s.time !== undefined)
              .slice(12)"
            :key="index + 12"
            class="p-3 bg-gray-50 dark:bg-gray-950 rounded-xl"
          >
            <div
              class="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 tabular-nums"
            >
              {{ formatTime(surge.time) }}
            </div>
            <div class="text-sm font-black text-amber-600 dark:text-amber-400 tabular-nums">
              +{{ formatSurgeIncrease(surge.increase) }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import {
    convertVelocity,
    formatPace as formatPaceShared,
    getVelocityUnitLabel,
    isRideWorkoutType,
    usesImperialDistance
  } from '~/utils/metrics'

  const userStore = useUserStore()

  const props = defineProps<{
    workoutId: string
    publicToken?: string
    activityType?: string | null
  }>()

  const emit = defineEmits(['open-metric'])

  const endpoint = computed(() =>
    props.publicToken
      ? `/api/share/workouts/${props.publicToken}/streams`
      : `/api/workouts/${props.workoutId}/streams`
  )

  interface PacingStreams {
    avgPacePerKm: number
    paceVariability: number
    pacingStrategy: {
      strategy: string
      description: string
      // Withheld together when the split-strategy verdict does not apply to this
      // session shape (CW-436); the split rows and the variance stay regardless.
      firstHalfPace?: number
      secondHalfPace?: number
      paceDifference?: number
      evenness?: number
      verdictApplicable?: boolean
      verdictWithheldReason?: string | null
    }
    lapSplits: Array<{
      lap: number
      distance: number
      time: number
      pace: string
      paceSeconds: number
      averageSpeed?: number
    }>
    surges: Array<{
      time: number
      increase: number
    }>
    time: number[]
  }

  const {
    data: streamsData,
    pending: loading,
    error: fetchError
  } = await useFetch<PacingStreams, Error, string & {}>(endpoint, {
    lazy: true
  })
  const streams = streamsData as Ref<PacingStreams | null>

  const error = computed(() => {
    if (fetchError.value) {
      return fetchError.value.message || 'Failed to load pacing data'
    }
    return null
  })

  const showAllSurges = ref(false)
  const showSplits = ref(false)
  const distanceUnits = computed(() => userStore.profile?.distanceUnits || 'Kilometers')
  const isRideWorkout = computed(() => isRideWorkoutType(props.activityType))
  const speedUnit = computed(() => getVelocityUnitLabel(distanceUnits.value))
  const primaryMetricLabel = computed(() =>
    isRideWorkout.value ? 'Average Speed' : 'Average Pace'
  )
  const primaryMetricKey = computed(() => primaryMetricLabel.value)
  const primaryMetricUnit = computed(() => (isRideWorkout.value ? speedUnit.value : undefined))
  const splitMetricLabel = computed(() => (isRideWorkout.value ? 'Speed' : 'Pace'))
  const differenceLabel = computed(() => (isRideWorkout.value ? 'Speed Delta' : 'Pace Delta'))
  const variabilityUnit = computed(() => (isRideWorkout.value ? speedUnit.value : 'm/s'))
  const validSurges = computed(() => {
    return (streams.value?.surges || []).filter((s) => s && s.time !== undefined)
  })

  /**
   * Whether the split-strategy verdict applies to this session. Decided server-side
   * by `resolveSplitPacingVerdictApplicability` -- the same gate CW-389 applied to
   * the AI prompt -- so this card and the AI analysis never contradict each other
   * about whether pacing was gradeable (CW-436). Responses predating the gate carry
   * no flag and stay graded.
   */
  const splitVerdictApplicable = computed(
    () => streams.value?.pacingStrategy?.verdictApplicable !== false
  )

  // Calculate surge position as percentage of total workout time
  function getSurgePosition(surgeTime: number): number {
    if (!streams.value?.time || streams.value.time.length === 0) return 0
    const totalTime = streams.value.time[streams.value.time.length - 1]
    if (!totalTime) return 0
    return (surgeTime / totalTime) * 100
  }

  function formatPace(paceMinPerKm: number | null | undefined): string {
    if (!paceMinPerKm) return 'N/A'
    return formatPaceShared(paceMinPerKm * 60, distanceUnits.value)
  }

  function formatPaceSeconds(paceSeconds: number | null | undefined): string {
    if (!paceSeconds) return 'N/A'
    return formatPaceShared(paceSeconds, distanceUnits.value)
  }

  function paceMinPerKmToMps(paceMinPerKm: number | null | undefined): number | null {
    if (!paceMinPerKm || paceMinPerKm <= 0) return null
    return 1000 / (paceMinPerKm * 60)
  }

  function paceSecondsToMps(paceSeconds: number | null | undefined): number | null {
    if (!paceSeconds || paceSeconds <= 0) return null
    return 1000 / paceSeconds
  }

  function formatSpeedFromMps(metersPerSecond: number | null | undefined): string {
    if (!metersPerSecond) return 'N/A'
    const converted = convertVelocity(metersPerSecond, distanceUnits.value)
    return `${converted.toFixed(1)} ${speedUnit.value}`
  }

  function formatHalfMetric(paceSeconds: number | null | undefined): string {
    if (!isRideWorkout.value) return formatPaceSeconds(paceSeconds)
    return formatSpeedFromMps(paceSecondsToMps(paceSeconds))
  }

  function formatDifference(paceDifference: number | null | undefined): string {
    if (!paceDifference) return isRideWorkout.value ? `0.0 ${speedUnit.value}` : '0s'
    if (!isRideWorkout.value) return `${paceDifference > 0 ? '+' : ''}${paceDifference}s`

    const secondHalfSpeed = paceSecondsToMps(streams.value?.pacingStrategy?.secondHalfPace)
    const firstHalfSpeed = paceSecondsToMps(streams.value?.pacingStrategy?.firstHalfPace)
    if (!secondHalfSpeed || !firstHalfSpeed) return 'N/A'

    const delta = convertVelocity(secondHalfSpeed - firstHalfSpeed, distanceUnits.value)
    return `${delta > 0 ? '+' : ''}${delta.toFixed(1)} ${speedUnit.value}`
  }

  function formatSurgeIncrease(increase: number | null | undefined): string {
    if (!increase) return isRideWorkout.value ? `0.0 ${speedUnit.value}` : '0.0 m/s'
    if (!isRideWorkout.value) return `${increase.toFixed(1)} m/s`
    return `${convertVelocity(increase, distanceUnits.value).toFixed(1)} ${speedUnit.value}`
  }

  function resolveSplitSpeedMps(split: {
    averageSpeed?: number
    distance: number
    time: number
  }): number | null {
    if (
      typeof split.averageSpeed === 'number' &&
      Number.isFinite(split.averageSpeed) &&
      split.averageSpeed > 0
    ) {
      return split.averageSpeed
    }
    if (split.distance > 0 && split.time > 0) return split.distance / split.time
    return null
  }

  function formatSplitMetric(split: {
    averageSpeed?: number
    distance: number
    time: number
    pace: string
  }): string {
    if (!isRideWorkout.value) return split.pace
    return formatSpeedFromMps(resolveSplitSpeedMps(split))
  }

  const primaryMetricValue = computed(() => {
    if (!streams.value?.avgPacePerKm) return 'N/A'
    if (!isRideWorkout.value) return formatPace(streams.value.avgPacePerKm)

    const metersPerSecond = paceMinPerKmToMps(streams.value.avgPacePerKm)
    if (!metersPerSecond) return 'N/A'
    return convertVelocity(metersPerSecond, distanceUnits.value).toFixed(1)
  })

  const formattedPrimaryMetric = computed(() => {
    if (!streams.value?.avgPacePerKm) return 'N/A'
    if (!isRideWorkout.value) return formatPace(streams.value.avgPacePerKm)
    return formatSpeedFromMps(paceMinPerKmToMps(streams.value.avgPacePerKm))
  })

  const formattedVariabilityValue = computed(() => {
    if (!streams.value?.paceVariability && streams.value?.paceVariability !== 0) return 'N/A'
    if (!isRideWorkout.value) return streams.value.paceVariability.toFixed(2)
    return convertVelocity(streams.value.paceVariability, distanceUnits.value).toFixed(2)
  })

  function formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.round(seconds % 60)

    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  function formatDistance(meters: number): string {
    if (meters < 1000 && !usesImperialDistance(distanceUnits.value))
      return `${Math.round(meters)} m`
    if (usesImperialDistance(distanceUnits.value)) return `${(meters / 1609.344).toFixed(2)} mi`
    return `${(meters / 1000).toFixed(2)} km`
  }

  function formatStrategy(strategy: string): string {
    const strategies: Record<string, string> = {
      even: 'Even Pacing',
      positive_split: 'Positive Split',
      negative_split: 'Negative Split',
      slightly_uneven: 'Slightly Uneven',
      insufficient_data: 'Insufficient Data',
      not_graded: 'Not Graded'
    }
    return strategies[strategy] || strategy
  }

  function getSplitClass(split: any, allSplits: any[]): string {
    if (allSplits.length < 2) return ''

    const avgPace =
      allSplits.reduce((sum: number, s: any) => sum + s.paceSeconds, 0) / allSplits.length
    const deviation = ((split.paceSeconds - avgPace) / avgPace) * 100

    if (Math.abs(deviation) < 3) return 'bg-blue-50/50 dark:bg-blue-900/10'
    if (deviation > 0) return 'bg-red-50/50 dark:bg-red-900/10'
    return 'bg-green-50/50 dark:bg-green-900/10'
  }

  function getDifferenceBgClass(difference: number | null | undefined): string {
    if (Math.abs(difference ?? 0) < 5)
      return 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800/50 text-green-700 dark:text-green-300'
    if ((difference ?? 0) > 0)
      return 'bg-orange-50 dark:bg-orange-900/20 border-orange-100 dark:border-orange-800/50 text-orange-700 dark:text-orange-300'
    return 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800/50 text-blue-700 dark:text-blue-300'
  }

  function getEvennessClass(score: number): string {
    if (score >= 80) return 'bg-emerald-500'
    if (score >= 60) return 'bg-blue-500'
    if (score >= 40) return 'bg-amber-500'
    return 'bg-red-500'
  }
</script>

<style scoped>
  /* Minimal custom styles - most styling is done with Tailwind classes in template */
</style>
