<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

// Redirect to /settings/apps by default
navigateTo('/settings/apps', { replace: true })
</script>

<template>
  <div></div>
</template>