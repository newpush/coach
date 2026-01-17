import { getServerSession } from '../../../utils/session'
import { prisma } from '../../../utils/db'
import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const id = event.context.params?.id
  const body = await readBody(event)

  const schema = z.object({
    title: z.string().min(1).optional(),
    content: z.string().min(1).optional(),
    type: z.enum(['INFO', 'WARNING', 'ERROR', 'SUCCESS']).optional(),
    isActive: z.boolean().optional(),
    expiresAt: z.string().nullable().optional()
  })

  const result = schema.safeParse(body)
  if (!result.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid data' })
  }

  // Handle undefined vs null for expiresAt explicitly
  const updateData: any = { ...result.data }
  if (result.data.expiresAt !== undefined) {
    updateData.expiresAt = result.data.expiresAt ? new Date(result.data.expiresAt) : null
  }

  const message = await prisma.systemMessage.update({
    where: { id },
    data: updateData
  })

  return { message }
})
