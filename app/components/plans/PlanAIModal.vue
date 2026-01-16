<template>
  <UModal
    :open="modelValue"
    title="Plan Week with AI"
    @update:open="$emit('update:modelValue', $event)"
  >
    <template #body>
      <div class="p-6 space-y-4">
        <div
          v-if="weekLabel"
          class="flex items-center gap-2 p-3 bg-primary/5 text-primary rounded-lg border border-primary/10"
        >
          <UIcon name="i-heroicons-calendar" class="w-5 h-5 flex-shrink-0" />
          <div>
            <div class="text-xs font-semibold uppercase opacity-70">Planning For</div>
            <div class="font-medium">{{ weekLabel }}</div>
          </div>
        </div>

        <p class="text-sm text-muted">
          Tell the AI about your availability, constraints, or specific goals for this week. It will
          regenerate the week's workouts based on your instructions.
        </p>

        <UFormField label="Instructions">
          <UTextarea
            v-model="instructions"
            placeholder="e.g. I want 3 gym sessions this week, no swimming on Tuesday, and a long ride on Sunday."
            class="w-full h-32"
            autofocus
          />
        </UFormField>

        <div v-if="workouts.length > 0" class="space-y-2">
          <label class="block text-sm font-medium">Keep Existing Workouts?</label>
          <p class="text-xs text-muted mb-2">
            Select workouts to lock in place. The AI will plan around them.
          </p>
          <div
            class="max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-2 space-y-1"
          >
            <div
              v-for="workout in workouts"
              :key="workout.id"
              class="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded cursor-pointer"
              @click="toggleAnchor(workout.id)"
            >
              <UCheckbox
                :model-value="selectedIds.includes(workout.id)"
                @update:model-value="toggleAnchor(workout.id)"
                @click.stop
              />
              <div class="flex-1 text-xs">
                <div class="flex justify-between">
                  <span class="font-medium">{{ workout.title }}</span>
                  <span class="text-muted">{{ formatDateUTC(workout.date) }}</span>
                </div>
                <div class="text-muted truncate">{{ workout.type }}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-2 mt-4">
          <UButton color="neutral" variant="ghost" @click="$emit('update:modelValue', false)"
            >Cancel</UButton
          >
          <UButton
            color="primary"
            :loading="loading"
            icon="i-heroicons-sparkles"
            @click="generatePlan"
          >
            Generate Plan
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
  const { formatDate, formatDateUTC } = useFormat()

  const props = defineProps<{
    modelValue: boolean
    loading?: boolean
    weekLabel?: string
    startDate?: string
    endDate?: string
  }>()

  const emit = defineEmits(['update:modelValue', 'generate'])

  const instructions = ref('')
  const workouts = ref<any[]>([])
  const selectedIds = ref<string[]>([])

  async function fetchWorkouts() {
    if (!props.startDate || !props.endDate) return
    try {
      const data: any[] = await $fetch('/api/planned-workouts', {
        query: {
          startDate: props.startDate,
          endDate: props.endDate,
          limit: 50
        }
      })
      // Only show future/incomplete workouts? Or all?
      // The goal is to anchor future plans.
      workouts.value = data
      // Select all by default? No, user might want to replace them.
      // But if they are "Anchors", maybe select Independent ones by default?
      // Let's leave unchecked by default for explicit opt-in.
    } catch (e) {
      console.error(e)
    }
  }

  watch(
    () => props.modelValue,
    (isOpen) => {
      if (isOpen) {
        fetchWorkouts()
        selectedIds.value = []
      }
    }
  )

  function toggleAnchor(id: string) {
    if (selectedIds.value.includes(id)) {
      selectedIds.value = selectedIds.value.filter((i) => i !== id)
    } else {
      selectedIds.value.push(id)
    }
  }

  function generate() {
    // allow empty instructions if anchors are selected? No, usually needs instruction.
    // But "Regenerate" might be enough.
    // if (!instructions.value.trim()) return

    emit('generate', instructions.value, selectedIds.value)
  }

  // Alias for button click
  const generatePlan = generate
</script>
