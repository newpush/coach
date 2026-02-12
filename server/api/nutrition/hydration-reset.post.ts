import { getEffectiveUserId } from '../../utils/coaching'
import { getUserLocalDate, getUserTimezone } from '../../utils/date'
import { metabolicService } from '../../utils/services/metabolicService'
import { nutritionRepository } from '../../utils/repositories/nutritionRepository'

export default defineEventHandler(async (event) => {
  const userId = await getEffectiveUserId(event)
  const timezone = await getUserTimezone(userId)
  const today = getUserLocalDate(timezone)
  const state = await metabolicService.getMetabolicState(userId, today)

  await nutritionRepository.upsert(
    userId,
    today,
    {
      userId,
      date: today,
      startingGlycogenPercentage: state.startingGlycogen,
      startingFluidDeficit: 0
    },
    {
      startingGlycogenPercentage: state.startingGlycogen,
      startingFluidDeficit: 0
    }
  )

  return {
    success: true,
    date: today.toISOString().split('T')[0],
    hydrationDebtResetMl: 0
  }
})
