import { prisma } from '../db'
import { workoutRepository } from '../repositories/workoutRepository'
import { logger } from '@trigger.dev/sdk/v3'

export interface DuplicateGroup {
  workouts: Array<any> // Full workout objects
  bestWorkoutId: string
  toDelete: string[]
}

export const deduplicationService = {
  /**
   * Identifies duplicate groups from a list of workouts.
   */
  findDuplicateGroups(workouts: any[]): DuplicateGroup[] {
    const groups: DuplicateGroup[] = []
    const processed = new Set<string>()

    for (let i = 0; i < workouts.length; i++) {
      if (processed.has(workouts[i].id)) continue

      const workout = workouts[i]
      const duplicates = [workout]
      processed.add(workout.id)

      for (let j = i + 1; j < workouts.length; j++) {
        if (processed.has(workouts[j].id)) continue

        const other = workouts[j]

        if (this.areDuplicates(workout, other)) {
          duplicates.push(other)
          processed.add(other.id)
        }
      }

      if (duplicates.length > 1) {
        // Calculate scores for all duplicates
        const scoredWorkouts = duplicates.map((w) => {
          // Create a copy with the calculated score
          return {
            ...w,
            completenessScore: this.calculateCompletenessScore(w)
          }
        })

        scoredWorkouts.sort((a, b) => b.completenessScore - a.completenessScore)

        const bestWorkout = scoredWorkouts[0]
        const toDelete = scoredWorkouts.slice(1).map((w) => w.id)

        // Filter out groups where all 'toDelete' are ALREADY duplicates of 'bestWorkout'
        // This prevents re-surfacing resolved groups in the UI
        const alreadyResolved = scoredWorkouts
          .slice(1)
          .every((w) => w.isDuplicate && w.duplicateOf === bestWorkout.id)

        if (!alreadyResolved) {
          groups.push({
            workouts: scoredWorkouts,
            bestWorkoutId: bestWorkout.id,
            toDelete
          })
        }
      }
    }

    return groups
  },

  /**
   * Comparison logic to determine if two workouts are duplicates.
   */
  areDuplicates(w1: any, w2: any): boolean {
    // DEBUG: Check for specific problematic pair
    const debugIds = [
      '7f85cbdc-b95e-4d8a-83bc-b97898ca3376',
      '8f679573-1e60-420d-97e3-8a6c0ab88321'
    ]
    const isDebugPair = debugIds.includes(w1.id) && debugIds.includes(w2.id)

    const timeDiff = Math.abs(new Date(w1.date).getTime() - new Date(w2.date).getTime())

    if (isDebugPair) {
      logger.log(`DEBUG COMPARISON: ${w1.title} (${w1.source}) vs ${w2.title} (${w2.source})`, {
        timeDiff,
        w1Date: w1.date,
        w2Date: w2.date,
        w1Dur: w1.durationSec,
        w2Dur: w2.durationSec,
        w1Type: w1.type,
        w2Type: w2.type
      })
    }

    // With corrected UTC timestamps, workouts should be very close in time.
    // However, we've observed issues where different providers (Withings vs Strava)
    // might disagree by large timezone offsets (e.g., 5 hours) if one applies a timezone correction differently.
    // Standard tolerance: 30 minutes
    let maxTimeDiff = 30 * 60 * 1000

    // Check if the time difference is suspiciously close to a full hour multiple (timezone offset issue)
    // e.g., 5 hours = 18000000ms. If diff is 18000000 +/- 30mins, it's likely a timezone shift.
    const diffInHours = timeDiff / (60 * 60 * 1000)
    const diffHoursRemainder = Math.abs(diffInHours - Math.round(diffInHours))

    // If the difference is a multiple of an hour (within 5 mins tolerance) and matches common timezone offsets (1-12 hours)
    // and the workouts are otherwise VERY similar, we might consider them duplicates.
    const isTimezoneShift = diffInHours >= 1 && diffInHours <= 14 && diffHoursRemainder < 5 / 60 // within 5 mins of an hour mark

    if (isTimezoneShift) {
      // Relax the time check if other strong signals exist (same duration, type, etc)
      // We'll let the rest of the logic run, but we need to pass this check first.
      // So we temporarily set maxTimeDiff to cover this shift if we are going to rely on other signals.
      maxTimeDiff = timeDiff + 1000 // Allow it to pass

      if (isDebugPair) {
        logger.log(
          `Detected potential timezone shift between workouts (${diffInHours.toFixed(2)}h)`,
          {
            w1: { id: w1.id, date: w1.date, source: w1.source },
            w2: { id: w2.id, date: w2.date, source: w2.source }
          }
        )
      }
    }

    if (timeDiff > maxTimeDiff) {
      // Only log if they are somewhat close (e.g. within 2 hours) to avoid log spam for unrelated workouts
      if (timeDiff < 2 * 60 * 60 * 1000) {
        // Reduced log spam
      }
      return false
    }

    const durationDiff = Math.abs(w1.durationSec - w2.durationSec)

    // Dynamic duration tolerance based on activity type and closeness of start time
    // For activities like Skiing/Hiking where moving time vs elapsed time varies greatly, be more lenient
    const isPauseHeavy =
      w1.type?.includes('Ski') ||
      w1.type?.includes('Snowboard') ||
      w1.type?.includes('Hike') ||
      w2.type?.includes('Ski') ||
      w2.type?.includes('Snowboard') ||
      w2.type?.includes('Hike')

    let maxDurationDiff = 5 * 60 // Default 5 mins
    const tenPercent = Math.max(w1.durationSec, w2.durationSec) * 0.1
    maxDurationDiff = Math.max(maxDurationDiff, tenPercent)

    // If start times are very close (< 10 mins), relax duration check significantly
    // This handles cases where one device records "moving time" and another "elapsed time"
    if (timeDiff < 10 * 60 * 1000) {
      if (isPauseHeavy) {
        // For skiing, etc., allow up to 90% difference or 60 mins
        maxDurationDiff = Math.max(60 * 60, Math.max(w1.durationSec, w2.durationSec) * 0.9)
      } else {
        // For others, allow 50% difference or 30 mins
        maxDurationDiff = Math.max(30 * 60, Math.max(w1.durationSec, w2.durationSec) * 0.5)
      }
    }

    if (durationDiff > maxDurationDiff) {
      if (isDebugPair) {
        logger.log(`Duration diff too large: ${durationDiff}s (max: ${maxDurationDiff}s)`, {
          w1: { title: w1.title, duration: w1.durationSec, type: w1.type },
          w2: { title: w2.title, duration: w2.durationSec, type: w2.type }
        })
      }
      return false
    }

    const titleSimilar =
      w1.title &&
      w2.title &&
      (w1.title.toLowerCase().includes(w2.title.toLowerCase()) ||
        w2.title.toLowerCase().includes(w1.title.toLowerCase()))

    const typeSimilar =
      w1.type &&
      w2.type &&
      (w1.type.toLowerCase() === w2.type.toLowerCase() ||
        (w1.type.toLowerCase().includes('ride') && w2.type.toLowerCase().includes('ride')) ||
        (w1.type.toLowerCase().includes('run') && w2.type.toLowerCase().includes('run')) ||
        // Gym / Weight training mapping (Strava "Gym" vs Withings "WeightTraining")
        (w1.type.toLowerCase() === 'gym' && w2.type.toLowerCase().includes('weight')) ||
        (w1.type.toLowerCase().includes('weight') && w2.type.toLowerCase() === 'gym'))

    const isDuplicate = titleSimilar || typeSimilar

    if (isDuplicate && isDebugPair) {
      logger.log(`Detected duplicate workouts:`, {
        w1: { title: w1.title, type: w1.type, source: w1.source, date: w1.date },
        w2: { title: w2.title, type: w2.type, source: w2.source, date: w2.date },
        titleSimilar,
        typeSimilar
      })
    }

    return isDuplicate
  },

  /**
   * Calculates a completeness score to determine the "Best" version of a workout.
   */
  calculateCompletenessScore(workout: any): number {
    let score = 0

    // Prefer manual input or specific sources if reliable
    // But generally trust device data more for metrics
    if (workout.source === 'hevy') {
      score += 25 // High trust for Hevy as it has structured exercises
    } else if (workout.source === 'intervals') {
      score += 15 // Increased trust for Intervals.icu as it often aggregates well
    } else if (workout.source === 'strava') {
      score += 10
    } else if (workout.source === 'whoop') {
      score += 10 // Whoop is a high quality source
    } else if (workout.source === 'withings') {
      score += 5
    }

    // Check for structured exercises (strong signal for Hevy/Strength)
    if (workout.exercises && workout.exercises.length > 0) {
      score += 50 // Massive boost for actual exercise data
    }

    const isCycling =
      workout.type?.toLowerCase().includes('ride') || workout.type?.toLowerCase().includes('bike')
    const isGym =
      workout.type?.toLowerCase().includes('gym') ||
      workout.type?.toLowerCase().includes('strength') ||
      workout.type?.toLowerCase().includes('weight')
    const isSwim = workout.type?.toLowerCase().includes('swim')

    if (isCycling) {
      if (workout.averageWatts && workout.averageWatts > 0) {
        score += 40 // Power is king for cycling
        if (workout.source === 'intervals') score += 10
      }
      if (workout.normalizedPower && workout.normalizedPower > 0) score += 10
      if (workout.tss && workout.tss > 0) score += 10
    }

    if (isGym && workout.source === 'strava') {
      score += 20
    }

    // HR Data is valuable for all types
    if (workout.averageHr && workout.averageHr > 0) score += 20
    if (workout.maxHr && workout.maxHr > 0) score += 5

    if (workout.distance && workout.distance > 0) score += 5

    if (workout.elevationGain && workout.elevationGain > 0) score += 5

    // High value for having streams (time-series data)
    if (workout.streams) {
      // Check stream quality if possible (length of data points)
      // We can't easily check length here without casting, but existence is a strong signal
      score += 50
    }

    if (workout.trainingLoad && workout.trainingLoad > 0) score += 10
    if (workout.intensity && workout.intensity > 0) score += 5

    if (workout.calories && workout.calories > 0) score += 3

    if (workout.averageSpeed && workout.averageSpeed > 0) score += 3
    if (workout.maxSpeed && workout.maxSpeed > 0) score += 2
    if (workout.averageCadence && workout.averageCadence > 0) score += 5

    // Description might contain user notes
    if (workout.description && workout.description.length > 5) score += 5

    return score
  },

  /**
   * Find a potential planned workout link for a given workout
   */
  async findProposedLink(workout: any): Promise<any | null> {
    // Try to find a matching planned workout if none exists
    // Get all potential candidates on that day
    const candidates = await prisma.plannedWorkout.findMany({
      where: {
        userId: workout.userId,
        date: workout.date, // Same day match (both are UTC midnight or specific dates)
        completed: false // Only if not already completed
      }
    })

    let matchingPlanned = null

    if (candidates.length === 1) {
      matchingPlanned = candidates[0]
    } else if (candidates.length > 1) {
      // 1. Filter by Type
      const workoutType = (workout.type || '').toLowerCase()

      const typeMatches = candidates.filter((p) => {
        const planType = (p.type || '').toLowerCase()
        // Direct match
        if (planType === workoutType) return true
        // Fuzzy match (Ride vs VirtualRide)
        if (workoutType.includes('ride') && planType.includes('ride')) return true
        if (workoutType.includes('run') && planType.includes('run')) return true
        return false
      })

      if (typeMatches.length === 1) {
        matchingPlanned = typeMatches[0]
      } else if (typeMatches.length > 1) {
        // 2. Tie-break by Duration (if available)
        const withDiff = typeMatches.map((p) => {
          const planDur = p.durationSec || 0
          const actualDur = workout.durationSec || 0
          return { plan: p, diff: Math.abs(planDur - actualDur) }
        })

        // Sort by smallest difference
        withDiff.sort((a, b) => a.diff - b.diff)

        const bestMatch = withDiff[0]
        if (bestMatch) {
          // Pick the closest one
          matchingPlanned = bestMatch.plan

          logger.log(
            `Multiple matching types found. Selected best duration match: ${matchingPlanned.title} (Diff: ${bestMatch.diff}s)`
          )
        }
      } else {
        logger.log(
          `Multiple planned workouts found for ${workout.date.toISOString()} but none matched type '${workout.type}'. Skipping auto-link.`
        )
      }
    }

    return matchingPlanned
  },

  /**
   * Executes the merge logic for a duplicate group.
   */
  async mergeDuplicateGroup(group: DuplicateGroup) {
    if (group.toDelete.length === 0) return { deletedCount: 0, keptCount: 0 }

    const duplicatesToDelete = await prisma.workout.findMany({
      where: { id: { in: group.toDelete } },
      select: { id: true, plannedWorkoutId: true }
    })

    // Collect planned workout IDs from duplicates
    const plannedWorkoutIds = duplicatesToDelete
      .filter((w) => w.plannedWorkoutId)
      .map((w) => w.plannedWorkoutId)

    // Get the best workout
    const bestWorkout = group.workouts.find((w) => w.id === group.bestWorkoutId)

    if (!bestWorkout) return { deletedCount: 0, keptCount: 0 }

    // MERGE LOGIC: Copy missing data from duplicates to best workout
    const updates: any = {}

    // List of fields to check for merging
    const mergeFields = [
      'tss',
      'trainingLoad',
      'intensity',
      'kilojoules',
      'trimp',
      'averageWatts',
      'maxWatts',
      'normalizedPower',
      'weightedAvgWatts',
      'averageHr',
      'maxHr',
      'averageCadence',
      'maxCadence',
      'averageSpeed',
      'maxSpeed',
      'distanceMeters',
      'elevationGain',
      'calories',
      'rpe',
      'feel',
      'description', // If best has no description, take it from duplicate
      'deviceName'
    ]

    const duplicatesList = group.workouts.filter((w) => w.id !== group.bestWorkoutId)

    for (const field of mergeFields) {
      // If best workout is missing this field (null, undefined, or 0 for numbers)
      if (
        bestWorkout[field] === null ||
        bestWorkout[field] === undefined ||
        bestWorkout[field] === 0 ||
        bestWorkout[field] === ''
      ) {
        // Find a duplicate that has this field
        const donor = duplicatesList.find(
          (w) => w[field] !== null && w[field] !== undefined && w[field] !== 0 && w[field] !== ''
        )
        if (donor) {
          updates[field] = donor[field]
          logger.log(
            `Merging field ${field} from duplicate ${donor.id} to primary ${bestWorkout.id}`
          )
        }
      }
    }

    // Special handling for plannedWorkoutId
    if (!bestWorkout.plannedWorkoutId) {
      if (plannedWorkoutIds.length > 0) {
        logger.log(`Transferring planned workout link from duplicate to best workout`, {
          bestWorkoutId: group.bestWorkoutId,
          plannedWorkoutId: plannedWorkoutIds[0]
        })
        updates.plannedWorkoutId = plannedWorkoutIds[0]

        // Mark the planned workout as completed
        await prisma.plannedWorkout.update({
          where: { id: plannedWorkoutIds[0] as string },
          data: {
            completed: true,
            completionStatus: 'COMPLETED'
          }
        })
      } else {
        // Use shared logic to find matching planned workout
        const matchingPlanned = await this.findProposedLink(bestWorkout)

        if (matchingPlanned) {
          logger.log(`Found matching unlinked planned workout for ${bestWorkout.id}`, {
            plannedWorkoutId: matchingPlanned.id,
            title: matchingPlanned.title
          })
          updates.plannedWorkoutId = matchingPlanned.id

          await prisma.plannedWorkout.update({
            where: { id: matchingPlanned.id },
            data: {
              completed: true,
              completionStatus: 'COMPLETED'
            }
          })
        }
      }
    }

    // Stream Transfer Logic
    if (!bestWorkout.streams) {
      const donorWithStreams = duplicatesList.find((w) => w.streams)
      if (donorWithStreams) {
        logger.log(
          `Transferring streams from duplicate ${donorWithStreams.id} to best workout ${bestWorkout.id}`
        )

        // We need to move the stream record to the new workout ID
        // First check if bestWorkout somehow has a stream record (collision protection)
        const existingStream = await prisma.workoutStream.findUnique({
          where: { workoutId: bestWorkout.id }
        })

        if (!existingStream) {
          await prisma.workoutStream.update({
            where: { workoutId: donorWithStreams.id },
            data: { workoutId: bestWorkout.id }
          })
          // Update local state (reference only, doesn't affect DB)
          bestWorkout.streams = donorWithStreams.streams
        }
      }
    }

    // Exercise Transfer Logic
    // If best workout has no exercises, check if a duplicate does and transfer them
    if (!bestWorkout.exercises || bestWorkout.exercises.length === 0) {
      // Find a donor with exercises
      const donorWithExercises = duplicatesList.find((w) => w.exercises && w.exercises.length > 0)
      if (donorWithExercises) {
        logger.log(
          `Transferring exercises from duplicate ${donorWithExercises.id} to best workout ${bestWorkout.id}`
        )

        // Move the exercise records to the new workout ID
        await prisma.workoutExercise.updateMany({
          where: { workoutId: donorWithExercises.id },
          data: { workoutId: bestWorkout.id }
        })

        // Update local state (reference only)
        bestWorkout.exercises = donorWithExercises.exercises
      }
    }

    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      await workoutRepository.update(group.bestWorkoutId, updates)
      // Update local object for consistency
      Object.assign(bestWorkout, updates)
    }

    // Mark duplicates
    // Note: We use individual updates because updateMany doesn't always support foreign key scalars in all Prisma versions/configs
    for (const id of group.toDelete) {
      await workoutRepository.update(id, {
        isDuplicate: true,
        canonicalWorkout: { connect: { id: group.bestWorkoutId } }
      })
    }

    // Update completeness score
    if (bestWorkout) {
      await workoutRepository.update(group.bestWorkoutId, {
        completenessScore: bestWorkout.completenessScore
      })
    }

    return {
      deletedCount: group.toDelete.length,
      keptCount: 1
    }
  }
}
