import { prisma } from '../server/utils/db'

async function checkWellnessData() {
  // Find user by email (adjust this to your email)
  const user = await prisma.user.findFirst({
    where: {
      // Add a filter here, or just get first user
    },
    select: {
      id: true,
      email: true,
      name: true,
      ftp: true,
      weight: true,
      maxHr: true,
      dob: true
    }
  })

  console.log('User:', user)

  if (!user) {
    console.log('No user found')
    return
  }

  // Get wellness data for last 7 days
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const wellness = await prisma.wellness.findMany({
    where: {
      userId: user.id,
      date: {
        gte: sevenDaysAgo
      }
    },
    orderBy: {
      date: 'desc'
    },
    take: 10
  })

  console.log('\nWellness records found:', wellness.length)
  wellness.forEach((w) => {
    console.log(`\nDate: ${w.date.toISOString().split('T')[0]}`)
    console.log(`  Resting HR: ${w.restingHr}`)
    console.log(`  HRV: ${w.hrv}`)
    console.log(`  Weight: ${w.weight}`)
    console.log(`  Readiness: ${w.readiness}`)
  })
}

checkWellnessData()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
