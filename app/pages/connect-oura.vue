<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Connect Oura">
        <template #leading>
          <UButton icon="i-heroicons-arrow-left" variant="ghost" color="neutral" @click="goBack">
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
              <div
                class="w-12 h-12 bg-white rounded-lg flex items-center justify-center overflow-hidden ring-1 ring-gray-200 dark:ring-gray-700"
              >
                <img src="/images/logos/oura.svg" alt="Oura Logo" class="w-8 h-8 object-contain" />
              </div>
              <div>
                <h2 class="text-xl font-semibold">Connect Oura</h2>
                <p class="text-sm text-muted">
                  Connect your Oura account to sync readiness, sleep, and activity data.
                </p>
              </div>
            </div>
          </template>

          <div class="space-y-6">
            <div class="bg-muted/50 p-4 rounded-lg">
              <h3 class="font-medium mb-2">What you'll get:</h3>
              <ul class="text-sm text-muted space-y-2">
                <li>• Daily readiness scores and contributors</li>
                <li>• Heart rate variability (HRV) and Resting Heart Rate</li>
                <li>• Sleep stages, quality, and duration</li>
                <li>• Activity levels and burned calories</li>
                <li>• Body temperature deviations and respiratory rate</li>
              </ul>
            </div>

            <div class="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
              <div class="flex gap-3">
                <UIcon
                  name="i-heroicons-information-circle"
                  class="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5"
                />
                <div class="text-sm">
                  <p class="font-medium text-blue-900 dark:text-blue-100 mb-1">
                    Secure OAuth Connection
                  </p>
                  <p class="text-blue-700 dark:text-blue-300">
                    You'll be redirected to Oura's secure login page. We never see your password.
                    You can revoke access anytime from your Oura account settings.
                  </p>
                </div>
              </div>
            </div>

            <div class="space-y-3">
              <h3 class="font-medium">Permissions we'll request:</h3>
              <div class="space-y-2 text-sm text-muted">
                <div class="flex items-center gap-2">
                  <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-green-600" />
                  <span>Read daily summaries (Sleep, Activity, Readiness)</span>
                </div>
                <div class="flex items-center gap-2">
                  <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-green-600" />
                  <span>Read heart rate and HRV data</span>
                </div>
                <div class="flex items-center gap-2">
                  <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-green-600" />
                  <span>Read workout and session information</span>
                </div>
                <div class="flex items-center gap-2">
                  <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-green-600" />
                  <span>Read personal information (Email, Profile)</span>
                </div>
              </div>
            </div>
          </div>

          <template #footer>
            <div class="flex flex-col gap-4">
              <div
                class="flex justify-center opacity-50 grayscale hover:grayscale-0 transition-all"
              >
                <img
                  src="/images/logos/oura_wordmark_black.svg"
                  alt="Oura Wordmark"
                  class="h-6 dark:hidden"
                />
                <img
                  src="/images/logos/oura_wordmark_white.svg"
                  alt="Oura Wordmark"
                  class="h-6 hidden dark:block"
                />
              </div>
              <div class="flex justify-end gap-3">
                <UButton to="/dashboard" color="neutral" variant="outline"> Cancel </UButton>
                <UButton :loading="connecting" color="primary" @click="connect">
                  Connect Oura
                </UButton>
              </div>
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
    title: 'Connect Oura',
    meta: [
      {
        name: 'description',
        content: 'Connect your Oura account to sync readiness, sleep, and activity data.'
      }
    ]
  })

  const connecting = ref(false)

  const goBack = () => {
    router.push('/settings/apps')
  }

  const connect = async () => {
    connecting.value = true
    try {
      // Redirect to the authorize endpoint which will redirect to Oura OAuth
      window.location.href = '/api/integrations/oura/authorize'
    } catch (error: any) {
      toast.add({
        title: 'Connection Failed',
        description: error.message || 'Failed to initiate Oura connection',
        color: 'error'
      })
      connecting.value = false
    }
  }
</script>
