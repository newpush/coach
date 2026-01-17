import { logger, task } from '@trigger.dev/sdk/v3'
import { userIngestionQueue } from './queues'
import { prisma } from '../server/utils/db'
import {
  fetchHevyWorkouts,
  fetchHevyExerciseTemplate,
  normalizeHevyWorkout
} from '../server/utils/hevy'
import { roundToTwoDecimals } from '../server/utils/number'

export const ingestHevyTask = task({
  id: 'ingest-hevy',
  queue: userIngestionQueue,
  run: async (payload: { userId: string; fullSync?: boolean }) => {
    const { userId, fullSync } = payload

    // 1. Get Integration
    const integration = await prisma.integration.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: 'hevy'
        }
      }
    })

    if (!integration || !integration.accessToken) {
      throw new Error('Hevy integration not found or missing API key')
    }

    const apiKey = integration.accessToken

    // 2. Fetch Workouts (Pagination)
    let page = 1
    const pageSize = 10
    let keepFetching = true
    let totalSynced = 0
    let newWorkouts = 0

    // Update status
    await prisma.integration.update({
      where: { id: integration.id },
      data: { syncStatus: 'SYNCING' }
    })

    try {
      while (keepFetching) {
        console.log(`Fetching Hevy workouts page ${page}...`)
        const response = await fetchHevyWorkouts(apiKey, page, pageSize)
        const workouts = response.workouts

        if (!workouts || workouts.length === 0) {
          keepFetching = false
          break
        }

        for (const hevyWorkout of workouts) {
          // Check if workout exists to optimize "incremental" sync
          const existingWorkout = await prisma.workout.findUnique({
            where: {
              userId_source_externalId: {
                userId,
                source: 'hevy',
                externalId: hevyWorkout.id
              }
            }
          })

          if (existingWorkout && !fullSync) {
            // If we found an existing workout and not doing full sync, we might stop
            // But Hevy sort is by date desc? Usually API default.
            // Let's assume date desc.
            // keepFetching = false
            // break
            // Actually, safe to just update.
          }

          // Normalize and Upsert Workout
          const normalized = normalizeHevyWorkout(hevyWorkout, userId)

          // Calculate total volume (tonnage)
          let totalVolume = 0
          hevyWorkout.exercises.forEach((ex) => {
            ex.sets.forEach((set) => {
              if (set.weight_kg && set.reps) {
                totalVolume += set.weight_kg * set.reps
              }
            })
          })

          // Add notes to description if present in exercises? No, keep separate.

          const workout = await prisma.workout.upsert({
            where: {
              userId_source_externalId: {
                userId,
                source: 'hevy',
                externalId: normalized.externalId
              }
            },
            update: {
              ...normalized,
              // Update stats that might change
              kilojoules: Math.round(totalVolume / 100) // Rough proxy or just store somewhere else?
              // Using kilojoules for Volume (load) is confusing but common hack if field missing.
              // Better to maybe put in notes or rawJson for now.
            },
            create: normalized
          })

          if (!existingWorkout) newWorkouts++

          // Handle Exercises & Sets
          // Strategy: Delete existing workout exercises and re-create to handle edits
          await prisma.workoutExercise.deleteMany({
            where: { workoutId: workout.id }
          })

          for (const [exIndex, hevyExercise] of hevyWorkout.exercises.entries()) {
            // 1. Ensure Exercise Exists (Template)
            let exercise = await prisma.exercise.findUnique({
              where: { externalId: hevyExercise.exercise_template_id }
            })

            if (!exercise) {
              try {
                // Fetch template details
                const template = await fetchHevyExerciseTemplate(
                  apiKey,
                  hevyExercise.exercise_template_id
                )
                exercise = await prisma.exercise.create({
                  data: {
                    externalId: template.id,
                    title: template.title,
                    type: template.type,
                    primaryMuscle: template.primary_muscle_group,
                    secondaryMuscles: template.secondary_muscle_groups
                  }
                })
              } catch (e) {
                // Fallback if template fetch fails
                exercise = await prisma.exercise.create({
                  data: {
                    externalId: hevyExercise.exercise_template_id,
                    title: hevyExercise.title || 'Unknown Exercise'
                  }
                })
              }
            }

            // 2. Create WorkoutExercise
            const workoutExercise = await prisma.workoutExercise.create({
              data: {
                workoutId: workout.id,
                exerciseId: exercise.id,
                order: hevyExercise.index,
                notes: hevyExercise.notes
              }
            })

            // 3. Create Sets
            for (const [setIndex, hevySet] of hevyExercise.sets.entries()) {
              await prisma.workoutSet.create({
                data: {
                  workoutExerciseId: workoutExercise.id,
                  order: hevySet.index,
                  type: hevySet.indicator ? hevySet.indicator.toUpperCase() : 'NORMAL', // normal -> NORMAL
                  weight: hevySet.weight_kg ? roundToTwoDecimals(hevySet.weight_kg) : null,
                  weightUnit: 'kg',
                  reps: hevySet.reps,
                  distanceMeters: hevySet.distance_meters,
                  durationSec: hevySet.duration_seconds,
                  rpe: hevySet.rpe
                }
              })
            }
          }
        }

        totalSynced += workouts.length

        // Safety limit or date check could be added here
        if (workouts.length < pageSize) {
          keepFetching = false
        } else {
          page++
        }
      }

      // Success
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          syncStatus: 'SUCCESS',
          lastSyncAt: new Date(),
          errorMessage: null
        }
      })

      return {
        success: true,
        count: totalSynced,
        new: newWorkouts
      }
    } catch (error: any) {
      console.error('Hevy Sync Error:', error)

      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          syncStatus: 'FAILED',
          errorMessage: error.message || 'Unknown error'
        }
      })

      throw error
    }
  }
})
