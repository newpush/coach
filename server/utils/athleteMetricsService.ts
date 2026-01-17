import { prisma } from './db'
import { userRepository } from './repositories/userRepository'
import { calculatePowerZones, calculateHrZones } from './zones'
import { roundToTwoDecimals } from './number'

export const athleteMetricsService = {
  /**
   * Update athlete metrics (FTP, Weight, Max HR) and automatically recalculate zones.
   * This ensures that whenever a core metric changes, the training zones remain valid.
   */
  async updateMetrics(
    userId: string,
    metrics: {
      ftp?: number | null
      weight?: number | null
      maxHr?: number | null
      lthr?: number | null // Optional, if we start tracking this explicitly
      date?: Date // Optional effective date for this update (default: now)
    }
  ) {
    const user = await userRepository.getById(userId)
    if (!user) throw new Error('User not found')

    const updateData: any = {}

    // Process Fields
    if (metrics.ftp !== undefined) updateData.ftp = metrics.ftp
    if (metrics.weight !== undefined && metrics.weight !== null)
      updateData.weight = roundToTwoDecimals(metrics.weight)
    else if (metrics.weight !== undefined) updateData.weight = metrics.weight // Handle explicit null
    if (metrics.maxHr !== undefined) updateData.maxHr = metrics.maxHr

    // 1. Recalculate Power Zones if FTP changed
    if (metrics.ftp) {
      const powerZones = calculatePowerZones(metrics.ftp)
      updateData.powerZones = powerZones
      console.log(
        `[MetricsService] Recalculated Power Zones for user ${userId} based on FTP ${metrics.ftp}W`
      )
    }

    // 2. Recalculate HR Zones if MaxHR changed (or LTHR if we had it)
    if (metrics.maxHr) {
      // We don't have explicit LTHR in DB yet, so we estimate or use MaxHR model
      const lthr = metrics.lthr || (metrics.maxHr ? Math.round(metrics.maxHr * 0.9) : null)
      const hrZones = calculateHrZones(lthr, metrics.maxHr)

      if (hrZones.length > 0) {
        updateData.hrZones = hrZones
        console.log(`[MetricsService] Recalculated HR Zones for user ${userId}`)
      }
    }

    // 3. Persist Updates
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData
    })

    // 4. (Future) Trigger TSS Recalculation for recent workouts?
    // If FTP changes significantly, we might want to flag recent workouts for reprocessing.
    // For now, we'll just log it.
    if (metrics.ftp && user.ftp && Math.abs(metrics.ftp - user.ftp) > 5) {
      console.log(
        `[MetricsService] FTP changed significantly (${user.ftp} -> ${metrics.ftp}). Consider reprocessing recent workouts.`
      )
    }

    // 5. Weight History
    // If weight changed, log it to the Wellness table for history tracking
    if (metrics.weight !== undefined && metrics.weight !== null) {
      const effectiveDate = metrics.date || new Date()
      // Normalize to YYYY-MM-DD for storage (Wellness is daily)
      const dateOnly = new Date(effectiveDate)
      dateOnly.setUTCHours(0, 0, 0, 0)

      const roundedWeight = roundToTwoDecimals(metrics.weight)

      try {
        await prisma.wellness.upsert({
          where: {
            userId_date: {
              userId,
              date: dateOnly
            }
          },
          create: {
            userId,
            date: dateOnly,
            weight: roundedWeight
          },
          update: {
            weight: roundedWeight
          }
        })
        console.log(
          `[MetricsService] Logged weight ${roundedWeight}kg to Wellness history for ${dateOnly.toISOString()}`
        )
      } catch (e) {
        console.error(`[MetricsService] Failed to log weight history:`, e)
      }
    }

    return updatedUser
  },

  /**
   * Get the current effective zones for an athlete
   */
  async getCurrentZones(userId: string) {
    const user = await userRepository.getById(userId)
    if (!user) return null

    return {
      power: user.powerZones,
      hr: user.hrZones
    }
  }
}
