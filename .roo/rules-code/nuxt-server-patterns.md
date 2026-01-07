# Nuxt Server Patterns & Best Practices

## Auto-Imports in Server Routes

Nuxt 3 automatically imports utilities exported from the `server/utils` directory into all API routes (`server/api/...`).

### Rule

**Do NOT manually import files from `server/utils` using relative paths.**

**❌ Bad:**

```typescript
// server/api/workouts/index.get.ts
import { prisma } from '../../utils/db' // causes resolution errors
import { formatData } from '../../utils/format'

export default defineEventHandler(async (event) => {
  return prisma.workout.findMany()
})
```

**✅ Good:**

```typescript
// server/api/workouts/index.get.ts
// prisma and formatData are available globally
export default defineEventHandler(async (event) => {
  return prisma.workout.findMany()
})
```

## Prisma Client Management

When using Prisma in a long-running server (like Nuxt dev server), we use a singleton pattern to prevent connection exhaustion. However, this can lead to stale clients during development.

### Schema Changes

When you modify `prisma/schema.prisma` and run `prisma migrate` or `prisma db push`:

1.  **Regenerate Client**: You MUST run `npx prisma generate` to update the generated client code in `node_modules`.
2.  **Restart/Invalidate**: The running dev server might hold onto the _old_ client instance in memory.
    - If you see errors like `Unknown argument` for a new field you just added, the server is using the old client.
    - **Action**: You may need to trigger a server restart or (if you cannot restart) modify the `server/utils/db.ts` file (e.g., changing the global variable name) to force a new client instantiation.

## API Documentation (OpenAPI)

We use Nitro's experimental OpenAPI support to generate documentation for our REST API endpoints.

### Rule

**All REST API endpoints (`server/api/...`) MUST include OpenAPI metadata.**

This ensures that our API documentation at `/_docs/scalar` is always up-to-date and accurate.

### Implementation

Use the `defineRouteMeta` macro (preferred) or the `openAPI` property in `defineEventHandler` to define the spec.

**✅ Preferred (defineRouteMeta):**

```typescript
// server/api/workouts/index.get.ts
defineRouteMeta({
  openAPI: {
    tags: ['Workouts'],
    summary: 'List user workouts',
    description: 'Returns a paginated list of workouts.',
    parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }],
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: { $ref: '#/components/schemas/Workout' }
            }
          }
        }
      }
    }
  }
})

export default defineEventHandler(async (event) => {
  // implementation
})
```

**Global Schemas:**
Common schemas (like `Workout`, `User`) should be defined in `nuxt.config.ts` (under `nitro.openAPI`) or injected via `$global` in a route meta to allow `$ref` usage. Ensure any new data models are added to the global components config if they are reused.
