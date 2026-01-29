import { dailyCheckinRepository } from '../repositories/dailyCheckinRepository'
import { formatUserDate, getUserLocalDate, getUserTimezone } from '../date'
import { generateDailyCheckinTask } from '../../../trigger/daily-checkin'
import { auditLogRepository } from '../repositories/auditLogRepository'

/**
 * Triggers a daily check-in generation if one doesn't exist for the user's current day.
 */
export async function triggerDailyCheckinIfNeeded(userId: string) {
  try {
    const timezone = await getUserTimezone(userId)
    const today = getUserLocalDate(timezone)

    // Check if check-in already exists for today
    const existing = await dailyCheckinRepository.getByDate(userId, today)

    if (existing) {
      return { triggered: false, reason: 'Daily check-in already exists for today' }
    }

    console.log(
      `🤖 [Auto-Analyze] [DailyCheckin] Triggering check-in generation for user ${userId} on ${today.toISOString()}`
    )

    await generateDailyCheckinTask.trigger(
      {
        userId,
        date: today
      },
      {
        concurrencyKey: userId,
        tags: [`user:${userId}`]
      }
    )

    // Log the action
    await auditLogRepository.log({
      userId,
      action: 'AUTO_GENERATE_CHECKIN',
      resourceType: 'DailyCheckin',
      metadata: { date: today.toISOString(), source: 'webhook' }
    })

    return { triggered: true }
  } catch (error) {
    console.error(`[DailyCheckin] Failed to trigger check-in for user ${userId}:`, error)
    return { triggered: false, error }
  }
}

/**
 * Fetches and formats completed daily check-ins for a given date range.
 * Returns a formatted string suitable for AI prompts.
 */
export async function getCheckinHistoryContext(
  userId: string,
  startDate: Date,
  endDate: Date,
  timezone: string
): Promise<string> {
  const checkins = await dailyCheckinRepository.getHistory(userId, startDate, endDate)

  if (checkins.length === 0) {
    return ''
  }

  return checkins
    .map((c) => {
      const qs = c.questions as any[]
      // Only include questions that have an answer
      const answeredQuestions = qs.filter((q) => q.answer)

      if (answeredQuestions.length === 0 && !c.userNotes) return null

      const dateStr = formatUserDate(c.date, timezone, 'yyyy-MM-dd')
      let content = ''

      if (answeredQuestions.length > 0) {
        content += answeredQuestions
          .map(
            (q) => `  * Q: "${q.text}"
    A: ${q.answer}`
          )
          .join('\n')
      }

      if (c.userNotes) {
        if (content) content += '\n'
        content += `  * User Notes: "${c.userNotes}"`
      }

      return `[${dateStr}]
${content}`
    })
    .filter(Boolean)
    .join('\n\n')
}
