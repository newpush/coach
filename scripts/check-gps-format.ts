import 'dotenv/config'
import { prisma } from '../server/utils/db'

import { Prisma } from '@prisma/client'

async function main() {
  console.log('Searching for workouts with GPS data...')

  // Find a stream that has latlng data
  // Since we can't easily query JSON content existence in Prisma/Postgres without raw SQL sometimes,
  // we'll fetch a few that likely have it.

  // Note: In Prisma, filtering by JSON content can be tricky.
  // We'll fetch streams where latlng is not null.
  const streams = await prisma.workoutStream.findMany({
    where: {
      latlng: {
        not: Prisma.JsonNull
      }
    },
    take: 5,
    select: {
      id: true,
      workoutId: true,
      latlng: true,
      workout: {
        select: {
          title: true,
          source: true
        }
      }
    }
  })

  if (streams.length === 0) {
    console.log('No streams with latlng data found.')
    return
  }

  console.log(`Found ${streams.length} streams with latlng data. Checking format...`)

  for (const stream of streams) {
    console.log(`
Workout: ${stream.workout.title} (${stream.workout.source})`)
    const coords = stream.latlng as any[]

    if (!Array.isArray(coords)) {
      console.log('latlng is NOT an array!')
      continue
    }

    console.log(`Total points: ${coords.length}`)
    if (coords.length > 0) {
      console.log('First 3 points:', JSON.stringify(coords.slice(0, 3)))
      const firstPoint = coords[0]
      console.log(`Type of first point: ${typeof firstPoint}`)
      if (Array.isArray(firstPoint)) {
        console.log('Format seems to be [lat, lng]')
      } else if (typeof firstPoint === 'object') {
        console.log('Format seems to be object {lat, lng} or similar')
        console.log('Keys:', Object.keys(firstPoint))
      }
    }
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
