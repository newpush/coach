import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const userId = session.user.id

  const activeMessage = await prisma.systemMessage.findFirst({
    where: {
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      dismissals: {
        none: {
          userId: userId
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  })

  return { message: activeMessage }
})
