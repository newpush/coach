<template>
  <div class="space-y-6">
    <!-- Three-column layout for settings, analytics, and charts -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <SettingsAiCoachSettings v-if="aiSettings" :settings="aiSettings" @save="saveAiSettings" />

      <ClientOnly>
        <SettingsAiUsage />
      </ClientOnly>

      <ClientOnly>
        <SettingsAiUsageCharts />
      </ClientOnly>
    </div>

    <!-- Full-width history table below -->
    <ClientOnly>
      <SettingsAiUsageHistory />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
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
