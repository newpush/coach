<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-primary" />
        <h2 class="text-xl font-semibold">AI Coach Configuration</h2>
      </div>
    </template>

    <div class="space-y-6">
      <!-- AI Context / About Me -->
      <div>
        <label class="block text-sm font-medium mb-2">About Me (Context for AI)</label>
        <p class="text-sm text-muted mb-3">
          Share details about your injuries, experience, goals, or preferences. The AI will use this
          to personalize your coaching.
        </p>
        <UTextarea
          v-model="localSettings.aiContext"
          :rows="4"
          placeholder="e.g., I'm recovering from a knee injury. I prefer high cadence. I'm training for my first Ironman."
          @update:model-value="handleChange"
        />
      </div>

      <!-- Coach Personality -->
      <div>
        <label class="block text-sm font-medium mb-2">Coach Personality</label>
        <p class="text-sm text-muted mb-3">
          Choose the tone and style of feedback from your AI coach
        </p>
        <USelect
          v-model="localSettings.aiPersona"
          :items="personaOptions"
          size="lg"
          @update:model-value="handleChange"
        />
      </div>

      <!-- Model Selection -->
      <div>
        <label class="block text-sm font-medium mb-2">AI Model</label>
        <p class="text-sm text-muted mb-3">Balance between speed/cost and analysis depth</p>
        <div class="space-y-3">
          <div
            v-for="model in modelOptions"
            :key="model.value"
            class="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:border-primary transition-colors"
            :class="{
              'border-primary bg-primary/5': localSettings.aiModelPreference === model.value
            }"
            @click="selectModel(model.value)"
          >
            <input
              type="radio"
              :checked="localSettings.aiModelPreference === model.value"
              class="mt-1"
            />
            <div class="flex-1">
              <div class="font-medium">{{ model.label }}</div>
              <div class="text-sm text-muted mt-1">{{ model.description }}</div>
              <div class="text-xs text-muted mt-1">{{ model.pricing }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Automation Settings -->
      <div>
        <label class="block text-sm font-medium mb-2">Automatic Analysis</label>
        <p class="text-sm text-muted mb-3">
          Enable AI to automatically analyze your activities as they sync
        </p>
        <div class="space-y-3">
          <USwitch
            v-model="localSettings.aiAutoAnalyzeWorkouts"
            label="Auto-analyze Workouts"
            description="Generate insights for every workout that syncs"
            @update:model-value="handleChange"
          />

          <USwitch
            v-model="localSettings.aiAutoAnalyzeNutrition"
            label="Auto-analyze Nutrition"
            description="Evaluate meal quality and compliance automatically"
            @update:model-value="handleChange"
          />
        </div>
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
      aiPersona: string
      aiModelPreference: string
      aiAutoAnalyzeWorkouts: boolean
      aiAutoAnalyzeNutrition: boolean
      aiContext?: string | null
    }
  }>()

  const emit = defineEmits<{
    save: [settings: typeof props.settings]
  }>()

  const localSettings = ref({ ...props.settings })
  const saving = ref(false)

  const personaOptions = [
    { value: 'Analytical', label: 'Analytical - Data-driven, technical insights' },
    { value: 'Supportive', label: 'Supportive - Encouraging and positive' },
    { value: 'Drill Sergeant', label: 'Drill Sergeant - Direct and demanding' },
    { value: 'Motivational', label: 'Motivational - Inspirational and uplifting' }
  ]

  const modelOptions = [
    {
      value: 'flash',
      label: 'Flash (Gemini Flash)',
      description: 'Fast responses, good for daily summaries and quick insights',
      pricing: '~$0.001 per analysis'
    },
    {
      value: 'pro',
      label: 'Pro (Gemini 3.0 Pro)',
      description: 'Advanced reasoning, ideal for complex race analysis and strategic planning',
      pricing: '~$0.02 per analysis'
    }
  ]

  function selectModel(value: string) {
    localSettings.value.aiModelPreference = value
    handleChange()
  }

  function handleChange() {
    // Auto-save on change (optional, can be removed if you want explicit save only)
    // For now, just mark as changed
  }

  async function saveSettings() {
    saving.value = true
    try {
      emit('save', { ...localSettings.value })
    } finally {
      saving.value = false
    }
  }

  // Watch for prop changes to update local state
  watch(
    () => props.settings,
    (newSettings) => {
      localSettings.value = { ...newSettings }
    },
    { deep: true }
  )
</script>
