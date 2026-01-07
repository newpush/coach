import 'dotenv/config'
import { prisma } from '../server/utils/db'

async function main() {
  const userId = '6cbccf6c-e5a3-4df2-8305-2584e317f1ea'
  console.log(`Checking FTP for user ID: ${userId}`)

  try {
    // Try to find by ID first, then fallback to findFirst
    const user = await (prisma as any).user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        ftp: true,
        maxHr: true,
        weight: true
      }
    })

    if (!user) {
      console.log('User not found by ID. Checking first user in DB...')
      const firstUser = await (prisma as any).user.findFirst({
        select: {
          id: true,
          email: true,
          name: true,
          ftp: true
        }
      })
      console.log('First user:', firstUser)
    } else {
      console.log('User found:', user)
    }

    // Also check the workout directly
    const workoutId = '77db85b6-4506-493c-b365-b094a4752132'
    const workout = await (prisma as any).workout.findUnique({
      where: { id: workoutId },
      select: {
        id: true,
        title: true,
        ftp: true,
        userId: true
      }
    })
    console.log('Workout found:', workout)
  } catch (error) {
    console.error('Error:', error)
  } finally {
    // Standard prisma instance from utils/db doesn't need explicit disconnect in every script
    // but good practice for standalone
    // await prisma.$disconnect()
  }
}

main()
