import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { prisma } from '../server/utils/db'
import { workoutRepository } from '../server/utils/repositories/workoutRepository'
import { parseFitFile, normalizeFitSession, extractFitStreams } from '../server/utils/fit'

async function main() {
  const userId = process.argv[2]
  const filePath = process.argv[3]

  if (!userId || !filePath) {
    console.error('Usage: npx tsx scripts/ingest-fit-file.ts <userId> <path-to-fit-file>')
    process.exit(1)
  }

  // Validate user
  const user = await prisma.user.findUnique({
    where: { id: userId }
  })

  if (!user) {
    console.error(`User not found: ${userId}`)
    process.exit(1)
  }

  const absolutePath = path.resolve(filePath)
  if (!fs.existsSync(absolutePath)) {
    console.error(`File not found: ${absolutePath}`)
    process.exit(1)
  }

  const filename = path.basename(absolutePath)
  const fileBuffer = fs.readFileSync(absolutePath)

  // Create hash for deduplication
  const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex')

  // Check if file already uploaded
  const existingFile = await prisma.fitFile.findFirst({
    where: { hash }
  })

  if (existingFile) {
    console.log(`File already uploaded (ID: ${existingFile.id}). Skipping ingestion.`)
    return
  }

  console.log(`Parsing FIT file: ${filename}...`)
  const fitData = await parseFitFile(fileBuffer)

  // Assuming one main session for now, but FIT files can have multiple
  const session = fitData.sessions[0]
  if (!session) {
    console.error('No session data found in FIT file')
    process.exit(1)
  }

  console.log('Normalizing session data...')
  const workoutData = normalizeFitSession(session, userId, filename)

  console.log('Upserting workout...')
  // We use upsert to avoid duplicates if re-running (though hash check usually catches this)
  const workout = await workoutRepository.upsert(
    userId,
    'fit_file',
    workoutData.externalId,
    workoutData,
    workoutData
  )

  console.log('Storing FIT file...')
  await prisma.fitFile.create({
    data: {
      userId,
      filename,
      fileData: fileBuffer,
      hash,
      workoutId: workout.id
    }
  })

  console.log('Extracting and saving streams...')
  const streams = extractFitStreams(fitData.records)

  // Create stream record
  await prisma.workoutStream.upsert({
    where: { workoutId: workout.id },
    create: {
      workoutId: workout.id,
      ...streams
    },
    update: {
      ...streams
    }
  })

  console.log(`Successfully ingested workout: ${workout.id}`)
}

main().catch((e) => {
  console.error('Error:', e)
  process.exit(1)
})
