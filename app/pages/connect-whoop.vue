<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Connect WHOOP">
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
                  src="/images/logos/whoop_square.svg"
                  alt="WHOOP Logo"
                  class="w-8 h-8 object-contain"
                />
              </div>
              <div>
                <h2 class="text-xl font-semibold">Connect WHOOP</h2>
                <p class="text-sm text-muted">
                  Connect your WHOOP account to sync recovery and sleep data.
                </p>
              </div>
            </div>
          </template>

          <div class="space-y-6">
            <div class="bg-muted/50 p-4 rounded-lg">
              <h3 class="font-medium mb-2">What you'll get:</h3>
              <ul class="text-sm text-muted space-y-2">
                <li>• Daily recovery scores and readiness metrics</li>
                <li>• Heart rate variability (HRV) data</li>
                <li>• Sleep quality and duration tracking</li>
                <li>• Resting heart rate trends</li>
                <li>• SpO2 measurements</li>
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
                    You'll be redirected to WHOOP's secure login page. We never see your password.
                    You can revoke access anytime from your WHOOP account settings.
                  </p>
                </div>
              </div>
            </div>

            <div class="space-y-3">
              <h3 class="font-medium">Permissions we'll request:</h3>
              <div class="space-y-2 text-sm text-muted">
                <div class="flex items-center gap-2">
                  <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-green-600" />
                  <span>Read recovery data</span>
                </div>
                <div class="flex items-center gap-2">
                  <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-green-600" />
                  <span>Read sleep data</span>
                </div>
                <div class="flex items-center gap-2">
                  <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-green-600" />
                  <span>Read workout data</span>
                </div>
                <div class="flex items-center gap-2">
                  <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-green-600" />
                  <span>Read profile information</span>
                </div>
                <div class="flex items-center gap-2">
                  <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-green-600" />
                  <span>Read body measurements</span>
                </div>
              </div>
            </div>
          </div>

          <template #footer>
            <div class="flex justify-end gap-3">
              <UButton to="/dashboard" color="neutral" variant="outline"> Cancel </UButton>
              <UButton :loading="connecting" color="primary" @click="connect">
                Connect WHOOP
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
    title: 'Connect WHOOP',
    meta: [
      {
        name: 'description',
        content: 'Connect your WHOOP account to sync recovery, sleep, and strain data.'
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
      // Redirect to the authorize endpoint which will redirect to WHOOP OAuth
      window.location.href = '/api/integrations/whoop/authorize'
    } catch (error: any) {
      toast.add({
        title: 'Connection Failed',
        description: error.message || 'Failed to initiate WHOOP connection',
        color: 'error'
      })
      connecting.value = false
    }
  }
</script>
