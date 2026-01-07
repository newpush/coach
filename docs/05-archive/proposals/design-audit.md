# Frontend Design Audit

## 1. Color System Inconsistencies

### Current State

- **Hex Values:** Hardcoded hex values are scattered throughout the codebase (e.g., `#00DC82`, `#EFFDF5`).
- **RGB Strings:** Charts use hardcoded RGB strings (e.g., `rgb(59, 130, 246)`), making them disconnected from the Tailwind theme.
- **Tailwind Classes:** Inconsistent use of semantic vs. literal color names (e.g., `text-primary` vs `text-green-600`).

### Issues

- Changing the primary theme requires updates in multiple files.
- Dark mode support is brittle in charts due to manual color management.
- Visual disconnect between "success" states in different components (some green, some teal).

## 2. Typography

### Current State

- **Font Families:** `font-sans` and explicit `Public Sans` references are mixed.
- **Sizing:** `text-sm` and `text-xs` are used interchangeably for similar hierarchical elements (e.g., metadata, labels).
- **Weights:** Inconsistent font weights for headers and emphasis (`font-semibold` vs `font-bold`).

### Issues

- Lack of visual hierarchy consistency.
- Readability variations across pages.

## 3. Component Styling

### ScoreCard.vue

- Uses specific color logic locally defined (`getScoreBadgeColor` vs internal computed properties).
- Hardcoded progress bar colors.

### GoalCard.vue

- Different padding and border radius compared to `ScoreCard`.
- Custom badge colors that might not align with global status colors.

### Charts (TrendChart, RadarChart)

- Manual canvas configuration for colors.
- Tooltip styling is duplicated and slightly different in each chart component.

## 4. Layout & Spacing

### Dashboard vs. Performance Page

- `UDashboardPanel` usage is consistent, but inner padding varies (`p-4` vs `p-6`).
- Section headers have different bottom margins.

## Recommendations

1.  **Centralize Tokens:** Create a master design token configuration in `app.config.ts` and `tailwind.config.ts`.
2.  **Chart Theme Composable:** Create `useChartTheme` to provide reactive, theme-aware colors to all chart components.
3.  **Component Refactor:** rewriting core components to accept semantic props (e.g., `variant="success"`) rather than raw colors.
