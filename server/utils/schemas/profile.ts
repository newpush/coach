import { z } from 'zod'

export const profileUpdateSchema = z.object({
  // Basic Settings
  name: z.string().min(2).nullable().optional(),
  nickname: z.string().max(50).nullable().optional(),
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
  visibility: z.enum(['Private', 'Public', 'Followers Only']).optional(),
  sex: z.enum(['Male', 'Female', 'Other', 'M', 'F']).nullable().optional(),
  dob: z.string().nullable().optional(), // YYYY-MM-DD
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  currencyPreference: z.string().nullable().optional(),

  // AI Context
  aiContext: z.string().nullable().optional(),

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
