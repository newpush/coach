import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'
import type { BugStatus } from '@prisma/client'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = getQuery(event)
  const page = Number(query.page) || 1
  const limit = Number(query.limit) || 10
  const status = query.status as BugStatus | undefined

  const where: any = {
    userId: session.user.id
  }
  if (status) {
    where.status = status
  }

  const [count, reports] = await prisma.$transaction([
    prisma.bugReport.count({ where }),
    prisma.bugReport.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        chatRoom: {
          select: {
            name: true
          }
        }
      }
    })
  ])

  return {
    count,
    reports,
    page,
    limit,
    totalPages: Math.ceil(count / limit)
  }
})
