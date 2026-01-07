import {
  detectIntervals,
  findPeakEfforts,
  calculateHeartRateRecovery
} from '../server/utils/interval-detection'

// Mock Data Generators
function generateSineWave(
  duration: number,
  period: number,
  amplitude: number,
  offset: number
): number[] {
  const data: number[] = []
  for (let i = 0; i < duration; i++) {
    data.push(offset + amplitude * Math.sin((2 * Math.PI * i) / period) + (Math.random() * 5 - 2.5))
  }
  return data
}

function generateIntervals(duration: number): { time: number[]; power: number[]; hr: number[] } {
  const time: number[] = []
  const power: number[] = []
  const hr: number[] = []

  let currentPower = 150
  let currentHr = 120

  for (let i = 0; i < duration; i++) {
    time.push(i)

    // Simulate 5x5min intervals with 5min recovery
    // Interval starts every 10 mins (600s), lasts 5 mins (300s)
    const cycle = i % 600
    if (cycle < 300 && i > 600) {
      // Work interval (starts after 10m warmup)
      currentPower = 250 + (Math.random() * 20 - 10)
      currentHr = Math.min(170, currentHr + 0.5)
    } else {
      // Recovery
      currentPower = 150 + (Math.random() * 20 - 10)
      currentHr = Math.max(120, currentHr - 0.3)
    }

    power.push(currentPower)
    hr.push(currentHr + (Math.random() * 2 - 1))
  }

  return { time, power, hr }
}

async function runTests() {
  console.log('Running Interval Detection Tests...')

  // Test 1: Cycling Intervals (Power)
  console.log('\nTest 1: Cycling Intervals (Power based)')
  const data = generateIntervals(3600) // 1 hour
  const intervals = detectIntervals(data.time, data.power, 'power', 200) // Threshold 200W

  console.log(`Detected ${intervals.length} segments`)
  const workIntervals = intervals.filter((i) => i.type === 'WORK')
  console.log(`Detected ${workIntervals.length} WORK intervals (Expected: ~3-4)`)

  workIntervals.forEach((interval, idx) => {
    console.log(
      `  Interval ${idx + 1}: ${interval.duration}s @ ~${Math.round(interval.avg_power!)}W`
    )
  })

  // Test 2: Peak Efforts
  console.log('\nTest 2: Peak Efforts')
  const peaks = findPeakEfforts(data.time, data.power, 'power')
  console.log(
    'Found peaks:',
    peaks.map((p) => `${p.duration_label}: ${p.value}W`)
  )

  // Test 3: HR Recovery
  console.log('\nTest 3: Heart Rate Recovery')
  // Inject a high HR spike at end followed by drop
  const hrData = [...data.hr]
  // Add hard effort at end
  for (let i = 0; i < 60; i++) hrData.push(180)
  // Add recovery
  for (let i = 0; i < 60; i++) hrData.push(180 - i) // Linear drop
  const extendedTime = [...data.time]
  for (let i = 0; i < 120; i++) extendedTime.push(data.time.length + i)

  const recovery = calculateHeartRateRecovery(extendedTime, hrData)
  if (recovery) {
    console.log(
      `Peak HR: ${recovery.peakHr}, Recovery HR (1min): ${recovery.recoveryHr}, Drop: ${recovery.drops}`
    )
  } else {
    console.log('No significant recovery detected')
  }
}

runTests().catch(console.error)
