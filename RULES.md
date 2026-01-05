# Coach Watts Development Rules & Guidelines

This file aggregates all critical development rules and guidelines for the Coach Watts project. All AI agents and developers must strictly adhere to these rules to ensure code quality, consistency, and system stability.

## 1. Database Management

### Database Safety
- **NEVER** reset the development database (e.g., `pnpm prisma migrate reset`, `pnpm prisma db push --force-reset`).
- The development database contains critical test data and state.

### Schema Changes & Migrations
1.  **Scaffold Migrations**: Always use the CLI. Do NOT manually create migration files.
2.  **Workflow**:
    -   Edit `prisma/schema.prisma`.
    -   Generate SQL: `pnpm prisma migrate dev --name <name> --create-only`.
    -   **Review/Edit** the generated SQL if needed.
    -   Apply: `pnpm prisma migrate dev`.
3.  **Consistency**: Ensure migration history matches the schema.

### Verification
-   **Verify Migrations**: Run `pnpm prisma migrate status` before deployment.
-   **Check Drift**: Use `pnpm prisma migrate diff` to check for schema drift.
-   **No `db push`**: Do not rely on `prisma db push` if you need reproducible migrations.

---

## 2. Deployment Guidelines

### Environment Verification
-   Ensure `NUXT_AUTH_ORIGIN`, `NUXT_PUBLIC_SITE_URL`, `DATABASE_URL`, and `NUXT_AUTH_SECRET` are set correctly.
-   Verify OAuth callback URLs for Google, Strava, etc.

### Database & Migrations
-   **Never** deploy pending schema changes.
-   **Use `migrate deploy`**: In production, use `prisma migrate deploy`, NOT `migrate dev` or `db push`.

### Build & Start
-   Clean install: `pnpm install --frozen-lockfile`.
-   Generate client: `pnpm prisma generate`.
-   Build: `pnpm build`.
-   Start: `node .output/server/index.mjs`.

---

## 3. Frontend Design Guidelines

### Design Tokens (Nuxt UI)
-   **Colors**: Use semantic colors (`primary`, `neutral`, `success`, `error`). Do NOT use hardcoded hex values.
-   **Typography**: Use `font-sans`. Follow header and body text standards.
-   **Spacing**: Use standard padding (`p-6`) and gaps (`gap-6`).

### Components
-   **Buttons**: Use `UButton`. Follow standard patterns for navbar actions (`size="sm"`, `class="font-bold"`, with icon).
-   **Cards**: Use `UCard` for content containers.
-   **Tables**: Use plain HTML tables wrapped in a card-like div. **Do NOT use UCard for tables.**

### Layouts
-   **Dashboard**: Use `UDashboardPanel`, `UDashboardNavbar`, `UDashboardSidebar`.
-   **Forms**: Wrap inputs in `UFormField`.
-   **Modals**: Use `:ui="{ content: 'sm:max-w-lg' }"` for width control. Ensure inputs are full width (`w-full`).

### Responsive Design
-   Ensure all designs work on mobile and desktop.
-   Touch targets must be at least 44x44px.

---

## 4. Frontend Patterns

### Pinia Stores
-   Use **Setup Store** syntax (`defineStore` with a setup function).
-   Use `ref()` for state and `computed()` for getters.
-   Use `$fetch` for API requests.

### Composables
-   Place in `app/composables/`.
-   Use "use" naming convention (e.g., `useFormat`).

### General Vue/Nuxt
-   Use `<script setup>`.
-   Use Nuxt auto-imports.
-   Use `useHead()` for meta tags.

---

## 5. Nuxt Server Patterns

### Auto-Imports
-   **Do NOT** manually import files from `server/utils` using relative paths. They are auto-imported.

### Prisma Client
-   Use the singleton instance from `server/utils/db`.
-   Regenerate the client (`npx prisma generate`) after schema changes.

---

## 6. Repository Pattern

### Core Rules
-   **Centralized Access**: Use repositories in `server/utils/repositories/` for complex models (Workout, Nutrition).
-   **No Direct Prisma**: Avoid direct `prisma.model` calls in API handlers for business logic.
-   **Encapsulation**: Repositories must handle duplicate filtering and ownership checks.

---

## 7. Server Management

-   **Do Not Run Dev Server**: The agent should **NEVER** run `pnpm dev`. Trust the user's running server and HMR.

---

## 8. Troubleshooting & CLI

-   **Preference**: Always prefer extending the project CLI (`cli/`) over creating one-off scripts in `scripts/`.
-   **Execution**: Run CLI commands using `pnpm cw:cli [command]`.
-   **Existing Tools**: Use `pnpm cw:cli debug workout` for data ingestion issues.
-   **Scripts**: If a standalone script is absolutely necessary, use `dotenv/config` and import the shared `prisma` instance. Run with `pnpm exec tsx scripts/script-name.ts`.

---

## 10. TypeScript & Code Quality

-   **Follow Guidelines**: Strictly adhere to [.roo/rules-code/typescript-guidelines.md](.roo/rules-code/typescript-guidelines.md).
-   **Strict Null Checks**: Always handle `undefined`/`null` using `?.` and `??`.
-   **Semantic Colors**: Use `primary`, `neutral`, `success`, `error`, `warning` instead of raw colors.
-   **No Duplicate Imports**: Check for existing imports before adding new ones.