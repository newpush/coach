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
    const recentRestingHR = mostRecent?.restingHr || recentWellness.find(w => w.restingHr)?.restingHr
    const recentHRV = mostRecent?.hrv || recentWellness.find(w => w.hrv)?.hrv
    const recentWeight = mostRecent?.weight || user.weight
    
    return {
      connected: true,
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