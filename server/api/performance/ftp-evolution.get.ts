import { defineEventHandler, getQuery, createError } from 'h3'
import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'
import { userRepository } from '../../utils/repositories/userRepository'
import { workoutRepository } from '../../utils/repositories/workoutRepository'
import { getUserTimezone, getStartOfYearUTC } from '../../utils/date'

defineRouteMeta({
  openAPI: {
    tags: ['Performance'],
    summary: 'Get FTP evolution',
    description: 'Returns the history of Functional Threshold Power changes.',
    parameters: [
      {
        name: 'months',
        in: 'query',
        schema: { type: ['integer', 'string'], default: 12 }
      }
    ],
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      date: { type: 'string', format: 'date-time' },
                      month: { type: 'string' },
                      ftp: { type: 'integer' },
                      title: { type: 'string' }
                    }
                  }
                },
                summary: {
                  type: 'object',
                  properties: {
                    currentFTP: { type: 'integer', nullable: true },
                    startingFTP: { type: 'integer', nullable: true },
                    peakFTP: { type: 'integer', nullable: true },
                    improvement: { type: 'number', nullable: true },
                    dataPoints: { type: 'integer' }
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
      message: 'Unauthorized'
    })
  }

  const query = getQuery(event)
  const userId = (session.user as any).id

  // Get user
  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  })

  if (!user) {
    throw createError({
      statusCode: 404,
      message: 'User not found'
    })
  }

  // Calculate date range
  const endDate = new Date()
  let startDate = new Date()

  if (query.months === 'YTD') {
    const timezone = await getUserTimezone(userId)
    startDate = getStartOfYearUTC(timezone)
  } else {
    const months = parseInt(query.months as string) || 12
    startDate.setMonth(startDate.getMonth() - months)
  }

  // Get workouts with FTP data, ordered by date
  // This gives us "snapshots" of FTP changes over time
  const workouts = await workoutRepository.getForUser(user.id, {
    startDate,
    endDate,
    where: {
      ftp: {
        not: null
      }
    },
    select: {
      id: true,
      date: true,
      title: true,
      type: true,
      ftp: true
    },
    orderBy: {
      date: 'asc'
    }
  })

  // Reconstruct history
  // We combine current FTP (most authoritative for "now") with historical snapshots

  const ftpByMonth = new Map<string, { date: Date; ftp: number; title: string }>()

  // 1. Process historical data points
  workouts.forEach((workout) => {
    if (!workout.ftp) return

    const monthKey = new Date(workout.date).toISOString().slice(0, 7) // YYYY-MM
    const existing = ftpByMonth.get(monthKey)

    // Keep the most recent FTP value for each month
    if (!existing || new Date(workout.date) > existing.date) {
      ftpByMonth.set(monthKey, {
        date: new Date(workout.date),
        ftp: workout.ftp,
        title: workout.title
      })
    }
  })

  // 2. Add "Current" state if not covered by recent workout
  // This handles the case where user manually updated FTP in settings but hasn't done a workout yet with it
  if (user.ftp) {
    const currentMonthKey = new Date().toISOString().slice(0, 7)
    const existing = ftpByMonth.get(currentMonthKey)

    // If the latest workout FTP is different from User Profile FTP, it means the profile was likely updated manually
    // So we treat the User Profile FTP as the latest data point
    if (!existing || existing.ftp !== user.ftp) {
      ftpByMonth.set(currentMonthKey, {
        date: new Date(),
        ftp: user.ftp,
        title: 'Current Setting'
      })
    }
  }

  // Convert to array and sort by date
  const ftpData = Array.from(ftpByMonth.values())
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((item) => ({
      date: item.date,
      month: item.date.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
      ftp: item.ftp,
      title: item.title
    }))

  // Calculate statistics
  // Current FTP is always the profile FTP (source of truth for "Now")
  const lastFtpEntry = ftpData.length > 0 ? ftpData[ftpData.length - 1] : null
  const currentFTP = user.ftp || (lastFtpEntry ? lastFtpEntry.ftp : null)

  // Starting FTP is the first data point in the period
  const firstFtpEntry = ftpData.length > 0 ? ftpData[0] : null
  const startingFTP = firstFtpEntry ? firstFtpEntry.ftp : null

  // Peak is max over the period
  const peakFTP = ftpData.length > 0 ? Math.max(...ftpData.map((d) => d.ftp)) : null

  const improvement =
    startingFTP && currentFTP ? ((currentFTP - startingFTP) / startingFTP) * 100 : null

  return {
    data: ftpData,
    summary: {
      currentFTP,
      startingFTP,
      peakFTP,
      improvement: improvement ? Math.round(improvement * 10) / 10 : null,
      dataPoints: ftpData.length
    }
  }
})
