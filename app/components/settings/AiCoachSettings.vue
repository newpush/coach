<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-primary" />
        <h2 class="text-xl font-semibold">AI Coach Configuration</h2>
      </div>
    </template>

    <div class="space-y-6">
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

      <!-- Analysis Levels Selection -->
      <div>
        <label class="block text-sm font-medium mb-2">AI Analysis Levels</label>
        <p class="text-sm text-muted mb-3">Choose the depth of analysis for your training data</p>
        <div class="space-y-3">
          <div
            v-for="model in modelOptions"
            :key="model.value"
            class="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:border-primary transition-colors relative"
            :class="{
              'border-primary bg-primary/5': localSettings.aiModelPreference === model.value,
              'opacity-60 grayscale-[0.5]': !isModelAvailable(model)
            }"
            @click="
              !isModelAvailable(model)
                ? upgradeModal.show({
                    featureTitle: model.label + ' Analysis',
                    featureDescription: 'Unlock our most advanced AI analysis engines.',
                    recommendedTier: 'pro'
                  })
                : selectModel(model.value)
            "
          >
            <input
              type="radio"
              :checked="localSettings.aiModelPreference === model.value"
              :disabled="!isModelAvailable(model)"
              class="mt-1"
            />
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <div class="font-medium">{{ model.label }}</div>
                <div
                  v-if="model.minTier === 'PRO' && !isModelAvailable(model)"
                  class="flex items-center gap-2"
                >
                  <UBadge color="primary" variant="subtle" size="sm">Pro</UBadge>
                  <UIcon name="i-heroicons-lock-closed" class="w-4 h-4 text-neutral-500" />
                </div>
              </div>
              <div class="text-sm text-muted mt-1">{{ model.description }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Data & Privacy Settings -->
      <div>
        <label class="block text-sm font-medium mb-2">Data & Privacy</label>
        <p class="text-sm text-muted mb-3">
          Control what data the AI coach can access for analysis
        </p>
        <div class="space-y-3">
          <USwitch
            v-model="localSettings.nutritionTrackingEnabled"
            label="Enable Nutrition Analysis"
            description="Allow the AI to analyze your nutrition data and provide feedback"
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
      aiAutoAnalyzeReadiness: boolean
      aiProactivityEnabled: boolean
      aiDeepAnalysisEnabled: boolean
      aiContext?: string | null
      nutritionTrackingEnabled: boolean
      nickname?: string | null
    }
  }>()

  const emit = defineEmits<{
    save: [settings: typeof props.settings]
  }>()

  const localSettings = ref({ ...props.settings })
  const saving = ref(false)
  const userStore = useUserStore()
  const upgradeModal = useUpgradeModal()

  const personaOptions = [
    { value: 'Analytical', label: 'Analytical - Data-driven, technical insights' },
    { value: 'Supportive', label: 'Supportive - Encouraging and positive' },
    { value: 'Drill Sergeant', label: 'Drill Sergeant - Direct and demanding' },
    { value: 'Motivational', label: 'Motivational - Inspirational and uplifting' }
  ]

  const modelOptions = [
    {
      value: 'flash',
      label: 'Quick',
      description: 'A well balanced experience with rapid-fire feedback.',
      minTier: 'FREE'
    },
    {
      value: 'pro',
      label: 'Thoughtful',
      description: 'State of the art, elite level intelligence for deep-dive strategy.',
      minTier: 'PRO'
    },
    {
      value: 'experimental',
      label: 'Experimental',
      description: "What we're cooking in the lab. Cutting-edge but potentially unstable.",
      minTier: 'PRO'
    }
  ]

  const isContributor = computed(() => userStore.user?.subscriptionStatus === 'CONTRIBUTOR')

  function isModelAvailable(model: any) {
    if (model.minTier === 'FREE') return true
    if (isContributor.value) return true
    return userStore.hasMinimumTier(model.minTier as any)
  }

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
