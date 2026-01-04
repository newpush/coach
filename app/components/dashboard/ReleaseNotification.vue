<script setup lang="ts">
import { h } from 'vue'

const { hasNewRelease, currentReleaseContent, isReleaseModalOpen, checkForNewRelease, markAsSeen, openReleaseModal } = useReleaseNotes()

// Custom components to override default Prose components and force small text
const components = {
  h1: (props: any, { slots }: any) => h('h1', { ...props, class: 'text-lg font-bold my-2' }, slots.default?.()),
  h2: (props: any, { slots }: any) => h('h2', { ...props, class: 'text-base font-bold my-2' }, slots.default?.()),
  h3: (props: any, { slots }: any) => h('h3', { ...props, class: 'text-sm font-bold my-1' }, slots.default?.()),
  p: (props: any, { slots }: any) => h('p', { ...props, class: 'text-sm my-2 leading-relaxed' }, slots.default?.()),
  li: (props: any, { slots }: any) => h('li', { ...props, class: 'text-sm my-0.5' }, slots.default?.()),
  ul: (props: any, { slots }: any) => h('ul', { ...props, class: 'list-disc list-inside my-2' }, slots.default?.()),
  ol: (props: any, { slots }: any) => h('ol', { ...props, class: 'list-decimal list-inside my-2' }, slots.default?.())
}

onMounted(() => {
  checkForNewRelease()
})
</script>

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
    <UModal v-model:open="isReleaseModalOpen" :ui="{ content: 'sm:max-w-2xl' }">
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
        <!-- We use a div wrapper but rely on explicit component overrides for styling -->
        <div class="max-w-none text-gray-700 dark:text-gray-300">
          <MDC :value="currentReleaseContent || ''" :components="components" />
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

<style scoped>
/* Scoped styles can still be useful for other elements, but MDC components are now handled by render functions */
</style>
