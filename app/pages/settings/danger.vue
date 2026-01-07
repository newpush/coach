<template>
  <SettingsDangerZone />
</template>

<script setup lang="ts">
  definePageMeta({
    middleware: 'auth'
  })

  useHead({
    title: 'Danger Zone',
    meta: [{ name: 'description', content: 'Manage sensitive account settings and data deletion.' }]
  })
</script>
