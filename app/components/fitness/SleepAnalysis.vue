<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
        <UIcon name="i-heroicons-moon" class="w-5 h-5 text-indigo-500" />
        Detailed Sleep Analysis
      </h3>
      <UBadge
        v-if="sleep.score.score_state === 'SCORED'"
        :color="getScoreColor(sleep.score.sleep_performance_percentage) as any"
        variant="subtle"
      >
        {{ sleep.score.sleep_performance_percentage }}% Performance
      </UBadge>
    </div>

    <!-- Sleep Stages Chart -->
    <div
      class="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-100 dark:border-gray-800"
    >
      <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Sleep Stages</h4>
      <div class="h-8 w-full flex rounded-full overflow-hidden mb-2">
        <div
          v-if="percentages.awake > 0"
          class="h-full bg-rose-400"
          :style="{ width: `${percentages.awake}%` }"
          title="Awake"
        />
        <div
          v-if="percentages.light > 0"
          class="h-full bg-blue-300"
          :style="{ width: `${percentages.light}%` }"
          title="Light Sleep"
        />
        <div
          v-if="percentages.rem > 0"
          class="h-full bg-teal-400"
          :style="{ width: `${percentages.rem}%` }"
          title="REM Sleep"
        />
        <div
          v-if="percentages.sws > 0"
          class="h-full bg-indigo-500"
          :style="{ width: `${percentages.sws}%` }"
          title="Deep Sleep (SWS)"
        />
      </div>

      <!-- Legend -->
      <div class="flex flex-wrap gap-4 justify-center text-xs text-gray-600 dark:text-gray-400">
        <div class="flex items-center gap-1.5">
          <div class="w-3 h-3 rounded-full bg-rose-400" />
          <span
            >Awake ({{ formatDuration(sleep.score.stage_summary.total_awake_time_milli) }})</span
          >
        </div>
        <div class="flex items-center gap-1.5">
          <div class="w-3 h-3 rounded-full bg-blue-300" />
          <span
            >Light ({{
              formatDuration(sleep.score.stage_summary.total_light_sleep_time_milli)
            }})</span
          >
        </div>
        <div class="flex items-center gap-1.5">
          <div class="w-3 h-3 rounded-full bg-teal-400" />
          <span
            >REM ({{ formatDuration(sleep.score.stage_summary.total_rem_sleep_time_milli) }})</span
          >
        </div>
        <div class="flex items-center gap-1.5">
          <div class="w-3 h-3 rounded-full bg-indigo-500" />
          <span
            >Deep ({{
              formatDuration(sleep.score.stage_summary.total_slow_wave_sleep_time_milli)
            }})</span
          >
        </div>
      </div>
    </div>

    <!-- Key Metrics Grid -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div
        class="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800"
      >
        <div class="text-xs text-gray-500 mb-1">Efficiency</div>
        <div class="text-xl font-bold text-gray-900 dark:text-white">
          {{ sleep.score.sleep_efficiency_percentage.toFixed(0) }}%
        </div>
        <div class="text-xs text-gray-400 mt-1">Time asleep / Time in bed</div>
      </div>

      <div
        class="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800"
      >
        <div class="text-xs text-gray-500 mb-1">Consistency</div>
        <div class="text-xl font-bold text-gray-900 dark:text-white">
          {{ sleep.score.sleep_consistency_percentage }}%
        </div>
        <div class="text-xs text-gray-400 mt-1">Bedtime regularity</div>
      </div>

      <div
        class="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800"
      >
        <div class="text-xs text-gray-500 mb-1">Respiratory Rate</div>
        <div class="text-xl font-bold text-gray-900 dark:text-white">
          {{ sleep.score.respiratory_rate.toFixed(1) }}
        </div>
        <div class="text-xs text-gray-400 mt-1">Breaths per min</div>
      </div>

      <div
        class="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800"
      >
        <div class="text-xs text-gray-500 mb-1">Disturbances</div>
        <div class="text-xl font-bold text-gray-900 dark:text-white">
          {{ sleep.score.stage_summary.disturbance_count }}
        </div>
        <div class="text-xs text-gray-400 mt-1">Wake events</div>
      </div>
    </div>

    <!-- Sleep Need vs Actual -->
    <div
      class="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-100 dark:border-gray-700"
    >
      <div class="flex justify-between items-end mb-2">
        <span class="text-sm font-medium">Sleep Performance</span>
        <div class="text-right">
          <span
            class="text-lg font-bold"
            :class="getScoreTextColor(sleep.score.sleep_performance_percentage)"
          >
            {{ formatDuration(totalSleepTime) }}
          </span>
          <span class="text-sm text-gray-500">
            /
            {{
              formatDuration(
                sleep.score.sleep_needed.baseline_milli +
                  sleep.score.sleep_needed.need_from_recent_strain_milli +
                  sleep.score.sleep_needed.need_from_sleep_debt_milli
              )
            }}
            needed</span
          >
        </div>
      </div>
      <UProgress
        :model-value="sleep.score.sleep_performance_percentage"
        :color="getScoreColor(sleep.score.sleep_performance_percentage) as any"
        size="lg"
      />
      <div class="mt-2 flex justify-between text-xs text-gray-500">
        <span
          >Strain:
          {{ formatDuration(sleep.score.sleep_needed.need_from_recent_strain_milli) }}</span
        >
        <span>Debt: {{ formatDuration(sleep.score.sleep_needed.need_from_sleep_debt_milli) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  const props = defineProps<{
    sleep: any
  }>()

  const totalSleepTime = computed(() => {
    const summary = props.sleep.score.stage_summary
    return (
      summary.total_light_sleep_time_milli +
      summary.total_slow_wave_sleep_time_milli +
      summary.total_rem_sleep_time_milli
    )
  })

  const totalInBedTime = computed(() => props.sleep.score.stage_summary.total_in_bed_time_milli)

  const percentages = computed(() => {
    const summary = props.sleep.score.stage_summary
    const total = totalInBedTime.value || 1 // Avoid division by zero

    return {
      awake: (summary.total_awake_time_milli / total) * 100,
      light: (summary.total_light_sleep_time_milli / total) * 100,
      rem: (summary.total_rem_sleep_time_milli / total) * 100,
      sws: (summary.total_slow_wave_sleep_time_milli / total) * 100
    }
  })

  function formatDuration(ms: number) {
    const hours = Math.floor(ms / (1000 * 60 * 60))
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
    return `${hours}h ${minutes}m`
  }

  function getScoreColor(score: number): string {
    if (score >= 85) return 'success' // green
    if (score >= 70) return 'primary' // blue/primary
    return 'error' // red
  }

  function getScoreTextColor(score: number): string {
    if (score >= 85) return 'text-green-600 dark:text-green-400'
    if (score >= 70) return 'text-blue-600 dark:text-blue-400'
    return 'text-red-600 dark:text-red-400'
  }
</script>
