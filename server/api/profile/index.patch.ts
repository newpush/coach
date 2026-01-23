import { getServerSession } from '../../utils/session'
import { z } from 'zod'
import { sportSettingsRepository } from '../../utils/repositories/sportSettingsRepository'

// Validation schema
const profileUpdateSchema = z.object({
  // Basic Settings
  name: z.string().min(2).optional(),
  nickname: z
    .string()
    .max(50)
    .regex(/^[a-zA-Z0-9]*$/, 'Nickname must be alphanumeric')
    .nullable()
    .optional(),
  language: z.string().optional(),
  weight: z.number().nullable().optional(),
  weightUnits: z.enum(['Kilograms', 'Pounds']).optional(),
  height: z.number().nullable().optional(),
  heightUnits: z.enum(['cm', 'ft/in']).optional(),
  distanceUnits: z.enum(['Kilometers', 'Miles']).optional(),
  temperatureUnits: z.enum(['Celsius', 'Fahrenheit']).optional(),
  restingHr: z.number().nullable().optional(),
  maxHr: z.number().nullable().optional(),
  lthr: z.number().nullable().optional(),
  ftp: z.number().nullable().optional(),
  form: z.enum(['Absolute value', 'Percentage']).optional(),
  visibility: z.enum(['Private', 'Public', 'Followers Only']).optional(),
  sex: z.enum(['Male', 'Female', 'Other', 'M', 'F']).optional(),
  dob: z.string().nullable().optional(), // YYYY-MM-DD
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),

  // Deprecated: Custom Zones (handled via Sport Settings now)
  hrZones: z.any().nullable().optional(),
  powerZones: z.any().nullable().optional(),

  // Sport Specific Settings
  sportSettings: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().nullable().optional(),
        types: z.array(z.string()),
        isDefault: z.boolean().optional(),

        // Power
        ftp: z.number().nullable().optional(),
        indoorFtp: z.number().nullable().optional(),
        wPrime: z.number().nullable().optional(),
        powerZones: z.any().optional(),
        eFtp: z.number().nullable().optional(),
        eWPrime: z.number().nullable().optional(),
        pMax: z.number().nullable().optional(),
        ePMax: z.number().nullable().optional(),
        powerSpikeThreshold: z.number().nullable().optional(),
        eftpMinDuration: z.number().nullable().optional(),

        // HR
        lthr: z.number().nullable().optional(),
        maxHr: z.number().nullable().optional(),
        hrZones: z.any().optional(),
        restingHr: z.number().nullable().optional(),
        hrLoadType: z.string().nullable().optional(),

        // Pace
        thresholdPace: z.number().nullable().optional(),

        // General
        warmupTime: z.number().nullable().optional(),
        cooldownTime: z.number().nullable().optional(),
        loadPreference: z.string().nullable().optional(),

        // Metadata
        source: z.string().optional(),
        externalId: z.string().optional()
      })
    )
    .optional()
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!session?.user?.email) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }

  const body = await readBody(event)
  const result = profileUpdateSchema.safeParse(body)

  if (!result.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid input',
      data: (result as any).error.errors
    })
  }

  const data = result.data
  const userEmail = session.user.email

  try {
    // 1. Update User (Basic Settings)
    // Exclude sportSettings from user update
    const { sportSettings, hrZones, powerZones, ...userUpdateData } = data

    // Normalize sex
    if (userUpdateData.sex === 'M') userUpdateData.sex = 'Male'
    if (userUpdateData.sex === 'F') userUpdateData.sex = 'Female'

    // Handle date conversion for DOB
    const updatePayload: any = { ...userUpdateData }
    if (updatePayload.dob) {
      updatePayload.dob = new Date(updatePayload.dob)
    }

    const updatedUser = await prisma.user.update({
      where: { email: userEmail },
      data: updatePayload
    })

    // 2. Update Sport Settings via Repository
    let updatedSettings = []
    if (sportSettings) {
      updatedSettings = await sportSettingsRepository.upsertSettings(updatedUser.id, sportSettings)
    } else {
      // If not updating settings, fetch existing to return consistent response
      updatedSettings = await sportSettingsRepository.getByUserId(updatedUser.id)
    }

    // Helper to format date as YYYY-MM-DD
    const formatDate = (date: Date | null) => {
      if (!date) return null
      return date.toISOString().split('T')[0]
    }

    return {
      success: true,
      profile: {
        ...updatedUser,
        dob: formatDate(updatedUser.dob),
        // Return updated sport settings
        sportSettings: updatedSettings
      }
    }
  } catch (error) {
    console.error('Error updating profile:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update profile'
    })
  }
})
