import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Checking Nutrition table...')

  const count = await prisma.nutrition.count()
  console.log(`Total nutrition entries: ${count}`)

  if (count > 0) {
    const sample = await prisma.nutrition.findMany({
      take: 5,
      orderBy: { date: 'desc' },
      select: {
        id: true,
        date: true,
        calories: true,
        protein: true,
        carbs: true,
        fat: true,
        userId: true
      }
    })

    console.log('\nSample entries:')
    console.log(JSON.stringify(sample, null, 2))
  }

  await prisma.$disconnect()
}

main().catch(console.error)
