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
    
    // Get recent wellness data from database (last 7 days)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    
    const recentWellness = await prisma.wellness.findMany({
      where: {
        userId: user.id,
        date: {
          gte: sevenDaysAgo
        }
      },
      orderBy: {
        date: 'desc'
      },
      take: 7,
      select: {
        date: true,
        restingHr: true,
        hrv: true,
        weight: true,
        readiness: true
      }
    })
    
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
    
    // Calculate 7-day HRV average
    const hrvValues = recentWellness
      .map(w => w.hrv)
      .filter(v => v != null) as number[]
    const avgRecentHRV = hrvValues.length > 0
      ? hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length
      : null
    
    // Get most recent values
    const mostRecent = recentWellness[0]
    const recentRestingHR = mostRecent?.restingHr ?? recentWellness.find(w => w.restingHr != null)?.restingHr ?? null
    const recentHRV = mostRecent?.hrv ?? recentWellness.find(w => w.hrv != null)?.hrv ?? null
    const recentWeight = mostRecent?.weight ?? user.weight
    
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
    console.log('[Dashboard API] Recent wellness query results:', {
      recordsFound: recentWellness.length,
      mostRecent: mostRecent ? {
        date: mostRecent.date,
        restingHr: mostRecent.restingHr,
        hrv: mostRecent.hrv,
        weight: mostRecent.weight
      } : null,
      extracted: {
        recentRestingHR,
        recentHRV,
        recentWeight
      },
      reportCount
    })
    
    return {
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
        avgRecentHRV: avgRecentHRV ? Math.round(avgRecentHRV * 10) / 10 : null
      }
    }
  } catch (error) {
    console.error('Error fetching dashboard profile:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to fetch profile data'
    })
  }
})