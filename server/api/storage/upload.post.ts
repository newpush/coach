import { v4 as uuidv4 } from 'uuid'
import { getServerSession } from '#auth'

export default defineEventHandler(async (event) => {
  // 1. Check Auth
  const session = await getServerSession(event)
  if (!session) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  // 2. Read Multipart Data
  const files = await readMultipartFormData(event)
  if (!files || files.length === 0) {
    throw createError({ statusCode: 400, message: 'No file uploaded' })
  }

  // Assume single file upload
  const file = files[0]
  if (!file || !file.filename) {
    throw createError({ statusCode: 400, message: 'Invalid file' })
  }

  // 3. Validation (Basic)
  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif']
  if (!file.type || !validTypes.includes(file.type)) {
    throw createError({
      statusCode: 400,
      message: `Invalid file type: ${file.type}. Only images are allowed.`
    })
  }

  // Max size check (e.g. 5MB)
  const MAX_SIZE = 5 * 1024 * 1024
  if (file.data.length > MAX_SIZE) {
    throw createError({ statusCode: 400, message: 'File too large. Max 5MB.' })
  }

  // 4. Generate unique filename to prevent collisions
  // Extract extension or default to bin if unknown
  const ext = file.filename.split('.').pop() || 'bin'
  const userId = (session.user as any)?.id || 'anonymous'
  const uniqueFilename = `uploads/${userId}/${uuidv4()}.${ext}`

  // 5. Upload
  try {
    const url = await uploadPublicAsset(file.data, uniqueFilename, file.type)

    return {
      success: true,
      url,
      filename: uniqueFilename
    }
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      message: error.message || 'Upload failed'
    })
  }
})
