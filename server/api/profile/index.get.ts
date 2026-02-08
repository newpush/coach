import { getServerSession } from '../../utils/session'
import { sportSettingsRepository } from '../../utils/repositories/sportSettingsRepository'

defineRouteMeta({
  openAPI: {
    tags: ['Profile'],
    summary: 'Get user profile',
    description: 'Returns the full profile and settings for the authenticated user.',
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                connected: { type: 'boolean' },
                profile: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', nullable: true },
                    nickname: { type: 'string', nullable: true },
                    email: { type: 'string' },
                    ftp: { type: 'integer', nullable: true },
                    maxHr: { type: 'integer', nullable: true },
                    weight: { type: 'number', nullable: true },
                    language: { type: 'string' },
                    distanceUnits: { type: 'string' },
                    city: { type: 'string', nullable: true },
                    country: { type: 'string', nullable: true }
                  }
                }
              }
            }
          }
        }
      },
      401: { description: 'Unauthorized' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!session?.user?.email) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }

  try {
    // Get user by email with all profile fields
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        name: true,
        nickname: true,
        email: true,
        ftp: true,
        maxHr: true,
        lthr: true,
        weight: true,
        dob: true,
        language: true,
        weightUnits: true,
        height: true,
        heightUnits: true,
        distanceUnits: true,
        temperatureUnits: true,
        restingHr: true,
        form: true,
        visibility: true,
        sex: true,
        city: true,
        state: true,
        country: true,
        timezone: true,
        currencyPreference: true
      }
    })

    if (!user) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found'
      })
    }

    // Get Sport Settings via Repository (handles Default lazy creation)
    const sportSettings = await sportSettingsRepository.getByUserId(user.id)
    const defaultProfile = sportSettings.find((s) => s.isDefault)

    // Helper to format date as YYYY-MM-DD
    const formatDate = (date: Date | null) => {
      if (!date) return null
      return date.toISOString().split('T')[0]
    }

    // Transform to match frontend expectation
    return {
      connected: true, // Assuming if we have user data we are "connected" to the app
      profile: {
        name: user.name,
        nickname: user.nickname,
        email: user.email,
        language: user.language || 'English',
        weight: user.weight,
        weightUnits: user.weightUnits || 'Kilograms',
        height: user.height,
        heightUnits: user.heightUnits || 'cm',
        distanceUnits: user.distanceUnits || 'Kilometers',
        temperatureUnits: user.temperatureUnits || 'Celsius',
        restingHr: defaultProfile?.restingHr || user.restingHr,
        maxHr: defaultProfile?.maxHr || user.maxHr,
        lthr: defaultProfile?.lthr || user.lthr,
        ftp: defaultProfile?.ftp || user.ftp,
        visibility: user.visibility || 'Private',
        sex: user.sex,
        dob: formatDate(user.dob),
        city: user.city,
        state: user.state,
        country: user.country,
        timezone: user.timezone,
        currencyPreference: user.currencyPreference,
        sportSettings: sportSettings
      }
    }
  } catch (error) {
    console.error('Error fetching profile:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch profile'
    })
  }
})
