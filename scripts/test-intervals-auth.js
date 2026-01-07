#!/usr/bin/env node

/**
 * Test script for Intervals.icu API authentication
 * Usage: node scripts/test-intervals-auth.js
 */

const INTERVALS_API_KEY = '5z5u643ddzab85f5ou2itlxog'
const INTERVALS_ATHLETE_ID = 'i434414'

async function testIntervalsAuth() {
  console.log('Testing Intervals.icu API Authentication')
  console.log('=========================================\n')

  console.log('Credentials:')
  console.log(`  Athlete ID: ${INTERVALS_ATHLETE_ID}`)
  console.log(`  API Key: ${INTERVALS_API_KEY.substring(0, 8)}...\n`)

  // Test 1: Using athlete ID as username
  console.log('Test 1: Authentication with athleteId:apiKey')
  console.log('-----------------------------------------------')
  try {
    const auth1 = Buffer.from(`${INTERVALS_ATHLETE_ID}:${INTERVALS_API_KEY}`).toString('base64')
    console.log(`Auth Header: Basic ${auth1.substring(0, 20)}...`)

    const response1 = await fetch(`https://intervals.icu/api/v1/athlete/${INTERVALS_ATHLETE_ID}`, {
      headers: {
        Authorization: `Basic ${auth1}`
      }
    })

    console.log(`Status: ${response1.status} ${response1.statusText}`)

    if (response1.ok) {
      const data = await response1.json()
      console.log('✅ SUCCESS!')
      console.log(`Athlete: ${data.name} (${data.email})`)
    } else {
      const error = await response1.text()
      console.log('❌ FAILED')
      console.log(`Error: ${error}`)
    }
  } catch (error) {
    console.log('❌ ERROR:', error.message)
  }

  console.log('\n')

  // Test 2: Using API_KEY as username
  console.log('Test 2: Authentication with API_KEY:apiKey')
  console.log('-----------------------------------------------')
  try {
    const auth2 = Buffer.from(`API_KEY:${INTERVALS_API_KEY}`).toString('base64')
    console.log(`Auth Header: Basic ${auth2.substring(0, 20)}...`)

    const response2 = await fetch(`https://intervals.icu/api/v1/athlete/${INTERVALS_ATHLETE_ID}`, {
      headers: {
        Authorization: `Basic ${auth2}`
      }
    })

    console.log(`Status: ${response2.status} ${response2.statusText}`)

    if (response2.ok) {
      const data = await response2.json()
      console.log('✅ SUCCESS!')
      console.log(`Athlete: ${data.name} (${data.email})`)
    } else {
      const error = await response2.text()
      console.log('❌ FAILED')
      console.log(`Error: ${error}`)
    }
  } catch (error) {
    console.log('❌ ERROR:', error.message)
  }

  console.log('\n')

  // Test 3: Using i0 (current user) endpoint
  console.log('Test 3: Using i0 endpoint with API_KEY:apiKey')
  console.log('-----------------------------------------------')
  try {
    const auth3 = Buffer.from(`API_KEY:${INTERVALS_API_KEY}`).toString('base64')
    console.log(`Auth Header: Basic ${auth3.substring(0, 20)}...`)

    const response3 = await fetch('https://intervals.icu/api/v1/athlete/i0', {
      headers: {
        Authorization: `Basic ${auth3}`
      }
    })

    console.log(`Status: ${response3.status} ${response3.statusText}`)

    if (response3.ok) {
      const data = await response3.json()
      console.log('✅ SUCCESS!')
      console.log(`Athlete: ${data.name} (${data.email})`)
      console.log(`Athlete ID: ${data.id}`)
    } else {
      const error = await response3.text()
      console.log('❌ FAILED')
      console.log(`Error: ${error}`)
    }
  } catch (error) {
    console.log('❌ ERROR:', error.message)
  }
}

// Run the tests
testIntervalsAuth().catch(console.error)
