# Repository Pattern Guidelines

## Overview

To ensure data consistency and encapsulate complex logic (especially regarding duplicate management and user ownership), this project uses the **Repository Pattern** for data access.

## Core Rules

1.  **Centralized Access**: All database access for complex models (e.g., `Workout`, `Nutrition`) must go through their respective repositories in `server/utils/repositories/`.
2.  **No Direct Prisma Calls**: Avoid using `prisma.model.findMany` or `prisma.model.findUnique` directly in API handlers (`server/api/...`) for business logic.
3.  **Encapsulation**: Repositories must handle:
    - **Duplicate Filtering**: Automatically exclude duplicates (e.g., `isDuplicate: false`) unless explicitly requested.
    - **Ownership Checks**: Always require `userId` for fetching user-specific data to prevent IDOR vulnerabilities.

## Repository Structure

Repositories are plain objects exporting async functions, located in `server/utils/repositories/`. Because they are in `server/utils`, they are **auto-imported** by Nuxt.

**Available Repositories:**

- `workoutRepository`
- `nutritionRepository`
- `wellnessRepository`

**File:** `server/utils/repositories/workoutRepository.ts`

```typescript
export const workoutRepository = {
  // Standard fetch: Defaults to hiding duplicates
  async getForUser(userId: string, options: { includeDuplicates?: boolean } = {}) {
    return prisma.workout.findMany({
      where: {
        userId,
        isDuplicate: options.includeDuplicates ? undefined : false
        // ... other filters
      }
    })
  }

  // ... other methods
}
```

## Usage Example

**❌ Bad (Direct Prisma Access):**

```typescript
// server/api/workouts/index.get.ts
const workouts = await prisma.workout.findMany({
  where: {
    userId: session.user.id,
    isDuplicate: false // easy to forget!
  }
})
```

**✅ Good (Repository Access):**

```typescript
// server/api/workouts/index.get.ts
// workoutRepository is auto-imported
const workouts = await workoutRepository.getForUser(session.user.id)
```
