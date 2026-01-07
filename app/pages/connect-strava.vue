<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Connect Strava">
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
                <img
                  src="/images/logos/strava.svg"
                  alt="Strava Logo"
                  class="w-8 h-8 object-contain"
                />
              </div>
              <div>
                <h2 class="text-xl font-semibold">Connect Strava</h2>
                <p class="text-sm text-muted">
                  Import your activities and training data from Strava.
                </p>
              </div>
            </div>
          </template>

          <div class="space-y-6">
            <UAlert
              v-if="isStravaDisabled"
              color="warning"
              variant="soft"
              icon="i-heroicons-exclamation-triangle"
              title="Temporarily Unavailable"
              description="Strava integration is temporarily unavailable on coachwatts.com. We are working to restore it as soon as possible."
              class="mb-4"
            />
            <div class="bg-muted/50 p-4 rounded-lg">
              <h3 class="font-medium mb-2">What will be imported?</h3>
              <ul class="text-sm text-muted space-y-2">
                <li>✓ Your activities (rides, runs, swims, etc.)</li>
                <li>✓ Activity metrics (distance, duration, elevation)</li>
                <li>✓ Heart rate and power data</li>
                <li>✓ Performance metrics and training load</li>
              </ul>
            </div>

            <div class="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-lg">
              <div class="flex items-start gap-3">
                <UIcon
                  name="i-heroicons-information-circle"
                  class="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5"
                />
                <div class="text-sm text-blue-900 dark:text-blue-200">
                  <p class="font-medium mb-1">OAuth Authorization</p>
                  <p>
                    You'll be redirected to Strava to authorize access to your activities. We only
                    request read permissions.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <template #footer>
            <div class="flex justify-end gap-3">
              <UButton to="/dashboard" color="neutral" variant="outline"> Cancel </UButton>
              <UTooltip
                :text="
                  isStravaDisabled
                    ? 'Strava integration is temporarily unavailable on coachwatts.com'
                    : ''
                "
                :popper="{ placement: 'top' }"
              >
                <UButton
                  :loading="connecting"
                  icon="i-heroicons-bolt"
                  :disabled="isStravaDisabled"
                  @click="connect"
                >
                  Connect with Strava
                </UButton>
              </UTooltip>
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

  const isStravaDisabled = computed(() => {
    if (import.meta.server) return false
    return window.location.hostname === 'coachwatts.com'
  })

  definePageMeta({
    middleware: 'auth'
  })

  useHead({
    title: 'Connect Strava',
    meta: [
      {
        name: 'description',
        content: 'Connect your Strava account to import activities and sync training data.'
      }
    ]
  })

  const connecting = ref(false)

  const goBack = () => {
    router.push('/dashboard')
  }

  const connect = async () => {
    connecting.value = true
    try {
      window.location.href = '/api/integrations/strava/authorize'
    } catch (error: any) {
      toast.add({
        title: 'Connection Failed',
        description: error.message || 'Failed to connect to Strava',
        color: 'error'
      })
      connecting.value = false
    }
  }
</script>
