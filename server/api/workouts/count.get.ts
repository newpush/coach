import { workoutRepository } from '../../utils/repositories/workoutRepository'
import { getEffectiveUserId } from '../../utils/coaching'

export default defineEventHandler(async (event) => {
  const userId = await getEffectiveUserId(event)
  const query = getQuery(event)

  const startDate = query.startDate ? new Date(query.startDate as string) : undefined
  const endDate = query.endDate ? new Date(query.endDate as string) : undefined
  const includeDuplicates = query.includeDuplicates === 'true'

  const count = await workoutRepository.count(userId, {
    startDate,
    endDate,
    includeDuplicates
  })

  return { count }
})
