import {
  calculateLapSplits,
  calculatePaceVariability,
  calculateAveragePace,
  analyzePacingStrategy,
  detectSurges
} from '../server/utils/pacing'

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}

function testPacingFunctions() {
  console.log('Testing pacing functions...')

  // Mock data: 5km run at ~5:00/km (300s/km) => 3.33 m/s
  const totalDistance = 5000
  const pacePerKm = 300 // 5 min/km
  const velocity = 1000 / pacePerKm // 3.333 m/s
  const totalTime = totalDistance / velocity // 1500s

  const timeData: number[] = []
  const distanceData: number[] = []
  const velocityData: number[] = []

  for (let i = 0; i <= totalTime; i++) {
    timeData.push(i)
    distanceData.push(i * velocity)
    velocityData.push(velocity)
  }

  // 1. Test Average Pace
  const avgPace = calculateAveragePace(totalTime, totalDistance)
  console.log(`Average Pace: ${avgPace} min/km`)
  assert(Math.abs(avgPace - 5.0) < 0.1, 'Average pace should be around 5.0')

  // 2. Test Lap Splits (should be 5 laps of 1km)
  const splits = calculateLapSplits(timeData, distanceData, 1000)
  console.log(`Lap Splits: ${splits.length}`)
  assert(splits.length === 5, 'Should have 5 splits')
  assert(Math.abs(splits[0].paceSeconds - 300) < 5, 'Lap 1 pace should be around 300s')

  // 3. Test Pace Variability (should be near 0 for constant pace)
  const variability = calculatePaceVariability(velocityData)
  console.log(`Pace Variability: ${variability}`)
  assert(variability < 0.1, 'Variability should be low for constant pace')

  // 4. Test Pacing Strategy
  const strategy = analyzePacingStrategy(splits)
  console.log(`Pacing Strategy: ${strategy.strategy}`)
  assert(
    strategy.strategy === 'even' || strategy.strategy === 'slightly_uneven',
    'Strategy should be even'
  )

  console.log('✅ All pacing function tests passed!')
}

testPacingFunctions()
