<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-2xl font-bold">AI Coach Settings</h2>
      <p class="text-neutral-500">
        Configure your AI coach preferences, personality, and data access.
      </p>
    </div>

    <UCard v-if="showUpgradeBanner && !userStore.hasMinimumTier('SUPPORTER')" class="mb-6">
      <div class="flex items-start gap-4">
        <UIcon name="i-heroicons-sparkles" class="w-10 h-10 text-primary shrink-0 mt-1" />
        <div class="flex-1 flex justify-between items-start">
          <div>
            <h3 class="text-lg font-bold text-gray-900 dark:text-white">
              Consider upgrading your plan
            </h3>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400 font-medium">
              Unlock the full potential of your AI Coach with a paid plan. Get automatic analysis,
              thoughtful analysis, and proactive coaching to take your training to the next level.
            </p>
            <div class="mt-3">
              <UButton
                to="/pricing"
                color="primary"
                size="sm"
                label="View Plans"
                icon="i-heroicons-arrow-right"
                trailing
              />
            </div>
          </div>
          <UButton
            icon="i-heroicons-x-mark"
            color="neutral"
            variant="ghost"
            size="sm"
            @click="showUpgradeBanner = false"
          />
        </div>
      </div>
    </UCard>

    <!-- Three-column layout for settings, analytics, and charts -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <SettingsAiCoachSettings v-if="aiSettings" :settings="aiSettings" @save="saveAiSettings" />

      <div class="flex flex-col gap-6">
        <SettingsAiAutomationSettings
          v-if="aiSettings"
          :settings="aiSettings"
          @save="saveAiSettings"
        />
        <ClientOnly>
          <SettingsAiUsage />
        </ClientOnly>
      </div>

      <ClientOnly>
        <SettingsAiUsageCharts />
      </ClientOnly>
    </div>

    <!-- Identity & Context -->
    <SettingsAiIdentitySettings v-if="aiSettings" :settings="aiSettings" @save="saveAiSettings" />

    <!-- Full-width history table below -->
    <ClientOnly>
      <SettingsAiUsageHistory />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
  import { useLocalStorage } from '@vueuse/core'

  const toast = useToast()

  definePageMeta({
    middleware: 'auth'
  })

  useHead({
    title: 'AI Coach Settings',
    meta: [
      {
        name: 'description',
        content: 'Configure your AI coach preferences, personality, and data access.'
      }
    ]
  })

  const userStore = useUserStore()
  const showUpgradeBanner = useLocalStorage('ai-settings-upgrade-banner', true)

  // Fetch AI settings
  const { data: aiSettings, refresh: refreshSettings } = await useFetch('/api/settings/ai', {
    lazy: true,
    server: false
  })

  async function saveAiSettings(settings: any) {
    try {
      await $fetch('/api/settings/ai', {
        method: 'POST',
        body: settings
      })

      toast.add({
        title: 'Settings Saved',
        description: 'Your AI coach settings have been updated',
        color: 'success'
      })

      // Refresh settings to ensure they're in sync
      await refreshSettings()
    } catch (error: any) {
      toast.add({
        title: 'Save Failed',
        description: error.data?.message || 'Failed to save AI settings',
        color: 'error'
      })
    }
  }
</script>
