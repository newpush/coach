import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const reports = await prisma.report.findMany()
  console.log('Total reports:', reports.length)
  console.log(reports)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
