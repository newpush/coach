import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!session?.user?.email) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  try {
    // Get user with cached profile data
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        name: true,
        country: true,
        ftp: true,
        weight: true,
        maxHr: true,
        restingHr: true,
        lthr: true,
        dob: true,
        hrZones: true
      }
    })

    if (!user) {
      throw createError({
        statusCode: 404,
        message: 'User not found'
      })
    }

    // Query the most recent wellness data available with actual values
    const wellness = await prisma.wellness.findFirst({
      where: {
        userId: user.id,
        restingHr: { not: null }
      },
      orderBy: { date: 'desc' },
      select: {
        date: true,
        restingHr: true,
        hrv: true,
        weight: true,
        readiness: true,
        sleepHours: true,
        recoveryScore: true
      }
    })

    // Also check DailyMetric as fallback
    const dailyMetric = await prisma.dailyMetric.findFirst({
      where: {
        userId: user.id,
        restingHr: { not: null }
      },
      orderBy: { date: 'desc' },
      select: {
        date: true,
        restingHr: true,
        hrv: true,
        sleepScore: true,
        hoursSlept: true
      }
    })

    // Determine which record is more recent or use Wellness as primary
    let wellnessData = null
    let wellnessDate = null

    if (wellness && dailyMetric) {
      // If we have both, take the more recent one
      if (new Date(wellness.date).getTime() >= new Date(dailyMetric.date).getTime()) {
        wellnessData = wellness
        wellnessDate = wellness.date
      } else {
        // DailyMetric is newer, use that
        wellnessData = {
          date: dailyMetric.date,
          restingHr: dailyMetric.restingHr,
          hrv: dailyMetric.hrv,
          weight: null,
          readiness: null,
          sleepHours: dailyMetric.hoursSlept,
          recoveryScore: dailyMetric.sleepScore
        }
        wellnessDate = dailyMetric.date
      }
    } else if (wellness) {
      wellnessData = wellness
      wellnessDate = wellness.date
    } else if (dailyMetric) {
      wellnessData = {
        date: dailyMetric.date,
        restingHr: dailyMetric.restingHr,
        hrv: dailyMetric.hrv,
        weight: null,
        readiness: null,
        sleepHours: dailyMetric.hoursSlept,
        recoveryScore: dailyMetric.sleepScore
      }
      wellnessDate = dailyMetric.date
    }

    // Calculate age from date of birth
    const calculateAge = (dob: Date): number | null => {
      if (!dob) return null
      const today = new Date()
      let age = today.getFullYear() - dob.getFullYear()
      const monthDiff = today.getMonth() - dob.getMonth()
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
        age--
      }
      return age
    }

    const age = user.dob ? calculateAge(user.dob) : null
    const estimatedMaxHR = age ? 220 - age : null

    // Use the wellness data we found
    const recentRestingHR = wellnessData?.restingHr ?? null
    const recentHRV = wellnessData?.hrv ?? null
    const recentWeight = wellnessData?.weight ?? user.weight
    const recentSleep = wellnessData?.sleepHours ?? null
    const recentRecoveryScore = wellnessData?.recoveryScore ?? null
    const latestWellnessDate = wellnessDate

    // Calculate 7-day HRV average if we have wellness data
    let avgRecentHRV = null
    if (wellnessDate) {
      const sevenDaysAgo = new Date(wellnessDate)
      sevenDaysAgo.setDate(wellnessDate.getDate() - 7)

      const weekWellness = await wellnessRepository.getForUser(user.id, {
        startDate: sevenDaysAgo,
        endDate: wellnessDate,
        select: {
          hrv: true
        }
      })

      const hrvValues = weekWellness.map((w) => w.hrv).filter((v) => v != null) as number[]

      if (hrvValues.length > 0) {
        avgRecentHRV = hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length
      }
    }

    // Check if user has any reports
    const reportCount = await prisma.report.count({
      where: {
        userId: user.id,
        status: 'COMPLETED'
      }
    })

    // Get user's integrations
    const integrations = await prisma.integration.findMany({
      where: { userId: user.id },
      select: {
        provider: true,
        lastSyncAt: true
      }
    })

    // Check data sync status for different categories
    const [workoutCount, nutritionCount, wellnessCount] = await Promise.all([
      workoutRepository.count(user.id, { includeDuplicates: true }), // Match original behavior counting all
      nutritionRepository.count(user.id),
      wellnessRepository.count(user.id)
    ])

    // Determine which integrations provide data for each category
    const workoutProviders: string[] = []
    const nutritionProviders: string[] = []
    const wellnessProviders: string[] = []

    for (const integration of integrations) {
      switch (integration.provider) {
        case 'intervals':
          workoutProviders.push('Intervals.icu')
          wellnessProviders.push('Intervals.icu')
          break
        case 'strava':
          workoutProviders.push('Strava')
          break
        case 'yazio':
          nutritionProviders.push('Yazio')
          break
        case 'whoop':
          wellnessProviders.push('Whoop')
          break
      }
    }

    // Identify missing critical fields
    const missingFields: string[] = []
    if (!user.ftp) missingFields.push('Functional Threshold Power (FTP)')
    if (!user.weight) missingFields.push('Weight')
    if (!user.maxHr || !user.restingHr) missingFields.push('Heart Rate Settings (HRR)')
    if (!user.hrZones) missingFields.push('Custom Zones')

    const response = {
      connected: true,
      hasReports: reportCount > 0,
      missingFields,
      dataSyncStatus: {
        workouts: workoutCount > 0,
        nutrition: nutritionCount > 0,
        wellness: wellnessCount > 0,
        workoutCount,
        nutritionCount,
        wellnessCount,
        workoutProviders,
        nutritionProviders,
        wellnessProviders
      },
      profile: {
        name: user.name,
        country: user.country,
        age: age,
        weight: recentWeight,
        ftp: user.ftp,
        restingHr: recentRestingHR,
        maxHr: user.maxHr,
        estimatedMaxHR,
        recentHRV,
        lthr: user.lthr,
        avgRecentHRV: avgRecentHRV ? Math.round(avgRecentHRV * 10) / 10 : null,
        recentSleep,
        recentRecoveryScore,
        latestWellnessDate: latestWellnessDate?.toISOString() ?? null
      }
    }

    return response
  } catch (error) {
    console.error('Error fetching dashboard profile:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to fetch profile data'
    })
  }
})
