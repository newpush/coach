<template>
  <UModal
    v-model:open="isOpen"
    title="Meal Recommendations"
    :ui="{
      content: 'sm:max-w-2xl z-[9999]',
      overlay: 'z-[9998]'
    }"
    description="Nutritional recommendations based on your planned activity and metabolic state."
  >
    <template #header>
      <div class="flex items-center justify-between w-full">
        <div class="flex items-center gap-2">
          <div class="p-1.5 bg-primary-100 dark:bg-primary-900 rounded-lg">
            <UIcon name="i-lucide-utensils" class="w-5 h-5 text-primary-500" />
          </div>
          <div>
            <h3 class="text-lg font-black uppercase tracking-tight leading-tight">
              Fueling Recommendations
            </h3>
            <p class="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
              {{ recommendationSubtitle }}
            </p>
          </div>
        </div>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-heroicons-x-mark"
          @click="
            () => {
              isOpen = false
            }
          "
        />
      </div>
    </template>

    <template #body>
      <div class="space-y-6 min-h-[300px]">
        <!-- Loading State -->
        <div v-if="loading" class="flex flex-col items-center justify-center py-12 space-y-4">
          <div class="relative">
            <UIcon name="i-lucide-loader-2" class="size-12 animate-spin text-primary-500" />
            <div class="absolute inset-0 flex items-center justify-center">
              <UIcon name="i-lucide-sparkles" class="size-5 text-primary-400 animate-pulse" />
            </div>
          </div>
          <div class="text-center">
            <p class="text-sm font-bold text-gray-900 dark:text-white">
              {{ activeLoadingStage.title }}
            </p>
            <p class="text-xs text-gray-500 mt-1">{{ activeLoadingStage.subtitle }}</p>
          </div>
        </div>

        <!-- Options State -->
        <div v-else-if="recommendations && recommendations.length" class="space-y-4">
          <div
            class="rounded-xl border border-gray-200 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-900/30"
          >
            <p class="text-[10px] font-black uppercase tracking-widest text-gray-500">
              Daily Impact Preview
            </p>
            <div class="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div>
                <p class="text-[10px] uppercase text-gray-500">Target</p>
                <p class="font-black">{{ dayTargetCarbs }}g</p>
              </div>
              <div>
                <p class="text-[10px] uppercase text-gray-500">Planned (now)</p>
                <p class="font-black">{{ dayPlannedCarbs }}g</p>
              </div>
              <div>
                <p class="text-[10px] uppercase text-gray-500">Projected</p>
                <p class="font-black text-primary-600 dark:text-primary-400">
                  {{ projectedDayCarbs }}g
                </p>
              </div>
            </div>
            <p class="mt-1 text-[10px] text-gray-500">
              Remaining after apply: <span class="font-bold">{{ projectedRemainingCarbs }}g</span>
              <span v-if="isMergedAssignment" class="ml-1"
                >• split across {{ assignmentCount }} windows</span
              >
            </p>
          </div>
          <div class="flex items-start justify-between gap-3">
            <p class="text-xs text-gray-500 font-medium">
              Based on your {{ windowType?.replace('_', ' ') || 'current window' }}, we've scaled
              these performance-tested options to meet your
              <span class="font-bold text-primary-600">{{ targetCarbs }}g carb target</span>.
            </p>
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-refresh-cw"
              :loading="loading || loadingLlm"
              @click="
                () => {
                  void regenerateRecommendations()
                }
              "
            >
              Re-generate
            </UButton>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <NutritionMealOptionCard
              v-for="option in recommendations"
              :key="option.id || option.title"
              :option="option"
              :selected="selectedOption?.id === option.id && selectedOption?.title === option.title"
              @select="selectedOption = option"
            />
          </div>

          <!-- LLM Fallback Hint -->
          <div v-if="source === 'catalog'" class="flex justify-center pt-2">
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-sparkles"
              :loading="loadingLlm"
              @click="
                () => {
                  void getLlmRecommendations()
                }
              "
            >
              Don't like these? Ask AI for fresh ideas
            </UButton>
          </div>
        </div>

        <!-- Error / Empty State -->
        <div v-else class="flex flex-col items-center justify-center py-12 text-center">
          <div class="p-3 bg-gray-100 dark:bg-gray-800 rounded-full mb-4">
            <UIcon name="i-lucide-search-x" class="size-8 text-gray-400" />
          </div>
          <p class="text-sm font-bold">No catalog matches found</p>
          <p class="text-xs text-gray-500 mt-1 max-w-xs">
            We couldn't find a perfect match in your catalog. Try asking the AI for a suggestion.
          </p>
          <UButton
            class="mt-6"
            color="primary"
            icon="i-lucide-sparkles"
            :loading="loadingLlm"
            @click="
              () => {
                void getLlmRecommendations()
              }
            "
          >
            Ask AI for Recommendations
          </UButton>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-between items-center w-full">
        <div v-if="selectedOption" class="text-left">
          <p class="text-[10px] font-black uppercase text-gray-400 tracking-widest">Selected</p>
          <p class="text-xs font-bold truncate max-w-[200px]">{{ selectedOption.title }}</p>
        </div>
        <div v-else></div>

        <div class="flex gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            @click="
              () => {
                isOpen = false
              }
            "
          >
            Cancel
          </UButton>
          <UButton
            color="primary"
            :disabled="!selectedOption"
            :loading="confirming"
            @click="
              () => {
                void confirmSelection()
              }
            "
          >
            Apply to Plan
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
  import { useUserRunsState } from '~/composables/useUserRuns'

  const recommendationCache = new Map<
    string,
    { recommendations: any[]; source: 'catalog' | 'llm' }
  >()

  const props = defineProps<{
    date: string
    targetCarbs: number
    targetProtein?: number
    targetKcal?: number
    windowType?: string
    windowKey?: string
    slotName?: string
    windowAssignments?: Array<{
      windowType: string
      slotName?: string
      label?: string
      targetCarbs?: number
      targetProtein?: number
      targetKcal?: number
    }>
    dayTargetCarbs?: number
    dayPlannedCarbs?: number
    currentAssignedCarbs?: number
  }>()

  const emit = defineEmits(['updated'])

  const isOpen = defineModel<boolean>('open', { default: false })
  const toast = useToast()
  const loading = ref(false)
  const loadingLlm = ref(false)
  const confirming = ref(false)
  const recommendations = ref<any[]>([])
  const source = ref<'catalog' | 'llm'>('catalog')
  const selectedOption = ref<any>(null)
  const currentRunId = ref<string | null>(null)
  const loadingStageIndex = ref(0)
  let loadingStageTimer: NodeJS.Timeout | null = null
  let loadingStageOrder: number[] = []
  const loadingStages = [
    {
      title: 'Calculating Metabolic Needs...',
      subtitle: 'Reading your current glycogen state and active fueling window.'
    },
    {
      title: 'Aligning Macro Targets...',
      subtitle: 'Balancing carbs, protein, and energy targets for this slot.'
    },
    {
      title: 'Scanning Your Meal Catalog...',
      subtitle: 'Finding options that match your constraints and prep profile.'
    },
    {
      title: 'Ranking Best Matches...',
      subtitle: 'Scoring options by macro fit and absorption timing.'
    },
    {
      title: 'Finalizing Recommendations...',
      subtitle: 'Packaging your top choices with exact portions.'
    },
    {
      title: 'Consulting Your Inner Nutrition Scientist...',
      subtitle: 'Running tiny macro experiments so you do not have to.'
    },
    {
      title: 'Cross-Checking the Fuel Matrix...',
      subtitle: 'Making sure this meal supports the workload, not just the appetite.'
    },
    {
      title: 'Composing the Carb Symphony...',
      subtitle: 'Balancing fast notes, steady notes, and recovery chords.'
    },
    {
      title: 'Performing a Gut-Check...',
      subtitle: 'Avoiding options that look good on paper but feel rough in-session.'
    },
    {
      title: 'Tuning Portions with Laser Focus...',
      subtitle: 'Dialing grams so targets are hit without over-shooting.'
    },
    {
      title: 'Decoding the Pantry...',
      subtitle: 'Matching practical foods to performance targets.'
    },
    {
      title: 'Negotiating with Tomorrow’s Legs...',
      subtitle: 'Finding today’s meal that tomorrow’s workout will thank you for.'
    },
    {
      title: 'Building a No-Drama Plate...',
      subtitle: 'Simple prep, predictable digestion, reliable energy.'
    },
    {
      title: 'Inspecting Recovery Trajectory...',
      subtitle: 'Prioritizing choices that speed up bounce-back.'
    },
    {
      title: 'Applying Constraint Karate...',
      subtitle: 'No allergies, no intolerances, no nonsense.'
    },
    {
      title: 'Searching for a Clean Macro Landing...',
      subtitle: 'Trying to stick the numbers like a perfect dismount.'
    },
    {
      title: 'Performing Last-Mile Quality Control...',
      subtitle: 'Checking timing, absorption type, and practicality.'
    }
  ] as const
  const activeLoadingStage = computed(() => {
    const indexFromOrder = loadingStageOrder[loadingStageIndex.value]
    const resolvedIndex = indexFromOrder ?? 0
    return loadingStages[resolvedIndex] || loadingStages[0]
  })
  const assignmentCount = computed(() =>
    Array.isArray(props.windowAssignments) ? props.windowAssignments.length : 0
  )
  const isMergedAssignment = computed(() => assignmentCount.value > 1)
  const recommendationSubtitle = computed(() => {
    if (isMergedAssignment.value) {
      return `Merged Window Plan • ${props.targetCarbs}g Carbs`
    }
    return `${props.windowType?.replace('_', ' ') || 'Strategic Meal'} • ${props.targetCarbs}g Carbs`
  })
  const projectedDayCarbs = computed(() => {
    if (!selectedOption.value) return Number(props.dayPlannedCarbs || 0)
    const selectedCarbs = Number(selectedOption.value?.totals?.carbs || 0)
    const currentlyAssigned = Number(props.currentAssignedCarbs || 0)
    return Math.max(
      0,
      Math.round(Number(props.dayPlannedCarbs || 0) - currentlyAssigned + selectedCarbs)
    )
  })
  const projectedRemainingCarbs = computed(() => {
    const target = Number(props.dayTargetCarbs || 0)
    if (!target) return 0
    return Math.round(target - projectedDayCarbs.value)
  })
  const cacheKey = computed(
    () =>
      // Prefer windowKey so two PRE_WORKOUT slots with the same targets don't share suggestions.
      `${props.date}|${props.windowKey || props.windowType || 'GENERAL'}|${props.slotName || ''}|${props.targetCarbs}|${props.targetProtein || 0}|${props.targetKcal || 0}`
  )

  const { onTaskCompleted, onTaskFailed } = useUserRunsState()

  function stopLoadingStageRotation() {
    if (loadingStageTimer) {
      clearInterval(loadingStageTimer)
      loadingStageTimer = null
    }
  }

  function startLoadingStageRotation() {
    stopLoadingStageRotation()
    loadingStageOrder = [...Array(loadingStages.length).keys()]
      .map((index) => ({ index, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ index }) => index)
    loadingStageIndex.value = 0
    loadingStageTimer = setInterval(() => {
      const nextIndex = loadingStageIndex.value + 1
      if (nextIndex >= loadingStageOrder.length) {
        loadingStageOrder = [...Array(loadingStages.length).keys()]
          .map((index) => ({ index, sort: Math.random() }))
          .sort((a, b) => a.sort - b.sort)
          .map(({ index }) => index)
        loadingStageIndex.value = 0
        return
      }
      loadingStageIndex.value = nextIndex
    }, 2800)
  }

  function runIdsMatch(expectedId: string | null, actualId: string) {
    const match =
      !expectedId ||
      actualId === expectedId ||
      actualId.startsWith(`${expectedId}.`) ||
      expectedId.startsWith(`${actualId}.`)
    console.log('[MealRecommendationModal] runIdsMatch', { expectedId, actualId, match })
    if (match) return true
    if (!expectedId) return true
    if (actualId === expectedId) return true
    if (actualId.startsWith(`${expectedId}.`)) return true
    if (expectedId.startsWith(`${actualId}.`)) return true
    return false
  }

  function extractRecommendationsPayload(raw: any, depth = 0): any | null {
    if (!raw || depth > 4) return null

    if (Array.isArray(raw.recommendations)) {
      return raw
    }

    if (Array.isArray(raw.options)) {
      return {
        recommendations: raw.options,
        source: raw.source || 'llm',
        status: raw.status,
        message: raw.message
      }
    }

    const nestedKeys = ['output', 'result', 'data', 'payload', 'recommendation', 'resultJson']
    for (const key of nestedKeys) {
      if (raw[key] != null) {
        const extracted = extractRecommendationsPayload(raw[key], depth + 1)
        if (extracted) return extracted
      }
    }

    return null
  }

  async function fetchRunOutput(runId: string) {
    console.log('[MealRecommendationModal] fetchRunOutput:start', { runId })
    try {
      const run = await ($fetch as any)(`/api/runs/${runId}`)
      console.log('[MealRecommendationModal] fetchRunOutput:success', {
        runId,
        status: run?.status,
        hasOutput: !!run?.output,
        outputKeys: run?.output ? Object.keys(run.output) : []
      })
      return run?.output
    } catch (error) {
      console.warn('[MealRecommendationModal] fetchRunOutput:error', { runId, error })
      return null
    }
  }

  async function applyRunOutput(run: { id: string; output?: any }) {
    console.log('[MealRecommendationModal] applyRunOutput:start', {
      runId: run.id,
      hasInlineOutput: !!run.output
    })
    const output = run.output ?? (await fetchRunOutput(run.id))
    console.log('[MealRecommendationModal] applyRunOutput:rawOutput', output)
    const normalizedOutput = extractRecommendationsPayload(output)
    console.log('[MealRecommendationModal] applyRunOutput:resolvedOutput', {
      runId: run.id,
      hasOutput: !!output,
      outputKeys: output ? Object.keys(output) : [],
      normalizedKeys: normalizedOutput ? Object.keys(normalizedOutput) : [],
      recommendationsCount: normalizedOutput?.recommendations?.length
    })

    if (normalizedOutput?.recommendations) {
      recommendations.value = normalizedOutput.recommendations
      source.value = normalizedOutput.source || 'catalog'
      recommendationCache.set(cacheKey.value, {
        recommendations: recommendations.value,
        source: source.value
      })
      console.log('[MealRecommendationModal] applyRunOutput:appliedRecommendations', {
        count: recommendations.value.length,
        source: source.value
      })
    } else {
      recommendations.value = []
      source.value = 'catalog'
      console.warn('[MealRecommendationModal] applyRunOutput:noRecommendationsInOutput', {
        runId: run.id,
        status: output?.status,
        message: output?.message
      })
    }

    loading.value = false
    loadingLlm.value = false
    console.log('[MealRecommendationModal] applyRunOutput:done', {
      loading: loading.value,
      loadingLlm: loadingLlm.value
    })
  }

  // Handle completion of the recommendation task
  onTaskCompleted('recommend-nutrition-meal', async (run) => {
    console.log('[MealRecommendationModal] onTaskCompleted:fired', {
      runId: run.id,
      status: run.status,
      taskIdentifier: run.taskIdentifier,
      hasOutput: !!run.output,
      currentRunId: currentRunId.value
    })
    if (!runIdsMatch(currentRunId.value, run.id)) {
      console.warn('[MealRecommendationModal] onTaskCompleted:runIdMismatch', {
        currentRunId: currentRunId.value,
        callbackRunId: run.id
      })
      return
    }

    if (run.status === 'COMPLETED') {
      await applyRunOutput(run)
      return
    }

    loading.value = false
    loadingLlm.value = false
  })

  onTaskFailed('recommend-nutrition-meal', async (run) => {
    if (!runIdsMatch(currentRunId.value, run.id)) return
    stopLoadingStageRotation()
    loading.value = false
    loadingLlm.value = false
    recommendations.value = []
    toast.add({
      title: 'Recommendation Failed',
      description: run.error?.message || 'Failed to generate meal recommendations',
      color: 'error',
      icon: 'i-heroicons-exclamation-circle'
    })
  })

  watch(isOpen, (val) => {
    console.log('[MealRecommendationModal] isOpen changed', { isOpen: val })
    if (val) {
      const cached = recommendationCache.get(cacheKey.value)
      if (cached?.recommendations?.length) {
        recommendations.value = cached.recommendations
        source.value = cached.source
        selectedOption.value = null
        loading.value = false
        loadingLlm.value = false
        console.log('[MealRecommendationModal] loaded cached recommendations', {
          key: cacheKey.value,
          count: cached.recommendations.length,
          source: cached.source
        })
        return
      }
      triggerRecommendations()
    } else {
      recommendations.value = []
      selectedOption.value = null
      currentRunId.value = null
      loadingStageIndex.value = 0
      stopLoadingStageRotation()
      console.log('[MealRecommendationModal] state reset on close')
    }
  })

  async function triggerRecommendations(forceLlm = false) {
    console.log('[MealRecommendationModal] triggerRecommendations:start', {
      forceLlm,
      date: props.date,
      windowType: props.windowType,
      slotName: props.slotName,
      targetCarbs: props.targetCarbs,
      targetProtein: props.targetProtein,
      targetKcal: props.targetKcal
    })
    if (forceLlm) loadingLlm.value = true
    else loading.value = true

    try {
      const res = await ($fetch as any)('/api/nutrition/recommendations/meal', {
        method: 'POST',
        body: {
          date: props.date,
          // Send the specific window so its own unmet targets are used, not the first window
          // that happens to share this type.
          windowType: props.windowKey || props.windowType,
          forceLlm,
          targetCarbs: props.targetCarbs,
          targetProtein: props.targetProtein,
          targetKcal: props.targetKcal
        }
      })
      console.log('[MealRecommendationModal] triggerRecommendations:response', res)

      // A recent suggestion for the same window and targets is reused server-side, so read the
      // stored result rather than replaying a trigger run that has already finished.
      if (res.cached && res.recommendationId) {
        const stored = await ($fetch as any)(
          `/api/nutrition/recommendations/${res.recommendationId}`
        )
        const payload = extractRecommendationsPayload(stored?.recommendation?.resultJson)

        if (payload?.recommendations?.length) {
          recommendations.value = payload.recommendations
          source.value = payload.source || 'catalog'
          recommendationCache.set(cacheKey.value, {
            recommendations: recommendations.value,
            source: source.value
          })
          loading.value = false
          loadingLlm.value = false
          return
        }

        // Empty/unusable cached payload — do not attach to its already-finished runId (spinner hang).
        // Bypass reuse once so the athlete still gets a fresh generation.
        if (!forceLlm) {
          console.warn(
            '[MealRecommendationModal] triggerRecommendations:emptyCachedResult, regenerating'
          )
          await triggerRecommendations(true)
          return
        }

        loading.value = false
        loadingLlm.value = false
        recommendations.value = []
        return
      }

      if (res.runId) {
        currentRunId.value = res.runId
        console.log('[MealRecommendationModal] triggerRecommendations:setCurrentRunId', {
          currentRunId: currentRunId.value
        })
      } else {
        loading.value = false
        loadingLlm.value = false
        console.warn('[MealRecommendationModal] triggerRecommendations:noRunId')
      }
    } catch (e) {
      loading.value = false
      loadingLlm.value = false
      console.error('[MealRecommendationModal] triggerRecommendations:error', e)
      console.error('Failed to trigger recommendations:', e)
    }
  }

  // Fallback: poll run status while waiting, in case WebSocket events are missed.
  // LLM generation frequently takes well beyond a few seconds, so this can't be a
  // single check — it needs to keep polling (with backoff) until the run finishes
  // or a terminal timeout is hit, otherwise the modal is stuck spinning forever.
  const POLL_INTERVALS_MS = [3000, 3000, 3000, 5000, 5000, 8000]
  const POLL_MAX_TOTAL_MS = 90000
  const TERMINAL_RUN_STATUSES = ['FAILED', 'CANCELED', 'TIMED_OUT']
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let pollAttempt = 0
  let pollStartedAt = 0

  function stopPolling() {
    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
    pollAttempt = 0
  }

  function finishWithError(title: string, description: string) {
    stopPolling()
    stopLoadingStageRotation()
    loading.value = false
    loadingLlm.value = false
    recommendations.value = []
    toast.add({
      title,
      description,
      color: 'error',
      icon: 'i-heroicons-exclamation-circle'
    })
  }

  async function pollRunStatus() {
    pollTimer = null

    if (!isWaitingForRun.value || !currentRunId.value) {
      stopPolling()
      return
    }

    if (Date.now() - pollStartedAt >= POLL_MAX_TOTAL_MS) {
      console.warn('[MealRecommendationModal] polling timed out', {
        runId: currentRunId.value
      })
      finishWithError(
        'Still Working',
        'Meal recommendations are taking longer than expected. Please try again.'
      )
      return
    }

    try {
      console.log('[MealRecommendationModal] polling run status', {
        runId: currentRunId.value,
        attempt: pollAttempt
      })
      const run = await ($fetch as any)(`/api/runs/${currentRunId.value}`)
      console.log('[MealRecommendationModal] polling run status response', {
        runId: currentRunId.value,
        status: run.status,
        hasOutput: !!run.output
      })

      if (run.status === 'COMPLETED') {
        stopPolling()
        await applyRunOutput(run)
        return
      }

      if (TERMINAL_RUN_STATUSES.includes(run.status)) {
        finishWithError(
          'Recommendation Failed',
          run.error?.message || 'Failed to generate meal recommendations'
        )
        return
      }
    } catch (e) {
      console.warn('[MealRecommendationModal] polling error', e)
      // Transient network/fetch error — keep polling rather than giving up.
    }

    if (!isWaitingForRun.value) {
      stopPolling()
      return
    }

    const delay = POLL_INTERVALS_MS[Math.min(pollAttempt, POLL_INTERVALS_MS.length - 1)]
    pollAttempt += 1
    pollTimer = setTimeout(() => {
      void pollRunStatus()
    }, delay)
  }

  const isWaitingForRun = computed(() => loading.value || loadingLlm.value)

  watch(isWaitingForRun, (val) => {
    console.log('[MealRecommendationModal] isWaitingForRun changed', {
      isWaitingForRun: val,
      currentRunId: currentRunId.value
    })
    if (val) {
      pollAttempt = 0
      pollStartedAt = Date.now()
      pollTimer = setTimeout(() => {
        void pollRunStatus()
      }, POLL_INTERVALS_MS[0])
    } else {
      stopPolling()
    }
  })

  watch(loading, (val) => {
    if (val) {
      startLoadingStageRotation()
    } else {
      stopLoadingStageRotation()
      loadingStageIndex.value = 0
    }
  })

  onUnmounted(() => {
    stopLoadingStageRotation()
    stopPolling()
  })

  async function getLlmRecommendations() {
    console.log('[MealRecommendationModal] getLlmRecommendations clicked')
    triggerRecommendations(true)
  }

  async function regenerateRecommendations() {
    console.log('[MealRecommendationModal] regenerateRecommendations clicked')
    recommendationCache.delete(cacheKey.value)
    recommendations.value = []
    selectedOption.value = null
    await triggerRecommendations(false)
  }

  async function confirmSelection() {
    if (!selectedOption.value) return
    confirming.value = true

    try {
      console.log('[MealRecommendationModal] confirmSelection:start', {
        date: props.date,
        windowType: props.windowType,
        slotName: props.slotName,
        windowAssignments: props.windowAssignments,
        selectedTitle: selectedOption.value?.title,
        selectedTotals: selectedOption.value?.totals
      })
      // Phase 3 will implement actual plan locking
      // For now, we can log it or just emit success
      // Let's assume we want to "Lock" this into the nutrition plan for the day
      const response = await $fetch<any, string & {}>('/api/nutrition/plan/meal', {
        method: 'POST',
        body: {
          date: props.date,
          windowType: props.windowType,
          windowKey: props.windowKey,
          slotName: props.slotName,
          windowAssignments: props.windowAssignments,
          meal: selectedOption.value
        }
      })
      console.log('[MealRecommendationModal] confirmSelection:success', response)

      isOpen.value = false
      emit('updated')
    } catch (e: any) {
      console.error('Failed to confirm selection:', e)
      toast.add({
        title: 'Failed to Apply Meal',
        description:
          e?.data?.message ||
          e?.message ||
          'Could not add this meal to your plan. Please try again.',
        color: 'error',
        icon: 'i-heroicons-exclamation-circle'
      })
    } finally {
      confirming.value = false
    }
  }
</script>
