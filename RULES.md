# Coach Watts Development Rules & Guidelines

This file aggregates all critical development rules and guidelines for the Coach Watts project. All AI agents and developers must strictly adhere to these rules to ensure code quality, consistency, and system stability.

## 1. Database Management

### Database Safety

- **NEVER** reset the development database (e.g., `pnpm prisma migrate reset`, `pnpm prisma db push --force-reset`).
- The development database contains critical test data and state.

### Schema Changes & Migrations

1.  **Scaffold Migrations**: Always use the CLI. Do NOT manually create migration files.
2.  **Workflow**:
    - Edit `prisma/schema.prisma`.
    - Generate SQL: `pnpm prisma migrate dev --name <name> --create-only`.
    - **Review/Edit** the generated SQL if needed.
    - Apply: `pnpm prisma migrate dev`.
3.  **Consistency**: Ensure migration history matches the schema.

### Verification

- **Verify Migrations**: Run `pnpm prisma migrate status` before deployment.
- **Check Drift**: Use `pnpm prisma migrate diff` to check for schema drift.
- **No `db push`**: Do not rely on `prisma db push` if you need reproducible migrations.

---

## 2. Deployment Guidelines

### Environment Verification

- Ensure `NUXT_AUTH_ORIGIN`, `NUXT_PUBLIC_SITE_URL`, `DATABASE_URL`, and `NUXT_AUTH_SECRET` are set correctly.
- Verify OAuth callback URLs for Google, Strava, etc.

### Database & Migrations

- **Never** deploy pending schema changes.
- **Use `migrate deploy`**: In production, use `prisma migrate deploy`, NOT `migrate dev` or `db push`.

### Build & Start

- Clean install: `pnpm install --frozen-lockfile`.
- Generate client: `pnpm prisma generate`.
- Build: `pnpm build`.
- Start: `node .output/server/index.mjs`.

---

## 3. Frontend Design Guidelines

### Design Tokens (Nuxt UI)

- **Colors**: Use semantic colors (`primary`, `neutral`, `success`, `error`). Do NOT use hardcoded hex values.
- **Typography**: Use `font-sans`. Follow header and body text standards.
- **Spacing**: Use standard padding (`p-6`) and gaps (`gap-6`).

### Components

- **Buttons**: Use `UButton`. Follow standard patterns for navbar actions (`size="sm"`, `class="font-bold"`, with icon).
- **Cards**: Use `UCard` for content containers.
- **Tables**: Use plain HTML tables wrapped in a card-like div. **Do NOT use UCard for tables.**
- **Tooltips**: Maintain consistent design, content, and behavior. Use `UPopover` (mode="hover") or `UTooltip` for explanations. Ensure visibility and verify content on hover.

### Layouts

- **Dashboard**: Use `UDashboardPanel`, `UDashboardNavbar`, `UDashboardSidebar`.
- **Forms**: Wrap inputs in `UFormField`.
- **Modals**: Use `:ui="{ content: 'sm:max-w-lg' }"` for width control. Ensure inputs are full width (`w-full`).

### Responsive Design

- Ensure all designs work on mobile and desktop.
- Touch targets must be at least 44x44px.

---

## 4. Frontend Patterns

### Pinia Stores

- Use **Setup Store** syntax (`defineStore` with a setup function).
- Use `ref()` for state and `computed()` for getters.
- Use `$fetch` for API requests.

### Composables

- Place in `app/composables/`.
- Use "use" naming convention (e.g., `useFormat`).

### General Vue/Nuxt

- Use `<script setup>`.
- Use Nuxt auto-imports.
- Use `useHead()` for meta tags.

---

## 5. Nuxt Server Patterns

### Auto-Imports

- **Do NOT** manually import files from `server/utils` using relative paths. They are auto-imported.

### Prisma Client

- Use the singleton instance from `server/utils/db`.
- Regenerate the client (`npx prisma generate`) after schema changes.

---

## 6. Repository Pattern

### Core Rules

- **Centralized Access**: Use repositories in `server/utils/repositories/` for complex models (Workout, Nutrition).
- **No Direct Prisma**: Avoid direct `prisma.model` calls in API handlers for business logic.
- **Encapsulation**: Repositories must handle duplicate filtering and ownership checks.

---

