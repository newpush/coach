export function buildWorkoutCleanupQuery(params: {
  userId: string
  startDate: Date
  endDate: Date
  trainingWeekId?: string
  anchorWorkoutIds?: string[]
}) {
  return {
    userId: params.userId,
    OR: [
      {
        date: {
          gte: params.startDate,
          lte: params.endDate
        }
      },
      ...(params.trainingWeekId ? [{ trainingWeekId: params.trainingWeekId }] : [])
    ],
    completed: false,
    id: {
      notIn: params.anchorWorkoutIds || []
    }
  }
}
