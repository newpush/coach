<template>
  <ClientOnly>
    <UButton
      icon="i-heroicons-moon"
      color="neutral"
      variant="ghost"
      aria-label="Theme"
      class="opacity-50 cursor-not-allowed"
    />
    <template #fallback>
      <div class="w-8 h-8" />
    </template>
  </ClientOnly>
</template>

<script setup lang="ts">
  const colorMode = useColorMode()

  const isDark = computed({
    get() {
      return colorMode.value === 'dark'
    },
    set() {
      colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
    }
  })
</script>
