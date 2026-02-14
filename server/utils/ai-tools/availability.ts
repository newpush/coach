import { tool } from 'ai'
import { z } from 'zod'
import { availabilityRepository } from '../repositories/availabilityRepository'
import type { AiSettings } from '../ai-user-settings'

export const availabilityTools = (userId: string, aiSettings: AiSettings) => ({
  get_training_availability: tool({
    description:
      "Get user's training availability schedule showing when they can train each day of the week.",
    inputSchema: z.object({}),
    execute: async () => {
      const availability = await availabilityRepository.getFullSchedule(userId)

      if (availability.length === 0) {
        return {
          message: 'No training availability set',
          suggestion: 'Use update_training_availability to set your schedule'
        }
      }

      const dayNames = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday'
      ]

      return {
        availability: availability.map((a) => ({
          day: dayNames[a.dayOfWeek],
          day_of_week: a.dayOfWeek,
          morning: a.morning,
          afternoon: a.afternoon,
          evening: a.evening,
          preferred_types: a.preferredTypes,
          indoor_only: a.indoorOnly,
          outdoor_only: a.outdoorOnly,
          gym_access: a.gymAccess,
          bike_access: a.bikeAccess,
          slots: a.slots,
          notes: a.notes
        }))
      }
    }
  }),

  update_training_availability: tool({
    description:
      "Update the user's training slots for a specific day. Use this when the user wants to change their schedule, add a gym session, or modify their available time.",
    inputSchema: z.object({
      day_of_week: z
        .number()
        .min(0)
        .max(6)
        .describe(
          'Day to update (0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday)'
        ),
      notes: z.string().optional().describe('Additional notes or constraints for the day'),
      slots: z
        .array(
          z.object({
            name: z.string().describe('Name of the slot, e.g., "Morning Run" or "Evening Gym"'),
            startTime: z.string().describe('Start time in HH:mm format'),
            duration: z.number().describe('Duration in minutes'),
            activityTypes: z
              .array(z.string())
              .describe('Types of activities allowed, e.g., ["Run", "Gym"]'),
            gymAccess: z.boolean().describe('Whether gym access is available in THIS slot'),
            bikeAccess: z
              .boolean()
              .describe('Whether bike/trainer access is available in THIS slot'),
            indoorOnly: z.boolean().describe('Whether this specific slot is indoor only')
          })
        )
        .describe(
          'The complete list of training slots for this day. Providing an empty array means a rest day.'
        )
    }),
    needsApproval: async () => aiSettings.aiRequireToolApproval,
    execute: async (args) => {
      const { day_of_week, notes, slots } = args

      try {
        const updateData: any = {
          slots,
          notes: notes !== undefined ? notes : undefined
        }

        // Sync legacy booleans for backward compatibility
        if (slots) {
          updateData.morning = slots.some((s) => {
            const hour = parseInt((s.startTime || '0').split(':')[0] || '0')
            return hour < 12
          })
          updateData.afternoon = slots.some((s) => {
            const hour = parseInt((s.startTime || '0').split(':')[0] || '0')
            return hour >= 12 && hour < 17
          })
          updateData.evening = slots.some((s) => {
            const hour = parseInt((s.startTime || '0').split(':')[0] || '0')
            return hour >= 17
          })
          updateData.gymAccess = slots.some((s) => s.gymAccess)
          updateData.bikeAccess = slots.some((s) => s.bikeAccess)
        }

        const availability = await availabilityRepository.updateDay(userId, day_of_week, updateData)

        const dayNames = [
          'Sunday',
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday'
        ]

        return {
          success: true,
          message: `Updated availability for ${dayNames[day_of_week]}`,
          availability: {
            day: dayNames[availability.dayOfWeek],
            morning: availability.morning,
            afternoon: availability.afternoon,
            evening: availability.evening,
            slots: availability.slots
          }
        }
      } catch (error: any) {
        console.error('Error updating training availability:', error)
        return {
          error: 'Failed to update availability',
          message: error.message
        }
      }
    }
  })
})
