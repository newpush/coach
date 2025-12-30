import { logger, task } from "@trigger.dev/sdk/v3";
import { prisma } from "../server/utils/db";
import { workoutRepository } from "../server/utils/repositories/workoutRepository";
import { recalculateStressAfterDate } from "../server/utils/calculate-workout-stress";
import { userBackgroundQueue } from "./queues";

interface DuplicateGroup {
  workouts: Array<any> // Full workout objects
  bestWorkoutId: string
  toDelete: string[]
}

export const deduplicateWorkoutsTask = task({
  id: "deduplicate-workouts",
  maxDuration: 300,
  queue: userBackgroundQueue,
  run: async (payload: { userId: string }) => {
    const { userId } = payload;
    
    logger.log("Starting workout deduplication", {
      userId,
      userIdType: typeof userId,
      payloadReceived: payload
    });
    
    try {
      // Resolve userId - it might be an email, so look up the actual user ID
      let actualUserId = userId;
      
      // Check if userId looks like an email
      if (userId.includes('@')) {
        logger.log("userId appears to be an email, looking up user record");
        const user = await prisma.user.findUnique({
          where: { email: userId },
          select: { id: true }
        });
        
        if (!user) {
          logger.error("User not found with email", { email: userId });
          throw new Error(`User not found with email: ${userId}`);
        }
        
        actualUserId = user.id;
        logger.log("Resolved user ID", { email: userId, actualUserId });
      }
      
      // Here we explicitly want ALL workouts, including potential duplicates, to analyze them.
      // So we use includeDuplicates: true
      // Include stream ID to check for existence
      const workouts = await workoutRepository.getForUser(actualUserId, {
        includeDuplicates: true,
        orderBy: { date: 'desc' },
        include: {
           streams: {
             select: { id: true }
           }
        }
      });
      
      logger.log(`Found ${workouts.length} workouts to analyze`, {
        userId: actualUserId,
        sampleWorkout: workouts[0] ? {
          id: workouts[0].id,
          title: workouts[0].title,
          source: workouts[0].source,
          date: workouts[0].date,
          plannedWorkoutId: workouts[0].plannedWorkoutId
        } : null
      });
      
      const duplicateGroups = findDuplicateGroups(workouts);
      
      logger.log(`Identified ${duplicateGroups.length} duplicate groups`);
      
      let deletedCount = 0;
      let keptCount = 0;
      
      for (const group of duplicateGroups) {
        logger.log(`Processing duplicate group:`, {
          workoutCount: group.workouts.length,
          sources: group.workouts.map(w => w.source),
          types: group.workouts.map(w => w.type),
          bestWorkout: group.bestWorkoutId
        });
        
        if (group.toDelete.length > 0) {
          // We are doing very specific update logic here.
          // While we could add specialized methods to the repo, using prisma update/updateMany is fine for internal maintenance scripts like this.
          // However, we should try to use the repo for reads/updates where simple.
          
          // Using prisma directly for complex batch logic is acceptable as per "Repository Pattern" usually encapsulating BUSINESS logic retrieval.
          // This is a maintenance task.
          // But I'll use repo update/updateMany where suitable.
          
          // The query for duplicatesToDelete is simple enough, but filter by ID list isn't exposed in getForUser nicely.
          // Let's keep the specialized logic but use repo for standard updates.
          
          const duplicatesToDelete = await prisma.workout.findMany({
            where: { id: { in: group.toDelete } },
            select: { id: true, plannedWorkoutId: true }
          });

          // Collect planned workout IDs from duplicates
          const plannedWorkoutIds = duplicatesToDelete
            .filter(w => w.plannedWorkoutId)
            .map(w => w.plannedWorkoutId);
          
          // Get the best workout
          const bestWorkout = group.workouts.find(w => w.id === group.bestWorkoutId);
          
          if (!bestWorkout) continue;

          // MERGE LOGIC: Copy missing data from duplicates to best workout
          const updates: any = {};
          
          // List of fields to check for merging
          const mergeFields = [
            'tss', 'trainingLoad', 'intensity', 'kilojoules', 'trimp',
            'averageWatts', 'maxWatts', 'normalizedPower', 'weightedAvgWatts',
            'averageHr', 'maxHr',
            'averageCadence', 'maxCadence',
            'averageSpeed', 'maxSpeed',
            'distanceMeters', 'elevationGain',
            'calories',
            'rpe', 'feel',
            'description', // If best has no description, take it from duplicate
            'deviceName'
          ];

          const duplicatesList = group.workouts.filter(w => w.id !== group.bestWorkoutId);

          for (const field of mergeFields) {
            // If best workout is missing this field (null, undefined, or 0 for numbers)
            if (bestWorkout[field] === null || bestWorkout[field] === undefined || bestWorkout[field] === 0 || bestWorkout[field] === '') {
              // Find a duplicate that has this field
              const donor = duplicatesList.find(w => w[field] !== null && w[field] !== undefined && w[field] !== 0 && w[field] !== '');
              if (donor) {
                updates[field] = donor[field];
                logger.log(`Merging field ${field} from duplicate ${donor.id} to ${bestWorkout.id}`, {
                   value: donor[field]
                });
              }
            }
          }

          // Special handling for plannedWorkoutId
          if (!bestWorkout.plannedWorkoutId && plannedWorkoutIds.length > 0) {
             logger.log(`Transferring planned workout link from duplicate to best workout`, {
              bestWorkoutId: group.bestWorkoutId,
              plannedWorkoutId: plannedWorkoutIds[0]
            });
            updates.plannedWorkoutId = plannedWorkoutIds[0];
            
            // Mark the planned workout as completed
            await prisma.plannedWorkout.update({
              where: { id: plannedWorkoutIds[0] as string },
              data: { completed: true }
            });
          }

          // Stream Transfer Logic
          if (!bestWorkout.streams) {
            const donorWithStreams = duplicatesList.find(w => w.streams);
            if (donorWithStreams) {
               logger.log(`Transferring streams from duplicate ${donorWithStreams.id} to best workout ${bestWorkout.id}`);
               
               // We need to move the stream record to the new workout ID
               // First check if bestWorkout somehow has a stream record (collision protection)
               const existingStream = await prisma.workoutStream.findUnique({
                 where: { workoutId: bestWorkout.id }
               });
               
               if (!existingStream) {
                 await prisma.workoutStream.update({
                   where: { workoutId: donorWithStreams.id },
                   data: { workoutId: bestWorkout.id }
                 });
                 // Update local state
                 bestWorkout.streams = donorWithStreams.streams;
               }
            }
          }
          
          // Apply updates if any
          if (Object.keys(updates).length > 0) {
            await workoutRepository.update(group.bestWorkoutId, updates);
            // Update local object for consistency in logs/further checks
            Object.assign(bestWorkout, updates);
          }

          // Mark duplicates
          await workoutRepository.updateMany(
            { id: { in: group.toDelete } },
            { isDuplicate: true, duplicateOf: group.bestWorkoutId }
          );

          // Update completeness score
          if (bestWorkout) {
            await workoutRepository.update(group.bestWorkoutId, {
                completenessScore: bestWorkout.completenessScore
            });
          }
          
          deletedCount += group.toDelete.length;
          keptCount += 1;
          
          logger.log(`Marked ${group.toDelete.length} duplicate(s), kept best one`);
        }
      }
      
      logger.log("Deduplication complete", {
        totalDeleted: deletedCount,
        totalKept: keptCount
      });
      
      // If any duplicates were found and processed, recalculate stress scores
      if (duplicateGroups.length > 0) {
        // Find the earliest date among all workouts in all duplicate groups
        let earliestDate = new Date();
        for (const group of duplicateGroups) {
          for (const workout of group.workouts) {
            const workoutDate = new Date(workout.date);
            if (workoutDate < earliestDate) {
              earliestDate = workoutDate;
            }
          }
        }
        
        logger.log(`Triggering training stress recalculation after ${earliestDate.toISOString()}`);
        await recalculateStressAfterDate(actualUserId, earliestDate);
      }
      
      return {
        success: true,
        duplicateGroups: duplicateGroups.length,
        workoutsDeleted: deletedCount,
        workoutsKept: keptCount
      };
      
    } catch (error) {
      logger.error("Error deduplicating workouts", { error });
      throw error;
    }
  }
});

