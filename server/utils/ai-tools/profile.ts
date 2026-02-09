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
  }),

  update_user_profile: tool({
    description:
      'Update user profile details like weight, height, FTP, resting HR, max HR, and location settings. Use this when the user says "Change my weight to X" or "Update my FTP".',
    inputSchema: z.object({
      weight: z.number().optional().describe('Weight in user preferred units'),
      height: z.number().optional().describe('Height in user preferred units (cm/in)'),
      ftp: z.number().optional().describe('Functional Threshold Power in Watts'),
      maxHr: z.number().optional().describe('Maximum Heart Rate in bpm'),
      restingHr: z.number().optional().describe('Resting Heart Rate in bpm'),
      lthr: z.number().optional().describe('Lactate Threshold Heart Rate in bpm'),
      city: z.string().optional(),
      state: z.string().optional(),
      country: z.string().optional(),
      language: z.string().optional(),
      aiPersona: z
        .string()
        .optional()
        .describe('Desired personality of the AI (e.g. Supportive, Aggressive, Professional)'),
      distanceUnits: z.enum(['Kilometers', 'Miles']).optional(),
      weightUnits: z.enum(['Kilograms', 'Pounds']).optional(),
      temperatureUnits: z.enum(['Celsius', 'Fahrenheit']).optional()
    }),
    execute: async (data) => {
      try {
        const updated = await userRepository.update(userId, data)
        return {
          success: true,
          message: 'Profile updated successfully.',
          updated_fields: Object.keys(data)
        }
      } catch (e: any) {
        return { error: `Failed to update profile: ${e.message}` }
      }
    }
  }),

  get_sport_settings: tool({
    description:
      'Get sport-specific profiles (e.g. Cycling vs Running FTP/Zones). Use this when the user asks about their sport settings or zones.',
    inputSchema: z.object({}),
    execute: async () => {
      const settings = await sportSettingsRepository.getByUserId(userId)
      return {
        count: settings.length,
        profiles: settings.map((s) => ({
          id: s.id,
          name: s.name,
          is_default: s.isDefault,
          sports: s.types,
          ftp: s.ftp,
          max_hr: s.maxHr,
          lthr: s.lthr,
          threshold_pace: s.thresholdPace,
          source: s.source
        }))
      }
    }
  }),

  update_sport_settings: tool({
    description:
      'Update or create a sport-specific profile. Use this to change FTP, zones, or threshold pace for a specific sport like Cycling or Running.',
    inputSchema: z.object({
      id: z.string().optional().describe('Profile ID if updating existing, omit for new'),
      name: z.string().optional().describe('Name of the profile (e.g. Cycling, Running)'),
      types: z.array(z.string()).optional().describe('Activity types using this profile'),
      ftp: z.number().optional(),
      maxHr: z.number().optional(),
      lthr: z.number().optional(),
      thresholdPace: z.number().optional().describe('Pace in m/s'),
      restingHr: z.number().optional()
    }),
    execute: async (data) => {
      try {
        // Prepare payload for repo (expects array of objects)
        const payload = {
          ...data,
          source: data.id ? undefined : 'manual' // Mark as manual if new
        }

        const results = await sportSettingsRepository.upsertSettings(userId, [payload])
        const updated = results[0]

        if (!updated) {
          return { error: 'Failed to update sport settings: no result returned' }
        }

        return {
          success: true,
          message: `Sport profile "${updated.name}" updated successfully.`,
          profile: {
            id: updated.id,
            name: updated.name,
            ftp: updated.ftp,
            max_hr: updated.maxHr
          }
        }
      } catch (e: any) {
        return { error: `Failed to update sport settings: ${e.message}` }
      }
    }
  })
})
