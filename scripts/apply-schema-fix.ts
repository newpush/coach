import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Applying schema fixes to Prod DB...')

  // 1. Add isAdmin
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "User" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;`
    )
    console.log('✅ Added isAdmin column')
  } catch (e: any) {
    if (e.message.includes('already exists')) {
      console.log('ℹ️ isAdmin column already exists')
    } else {
      console.error('❌ Error adding isAdmin:', e.message)
      // Don't exit, try to continue
    }
  }

  // 2. Fix aiAutoAnalyzeNutrition
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "User" SET "aiAutoAnalyzeNutrition" = false WHERE "aiAutoAnalyzeNutrition" IS NULL;`
    )
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "User" ALTER COLUMN "aiAutoAnalyzeNutrition" SET NOT NULL;`
    )
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "User" ALTER COLUMN "aiAutoAnalyzeNutrition" SET DEFAULT false;`
    )
    console.log('✅ Fixed aiAutoAnalyzeNutrition')
  } catch (e: any) {
    console.error('❌ Error fixing aiAutoAnalyzeNutrition:', e.message)
  }

  // 3. Fix aiAutoAnalyzeWorkouts
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "User" SET "aiAutoAnalyzeWorkouts" = false WHERE "aiAutoAnalyzeWorkouts" IS NULL;`
    )
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "User" ALTER COLUMN "aiAutoAnalyzeWorkouts" SET NOT NULL;`
    )
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "User" ALTER COLUMN "aiAutoAnalyzeWorkouts" SET DEFAULT false;`
    )
    console.log('✅ Fixed aiAutoAnalyzeWorkouts')
  } catch (e: any) {
    console.error('❌ Error fixing aiAutoAnalyzeWorkouts:', e.message)
  }
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
