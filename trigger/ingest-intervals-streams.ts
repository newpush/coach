import { task, logger } from '@trigger.dev/sdk/v3'
import { userIngestionQueue } from "./queues";
import { prisma } from '../server/utils/db'
import { fetchIntervalsActivityStreams } from '../server/utils/intervals'
import {
  calculateLapSplits,
  calculatePaceVariability,
  calculateAveragePace,
  analyzePacingStrategy,
  detectSurges
} from '../server/utils/pacing'

interface IngestStreamsPayload {
  userId: string
  workoutId: string
  activityId: string
}

export const ingestIntervalsStreams = task({
  id: 'ingest-intervals-streams',
  queue: userIngestionQueue,
  run: async (payload: IngestStreamsPayload) => {
    logger.log('Starting Intervals.icu stream ingestion', { 
      workoutId: payload.workoutId, 
      activityId: payload.activityId 
    })
    
    // Get Intervals integration
    const integration = await prisma.integration.findFirst({
      where: {
        userId: payload.userId,
        provider: 'intervals'
      }
    })
    
    if (!integration) {
      throw new Error('Intervals.icu integration not found')
    }
    
    // Fetch streams from Intervals.icu API
    logger.log('Fetching streams from Intervals.icu API')
    const streams = await fetchIntervalsActivityStreams(
      integration,
      payload.activityId
    )
    
    // Check if we got any stream data
    if (!streams.time || !streams.time.data || streams.time.data.length === 0) {
      logger.log('No stream data available for this activity')
      return {
        success: true,
        workoutId: payload.workoutId,
        message: 'No stream data available'
      }
    }
    
    // Extract data arrays
    const timeData = streams.time?.data as number[] || []
    const distanceData = streams.distance?.data as number[] || []
    const velocityData = streams.velocity?.data as number[] || []
    const heartrateData = streams.heartrate?.data as number[] || null
    const cadenceData = streams.cadence?.data as number[] || null
    const wattsData = streams.watts?.data as number[] || null
    const altitudeData = streams.altitude?.data as number[] || null
    const latlngData = streams.latlng?.data as [number, number][] || null
    const gradeData = streams.grade?.data as number[] || null
    const movingData = streams.moving?.data as boolean[] || null
    
    logger.log('Processing stream data', {
      timePoints: timeData.length,
      distancePoints: distanceData.length,
      velocityPoints: velocityData.length
    })
    
    // Calculate pacing metrics
    let lapSplits = null
    let paceVariability = null
    let avgPacePerKm = null
    let pacingStrategy = null
    let surges = null
    
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
    
    // Store in database
    logger.log('Storing stream data in database')
    const workoutStream = await prisma.workoutStream.upsert({
      where: { workoutId: payload.workoutId },
      create: {
        workoutId: payload.workoutId,
        time: timeData,
        distance: distanceData,
        velocity: velocityData,
        heartrate: heartrateData,
        cadence: cadenceData,
        watts: wattsData,
        altitude: altitudeData,
        latlng: latlngData,
        grade: gradeData,
        moving: movingData,
        lapSplits,
        paceVariability,
        avgPacePerKm,
        pacingStrategy,
        surges
      },
      update: {
        time: timeData,
        distance: distanceData,
        velocity: velocityData,
        heartrate: heartrateData,
        cadence: cadenceData,
        watts: wattsData,
        altitude: altitudeData,
        latlng: latlngData,
        grade: gradeData,
        moving: movingData,
        lapSplits,
        paceVariability,
        avgPacePerKm,
        pacingStrategy,
        surges,
        updatedAt: new Date()
      }
    })
    
    logger.log('Stream data stored successfully', { streamId: workoutStream.id })
    
    return {
      success: true,
      workoutId: payload.workoutId,
      streamId: workoutStream.id,
      metrics: {
        dataPoints: timeData.length,
        laps: lapSplits?.length || 0,
        avgPacePerKm,
        paceVariability,
        pacingStrategy: pacingStrategy?.strategy,
        surges: surges?.length || 0
      }
    }
  }
})