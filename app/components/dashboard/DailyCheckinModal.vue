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
          <div
            v-if="checkin?.openingRemark"
            class="text-sm text-gray-700 dark:text-gray-200 bg-primary-50/50 dark:bg-primary-900/10 p-4 rounded-lg border border-primary-100 dark:border-primary-800 flex gap-3 items-start shadow-sm"
          >
            <UIcon
              name="i-heroicons-chat-bubble-bottom-center-text"
              class="w-6 h-6 text-primary-500 shrink-0 mt-0.5"
            />
            <div class="italic leading-relaxed">
              {{ checkin.openingRemark }}
            </div>
          </div>

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
              class="mt-3 text-sm text-gray-600 dark:text-gray-400 bg-gray-100/50 dark:bg-gray-800/50 p-3 rounded-md flex gap-2.5 items-start border border-gray-100 dark:border-gray-800"
            >
              <UIcon name="i-heroicons-light-bulb" class="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div class="flex-1 leading-relaxed">
                <span class="font-medium text-gray-900 dark:text-gray-200 block mb-0.5">
                  Coach's Reasoning
                </span>
                {{ q.reasoning }}
              </div>
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

          <!-- User Notes -->
          <UCard>
            <div class="space-y-3">
              <label class="text-sm font-medium text-gray-900 dark:text-white block">
                Do you have anything to share?
              </label>
              <UTextarea
                v-model="userNotes"
                placeholder="E.g., I feel tired today, I think I have the flu, etc."
                :rows="4"
                autoresize
                class="w-full"
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
  const userNotes = ref('')
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
      userNotes.value = checkin.value.userNotes || ''
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
        userNotes.value = data.userNotes || ''
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
      userNotes.value = ''
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

      await $fetch('/api/checkin/answer', {
        method: 'POST',
        body: {
          checkinId: checkin.value.id,
          answers: filteredAnswers,
          userNotes: userNotes.value
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
