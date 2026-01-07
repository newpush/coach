import 'dotenv/config'
import { prisma } from '../server/utils/db'
import { tasks } from '@trigger.dev/sdk/v3'

async function backfillScores() {
  console.log('🔍 Scanning for items without scores...\n')

  // Find workouts without scores
  const workoutsWithoutScores = await prisma.workout.findMany({
    where: {
      overallScore: null,
      aiAnalysisStatus: {
        in: ['COMPLETED', 'NOT_STARTED']
      }
    },
    select: {
      id: true,
      title: true,
      date: true,
      userId: true
    },
    orderBy: {
      date: 'desc'
    }
  })

  // Find nutrition entries without scores
  const nutritionWithoutScores = await prisma.nutrition.findMany({
    where: {
      overallScore: null,
      aiAnalysisStatus: {
        in: ['COMPLETED', 'NOT_STARTED']
      }
    },
    select: {
      id: true,
      date: true,
      userId: true,
      calories: true
    },
    orderBy: {
      date: 'desc'
    }
  })

  console.log(`📊 Found:`)
  console.log(`  - ${workoutsWithoutScores.length} workouts without scores`)
  console.log(`  - ${nutritionWithoutScores.length} nutrition entries without scores\n`)

  if (workoutsWithoutScores.length === 0 && nutritionWithoutScores.length === 0) {
    console.log('✅ All items already have scores!')
    return
  }

  // Ask for confirmation
  const readline = await import('readline')
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  const confirm = await new Promise<boolean>((resolve) => {
    rl.question(
      `\n⚠️  This will trigger analysis for ${workoutsWithoutScores.length + nutritionWithoutScores.length} items.\nContinue? (y/n): `,
      (answer: string) => {
        rl.close()
        resolve(answer.toLowerCase() === 'y')
      }
    )
  })

  if (!confirm) {
    console.log('❌ Cancelled')
    return
  }

  console.log('\n🚀 Starting backfill process...\n')

  // Trigger workout analyses
  let workoutCount = 0
  for (const workout of workoutsWithoutScores) {
    try {
      await tasks.trigger('analyze-workout', { workoutId: workout.id })
      workoutCount++
      console.log(
        `✓ Triggered analysis for workout: ${workout.title} (${new Date(workout.date).toLocaleDateString()})`
      )
    } catch (error) {
      console.error(`✗ Failed to trigger workout ${workout.id}:`, error)
    }
  }

  // Trigger nutrition analyses
  let nutritionCount = 0
  for (const nutrition of nutritionWithoutScores) {
    try {
      await tasks.trigger('analyze-nutrition', { nutritionId: nutrition.id })
      nutritionCount++
      console.log(
        `✓ Triggered analysis for nutrition: ${new Date(nutrition.date).toLocaleDateString()}`
      )
    } catch (error) {
      console.error(`✗ Failed to trigger nutrition ${nutrition.id}:`, error)
    }
  }

  console.log(`\n✅ Backfill complete!`)
  console.log(`   - Triggered ${workoutCount} workout analyses`)
  console.log(`   - Triggered ${nutritionCount} nutrition analyses`)
  console.log(`\n💡 Monitor progress in your trigger.dev dashboard`)
  console.log(`   Scores will be populated as analyses complete\n`)
}

// Run the script
backfillScores()
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
  .finally(() => {
    prisma.$disconnect()
  })
