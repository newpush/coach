<template>
  <div class="py-24 sm:py-32 text-center overflow-hidden relative">
    <UContainer class="relative z-10">
      <div v-if="pill" class="mb-6 flex justify-center">
        <UBadge variant="subtle" size="md" class="rounded-full px-3 py-1">
          {{ pill }}
        </UBadge>
      </div>

      <h1
        class="text-4xl font-extrabold tracking-tight sm:text-6xl mb-6 bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400"
      >
        {{ title }}
        <span v-if="highlight" class="text-primary block sm:inline">{{ highlight }}</span>
      </h1>

      <p
        class="mx-auto max-w-2xl text-lg sm:text-xl text-gray-600 dark:text-gray-300 mb-10 leading-relaxed"
      >
        {{ description }}
      </p>

      <div class="flex flex-col sm:flex-row justify-center gap-4">
        <slot name="actions" />
      </div>

      <div v-if="$slots.image" class="mt-16 sm:mt-24 relative">
        <div
          class="absolute -inset-4 bg-gradient-to-r from-primary/20 to-purple-500/20 rounded-xl blur-2xl opacity-50 -z-10"
        />
        <slot name="image" />
      </div>
    </UContainer>

    <!-- Background blobs -->
    <div class="absolute top-0 -left-4 w-72 h-72 bg-purple-500/10 rounded-full blur-3xl -z-10" />
    <div class="absolute bottom-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl -z-10" />
  </div>
</template>

<script setup lang="ts">
  defineProps<{
    title: string
    highlight?: string
    description: string
    pill?: string
  }>()
</script>
