import { prisma } from './db'
import { userRepository } from './repositories/userRepository'

export const altitudeService = {
  /**
   * Infer and update home altitude from a recent outdoor workout.
   * Logic:
   * 1. Check if workout is outdoor (Ride/Run, not Virtual).
   * 2. Check if it has altitude stream data.
   * 3. Get the median altitude of the first 5 minutes (to represent start location).
   * 4. Update user profile if significantly different from current setting.
   */
  async checkAndUpdateHomeAltitude(workoutId: string, userId: string) {
    const workout = await prisma.workout.findUnique({
      where: { id: workoutId },
      include: { streams: true }
    })

    if (!workout || !workout.streams?.altitude) return

    // Filter for outdoor activities
    if (workout.type === 'VirtualRide' || workout.trainer) return
    if (!['Ride', 'Run'].includes(workout.type || '')) return

    const altitudeStream = workout.streams.altitude as number[]
    if (!Array.isArray(altitudeStream) || altitudeStream.length < 60) return

    // Take first 5 minutes (300s) or less
    const startSegment = altitudeStream.slice(0, 300)

    // Calculate median to avoid GPS spikes
    startSegment.sort((a, b) => a - b)
    const medianValue = startSegment[Math.floor(startSegment.length / 2)]
    if (medianValue === undefined || medianValue === null) return

    const medianAltitude = Math.round(medianValue)

    // Get current setting
    const user = (await userRepository.getById(userId)) as any // Casting until schema update
    const currentAltitude = user?.altitude || 0

    // Update if diff > 100m (significant move or travel)
    // We don't want to update for every small variation
    if (Math.abs(medianAltitude - currentAltitude) > 100) {
      console.log(
        `[AltitudeService] Detected new home altitude: ${medianAltitude}m (was ${currentAltitude}m)`
      )

      await prisma.user.update({
        where: { id: userId },
        data: { altitude: medianAltitude } as any
      })
    }
  }
}
