import { describe, test, expect } from 'vitest'

const triggers = [
  'adapt-training-plan',
  'adjust-structured-workout',
  'analyze-last-3-nutrition',
  'analyze-last-3-workouts',
  'analyze-last-7-nutrition',
  'analyze-nutrition',
  'analyze-plan-adherence',
  'analyze-wellness',
  'analyze-workout',
  'autodetect-intervals-profile',
  'daily-checkin',
  'daily-coach',
  'deduplicate-workouts',
  'delete-user-account',
  'generate-ad-hoc-workout',
  'generate-athlete-profile',
  'generate-custom-report',
  'generate-implementation-guide',
  'generate-recommendations',
  'generate-report',
  'generate-score-explanations',
  'generate-structured-workout',
  'generate-training-block',
  'generate-weekly-plan',
  'generate-weekly-report',
  'generate-workout-messages',
  'hello-world',
  'ingest-all',
  'ingest-fit-file',
  'ingest-fitbit',
  'ingest-hevy',
  'ingest-intervals-streams',
  'ingest-intervals',
  'ingest-oura',
  'ingest-strava-streams',
  'ingest-strava',
  'ingest-whoop',
  'ingest-withings',
  'ingest-yazio',
  'init',
  'process-sync-queue',
  'queues',
  'recommend-today-activity',
  'review-goals',
  'sentry-error-test',
  'suggest-goals'
]

describe('Trigger Imports', () => {
  triggers.forEach((trigger) => {
    test(`should import ${trigger}.ts without error`, async () => {
      try {
        await import(`../../../trigger/${trigger}.ts`)
        expect(true).toBe(true)
      } catch (error) {
        console.error(`Failed to import trigger/${trigger}:`, error)
        throw error
      }
    }, 15000)
  })
})
