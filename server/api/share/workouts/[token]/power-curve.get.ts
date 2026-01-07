import { defineEventHandler, createError, getRouterParam } from 'h3'
import { prisma } from '../../../../utils/db'

defineRouteMeta({
  openAPI: {
    tags: ['Public'],
    summary: 'Get public power curve',
    description: 'Calculates the power curve for a publicly shared workout.',
    parameters: [
      {
        name: 'token',
        in: 'path',
        required: true,
        schema: { type: 'string' }
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
                hasPowerData: { type: 'boolean' },
                powerCurve: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      duration: { type: 'integer' },
                      power: { type: 'number' }
                    }
                  }
                },
                summary: {
                  type: 'object',
                  properties: {
                    peak5s: { type: 'number' },
                    peak20min: { type: 'number' },
                    estimatedFTP: { type: 'number', nullable: true }
                  }
                }
              }
            }
          }
        }
      },
      404: { description: 'Workout not found or link invalid' }
    }
  }
})

// Standard power curve durations in seconds
const DURATIONS = [5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600]

/**
 * Calculate best average power for a given duration from power stream
 */
function calculateBestPowerForDuration(powerData: number[], duration: number): number {
  if (!powerData || powerData.length === 0) return 0

  let maxAvg = 0

  // Use sliding window to find best average
  for (let i = 0; i <= powerData.length - duration; i++) {
    const window = powerData.slice(i, i + duration)
    const avg = window.reduce((sum, p) => sum + p, 0) / duration
    maxAvg = Math.max(maxAvg, avg)
  }

  return Math.round(maxAvg)
}

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) {
    throw createError({
      statusCode: 400,
      message: 'Share token is required'
    })
  }

  // Find the share token
  const shareToken = await prisma.shareToken.findUnique({
    where: { token }
  })

  if (!shareToken || shareToken.resourceType !== 'WORKOUT') {
    throw createError({
      statusCode: 404,
      message: 'Workout not found or link is invalid'
    })
  }

  // Check for expiration
  if (shareToken.expiresAt && new Date() > new Date(shareToken.expiresAt)) {
    throw createError({
      statusCode: 404,
      message: 'Share link has expired'
    })
  }

  // Get workout with streams by ID
  const workout = await (prisma as any).workout.findUnique({
    where: {
      id: shareToken.resourceId
    },
    include: {
      streams: true,
      user: {
        select: {
          ftp: true
        }
      }
    }
  })

  if (!workout) {
    throw createError({
      statusCode: 404,
      message: 'Workout not found'
    })
  }

  // Check if workout has power data
  // Note: workout.streams is available due to include: { streams: true }
  const streams = (workout as any).streams
  if (!streams?.watts) {
    return {
      hasPowerData: false,
      message: 'No power data available for this workout'
    }
  }

  // Parse power data
  const powerData = streams.watts as number[]

  if (!Array.isArray(powerData) || powerData.length === 0) {
    return {
      hasPowerData: false,
      message: 'Invalid power data format'
    }
  }

  // Calculate power curve for each duration
  const powerCurve = DURATIONS.map((duration) => {
    const power = calculateBestPowerForDuration(powerData, duration)
    return {
      duration,
      durationLabel: formatDuration(duration),
      power
    }
  }).filter((point) => point.power > 0)

  // Calculate summary stats
  const peak5s = powerCurve.find((p) => p.duration === 5)?.power || 0
  const peak1min = powerCurve.find((p) => p.duration === 60)?.power || 0
  const peak5min = powerCurve.find((p) => p.duration === 300)?.power || 0
  const peak20min = powerCurve.find((p) => p.duration === 1200)?.power || 0

  // Estimate FTP from 20min power (typically 95% of 20min power)
  const estimatedFTP = peak20min > 0 ? Math.round(peak20min * 0.95) : null

  return {
    hasPowerData: true,
    powerCurve,
    summary: {
      peak5s,
      peak1min,
      peak5min,
      peak20min,
      estimatedFTP,
      currentFTP: workout.ftp || (workout as any).user?.ftp || null
    }
  }
})

/**
 * Format duration in seconds to human-readable string
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  return `${Math.floor(seconds / 3600)}h`
}
