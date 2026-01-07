// scripts/test-advanced-analytics.ts

import {
  calculateAerobicDecoupling,
  calculateCoastingStats,
  detectSurgesAndFades
} from '../server/utils/interval-detection'

// Temporary mock of the functions until they are implemented in the file
// We will uncomment the import above and remove these mocks once the file is updated
// For now, I'll define the mock data and test expectations

console.log('Running Advanced Analytics Tests...')

// --- 1. Test Data Generation ---

function generateSteadyStateData(
  durationMinutes: number,
  startPower: number,
  driftPercent: number
) {
  const points = durationMinutes * 60
  const time = Array.from({ length: points }, (_, i) => i)
  const power = Array.from({ length: points }, () => startPower) // Constant power

  // Heart rate drifts up over time
  // Start at 140 bpm, drift up by driftPercent
  const startHr = 140
  const endHr = startHr * (1 + driftPercent)
  const heartrate = time.map((t) => startHr + (endHr - startHr) * (t / points))

  return { time, power, heartrate }
}

function generateCoastingData() {
  const points = 600 // 10 minutes
  const time = Array.from({ length: points }, (_, i) => i)

  // 50% pedaling (200W, 90rpm), 50% coasting (0W, 0rpm)
  // Segments of 60s each
  const power = []
  const cadence = []

  for (let i = 0; i < points; i++) {
    const isCoasting = Math.floor(i / 60) % 2 !== 0 // Alternate every minute
    power.push(isCoasting ? 0 : 200)
    cadence.push(isCoasting ? 0 : 90)
  }

  return { time, power, cadence }
}

function generateSurgeData() {
  const points = 600 // 10 minutes
  const time = Array.from({ length: points }, (_, i) => i)
  const ftp = 250
  const basePower = 150 // Z2

  const power = Array.from({ length: points }, () => basePower)

  // Add a surge at minute 2 (120s) for 30s at 400W (160% FTP)
  for (let i = 120; i < 150; i++) {
    power[i] = 400
  }

  // Fade after surge: drops to 100W for 30s
  for (let i = 150; i < 180; i++) {
    power[i] = 100
  }

  return { time, power, ftp }
}

// --- 2. Run Tests ---

// A. Aerobic Decoupling
console.log('\n--- Testing Aerobic Decoupling ---')
const steadyData = generateSteadyStateData(20, 200, 0.05) // 20 mins, 5% HR drift
// We expect roughly 5% decoupling
// Decoupling = (EF1 - EF2) / EF1
// EF1 ~ 200 / 141.75 = 1.41
// EF2 ~ 200 / 145.25 = 1.37
// Drift ~ (1.41 - 1.37) / 1.41 = ~2.8% (depends on exact curve)
// Actually standard definition: Power1/HR1 vs Power2/HR2
// Since Power is constant, it's just HR drift.
// HR1 avg ~ 141.25, HR2 avg ~ 145.75. Ratio ~ 3.1% drift.

try {
  // @ts-expect-error - function not yet exported
  const result = calculateAerobicDecoupling(steadyData.time, steadyData.power, steadyData.heartrate)
  console.log('Decoupling Result:', result)
} catch (e) {
  console.log('Function calculateAerobicDecoupling not implemented yet.')
}

// B. Coasting
console.log('\n--- Testing Coasting Stats ---')
const coastingData = generateCoastingData()
try {
  // @ts-expect-error - function not yet exported
  const result = calculateCoastingStats(coastingData.time, coastingData.power, coastingData.cadence)
  console.log('Coasting Result:', result)
  // Expect ~300s coasting (50%)
} catch (e) {
  console.log('Function calculateCoastingStats not implemented yet.')
}

// C. Surges (Matches)
console.log('\n--- Testing Surges/Matches ---')
const surgeData = generateSurgeData()
try {
  // @ts-expect-error - function not yet exported
  const result = detectSurgesAndFades(surgeData.time, surgeData.power, surgeData.ftp)
  console.log('Surges Result:', result)
  // Expect 1 surge, duration 30s, avg power 400W
} catch (e) {
  console.log('Function detectSurgesAndFades not implemented yet.')
}
