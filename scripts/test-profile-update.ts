
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { athleteMetricsService } from '../server/utils/athleteMetricsService'

const prismaClientSingleton = () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

const prisma = prismaClientSingleton()

// Mock repositories since we can't easily import them with the relative path issues in scripts
// We'll just call the service if we can import it, OR replicate the logic.
// Replicating logic is safer to verify the DB interaction.

async function main() {
  const user = await prisma.user.findFirst()
  if (!user) {
    console.log('No user found')
    return
  }

  console.log('Before Update:', { maxHr: user.maxHr })

  // Simulate update
  const newMaxHr = 195
  
  await prisma.user.update({
    where: { id: user.id },
    data: { maxHr: newMaxHr }
  })
  
  const updatedUser = await prisma.user.findUnique({ where: { id: user.id } })
  console.log('After Update:', { maxHr: updatedUser?.maxHr })
  
  // Revert
  await prisma.user.update({
    where: { id: user.id },
    data: { maxHr: user.maxHr }
  })
  console.log('Reverted to:', { maxHr: user.maxHr })
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
