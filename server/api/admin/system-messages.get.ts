import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const messages = await prisma.systemMessage.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: { dismissals: true }
      }
    }
  })

  return { messages }
})
