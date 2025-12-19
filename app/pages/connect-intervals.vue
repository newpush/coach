<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Connect Intervals.icu">
        <template #leading>
          <UButton
            icon="i-heroicons-arrow-left"
            variant="ghost"
            color="neutral"
            @click="goBack"
          >
            Back
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-6 max-w-2xl mx-auto">
        <UCard>
          <template #header>
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <UIcon name="i-heroicons-chart-bar" class="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 class="text-xl font-semibold">Connect Intervals.icu</h2>
                <p class="text-sm text-muted">
                  Enter your Intervals.icu credentials to connect your account.
                </p>
              </div>
            </div>
          </template>

          <div class="space-y-6">
            <div class="bg-muted/50 p-4 rounded-lg">
              <h3 class="font-medium mb-2">Instructions</h3>
              <ol class="text-sm text-muted space-y-2">
                <li>1. Go to <a href="https://intervals.icu/settings" target="_blank" class="text-primary hover:underline">intervals.icu/settings</a></li>
                <li>2. Note your Athlete ID shown at the top (e.g., "i12345")</li>
                <li>3. Scroll to the "API Key" section and copy your API key</li>
                <li>4. Paste both values below</li>
              </ol>
            </div>

            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium mb-2">
                  Athlete ID <span class="text-red-500">*</span>
                </label>
                <UInput
                  v-model="athleteId"
                  placeholder="e.g., i12345"
                  size="lg"
                />
                <p class="text-xs text-muted mt-1">
                  Shown at the top of intervals.icu/settings page
                </p>
              </div>
              
              <div>
                <label class="block text-sm font-medium mb-2">
                  API Key <span class="text-red-500">*</span>
                </label>
                <UInput
                  v-model="apiKey"
                  type="password"
                  placeholder="Enter your API key"
                  size="lg"
                />
                <p class="text-xs text-muted mt-1">
                  Find this in the "API Key" section at intervals.icu/settings
                </p>
              </div>
            </div>
          </div>

          <template #footer>
            <div class="flex justify-end gap-3">
              <UButton
                to="/dashboard"
                color="neutral"
                variant="outline"
              >
                Cancel
              </UButton>
              <UButton
                @click="connect"
                :loading="connecting"
                :disabled="!apiKey || !athleteId"
              >
                Connect
              </UButton>
            </div>
          </template>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
const toast = useToast()
const router = useRouter()

definePageMeta({
  middleware: 'auth'
})

useHead({
  title: 'Connect Intervals.icu',
  meta: [
    { name: 'description', content: 'Connect your Intervals.icu account to import activities and training data.' }
  ]
})

const athleteId = ref('')
const apiKey = ref('')
const connecting = ref(false)

const goBack = () => {
  router.push('/dashboard')
}

const connect = async () => {
  if (!athleteId.value || !apiKey.value) {
    toast.add({
      title: 'Missing Information',
      description: 'Please enter both your Athlete ID and API key',
      color: 'error'
    })
    return
  }

  connecting.value = true
  try {
    const result = await $fetch('/api/integrations/intervals', {
      method: 'POST',
      body: {
        apiKey: apiKey.value,
        athleteId: athleteId.value || undefined
      }
    })

    // Trigger initial sync immediately
    await $fetch('/api/integrations/sync', {
      method: 'POST',
      body: {
        provider: 'intervals'
      }
    })

    toast.add({
      title: 'Connected!',
      description: `Successfully connected to Intervals.icu as ${result.athlete.name}`,
      color: 'success'
    })

    // Navigate back to dashboard
    await router.push('/dashboard')
  } catch (error: any) {
    toast.add({
      title: 'Connection Failed',
      description: error.data?.message || 'Failed to connect to Intervals.icu',
      color: 'error'
    })
  } finally {
    connecting.value = false
  }
}
</script>