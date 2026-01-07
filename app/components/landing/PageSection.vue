<template>
  <section
    class="py-16 sm:py-24 relative"
    :class="alternate ? 'bg-gray-50 dark:bg-gray-900/50' : ''"
  >
    <UContainer>
      <div v-if="title || description" class="text-center max-w-2xl mx-auto mb-16">
        <h2 v-if="title" class="text-3xl font-bold tracking-tight sm:text-4xl mb-4">{{ title }}</h2>
        <p v-if="description" class="text-lg text-gray-600 dark:text-gray-300">{{ description }}</p>
      </div>

      <slot />
    </UContainer>
  </section>
</template>

<script setup lang="ts">
  defineProps<{
    title?: string
    description?: string
    alternate?: boolean
  }>()
</script>
