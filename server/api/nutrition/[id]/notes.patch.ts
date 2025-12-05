import { getServerSession } from '#auth'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  
  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const nutritionId = getRouterParam(event, 'id')
  if (!nutritionId) {
    throw createError({
      statusCode: 400,
      message: 'Nutrition ID is required'
    })
  }

  const body = await readBody(event)
  const { notes } = body

  if (typeof notes !== 'string' && notes !== null) {
    throw createError({
      statusCode: 400,
      message: 'Notes must be a string or null'
    })
  }

  // Verify the nutrition entry belongs to the user
  const nutrition = await prisma.nutrition.findUnique({
    where: { id: nutritionId },
    select: { userId: true }
  })

  if (!nutrition) {
    throw createError({
      statusCode: 404,
      message: 'Nutrition entry not found'
    })
  }

  if (nutrition.userId !== (session.user as any).id) {
    throw createError({
      statusCode: 403,
      message: 'You do not have permission to update this nutrition entry'
    })
  }

  // Update the nutrition notes
  const updatedNutrition = await prisma.nutrition.update({
    where: { id: nutritionId },
    data: {
      notes: notes,
      notesUpdatedAt: new Date()
    },
    select: {
      id: true,
      notes: true,
      notesUpdatedAt: true
    }
  })

  return {
    success: true,
    nutrition: updatedNutrition
  }
})