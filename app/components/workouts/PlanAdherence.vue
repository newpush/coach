<template>
  <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
        <UIcon name="i-heroicons-clipboard-document-check" class="w-6 h-6 text-primary-500" />
        Plan Adherence
      </h2>
      <div v-if="!readOnly" class="flex gap-2">
        <UButton
          v-if="plannedWorkout?.id"
          icon="i-heroicons-calendar"
          color="neutral"
          variant="ghost"
          size="sm"
          class="font-bold"
          :to="`/workouts/planned/${plannedWorkout.id}`"
        >
          View Plan
        </UButton>
        <UButton
          icon="i-heroicons-arrow-path"
          color="neutral"
          variant="ghost"
          size="sm"
          class="font-bold"
          :loading="regenerating"
          @click="$emit('regenerate')"
        >
          {{ adherence ? 'Re-analyze' : 'Analyze' }}
        </UButton>
      </div>
    </div>

    <!-- Plan Info and Adherence Score Row -->
    <div
      class="mb-6 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 flex flex-wrap items-center gap-6 border border-gray-100 dark:border-gray-700"
    >
      <!-- Adherence Score (if exists) -->
      <div
        v-if="adherence"
        class="flex items-center gap-3 pr-6 border-r border-gray-200 dark:border-gray-600"
      >
        <div
          class="relative w-14 h-14 flex items-center justify-center rounded-full border-4 flex-shrink-0"
          :class="getScoreBorderColor(adherence.overallScore)"
        >
          <span class="text-lg font-bold" :class="getScoreTextColor(adherence.overallScore)">
            {{ adherence.overallScore }}
          </span>
        </div>
        <div class="hidden sm:block">
          <div class="text-[10px] uppercase font-bold text-gray-500 tracking-tight">Adherence</div>
          <div class="text-sm font-semibold text-gray-900 dark:text-white leading-tight">
            {{ getScoreLabel(adherence.overallScore) }}
          </div>
        </div>
      </div>

      <!-- Planned Workout Details -->
      <div
        v-if="plannedWorkout"
        class="flex-1 min-w-[200px] flex flex-wrap items-center gap-x-6 gap-y-2"
      >
        <div class="flex-1 min-w-[150px]">
          <div class="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-0.5">
            Target Plan
          </div>
          <div class="font-bold text-gray-900 dark:text-white truncate">
            {{ plannedWorkout.title }}
          </div>
        </div>

        <div class="flex items-center gap-3 text-xs">
          <div
            v-if="plannedWorkout.type"
            class="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-sm"
          >
            <UIcon name="i-heroicons-tag" class="w-3.5 h-3.5 text-gray-400" />
            <span class="font-medium text-gray-700 dark:text-gray-300">{{
              plannedWorkout.type
            }}</span>
          </div>

          <div
            v-if="plannedWorkout.durationSec"
            class="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-sm"
          >
            <UIcon name="i-heroicons-clock" class="w-3.5 h-3.5 text-gray-400" />
            <span class="font-medium text-gray-700 dark:text-gray-300">{{
              formatDuration(plannedWorkout.durationSec)
            }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="adherence" class="space-y-6">
      <!-- Summary -->
      <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
        <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          {{ adherence.summary }}
        </p>
      </div>

      <!-- Deviations -->
      <div v-if="adherence.deviations && adherence.deviations.length > 0">
        <h3
          class="text-sm font-semibold text-gray-900 dark:text-white mb-3 uppercase tracking-wide"
        >
          Key Deviations
        </h3>
        <div class="space-y-3">
          <div
            v-for="(dev, idx) in adherence.deviations"
            :key="idx"
            class="border-l-4 pl-3 py-1"
            :class="getDeviationBorderColor(dev.metric)"
          >
            <div class="flex justify-between items-start">
              <span class="font-medium text-sm text-gray-900 dark:text-white">{{
                dev.metric
              }}</span>
              <UBadge :color="getDeviationColor(dev.metric)" variant="subtle" size="xs">
                {{ dev.deviation }}
              </UBadge>
            </div>
            <div class="text-xs text-gray-500 mt-1">
              Planned: {{ dev.planned }} • Actual: {{ dev.actual }}
            </div>
            <p class="text-xs text-gray-600 dark:text-gray-400 mt-1 italic">
              {{ dev.impact }}
            </p>
          </div>
        </div>
      </div>

      <!-- Recommendations -->
      <div v-if="adherence.recommendations && adherence.recommendations.length > 0">
        <h3
          class="text-sm font-semibold text-gray-900 dark:text-white mb-3 uppercase tracking-wide"
        >
          Coach Recommendations
        </h3>
        <ul class="space-y-2">
          <li
            v-for="(rec, idx) in adherence.recommendations"
            :key="idx"
            class="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
          >
            <UIcon
              name="i-heroicons-light-bulb"
              class="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0"
            />
            <span>{{ rec }}</span>
          </li>
        </ul>
      </div>

      <div v-if="adherence.analyzedAt" class="text-xs text-gray-400 text-center pt-2">
        Analyzed on {{ formatShortDate(adherence.analyzedAt) }}
      </div>
    </div>

    <div v-else-if="regenerating" class="text-center py-8">
      <div
        class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mb-4"
      />
      <p class="text-sm text-gray-600 dark:text-gray-400">Analyzing plan adherence...</p>
    </div>

    <div v-else class="text-center py-8">
      <UIcon
        name="i-heroicons-clipboard-document-list"
        class="w-12 h-12 text-gray-300 mx-auto mb-3"
      />
      <p class="text-sm text-gray-500">No adherence analysis yet.</p>
      <UButton
        v-if="!readOnly"
        size="sm"
        color="primary"
        variant="soft"
        class="mt-4"
        @click="$emit('regenerate')"
      >
        Analyze Adherence
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
  const props = defineProps<{
    adherence: any | null
    regenerating: boolean
    plannedWorkout?: {
      id: string
      title: string
      type?: string
      durationSec?: number
    }
    readOnly?: boolean
  }>()

  defineEmits(['regenerate'])

  const { formatDuration } = useFormatters()
  const { formatShortDate } = useFormat()

  function getScoreBorderColor(score: number) {
    if (score >= 90) return 'border-green-500'
    if (score >= 70) return 'border-yellow-500'
    return 'border-red-500'
  }

  function getScoreTextColor(score: number) {
    if (score >= 90) return 'text-green-600 dark:text-green-400'
    if (score >= 70) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }

  function getScoreLabel(score: number) {
    if (score >= 90) return 'Excellent Adherence'
    if (score >= 70) return 'Good Adherence'
    if (score >= 50) return 'Partial Adherence'
    return 'Low Adherence'
  }

  function getDeviationColor(metric: string) {
    // Simple heuristic
    return 'warning' as const
  }

  function getDeviationBorderColor(metric: string) {
    return 'border-orange-400'
  }
</script>
