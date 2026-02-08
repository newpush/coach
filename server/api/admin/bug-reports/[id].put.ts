import { getServerSession } from '../../../utils/session'
import { prisma } from '../../../utils/db'
import { z } from 'zod'
import { BugStatus } from '@prisma/client'

const updateSchema = z.object({
  status: z.nativeEnum(BugStatus)
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing ID' })
  }

  const body = await readBody(event)
  const result = updateSchema.safeParse(body)

  if (!result.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid input',
      data: result.error.flatten()
    })
  }

  try {
    const report = await prisma.bugReport.update({
      where: { id },
      data: {
        status: result.data.status
      }
    })

    return report
  } catch (error: any) {
    if (error.code === 'P2025') {
      throw createError({ statusCode: 404, statusMessage: 'Bug report not found' })
    }
    throw error
  }
})
