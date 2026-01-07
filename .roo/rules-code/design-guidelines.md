# Frontend Design Guidelines

## 1. Design Tokens & Theme

> **Note:** We use Nuxt UI. Consult the [Nuxt UI documentation](https://ui.nuxt.com) when unsure about component usage or recent updates.

> **Important:** This application is a **responsive web app**. All designs must be fully responsive and work seamlessly on both desktop and mobile devices.

### Colors

We use a centralized semantic color system. **Do not use hardcoded hex values.**

- **Primary:** `primary` (Green) - Used for primary actions, success states, and key brand elements.
- **Neutral:** `neutral` (Zinc) - Used for text, backgrounds, and borders.
- **Semantic States:**
  - `success`: For positive outcomes (e.g., high scores).
  - `warning`: For caution (e.g., medium scores).
  - `error`: For negative outcomes (e.g., low scores).
  - `info`: For informational messages.

**Metric Specific Colors:**

- **Performance/FTP:** `amber`
- **Wellness/Recovery:** `indigo` or `emerald`
- **Nutrition:** `green` or `purple`
- **Effort/Intensity:** `rose` or `red`

**Color Coded Cards:**
When highlighting specific metric categories, use soft background washes:

- Light: `bg-[color]-50`
- Dark: `bg-[color]-900/20`
- Ring: `ring-1 ring-inset ring-[color]-500/10`

### Typography

- **Font Family:** Use `font-sans` (Public Sans).
- **Headers:**
  - Page Title: `text-3xl font-bold text-gray-900 dark:text-white tracking-tight`
  - Section Title: `text-xl font-bold text-gray-900 dark:text-white uppercase tracking-tight`
  - Card Title: `text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest`
- **Body:**
  - Default: `text-sm text-gray-700 dark:text-gray-300`
  - Muted: `text-xs text-gray-500 dark:text-gray-400`
  - Metric Value: `font-bold text-gray-900 dark:text-white`

### Spacing

- **Page Container:** `p-6 space-y-8` (or `space-y-10` for large sections).
- **Card Content:** Standardized via `app.config.ts` to `p-6`.
- **Grid Gap:** `gap-6` standard.

## 2. Components

### Cards (`UCard`)

Standardized in `app.config.ts`:

- **Rounded:** `rounded-xl`
- **Shadow:** `shadow-sm`
- **Border:** `ring-1 ring-gray-200 dark:ring-gray-800`

### Buttons (`UButton`)

**Standard Button Pattern for Navbar Actions:**
All action buttons in `UDashboardNavbar` headers must follow this consistent pattern:

```vue
<UButton
  @click="action"
  :loading="loading"
  color="primary|neutral"
  variant="solid|outline|ghost"
  icon="i-heroicons-..."
  size="sm"
  class="font-bold"
>
  Label
</UButton>
```

**Button Variants:**

- **Primary Actions:** `color="primary" variant="solid"` - Use for main actions like "Insights", "Custom Report", "Add Goal"
- **Secondary Actions:** `color="neutral" variant="outline"` - Use for supporting actions like "Analyze", "Sync Data", "Review"
- **Ghost/Tertiary:** `color="neutral" variant="ghost"` - Use for minimal actions or settings icons

**Mandatory Attributes:**

- **Size:** Always use `size="sm"` for navbar buttons to maintain consistency
- **Font Weight:** Always include `class="font-bold"` for proper typography hierarchy
- **Icons:** Always include an icon via `icon="i-heroicons-..."` prop for visual clarity
- **Loading States:** Use `:loading` prop instead of conditional text (e.g., "Analyzing...")

**Spacing:**

- Use `gap-3` between button groups (not `gap-2`)
- Use `<USeparator orientation="vertical" class="h-6" />` to visually separate button groups when needed

**Label Guidelines:**

- Keep labels concise (1-2 words max for navbar buttons)
- "Generate Insights" → "Insights"
- "Analyze All" → "Analyze"
- "AI Suggest Goals" → "AI Suggest"

**Examples:**

Primary action button:

```vue
<UButton
  @click="generateInsights"
  :loading="generating"
  color="primary"
  variant="solid"
  icon="i-heroicons-sparkles"
  size="sm"
  class="font-bold"
>
  Insights
</UButton>
```

Secondary action button:

```vue
<UButton
  @click="analyzeData"
  :loading="analyzing"
  color="neutral"
  variant="outline"
  icon="i-heroicons-cpu-chip"
  size="sm"
  class="font-bold"
>
  Analyze
</UButton>
```

**DO NOT:**

- Use raw HTML `<button>` elements - always use `UButton`
- Use conditional text like `{{ loading ? 'Analyzing...' : 'Analyze' }}` - use `:loading` prop
- Mix sizing (don't use buttons without explicit `size="sm"`)
- Omit the `class="font-bold"` styling
- Use buttons without icons in navbar actions

### Charts

- Use `useTheme()` composable.
- **Backgrounds:** Charts should sit in cards with `bg-gray-50/50` or `bg-gray-800/40` backgrounds for subtle contrast.
- **Gridlines:** Use `theme.colors.value.chartGrid`.
- **Text:** Use `theme.colors.value.chartText`.

## 3. Best Practices

1.  **Semantic Naming:** Props should describe intent (`variant="success"`), not appearance (`color="green"`).
2.  **Dark Mode:** Always test components in dark mode. Use `dark:` modifiers for all color classes.
3.  **Visual Hierarchy:** Use font weights and uppercase tracking to differentiate labels from values.
4.  **Transitions:** Use `transition-all duration-200` for interactive elements.
5.  **Composition:** Prefer creating small, reusable components (e.g., `StatusBadge`) over repeating markup.
6.  **Tabular Data:** Use `tabular-nums` class for any numeric data in tables or lists to ensure proper alignment.
7.  **Skeletal States:** Always implement `animate-pulse` skeletons for loading states using the same layout as the final content.

## 4. Layout Patterns

### Dashboard Style

- Use `UDashboardPanel`, `UDashboardNavbar`, and `UDashboardSidebar`.
- Body content should be wrapped in `p-6 space-y-8`.
- Section headers: `h2` with `text-xl font-bold uppercase tracking-tight`.

### Form Layouts

- Wrap inputs in `UFormField`.
- Group related fields in `UCard` with a subtle background (`bg-gray-50/30`).
- Use `gap-6` for grid layouts within forms.

## 5. Standard Data Displays

### Badges (using inline styles, not UBadge)

For badges in tables and data displays, use plain `<span>` elements with utility classes instead of `UBadge` components for better consistency and simplicity:

**Score Badges:**

```vue
<span v-if="score" :class="getScoreBadgeClass(score)">
  {{ score }}/10
</span>
```

```typescript
function getScoreBadgeClass(score: number) {
  const baseClass = 'px-2 py-1 rounded text-xs font-semibold'
  if (score >= 8)
    return `${baseClass} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`
  if (score >= 6)
    return `${baseClass} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`
  if (score >= 4)
    return `${baseClass} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`
  return `${baseClass} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`
}
```

**Status Badges (for AI Analysis, etc.):**

```vue
<span :class="getAnalysisStatusBadgeClass(status)">
  {{ getAnalysisStatusLabel(status) }}
</span>
```

```typescript
function getAnalysisStatusBadgeClass(status: string | null | undefined) {
  const baseClass = 'px-2 py-1 rounded text-xs font-medium'
  if (status === 'COMPLETED')
    return `${baseClass} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`
  if (status === 'PROCESSING')
    return `${baseClass} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`
  if (status === 'PENDING')
    return `${baseClass} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`
  if (status === 'FAILED')
    return `${baseClass} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`
  return `${baseClass} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300`
}
```

**Metadata Badges (Source, Type, etc.):**

```typescript
function getSourceBadgeClass(source: string) {
  const baseClass = 'px-2 py-1 rounded text-xs font-medium'
  if (source === 'intervals')
    return `${baseClass} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`
  if (source === 'whoop')
    return `${baseClass} bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200`
  if (source === 'strava')
    return `${baseClass} bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200`
  return `${baseClass} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300`
}
```

### Tables

Use plain HTML tables wrapped in a card-like div structure. **Do NOT use UCard** for data tables.

**Standard Table Structure:**

```vue
<div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
  <!-- Optional Header Section -->
  <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
    <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Table Title</h2>
    <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">Description</p>
  </div>

  <!-- Loading State -->
  <div v-if="loading" class="p-8 text-center text-gray-600 dark:text-gray-400">
    Loading...
  </div>

  <!-- Empty State -->
  <div v-else-if="items.length === 0" class="p-8 text-center text-gray-600 dark:text-gray-400">
    No data found. Connect integrations to get started.
  </div>

  <!-- Table Content -->
  <div v-else class="overflow-x-auto">
    <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
      <thead class="bg-gray-50 dark:bg-gray-900">
        <tr>
          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Column Name
          </th>
        </tr>
      </thead>
      <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
        <tr
          v-for="item in items"
          :key="item.id"
          @click="navigateTo(item.id)"
          class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
            {{ item.value }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Pagination -->
  <div v-if="totalPages > 1" class="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
    <div class="flex items-center justify-between">
      <div class="text-sm text-gray-600 dark:text-gray-400">
        Showing {{ start }} to {{ end }} of {{ total }} entries
      </div>
      <div class="flex gap-2">
        <button
          @click="previousPage"
          :disabled="currentPage === 1"
          class="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          Previous
        </button>
        <div class="flex gap-1">
          <button
            v-for="page in visiblePages"
            :key="page"
            @click="goToPage(page)"
            :class="[
              'px-3 py-1 rounded text-sm',
              page === currentPage
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
            ]"
          >
            {{ page }}
          </button>
        </div>
        <button
          @click="nextPage"
          :disabled="currentPage === totalPages"
          class="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          Next
        </button>
      </div>
    </div>
  </div>
</div>
```

**Table Styling Guidelines:**

- **Container:** Use `bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden` for the outer wrapper
- **Header Row:** `bg-gray-50 dark:bg-gray-900` with `text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider`
- **Body Rows:** `bg-white dark:bg-gray-800` with `divide-y divide-gray-200 dark:divide-gray-700`
- **Row Hover:** `hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors`
- **Cell Text:** Default `text-sm text-gray-600 dark:text-gray-400`, Primary identifiers `text-gray-900 dark:text-white`
- **Padding:** Consistent `px-6 py-3` for headers, `px-6 py-4` for cells

**DO NOT:**

- Use `UCard` wrapper for data tables
- Use `UBadge` components in table cells - use plain `<span>` with utility classes
- Use complex nested structures or custom UI components for simple tabular data

## 6. Mobile & Responsive Design

### Touch Targets

- Ensure all interactive elements have a minimum touch target size of 44x44px.
- Add appropriate padding to small buttons or links to increase the clickable area.

### Layout Adaptability

- Use flexible grid systems (e.g., `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`).
- Stack columns vertically on mobile devices (`flex-col`).
- Hide non-essential columns in tables on smaller screens or use a card-based view.

### Navigation

- Use a bottom navigation bar or a hamburger menu for mobile navigation.
- Ensure important actions are easily accessible with the thumb (bottom of the screen).

### Font Sizes

- Avoid font sizes smaller than 16px for input fields to prevent auto-zooming on iOS.
- Adjust heading sizes for mobile to prevent excessive wrapping.

## 7. Accessibility (a11y)

### Contrast

- Ensure text color has a contrast ratio of at least 4.5:1 against the background.
- Use tools to verify contrast ratios for custom colors.

### Semantic HTML

- Use appropriate HTML tags (e.g., `<button>`, `<a>`, `<nav>`, `<header>`, `<main>`) to ensure proper screen reader support.
- Use `aria-label` or `aria-labelledby` when visual labels are missing or insufficient.

### Keyboard Navigation

- Ensure all interactive elements are focusable via keyboard.
- Show a visible focus ring for focused elements (`focus:ring-2`).

## 8. UX Best Practices

### Feedback

- Provide immediate visual feedback for user actions (e.g., loading spinners, success toasts, error messages).
- Use `UToast` for ephemeral notifications.

### Error Handling

- Display clear and concise error messages near the affected input fields.
- Avoid generic error messages like "Something went wrong."

### Empty States

- Design helpful empty states for lists or dashboards with no data.
- Include a call to action (CTA) to guide the user on how to populate the data.

### Loading States

- Use skeletons (`USkeleton` or custom `animate-pulse`) instead of blank screens while data is loading.
- Avoid full-page loaders whenever possible; load content progressively.