function findDuplicateGroups(workouts: any[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const processed = new Set<string>();
  
  for (let i = 0; i < workouts.length; i++) {
    if (processed.has(workouts[i].id)) continue;
    
    const workout = workouts[i];
    const duplicates = [workout];
    processed.add(workout.id);
    
    for (let j = i + 1; j < workouts.length; j++) {
      if (processed.has(workouts[j].id)) continue;
      
      const other = workouts[j];
      
      if (areDuplicates(workout, other)) {
        duplicates.push(other);
        processed.add(other.id);
      }
    }
    
    if (duplicates.length > 1) {
      // Calculate scores for all duplicates
      const scoredWorkouts = duplicates.map(w => {
        // Create a copy with the calculated score
        return {
          ...w,
          completenessScore: calculateCompletenessScore(w)
        };
      });
      
      scoredWorkouts.sort((a, b) => b.completenessScore - a.completenessScore);
      
      const bestWorkout = scoredWorkouts[0];
      const toDelete = scoredWorkouts.slice(1).map(w => w.id);
      
      groups.push({
        workouts: scoredWorkouts,
        bestWorkoutId: bestWorkout.id,
        toDelete
      });
    }
  }
  
  return groups;
}

function areDuplicates(w1: any, w2: any): boolean {
  const timeDiff = Math.abs(new Date(w1.date).getTime() - new Date(w2.date).getTime());
  
  // With corrected UTC timestamps, workouts should be very close in time.
  // However, we've observed issues where different providers (Withings vs Strava)
  // might disagree by large timezone offsets (e.g., 5 hours) if one applies a timezone correction differently.
  // Standard tolerance: 30 minutes
  let maxTimeDiff = 30 * 60 * 1000;
  
  // Check if the time difference is suspiciously close to a full hour multiple (timezone offset issue)
  // e.g., 5 hours = 18000000ms. If diff is 18000000 +/- 30mins, it's likely a timezone shift.
  const diffInHours = timeDiff / (60 * 60 * 1000);
  const diffHoursRemainder = Math.abs(diffInHours - Math.round(diffInHours));
  
  // If the difference is a multiple of an hour (within 5 mins tolerance) and matches common timezone offsets (1-12 hours)
  // and the workouts are otherwise VERY similar, we might consider them duplicates.
  const isTimezoneShift = diffInHours >= 1 && diffInHours <= 14 && diffHoursRemainder < (5 / 60); // within 5 mins of an hour mark
  
  if (isTimezoneShift) {
    // Relax the time check if other strong signals exist (same duration, type, etc)
    // We'll let the rest of the logic run, but we need to pass this check first.
    // So we temporarily set maxTimeDiff to cover this shift if we are going to rely on other signals.
    maxTimeDiff = timeDiff + (1000); // Allow it to pass
    
    logger.log(`Detected potential timezone shift between workouts (${diffInHours.toFixed(2)}h)`, {
       w1: { id: w1.id, date: w1.date, source: w1.source },
       w2: { id: w2.id, date: w2.date, source: w2.source }
    });
  }

  if (timeDiff > maxTimeDiff) {
    // Only log if they are somewhat close (e.g. within 2 hours) to avoid log spam for unrelated workouts
    if (timeDiff < 2 * 60 * 60 * 1000) {
      logger.log(`Time diff too large: ${timeDiff}ms (${(timeDiff / (60 * 1000)).toFixed(1)}min) for workouts`, {
        w1: { title: w1.title, date: w1.date, source: w1.source },
        w2: { title: w2.title, date: w2.date, source: w2.source }
      });
    }
    return false;
  }
  
  const durationDiff = Math.abs(w1.durationSec - w2.durationSec);
  
  // Dynamic duration tolerance based on activity type and closeness of start time
  // For activities like Skiing/Hiking where moving time vs elapsed time varies greatly, be more lenient
  const isPauseHeavy = (w1.type?.includes('Ski') || w1.type?.includes('Snowboard') || w1.type?.includes('Hike') ||
                        w2.type?.includes('Ski') || w2.type?.includes('Snowboard') || w2.type?.includes('Hike'));
  
  let maxDurationDiff = 5 * 60; // Default 5 mins
  const tenPercent = Math.max(w1.durationSec, w2.durationSec) * 0.1;
  maxDurationDiff = Math.max(maxDurationDiff, tenPercent);

  // If start times are very close (< 10 mins), relax duration check significantly
  // This handles cases where one device records "moving time" and another "elapsed time"
  if (timeDiff < 10 * 60 * 1000) {
     if (isPauseHeavy) {
       // For skiing, etc., allow up to 90% difference or 60 mins
       maxDurationDiff = Math.max(60 * 60, Math.max(w1.durationSec, w2.durationSec) * 0.9);
     } else {
       // For others, allow 50% difference or 30 mins
       maxDurationDiff = Math.max(30 * 60, Math.max(w1.durationSec, w2.durationSec) * 0.5);
     }
  }

  if (durationDiff > maxDurationDiff) {
    logger.log(`Duration diff too large: ${durationDiff}s (max: ${maxDurationDiff}s)`, {
      w1: { title: w1.title, duration: w1.durationSec, type: w1.type },
      w2: { title: w2.title, duration: w2.durationSec, type: w2.type }
    });
    return false;
  }
  
  const titleSimilar = w1.title && w2.title && (
    w1.title.toLowerCase().includes(w2.title.toLowerCase()) ||
    w2.title.toLowerCase().includes(w1.title.toLowerCase())
  );
  
  const typeSimilar = w1.type && w2.type && (
    w1.type.toLowerCase() === w2.type.toLowerCase() ||
    (w1.type.toLowerCase().includes('ride') && w2.type.toLowerCase().includes('ride')) ||
    (w1.type.toLowerCase().includes('run') && w2.type.toLowerCase().includes('run')) ||
    // Gym / Weight training mapping (Strava "Gym" vs Withings "WeightTraining")
    (w1.type.toLowerCase() === 'gym' && w2.type.toLowerCase().includes('weight')) ||
    (w1.type.toLowerCase().includes('weight') && w2.type.toLowerCase() === 'gym')
  );
  
  const isDuplicate = titleSimilar || typeSimilar;
  
  if (isDuplicate) {
    logger.log(`Detected duplicate workouts:`, {
      w1: { title: w1.title, type: w1.type, source: w1.source, date: w1.date },
      w2: { title: w2.title, type: w2.type, source: w2.source, date: w2.date },
      titleSimilar,
      typeSimilar
    });
  }
  
  return isDuplicate;
}

function calculateCompletenessScore(workout: any): number {
  let score = 0;
  
  // Prefer manual input or specific sources if reliable
  // But generally trust device data more for metrics
  if (workout.source === 'intervals') {
    score += 15; // Increased trust for Intervals.icu as it often aggregates well
  } else if (workout.source === 'strava') {
    score += 10;
  } else if (workout.source === 'withings') {
    score += 5;
  }
  
  const isCycling = workout.type?.toLowerCase().includes('ride') || 
                   workout.type?.toLowerCase().includes('bike');
  const isGym = workout.type?.toLowerCase().includes('gym') || 
                workout.type?.toLowerCase().includes('strength') ||
                workout.type?.toLowerCase().includes('weight');
  const isSwim = workout.type?.toLowerCase().includes('swim');
  
  if (isCycling) {
    if (workout.averageWatts && workout.averageWatts > 0) {
      score += 40; // Power is king for cycling
      if (workout.source === 'intervals') score += 10;
    }
    if (workout.normalizedPower && workout.normalizedPower > 0) score += 10;
    if (workout.tss && workout.tss > 0) score += 10;
  }
  
  if (isGym && workout.source === 'strava') {
    score += 20;
  }
  
  // HR Data is valuable for all types
  if (workout.averageHr && workout.averageHr > 0) score += 20;
  if (workout.maxHr && workout.maxHr > 0) score += 5;
  
  if (workout.distance && workout.distance > 0) score += 5;
  
  if (workout.elevationGain && workout.elevationGain > 0) score += 5;
  
  // High value for having streams (time-series data)
  if (workout.streams) {
      // Check stream quality if possible (length of data points)
      // We can't easily check length here without casting, but existence is a strong signal
      score += 50; 
  }
  
  if (workout.trainingLoad && workout.trainingLoad > 0) score += 10;
  if (workout.intensity && workout.intensity > 0) score += 5;
  
  if (workout.calories && workout.calories > 0) score += 3;
  
  if (workout.averageSpeed && workout.averageSpeed > 0) score += 3;
  if (workout.maxSpeed && workout.maxSpeed > 0) score += 2;
  if (workout.averageCadence && workout.averageCadence > 0) score += 5;
  
  // Description might contain user notes
  if (workout.description && workout.description.length > 5) score += 5;
  
  return score;
}