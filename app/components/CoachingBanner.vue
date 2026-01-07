<template>
  <div
    v-if="coachingStore.isCoachingMode"
    class="bg-primary-600 text-white py-2 px-4 flex items-center justify-between sticky top-0 z-[60]"
  >
    <div class="flex items-center gap-2 text-sm font-medium">
      <UIcon name="i-heroicons-eye" class="w-5 h-5" />
      <span
        >Viewing as <strong>{{ coachingStore.actingAsUserName }}</strong></span
      >
    </div>
    <div class="flex items-center gap-4">
      <UButton
        color="white"
        variant="solid"
        size="xs"
        label="Exit Coaching Mode"
        @click="coachingStore.stopActingAs"
      />
    </div>
  </div>
</template>

<script setup>
  const coachingStore = useCoachingStore()
</script>
