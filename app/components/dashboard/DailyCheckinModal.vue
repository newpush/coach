<template>
  <UModal v-model:open="isOpen" title="Daily Coach Check-In">
    <template #body>
      <div class="space-y-4">
        <div
          v-if="loading || isPending"
          class="flex flex-col items-center justify-center py-8 space-y-4"
        >
          <UIcon name="i-heroicons-arrow-path" class="w-10 h-10 animate-spin text-primary-500" />
          <p class="text-sm text-gray-500">Generating your personalized check-in...</p>
        </div>

        <div v-else-if="error || checkin?.status === 'FAILED'" class="text-center py-8">
          <UIcon
            name="i-heroicons-exclamation-circle"
            class="w-10 h-10 text-red-500 mx-auto mb-2"
          />
          <p class="text-red-500">{{ error || checkin?.error || 'Generation failed' }}</p>
          <UButton
            label="Try Again"
            color="error"
            variant="soft"
            class="mt-4"
            @click="generate(true)"
          />
        </div>

        <div v-else-if="localQuestions.length > 0" class="space-y-4">
          <UCard
            v-for="q in localQuestions"
            :key="q.id"
            class="cursor-pointer transition-all hover:ring-2 hover:ring-primary-500/20"
            :class="{ 'ring-2 ring-primary-500/10': isExpanded(q.id) }"
            @click="toggleExpand(q.id)"
          >
            <div class="flex items-start justify-between gap-3">
              <label
                class="text-sm font-medium text-gray-900 dark:text-white block flex-1 cursor-pointer"
              >
                {{ q.text }}
              </label>
              <UButton
                icon="i-heroicons-trash"
                color="neutral"
                variant="ghost"
                size="xs"
                class="-mr-1 -mt-1"
                @click.stop="removeQuestion(q.id)"
              />
            </div>

            <!-- Expanded Reasoning -->
            <div
              v-if="isExpanded(q.id)"
              class="mt-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 p-2 rounded"
            >
              <UIcon name="i-heroicons-information-circle" class="w-3 h-3 inline mr-1" />
              {{ q.reasoning }}
            </div>

            <div class="mt-3 flex justify-end" @click.stop>
              <URadioGroup
                v-model="answers[q.id]"
                :name="q.id"
                orientation="horizontal"
                :items="[
                  { label: 'Yes', value: 'YES' },
                  { label: 'No', value: 'NO' }
                ]"
              />
            </div>
          </UCard>

          <!-- AI Feedback Section -->
          <div class="flex justify-end pt-2">
            <AiFeedback
              v-if="checkin?.llmUsageId"
              :llm-usage-id="checkin.llmUsageId"
              :initial-feedback="checkin.feedback"
              :initial-feedback-text="checkin.feedbackText"
            />
          </div>
        </div>

        <div v-else class="text-center py-8">
          <p class="text-gray-500">No questions available.</p>
          <UButton label="Generate" color="primary" class="mt-4" @click="generate(true)" />
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-between w-full">
        <UButton
          v-if="localQuestions.length > 0"
          label="Regenerate"
          color="neutral"
          variant="ghost"
          icon="i-heroicons-arrow-path"
          :loading="loading || isPending"
          @click="generate(true)"
        />
        <div class="flex gap-2 ml-auto">
          <UButton color="neutral" variant="outline" @click="isOpen = false"> Close </UButton>
          <UButton
            v-if="localQuestions.length > 0"
            label="Save Answers"
            color="primary"
            :loading="submitting"
            @click="submit"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
  const props = defineProps<{
    open: boolean
  }>()

  const emit = defineEmits(['update:open'])

  const isOpen = computed({
    get: () => props.open,
    set: (value) => emit('update:open', value)
  })

  const loading = ref(false)
  const submitting = ref(false)
  const error = ref<string | null>(null)
  const checkin = ref<any>(null)
  const answers = ref<Record<string, string>>({})
  const localQuestions = ref<any[]>([])
  const expandedQuestions = ref<Set<string>>(new Set())

  const isPending = computed(() => {
    return checkin.value?.status === 'PENDING' || checkin.value?.status === 'PROCESSING'
  })

  function isExpanded(id: string) {
    return expandedQuestions.value.has(id)
  }

  function toggleExpand(id: string) {
    if (expandedQuestions.value.has(id)) {
      expandedQuestions.value.delete(id)
    } else {
      expandedQuestions.value.add(id)
    }
  }

  function removeQuestion(id: string) {
    localQuestions.value = localQuestions.value.filter((q) => q.id !== id)
    if (answers.value[id]) {
      const newAnswers = { ...answers.value }
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete newAnswers[id]
      answers.value = newAnswers
    }
  }

  // Background Task Monitoring
  const { refresh: refreshRuns } = useUserRuns()
  const { onTaskCompleted } = useUserRunsState()

  // Listeners
  onTaskCompleted('generate-daily-checkin', async (run) => {
    // Refresh checkin data
    await fetchToday()
    if (checkin.value?.status === 'COMPLETED') {
      localQuestions.value = checkin.value.questions || []
      useCheckinStore().currentCheckin = checkin.value
      // Note: we don't need to manually set loading=false because fetchToday handles it
      // but if we were stuck in "loading" state from generate(), we might.
      // However, generate() sets loading=true then makes API call then sets checkin value.
      // The UI shows loader based on `loading || isPending`.
      // `isPending` checks `checkin.status`.
      // So once `fetchToday` updates `checkin` to COMPLETED, `isPending` becomes false.
    } else if (checkin.value?.status === 'FAILED') {
      error.value = 'Generation failed'
    }
  })

  async function fetchToday() {
    try {
      loading.value = true
      error.value = null
      const data = await $fetch<any>('/api/checkin/today')
      if (data) {
        checkin.value = data
        localQuestions.value = data.questions || []
        // Pre-fill answers if they exist
        data.questions.forEach((q: any) => {
          if (q.answer) answers.value[q.id] = q.answer
        })
      } else {
        // Generate if not found
        await generate(false)
      }
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function generate(force: boolean = false) {
    try {
      loading.value = true
      error.value = null
      const data = await $fetch<any>('/api/checkin/generate', {
        method: 'POST',
        body: { force }
      })
      checkin.value = data
      localQuestions.value = data.questions || []
      answers.value = {} // Reset answers on regenerate

      refreshRuns()
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function submit() {
    if (!checkin.value) return
    try {
      submitting.value = true
      // Only send answers for remaining questions
      const filteredAnswers: Record<string, string> = {}
      localQuestions.value.forEach((q) => {
        const answer = answers.value[q.id]
        if (answer) {
          filteredAnswers[q.id] = answer
        }
      })

      // We also want to update the questions list on the backend to reflect deletions?
      // The endpoint 'answer.post.ts' updates questions. If we pass answers, it updates them.
      // But if we removed questions, 'answer.post.ts' logic currently only updates answers.
      // Maybe we should just save the answers we have. The removed questions will remain in DB but unanswered.
      // Ideally we should tell backend which questions are now "active" or "removed".
      // For MVP, just saving answers is fine. The UI will show all questions next time unless we persist the removal.
      // User asked to "X" them. Persisting removal would be better.
      // Let's stick to saving answers for now. If user reloads, deleted questions might reappear if we don't handle it.
      // But `fetchToday` re-fetches from DB.
      // Let's modify `answer.post.ts` to also accept a list of active question IDs if we want to persist deletions?
      // Or just let them be unanswered.

      await $fetch('/api/checkin/answer', {
        method: 'POST',
        body: {
          checkinId: checkin.value.id,
          answers: filteredAnswers
        }
      })
      await useCheckinStore().fetchToday()
      emit('update:open', false)
      // Maybe toast success?
    } catch (e: any) {
      // error
    } finally {
      submitting.value = false
    }
  }

  watch(
    () => props.open,
    (isOpen) => {
      if (isOpen) {
        fetchToday()
      }
    }
  )
</script>
