import { getEffectiveUserId } from '../../utils/coaching'
import { metabolicService } from '../../utils/services/metabolicService'
import { getUserTimezone, getUserLocalDate } from '../../utils/date'
import { nutritionRepository } from '../../utils/repositories/nutritionRepository'
import { getProfileForItem, getAbsorbedInInterval } from '../../utils/nutrition-domain/absorption'

export default defineEventHandler(async (event) => {
  const userId = await getEffectiveUserId(event)
  const timezone = await getUserTimezone(userId)
  const today = getUserLocalDate(timezone)
  const now = new Date()

  try {
    // 1. Get Next Fueling Window and Suggested Intake
    const context = await metabolicService.getMealTargetContext(userId, today, now)

    // 2. Get Latest Activity Recommendation (for specific meal advice consistency)
    const latestRec = await prisma.activityRecommendation.findFirst({
      where: { userId, date: today, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' }
    })
    const mealRecCandidate = (latestRec?.analysisJson as any)?.meal_recommendation
    const nextWindowType = context.nextFuelingWindow?.type as string | undefined
    const recWindowType = mealRecCandidate?.windowType as string | undefined
    const recommendationText = `${mealRecCandidate?.timing || ''} ${mealRecCandidate?.reasoning || ''}`
    const looksLikePreWorkout = /before\s+your\s+(ride|workout)|pre-?workout|head out/i.test(
      recommendationText
    )
    const windowMismatch = !!(recWindowType && nextWindowType && recWindowType !== nextWindowType)
    const staleMealRec =
      // No remaining workout-linked window to fuel, but recommendation is still pre-workout.
      (!nextWindowType && looksLikePreWorkout) ||
      // Next actionable target is recovery/base, not a pre-ride window.
      ((nextWindowType === 'POST_WORKOUT' || nextWindowType === 'DAILY_BASE') &&
        looksLikePreWorkout) ||
      // If model provided explicit window binding, enforce it.
      windowMismatch
    const mealRec = staleMealRec ? null : mealRecCandidate

    // 3. Get Recent Activity (History) - last 3 items
    // We look back at the last 2 days to find the 3 most recent logged items
    const startDate = new Date(today)
    startDate.setUTCDate(today.getUTCDate() - 1)

    const recentRecords = await nutritionRepository.getForUser(userId, {
      startDate,
      endDate: today,
      orderBy: { date: 'desc' },
      limit: 2
    })

    const allLoggedItems: any[] = []
    const meals = ['breakfast', 'lunch', 'dinner', 'snacks'] as const

    for (const record of recentRecords) {
      for (const meal of meals) {
        const items = Array.isArray(record[meal]) ? (record[meal] as any[]) : []
        items.forEach((item) => {
          // Attempt to parse logged_at or date
          const timeVal = item.logged_at || item.date
          let loggedAt: Date | null = null
          if (typeof timeVal === 'string' && /^\d{1,2}:\d{2}$/.test(timeVal)) {
            // It's a HH:mm string, anchor it to the record's date
            const [h, m] = timeVal.split(':').map(Number)
            loggedAt = new Date(record.date)
            loggedAt.setUTCHours(h || 0, m || 0, 0, 0)
          } else if (timeVal) {
            loggedAt = new Date(timeVal)
          }

          if (loggedAt && !isNaN(loggedAt.getTime())) {
            allLoggedItems.push({
              id: item.id || `${record.id}-${meal}-${item.name}`,
              name: item.name,
              carbs: item.carbs || 0,
              calories: item.calories || 0,
              loggedAt,
              mealType: meal
            })
          }
        })
      }
    }

    // Sort by loggedAt desc and take top 3
    const recentItems = allLoggedItems
      .sort((a, b) => b.loggedAt.getTime() - a.loggedAt.getTime())
      .slice(0, 3)
      .map((item) => {
        const profile = getProfileForItem(item.name)
        const minsSince = Math.max(0, (now.getTime() - item.loggedAt.getTime()) / 60000)

        // Calculate absorption percentage
        // We approximate by summing intervals of 5 mins
        let absorbed = 0
        for (let t = 0; t < minsSince; t += 5) {
          absorbed += getAbsorbedInInterval(t, t + 5, item.carbs, profile)
        }

        const absorptionProgress = Math.min(100, Math.round((absorbed / item.carbs) * 100)) || 0

        return {
          ...item,
          absorptionProgress,
          profileLabel: profile.label
        }
      })

    return {
      success: true,
      nextWindow: context.nextFuelingWindow,
      suggestedIntake: context.suggestedIntakeNow,
      mealRecommendation: mealRec || null,
      recentItems,
      currentTank: context.currentTank
    }
  } catch (error: any) {
    console.error('Error fetching active fueling feed:', error)
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to fetch active fueling feed'
    })
  }
})
