<template>
  <UModal
    v-model:open="isOpen"
    title="Generate Ad-Hoc Workout"
    description="Create a custom workout for today instantly."
    :ui="{ content: 'sm:max-w-lg' }"
  >
    <template #body>
      <div class="space-y-5">
        <UFormField label="Activity Type" name="type" help="What kind of session is this?">
          <USelect
            v-model="form.type"
            :items="activityOptions"
            class="w-full"
            icon="i-heroicons-bolt"
          />
        </UFormField>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <UFormField label="Duration" name="duration" help="Target time in minutes">
            <UInput
              v-model.number="form.durationMinutes"
              type="number"
              step="15"
              class="w-full"
              icon="i-heroicons-clock"
              trailing-icon="i-heroicons-chevron-up-down"
            >
              <template #trailing>
                <span class="text-xs text-gray-500 pr-2">min</span>
              </template>
            </UInput>
          </UFormField>

          <UFormField label="Intensity" name="intensity" help="Effort level for the session">
            <USelect
              v-model="form.intensity"
              :items="intensityOptions"
              class="w-full"
              icon="i-heroicons-fire"
            />
          </UFormField>
        </div>

        <UFormField
          label="Instructions / Focus"
          name="notes"
          help="Any specific intervals or goals?"
        >
          <UTextarea
            v-model="form.notes"
            placeholder="e.g. 'Focus on high cadence', 'Hill repeats', 'Upper body focus'"
            :rows="3"
            class="w-full"
          />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-3 w-full">
        <UButton color="neutral" variant="ghost" @click="isOpen = false">Cancel</UButton>
        <UButton
          color="primary"
          variant="solid"
          class="font-bold px-6"
          :loading="loading"
          icon="i-heroicons-sparkles"
          @click="submit"
        >
          Generate Workout
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
  const props = defineProps<{
    open: boolean
    loading?: boolean
  }>()

  const emit = defineEmits(['update:open', 'submit'])

  const isOpen = computed({
    get: () => props.open,
    set: (value) => emit('update:open', value)
  })

  const form = reactive({
    type: 'Ride',
    durationMinutes: 60,
    intensity: 'Endurance',
    notes: ''
  })

  const activityOptions = [
    { label: 'Cycling', value: 'Ride' },
    { label: 'Running', value: 'Run' },
    { label: 'Swimming', value: 'Swim' },
    { label: 'Strength / Gym', value: 'WeightTraining' }
  ]

  const intensityOptions = ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'VO2Max', 'Anaerobic']

  function submit() {
    emit('submit', { ...form })
  }
</script>
