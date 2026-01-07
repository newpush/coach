# Deployment Guidelines

## 1. Environment Verification

### Critical Variables

Before any deployment, ensure these environment variables are correctly set for the target environment:

- `NUXT_AUTH_ORIGIN`: Must match the full URL of the auth endpoint (e.g., `https://domain.com/api/auth`).
- `NUXT_PUBLIC_SITE_URL`: The root URL of the application.
- `DATABASE_URL`: Connection string for the production database.
- `NUXT_AUTH_SECRET`: A strong, random string for session signing.

### OAuth Callbacks

Verify that OAuth providers (Google, Strava, WHOOP, etc.) have the correct callback URLs configured:

- `https://domain.com/api/auth/callback/google`
- `https://domain.com/api/integrations/strava/callback`

## 2. Database & Migrations

### Migration Status

**NEVER** deploy code with pending schema changes that haven't been migrated.

1.  **Check Status**:
    ```bash
    pnpm prisma migrate status
    ```
2.  **Apply Migrations**:
    Ensure `prisma migrate deploy` is part of the deployment pipeline (e.g., in the build script or a pre-start hook).

### Production Safety

- Do **NOT** use `prisma migrate dev` in production. Use `prisma migrate deploy`.
- Do **NOT** use `prisma db push` in production as it can lead to data loss if schema conflicts exist.

## 3. Build & Start

### Build Process

1.  **Clean Install**:
    ```bash
    pnpm install --frozen-lockfile
    ```
2.  **Generate Prisma Client**:
    ```bash
    pnpm prisma generate
    ```
3.  **Build Nuxt**:
    ```bash
    pnpm build
    ```

### Runtime

- Use `node .output/server/index.mjs` to start the application.
- Ensure the process manager (PM2, Docker, etc.) handles restarts and logging.

## 4. Post-Deployment Checks

1.  **Auth Flow**: Test sign-in/sign-out to verify cookie configuration and redirect URLs.
2.  **Integrations**: Verify that third-party integrations can complete their OAuth flows.
3.  **Database**: Check logs for any connection errors or query failures immediately after startup.
