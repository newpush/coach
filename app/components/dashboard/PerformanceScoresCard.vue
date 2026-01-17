<template>
  <UCard v-if="integrationStore.intervalsConnected" class="flex flex-col overflow-hidden">
    <template #header>
      <div class="flex items-center justify-between w-full">
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-chart-bar" class="w-5 h-5 text-primary-500" />
          <h3 class="font-bold text-sm tracking-tight uppercase">Performance Scores</h3>
        </div>
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-heroicons-presentation-chart-line"
          @click="$emit('open-training-load')"
        >
          Training Load
        </UButton>
      </div>
    </template>

    <!-- Loading skeleton -->
    <div v-if="loadingScores" class="space-y-4 animate-pulse flex-grow">
      <div
        v-for="i in 4"
        :key="i"
        class="flex justify-between items-center p-3 rounded-lg bg-gray-50 dark:bg-gray-800/40"
      >
        <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24" />
        <div class="h-6 bg-gray-200 dark:bg-gray-700 rounded w-12" />
      </div>
    </div>

    <!-- Actual scores data -->
    <div v-else-if="profileScores" class="grid gap-3 flex-grow">
      <button
        v-for="(score, key) in {
          currentFitness: {
            label: 'Current Fitness',
            color: 'bg-amber-50 dark:bg-amber-900/20 ring-amber-500/10'
          },
          recoveryCapacity: {
            label: 'Recovery Capacity',
            color: 'bg-emerald-50 dark:bg-emerald-900/20 ring-emerald-500/10'
          },
          nutritionCompliance: {
            label: 'Nutrition Quality',
            color: 'bg-purple-50 dark:bg-purple-900/20 ring-purple-500/10'
          },
          trainingConsistency: {
            label: 'Consistency',
            color: 'bg-blue-50 dark:bg-blue-900/20 ring-blue-500/10'
          }
        }"
        :key="key"
        class="flex justify-between items-center p-3 rounded-xl ring-1 ring-inset hover:ring-primary-500/50 transition-all duration-200"
        :class="score.color"
        @click="openScoreModal(key as any)"
      >
        <span class="text-sm font-bold text-gray-700 dark:text-gray-200">{{ score.label }}</span>
        <UBadge
          :color="getScoreColor((profileScores as any)?.[key])"
          variant="subtle"
          size="sm"
          class="font-bold"
        >
          {{ (profileScores as any)?.[key]?.toFixed(1) || 'N/A' }}
        </UBadge>
      </button>

      <div
        v-if="profileScores.lastUpdated"
        class="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700"
      >
        <p
          class="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-tight text-center italic"
        >
          Analysis current as of {{ formatScoreDate(profileScores.lastUpdated) }}
        </p>
      </div>
    </div>

    <!-- No scores yet -->
    <div v-else class="text-center py-4 flex-grow">
      <p class="text-sm text-muted">Generate your athlete profile to see performance scores.</p>
    </div>

    <template #footer>
      <UButton
        color="neutral"
        variant="outline"
        size="sm"
        block
        class="font-bold"
        @click="$emit('open-training-load')"
      >
        View Analysis
      </UButton>
    </template>
  </UCard>
</template>

<script setup lang="ts">
  const integrationStore = useIntegrationStore()
  const { getScoreColor: getScoreBadgeColor } = useScoreColor()
  const { formatDate, formatDateUTC, getUserLocalDate } = useFormat()

  const emit = defineEmits(['open-score-modal', 'open-training-load'])

  // Fetch athlete profile scores
  const { data: scoresData, pending: loadingScores } = useFetch<any>(
    '/api/scores/athlete-profile',
    {
      lazy: true,
      server: false,
      watch: [() => integrationStore.intervalsConnected]
    }
  )

  const profileScores = computed(() => scoresData.value?.scores || null)

  // Helper to get score color
  function getScoreColor(score: number | null): 'error' | 'warning' | 'success' | 'neutral' {
    return getScoreBadgeColor(score)
  }

  // Helper to format score date
  function formatScoreDate(date: string | Date): string {
    const scoreDate = new Date(date)
    const today = getUserLocalDate()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const dStr = formatDate(scoreDate, 'yyyy-MM-dd')
    const tStr = formatDateUTC(today, 'yyyy-MM-dd')
    const yStr = formatDateUTC(yesterday, 'yyyy-MM-dd')

    if (dStr === tStr) return 'today'
    if (dStr === yStr) return 'yesterday'

    const diffDays = Math.floor((today.getTime() - scoreDate.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`
    return formatDate(scoreDate, 'MMM d')
  }

  // Function to open score detail modal
  function openScoreModal(
    scoreType: 'currentFitness' | 'recoveryCapacity' | 'nutritionCompliance' | 'trainingConsistency'
  ) {
    if (!profileScores.value) return

    const scoreConfig = {
      currentFitness: {
        title: 'Current Fitness',
        score: profileScores.value.currentFitness,
        explanation: profileScores.value.currentFitnessExplanation,
        analysisData: profileScores.value.currentFitnessExplanationJson,
        color: 'blue' as const
      },
      recoveryCapacity: {
        title: 'Recovery Capacity',
        score: profileScores.value.recoveryCapacity,
        explanation: profileScores.value.recoveryCapacityExplanation,
        analysisData: profileScores.value.recoveryCapacityExplanationJson,
        color: 'green' as const
      },
      nutritionCompliance: {
        title: 'Nutrition Compliance',
        score: profileScores.value.nutritionCompliance,
        explanation: profileScores.value.nutritionComplianceExplanation,
        analysisData: profileScores.value.nutritionComplianceExplanationJson,
        color: 'purple' as const
      },
      trainingConsistency: {
        title: 'Training Consistency',
        score: profileScores.value.trainingConsistency,
        explanation: profileScores.value.trainingConsistencyExplanation,
        analysisData: profileScores.value.trainingConsistencyExplanationJson,
        color: 'orange' as const
      }
    }

    const config = scoreConfig[scoreType]

    emit('open-score-modal', {
      title: config.title,
      score: config.score ?? null,
      explanation: config.analysisData ? null : (config.explanation ?? null),
      analysisData: config.analysisData || undefined,
      color: config.color
    })
  }
</script>
