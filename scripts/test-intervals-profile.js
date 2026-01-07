#!/usr/bin/env node

/**
 * Test script for Intervals.icu Athlete Profile API
 * Usage: node scripts/test-intervals-profile.js
 *
 * This script fetches athlete profile data including:
 * - Basic info (name, email, etc.)
 * - FTP (Functional Threshold Power)
 * - Weight
 * - Age, sex/gender
 * - Recent HRV data
 * - Other profile settings
 */

const INTERVALS_API_KEY = '5z5u643ddzab85f5ou2itlxog'
const INTERVALS_ATHLETE_ID = 'i434414'

async function fetchWithAuth(url) {
  const auth = Buffer.from(`API_KEY:${INTERVALS_API_KEY}`).toString('base64')

  console.log(`\nFetching: ${url}`)
  console.log(`Auth: Basic ${auth.substring(0, 20)}...`)

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`
    }
  })

  console.log(`Status: ${response.status} ${response.statusText}`)

  if (response.ok) {
    return await response.json()
  } else {
    const error = await response.text()
    console.log(`❌ Error: ${error}`)
    return null
  }
}

async function testAthleteProfile() {
  console.log('Testing Intervals.icu Athlete Profile API')
  console.log('==========================================\n')

  console.log('Credentials:')
  console.log(`  Athlete ID: ${INTERVALS_ATHLETE_ID}`)
  console.log(`  API Key: ${INTERVALS_API_KEY.substring(0, 8)}...\n`)

  // 1. Fetch basic athlete info
  console.log('\n1. BASIC ATHLETE INFO')
  console.log('=====================')
  const athlete = await fetchWithAuth(
    `https://intervals.icu/api/v1/athlete/${INTERVALS_ATHLETE_ID}`
  )

  if (athlete) {
    console.log('\n✅ SUCCESS! Athlete Data:')
    console.log(JSON.stringify(athlete, null, 2))
    console.log('\nKey Profile Fields:')
    console.log(`  Name: ${athlete.name || 'N/A'}`)
    console.log(`  Email: ${athlete.email || 'N/A'}`)
    console.log(`  Weight: ${athlete.icu_weight || athlete.weight || 'N/A'} kg`)
    console.log(`  Sex: ${athlete.sex || 'N/A'}`)
    console.log(`  DOB: ${athlete.icu_date_of_birth || athlete.dob || 'N/A'}`)
    console.log(
      `  Age: ${athlete.icu_date_of_birth ? calculateAge(athlete.icu_date_of_birth) : 'N/A'} years`
    )
    console.log(`  Resting HR: ${athlete.icu_resting_hr || athlete.resting_hr || 'N/A'} bpm`)
    console.log(
      `  Location: ${[athlete.city, athlete.state, athlete.country].filter(Boolean).join(', ') || 'N/A'}`
    )

    // Extract FTP and other metrics from type settings (per activity type)
    console.log('\n  Activity Type Settings:')
    if (athlete.icu_type_settings && athlete.icu_type_settings.length > 0) {
      athlete.icu_type_settings.forEach((typeSetting) => {
        const types = typeSetting.types ? typeSetting.types.join(', ') : 'Unknown'
        console.log(`\n    ${types}:`)
        if (typeSetting.ftp) console.log(`      FTP: ${typeSetting.ftp} W`)
        if (typeSetting.lthr) console.log(`      LTHR: ${typeSetting.lthr} bpm`)
        if (typeSetting.max_hr) console.log(`      Max HR: ${typeSetting.max_hr} bpm`)
        if (typeSetting.threshold_pace)
          console.log(
            `      Threshold Pace: ${typeSetting.threshold_pace} ${typeSetting.pace_units || ''}`
          )
      })
    } else {
      console.log('    No type settings found')
    }
  }

  // 2. Fetch recent wellness data for HRV
  console.log('\n\n2. RECENT WELLNESS DATA (for HRV)')
  console.log('==================================')

  const today = new Date()
  const lastWeek = new Date(today)
  lastWeek.setDate(lastWeek.getDate() - 7)

  console.log(`\nFetching wellness data for last 7 days...`)

  const wellnessData = []
  for (let i = 0; i < 7; i++) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]

    const wellness = await fetchWithAuth(
      `https://intervals.icu/api/v1/athlete/${INTERVALS_ATHLETE_ID}/wellness/${dateStr}`
    )

    if (wellness && Object.keys(wellness).length > 0) {
      wellnessData.push({ date: dateStr, ...wellness })
    }
  }

  if (wellnessData.length > 0) {
    console.log(`\n✅ Found ${wellnessData.length} days of wellness data\n`)

    wellnessData.forEach((day, index) => {
      console.log(`Day ${index + 1} (${day.date}):`)
      console.log(`  HRV: ${day.hrv || 'N/A'} ms`)
      console.log(`  HRV SDNN: ${day.hrvSDNN || 'N/A'} ms`)
      console.log(`  Resting HR: ${day.restingHR || 'N/A'} bpm`)
      console.log(`  Weight: ${day.weight || 'N/A'} kg`)
      console.log(`  Sleep: ${day.sleepSecs ? (day.sleepSecs / 3600).toFixed(1) + 'h' : 'N/A'}`)
      console.log(`  Readiness: ${day.readiness || 'N/A'}`)
      console.log(`  Soreness: ${day.soreness || 'N/A'}`)
      console.log(`  Fatigue: ${day.fatigue || 'N/A'}`)
      console.log('')
    })

    // Calculate recent HRV average
    const recentHrvValues = wellnessData.map((d) => d.hrv).filter((v) => v != null)

    if (recentHrvValues.length > 0) {
      const avgHrv = (recentHrvValues.reduce((a, b) => a + b, 0) / recentHrvValues.length).toFixed(
        1
      )
      console.log(`📊 Recent HRV Average (${recentHrvValues.length} days): ${avgHrv} ms`)
    }
  } else {
    console.log('⚠️ No wellness data found for recent days')
  }

  // 3. Fetch athlete settings/power zones if available
  console.log('\n\n3. POWER ZONES & TRAINING SETTINGS')
  console.log('===================================')
  const settings = await fetchWithAuth(
    `https://intervals.icu/api/v1/athlete/${INTERVALS_ATHLETE_ID}/power-zones`
  )

  if (settings) {
    console.log('\n✅ Power Zones:')
    console.log(JSON.stringify(settings, null, 2))
  }

  // 4. Compile athlete profile summary
  console.log('\n\n4. ATHLETE PROFILE SUMMARY')
  console.log('========================')

  if (athlete) {
    // Extract FTP from type settings (prefer cycling/ride FTP)
    let ftp = null
    let lthr = null
    let maxHR = null

    if (athlete.icu_type_settings && athlete.icu_type_settings.length > 0) {
      // Look for cycling/ride FTP first
      const cyclingSettings = athlete.icu_type_settings.find(
        (s) => s.types && (s.types.includes('Ride') || s.types.includes('VirtualRide'))
      )
      if (cyclingSettings) {
        ftp = cyclingSettings.ftp
        lthr = cyclingSettings.lthr
        maxHR = cyclingSettings.max_hr
      } else {
        // Use first type setting with FTP
        const firstWithFtp = athlete.icu_type_settings.find((s) => s.ftp)
        if (firstWithFtp) {
          ftp = firstWithFtp.ftp
          lthr = firstWithFtp.lthr
          maxHR = firstWithFtp.max_hr
        }
      }
    }

    const profile = {
      // Basic info
      name: athlete.name,
      email: athlete.email,
      sex: athlete.sex,
      dateOfBirth: athlete.icu_date_of_birth,
      age: athlete.icu_date_of_birth ? calculateAge(athlete.icu_date_of_birth) : null,
      location: {
        city: athlete.city,
        state: athlete.state,
        country: athlete.country
      },

      // Physical metrics
      weight: athlete.icu_weight || athlete.weight,
      restingHR: athlete.icu_resting_hr,

      // Performance metrics (from type settings)
      ftp: ftp,
      lthr: lthr,
      maxHR: maxHR,

      // Recent wellness
      recentHRV: wellnessData.length > 0 ? wellnessData[0].hrv : null,
      avgRecentHRV:
        wellnessData.length > 0
          ? parseFloat(calculateAverage(wellnessData.map((d) => d.hrv).filter((v) => v != null)))
          : null,
      recentWeight: wellnessData.length > 0 ? wellnessData.find((d) => d.weight)?.weight : null,

      // Preferences
      timezone: athlete.timezone,
      locale: athlete.locale,
      measurementPreference: athlete.measurement_preference
    }

    console.log('\n📋 Complete Athlete Profile:')
    console.log(JSON.stringify(profile, null, 2))
  }

  console.log('\n✅ Test completed!')
}

function calculateAge(dob) {
  if (!dob) return null
  const birthDate = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--
  }
  return age
}

function calculateAverage(values) {
  if (values.length === 0) return null
  return (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)
}

// Run the test
testAthleteProfile().catch(console.error)
