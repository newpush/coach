<template>
  <div class="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md mx-auto">
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-gray-900">Connect Yazio</h1>
        <p class="mt-2 text-gray-600">
          Track your nutrition and fueling for optimized performance
        </p>
      </div>

      <div v-if="error" class="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
        <p class="text-sm text-red-600">{{ error }}</p>
      </div>

      <div v-if="success" class="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
        <p class="text-sm text-green-600">Successfully connected to Yazio!</p>
      </div>

      <div class="bg-white shadow rounded-lg p-6">
        <form @submit.prevent="handleConnect" class="space-y-4">
          <div>
            <label for="username" class="block text-sm font-medium text-gray-700">
              Yazio Username
            </label>
            <input
              id="username"
              v-model="username"
              type="text"
              required
              autocomplete="username"
              class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label for="password" class="block text-sm font-medium text-gray-700">
              Yazio Password
            </label>
            <input
              id="password"
              v-model="password"
              type="password"
              required
              autocomplete="current-password"
              class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 class="text-sm font-medium text-blue-900 mb-2">What we'll access:</h3>
            <ul class="text-sm text-blue-700 space-y-1">
              <li>• Daily calorie and macro tracking</li>
              <li>• Meal breakdowns (breakfast, lunch, dinner, snacks)</li>
              <li>• Water intake</li>
              <li>• Nutrition goals vs actual</li>
            </ul>
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ loading ? 'Connecting...' : 'Connect Yazio' }}
          </button>
        </form>

        <div class="mt-4 text-center">
          <NuxtLink
            to="/dashboard"
            class="text-sm text-gray-600 hover:text-gray-900"
          >
            ← Back to Dashboard
          </NuxtLink>
        </div>
      </div>

      <div class="mt-6 text-xs text-gray-500 text-center">
        <p>Your credentials are encrypted and stored securely.</p>
        <p>We never share your data with third parties.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
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

const handleConnect = async () => {
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