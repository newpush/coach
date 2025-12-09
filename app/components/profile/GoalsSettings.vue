<template>
  <div class="space-y-8 animate-fade-in">
      <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold flex items-center gap-2">
        <UIcon name="i-heroicons-trophy" class="w-5 h-5 text-primary" />
        Goals
      </h2>
      <UBadge color="primary" variant="subtle">Coming Soon</UBadge>
    </div>
    <p class="text-sm text-muted">
      AI-powered goal setting and fine-tuning will be available in a future update.
    </p>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.2s ease-in-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>