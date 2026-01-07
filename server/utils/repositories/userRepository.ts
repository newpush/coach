import { prisma } from '../db'
import type { Prisma } from '@prisma/client'

export const userRepository = {
  /**
   * Get full user details by ID
   */
  async getById(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId }
    })
  },

  /**
   * Get user by email
   */
  async getByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email }
    })
  },

  /**
   * Update user profile data
   */
  async update(userId: string, data: Prisma.UserUpdateInput) {
    return prisma.user.update({
      where: { id: userId },
      data
    })
  },

  /**
   * Get the effective FTP for a user at a specific date.
   * Strategy:
   * 1. Look for a workout on or before the given date that has a recorded FTP.
   * 2. If found, use that workout's FTP (snapshot).
   * 3. If not found (e.g. date is before first workout), use the current user FTP.
   * 4. Fallback to default (e.g. 200W) if nothing is set.
   */
  async getFtpForDate(userId: string, date: Date): Promise<number> {
    // 1. Try to find the most recent workout before or on this date with an FTP
    const workout = await prisma.workout.findFirst({
      where: {
        userId,
        date: { lte: date },
        ftp: { not: null }
      },
      orderBy: { date: 'desc' },
      select: { ftp: true }
    })

    if (workout?.ftp) {
      return workout.ftp
    }

    // 2. Fallback to current user profile FTP
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { ftp: true }
    })

    return user?.ftp || 200 // Default fallback
  },

  /**
   * Get the effective LTHR (Lactate Threshold Heart Rate) for a specific date.
   * Currently maps to maxHr * 0.9 as a rough estimate if not explicitly stored,
   * but ideally we would track LTHR separately.
   */
  async getLthrForDate(userId: string, date: Date): Promise<number | null> {
    // For now, we rely on current Max HR from profile as the anchor,
    // since we don't have LTHR snapshots on workouts yet (schema limitation).
    // TODO: Add lthr to Workout model for snapshots
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { maxHr: true }
    })

    if (user?.maxHr) {
      // Estimate LTHR as ~90% of Max HR for now if not available
      return Math.round(user.maxHr * 0.9)
    }

    return null
  },

  /**
   * Get effective Max HR for a date
   */
  async getMaxHrForDate(userId: string, date: Date): Promise<number | null> {
    // Similar to FTP, we could look for workouts with maxHr data,
    // but Max HR doesn't fluctuate like FTP. Current profile is usually safe.
    // However, for strict historical accuracy, we could look at workouts.
    const workout = await prisma.workout.findFirst({
      where: {
        userId,
        date: { lte: date },
        maxHr: { not: null }
      },
      orderBy: { date: 'desc' },
      select: { maxHr: true }
    })

    if (workout?.maxHr) {
      // Note: Workout maxHr is the max reached in that workout, NOT the user's physiological max.
      // So actually, using workout.maxHr is incorrect for "What was my Max HR setting?".
      // We should stick to the User profile for now unless we add a UserHistory table.
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { maxHr: true }
    })

    return user?.maxHr || null
  },

  /**
   * Get the effective Weight for a user at a specific date.
   * Strategy:
   * 1. Look for a Wellness entry on that exact date.
   * 2. Look for the most recent Wellness entry before that date (within 30 days).
   * 3. Fallback to current User profile weight.
   */
  async getWeightForDate(userId: string, date: Date): Promise<number | null> {
    // 1. Exact date or recent history
    const wellness = await prisma.wellness.findFirst({
      where: {
        userId,
        date: { lte: date },
        weight: { not: null }
      },
      orderBy: { date: 'desc' },
      select: { weight: true }
    })

    if (wellness?.weight) {
      return wellness.weight
    }

    // 2. Fallback to current profile
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { weight: true }
    })

    return user?.weight || null
  },

  /**
   * Get the effective Home Altitude for a user at a specific date.
   * Strategy:
   * 1. Future: Look for a "UserLocationHistory" if we implement it.
   * 2. Current: Fallback to User.altitude (home base).
   * 3. Default: 0 (Sea level).
   */
  async getAltitudeForDate(userId: string, date: Date): Promise<number> {
    // TODO: We could infer this from recent workouts around this date?
    // For now, simpler is better. Use the profile setting.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { altitude: true } as any // Cast to any until client is regenerated
    })

    return (user as any)?.altitude || 0
  }
}
