<template>
  <UModal
    v-model:open="isOpen"
    title="Refine Recommendation"
    description="Provide feedback to the AI coach to regenerate the recommendation."
    :ui="{ content: 'sm:max-w-lg' }"
  >
    <template #body>
      <div class="space-y-4">
        <UFormField
          label="Your Feedback"
          name="feedback"
          help="The coach will re-evaluate your data and this feedback to suggest a new plan."
        >
          <UTextarea
            v-model="feedback"
            placeholder="e.g. 'I'm feeling extra tired today', 'I want to do a harder session', 'My knee hurts'"
            :rows="5"
            autofocus
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
          icon="i-heroicons-arrow-path"
          @click="submit"
        >
          Regenerate Advice
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

  const feedback = ref('')

  function submit() {
    emit('submit', feedback.value)
  }
</script>
