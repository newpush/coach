import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  try {
    const result = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'FitFile';
    `
    console.log('Table check result:', result)

    // Also try to count
    try {
      const count = await prisma.fitFile.count()
      console.log('FitFile count:', count)
    } catch (e) {
      console.error('Error querying FitFile model:', e.message)
    }
  } catch (e) {
    console.error('Error:', e)
  } finally {
    await prisma.$disconnect()
  }
}

main()
