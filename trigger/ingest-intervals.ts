import { logger, task, tasks } from "@trigger.dev/sdk/v3";
import {
  fetchIntervalsWorkouts,
  fetchIntervalsWellness,
  fetchIntervalsPlannedWorkouts,
  fetchIntervalsAthleteProfile,
  normalizeIntervalsWorkout,
  normalizeIntervalsWellness,
  normalizeIntervalsPlannedWorkout
} from "../server/utils/intervals";
import { prisma } from "../server/utils/db";
import { workoutRepository } from "../server/utils/repositories/workoutRepository";
import { wellnessRepository } from "../server/utils/repositories/wellnessRepository";
import { normalizeTSS } from "../server/utils/normalize-tss";
import { calculateWorkoutStress } from "../server/utils/calculate-workout-stress";

export const ingestIntervalsTask = task({
  id: "ingest-intervals",
  run: async (payload: {
    userId: string;
    startDate: string;
    endDate: string;
  }) => {
    const { userId, startDate, endDate } = payload;
    
    logger.log("Starting Intervals.icu ingestion", { userId, startDate, endDate });
    
    // Fetch integration
    const integration = await prisma.integration.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: 'intervals'
        }
      }
    });
    
    if (!integration) {
      throw new Error('Intervals integration not found for user');
    }
    
    // Update sync status
    await prisma.integration.update({
      where: { id: integration.id },
      data: { syncStatus: 'SYNCING' }
    });
    
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // Fetch and update athlete profile data first
      logger.log("Fetching athlete profile data...");
      try {
        const profileData = await fetchIntervalsAthleteProfile(integration);
        
        // Update User table with profile data
        await prisma.user.update({
          where: { id: userId },
          data: {
            ftp: profileData.ftp,
            weight: profileData.weight,
            maxHr: profileData.maxHR,
            dob: profileData.dateOfBirth ? new Date(profileData.dateOfBirth) : null
          }
        });
        
        logger.log("Updated athlete profile data", {
          ftp: profileData.ftp,
          weight: profileData.weight,
          maxHr: profileData.maxHR,
          dob: profileData.dateOfBirth
        });
      } catch (error) {
        logger.error("Error updating athlete profile, continuing with data ingestion", { error });
        // Don't fail the entire ingestion if profile update fails
      }
      
      // Fetch activities
      logger.log("Fetching activities...");
      const allActivities = await fetchIntervalsWorkouts(integration, start, end);
      logger.log(`Fetched ${allActivities.length} activities from Intervals.icu`);
      
      // Filter out incomplete Strava activities (they don't have full data available via API)
      const activities = allActivities.filter(activity => {
        // Check if this is a Strava activity with no data
        const isIncompleteStrava = activity.source === 'STRAVA' && activity._note?.includes('not available via the API');
        if (isIncompleteStrava) {
          logger.log(`Skipping incomplete Strava activity: ${activity.id} (${activity.start_date_local})`);
          return false;
        }
        return true;
      });
      
      const filteredCount = allActivities.length - activities.length;
      if (filteredCount > 0) {
        logger.log(`Filtered out ${filteredCount} incomplete Strava activities (details not available via Intervals.icu API)`);
      }
      logger.log(`Processing ${activities.length} activities with complete data`);
      
      // Fetch wellness data
      logger.log("Fetching wellness data...");
      const wellnessData = await fetchIntervalsWellness(integration, start, end);
      logger.log(`Fetched ${wellnessData.length} wellness entries from Intervals.icu`);
      
      // Fetch planned workouts (import all categories)
      logger.log("Fetching planned workouts...");
      const plannedWorkouts = await fetchIntervalsPlannedWorkouts(integration, start, end);
      logger.log(`Fetched ${plannedWorkouts.length} events from Intervals.icu`);
      
      // Upsert workouts
      let workoutsUpserted = 0;
      const pacingActivityTypes = ['Run', 'Ride', 'VirtualRide', 'Walk', 'Hike'];
      
      for (const activity of activities) {
        const workout = normalizeIntervalsWorkout(activity, userId);
        
        const upsertedWorkout = await workoutRepository.upsert(
          userId,
          'intervals',
          workout.externalId,
          workout,
          workout
        );
        workoutsUpserted++;
        
        // Normalize TSS (Intervals.icu usually provides TSS, but this ensures consistency)
        try {
          const tssResult = await normalizeTSS(upsertedWorkout.id, userId);
          logger.log('TSS normalization complete', {
            workoutId: upsertedWorkout.id,
            tss: tssResult.tss,
            source: tssResult.source
          });
          
          // Update CTL/ATL if TSS was set
          if (tssResult.tss !== null) {
            await calculateWorkoutStress(upsertedWorkout.id, userId);
          }
        } catch (error) {
          logger.error('Failed to normalize TSS for workout', {
            workoutId: upsertedWorkout.id,
            error
          });
          // Don't fail ingestion if TSS normalization fails
        }
        
        // Trigger stream ingestion for activities with pacing data
        if (pacingActivityTypes.includes(upsertedWorkout.type)) {
          logger.log(`Triggering stream ingestion for ${upsertedWorkout.type} workout: ${upsertedWorkout.id}`);
          await tasks.trigger('ingest-intervals-streams', {
            userId,
            workoutId: upsertedWorkout.id,
            activityId: activity.id
          });
        }
      }
      
      logger.log(`Upserted ${workoutsUpserted} workouts`);
      
      // Upsert wellness data
      let wellnessUpserted = 0;
      for (const wellness of wellnessData) {
        const wellnessDate = new Date(wellness.id); // wellness.id is the date string
        const normalizedWellness = normalizeIntervalsWellness(wellness, userId, wellnessDate);
        
        await wellnessRepository.upsert(
          userId,
          wellnessDate,
          normalizedWellness,
          normalizedWellness
        );
        wellnessUpserted++;
      }
      
      logger.log(`Upserted ${wellnessUpserted} wellness entries`);
      
      // Upsert planned workouts
      let plannedWorkoutsUpserted = 0;
      for (const planned of plannedWorkouts) {
        const normalizedPlanned = normalizeIntervalsPlannedWorkout(planned, userId);
        
        await prisma.plannedWorkout.upsert({
          where: {
            userId_externalId: {
              userId,
              externalId: normalizedPlanned.externalId
            }
          },
          update: normalizedPlanned,
          create: normalizedPlanned
        });
        plannedWorkoutsUpserted++;
      }
      
      logger.log(`Upserted ${plannedWorkoutsUpserted} planned workouts`);
      
      // Update sync status
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          syncStatus: 'SUCCESS',
          lastSyncAt: new Date(),
          errorMessage: null,
          initialSyncCompleted: true // Mark initial sync as done
        }
      });
      
      return {
        success: true,
        workouts: workoutsUpserted,
        wellness: wellnessUpserted,
        plannedWorkouts: plannedWorkoutsUpserted,
        stravaActivitiesSkipped: filteredCount,
        userId,
        startDate,
        endDate
      };
    } catch (error) {
      logger.error("Error ingesting Intervals data", { error });
      
      // Update error status
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          syncStatus: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        }
      });
      
      throw error;
    }
  }
});