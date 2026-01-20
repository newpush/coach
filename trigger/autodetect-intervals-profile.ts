import { logger, task } from '@trigger.dev/sdk/v3'
import { prisma } from '../server/utils/db'
import { IntervalsService } from '../server/utils/services/intervalsService'
import { userIngestionQueue } from './queues'

export const autodetectIntervalsProfileTask = task({
  id: 'autodetect-intervals-profile',
  maxDuration: 300, // 5 minutes
  queue: userIngestionQueue,
  run: async (payload: { userId: string; forceUpdate?: boolean }) => {
    const { userId, forceUpdate = false } = payload

    logger.log('Starting Intervals.icu profile auto-detection', { userId, forceUpdate })

    // Fetch user
    const user = await prisma.user.findUnique({ where: { id: userId } })

    if (!user) throw new Error('User not found')

    // Check if profile is incomplete
    // Criteria: FTP is missing/0, Max HR is missing/0, OR HR zones are missing/empty
    const hrZones = (user.hrZones as any[]) || []
    const isIncomplete =
      !user.ftp || user.ftp === 0 || !user.maxHr || user.maxHr === 0 || hrZones.length === 0

    if (!isIncomplete && !forceUpdate) {
      logger.log('Profile is already configured and forceUpdate is false. Skipping auto-detection.')
      return { success: true, message: 'Profile already configured' }
    }

    try {
      // Sync profile from Intervals.icu (includes Sport Settings)
      const profile = await IntervalsService.syncProfile(userId)

      logger.log('Profile updated automatically from Intervals.icu', {
        userId,
        ftp: profile.ftp,
        sportSettingsCount: profile.sportSettings?.length || 0
      })

      return {
        success: true,
        message: 'Profile updated successfully',
        updatedFields: ['ftp', 'lthr', 'maxHr', 'weight', 'sportSettings']
      }
    } catch (error) {
      logger.error('Error auto-detecting profile from Intervals.icu', { error })
      throw error
    }
  }
})
