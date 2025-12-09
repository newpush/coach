import { getServerSession } from '#auth'
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
        ftp: true,
        weight: true,
        maxHr: true,
        dob: true
      }
    })
    
    if (!user) {
      throw createError({
        statusCode: 404,
        message: 'User not found'
      })
    }
    
    // Query wellness for today's date specifically, working backwards up to 30 days
    const today = new Date()
    today.setHours(0, 0, 0, 0) // Start of today
    
    let wellnessData = null
    let wellnessDate = null
    
    // Try each day going backwards until we find data
    for (let daysBack = 0; daysBack < 30; daysBack++) {
      const checkDate = new Date(today)
      checkDate.setDate(today.getDate() - daysBack)
      
      console.log(`[Dashboard API] Checking wellness for date: ${checkDate.toISOString().split('T')[0]}`)
      
      // Check Wellness table first
      const wellness = await prisma.wellness.findFirst({
        where: {
          userId: user.id,
          date: checkDate
        },
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
      
      // Check if wellness has actual data (not all null)
      if (wellness && (wellness.hrv != null || wellness.restingHr != null || wellness.sleepHours != null || wellness.recoveryScore != null)) {
        console.log(`[Dashboard API] Found wellness data for ${checkDate.toISOString().split('T')[0]}:`, {
          hrv: wellness.hrv,
          restingHr: wellness.restingHr,
          sleepHours: wellness.sleepHours,
          recoveryScore: wellness.recoveryScore,
          weight: wellness.weight
        })
        wellnessData = wellness
        wellnessDate = checkDate
        break
      }
      
      // If Wellness is null or empty, check DailyMetric as fallback
      const dailyMetric = await prisma.dailyMetric.findFirst({
        where: {
          userId: user.id,
          date: checkDate
        },
        select: {
          date: true,
          restingHr: true,
          hrv: true,
          sleepScore: true,
          hoursSlept: true
        }
      })
      
      if (dailyMetric && (dailyMetric.hrv != null || dailyMetric.restingHr != null || dailyMetric.hoursSlept != null)) {
        console.log(`[Dashboard API] Found DailyMetric data for ${checkDate.toISOString().split('T')[0]}:`, {
          hrv: dailyMetric.hrv,
          restingHr: dailyMetric.restingHr,
          hoursSlept: dailyMetric.hoursSlept,
          sleepScore: dailyMetric.sleepScore
        })
        wellnessData = {
          date: dailyMetric.date,
          restingHr: dailyMetric.restingHr,
          hrv: dailyMetric.hrv,
          weight: null,
          readiness: null,
          sleepHours: dailyMetric.hoursSlept,
          recoveryScore: dailyMetric.sleepScore
        }
        wellnessDate = checkDate
        break
      }
    }
    
    console.log('[Dashboard API] Final wellness data found:', wellnessData ? {
      date: wellnessDate?.toISOString().split('T')[0],
      hrv: wellnessData.hrv,
      restingHr: wellnessData.restingHr,
      sleepHours: wellnessData.sleepHours,
      recoveryScore: wellnessData.recoveryScore,
      weight: wellnessData.weight
    } : 'NONE')
    
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
      
      const weekWellness = await prisma.wellness.findMany({
        where: {
          userId: user.id,
          date: {
            gte: sevenDaysAgo,
            lte: wellnessDate
          }
        },
        select: {
          hrv: true
        }
      })
      
      const hrvValues = weekWellness
        .map(w => w.hrv)
        .filter(v => v != null) as number[]
      
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
      prisma.workout.count({ where: { userId: user.id } }),
      prisma.nutrition.count({ where: { userId: user.id } }),
      prisma.wellness.count({ where: { userId: user.id } })
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
    
    // Debug logging
    console.log('[Dashboard API] Extracted wellness values:', {
      recentRestingHR,
      recentHRV,
      avgRecentHRV,
      recentWeight,
      recentSleep,
      recentRecoveryScore,
      latestWellnessDate: latestWellnessDate?.toISOString(),
      reportCount
    })
    
    const response = {
      connected: true,
      hasReports: reportCount > 0,
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
        age: user.dob ? calculateAge(user.dob) : null,
        weight: recentWeight,
        ftp: user.ftp,
        restingHR: recentRestingHR,
        maxHR: user.maxHr,
        recentHRV,
        avgRecentHRV: avgRecentHRV ? Math.round(avgRecentHRV * 10) / 10 : null,
        recentSleep,
        recentRecoveryScore,
        latestWellnessDate: latestWellnessDate?.toISOString() ?? null
      }
    }
    
    console.log('[Dashboard API] Final response profile:', {
      recentSleep: response.profile.recentSleep,
      recentRecoveryScore: response.profile.recentRecoveryScore,
      latestWellnessDate: response.profile.latestWellnessDate
    })
    
    return response
  } catch (error) {
    console.error('Error fetching dashboard profile:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to fetch profile data'
    })
  }
})