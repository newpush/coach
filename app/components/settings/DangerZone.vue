<template>
  <UCard>
    <template #header>
      <h2 class="text-xl font-semibold text-error">Danger Zone</h2>
    </template>
    
    <div class="space-y-4">
      <p class="text-sm text-muted">
        Once you delete your account, there is no going back. Please be certain.
      </p>
      <UButton color="error" variant="outline">
        Delete Account
      </UButton>
    </div>
  </UCard>
</template>

<script setup lang="ts">
// This component is intentionally simple for now
// Delete functionality can be implemented when needed
</script>
