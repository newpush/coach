import { getUserLocalDate } from '../server/utils/date'

const timezones = ['UTC', 'America/New_York', 'Asia/Tokyo', 'Europe/Paris']

console.log('--- Verifying Date Logic for Subscription Limit ---')

timezones.forEach((tz) => {
  const today = getUserLocalDate(tz)
  const fourWeeksFromNow = new Date(today)
  fourWeeksFromNow.setUTCDate(today.getUTCDate() + 28)

  console.log(`\nTimezone: ${tz}`)
  console.log(`Today (User Local Midnight UTC): ${today.toISOString()}`)
  console.log(`Limit (Today + 28 days):       ${fourWeeksFromNow.toISOString()}`)

  // Test cases
  const validDate = new Date(today)
  validDate.setUTCDate(today.getUTCDate() + 27)

  const invalidDate = new Date(today)
  invalidDate.setUTCDate(today.getUTCDate() + 29)

  console.log(
    `  Test Date (Today + 27d): ${validDate.toISOString()} -> Should PASS: ${validDate <= fourWeeksFromNow}`
  )
  console.log(
    `  Test Date (Today + 29d): ${invalidDate.toISOString()} -> Should FAIL: ${invalidDate <= fourWeeksFromNow ? 'FAIL (Allowed)' : 'PASS (Blocked)'}`
  )
})
