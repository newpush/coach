import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

async function main() {
  const connectionString = process.env.DATABASE_URL_PROD
  const pool = new pg.Pool({ connectionString })
  const adapter = new PrismaPg(pool)
  const prismaProd = new PrismaClient({ adapter })

  try {
    const remaining = await prismaProd.plannedWorkout.findFirst({
      where: { workIntensity: { gt: 2 } }
    })
    console.log('Remaining high intensity PlannedWorkout:', JSON.stringify(remaining, null, 2))
  } finally {
    await prismaProd.$disconnect()
    await pool.end()
  }
}

main()
