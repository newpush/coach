import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'
import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const body = await readBody(event)
  const schema = z.object({
    title: z.string().min(1),
    content: z.string().min(1),
    type: z.enum(['INFO', 'WARNING', 'ERROR', 'SUCCESS', 'ADVERT']).default('INFO'),
    isActive: z.boolean().default(true),
    targetUrl: z.string().optional().nullable(),
    actionLabel: z.string().optional().nullable(),
    expiresAt: z.string().nullable().optional() // ISO string
  })

  const result = schema.safeParse(body)
  if (!result.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid data' })
  }

  const message = await prisma.systemMessage.create({
    data: {
      title: result.data.title,
      content: result.data.content,
      type: result.data.type,
      isActive: result.data.isActive,
      targetUrl: result.data.targetUrl,
      actionLabel: result.data.actionLabel,
      expiresAt: result.data.expiresAt ? new Date(result.data.expiresAt) : null
    }
  })

  return { message }
})
