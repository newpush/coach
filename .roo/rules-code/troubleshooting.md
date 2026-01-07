# Troubleshooting Guide

## Database Scripts

When creating troubleshooting scripts that need database access:

1.  **Always use `dotenv/config`**: This ensures environment variables (like `DATABASE_URL`) are loaded from `.env`.
2.  **Import Prisma correctly**: Use the shared `prisma` instance from `server/utils/db` when possible, but handle potential connection pooling issues in standalone script contexts.

### Example Script Pattern

```typescript
// scripts/my-troubleshoot-script.ts
import 'dotenv/config'
import { prisma } from '../server/utils/db'

async function main() {
  console.log('Connecting to database...')

  // Your logic here
  const user = await prisma.user.findFirst()
  console.log('User found:', user?.email)
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    // Standard cleanup
  })
```

## Running Scripts

Run the script using `tsx`:

```bash
pnpm exec tsx scripts/my-troubleshoot-script.ts
```

## Known Issues

### SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string

If you see this error when running a script, it means the `PrismaPgAdapter` (used in `server/utils/db.ts`) is failing to correctly authenticate with the database in a standalone Node.js environment.

**Solution:**
In your script, cast `prisma` to `any` if using the shared instance to bypass strict typing issues if necessary, or ensure your `.env` file is properly loaded and `DATABASE_URL` contains the password in a format the adapter expects.