## 7. Server Management

- **Do Not Run Dev Server**: The agent should **NEVER** run `pnpm dev`. Trust the user's running server and HMR.

---

## 8. Troubleshooting & CLI

- **Preference**: Always prefer extending the project CLI (`cli/`) over creating one-off scripts in `scripts/`.
- **Execution**: Run CLI commands using `pnpm cw:cli [command]`.
- **Existing Tools**: Use `pnpm cw:cli debug workout` for data ingestion issues.
- **Scripts**: If a standalone script is absolutely necessary, use `dotenv/config` and import the shared `prisma` instance. Run with `pnpm exec tsx scripts/script-name.ts`.

---

## 9. Date & Timezone Handling

### Core Principle

- **Database**: Store all dates in **UTC** (`DateTime` columns) or **UTC Midnight** (`@db.Date` columns).
- **Backend (API)**: Always perform queries relative to the **User's Timezone**.
- **Frontend**: Display all dates in the user's local time.

### Server Utilities

- Use `server/utils/date.ts` for all date operations.
- **getUserTimezone(userId)**: Fetch user's preferred timezone (default 'UTC').
- **getUserLocalDate(timezone)**: Get a Date object representing the user's local "today" at UTC midnight (for querying `@db.Date`).
- **getStartOfDayUTC(timezone)**: Get start of user's day in UTC (for querying `DateTime` ranges).

### API Pattern

```typescript
// Correct way to query "today's" data
const timezone = await getUserTimezone(userId)
const localDate = getUserLocalDate(timezone)

const data = await prisma.model.findUnique({
  where: { userId_date: { userId, date: localDate } }
})
```

### Ingestion Guidelines

- **Workouts**: Always prefer **UTC timestamps** from external APIs (e.g., Strava `start_date`, Whoop `start`). Store directly in `DateTime` columns.
- **Deduplication**: Match activities using UTC timestamps, not local time strings, to ensure consistency across different source providers.
- **Wellness/Nutrition**: Force dates to **UTC Midnight** (e.g., `new Date(Date.UTC(year, month, day))`) when saving to `@db.Date` columns. This prevents calendar days from shifting based on server timezone.

---

## 10. TypeScript & Code Quality

- **Follow Guidelines**: Strictly adhere to [.roo/rules-code/typescript-guidelines.md](.roo/rules-code/typescript-guidelines.md).
- **Strict Null Checks**: Always handle `undefined`/`null` using `?.` and `??`.
- **Semantic Colors**: Use `primary`, `neutral`, `success`, `error`, `warning` instead of raw colors.
- **No Duplicate Imports**: Check for existing imports before adding new ones.

---

## 11. ESLint & Code Standards

### Core Rules

- **Linting is Enforced**: The project uses ESLint with `@nuxt/eslint` and standard rules.
- **Zero Tolerance**: Do not introduce new linting errors.
- **Fixing Issues**: Use `pnpm lint:fix` to automatically resolve fixable issues.
- **Verification**: Run `pnpm lint` before completing tasks.

### Configuration

- **Config File**: `eslint.config.mjs` extends Nuxt defaults.
- **Relaxed Rules**:
  - `@typescript-eslint/no-explicit-any`: **OFF** (Legacy compatibility)
  - `@typescript-eslint/no-unused-vars`: **OFF** (Legacy compatibility)
  - `vue/multi-word-component-names`: **OFF** (Project convention)
  - `vue/no-multiple-template-root`: **OFF** (Vue 3 support)

### Best Practices

- **Type Suppression**: Prefer `@ts-expect-error` over `@ts-ignore`. **Always** provide a description explaining why the error is expected.
  ```typescript
  // @ts-expect-error - External library types mismatch
  someFunctionCall()
  ```
- **Service Objects**: Use constant objects instead of static classes for services to avoid `no-extraneous-class` errors.
  ```typescript
  // Good
  export const MyService = {
    async doSomething() { ... }
  }
  ```
- **Security**: Use `<!-- eslint-disable vue/no-v-html -->` only when absolutely necessary for trusted content (e.g., Markdown rendering). Wrap the directive around the specific element.

---

## 12. Git & Source Control

### Main Branch Protection

- **ALWAYS** request explicit developer approval before pushing any changes directly to the `master` branch.
