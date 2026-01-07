import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import * as dotenv from 'dotenv'

dotenv.config()

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  const targetEmail = 'lracz@newpush.com'
  const user = await prisma.user.findUnique({
    where: { email: targetEmail },
    include: {
      trainingPlans: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          createdAt: true,
          status: true,
          goal: { select: { title: true } }
        }
      }
    }
  })

  if (user) {
    console.log(`Plans for ${user.email}:`)
    user.trainingPlans.forEach((p) => {
      console.log(
        ` - [${p.status}] ID: ${p.id} | Created: ${p.createdAt.toISOString()} | Goal: ${p.goal?.title}`
      )
    })
  } else {
    console.log(`User ${targetEmail} not found.`)
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
