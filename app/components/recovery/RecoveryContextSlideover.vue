<template>
  <USlideover v-model:open="isOpen" side="right" :ui="{ content: 'sm:max-w-2xl' }">
    <template #content>
      <div class="flex h-full flex-col bg-white dark:bg-gray-950">
        <div
          class="border-b border-gray-200 bg-gray-50/80 px-5 py-5 dark:border-gray-800 dark:bg-gray-900/40"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="max-w-xl">
              <div class="flex items-center gap-2">
                <div
                  class="flex size-10 items-center justify-center rounded-2xl bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                >
                  <UIcon name="i-lucide-heart-handshake" class="size-5" />
                </div>
                <p class="text-[10px] font-black uppercase tracking-[0.24em] text-gray-400">
                  Recovery Context
                </p>
              </div>
              <h2 class="mt-3 text-xl font-semibold text-gray-900 dark:text-white">
                {{ title }}
              </h2>
              <p class="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                {{ subtitle }}
              </p>
            </div>
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              square
              @click="
                () => {
                  isOpen = false
                }
              "
            />
          </div>
        </div>

        <div class="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div
            v-if="selectedItem"
            class="rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/60"
          >
            <div class="flex flex-wrap items-center gap-2">
              <UBadge :color="badgeColor" variant="subtle">{{ selectedItem.origin }}</UBadge>
              <UBadge v-if="selectedItem.severity" color="warning" variant="subtle">
                Severity {{ selectedItem.severity }}/10
              </UBadge>
            </div>
            <p class="mt-3 text-sm text-gray-600 dark:text-gray-300">
              {{ selectedItem.description || 'No additional context provided.' }}
            </p>
          </div>

          <div v-if="isImported">
            <div
              class="rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-4 text-sm text-sky-900 dark:border-sky-950/40 dark:bg-sky-950/10 dark:text-sky-100"
            >
              <div class="flex items-start gap-3">
                <div
                  class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-white text-sky-500 dark:bg-gray-900 dark:text-sky-300"
                >
                  <UIcon name="i-lucide-cloud-download" class="size-4" />
                </div>
                <div>
                  <p class="font-medium">Imported context is read-only here</p>
                  <p class="mt-1 leading-relaxed text-sky-800/80 dark:text-sky-200/80">
                    This entry stays aligned with the connected source, so it can be viewed here but
                    not edited locally.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <template v-else-if="isJourneyEvent || createMode">
            <div class="space-y-6">
              <div
                class="rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 px-4 py-4 dark:border-gray-800 dark:bg-gray-900/40"
              >
                <p class="text-sm leading-relaxed text-gray-700 dark:text-gray-200">
                  Log something that helps explain unusual recovery, sleep, HRV, RHR, or training
                  response.
                </p>
              </div>

              <div>
                <label
                  class="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400"
                >
                  What happened?
                </label>
                <div class="grid gap-3 sm:grid-cols-2">
                  <button
                    v-for="option in journeyEventOptions"
                    :key="option.id"
                    type="button"
                    :class="[
                      'rounded-2xl border px-4 py-4 text-left transition',
                      isJourneyOptionActive(option)
                        ? 'border-primary-500 bg-primary-50 shadow-sm dark:bg-primary-950/30'
                        : 'border-gray-200 bg-white shadow-sm hover:border-primary-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:hover:bg-gray-900'
                    ]"
                    @click="
                      () => {
                        void selectJourneyOption(option)
                      }
                    "
                  >
                    <div class="flex items-start gap-3">
                      <div
                        :class="[
                          'mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl',
                          isJourneyOptionActive(option)
                            ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                        ]"
                      >
                        <UIcon :name="option.icon" class="size-4.5" />
                      </div>
                      <div class="min-w-0">
                        <p class="text-sm font-semibold text-gray-900 dark:text-white">
                          {{ option.title }}
                        </p>
                        <p class="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                          {{ option.subtitle }}
                        </p>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <UBadge color="neutral" variant="subtle" class="font-medium">
                  {{ eventTypeBadgeLabel }}
                </UBadge>
                <UBadge
                  v-if="selectedJourneyOption"
                  color="primary"
                  variant="subtle"
                  class="font-medium"
                >
                  {{ selectedJourneyOption.title }}
                </UBadge>
              </div>

              <div>
                <label
                  class="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400"
                >
                  How much did it affect you?
                </label>
                <div class="grid gap-3 sm:grid-cols-3">
                  <button
                    v-for="level in severityOptions"
                    :key="level.label"
                    type="button"
                    :class="[
                      'rounded-2xl border px-4 py-4 text-left transition',
                      selectedSeverityLabel === level.label
                        ? 'border-primary-500 bg-primary-50 shadow-sm dark:bg-primary-950/30'
                        : 'border-gray-200 bg-white shadow-sm hover:border-primary-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:hover:bg-gray-900'
                    ]"
                    @click="
                      () => {
                        journeyForm.severity = level.value
                      }
                    "
                  >
                    <div class="flex items-center justify-between gap-2">
                      <div class="flex items-center gap-2">
                        <div
                          :class="[
                            'flex size-8 items-center justify-center rounded-lg',
                            selectedSeverityLabel === level.label
                              ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200'
                              : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300'
                          ]"
                        >
                          <UIcon :name="level.icon" class="size-4" />
                        </div>
                        <p class="text-sm font-semibold text-gray-900 dark:text-white">
                          {{ level.label }}
                        </p>
                      </div>
                      <span class="text-xs font-semibold text-gray-400">{{ level.value }}/10</span>
                    </div>
                    <p class="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                      {{ level.description }}
                    </p>
                  </button>
                </div>
              </div>

              <div>
                <label
                  class="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400"
                >
                  When did this happen?
                </label>
                <div class="mb-3 flex flex-wrap gap-2">
                  <UButton
                    v-for="preset in timePresets"
                    :key="preset.id"
                    color="neutral"
                    :variant="selectedTimePreset === preset.id ? 'solid' : 'outline'"
                    size="xs"
                    @click="
                      () => {
                        void applyTimePreset(preset.id)
                      }
                    "
                  >
                    {{ preset.label }}
                  </UButton>
                </div>
                <UInput v-model="journeyForm.timestamp" type="datetime-local" class="w-full" />
              </div>

              <div>
                <p
                  class="rounded-xl bg-gray-50 px-3 py-3 text-xs leading-relaxed text-gray-500 dark:bg-gray-900 dark:text-gray-400"
                >
                  Mild: noticeable but manageable. Moderate: clearly affecting recovery or training.
                  Severe: strong impact, likely explains major disruption.
                </p>
              </div>

              <div>
                <label
                  class="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-600 dark:text-gray-300"
                >
                  Tell Coach Watts more
                </label>
                <UTextarea
                  v-model="journeyForm.description"
                  :rows="6"
                  class="w-full"
                  placeholder="Describe symptoms, possible trigger, what changed, or anything unusual you noticed."
                />
                <p class="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  Examples: fever starting last night, restless sleep, heavy legs after travel,
                  stomach discomfort during training.
                </p>
              </div>
            </div>
          </template>

          <template v-else-if="isCheckin">
            <div class="space-y-3">
              <div
                v-for="question in checkinForm.questions"
                :key="question.id"
                class="rounded-2xl border border-gray-200 px-4 py-3 dark:border-gray-800"
              >
                <p class="text-sm font-medium text-gray-900 dark:text-white">{{ question.text }}</p>
                <div class="mt-3">
                  <URadioGroup
                    v-model="question.answer"
                    :items="[
                      { label: 'Yes', value: 'YES' },
                      { label: 'No', value: 'NO' }
                    ]"
                    orientation="horizontal"
                  />
                </div>
              </div>
              <div>
                <label
                  class="mb-1 block text-xs font-semibold uppercase tracking-widest text-gray-600 dark:text-gray-300"
                >
                  Notes
                </label>
                <UTextarea
                  v-model="checkinForm.userNotes"
                  :rows="5"
                  class="w-full"
                  placeholder="Add anything that will help explain your answers or how you felt today."
                />
              </div>
            </div>
          </template>
        </div>

        <div
          class="border-t border-gray-200 bg-white/90 px-5 py-4 backdrop-blur dark:border-gray-800 dark:bg-gray-950/90"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex gap-2">
              <UButton color="neutral" variant="outline" to="/fitness"> Open on Fitness </UButton>
              <UButton
                v-if="canDelete"
                color="error"
                variant="ghost"
                icon="i-lucide-trash"
                :loading="deleting"
                @click="
                  () => {
                    void handleDelete()
                  }
                "
              >
                Delete
              </UButton>
            </div>

            <div class="flex gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                @click="
                  () => {
                    isOpen = false
                  }
                "
                >Close</UButton
              >
              <UButton
                v-if="canSave"
                color="primary"
                :loading="saving"
                @click="
                  () => {
                    void handleSave()
                  }
                "
              >
                {{ createMode ? 'Log event' : 'Save changes' }}
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>

