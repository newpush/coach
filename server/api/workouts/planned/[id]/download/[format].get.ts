import { prisma } from '../../../../../utils/db'
import { WorkoutConverter } from '../../../../../utils/workout-converter'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const id = getRouterParam(event, 'id')
  const format = getRouterParam(event, 'format') // 'zwo' or 'fit'

  if (!id || !format || !['zwo', 'fit'].includes(format)) {
    throw createError({ statusCode: 400, message: 'Invalid request' })
  }

  const workout = await prisma.plannedWorkout.findUnique({
    where: { id, userId: session.user.id },
    include: {
      user: { select: { ftp: true, name: true } }
    }
  })

  if (!workout || !workout.structuredWorkout) {
    throw createError({ statusCode: 404, message: 'Workout not found or has no structure' })
  }

  const workoutData = {
    title: workout.title,
    description: workout.description || '',
    author: 'Coach Wattz',
    steps: (workout.structuredWorkout as any).steps,
    messages: (workout.structuredWorkout as any).messages,
    ftp: workout.user.ftp || 250
  }

  let fileData: string | Uint8Array
  let contentType: string
  let fileExt: string

  switch (format) {
    case 'zwo':
      fileData = WorkoutConverter.toZWO(workoutData)
      contentType = 'application/xml'
      fileExt = 'zwo'
      break
    case 'fit':
      fileData = WorkoutConverter.toFIT(workoutData)
      contentType = 'application/octet-stream'
      fileExt = 'fit'
      break
    case 'mrc':
      fileData = WorkoutConverter.toMRC(workoutData)
      contentType = 'text/plain'
      fileExt = 'mrc'
      break
    case 'erg':
      fileData = WorkoutConverter.toERG(workoutData)
      contentType = 'text/plain'
      fileExt = 'erg'
      break
    default:
      throw createError({ statusCode: 400, message: 'Invalid format' })
  }

  setResponseHeader(event, 'Content-Type', contentType)
  setResponseHeader(event, 'Content-Disposition', `attachment; filename="${workoutData.title.replace(/[^a-z0-9]/gi, '_')}.${fileExt}"`)

  return fileData
})
