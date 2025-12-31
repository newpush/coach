<template>
  <ClientOnly>
    <!-- Gift Icon Notification -->
    <div v-if="hasNewRelease" class="relative">
      <UButton
        @click="openReleaseModal"
        icon="i-heroicons-gift"
        color="neutral"
        variant="outline"
        size="sm"
        aria-label="New Release"
        class="font-bold"
      >
        <span class="hidden sm:inline">What's New</span>
      </UButton>
      <!-- Notification Badge -->
      <span class="absolute top-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-gray-900 bg-red-500 transform translate-x-1/4 -translate-y-1/4"></span>
    </div>

    <!-- Release Modal -->
    <UModal v-model:open="isReleaseModalOpen">
      <template #header>
        <div class="flex items-center justify-between">
            <h3 class="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <UIcon name="i-heroicons-sparkles" class="w-6 h-6 text-primary-500" />
                What's New
            </h3>
            <UButton color="neutral" variant="ghost" icon="i-heroicons-x-mark-20-solid" class="-my-1" @click="isReleaseModalOpen = false" />
        </div>
      </template>

      <template #body>
        <div class="prose prose-sm dark:prose-invert max-w-none prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-p:text-sm prose-headings:my-2 prose-p:my-2">
          <MDC :value="currentReleaseContent || ''" />
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton label="Close" color="neutral" variant="ghost" @click="isReleaseModalOpen = false" />
          <UButton label="Got it" color="primary" @click="markAsSeen" />
        </div>
      </template>
    </UModal>
  </ClientOnly>
</template>

<script setup lang="ts">
const { hasNewRelease, currentReleaseContent, isReleaseModalOpen, checkForNewRelease, markAsSeen, openReleaseModal } = useReleaseNotes()

onMounted(() => {
  checkForNewRelease()
})
</script>
