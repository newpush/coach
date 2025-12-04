import { logger, task } from "@trigger.dev/sdk/v3";
import { prisma } from "../server/utils/db";

interface DuplicateGroup {
  workouts: Array<{
    id: string
    source: string
    title: string
    type: string
    durationSec: number
    date: Date
    completenessScore: number
    hasHeartRate: boolean
    hasPower: boolean
    hasStreams: boolean
    averageWatts: number | null
    averageHr: number | null
    tss: number | null
  }>
  bestWorkoutId: string
  toDelete: string[]
}

export const deduplicateWorkoutsTask = task({
  id: "deduplicate-workouts",
  maxDuration: 300,
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
      
      const workouts = await prisma.workout.findMany({
        where: { userId: actualUserId },
        orderBy: { date: 'desc' }
      });
      
      logger.log(`Found ${workouts.length} workouts to analyze`, {
        userId: actualUserId,
        sampleWorkout: workouts[0] ? {
          id: workouts[0].id,
          title: workouts[0].title,
          source: workouts[0].source,
          date: workouts[0].date
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
          // Mark duplicates instead of deleting them
          await prisma.workout.updateMany({
            where: {
              id: { in: group.toDelete }
            },
            data: {
              isDuplicate: true,
              duplicateOf: group.bestWorkoutId
            }
          });
          
          // Update completeness score on the best workout
          const bestWorkout = group.workouts.find(w => w.id === group.bestWorkoutId);
          if (bestWorkout) {
            await prisma.workout.update({
              where: { id: group.bestWorkoutId },
              data: {
                completenessScore: bestWorkout.completenessScore
              }
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
      const scoredWorkouts = duplicates.map(w => ({
        id: w.id,
        source: w.source,
        title: w.title,
        type: w.type,
        durationSec: w.durationSec,
        date: w.date,
        completenessScore: calculateCompletenessScore(w),
        hasHeartRate: !!w.averageHr,
        hasPower: !!w.averageWatts,
        hasStreams: !!w.streams,
        averageWatts: w.averageWatts,
        averageHr: w.averageHr,
        tss: w.tss
      }));
      
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
  const twelveHours = 12 * 60 * 60 * 1000; // Increased to handle timezone differences
  if (timeDiff > twelveHours) {
    logger.log(`Time diff too large: ${timeDiff}ms (${(timeDiff / (60 * 60 * 1000)).toFixed(1)}h) for workouts`, {
      w1: { title: w1.title, date: w1.date, source: w1.source },
      w2: { title: w2.title, date: w2.date, source: w2.source }
    });
    return false;
  }
  
  const durationDiff = Math.abs(w1.durationSec - w2.durationSec);
  const fiveMinutes = 5 * 60;
  const tenPercent = Math.max(w1.durationSec, w2.durationSec) * 0.1;
  const maxDiff = Math.max(fiveMinutes, tenPercent);
  if (durationDiff > maxDiff) {
    logger.log(`Duration diff too large: ${durationDiff}s (max: ${maxDiff}s)`, {
      w1: { title: w1.title, duration: w1.durationSec },
      w2: { title: w2.title, duration: w2.durationSec }
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
    (w1.type.toLowerCase().includes('run') && w2.type.toLowerCase().includes('run'))
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
  
  if (workout.source === 'intervals') {
    score += 10;
  } else if (workout.source === 'strava') {
    score += 5;
  }
  
  const isCycling = workout.type?.toLowerCase().includes('ride') || 
                   workout.type?.toLowerCase().includes('bike');
  const isGym = workout.type?.toLowerCase().includes('gym') || 
                workout.type?.toLowerCase().includes('strength') ||
                workout.type?.toLowerCase().includes('weight');
  
  if (isCycling) {
    if (workout.averageWatts && workout.averageWatts > 0) {
      score += 30;
      if (workout.source === 'intervals') score += 10;
    }
    if (workout.normalizedPower && workout.normalizedPower > 0) score += 10;
    if (workout.tss && workout.tss > 0) score += 10;
  }
  
  if (isGym && workout.source === 'strava') {
    score += 20;
  }
  
  if (workout.averageHr && workout.averageHr > 0) score += 15;
  if (workout.maxHr && workout.maxHr > 0) score += 5;
  
  if (workout.distance && workout.distance > 0) score += 5;
  
  if (workout.elevationGain && workout.elevationGain > 0) score += 5;
  
  if (workout.streams) score += 20;
  
  if (workout.trainingLoad && workout.trainingLoad > 0) score += 10;
  if (workout.intensity && workout.intensity > 0) score += 5;
  
  if (workout.calories && workout.calories > 0) score += 3;
  
  if (workout.averageSpeed && workout.averageSpeed > 0) score += 3;
  if (workout.maxSpeed && workout.maxSpeed > 0) score += 2;
  if (workout.averageCadence && workout.averageCadence > 0) score += 5;
  
  return score;
}