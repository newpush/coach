import { tool } from 'ai'
import { z } from 'zod'
import { userRepository } from '../repositories/userRepository'
import { generateAthleteProfileTask } from '../../../trigger/generate-athlete-profile'
import { prisma } from '../../utils/db'
import { getStartOfDaysAgoUTC, getEndOfDayUTC } from '../../utils/date'

export const profileTools = (userId: string, timezone: string) => ({
  get_user_profile: tool({
    description: 'Get user profile details like FTP, Max HR, Weight, Age.',
    inputSchema: z.object({}),
    execute: async () => {
      const user = await userRepository.getById(userId)
      if (!user) return { error: 'Profile not found' }

      // Filter sensitive fields manually since repository returns full user
      // or we can just return what we need
      return {
        name: user.name,
        ftp: user.ftp,
        maxHr: user.maxHr,
        weight: user.weight,
        dob: user.dob,
        restingHr: user.restingHr,
        sex: user.sex,
        city: user.city,
        state: user.state,
        country: user.country,
        timezone: user.timezone,
        language: user.language,
        weightUnits: user.weightUnits,
        height: user.height,
        heightUnits: user.heightUnits,
        distanceUnits: user.distanceUnits,
        temperatureUnits: user.temperatureUnits,
        aiPersona: user.aiPersona
      }
    }
  }),

  generate_athlete_profile: tool({
    description:
      'Recalculate your athlete profile, FTP, and heart rate zones based on your most recent training data. Use this when the user says their fitness has changed or they want to update their zones.',
    inputSchema: z.object({}),
    needsApproval: false,
    execute: async () => {
      // Create a report record for tracking
      const report = await prisma.report.create({
        data: {
          userId,
          type: 'ATHLETE_PROFILE',
          status: 'PENDING',
          dateRangeStart: getStartOfDaysAgoUTC(timezone, 30),
          dateRangeEnd: getEndOfDayUTC(timezone, new Date())
        }
      })

      try {
        await generateAthleteProfileTask.trigger(
          {
            userId,
            reportId: report.id
          },
          {
            tags: [`user:${userId}`, 'manual-update'],
            concurrencyKey: userId
          }
        )
        return {
          success: true,
          message:
            'Athlete profile update has been started. Your zones and fitness metrics will be updated shortly.'
        }
      } catch (e: any) {
        return { error: `Failed to trigger profile update: ${e.message}` }
      }
    }
  })
})
