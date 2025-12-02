import { getServerSession } from '#auth'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  
  if (!session?.user) {
    throw createError({ 
      statusCode: 401,
      message: 'Unauthorized' 
    })
  }
  
  const id = getRouterParam(event, 'id')
  
  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Nutrition ID is required'
    })
  }
  
  const nutrition = await prisma.nutrition.findUnique({
    where: {
      id
    }
  })
  
  if (!nutrition) {
    throw createError({
      statusCode: 404,
      message: 'Nutrition entry not found'
    })
  }
  
  // Ensure the nutrition entry belongs to the authenticated user
  if (nutrition.userId !== (session.user as any).id) {
    throw createError({
      statusCode: 403,
      message: 'Forbidden: You do not have access to this nutrition entry'
    })
  }
  
  return nutrition
})