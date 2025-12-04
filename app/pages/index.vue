<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
    <div class="text-center">
      <h1 class="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">Coach Watts</h1>
      <p class="text-gray-600 dark:text-gray-300 mb-8">Your AI-Powered Cycling Coach</p>
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 mx-auto animate-spin text-primary" />
    </div>
  </div>
</template>

<script setup lang="ts">
const { status } = useAuth()

definePageMeta({
  layout: 'home',
  auth: false // Explicitly disable auth middleware for this page
})

watchEffect(() => {
  if (status.value === 'authenticated') {
    navigateTo('/dashboard')
  } else if (status.value === 'unauthenticated') {
    navigateTo('/home') // Redirect to /home for unauthenticated users
  }
})
</script>