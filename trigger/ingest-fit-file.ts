import { logger, task } from "@trigger.dev/sdk/v3";
import { userIngestionQueue } from "./queues";
import { prisma } from "../server/utils/db";
import { workoutRepository } from "../server/utils/repositories/workoutRepository";
import { parseFitFile, normalizeFitSession, extractFitStreams } from "../server/utils/fit";
import { calculateWorkoutStress } from "../server/utils/calculate-workout-stress";

export const ingestFitFile = task({
  id: "ingest-fit-file",
  queue: userIngestionQueue,
  run: async (payload: {
    userId: string;
    fitFileId: string;
  }) => {
    const { userId, fitFileId } = payload;
    
    logger.log("Starting FIT file ingestion", { userId, fitFileId });
    
    // Retrieve the file from DB
    const fitFile = await prisma.fitFile.findUnique({
      where: { id: fitFileId }
    });
    
    if (!fitFile) {
      throw new Error(`FitFile not found: ${fitFileId}`);
    }
    
    try {
      // Parse file content
      logger.log(`Parsing FIT file: ${fitFile.filename}`);
      const fitData = await parseFitFile(Buffer.from(fitFile.fileData));
      
      // Get main session
      const session = fitData.sessions[0];
      if (!session) {
        throw new Error('No session data found in FIT file');
      }
      
      // Normalize to workout
      logger.log('Normalizing session data...');
      const workoutData = normalizeFitSession(session, userId, fitFile.filename);

      // Extract streams
      logger.log('Extracting and saving streams...');
      const streams = extractFitStreams(fitData.records);
      
      // Calculate derived metrics from streams if not present in session
      // For Zwift workouts, TSS and normalized power might be missing
      if (!workoutData.normalizedPower && streams.watts && streams.watts.length > 0) {
        // Simple calculation of NP (would require more complex logic for proper NP)
        // For now, let's rely on calculateWorkoutStress to do the heavy lifting later
        logger.log('Normalized power missing from session, will be calculated from streams');
      }

      // Upsert workout
      const workout = await workoutRepository.upsert(
        userId,
        'fit_file',
        workoutData.externalId,
        workoutData,
        workoutData
      );
      
      logger.log(`Upserted workout: ${workout.id}`);
      
      // Link workout to file
      await prisma.fitFile.update({
        where: { id: fitFileId },
        data: { workoutId: workout.id }
      });
      
      
      // Save streams
      await prisma.workoutStream.upsert({
        where: { workoutId: workout.id },
        create: {
          workoutId: workout.id,
          ...streams
        },
        update: {
          ...streams
        }
      });
      
      // Calculate stress metrics
      try {
        await calculateWorkoutStress(workout.id, userId);
        logger.log(`Calculated workout stress for ${workout.id}`);
      } catch (error) {
        logger.error(`Failed to calculate workout stress for ${workout.id}:`, { error });
      }
      
      return {
        success: true,
        workoutId: workout.id,
        filename: fitFile.filename
      };
      
    } catch (error) {
      logger.error("Error processing FIT file", { error, fitFileId });
      throw error;
    }
  }
});
