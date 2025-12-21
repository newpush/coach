import { defineEventHandler, readMultipartFormData, createError } from 'h3'
import { getServerSession } from '#auth'
import { prisma } from '../../utils/db'
import crypto from 'crypto'
import { tasks } from '@trigger.dev/sdk/v3'

export default defineEventHandler(async (event) => {
  // Check authentication (using NuxtAuth session)
  const session = await getServerSession(event)
  if (!session || !session.user?.email) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  })

  if (!user) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found'
    })
  }

  // Read multipart form data
  const body = await readMultipartFormData(event)
  if (!body || body.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No file uploaded'
    })
  }

  // Find the file part
  const filePart = body.find(part => part.name === 'file')
  if (!filePart) {
    throw createError({
      statusCode: 400,
      statusMessage: 'File field missing'
    })
  }

  // Validate filename
  const filename = filePart.filename || 'upload.fit'
  if (!filename.toLowerCase().endsWith('.fit')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid file type. Only .fit files are supported.'
    })
  }

  const fileData = filePart.data
  
  // Calculate hash
  const hash = crypto.createHash('sha256').update(fileData).digest('hex')

  // Check for duplicates
  const existingFile = await prisma.fitFile.findFirst({
    where: { hash }
  })

  if (existingFile) {
    return {
      success: true,
      message: 'File already uploaded',
      fitFileId: existingFile.id,
      duplicate: true
    }
  }

  // Store file in DB
  const fitFile = await prisma.fitFile.create({
    data: {
      userId: user.id,
      filename,
      fileData: Buffer.from(fileData),
      hash
    }
  })

  // Trigger ingestion task
  await tasks.trigger('ingest-fit-file', {
    userId: user.id,
    fitFileId: fitFile.id
  })

  return {
    success: true,
    message: 'File uploaded and processing started',
    fitFileId: fitFile.id
  }
})
