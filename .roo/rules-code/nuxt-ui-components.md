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

````vue
<template>
  <UModal v-model:open="isOpen" title="Modal Title" description="Modal description goes here.">
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

## UDashboardPanel When using `UDashboardPanel` within the dashboard layout, ensure correct slot
usage for layout consistency. ### Structure - Use the `#header` slot for the navbar or top controls
(e.g., `UDashboardNavbar`). - Use the `#body` slot for the main content area. - Do NOT use the
`#default` slot for the main content, as it may break the layout structure (e.g. scrolling
behavior). ### Example ```vue
<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Page Title" />
    </template>

    <template #body>
      <!-- Main content goes here -->
      <div>Content</div>
    </template>
  </UDashboardPanel>
</template>
````
