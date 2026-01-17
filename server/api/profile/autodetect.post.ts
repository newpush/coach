import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'
import { athleteMetricsService } from '../../utils/athleteMetricsService'
import { fetchIntervalsAthleteProfile } from '../../utils/intervals'
import { roundToTwoDecimals } from '../../utils/number'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!session?.user?.email) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }

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

    // Check for Intervals.icu integration
    const integration = await prisma.integration.findFirst({
      where: {
        userId: user.id,
        provider: 'intervals'
      }
    })

    if (!integration) {
      return {
        success: false,
        message: 'No supported integration found (Intervals.icu required)'
      }
    }

    // Fetch profile from Intervals.icu
    const intervalsProfile = await fetchIntervalsAthleteProfile(integration)

    // Detect if metrics changed
    const diff: any = {}

    // Basic Metrics
    if (intervalsProfile.ftp && intervalsProfile.ftp !== user.ftp) {
      diff.ftp = intervalsProfile.ftp
    }
    // Map maxHR (Intervals) to maxHr (Prisma)
    if (intervalsProfile.maxHR && intervalsProfile.maxHR !== user.maxHr) {
      diff.maxHr = intervalsProfile.maxHR
    }
    // Map lthr (Intervals) to lthr (Prisma)
    if (intervalsProfile.lthr && intervalsProfile.lthr !== user.lthr) {
      diff.lthr = intervalsProfile.lthr
    }
    if (intervalsProfile.weight && intervalsProfile.weight !== user.weight) {
      diff.weight = roundToTwoDecimals(intervalsProfile.weight)
    }
    // Map restingHR (Intervals) to restingHr (Prisma)
    if (intervalsProfile.restingHR && intervalsProfile.restingHR !== user.restingHr) {
      diff.restingHr = intervalsProfile.restingHR
    }

    // Helper for comparing zones
    const areZonesDifferent = (current: any[], incoming: any[]) => {
      if (!current || !incoming) return true
      if (current.length !== incoming.length) return true

      for (let i = 0; i < current.length; i++) {
        const c = current[i]
        const n = incoming[i]

        // Compare essential fields (min, max, name)
        if (c.min !== n.min || c.max !== n.max || c.name !== n.name) {
          return true
        }
      }
      return false
    }

    // Zones Comparison
    if (intervalsProfile.hrZones) {
      const currentHrZones = (user.hrZones as any[]) || []
      const newHrZones = intervalsProfile.hrZones as any[]

      if (areZonesDifferent(currentHrZones, newHrZones)) {
        diff.hrZones = newHrZones
      }
    }

    if (intervalsProfile.powerZones) {
      const currentPowerZones = (user.powerZones as any[]) || []
      const newPowerZones = intervalsProfile.powerZones as any[]

      if (areZonesDifferent(currentPowerZones, newPowerZones)) {
        diff.powerZones = newPowerZones
      }
    }

    // LTHR (not stored directly on User but useful to return or map if we add it later)
    // For now we ignore it unless we add lthr to User schema

    // If no differences
    if (Object.keys(diff).length === 0) {
      return {
        success: true,
        message: 'No new data found from Intervals.icu',
        updates: {}, // Backward compatibility
        diff: {},
        current: user,
        detected: intervalsProfile
      }
    }

    return {
      success: true,
      message: 'Differences detected from Intervals.icu',
      updates: diff, // Backward compatibility
      diff,
      current: user,
      detected: intervalsProfile
    }
  } catch (error: any) {
    console.error('Error autodetecting profile:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to autodetect profile',
      message: error.message
    })
  }
})
