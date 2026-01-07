#!/usr/bin/env node

/**
 * Test script for Intervals.icu Events/Planned Workouts API
 * Usage: node scripts/test-intervals-events.js
 */

const INTERVALS_API_KEY = '5z5u643ddzab85f5ou2itlxog'
const INTERVALS_ATHLETE_ID = 'i434414'

async function testIntervalsEvents() {
  console.log('Testing Intervals.icu Events/Planned Workouts API')
  console.log('==================================================\n')

  console.log('Credentials:')
  console.log(`  Athlete ID: ${INTERVALS_ATHLETE_ID}`)
  console.log(`  API Key: ${INTERVALS_API_KEY.substring(0, 8)}...\n`)

  // Calculate date range (today + 30 days)
  const today = new Date()
  const future = new Date(today)
  future.setDate(future.getDate() + 30)

  const oldestDate = today.toISOString().split('T')[0]
  const newestDate = future.toISOString().split('T')[0]

  console.log('Date Range:')
  console.log(`  From: ${oldestDate}`)
  console.log(`  To: ${newestDate}\n`)

  console.log('Fetching Events...')
  console.log('-----------------------------------------------')

  try {
    const auth = Buffer.from(`API_KEY:${INTERVALS_API_KEY}`).toString('base64')
    const url = new URL(`https://intervals.icu/api/v1/athlete/${INTERVALS_ATHLETE_ID}/events`)
    url.searchParams.set('oldest', oldestDate)
    url.searchParams.set('newest', newestDate)

    console.log(`URL: ${url.toString()}`)
    console.log(`Auth: Basic ${auth.substring(0, 20)}...\n`)

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Basic ${auth}`
      }
    })

    console.log(`Status: ${response.status} ${response.statusText}\n`)

    if (response.ok) {
      const events = await response.json()
      console.log(`✅ SUCCESS! Fetched ${events.length} events\n`)

      // Group by category
      const byCategory = {}
      events.forEach((event) => {
        const category = event.category || 'UNCATEGORIZED'
        if (!byCategory[category]) {
          byCategory[category] = []
        }
        byCategory[category].push(event)
      })

      // Display summary
      console.log('Event Summary by Category:')
      console.log('===========================')
      Object.entries(byCategory).forEach(([category, items]) => {
        console.log(`${category}: ${items.length} event(s)`)
      })
      console.log('')

      // Display detailed events
      console.log('Detailed Events:')
      console.log('================\n')
      events.forEach((event, index) => {
        console.log(`Event ${index + 1}:`)
        console.log(`  ID: ${event.id}`)
        console.log(`  Date: ${event.start_date_local}`)
        console.log(`  Name: ${event.name}`)
        console.log(`  Category: ${event.category || 'N/A'}`)
        console.log(`  Type: ${event.type || 'N/A'}`)
        console.log(`  Description: ${event.description || 'N/A'}`)
        console.log(`  Duration: ${event.duration ? `${event.duration}s` : 'N/A'}`)
        console.log(`  Distance: ${event.distance ? `${event.distance}m` : 'N/A'}`)
        console.log(`  TSS: ${event.tss || 'N/A'}`)
        console.log(`  Work: ${event.work || 'N/A'}`)

        // Show if there's a workout document
        if (event.workout_doc) {
          console.log(`  Has Workout Doc: Yes`)
        }

        console.log('')
      })

      // Show raw JSON for first event as example
      if (events.length > 0) {
        console.log('Sample Raw Event (first event):')
        console.log('================================')
        console.log(JSON.stringify(events[0], null, 2))
      }
    } else {
      const error = await response.text()
      console.log('❌ FAILED')
      console.log(`Error: ${error}`)
    }
  } catch (error) {
    console.log('❌ ERROR:', error.message)
    console.error(error)
  }
}

// Run the test
testIntervalsEvents().catch(console.error)
