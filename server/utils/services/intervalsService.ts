import { prisma } from '../db'
import {
  fetchIntervalsWorkouts,
  fetchIntervalsWellness,
  fetchIntervalsPlannedWorkouts,
  normalizeIntervalsWorkout,
  normalizeIntervalsWellness,
  normalizeIntervalsPlannedWorkout,
  fetchIntervalsActivityStreams
} from '../intervals'
import { workoutRepository } from '../repositories/workoutRepository'
import { wellnessRepository } from '../repositories/wellnessRepository'
import { eventRepository } from '../repositories/eventRepository'
import { normalizeTSS } from '../normalize-tss'
import { calculateWorkoutStress } from '../calculate-workout-stress'
import { getUserTimezone, getEndOfDayUTC, getStartOfDayUTC } from '../date'
import { tasks } from '@trigger.dev/sdk/v3'
import { userIngestionQueue } from '../../../trigger/queues'
import {
  calculateLapSplits,
  calculatePaceVariability,
  calculateAveragePace,
  analyzePacingStrategy,
  detectSurges
} from '../pacing'

export const IntervalsService = {
  /**
   * Sync activities for a user within a given date range.
   */
  async syncActivities(userId: string, startDate: Date, endDate: Date) {
    const integration = await prisma.integration.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: 'intervals'
        }
      }
    })

    if (!integration) {
      throw new Error(`Intervals integration not found for user ${userId}`)
    }

    // Calculate 'now' to cap historical data fetching
    const timezone = await getUserTimezone(userId)
    const now = new Date()
    const historicalEndLocal = getEndOfDayUTC(timezone, now)
    const historicalEnd = endDate > historicalEndLocal ? historicalEndLocal : endDate

    const allActivities = await fetchIntervalsWorkouts(integration, startDate, historicalEnd)

    // Filter out incomplete Strava activities and Notes/Holidays
    const activities = allActivities.filter((activity) => {
      // Filter out Notes and Holidays
      if (['Note', 'Holiday'].includes(activity.type)) {
        return false
      }

      const isIncompleteStrava =
        activity.source === 'STRAVA' && activity._note?.includes('not available via the API')
      if (isIncompleteStrava) {
        return false
      }
      return true
    })

    let upsertedCount = 0

    for (const activity of activities) {
      const workout = normalizeIntervalsWorkout(activity, userId)

      const upsertedWorkout = await workoutRepository.upsert(
        userId,
        'intervals',
        workout.externalId,
        workout,
        workout
      )
      upsertedCount++

      // Normalize TSS
      try {
        const tssResult = await normalizeTSS(upsertedWorkout.id, userId)
        if (tssResult.tss !== null) {
          await calculateWorkoutStress(upsertedWorkout.id, userId)
        }
      } catch (error) {
        console.error(
          `[IntervalsService] Failed to normalize TSS for workout ${upsertedWorkout.id}`,
          error
        )
      }

      // Sync stream data if available
      if (activity.stream_types && activity.stream_types.length > 0) {
        try {
          await IntervalsService.syncActivityStream(userId, upsertedWorkout.id, activity.id)
        } catch (error) {
          console.error(
            `[IntervalsService] Failed to sync stream for workout ${upsertedWorkout.id}`,
            error
          )
        }
      }
    }

    return upsertedCount
  },

  /**
   * Sync activity stream data including pacing metrics.
   */
  async syncActivityStream(userId: string, workoutId: string, activityId: string) {
    // Get Intervals integration
    const integration = await prisma.integration.findFirst({
      where: {
        userId: userId,
        provider: 'intervals'
      }
    })

    if (!integration) {
      throw new Error('Intervals.icu integration not found')
    }

    // Fetch streams from Intervals.icu API
    const streams = await fetchIntervalsActivityStreams(integration, activityId)

    // Check if we got any stream data
    if (
      !streams.time ||
      !streams.time.data ||
      (Array.isArray(streams.time.data) && streams.time.data.length === 0)
    ) {
      return null
    }

    const dataPoints = (streams.time.data as any[]).length

    // Extract data arrays
    const timeData = (streams.time?.data as number[]) || []
    const distanceData = (streams.distance?.data as number[]) || []
    const velocityData = (streams.velocity?.data as number[]) || []
    const heartrateData = (streams.heartrate?.data as number[]) || null
    const cadenceData = (streams.cadence?.data as number[]) || null
    const wattsData = (streams.watts?.data as number[]) || null
    const altitudeData = (streams.altitude?.data as number[]) || null
    const latlngData = (streams.latlng?.data as [number, number][]) || null
    const gradeData = (streams.grade?.data as number[]) || null
    const movingData = (streams.moving?.data as boolean[]) || null

    // New streams (2026-01-13)
    const torqueData = (streams.torque?.data as number[]) || null
    const tempData = (streams.temp?.data as number[]) || null
    const respirationData = (streams.respiration?.data as number[]) || null
    const hrvData = (streams.hrv?.data as number[]) || null
    const leftRightBalanceData = (streams.left_right_balance?.data as number[]) || null

    // Calculate pacing metrics
    let lapSplits = null
    let paceVariability = null
    let avgPacePerKm = null
    let pacingStrategy = null
    let surges = null

    if (timeData.length > 0 && distanceData.length > 0) {
      // Calculate lap splits (1km intervals)
      lapSplits = calculateLapSplits(timeData, distanceData, 1000)

      // Calculate pace variability
      if (velocityData.length > 0) {
        paceVariability = calculatePaceVariability(velocityData)

        // Calculate average pace
        const lastTime = timeData[timeData.length - 1]
        const lastDist = distanceData[distanceData.length - 1]
        if (lastTime !== undefined && lastDist !== undefined) {
          avgPacePerKm = calculateAveragePace(lastTime, lastDist)
        }
      }

      // Analyze pacing strategy
      if (lapSplits && lapSplits.length >= 2) {
        pacingStrategy = analyzePacingStrategy(lapSplits)
      }

      // Detect surges
      if (velocityData.length > 20 && timeData.length > 20) {
        surges = detectSurges(velocityData, timeData)
      }
    }

    // Store in database
    const workoutStream = await prisma.workoutStream.upsert({
      where: { workoutId: workoutId },
      create: {
        workoutId: workoutId,
        time: timeData,
        distance: distanceData,
        velocity: velocityData,
        heartrate: heartrateData,
        cadence: cadenceData,
        watts: wattsData,
        altitude: altitudeData,
        latlng: latlngData as any,
        grade: gradeData,
        moving: movingData,
        torque: torqueData as any,
        temp: tempData as any,
        respiration: respirationData as any,
        hrv: hrvData as any,
        leftRightBalance: leftRightBalanceData as any,
        lapSplits: lapSplits as any,
        paceVariability,
        avgPacePerKm,
        pacingStrategy: pacingStrategy as any,
        surges: surges as any
      },
      update: {
        time: timeData,
        distance: distanceData,
        velocity: velocityData,
        heartrate: heartrateData,
        cadence: cadenceData,
        watts: wattsData,
        altitude: altitudeData,
        latlng: latlngData as any,
        grade: gradeData,
        moving: movingData,
        torque: torqueData as any,
        temp: tempData as any,
        respiration: respirationData as any,
        hrv: hrvData as any,
        leftRightBalance: leftRightBalanceData as any,
        lapSplits: lapSplits as any,
        paceVariability,
        avgPacePerKm,
        pacingStrategy: pacingStrategy as any,
        surges: surges as any,
        updatedAt: new Date()
      }
    })

    return workoutStream
  },

  /**
   * Sync wellness data for a user within a given date range.
   */
  async syncWellness(userId: string, startDate: Date, endDate: Date) {
    const integration = await prisma.integration.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: 'intervals'
        }
      }
    })

    if (!integration) {
      throw new Error(`Intervals integration not found for user ${userId}`)
    }

    const timezone = await getUserTimezone(userId)
    const now = new Date()
    const historicalEndLocal = getEndOfDayUTC(timezone, now)
    const historicalEnd = endDate > historicalEndLocal ? historicalEndLocal : endDate

    const wellnessData = await fetchIntervalsWellness(integration, startDate, historicalEnd)

    let upsertedCount = 0
    for (const wellness of wellnessData) {
      // Force wellness date to UTC midnight (Intervals.icu returns 'YYYY-MM-DD' as id)
      // This prevents timezone-based shifting when converting to Date object
      const rawDate = new Date(wellness.id)
      const wellnessDate = new Date(
        Date.UTC(rawDate.getUTCFullYear(), rawDate.getUTCMonth(), rawDate.getUTCDate())
      )

      const normalizedWellness = normalizeIntervalsWellness(wellness, userId, wellnessDate)

      await wellnessRepository.upsert(userId, wellnessDate, normalizedWellness, normalizedWellness)
      upsertedCount++
    }

    return upsertedCount
  },

  /**
   * Sync planned workouts and events for a user within a given date range.
   */
  async syncPlannedWorkouts(userId: string, startDate: Date, endDate: Date) {
    const integration = await prisma.integration.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: 'intervals'
        }
      }
    })

    if (!integration) {
      throw new Error(`Intervals integration not found for user ${userId}`)
    }

    const plannedWorkouts = await fetchIntervalsPlannedWorkouts(integration, startDate, endDate)

    let plannedUpserted = 0
    let eventsUpserted = 0

    for (const planned of plannedWorkouts) {
      // Filter out Notes, Holidays, Sick, Injured, and Season Start events
      if (
        ['NOTE', 'HOLIDAY', 'SICK', 'INJURED', 'SEASON_START'].includes(planned.category || '') ||
        ['Note', 'Holiday'].includes(planned.type || '')
      ) {
        continue
      }

      const normalizedPlanned = normalizeIntervalsPlannedWorkout(planned, userId)

      await prisma.plannedWorkout.upsert({
        where: {
          userId_externalId: {
            userId,
            externalId: normalizedPlanned.externalId
          }
        },
        update: normalizedPlanned,
        create: normalizedPlanned
      })
      plannedUpserted++

      if (planned.category === 'EVENT') {
        let startTime = null
        if (planned.start_date_local && planned.start_date_local.includes('T')) {
          const timePart = planned.start_date_local.split('T')[1]
          if (timePart && timePart.length >= 5) {
            startTime = timePart.substring(0, 5)
          }
        }

        const eventData = {
          title: planned.title,
          description: planned.description || '',
          date: new Date(planned.start_date_local),
          startTime,
          type: planned.type || 'Other',
          isVirtual: false,
          isPublic: false,
          distance: normalizedPlanned.distanceMeters
            ? Math.round(normalizedPlanned.distanceMeters / 1000)
            : null,
          expectedDuration: normalizedPlanned.durationSec
            ? parseFloat((normalizedPlanned.durationSec / 3600).toFixed(1))
            : null,
          location: planned.location || null
        }

        await eventRepository.upsertExternal(userId, 'intervals', planned.id.toString(), eventData)
        eventsUpserted++
      }
    }

    return { plannedWorkouts: plannedUpserted, events: eventsUpserted }
  },

  /**
   * Handle activity deletion.
   */
  async deleteActivity(userId: string, activityId: string) {
    await prisma.workout.deleteMany({
      where: {
        userId,
        source: 'intervals',
        externalId: activityId
      }
    })
  },

  /**
   * Handle planned workout/event deletion.
   */
  async deletePlannedWorkouts(userId: string, externalIds: string[]) {
    await prisma.plannedWorkout.deleteMany({
      where: {
        userId,
        externalId: { in: externalIds }
      }
    })

    await prisma.event.deleteMany({
      where: {
        userId,
        source: 'intervals',
        externalId: { in: externalIds }
      }
    })
  },

  /**
   * Process a single webhook event.
   */
  async processWebhookEvent(userId: string, type: string, intervalEvent: any) {
    // Determine sync range
    let startDate: Date
    let endDate: Date = new Date()
    // Cap endDate at end of today (service will handle historical cap logic too)
    endDate.setHours(23, 59, 59, 999)

    switch (type) {
      case 'ACTIVITY_UPLOADED':
      case 'ACTIVITY_ANALYZED':
        // Sync last 2 days
        startDate = new Date()
        startDate.setDate(startDate.getDate() - 2)
        await IntervalsService.syncActivities(userId, startDate, endDate)
        break

      case 'ACTIVITY_UPDATED': {
        const activityDateStr =
          intervalEvent.activity?.start_date_local || intervalEvent.activity?.start_date
        if (activityDateStr) {
          const actDate = new Date(activityDateStr)
          // Fetch user's timezone to calculate correct day range
          const timezone = await getUserTimezone(userId)
          // Sync wider range (previous day to next day in local time)
          const localActDate = getStartOfDayUTC(timezone, actDate)

          startDate = new Date(localActDate)
          startDate.setDate(startDate.getDate() - 1)
          endDate = new Date(localActDate)
          endDate.setDate(endDate.getDate() + 1)
        } else {
          startDate = new Date()
          startDate.setDate(startDate.getDate() - 2)
        }
        await IntervalsService.syncActivities(userId, startDate, endDate)
        break
      }

      case 'WELLNESS_UPDATED':
        startDate = new Date()
        startDate.setDate(startDate.getDate() - 2)
        await IntervalsService.syncWellness(userId, startDate, endDate)
        break

      case 'FITNESS_UPDATED': {
        const records = intervalEvent.records || []
        if (records.length > 0) {
          const dates = records.map((r: any) => new Date(r.id).getTime())
          startDate = new Date(Math.min(...dates))
          endDate = new Date(Math.max(...dates))
        } else {
          startDate = new Date()
          startDate.setDate(startDate.getDate() - 2)
        }
        await IntervalsService.syncWellness(userId, startDate, endDate)
        break
      }

      case 'ACTIVITY_DELETED': {
        const deletedActivityId = intervalEvent.activity?.id || intervalEvent.id
        if (deletedActivityId) {
          await IntervalsService.deleteActivity(userId, deletedActivityId.toString())
        }
        // Sync a brief range to ensure metrics (CTL/ATL) are updated
        startDate = new Date()
        startDate.setDate(startDate.getDate() - 1)
        await IntervalsService.syncActivities(userId, startDate, endDate)
        break
      }

      case 'CALENDAR_UPDATED': {
        const deletedEvents = intervalEvent.deleted_events || []
        if (deletedEvents.length > 0) {
          const deletedIds = deletedEvents.map((id: any) => id.toString())
          await IntervalsService.deletePlannedWorkouts(userId, deletedIds)
        }

        // Sync wider range for calendar
        startDate = new Date()
        startDate.setDate(startDate.getDate() - 3)
        endDate = new Date()
        endDate.setDate(endDate.getDate() + 28)
        await IntervalsService.syncPlannedWorkouts(userId, startDate, endDate)
        break
      }

      default:
        console.log(`[IntervalsService] Unhandled webhook event type: ${type}`)
        return { handled: false, message: `Unhandled event type: ${type}` }
    }
    return { handled: true, message: `Processed ${type}` }
  }
}
