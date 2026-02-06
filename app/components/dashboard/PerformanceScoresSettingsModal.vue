<template>
  <UModal v-model:open="isOpen">
    <template #content>
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-base font-semibold leading-6 text-gray-900 dark:text-white">
              Customize Performance Scores
            </h3>
            <UButton
              icon="i-heroicons-x-mark"
              color="gray"
              variant="ghost"
              @click="isOpen = false"
            />
          </div>
        </template>

        <div class="space-y-6">
          <div class="space-y-4">
            <h4 class="font-medium text-gray-900 dark:text-white text-sm">General</h4>
            <div class="flex items-center justify-between">
              <div class="space-y-0.5">
                <div class="text-sm font-medium text-gray-900 dark:text-white">Show Trends</div>
                <div class="text-xs text-muted">Display trend indicators (arrows/sparklines).</div>
              </div>
              <USwitch v-model="settings.showTrends" />
            </div>
          </div>

          <div class="border-t border-gray-200 dark:border-gray-800" />

          <div class="space-y-4">
            <h4 class="font-medium text-gray-900 dark:text-white text-sm">Visible Scores</h4>

            <div
              v-for="option in scoreOptions"
              :key="option.key"
              class="flex items-center justify-between"
            >
              <div class="text-sm font-medium text-gray-900 dark:text-white">
                {{ option.label }}
              </div>
              <USwitch v-model="settings.visibleScores[option.key]" />
            </div>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton color="neutral" variant="ghost" @click="resetDefaults">
              Reset Defaults
            </UButton>
            <UButton color="primary" @click="isOpen = false"> Done </UButton>
          </div>
        </template>
      </UCard>
    </template>
  </UModal>
</template>

<script setup lang="ts">
  import { useDebounceFn } from '@vueuse/core'

  const isOpen = defineModel<boolean>('open', { default: false })
  const userStore = useUserStore()

  const defaultSettings = {
    showTrends: true,
    visibleScores: {
      currentFitness: true,
      recoveryCapacity: true,
      nutritionCompliance: true,
      trainingConsistency: true
    }
  }

  // Local state for the form, initialized from store
  const settings = ref(
    JSON.parse(
      JSON.stringify(userStore.user?.dashboardSettings?.performanceScores || defaultSettings)
    )
  )

  // Update local state when modal opens or user store changes
  watch(
    () => isOpen.value,
    (open) => {
      if (open) {
        settings.value = JSON.parse(
          JSON.stringify(userStore.user?.dashboardSettings?.performanceScores || defaultSettings)
        )
      }
    }
  )

  // Auto-save changes
  const saveSettings = useDebounceFn(async () => {
    // Merge with existing dashboard settings to avoid overwriting other widgets
    const currentDashboardSettings = userStore.user?.dashboardSettings || {}

    await userStore.updateDashboardSettings({
      ...currentDashboardSettings,
      performanceScores: settings.value
    })
  }, 500)

  watch(
    settings,
    () => {
      saveSettings()
    },
    { deep: true }
  )

  const scoreOptions = [
    { key: 'currentFitness', label: 'Current Fitness' },
    { key: 'recoveryCapacity', label: 'Recovery Capacity' },
    { key: 'nutritionCompliance', label: 'Nutrition Quality' },
    { key: 'trainingConsistency', label: 'Training Consistency' }
  ] as const

  function resetDefaults() {
    settings.value = JSON.parse(JSON.stringify(defaultSettings))
  }
</script>
