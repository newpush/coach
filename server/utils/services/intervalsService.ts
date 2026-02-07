import { prisma } from '../db'
import {
  fetchIntervalsAthleteProfile,
  fetchIntervalsWorkouts,
  fetchIntervalsActivity,
  fetchIntervalsWellness,
  fetchIntervalsPlannedWorkouts,
  normalizeIntervalsWorkout,
  normalizeIntervalsWellness,
  normalizeIntervalsPlannedWorkout,
  normalizeIntervalsCalendarNote,
  fetchIntervalsActivityStreams,
  fetchIntervalsAthlete
} from '../intervals'
import { workoutRepository } from '../repositories/workoutRepository'
import { wellnessRepository } from '../repositories/wellnessRepository'
import { eventRepository } from '../repositories/eventRepository'
import { calendarNoteRepository } from '../repositories/calendarNoteRepository'
import { sportSettingsRepository } from '../repositories/sportSettingsRepository'
import { athleteMetricsService } from '../athleteMetricsService'
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
import { getZoneIndex, DEFAULT_HR_ZONES, DEFAULT_POWER_ZONES } from '../training-metrics'
import { triggerReadinessCheckIfNeeded } from './wellness-analysis'
import { deduplicateWorkoutsTask } from '../../../trigger/deduplicate-workouts'

