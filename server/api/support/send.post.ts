import { getServerSession } from '../../utils/session'
import { createAutotaskTicket } from '../../utils/autotask'
import { prisma } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const session = await getServerSession(event)

  const { subject, message, email, name } = body

  if (!subject || !message) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Subject and message are required'
    })
  }

  // Identify user or guest
  const userId = session?.user?.id
  const userEmail = session?.user?.email || email
  const userName = session?.user?.name || name

  if (!userEmail) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Email is required (log in or provide email)'
    })
  }

  // 1. Save to database
  const supportMessage = await prisma.supportMessage.create({
    data: {
      userId: userId || null,
      email: userEmail,
      name: userName,
      subject,
      message,
      status: 'OPEN'
    }
  })

  // 2. Send to Autotask
  // Format description to include user info
  const description = `User: ${userName} (${userEmail})\nID: ${userId || 'Guest'}\n\nMessage:\n${message}`

  let ticketId: number | null = null
  try {
    ticketId = await createAutotaskTicket({
      title: subject,
      description: description,
      priority: 3 // Medium
    })
  } catch (error) {
    console.error('Failed to create Autotask ticket', error)
    // We don't fail the request if Autotask fails, but we log it.
    // Ideally we might want a retry mechanism or alert.
  }

  // 3. Update database with ticket ID
  if (ticketId) {
    await prisma.supportMessage.update({
      where: { id: supportMessage.id },
      data: {
        autotaskTicketId: ticketId.toString(),
        autotaskTicketNumber: ticketId.toString() // Assuming ID and Number are same or similar for now
      }
    })
  }

  return {
    success: true,
    messageId: supportMessage.id,
    ticketId
  }
})
