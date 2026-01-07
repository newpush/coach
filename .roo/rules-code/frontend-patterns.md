# Frontend Patterns & Best Practices

## Pinia Stores

We use Pinia for global state management. Always use the **Setup Store** syntax, as it aligns better with the Composition API used throughout the project.

### Structure

- **Definition**: Use `defineStore` with a unique ID and a setup function.
- **State**: Define state using `ref()`.
- **Getters**: Define derived state using `computed()`.
- **Actions**: Define methods as standard functions.
- **Async Actions**: Use `$fetch` for API requests. Handle `loading` and `error` states within the action.
- **Feedback**: Use `useToast()` for user notifications (success/error).

### Example

```typescript
// app/stores/example.ts
import { defineStore } from 'pinia'

export const useExampleStore = defineStore('example', () => {
  // State
  const data = ref<any[] | null>(null)
  const loading = ref(false)

  // Getters
  const isEmpty = computed(() => !data.value || data.value.length === 0)

  // Actions
  async function fetchData() {
    loading.value = true
    try {
      const response = await $fetch('/api/example')
      data.value = response
    } catch (error) {
      console.error('Fetch error:', error)
      useToast().add({ title: 'Error', color: 'error' })
    } finally {
      loading.value = false
    }
  }

  return {
    data,
    loading,
    isEmpty,
    fetchData
  }
})
```

## Composables

Composables are used to encapsulate reusable logic. They should be located in `app/composables/` and follow the "use" naming convention.

### Structure

- **File Name**: `app/composables/useFeatureName.ts`
- **Export**: Export a named `const` or `function` matching the file name.
- **Return**: Return an object containing the reactive state and methods to be exposed.

### Example

```typescript
// app/composables/useFormat.ts
export const useFormat = () => {
  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    })
  }

  return {
    formatDate
  }
}
```

## General Vue/Nuxt Guidelines

- **Script Setup**: Use `<script setup>` in all Vue components.
- **Auto-Imports**: Leverage Nuxt's auto-imports (e.g., `ref`, `computed`, `watch`, `$fetch`) instead of manually importing them from `vue` or `nuxt/app`.
- **Type Safety**: Ensure strict typing for props, emits, and store state.
- **Head Management**: Use `useHead()` for managing page meta tags (title, description, etc.) instead of `definePageMeta`'s layout or middleware options, as `useHead` provides more flexibility and better Nuxt compatibility for SEO.

## Loading States

Consistent loading states improve perceived performance and user experience.

- **Prefer Skeletons**: Use the `USkeleton` component to mimic the layout of the content being loaded (e.g., text blocks, cards, table rows). This reduces layout shift (CLS).
- **Avoid Generic Spinners**: Minimize the use of isolated spinning icons (`animate-spin`), especially for primary content areas.
- **Table Loading**: For tables, replace the `tbody` content with skeleton rows that match the column structure, rather than replacing the entire table.

### Example (Skeleton)

````vue
<!-- Good: Layout remains stable -->
<div v-if="pending" class="space-y-4">
  <div class="flex gap-4">
    <USkeleton class="h-12 w-12 rounded-full" />
    <div class="space-y-2">
      <USkeleton class="h-4 w-[250px]" />
      <USkeleton class="h-4 w-[200px]" />
    </div>
  </div>
</div>

## Nuxt UI Modals & Forms

When building interactive modals with forms, follow these guidelines to ensure consistency, responsiveness, and usability.

### Modals
- **Width Control:** Use the `:ui="{ content: 'sm:max-w-lg' }"` (or relevant width class) prop to control modal width. Do NOT use `width` directly in `ui` as it may cause type errors.
- **Content:** Place main content in the default slot (`#body` or direct child) and actions in `#footer`.

### Forms
- **Full Width Inputs:** Ensure inputs (`USelect`, `UInput`, `UTextarea`) inside modals or constrained containers have `class="w-full"`.
- **Form Fields:** Wrap all inputs in `<UFormField>` to provide consistent labels, help text, and spacing.
- **Icons:** Use `icon` props on inputs to improve visual recognition (e.g., `i-heroicons-calendar` for dates).
- **Responsive Layouts:** Use CSS Grid (e.g., `grid-cols-1 sm:grid-cols-2`) for multi-column forms to ensure they stack correctly on mobile.

### Example

```vue
<template>
  <UModal v-model:open="isOpen" :ui="{ content: 'sm:max-w-lg' }">
    <template #body>
      <div class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField label="Type" name="type">
            <USelect v-model="form.type" :items="types" class="w-full" icon="i-heroicons-bolt" />
          </UFormField>

          <UFormField label="Duration" name="duration">
             <UInput v-model="form.duration" type="number" class="w-full" icon="i-heroicons-clock" />
          </UFormField>
        </div>

        <UFormField label="Notes" name="notes">
          <UTextarea v-model="form.notes" class="w-full" :rows="3" />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="isOpen = false">Cancel</UButton>
        <UButton color="primary" @click="submit">Save</UButton>
      </div>
    </template>
  </UModal>
</template>
````
