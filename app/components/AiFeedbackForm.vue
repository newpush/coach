<template>
  <div class="space-y-4">
    <div class="space-y-4">
      <p class="text-sm text-gray-500">What went wrong with this response? (Optional)</p>
      <UTextarea
        v-model="feedbackText"
        placeholder="The advice was generic..."
        autofocus
        class="w-full"
      />
    </div>

    <div class="flex justify-end gap-2 w-full">
      <UButton color="neutral" variant="ghost" @click="$emit('cancel')">Skip</UButton>
      <UButton color="primary" :loading="loading" @click="submitTextFeedback"> Submit </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
  const props = defineProps<{
    llmUsageId?: string
    roomId?: string
    initialFeedbackText?: string
  }>()

  const emit = defineEmits<{
    (e: 'cancel' | 'submit'): void
  }>()

  const feedbackText = ref(props.initialFeedbackText || '')
  const loading = ref(false)

  async function submitTextFeedback() {
    if (!props.llmUsageId && !props.roomId) return

    loading.value = true
    try {
      await $fetch('/api/llm/feedback', {
        method: 'POST',
        body: {
          llmUsageId: props.llmUsageId,
          roomId: props.roomId,
          feedback: 'THUMBS_DOWN',
          feedbackText: feedbackText.value
        }
      })
      emit('submit')
    } catch (e) {
      console.error('Failed to submit text feedback', e)
    } finally {
      loading.value = false
    }
  }
</script>
