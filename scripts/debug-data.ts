
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const prismaClientSingleton = () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

const prisma = prismaClientSingleton()

async function main() {
  const user = await prisma.user.findFirst()
  if (!user) {
    console.log('No user found')
    return
  }

  console.log('User Profile:', {
    id: user.id,
    name: user.name,
    maxHr: user.maxHr,
    restingHr: user.restingHr,
    lthr: user.lthr,
    dob: user.dob
  })

  const recentWellness = await prisma.wellness.findMany({
    where: { userId: user.id },
    orderBy: { date: 'desc' },
    take: 5
  })

  console.log('Recent Wellness Entries:', recentWellness.map(w => ({
    date: w.date,
    restingHr: w.restingHr,
    source: 'Wellness Table'
  })))

  const recentDailyMetric = await prisma.dailyMetric.findMany({
    where: { userId: user.id },
    orderBy: { date: 'desc' },
    take: 5
  })
    
  console.log('Recent DailyMetric Entries:', recentDailyMetric.map(d => ({
    date: d.date,
    restingHr: d.restingHr,
    source: 'DailyMetric Table'
  })))
  
  // Check Integration status
  const integration = await prisma.integration.findFirst({
      where: { userId: user.id, provider: 'intervals' }
  })
  
  console.log('Intervals Integration:', integration ? {
      syncStatus: integration.syncStatus,
      lastSyncAt: integration.lastSyncAt,
      errorMessage: integration.errorMessage
  } : 'Not connected')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
