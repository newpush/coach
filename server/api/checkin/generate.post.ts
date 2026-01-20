import { dailyCheckinRepository } from '../../utils/repositories/dailyCheckinRepository'
import { getUserTimezone, getUserLocalDate } from '../../utils/date'
import { tasks } from '@trigger.dev/sdk/v3'
import type { generateDailyCheckinTask } from '../../../trigger/daily-checkin'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const userId = session.user.id
  const timezone = await getUserTimezone(userId)
  const today = getUserLocalDate(timezone)

  // Check if already exists
  let checkin = await dailyCheckinRepository.getByDate(userId, today)

  // If exists and completed/pending, return it (unless force regenerate?)
  // The UI can handle "regenerate" by passing a flag, but for now let's keep it simple.
  // If the user explicitly asks to generate, and it's already there, maybe we should just return it?
  // But the prompt says "regenerate button". So we might need to handle re-creation.

  const body = await readBody(event).catch(() => ({}))
  const force = body.force === true

  if (checkin && !force) {
    return checkin
  }

  if (checkin && force) {
    // Update status to PENDING
    checkin = await dailyCheckinRepository.update(checkin.id, { status: 'PENDING' })
  } else {
    // Create new
    checkin = await dailyCheckinRepository.create({
      user: { connect: { id: userId } },
      date: today,
      questions: [],
      status: 'PENDING'
    })
  }

  // Trigger the task
  await tasks.trigger<typeof generateDailyCheckinTask>(
    'generate-daily-checkin',
    {
      userId,
      date: today,
      checkinId: checkin.id
    },
    {
      concurrencyKey: userId,
      tags: [`user:${userId}`],
      idempotencyKey: checkin.id,
      idempotencyKeyTTL: '1m'
    }
  )

  return checkin
})
