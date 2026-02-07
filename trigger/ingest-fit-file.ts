import './init'
import { logger, task } from '@trigger.dev/sdk/v3'
import { userIngestionQueue } from './queues'
import { prisma } from '../server/utils/db'
import { workoutRepository } from '../server/utils/repositories/workoutRepository'
import {
  parseFitFile,
  normalizeFitSession,
  extractFitStreams,
  reconstructSessionFromRecords
} from '../server/utils/fit'
import { calculateWorkoutStress } from '../server/utils/calculate-workout-stress'
import {
  calculateLapSplits,
  calculatePaceVariability,
  calculateAveragePace,
  analyzePacingStrategy,
  detectSurges
} from '../server/utils/pacing'

export const ingestFitFile = task({
  id: 'ingest-fit-file',
  queue: userIngestionQueue,
  maxDuration: 600, // 10 minutes for heavy processing
  run: async (payload: { userId: string; fitFileId: string }) => {
    const { userId, fitFileId } = payload

    logger.log('Starting FIT file ingestion', { userId, fitFileId })

    // Retrieve the file from DB
    const fitFile = await prisma.fitFile.findUnique({
      where: { id: fitFileId }
    })

    if (!fitFile) {
      throw new Error(`FitFile not found: ${fitFileId}`)
    }

    try {
      // Parse file content
      logger.log(`Parsing FIT file: ${fitFile.filename}`)
      const fitData = await parseFitFile(Buffer.from(fitFile.fileData))

      // Get main session
      let session = fitData.sessions[0]
      if (!session) {
        if (fitData.records && fitData.records.length > 0) {
          logger.log('No session data found in FIT file, attempting to reconstruct from records')
          session = reconstructSessionFromRecords(fitData.records)
        }
      }

      if (!session) {
        throw new Error('No session data found in FIT file and could not reconstruct from records')
      }

      // Normalize to workout
      logger.log('Normalizing session data...')
      const workoutData = normalizeFitSession(session, userId, fitFile.filename)

      // Extract streams
      logger.log('Extracting and saving streams...')
      const streams = extractFitStreams(fitData.records)

      // Calculate derived metrics from streams if not present in session
      // For Zwift workouts, TSS and normalized power might be missing
      if (!workoutData.normalizedPower && streams.watts && streams.watts.length > 0) {
        // Simple calculation of NP (would require more complex logic for proper NP)
        // For now, let's rely on calculateWorkoutStress to do the heavy lifting later
        logger.log('Normalized power missing from session, will be calculated from streams')
      }

      // Calculate pacing metrics
      let lapSplits = null
      let paceVariability = null
      let avgPacePerKm = null
      let pacingStrategy = null
      let surges = null

      const timeData = streams.time || []
      const distanceData = streams.distance || []
      const velocityData = streams.velocity || []

      if (timeData.length > 0 && distanceData.length > 0) {
        // Calculate lap splits (1km intervals)
        lapSplits = calculateLapSplits(timeData, distanceData, 1000)
        logger.log('Calculated lap splits', { laps: lapSplits.length })

        // Calculate pace variability
        if (velocityData.length > 0) {
          paceVariability = calculatePaceVariability(velocityData)
          logger.log('Calculated pace variability', { variability: paceVariability })

          // Calculate average pace
          avgPacePerKm = calculateAveragePace(
            timeData[timeData.length - 1],
            distanceData[distanceData.length - 1]
          )
          logger.log('Calculated average pace', { avgPacePerKm })
        }

        // Analyze pacing strategy
        if (lapSplits && lapSplits.length >= 2) {
          pacingStrategy = analyzePacingStrategy(lapSplits)
          logger.log('Analyzed pacing strategy', { strategy: pacingStrategy.strategy })
        }

        // Detect surges
        if (velocityData.length > 20 && timeData.length > 20) {
          surges = detectSurges(velocityData, timeData)
          logger.log('Detected surges', { count: surges.length })
        }
      }

      // Upsert workout
      const { record: upsertedWorkout } = await workoutRepository.upsert(
        userId,
        'fit_file',
        workoutData.externalId,
        workoutData,
        workoutData
      )

      logger.log(`Upserted workout: ${upsertedWorkout.id}`)

      // Link workout to file
      await prisma.fitFile.update({
        where: { id: fitFileId },
        data: { workoutId: upsertedWorkout.id }
      })

      // Save streams
      await prisma.workoutStream.upsert({
        where: { workoutId: upsertedWorkout.id },
        create: {
          workoutId: upsertedWorkout.id,
          ...streams,
          lapSplits,
          paceVariability,
          avgPacePerKm,
          pacingStrategy,
          surges
        },
        update: {
          ...streams,
          lapSplits,
          paceVariability,
          avgPacePerKm,
          pacingStrategy,
          surges
        }
      })

      // Calculate stress metrics
      try {
        await calculateWorkoutStress(upsertedWorkout.id, userId)
        logger.log(`Calculated workout stress for ${upsertedWorkout.id}`)
      } catch (error) {
        logger.error(`Failed to calculate workout stress for ${upsertedWorkout.id}:`, { error })
      }

      return {
        success: true,
        workoutId: upsertedWorkout.id,
        filename: fitFile.filename
      }
    } catch (error) {
      logger.error('Error processing FIT file', { error, fitFileId })
      throw error
    }
  }
})
