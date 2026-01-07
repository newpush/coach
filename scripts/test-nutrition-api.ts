import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

async function testNutritionAccess() {
  console.log('Testing Prisma Nutrition model access...')

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
  })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter })

  try {
    // Test that Nutrition model exists
    console.log('1. Checking if Nutrition model exists in Prisma client...')
    if (!prisma.nutrition) {
      console.error('❌ Nutrition model NOT found in Prisma client!')
      console.log(
        'Available models:',
        Object.keys(prisma).filter((k) => !k.startsWith('_') && !k.startsWith('$'))
      )
      return
    }
    console.log('✅ Nutrition model exists in Prisma client')

    // Test querying nutrition data
    console.log('\n2. Querying nutrition data...')
    const nutrition = await prisma.nutrition.findMany({
      orderBy: { date: 'desc' },
      take: 5
    })

    console.log(`✅ Found ${nutrition.length} nutrition records`)
    if (nutrition.length > 0) {
      console.log('\nFirst record:')
      console.log({
        date: nutrition[0].date,
        calories: nutrition[0].calories,
        protein: nutrition[0].protein,
        carbs: nutrition[0].carbs,
        fat: nutrition[0].fat
      })
    }

    console.log('\n✅ All tests passed! Nutrition model is working correctly.')
  } catch (error) {
    console.error('❌ Error testing Nutrition model:', error)
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}

testNutritionAccess()
