<template>
  <UCard class="mb-6">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-user-circle" class="w-5 h-5 text-primary" />
        <h2 class="text-xl font-semibold">Identity & Context</h2>
      </div>
    </template>

    <div class="space-y-6">
      <!-- Nickname -->
      <div>
        <label class="block text-sm font-medium mb-2">Nickname</label>
        <p class="text-sm text-muted mb-3">What should the AI coach call you?</p>
        <UInput
          v-model="localSettings.nickname"
          placeholder="e.g. Turbo"
          @update:model-value="handleChange"
        />
      </div>

      <!-- AI Context / About Me -->
      <div>
        <label class="block text-sm font-medium mb-2">About Me (Context for AI)</label>
        <p class="text-sm text-muted mb-3">
          Share details about your injuries, experience, goals, or preferences. The AI will use this
          to personalize your coaching.
        </p>
        <UTextarea
          v-model="localSettings.aiContext"
          :rows="8"
          class="w-full"
          placeholder="e.g., I'm recovering from a knee injury. I prefer high cadence. I'm training for my first Ironman."
          @update:model-value="handleChange"
        />
      </div>

      <!-- Save Button -->
      <div class="flex justify-end">
        <UButton :loading="saving" @click="saveSettings"> Save Changes </UButton>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
  const props = defineProps<{
    settings: {
      nickname?: string | null
      aiContext?: string | null
    }
  }>()

  const emit = defineEmits<{
    save: [settings: any]
  }>()

  const localSettings = ref({ ...props.settings })
  const saving = ref(false)

  function handleChange() {
    // Auto-save logic if needed
  }

  async function saveSettings() {
    saving.value = true
    try {
      emit('save', { ...localSettings.value })
    } finally {
      saving.value = false
    }
  }

  watch(
    () => props.settings,
    (newSettings) => {
      localSettings.value = { ...localSettings.value, ...newSettings }
    },
    { deep: true }
  )
</script>
