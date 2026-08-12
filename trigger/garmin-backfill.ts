import { task, logger, AbortTaskRunError } from '@trigger.dev/sdk/v3'
import { GarminService } from '../server/utils/services/garminService'
import { userIngestionQueue } from './queues'
import { waitForTaskSeconds } from '../server/utils/task-runtime'

export const garminBackfillTask = task({
  id: 'garmin-backfill',
  queue: userIngestionQueue,
  maxDuration: 900, // 15 minutes
  run: async (payload: { userId: string; delaySeconds?: number }) => {
    const { userId, delaySeconds = 30 } = payload

    if (delaySeconds > 0) {
      logger.log(`Waiting ${delaySeconds}s before starting Garmin backfill for user ${userId}...`)
      await waitForTaskSeconds(delaySeconds)
    }

    logger.log(`Starting sequential Garmin backfill for user ${userId}`)

    try {
      const result = await GarminService.startBackfill(userId)

      // CW-95: an incomplete backfill must not look like a complete one.
      //
      // Hard failures (throw, so the run is marked failed):
      //  - `no-integration`: nothing was requested at all; the run did no work. CW-512: this is
      //    deterministic — the user has no Garmin integration, and no retry can create one — so
      //    it throws `AbortTaskRunError`, which Trigger.dev treats as terminal and fails without
      //    consuming the remaining attempts. Retrying it burned ~90s of queue time re-running the
      //    `delaySeconds` wait below from the top of the run on each of the 3 attempts.
      //  - `failed`: every backfill request was rejected — almost always a token/registration
      //    problem that a retry can genuinely resolve (typically the "User not registered with
      //    consumer" propagation race right after connect). This keeps the plain `Error` throw
      //    precisely so it still retries; do not collapse it into the aborted case above.
      //
      // Partial failure succeeds *with a summary* rather than throwing, deliberately:
      // each type is an independent Garmin request, so throwing would retry the whole run and
      // re-request the types that already succeeded, and per-type failures are usually a
      // permission/scope limitation for that user that no number of retries will fix. Failing
      // the run would also hide "5 of 6 succeeded" behind a generic task failure. The returned
      // `failed[]` carries the per-type error so an operator can see exactly which types are
      // missing from the run output.
      if (result.status === 'no-integration') {
        throw new AbortTaskRunError(
          `Garmin backfill aborted: no Garmin integration found for user ${userId}`
        )
      }

      if (result.status === 'failed') {
        const detail = result.failed.map((f) => `${f.type}: ${f.error}`).join('; ')
        throw new Error(
          `Garmin backfill failed for user ${userId}: all ${result.failed.length} backfill requests were rejected (${detail})`
        )
      }

      if (result.status === 'partial') {
        logger.warn(`Garmin backfill partially completed for user ${userId}`, {
          requested: result.requested,
          failed: result.failed
        })
      } else {
        logger.log(`Garmin backfill requests completed for user ${userId}`, {
          requested: result.requested
        })
      }

      return {
        success: true,
        status: result.status,
        requested: result.requested,
        failed: result.failed
      }
    } catch (error) {
      logger.error(`Garmin backfill task failed for user ${userId}`, { error })
      throw error
    }
  }
})
