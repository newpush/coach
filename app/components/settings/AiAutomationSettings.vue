<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-bolt" class="w-5 h-5 text-primary" />
        <h2 class="text-xl font-semibold">Automation Settings</h2>
      </div>
    </template>

    <div class="space-y-4">
      <!-- Auto-Analyze Readiness (Supporter+) -->
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <USwitch
            v-model="localSettings.aiAutoAnalyzeReadiness"
            label="Auto-analyze Readiness"
            description="Generate coaching tips for your day automatically"
            :disabled="!userStore.hasMinimumTier('SUPPORTER')"
            @update:model-value="handleChange"
          />
        </div>
        <div v-if="!userStore.hasMinimumTier('SUPPORTER')" class="flex items-center gap-2">
          <UBadge color="primary" variant="subtle" size="xs">Supporter</UBadge>
          <UButton
            icon="i-heroicons-lock-closed"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="
              upgradeModal.show({
                featureTitle: 'Auto-analyze Readiness',
                featureDescription:
                  'Automatically receive coaching tips and readiness insights for your day.',
                recommendedTier: 'supporter'
              })
            "
          />
        </div>
      </div>

      <!-- Auto-Analyze Workouts (Supporter+) -->
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <USwitch
            v-model="localSettings.aiAutoAnalyzeWorkouts"
            label="Auto-analyze Workouts"
            description="Generate insights for every workout that syncs"
            :disabled="!userStore.hasMinimumTier('SUPPORTER')"
            @update:model-value="handleChange"
          />
        </div>
        <div v-if="!userStore.hasMinimumTier('SUPPORTER')" class="flex items-center gap-2">
          <UBadge color="primary" variant="subtle" size="xs">Supporter</UBadge>
          <UButton
            icon="i-heroicons-lock-closed"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="
              upgradeModal.show({
                featureTitle: 'Auto-analyze Workouts',
                featureDescription:
                  'Automatically generate insights for every workout without manual intervention.',
                recommendedTier: 'supporter'
              })
            "
          />
        </div>
      </div>

      <!-- Auto-Analyze Nutrition (Supporter+) -->
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <USwitch
            v-model="localSettings.aiAutoAnalyzeNutrition"
            label="Auto-analyze Nutrition"
            description="Evaluate meal quality and compliance automatically"
            :disabled="!userStore.hasMinimumTier('SUPPORTER')"
            @update:model-value="handleChange"
          />
        </div>
        <div v-if="!userStore.hasMinimumTier('SUPPORTER')" class="flex items-center gap-2">
          <UBadge color="primary" variant="subtle" size="xs">Supporter</UBadge>
          <UButton
            icon="i-heroicons-lock-closed"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="
              upgradeModal.show({
                featureTitle: 'Auto-analyze Nutrition',
                featureDescription:
                  'Automatically evaluate meal quality and compliance as soon as data syncs.',
                recommendedTier: 'supporter'
              })
            "
          />
        </div>
      </div>

      <!-- Thoughtful Analysis (Pro+) -->
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <USwitch
            v-model="localSettings.aiDeepAnalysisEnabled"
            label="Thoughtful Analysis"
            description="Use advanced reasoning for more thorough activity breakdowns"
            :disabled="!userStore.hasMinimumTier('PRO')"
            @update:model-value="handleChange"
          />
        </div>
        <div v-if="!userStore.hasMinimumTier('PRO')" class="flex items-center gap-2">
          <UBadge color="primary" variant="subtle" size="xs">Pro</UBadge>
          <UButton
            icon="i-heroicons-lock-closed"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="
              upgradeModal.show({
                featureTitle: 'Thoughtful Analysis',
                featureDescription:
                  'Get more thorough activity breakdowns with our most powerful AI engine.',
                recommendedTier: 'pro'
              })
            "
          />
        </div>
      </div>

      <!-- Proactive Coaching (Pro+) -->
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <USwitch
            v-model="localSettings.aiProactivityEnabled"
            label="Proactive Coaching"
            description="Allow the coach to send you unprompted tips and warnings"
            :disabled="!userStore.hasMinimumTier('PRO')"
            @update:model-value="handleChange"
          />
        </div>
        <div v-if="!userStore.hasMinimumTier('PRO')" class="flex items-center gap-2">
          <UBadge color="primary" variant="subtle" size="xs">Pro</UBadge>
          <UButton
            icon="i-heroicons-lock-closed"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="
              upgradeModal.show({
                featureTitle: 'Proactive Coaching',
                featureDescription:
                  'Receive personalized training tips and recovery warnings automatically.',
                recommendedTier: 'pro'
              })
            "
          />
        </div>
      </div>

      <!-- Save Button -->
      <div class="flex justify-end pt-4">
        <UButton :loading="saving" @click="saveSettings"> Save Changes </UButton>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
  const props = defineProps<{
    settings: {
      aiAutoAnalyzeWorkouts: boolean
      aiAutoAnalyzeNutrition: boolean
      aiAutoAnalyzeReadiness: boolean
      aiProactivityEnabled: boolean
      aiDeepAnalysisEnabled: boolean
      [key: string]: any // Allow other props to pass through without type error if mixed
    }
  }>()

  const emit = defineEmits<{
    save: [settings: typeof props.settings]
  }>()

  const localSettings = ref({ ...props.settings })
  const saving = ref(false)
  const userStore = useUserStore()
  const upgradeModal = useUpgradeModal()

  function handleChange() {
    // Auto-save on change (optional)
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
      // Only update if changed to avoid overwriting local edits while typing?
      // For switches it's fine.
      localSettings.value = { ...localSettings.value, ...newSettings }
    },
    { deep: true }
  )
</script>
