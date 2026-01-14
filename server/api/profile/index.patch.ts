import { getServerSession } from '../../utils/session'
import { z } from 'zod'
import { prisma } from '../../utils/db'
import { athleteMetricsService } from '../../utils/athleteMetricsService'
import { logAction } from '../../utils/audit'

defineRouteMeta({
  openAPI: {
    tags: ['Profile'],
    summary: 'Update user profile',
    description: 'Updates the profile settings for the authenticated user.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string', nullable: true },
              language: { type: 'string', nullable: true },
              weight: { type: 'number', nullable: true },
              weightUnits: { type: 'string', nullable: true },
              height: { type: 'number', nullable: true },
              heightUnits: { type: 'string', nullable: true },
              distanceUnits: { type: 'string', nullable: true },
              temperatureUnits: { type: 'string', nullable: true },
              restingHr: { type: 'number', nullable: true },
              maxHr: { type: 'number', nullable: true },
              ftp: { type: 'number', nullable: true },
              form: { type: 'string', nullable: true },
              visibility: { type: 'string', nullable: true },
              sex: { type: 'string', nullable: true },
              dob: { type: 'string', format: 'date', nullable: true },
              city: { type: 'string', nullable: true },
              state: { type: 'string', nullable: true },
              country: { type: 'string', nullable: true },
              timezone: { type: 'string', nullable: true }
            }
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                profile: { type: 'object' }
              }
            }
          }
        }
      },
      400: { description: 'Invalid input' },
      401: { description: 'Unauthorized' }
    }
  }
})

const profileSchema = z.object({
  name: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  weight: z.coerce.number().nullable().optional(),
  weightUnits: z.string().nullable().optional(),
  height: z.coerce.number().nullable().optional(),
  heightUnits: z.string().nullable().optional(),
  distanceUnits: z.string().nullable().optional(),
  temperatureUnits: z.string().nullable().optional(),
  restingHr: z.coerce.number().nullable().optional(),
  maxHr: z.coerce.number().nullable().optional(),
  ftp: z.coerce.number().nullable().optional(),
  lthr: z.coerce.number().nullable().optional(),
  form: z.string().optional(),
  visibility: z.string().nullable().optional(),
  sex: z.string().nullable().optional(),
  dob: z.string().nullable().optional(), // Expecting YYYY-MM-DD
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  hrZones: z.any().nullable().optional(),
  powerZones: z.any().nullable().optional()
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
  const result = profileSchema.safeParse(body)

  if (!result.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid input',
      data: result.error.issues
    })
  }

  const data = result.data

  try {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found'
      })
    }

    // Convert dob string to Date object if present
    let dobDate: Date | null | undefined = undefined
    if (data.dob) {
      dobDate = new Date(data.dob)
    } else if (data.dob === null) {
      dobDate = null
    }

    const updateData: any = {
      ...data,
      dob: dobDate
    }

    // Remove dob from spread if it was processed separately to avoid type mismatch if any
    if ('dob' in data) {
      delete updateData.dob
      updateData.dob = dobDate
    }

    // Use AthleteMetricsService if critical metrics are changing
    // This triggers auto-recalculation of zones if FTP or MaxHR changes
    if (data.ftp !== undefined || data.maxHr !== undefined || data.weight !== undefined) {
      await athleteMetricsService.updateMetrics(user.id, {
        ftp: data.ftp,
        maxHr: data.maxHr,
        weight: data.weight
      })

      // Remove these from generic update to avoid double-write
      if (data.ftp !== undefined) delete updateData.ftp
      if (data.maxHr !== undefined) delete updateData.maxHr
      if (data.weight !== undefined) delete updateData.weight
    }

    // Perform standard update for remaining fields
    const updatedUser = await prisma.user.update({
      where: { email: session.user.email },
      data: updateData
    })

    await logAction({
      userId: updatedUser.id,
      action: 'USER_PROFILE_UPDATED',
      resourceType: 'User',
      resourceId: updatedUser.id,
      metadata: { fields: Object.keys(data) },
      event
    })

    return {
      success: true,
      profile: updatedUser
    }
  } catch (error: any) {
    console.error('Error updating profile:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update profile',
      message: error.message
    })
  }
})
