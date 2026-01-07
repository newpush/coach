import 'dotenv/config'
import { prisma } from '../server/utils/db'

async function main() {
  console.log('Finding a training plan...')

  const plan = await prisma.trainingPlan.findFirst({
    where: {
      status: 'ACTIVE'
    },
    include: {
      user: true
    }
  })

  if (!plan) {
    console.log('No active training plan found.')
    return
  }

  console.log(`Found plan: ${plan.name} (${plan.id}) for user ${plan.user.email}`)

  console.log('Generating share token via API logic simulation...')

  // Simulate the API logic directly here since we can't easily call the API from a script without auth
  const userId = plan.userId
  const resourceType = 'TRAINING_PLAN'
  const resourceId = plan.id

  let shareToken = await prisma.shareToken.findFirst({
    where: { userId, resourceType, resourceId }
  })

  if (!shareToken) {
    shareToken = await prisma.shareToken.create({
      data: {
        userId,
        resourceType,
        resourceId
      }
    })
    console.log('Created new share token.')
  } else {
    console.log('Found existing share token.')
  }

  console.log('\n-----------------------------------')
  console.log(`Share URL: http://localhost:3000/share/plan/${shareToken.token}`)
  console.log('-----------------------------------\n')

  // Verify the GET logic (ensure we can fetch it back)
  console.log('Verifying data fetch...')
  const data = await prisma.trainingPlan.findUnique({
    where: { id: resourceId },
    include: {
      goal: true,
      blocks: {
        orderBy: { order: 'asc' },
        include: {
          weeks: {
            orderBy: { weekNumber: 'asc' },
            include: {
              workouts: {
                orderBy: { date: 'asc' },
                include: {
                  // shareToken: true
                }
              }
            }
          }
        }
      }
    }
  })

  if (data) {
    console.log(`Successfully fetched plan data. Blocks: ${data.blocks.length}`)
    if (
      data.blocks.length > 0 &&
      data.blocks[0].weeks.length > 0 &&
      data.blocks[0].weeks[0].workouts.length > 0
    ) {
      const w = data.blocks[0].weeks[0].workouts[0]
      console.log(`Sample workout: ${w.title}`)
      console.log(
        `Workout Share Token: ${w.shareToken?.token || 'MISSING (This is expected if not accessed via API logic which auto-generates them)'}`
      )
    }
  } else {
    console.error('Failed to fetch plan data.')
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
