import { Command } from 'commander'
import { prisma } from '../../server/utils/db'
import { Prisma } from '@prisma/client'

const gpsCommand = new Command('gps')
  .description('Check GPS data format in workout streams')
  .option('-w, --workout <id>', 'Check specific workout ID')
  .action(async (options) => {
    console.log('Checking GPS data...')

    try {
      let streams

      if (options.workout) {
        streams = await prisma.workoutStream.findMany({
          where: {
            workoutId: options.workout,
            latlng: { not: Prisma.JsonNull }
          },
          select: {
            id: true,
            workoutId: true,
            latlng: true,
            workout: { select: { title: true, source: true } }
          }
        })
      } else {
        streams = await prisma.workoutStream.findMany({
          where: {
            latlng: { not: Prisma.JsonNull }
          },
          take: 5,
          select: {
            id: true,
            workoutId: true,
            latlng: true,
            workout: { select: { title: true, source: true } }
          }
        })
      }

      if (streams.length === 0) {
        console.log('No streams with latlng data found.')
        return
      }

      console.log(`Found ${streams.length} streams with latlng data.`)

      for (const stream of streams) {
        console.log(
          `\nWorkout: ${stream.workout.title} (${stream.workout.source}) [ID: ${stream.workoutId}]`
        )
        const coords = stream.latlng as any[]

        if (!Array.isArray(coords)) {
          console.log('❌ latlng is NOT an array!')
          continue
        }

        console.log(`✅ latlng is an array with ${coords.length} points.`)

        if (coords.length > 0) {
          const firstPoint = coords[0]
          const sample = JSON.stringify(coords.slice(0, 3))
          console.log(`   Sample: ${sample}`)

          if (
            Array.isArray(firstPoint) &&
            firstPoint.length === 2 &&
            typeof firstPoint[0] === 'number'
          ) {
            console.log('✅ Format is standard [lat, lng]')
          } else {
            console.log(`⚠️  Format is NOT [lat, lng]. First point: ${JSON.stringify(firstPoint)}`)
          }
        }
      }
    } catch (e) {
      console.error('Error checking GPS data:', e)
    } finally {
      await prisma.$disconnect()
    }
  })

export default gpsCommand
