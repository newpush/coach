import { tool } from 'ai'
import { z } from 'zod'
import { userRepository } from '../repositories/userRepository'

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
  })
})