<script setup lang="ts">
  import type { RecoveryContextItem } from '~/types/recovery-context'
  import type { JourneyEventCategory, JourneyEventType } from '~/types/nutrition'

  const props = defineProps<{
    open: boolean
    item: RecoveryContextItem | null
    createMode?: boolean
    createDate?: string | null
  }>()

  const emit = defineEmits<{
    'update:open': [value: boolean]
    saved: []
    deleted: []
  }>()

  const toast = useToast()
  const { formatDateTime, getUserLocalDate } = useFormat()
  const saving = ref(false)
  const deleting = ref(false)
  const selectedTimePreset = ref<'now' | 'earlier-today' | 'yesterday' | 'custom'>('now')

  const isOpen = computed({
    get: () => props.open,
    set: (value) => emit('update:open', value)
  })

  const selectedItem = computed(() => props.item)
  const createMode = computed(() => props.createMode === true)
  const isImported = computed(() => selectedItem.value?.sourceType === 'imported')
  const isJourneyEvent = computed(() => selectedItem.value?.kind === 'journey_event')
  const isCheckin = computed(() => selectedItem.value?.kind === 'daily_checkin')
  const canSave = computed(() => createMode.value || !!selectedItem.value?.editable)
  const canDelete = computed(() => !!selectedItem.value?.deletable && !createMode.value)

  const title = computed(() => {
    if (createMode.value) return 'Log recovery event'
    return selectedItem.value?.label || 'Recovery Context'
  })

  const subtitle = computed(() => {
    if (createMode.value)
      return 'Capture the context behind unusual recovery, sleep, biometrics, or training response.'
    if (!selectedItem.value) return 'Review how this item affects your recovery context.'
    return `${selectedItem.value.origin} • ${formatDateTime(selectedItem.value.startAt, 'MMM d, yyyy h:mm a')}`
  })

  const badgeColor = computed(() => {
    if (selectedItem.value?.sourceType === 'imported') return 'info'
    if (selectedItem.value?.sourceType === 'manual_event') return 'warning'
    return 'success'
  })

  type JourneyEventOption = {
    id: string
    title: string
    subtitle: string
    icon: string
    category: JourneyEventCategory
    eventType: JourneyEventType
  }

  const journeyEventOptions: JourneyEventOption[] = [
    {
      id: 'illness',
      title: 'Illness / sick',
      subtitle: 'Cold, fever, flu, feeling run down, or unexplained crash.',
      icon: 'i-lucide-thermometer',
      category: 'FATIGUE',
      eventType: 'WELLNESS_CHECK'
    },
    {
      id: 'injury',
      title: 'Injury / pain',
      subtitle: 'Pain, soreness, or something that may limit normal training.',
      icon: 'i-lucide-bandage',
      category: 'MUSCLE_PAIN',
      eventType: 'SYMPTOM'
    },
    {
      id: 'fatigue',
      title: 'Fatigue / heavy legs',
      subtitle: 'Low energy, unusually hard effort, flat legs, or poor readiness.',
      icon: 'i-lucide-battery-warning',
      category: 'FATIGUE',
      eventType: 'SYMPTOM'
    },
    {
      id: 'sleep',
      title: 'Poor sleep',
      subtitle: 'Short sleep, frequent wakeups, restless night, or poor sleep quality.',
      icon: 'i-lucide-moon-star',
      category: 'SLEEP',
      eventType: 'WELLNESS_CHECK'
    },
    {
      id: 'mood',
      title: 'Mood / stress',
      subtitle: 'Stress, anxiety, emotional strain, or feeling mentally off.',
      icon: 'i-lucide-cloud-lightning',
      category: 'MOOD',
      eventType: 'WELLNESS_CHECK'
    },
    {
      id: 'gi',
      title: 'GI issues',
      subtitle: 'Nausea, bloating, stomach discomfort, or gut problems during training.',
      icon: 'i-lucide-shell',
      category: 'GI_DISTRESS',
      eventType: 'SYMPTOM'
    },
    {
      id: 'cramping',
      title: 'Cramping',
      subtitle: 'Muscle cramping, tightness, or spasms affecting performance.',
      icon: 'i-lucide-zap',
      category: 'CRAMPING',
      eventType: 'SYMPTOM'
    },
    {
      id: 'dizziness',
      title: 'Dizziness',
      subtitle: 'Lightheadedness, dizziness, or feeling unstable.',
      icon: 'i-lucide-orbit',
      category: 'DIZZINESS',
      eventType: 'SYMPTOM'
    },
    {
      id: 'hunger',
      title: 'Hunger / underfueled',
      subtitle: 'Low energy from underfueling, hunger, or poor intake.',
      icon: 'i-lucide-utensils-crossed',
      category: 'HUNGER',
      eventType: 'SYMPTOM'
    },
    {
      id: 'note',
      title: 'General recovery note',
      subtitle: 'Anything unusual you want Coach Watts to remember or correlate.',
      icon: 'i-lucide-notebook-pen',
      category: 'FATIGUE',
      eventType: 'RECOVERY_NOTE'
    }
  ]

  const severityOptions = [
    {
      label: 'Mild',
      value: 3,
      icon: 'i-lucide-leaf',
      description: 'Noticeable but manageable.'
    },
    {
      label: 'Moderate',
      value: 6,
      icon: 'i-lucide-gauge',
      description: 'Clearly affecting recovery or training.'
    },
    {
      label: 'Severe',
      value: 9,
      icon: 'i-lucide-triangle-alert',
      description: 'Strong impact, likely explains major disruption.'
    }
  ] as const

  const timePresets = [
    { id: 'now', label: 'Now' },
    { id: 'earlier-today', label: 'Earlier today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'custom', label: 'Custom' }
  ] as const

  const journeyForm = reactive({
    category: 'FATIGUE' as JourneyEventCategory,
    eventType: 'SYMPTOM' as JourneyEventType,
    severity: 5,
    timestamp: '',
    description: ''
  })

  const checkinForm = reactive({
    questions: [] as Array<{ id: string; text: string; answer?: string }>,
    userNotes: ''
  })

  function toLocalDateTimeValue(value?: string | Date | null): string {
    if (!value) {
      const now = new Date()
      const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      return local.toISOString().slice(0, 16)
    }
    const date = typeof value === 'string' ? new Date(value) : value
    if (isNaN(date.getTime())) {
      const now = new Date()
      const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      return local.toISOString().slice(0, 16)
    }
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    return local.toISOString().slice(0, 16)
  }

  function initForm() {
    if (createMode.value) {
      journeyForm.category = 'FATIGUE'
      journeyForm.eventType = 'SYMPTOM'
      journeyForm.severity = 6
      journeyForm.timestamp = toLocalDateTimeValue(props.createDate || new Date())
      journeyForm.description = ''
      selectedTimePreset.value = props.createDate ? 'custom' : 'now'
    } else if (props.item?.kind === 'journey_event') {
      journeyForm.category = (props.item.category || 'FATIGUE') as JourneyEventCategory
      journeyForm.eventType = (String(props.item.metadata?.eventType || 'SYMPTOM') ||
        'SYMPTOM') as JourneyEventType
      journeyForm.severity = props.item.severity || 5
      journeyForm.timestamp = toLocalDateTimeValue(props.item.startAt)
      journeyForm.description = props.item.description || ''
      selectedTimePreset.value = 'custom'
    } else if (props.item?.kind === 'daily_checkin') {
      checkinForm.questions = (props.item.rawAnswerSummary || []).map((question) => ({
        ...question,
        answer: question.answer || undefined
      }))
      checkinForm.userNotes = props.item.userNotes || ''
    }
  }

  watch(
    () => [props.open, props.item, props.createDate],
    ([open]) => {
      if (open) {
        initForm()
      }
    },
    { immediate: true }
  )

  const selectedJourneyOption = computed(() => findJourneyOption())

  const selectedSeverityLabel = computed(() => {
    if (journeyForm.severity <= 4) return 'Mild'
    if (journeyForm.severity <= 7) return 'Moderate'
    return 'Severe'
  })

  const eventTypeBadgeLabel = computed(() => {
    if (journeyForm.eventType === 'RECOVERY_NOTE') return 'Logged as recovery note'
    if (journeyForm.eventType === 'WELLNESS_CHECK') return 'Logged as wellness check'
    return 'Logged as symptom'
  })

  function setLocalDateTime(baseDate: Date, hour: number, minute: number) {
    const date = new Date(baseDate)
    date.setHours(hour, minute, 0, 0)
    return date
  }

  function findJourneyOption() {
    const exactMatch = journeyEventOptions.find(
      (option) =>
        option.category === journeyForm.category && option.eventType === journeyForm.eventType
    )

    if (exactMatch) return exactMatch

    return journeyEventOptions.find((option) => option.category === journeyForm.category) || null
  }

  function isJourneyOptionActive(option: JourneyEventOption) {
    return selectedJourneyOption.value?.id === option.id
  }

  function selectJourneyOption(option: JourneyEventOption) {
    journeyForm.category = option.category
    journeyForm.eventType = option.eventType
  }

  function applyTimePreset(presetId: 'now' | 'earlier-today' | 'yesterday' | 'custom') {
    selectedTimePreset.value = presetId

    if (presetId === 'custom') return

    const localToday = getUserLocalDate()
    const now = new Date()
    let nextDate = now

    if (presetId === 'earlier-today') {
      nextDate = setLocalDateTime(localToday, 8, 0)
    } else if (presetId === 'yesterday') {
      const yesterday = new Date(localToday)
      yesterday.setUTCDate(yesterday.getUTCDate() - 1)
      nextDate = setLocalDateTime(yesterday, 9, 0)
    }

    journeyForm.timestamp = toLocalDateTimeValue(nextDate)
  }

  async function handleSave() {
    saving.value = true

    try {
      if (createMode.value || isJourneyEvent.value) {
        if (!journeyForm.timestamp || isNaN(new Date(journeyForm.timestamp).getTime())) {
          toast.add({
            title: 'Invalid time value',
            description: 'Please select a valid date and time for the recovery event.',
            color: 'error'
          })
          saving.value = false
          return
        }
      }

      if (createMode.value) {
        await $fetch<any, string & {}>('/api/recovery-context/journey', {
          method: 'POST',
          body: {
            timestamp: new Date(journeyForm.timestamp).toISOString(),
            eventType: journeyForm.eventType,
            category: journeyForm.category,
            severity: Number(journeyForm.severity),
            description: journeyForm.description || undefined
          }
        })
      } else if (isJourneyEvent.value && selectedItem.value) {
        await $fetch<any, string & {}>(
          `/api/recovery-context/journey/${selectedItem.value.sourceRecordId}`,
          {
            method: 'PATCH',
            body: {
              timestamp: new Date(journeyForm.timestamp).toISOString(),
              eventType: journeyForm.eventType,
              category: journeyForm.category,
              severity: Number(journeyForm.severity),
              description: journeyForm.description || null
            }
          }
        )
      } else if (isCheckin.value && selectedItem.value) {
        await $fetch<any, string & {}>(`/api/checkin/${selectedItem.value.sourceRecordId}`, {
          method: 'PATCH',
          body: {
            questions: checkinForm.questions,
            userNotes: checkinForm.userNotes || null
          }
        })
      }

      toast.add({
        title: createMode.value ? 'Recovery event logged' : 'Recovery context updated',
        color: 'success'
      })
      emit('saved')
      isOpen.value = false
    } catch (error: any) {
      toast.add({
        title: 'Unable to save changes',
        description: error?.data?.message || error?.message || 'Please try again.',
        color: 'error'
      })
    } finally {
      saving.value = false
    }
  }

  async function handleDelete() {
    if (!selectedItem.value) return
    if (!window.confirm('Delete this recovery context entry?')) return

    deleting.value = true

    try {
      if (selectedItem.value.kind === 'journey_event') {
        await $fetch<any, string & {}>(
          `/api/recovery-context/journey/${selectedItem.value.sourceRecordId}`,
          {
            method: 'DELETE'
          }
        )
      } else if (selectedItem.value.kind === 'daily_checkin') {
        await $fetch<any, string & {}>(`/api/checkin/${selectedItem.value.sourceRecordId}`, {
          method: 'DELETE'
        })
      }

      toast.add({
        title: 'Entry deleted',
        color: 'success'
      })
      emit('deleted')
      isOpen.value = false
    } catch (error: any) {
      toast.add({
        title: 'Unable to delete entry',
        description: error?.data?.message || error?.message || 'Please try again.',
        color: 'error'
      })
    } finally {
      deleting.value = false
    }
  }
</script>
