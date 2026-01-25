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

  // Check if stuck in PENDING state (older than 30s)
  const isStuckPending =
    checkin?.status === 'PENDING' && Date.now() - checkin.updatedAt.getTime() > 30 * 1000

  // If exists and completed/pending (and not stuck), return it (unless force regenerate)
  // The UI can handle "regenerate" by passing a flag.
  const body = await readBody(event).catch(() => ({}))
  const force = body.force === true

  if (checkin && !force && !isStuckPending) {
    return checkin
  }

  if (checkin && (force || isStuckPending)) {
    // Update status to PENDING (refresh timestamp)
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
  // If forced or stuck, use a unique key to bypass idempotency TTL
  const idempotencyKey =
    force || isStuckPending ? `${checkin.id}-${Date.now()}` : checkin.id

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
      idempotencyKey,
      idempotencyKeyTTL: '1m'
    }
  )

  return checkin
})
