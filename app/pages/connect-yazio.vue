<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Connect Yazio">
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
              <div class="w-12 h-12 bg-white rounded-lg flex items-center justify-center shrink-0 overflow-hidden ring-1 ring-gray-200 dark:ring-gray-700">
                <img src="/images/logos/yazio_square.webp" alt="Yazio Logo" class="w-8 h-8 object-contain" />
              </div>
              <div>
                <h2 class="text-xl font-semibold">Connect Yazio</h2>
                <p class="text-sm text-muted">
                  Track your nutrition and fueling for optimized performance.
                </p>
              </div>
            </div>
          </template>

          <div class="space-y-6">
            <div v-if="error" class="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p class="text-sm text-red-600">{{ error }}</p>
            </div>

            <div v-if="success" class="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p class="text-sm text-green-600">Successfully connected to Yazio!</p>
            </div>

            <div class="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-lg">
              <h3 class="font-medium text-blue-900 dark:text-blue-200 mb-2">What we'll access:</h3>
              <ul class="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                <li>• Daily calorie and macro tracking</li>
                <li>• Meal breakdowns (breakfast, lunch, dinner, snacks)</li>
                <li>• Water intake</li>
                <li>• Nutrition goals vs actual</li>
              </ul>
            </div>

            <form @submit.prevent="handleConnect" class="space-y-4">
              <div>
                <label class="block text-sm font-medium mb-2">
                  Yazio Username <span class="text-red-500">*</span>
                </label>
                <UInput
                  v-model="username"
                  placeholder="Enter your email or username"
                  size="lg"
                  autocomplete="username"
                />
              </div>

              <div>
                <label class="block text-sm font-medium mb-2">
                  Yazio Password <span class="text-red-500">*</span>
                </label>
                <UInput
                  v-model="password"
                  type="password"
                  placeholder="Enter your password"
                  size="lg"
                  autocomplete="current-password"
                />
              </div>
            </form>

            <div class="text-xs text-gray-500 text-center">
              <p>Your credentials are encrypted and stored securely.</p>
              <p>We never share your data with third parties.</p>
            </div>
          </div>

          <template #footer>
            <div class="flex justify-end gap-3">
              <UButton
                color="neutral"
                variant="outline"
                @click="goBack"
              >
                Cancel
              </UButton>
              <UButton
                @click="handleConnect"
                :loading="loading"
                :disabled="!username || !password"
                color="success"
              >
                Connect Yazio
              </UButton>
            </div>
          </template>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
const router = useRouter()

useHead({
  title: 'Connect Yazio',
  meta: [
    { name: 'description', content: 'Connect your Yazio account to track nutrition, calories, and macros.' }
  ]
})

const username = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')
const success = ref(false)

const goBack = () => {
  router.push('/dashboard')
}

const handleConnect = async () => {
  if (!username.value || !password.value) return

  loading.value = true
  error.value = ''
  success.value = false

  try {
    const response = await $fetch('/api/integrations/yazio/connect', {
      method: 'POST',
      body: {
        username: username.value,
        password: password.value
      }
    })

    if (response.success) {
      success.value = true
      setTimeout(() => {
        navigateTo('/dashboard')
      }, 2000)
    }
  } catch (e: any) {
    error.value = e.data?.message || 'Failed to connect to Yazio'
  } finally {
    loading.value = false
  }
}
</script>
