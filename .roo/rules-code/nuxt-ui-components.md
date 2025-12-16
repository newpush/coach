# Nuxt UI Component Best Practices

## UModal

When using the `UModal` component (v3/v4), always follow these guidelines for proper state management and structure:

### State Management
- Use `v-model:open="isOpen"` to control the modal's visibility.
- Do NOT use `v-model="isOpen"` as it may not behave consistently across versions.

### Structure
- Use the `title` and `description` props for the modal header content.
- Use the `#body` slot for the main content.
- Use the `#footer` slot for action buttons.

### Example

```vue
<template>
  <UModal
    v-model:open="isOpen"
    title="Modal Title"
    description="Modal description goes here."
  >
    <template #body>
      <p>Main content goes here.</p>
    </template>

    <template #footer>
      <UButton label="Cancel" @click="isOpen = false" color="neutral" variant="ghost" />
      <UButton label="Confirm" @click="confirm" color="primary" />
    </template>
  </UModal>
</template>

<script setup>
const isOpen = ref(false)
</script>