import { logger, task } from '@trigger.dev/sdk/v3'
import { prisma } from '../server/utils/db'
import { fetchIntervalsAthleteProfile } from '../server/utils/intervals'
import { userIngestionQueue } from './queues'
import { roundToTwoDecimals } from '../server/utils/number'

export const autodetectIntervalsProfileTask = task({
  id: 'autodetect-intervals-profile',
  maxDuration: 300, // 5 minutes
  queue: userIngestionQueue,
  run: async (payload: { userId: string; forceUpdate?: boolean }) => {
    const { userId, forceUpdate = false } = payload

    logger.log('Starting Intervals.icu profile auto-detection', { userId, forceUpdate })

    // Fetch user and integration
    const [user, integration] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.integration.findUnique({
        where: {
          userId_provider: {
            userId,
            provider: 'intervals'
          }
        }
      })
    ])

    if (!user) throw new Error('User not found')
    if (!integration) throw new Error('Intervals integration not found')

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
      // Fetch profile from Intervals.icu
      const intervalsProfile = await fetchIntervalsAthleteProfile(integration)

      const updateData: any = {}

      // Map metrics - only update if they exist in Intervals.icu
      if (intervalsProfile.ftp) updateData.ftp = intervalsProfile.ftp
      if (intervalsProfile.maxHR) updateData.maxHr = intervalsProfile.maxHR
      if (intervalsProfile.lthr) updateData.lthr = intervalsProfile.lthr
      if (intervalsProfile.weight) updateData.weight = roundToTwoDecimals(intervalsProfile.weight)
      if (intervalsProfile.restingHR) updateData.restingHr = intervalsProfile.restingHR

      // Update zones if they exist in Intervals.icu
      if (
        intervalsProfile.hrZones &&
        Array.isArray(intervalsProfile.hrZones) &&
        intervalsProfile.hrZones.length > 0
      ) {
        updateData.hrZones = intervalsProfile.hrZones
      }
      if (
        intervalsProfile.powerZones &&
        Array.isArray(intervalsProfile.powerZones) &&
        intervalsProfile.powerZones.length > 0
      ) {
        updateData.powerZones = intervalsProfile.powerZones
      }

      // Update timezone if user doesn't have one
      if (intervalsProfile.timezone && !user.timezone) {
        updateData.timezone = intervalsProfile.timezone
      }

      if (Object.keys(updateData).length === 0) {
        logger.log('No data found from Intervals.icu to update profile')
        return { success: true, message: 'No new data found' }
      }

      // Update user in database
      await prisma.user.update({
        where: { id: userId },
        data: updateData
      })

      logger.log('Profile updated automatically from Intervals.icu', {
        userId,
        updatedFields: Object.keys(updateData)
      })

      return {
        success: true,
        message: 'Profile updated successfully',
        updatedFields: Object.keys(updateData)
      }
    } catch (error) {
      logger.error('Error auto-detecting profile from Intervals.icu', { error })
      throw error
    }
  }
})
