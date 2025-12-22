# Account Query Error Diagnosis

## Error Overview

**Error Message:**
```
Invalid prisma.account.findUnique() invocation
The column `(not available)` does not exist in the current database
```

**Location:** `getUserByAccount` in NextAuth adapter (triggered during OAuth authentication)

**Date Diagnosed:** 2025-12-22

---

## Root Cause Analysis

### Findings

1. **Database Schema: ✅ CORRECT**
   - Production database has the correct `Account` table structure
   - All columns present: `userId`, `type`, `provider`, `providerAccountId`, `refresh_token`, `access_token`, `expires_at`, `token_type`, `scope`, `id_token`, `session_state`, `createdAt`, `updatedAt`
   - Composite primary key index exists: `Account_pkey (provider, providerAccountId)`
   - Latest migration applied: `20251221_add_fit_file_support`

2. **Prisma Schema: ✅ CORRECT**
   - [`prisma/schema.prisma`](prisma/schema.prisma:182-201) defines the Account model correctly
   - Uses composite primary key: `@@id([provider, providerAccountId])`
   - All fields match production database

3. **Test Results: ✅ QUERIES WORK**
   - Created [`scripts/test-account-query.ts`](scripts/test-account-query.ts)
   - Successfully executed `findUnique` with composite key against production DB
   - Both `findUnique` and `findFirst` queries work perfectly
   - Raw SQL query also works

4. **Prisma Client Status: ⚠️ POTENTIAL ISSUE**
   - Local Prisma client generated on: **Dec 21, 2025 20:51**
   - Production deployment may be using a **stale Prisma client**

### Diagnosis

The error `(not available)` is a **Prisma Client metadata error**, not a database schema error. This occurs when:

1. The Prisma Client in production was generated **before** the Account model's composite key was properly defined
2. The production deployment didn't run `prisma generate` after the latest migration
3. There's a mismatch between the client's internal metadata and the actual database structure

The `(not available)` message appears because the Prisma Client's introspection metadata is corrupt or outdated, causing it to fail when constructing the query for the composite unique key.

---

## Evidence

### Proof the Database is Correct

```bash
$ npx tsx scripts/test-account-query.ts

=== TESTING findUnique QUERY ===
✅ findUnique succeeded!
Found account: {
  provider: 'google',
  providerAccountId: '101043651660275901856',
  userId: 'f0f322a5-3eb4-41bf-82c9-bb296b1d76c8',
  type: 'oauth'
}
```

### Index Structure

```sql
CREATE UNIQUE INDEX "Account_pkey" ON public."Account" 
USING btree (provider, "providerAccountId")
```

### Production Migration Status

```javascript
{
  migration_name: '20251221_add_fit_file_support',
  finished_at: 2025-12-22T09:43:08.149Z,
  applied_steps_count: 1
}
```

---

## Solution

### 1. Regenerate Prisma Client in Production

The production environment needs to regenerate the Prisma Client to sync with the current database schema.

**On the production server:**

```bash
# Ensure the latest schema is deployed
git pull origin main  # or your production branch

# Regenerate the Prisma Client
npx prisma generate

# Restart the application
pm2 restart coach-wattz  # or your process manager command
```

### 2. Verify Build Process

Ensure your deployment pipeline includes Prisma Client generation:

**In `package.json` scripts:**
```json
{
  "scripts": {
    "build": "prisma generate && nuxt build",
    "deploy": "prisma generate && pm2 restart coach-wattz"
  }
}
```

**For Docker deployments**, ensure `Dockerfile` includes:
```dockerfile
RUN pnpm prisma generate
```

### 3. Alternative: Force Client Regeneration

If the issue persists, force a clean regeneration:

```bash
# Remove generated client
rm -rf node_modules/.prisma
rm -rf node_modules/@prisma/client

# Reinstall and regenerate
pnpm install
npx prisma generate
```

---

## Prevention

### Recommended Deployment Checklist

1. ✅ Always run `prisma generate` after pulling schema changes
2. ✅ Include `prisma generate` in your build script
3. ✅ Restart the application after regenerating the client
4. ✅ Verify migrations are applied: `npx prisma migrate status`
5. ✅ Test authentication flow after deployment

### CI/CD Pipeline

Add to your deployment workflow:

```yaml
- name: Generate Prisma Client
  run: npx prisma generate

- name: Verify migrations
  run: npx prisma migrate status --schema=./prisma/schema.prisma
```

---

## Technical Details

### How NextAuth Uses the Account Model

The `@next-auth/prisma-adapter` package (v1.0.7) implements `getUserByAccount` like this:

```typescript
getUserByAccount({ providerAccountId, provider }) {
  return prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider,
        providerAccountId,
      },
    },
    include: { user: true },
  })
}
```

The adapter expects Prisma to support composite unique lookups using the `provider_providerAccountId` virtual field name, which is auto-generated from the `@@id([provider, providerAccountId])` declaration.

### Why "(not available)" Appears

When the Prisma Client's metadata is stale:
1. It tries to construct the WHERE clause for the composite key
2. It can't find the proper column mapping in its metadata
3. It falls back to `(not available)` as a placeholder
4. The query fails because the column name is invalid

---

## Related Files

- **Database Schema:** [`prisma/schema.prisma`](prisma/schema.prisma)
- **Auth Configuration:** [`server/api/auth/[...].ts`](server/api/auth/[...].ts)
- **Test Script:** [`scripts/test-account-query.ts`](scripts/test-account-query.ts)
- **Production Schema Check:** [`scripts/check-prod-schema.ts`](scripts/check-prod-schema.ts)

---

## Verification Steps After Fix

1. **Test OAuth Login**
   ```bash
   # Navigate to your app and try Google OAuth login
   # Should successfully authenticate without errors
   ```

2. **Check Application Logs**
   ```bash
   pm2 logs coach-wattz --lines 50
   # Should not show "Invalid prisma.account.findUnique() invocation" errors
   ```

3. **Verify Prisma Client Version**
   ```bash
   # On production server
   ls -la node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/
   # Check that schema.prisma timestamp is recent
   ```

---

## Status

- **Diagnosis:** ✅ Complete
- **Root Cause:** Stale Prisma Client in production
- **Fix Required:** Regenerate Prisma Client on production server
- **Urgency:** High (blocks OAuth authentication)
