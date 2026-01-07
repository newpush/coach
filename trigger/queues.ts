import { queue } from '@trigger.dev/sdk/v3'

/**
 * User Analysis Queue
 *
 * This queue ensures that each user can have at most 2 concurrent jobs running at a time.
 * Uses concurrencyKey to create a separate queue instance per user.
 *
 * Usage when triggering tasks:
 * ```typescript
 * await analyzeWorkoutTask.trigger(
 *   { workoutId: "123" },
 *   { concurrencyKey: userId }
 * );
 * ```
 *
 * The concurrencyKey creates a separate queue for each unique user ID,
 * each with its own concurrency limit of 2.
 */
export const userAnalysisQueue = queue({
  name: 'user-analysis',
  concurrencyLimit: 2
})

/**
 * User Reports Queue
 *
 * This queue handles report generation tasks with per-user concurrency control.
 * Each user gets their own queue instance with a limit of 2 concurrent jobs.
 */
export const userReportsQueue = queue({
  name: 'user-reports',
  concurrencyLimit: 2
})

/**
 * User Background Tasks Queue
 *
 * This queue handles background tasks like deduplication and planning.
 * Each user gets their own queue instance with a limit of 2 concurrent jobs.
 */
export const userBackgroundQueue = queue({
  name: 'user-background',
  concurrencyLimit: 2
})

/**
 * User Ingestion Queue
 *
 * This queue handles data ingestion tasks from external sources.
 * Each user gets their own queue instance with a limit of 2 concurrent jobs.
 */
export const userIngestionQueue = queue({
  name: 'user-ingestion',
  concurrencyLimit: 2
})
