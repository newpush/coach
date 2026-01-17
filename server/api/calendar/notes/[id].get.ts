import { getServerSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const id = getRouterParam(event, 'id')
  const userId = (session.user as any).id

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Note ID is required'
    })
  }

  const note = await calendarNoteRepository.findById(id, userId)

  if (!note) {
    throw createError({
      statusCode: 404,
      message: 'Note not found'
    })
  }

  return note
})
