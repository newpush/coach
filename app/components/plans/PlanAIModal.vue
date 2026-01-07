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
  const props = defineProps<{
    modelValue: boolean
    loading?: boolean
    weekLabel?: string
  }>()

  const emit = defineEmits(['update:modelValue', 'generate'])

  const instructions = ref('')

  function generate() {
    if (!instructions.value.trim()) return

    emit('generate', instructions.value)
    // Don't close modal immediately, let parent handle success/loading state
  }

  // Alias for button click
  const generatePlan = generate
</script>