export const IntervalsService = {
  /**
   * Get athlete profile from Intervals.icu
   */
  async getAthlete(accessToken: string, athleteId: string) {
    return await fetchIntervalsAthlete(accessToken, athleteId)
  },

  /**
   * Get normalized athlete profile from Intervals.icu
   */
  async getAthleteProfile(integration: any) {
    return await fetchIntervalsAthleteProfile(integration)
  },

  /**
   * Sync athlete profile settings (Basic + Sports)
   */
  async syncProfile(userId: string) {
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

    const profile = await fetchIntervalsAthleteProfile(integration)

    // Update Basic Settings via Service to sync goals/zones
    await athleteMetricsService.updateMetrics(userId, {
      weight: profile.weight,
      maxHr: profile.maxHR,
      lthr: profile.lthr,
      ftp: profile.ftp
    })

    // Update restingHr if available (not currently in updateMetrics)
    if (profile.restingHR) {
      await prisma.user.update({
        where: { id: userId },
        data: { restingHr: profile.restingHR }
      })
    }

    // Update Sport Settings using Repository
    if (profile.sportSettings && profile.sportSettings.length > 0) {
      await sportSettingsRepository.upsertSettings(userId, profile.sportSettings)
    }

    return profile
  },

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

    if (!integration.ingestWorkouts) {
      console.log(
        `[Intervals Sync] ⏭️ Skipping activity sync for user ${userId} (ingestWorkouts disabled)`
      )
      return 0
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

    for (const summaryActivity of activities) {
      // Fetch detailed activity data to get icu_intervals and other granular fields
      let activity = summaryActivity
      try {
        activity = await fetchIntervalsActivity(integration, summaryActivity.id)
      } catch (error) {
        console.warn(
          `[IntervalsService] Failed to fetch detailed activity ${summaryActivity.id}, using summary data. Error: ${error}`
        )
      }

      const workout = normalizeIntervalsWorkout(activity, userId)

      // Link to Planned Workout if paired in Intervals.icu
      if (activity.paired_event_id) {
        const pairedExternalId = String(activity.paired_event_id)
        const plannedWorkout = await prisma.plannedWorkout.findUnique({
          where: {
            userId_externalId: {
              userId,
              externalId: pairedExternalId
            }
          },
          select: { id: true }
        })

        if (plannedWorkout) {
          ;(workout as any).plannedWorkoutId = plannedWorkout.id

          // Mark the planned workout as completed
          await prisma.plannedWorkout.update({
            where: { id: plannedWorkout.id },
            data: {
              completed: true,
              completionStatus: 'COMPLETED'
            }
          })
        }
      }

      const { isNew: workoutIsNew, record: upsertedWorkout } = await workoutRepository.upsert(
        userId,
        'intervals',
        workout.externalId,
        workout,
        workout
      )
      if (workoutIsNew) {
        upsertedCount++
      }

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

    // Calculate Zones
    const defaultProfile = await sportSettingsRepository.getDefault(userId)
    let hrZones: any[] = []
    let powerZones: any[] = []

    if (defaultProfile) {
      hrZones = (defaultProfile.hrZones as any[]) || []
      powerZones = (defaultProfile.powerZones as any[]) || []
    }

    if (hrZones.length === 0 || powerZones.length === 0) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { hrZones: true, powerZones: true }
      })
      if (hrZones.length === 0) hrZones = (user?.hrZones as any[]) || DEFAULT_HR_ZONES
      if (powerZones.length === 0) powerZones = (user?.powerZones as any[]) || DEFAULT_POWER_ZONES
    }

    const hrZoneTimes: number[] | null =
      heartrateData && hrZones.length > 0 ? new Array(hrZones.length).fill(0) : null
    if (hrZoneTimes && heartrateData) {
      for (const hr of heartrateData) {
        if (hr !== null && hr !== undefined) {
          const zoneIndex = getZoneIndex(hr, hrZones)
          if (zoneIndex >= 0) {
            const current = hrZoneTimes[zoneIndex]
            if (current !== undefined) {
              hrZoneTimes[zoneIndex] = current + 1
            }
          }
        }
      }
    }

    const powerZoneTimes: number[] | null =
      wattsData && powerZones.length > 0 ? new Array(powerZones.length).fill(0) : null
    if (powerZoneTimes && wattsData) {
      for (const watts of wattsData) {
        if (watts !== null && watts !== undefined) {
          const zoneIndex = getZoneIndex(watts, powerZones)
          if (zoneIndex >= 0) {
            const current = powerZoneTimes[zoneIndex]
            if (current !== undefined) {
              powerZoneTimes[zoneIndex] = current + 1
            }
          }
        }
      }
    }

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
        hrZoneTimes: hrZoneTimes as any,
        powerZoneTimes: powerZoneTimes as any,
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
        hrZoneTimes: hrZoneTimes as any,
        powerZoneTimes: powerZoneTimes as any,
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
    const settings = integration.settings as any
    const readinessScale = settings?.readinessScale || 'STANDARD'

    let upsertedCount = 0
    for (const wellness of wellnessData) {
      // Force wellness date to UTC midnight (Intervals.icu returns 'YYYY-MM-DD' as id)
      // This prevents timezone-based shifting when converting to Date object
      const rawDate = new Date(wellness.id)
      const wellnessDate = new Date(
        Date.UTC(rawDate.getUTCFullYear(), rawDate.getUTCMonth(), rawDate.getUTCDate())
      )

      const normalizedWellness = normalizeIntervalsWellness(
        wellness,
        userId,
        wellnessDate,
        readinessScale
      )

      const { isNew } = await wellnessRepository.upsert(
        userId,
        wellnessDate,
        normalizedWellness,
        normalizedWellness,
        'intervals'
      )
      if (isNew) {
        upsertedCount++
      }

      // Also update the User profile weight if this is a recent measurement
      const isRecent = new Date().getTime() - wellnessDate.getTime() < 7 * 24 * 60 * 60 * 1000
      if (isRecent && normalizedWellness.weight) {
        await athleteMetricsService.updateMetrics(userId, {
          weight: normalizedWellness.weight,
          date: wellnessDate
        })
      }
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

    const settings = (integration.settings as any) || {}
    const importPlannedWorkouts = settings.importPlannedWorkouts !== false // Default to true

    if (!importPlannedWorkouts) {
      console.log(
        `[Intervals Sync] ⏭️ Skipping planned workout sync for user ${userId} (disabled in settings)`
      )
      return { plannedWorkouts: 0, events: 0, notes: 0 }
    }

    const plannedWorkouts = await fetchIntervalsPlannedWorkouts(integration, startDate, endDate)

    // SMART SYNC RECONCILIATION
    // Remove local items that no longer exist in Intervals (orphans)
    // This handles deletions/moves that missed webhooks
    const validExternalIds = new Set(plannedWorkouts.map((p) => String(p.id)))

    // 1. Find potential orphans in PlannedWorkout
    // Only check items that are marked as SYNCED (or default)
    // Pending/Failed items are local-only or waiting for sync, so we keep them.
    const localWorkouts = await prisma.plannedWorkout.findMany({
      where: {
        userId,
        date: { gte: startDate, lte: endDate },
        OR: [{ syncStatus: 'SYNCED' }, { syncStatus: null }]
      },
      select: { externalId: true, completed: true }
    })

    // Create a set of completed workout IDs to prevent deletion
    const completedWorkoutIds = new Set(
      localWorkouts.filter((w) => w.completed).map((w) => w.externalId!)
    )

    // 2. Find potential orphans in CalendarNote
    const localNotes = await prisma.calendarNote.findMany({
      where: {
        userId,
        startDate: { gte: startDate, lte: endDate },
        source: 'intervals'
      },
      select: { externalId: true }
    })

    // 3. Find potential orphans in Event
    const localEvents = await prisma.event.findMany({
      where: {
        userId,
        date: { gte: startDate, lte: endDate },
        source: 'intervals'
      },
      select: { externalId: true }
    })

    // Collect all local IDs found in this window
    const allLocalIds = new Set([
      ...localWorkouts.map((w) => w.externalId!),
      ...localNotes.map((n) => n.externalId),
      ...localEvents.map((e) => e.externalId!)
    ])

    // Identify orphans (Local IDs NOT present in Remote Response)
    // SAFETY: Only consider numeric IDs as "Intervals IDs".
    // If an ID is non-numeric (e.g. "ai-gen-...", "adhoc-...", or UUID), it is a local workout
    // that hasn't been synced yet, so we MUST NOT delete it.
    const orphans = [...allLocalIds].filter((id) => {
      // If it exists in remote, keep it (not an orphan)
      if (validExternalIds.has(id)) return false

      // SAFETY: Do not delete completed workouts even if they are missing from remote
      // (Intervals often removes completed planned workouts from the calendar)
      if (completedWorkoutIds.has(id)) return false

      // If it's missing from remote, check if it's a local ID
      // Intervals.icu IDs are strictly numeric.
      const isIntervalsId = /^\d+$/.test(id)

      // If it looks like an Intervals ID but is missing, it's a ghost -> Delete (return true)
      // If it's non-numeric, it's local -> Keep (return false)
      return isIntervalsId
    })

    if (orphans.length > 0) {
      console.log(
        `[Intervals Sync] 🧹 Reconciliation: Deleting ${orphans.length} orphaned items (Ghosts) that no longer exist in Intervals.`
      )
      await IntervalsService.deletePlannedWorkouts(userId, orphans)
    }

    // Fetch existing workouts to preserve local structure (exercises) if remote is text-only
    const externalIds = plannedWorkouts.map((p) => String(p.id))
    const existingWorkouts = await prisma.plannedWorkout.findMany({
      where: {
        userId,
        externalId: { in: externalIds }
      },
      select: { externalId: true, structuredWorkout: true }
    })
    const existingMap = new Map(existingWorkouts.map((w) => [w.externalId, w.structuredWorkout]))

    let plannedUpserted = 0
    let eventsUpserted = 0
    let notesUpserted = 0

    for (const planned of plannedWorkouts) {
      // Skip "Weekly" notes which are internal system notes
      if (planned.name === 'Weekly') {
        continue
      }

      const category = planned.category || ''
      const type = planned.type || ''

      // Handle Calendar Notes / Non-Activity Items (Notes, Targets, Holidays, etc.)
      if (
        [
          'NOTE',
          'TARGET',
          'HOLIDAY',
          'SICK',
          'INJURED',
          'SEASON_START',
          'FITNESS_DAYS',
          'SET_EFTP',
          'SET_FITNESS'
        ].includes(category) ||
        ['Note', 'Holiday'].includes(type)
      ) {
        const normalizedNote = normalizeIntervalsCalendarNote(planned, userId)

        await calendarNoteRepository.upsert(
          userId,
          'intervals',
          normalizedNote.externalId,
          normalizedNote
        )
        notesUpserted++

        // Ensure it doesn't exist as a PlannedWorkout or Event (if type changed)
        await prisma.plannedWorkout.deleteMany({
          where: { userId, externalId: normalizedNote.externalId }
        })
        await prisma.event.deleteMany({
          where: { userId, source: 'intervals', externalId: normalizedNote.externalId }
        })
        continue
      }

      const normalizedPlanned = normalizeIntervalsPlannedWorkout(planned, userId)

      // Preserve local exercises/instructions if remote has no structure (Text-only sync)
      const existingStruct = existingMap.get(normalizedPlanned.externalId) as any
      const newStruct = normalizedPlanned.structuredWorkout as any

      if (existingStruct?.exercises?.length > 0) {
        // If new structure is empty or has no exercises (Intervals never sends exercises structure)
        // We restore local exercises. Note: Intervals might send junk 'Rest' steps parsed from description, so we ignore steps check.
        if (!newStruct || !newStruct.exercises?.length) {
          if (!normalizedPlanned.structuredWorkout) normalizedPlanned.structuredWorkout = {}
          const target = normalizedPlanned.structuredWorkout as any

          target.exercises = existingStruct.exercises

          // Also preserve coach instructions if missing
          if (existingStruct.coachInstructions && !target.coachInstructions) {
            target.coachInstructions = existingStruct.coachInstructions
          }
        }
      }

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

      // Ensure it doesn't exist as a CalendarNote (if type changed)
      await calendarNoteRepository.deleteExternal(userId, 'intervals', [
        normalizedPlanned.externalId
      ])

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

    return { plannedWorkouts: plannedUpserted, events: eventsUpserted, notes: notesUpserted }
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

    await calendarNoteRepository.deleteExternal(userId, 'intervals', externalIds)

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
        // Trigger deduplication and analysis
        await deduplicateWorkoutsTask.trigger({ userId, dryRun: false }, { concurrencyKey: userId })
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
        // Trigger deduplication and analysis
        await deduplicateWorkoutsTask.trigger({ userId, dryRun: false }, { concurrencyKey: userId })
        break
      }

      case 'WELLNESS_UPDATED':
        startDate = new Date()
        startDate.setDate(startDate.getDate() - 2)
        await IntervalsService.syncWellness(userId, startDate, endDate)
        // Trigger auto-analysis/recommendation if needed
        await triggerReadinessCheckIfNeeded(userId)
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
        // Trigger auto-analysis/recommendation if needed
        await triggerReadinessCheckIfNeeded(userId)
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
