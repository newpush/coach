<template>
  <UTooltip text="Background tasks" :popper="{ placement: 'bottom' }">
    <UButton
      color="neutral"
      variant="outline"
      size="sm"
      class="font-bold"
      icon="i-heroicons-cpu-chip"
      @click="toggle"
    >
      <span class="hidden md:inline">Tasks</span>
      <template v-if="activeRunCount > 0" #trailing>
        <UBadge color="primary" size="xs" :ui="{ rounded: 'rounded-full' }" class="-ml-1">
          {{ activeRunCount }}
        </UBadge>
      </template>
    </UButton>
  </UTooltip>
</template>

<script setup lang="ts">
  const { activeRunCount } = useUserRunsState()
  const { toggle } = useTriggerMonitor()
</script>
