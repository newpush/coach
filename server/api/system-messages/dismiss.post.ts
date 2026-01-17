import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'
import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody(event)
  const schema = z.object({
    messageId: z.string()
  })

  const result = schema.safeParse(body)
  if (!result.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body' })
  }

  // Idempotent dismissal
  try {
    await prisma.userSystemMessageDismissal.create({
      data: {
        userId: session.user.id,
        systemMessageId: result.data.messageId
      }
    })
  } catch (e: any) {
    // Ignore unique constraint violation (already dismissed)
    if (e.code !== 'P2002') {
      throw e
    }
  }

  return { success: true }
})
