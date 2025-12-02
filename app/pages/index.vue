<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50">
    <div class="text-center">
      <h1 class="text-4xl font-bold text-gray-900 mb-4">Coach Watts</h1>
      <p class="text-gray-600 mb-8">Your AI-Powered Cycling Coach</p>
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 mx-auto animate-spin text-primary" />
    </div>
  </div>
</template>

<script setup lang="ts">
const { status } = useAuth()

watchEffect(() => {
  if (status.value === 'authenticated') {
    navigateTo('/dashboard')
  } else if (status.value === 'unauthenticated') {
    navigateTo('/login')
  }
})
</script>