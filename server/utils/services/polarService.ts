import { prisma } from '../db'
import type { Integration } from '@prisma/client'
import {
  listPolarExercises,
  listPolarSleeps,
  listPolarNightlyRecharges,
  fetchPolarSleep,
  normalizePolarExercise,
  normalizePolarSleep,
  normalizePolarNightlyRecharge,
  ensureValidToken
} from '../polar'
import { shouldIngestActivities, shouldIngestWellness } from '../integration-settings'
import { workoutRepository } from '../repositories/workoutRepository'
import { wellnessRepository } from '../repositories/wellnessRepository'

export const polarService = {
  async syncUser(userId: string) {
    const integration = await prisma.integration.findFirst({
      where: { userId, provider: 'polar' }
    })

    if (!integration || !integration.accessToken) {
      throw new Error('Polar integration not found')
    }

    // Ensure valid token
    const validIntegration = await ensureValidToken(integration)

    await prisma.integration.update({
      where: { id: integration.id },
      data: { syncStatus: 'SYNCING' }
    })

    const results = {
      exercises: 0,
      sleeps: 0,
      recharges: 0
    }
    const settings = (integration.settings as Record<string, any> | null) || {}
    const wellnessEnabled = shouldIngestWellness(settings)

    try {
      // 1. Sync Exercises
      if (shouldIngestActivities('polar', integration.ingestWorkouts, settings)) {
        results.exercises = await this.syncExercises(validIntegration)
      }

      // 2. Sync Sleep
      if (wellnessEnabled) {
        results.sleeps = await this.syncSleep(validIntegration)
      }

      // 3. Sync Nightly Recharge
      if (wellnessEnabled) {
        results.recharges = await this.syncNightlyRecharge(validIntegration)
      }

      // Update sync status
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          lastSyncAt: new Date(),
          syncStatus: 'SUCCESS',
          errorMessage: null
        }
      })
    } catch (error) {
      console.error('Polar sync error:', error)
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          syncStatus: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        }
      })
      throw error
    }

    return results
  },

  async syncExercises(integration: Integration) {
    const exercises = await listPolarExercises(integration)
    let count = 0

    for (const exercise of exercises) {
      // Check if exists
      const existing = await workoutRepository.getByExternalId(
        integration.userId,
        'polar',
        exercise.id
      )
      if (existing) continue

      const normalized = normalizePolarExercise(exercise, integration.userId)
      // normalizePolarExercise returns an object suitable for Prisma create
      // but might need some tweaking if it returns null
      if (!normalized) continue

      await workoutRepository.create(normalized)
      count++
    }
    return count
  },

  async syncSleep(integration: Integration) {
    const sleepsList = await listPolarSleeps(integration)
    let count = 0

    for (const entry of sleepsList) {
      const sleepUrl = typeof entry?.url === 'string' ? entry.url.trim() : ''
      if (!sleepUrl) {
        console.warn('[Polar] Skipping sleep entry without details URL', {
          userId: integration.userId,
          date: entry?.date,
          entry
        })
        continue
      }

      try {
        // Fetch full sleep details
        const fullSleep = await fetchPolarSleep(integration, sleepUrl)
        if (!fullSleep) continue

        const normalized = normalizePolarSleep(fullSleep, integration.userId)

        // Upsert wellness
        await wellnessRepository.upsert(
          integration.userId,
          normalized.date,
          normalized,
          normalized,
          'polar'
        )
        count++
      } catch (error) {
        console.warn('[Polar] Failed to ingest sleep entry', {
          userId: integration.userId,
          date: entry?.date,
          url: sleepUrl,
          error
        })
      }
    }
    return count
  },

  async syncNightlyRecharge(integration: Integration) {
    const recharges = await listPolarNightlyRecharges(integration)
    let count = 0

    for (const recharge of recharges) {
      const normalized = normalizePolarNightlyRecharge(recharge, integration.userId)

      await wellnessRepository.upsert(
        integration.userId,
        normalized.date,
        normalized,
        normalized,
        'polar'
      )
      count++
    }
    return count
  }
}
