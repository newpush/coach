# TypeScript & Nuxt Best Practices

Strict adherence to these guidelines prevents common type errors and ensures long-term maintainability.

## 1. Type Safety & Strict Null Checks

### Optional Properties

- **Always Check Existence**: Never assume an optional property exists.
- **Use Optional Chaining (`?.`)**: Safely access nested properties.
  ```typescript
  // BAD
  const score = activity.wellness.recoveryScore

  // GOOD
  const score = activity.wellness?.recoveryScore
  ```
- **Provide Fallbacks (`??`)**: Use nullish coalescing for numeric calculations or display.
  ```typescript
  // BAD
  const total = activity.tss + activity.duration

  // GOOD
  const total = (activity.tss ?? 0) + (activity.duration ?? 0)
  ```

### Array Access

- **Check Bounds/Undefined**: When accessing array elements by index, handle the `undefined` case.
  ```typescript
  // BAD
  const val = times[i] - times[startIndex]

  // GOOD
  if (times[i] !== undefined && times[startIndex] !== undefined) {
    const val = times[i] - times[startIndex]
  }
  ```

### Interfaces

- **Synchronize Shared Types**: When using a shared interface (e.g., `CalendarActivity`), ensure it includes ALL properties used in templates or logic.
- **Update Definition First**: If you use a new property in a component, update the interface in `types/` immediately.

---

## 2. Nuxt UI & Design Tokens

### Color Palette

- **Semantic Colors Only**: Do NOT use raw color names like `gray`, `blue`, `red`, `yellow`.
- **Use Theme Aliases**:
  - `neutral` (instead of gray/slate/zinc)
  - `primary` (main brand color)
  - `success` (instead of green)
  - `warning` (instead of orange/amber/yellow)
  - `error` (instead of red)
  - `info` (instead of blue)

### Component Props

- **Size**: Use standard sizes (`xs`, `sm`, `md`, `lg`, `xl`). Avoid deprecated sizes like `2xs` if the library warns against it (though Nuxt UI often supports it, prefer consistency).
- **UI Prop**: When customizing inner classes using `:ui`, ensure the keys exist in the component's config/type definition.
  - Example: `UCard` uses `body`, `header`, `footer`.
  - Example: `UModal` uses `content`, not `width`.

---

## 3. Server-Side Patterns

### Imports

- **Avoid Duplicates**: Check existing imports before adding new ones.
- **Auto-Imports**: Rely on Nuxt's auto-imports for `server/utils` where possible, but explicit imports are often safer for type checking in strict mode.

### Session Management

- **Use Custom Wrapper**: Always use `getServerSession` from `~/server/utils/session` (or `../../utils/session`).
- **Type Casting**: The default session type often lacks `id`. Ensure you handle the custom session type correctly.
  ```typescript
  const session = await getServerSession(event)
  if (!session?.user?.id) throw createError({ ... })
  ```

### External Libraries

- **Type Assertions**: If a library has poor or missing types (e.g., specific buffer formats), use `as any` sparingly and locally to unblock development, but document why.
