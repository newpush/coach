import { prisma } from './server/utils/db'
import { IntervalsService } from './server/utils/services/intervalsService'
import { fetchIntervalsWellness } from './server/utils/intervals'

async function debugUserWellness(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { integrations: true }
  })

  if (!user) {
    console.error('User not found')
    return
  }

  const integration = user.integrations.find((i) => i.provider === 'intervals')
  if (!integration) {
    console.error('Intervals integration not found')
    return
  }

  console.log(`Debugging wellness for ${email}`)
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(endDate.getDate() - 14)

  const wellnessData = await fetchIntervalsWellness(integration, startDate, endDate)

  console.log(`Fetched ${wellnessData.length} records`)

  for (const w of wellnessData) {
    console.log(`Date: ${w.id}`)
    console.log(`  hrv: ${w.hrv}`)
    console.log(`  hrvSDNN: ${w.hrvSDNN}`)
    console.log(`  restingHR: ${w.restingHR}`)
    // Log all keys that are NOT null
    const nonNullKeys = Object.entries(w)
      .filter(([_, v]) => v !== null && v !== undefined)
      .map(([k, _]) => k)
    console.log(`  Non-null keys: ${nonNullKeys.join(', ')}`)
    console.log('---')
  }
}

debugUserWellness('lracz@newpush.com').catch(console.error)
