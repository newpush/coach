import { task } from '@trigger.dev/sdk/v3'
import { analyzeWellness } from '../server/utils/services/wellness-analysis'
import { userAnalysisQueue } from './queues'

export const analyzeWellnessTask = task({
  id: 'analyze-wellness',
  queue: userAnalysisQueue,
  run: async (payload: { wellnessId: string; userId: string }) => {
    return analyzeWellness(payload.wellnessId, payload.userId)
  }
})
