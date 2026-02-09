import { task } from '@trigger.dev/sdk/v3'
import { getUserLocalDate, getUserTimezone } from '../server/utils/date'
import { nutritionRepository } from '../server/utils/repositories/nutritionRepository'
import { workoutRepository } from '../server/utils/repositories/workoutRepository'
import type {
  SerializedFuelingPlan,
  SerializedFuelingWindow
} from '../server/utils/nutrition/fueling'

export const adjustFuelingPostWorkoutTask = task({
  id: 'adjust-fueling-post-workout',
  run: async (payload: { workoutId: string; userId: string }) => {
    const { workoutId, userId } = payload

    // 1. Fetch Workout
    const workout = await workoutRepository.getById(workoutId, userId, {
      include: { plannedWorkout: true }
    })

    if (!workout) {
      console.log(`Workout ${workoutId} not found. Skipping.`)
      return
    }

    // No planned workout attached? Can't compare delta. Skip for now.
    // Or maybe check if there *was* a planned workout that wasn't linked?
    if (!workout.plannedWorkout) {
      console.log(`Workout ${workoutId} has no linked PlannedWorkout. Skipping delta check.`)
      return
    }

    const planned = workout.plannedWorkout
    const actualKj = workout.kilojoules || 0
    const plannedKj = (planned.durationSec || 0) * (planned.workIntensity || 0.65) * 60 // Rough estimate if KJ not present? Or assume `tss` is proxy?
    // Let's rely on TSS or IF if KJ is missing, but KJ is king.

    // Calculate Delta
    const kjThreshold = (plannedKj || 1000) * 1.1 // 10% more
    const isHarder = actualKj > kjThreshold

    if (!isHarder) {
      console.log(
        `Workout was not significantly harder (${actualKj} vs ${plannedKj}). No adjustment needed.`
      )
      return
    }

    console.log(`Workout was harder! Triggering recovery boost.`)

    // 2. Fetch Nutrition Plan
    const timezone = await getUserTimezone(userId)
    const date = getUserLocalDate(timezone, workout.date)
    const nutrition = await nutritionRepository.getByDate(userId, date)

    if (!nutrition || !nutrition.fuelingPlan) {
      console.log(`No nutrition plan found for ${date}. Skipping.`)
      return
    }

    // 3. Update Plan
    const plan = nutrition.fuelingPlan as unknown as SerializedFuelingPlan
    const postWindowIndex = plan.windows.findIndex((w) => w.type === 'POST_WORKOUT')

    if (postWindowIndex === -1) {
      // Add a post-workout window if missing?
      console.log('No POST_WORKOUT window found to boost.')
      return
    }

    // Boost Recovery: +50g Carbs? Or +20%?
    // Let's do +30g Carbs and +10g Protein
    const currentWindow = plan.windows[postWindowIndex]
    const newWindow: SerializedFuelingWindow = {
      ...currentWindow,
      targetCarbs: currentWindow.targetCarbs + 30,
      targetProtein: currentWindow.targetProtein + 10,
      advice: `${currentWindow.advice} (Boosted by +30g C due to high intensity effort!)`,
      status: 'PENDING' // Reset to pending? Or if already hit, just note it?
    }

    plan.windows[postWindowIndex] = newWindow
    plan.dailyTotals.carbs += 30
    plan.dailyTotals.protein += 10

    // 4. Save
    await nutritionRepository.update(nutrition.id, {
      fuelingPlan: plan as any,
      carbsGoal: plan.dailyTotals.carbs,
      proteinGoal: plan.dailyTotals.protein
    })

    // 5. Notify (Todo: Push Notification or Chat Message)
    // await sendSystemMessage(userId, "Hard ride! We bumped your recovery targets.")

    return {
      success: true,
      adjusted: true,
      deltaKj: actualKj - plannedKj
    }
  }
})
