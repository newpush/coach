# Authentication & Session Management

## Centralized Session Management

This project uses a centralized session utility that handles regular authentication, auth bypass mode, and admin impersonation.

### Rule: ALWAYS Use the Centralized Session Utility

**All API endpoints** in `server/api/` **MUST** import `getServerSession` from the centralized utility, NOT from `#auth`.

**❌ WRONG:**

```typescript
// server/api/example/index.get.ts
import { getServerSession } from '#auth'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  // ...
})
```

**✅ CORRECT:**

```typescript
// server/api/example/index.get.ts
import { getServerSession } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  // ...
})
```

### Why This Matters

The centralized [`server/utils/session.ts`](server/utils/session.ts:1) provides critical functionality:

1. **Impersonation Support**: Checks for `auth.impersonated_user_id` cookie and returns the impersonated user's data
2. **Auth Bypass Mode**: Supports development mode with `AUTH_BYPASS_USER` environment variable
3. **Consistent Session Structure**: Ensures all endpoints receive the same session format with additional metadata:
   - `isImpersonating`: Boolean flag indicating if session is impersonated
   - `originalUserId`: The admin's user ID when impersonating
   - `originalUserEmail`: The admin's email when impersonating

### Path Calculation

The correct import path depends on your file's depth in the `server/api/` directory:

- **Top level** (`server/api/example.get.ts`): `'../utils/session'`
- **One level deep** (`server/api/workouts/index.get.ts`): `'../../utils/session'`
- **Two levels deep** (`server/api/workouts/[id]/analyze.post.ts`): `'../../../utils/session'`

### Fixing Existing Endpoints

If you discover an endpoint using `from '#auth'`, fix it immediately:

1. **Manual Fix**: Change the import path as shown above
2. **Bulk Fix**: Run the provided script:
   ```bash
   pnpm exec tsx scripts/fix-all-session-imports.ts
   ```

This script automatically calculates correct relative paths and updates all API endpoints.

## Session Data Structure

The session object returned by `getServerSession` has the following structure:

```typescript
{
  user: {
    id: string
    name: string | null
    email: string
    image: string | null
    isAdmin: boolean
    // Present only during impersonation:
    isImpersonating?: true
    originalUserId?: string
    originalUserEmail?: string
  },
  expires: string  // ISO 8601 timestamp
}
```

## User Identification in API Endpoints

Always use the `session.user.id` for user-specific operations. The centralized session utility ensures this ID correctly reflects:

- The actual authenticated user in normal mode
- The impersonated user when admin impersonation is active
- The bypass user in development auth bypass mode

**Example:**

```typescript
export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  // This userId is ALWAYS correct (considers impersonation)
  const userId = session.user.id

  // Fetch user-specific data
  const data = await prisma.someModel.findMany({
    where: { userId }
  })

  return data
})
```

## Frontend Session Access

Frontend components should use `useAuth()` composable which automatically reflects the centralized session:

```typescript
const { data } = useAuth()
const user = computed(() => data.value?.user)

// Check if impersonating
const isImpersonating = computed(() => (data.value?.user as any)?.isImpersonating)
```

## Admin Impersonation Flow

### Starting Impersonation

1. Admin calls `/api/admin/impersonate` with `{ userId }`
2. Server sets `auth.impersonated_user_id` cookie
3. Server sets `auth.impersonation_meta` cookie (readable by frontend)
4. All subsequent API calls return impersonated user's data

### Stopping Impersonation

1. User clicks "Exit Impersonation" button
2. Frontend calls `/api/admin/stop-impersonation`
3. Server clears impersonation cookies
4. Session returns to admin user

### Frontend Banner

The [`ImpersonationBanner`](app/components/ImpersonationBanner.vue:1) component automatically shows a yellow banner when `session.user.isImpersonating` is true.

## Testing Impersonation

After creating or modifying API endpoints:

1. Start the development server
2. Log in as admin user
3. Navigate to `/admin/users`
4. Click "Impersonate" on a test user
5. Verify the yellow banner appears
6. Test the endpoint to ensure it returns the impersonated user's data
7. Click "Exit Impersonation" to return to admin view
8. Verify the endpoint now returns your admin data

## Common Mistakes

### ❌ Using NextAuth Session Directly

```typescript
import { getServerSession } from '#auth'
// This bypasses impersonation logic!
```

### ❌ Hardcoding User IDs

```typescript
const userId = 'some-hardcoded-id'
// Never hardcode - always use session.user.id
```

### ❌ Not Checking Session

```typescript
const session = await getServerSession(event)
const data = await prisma.workout.findMany({
  where: { userId: session.user.id } // Crashes if session is null!
})
```

### ✅ Correct Pattern

```typescript
import { getServerSession } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!session?.user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }

  const userId = session.user.id

  const data = await prisma.workout.findMany({
    where: { userId }
  })

  return data
})
```

## Migration Checklist

When creating a new API endpoint:

- [ ] Import `getServerSession` from `'../../utils/session'` (adjust path depth)
- [ ] Check for `session?.user` before accessing user data
- [ ] Use `session.user.id` for user-specific queries
- [ ] Test with impersonation enabled to ensure correct user data is returned
- [ ] Verify no direct imports from `'#auth'`
