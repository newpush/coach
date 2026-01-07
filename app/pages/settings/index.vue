<script setup lang="ts">
  definePageMeta({
    middleware: 'auth'
  })

  useHead({
    title: 'Settings',
    meta: [
      {
        name: 'description',
        content: 'Manage your connected apps, AI preferences, and coaching settings.'
      }
    ]
  })

  // Redirect to /settings/apps by default
  navigateTo('/settings/apps', { replace: true })
</script>

<template>
  <div />
</template>
