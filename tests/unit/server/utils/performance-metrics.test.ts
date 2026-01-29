import { describe, it, expect } from 'vitest'
import {
  calculateFatigueSensitivity,
  calculateStabilityMetrics,
  calculateWPrimeBalance,
  calculateEfficiencyFactorDecay,
  calculateQuadrantAnalysis
} from '../../../../server/utils/performance-metrics'

describe('Performance Metrics Utils', () => {
  describe('calculateFatigueSensitivity', () => {
    it('should return null if streams mismatch or too short', () => {
      expect(calculateFatigueSensitivity([], [], [])).toBeNull()
      expect(calculateFatigueSensitivity(new Array(500).fill(100), new Array(500).fill(100), new Array(500).fill(1))).toBeNull()
    })

    it('should calculate decay correctly', () => {
      // 1000 points.
      // First 200 (20%): Power=200, HR=100 -> EF=2.0
      // Last 200 (20%): Power=200, HR=110 -> EF=1.818
      // Decay = (2.0 - 1.818) / 2.0 = 0.091 -> 9.1%

      const length = 1000
      const power = new Array(length).fill(200)
      const hr = new Array(length).fill(100)
      const time = new Array(length).fill(0) // Not used in logic currently

      // Update last 200 HR to 110
      for (let i = 800; i < 1000; i++) {
        hr[i] = 110
      }

      const result = calculateFatigueSensitivity(power, hr, time)
      expect(result).not.toBeNull()
      expect(result!.firstPartAvg).toBeCloseTo(2.0)
      expect(result!.lastPartAvg).toBeCloseTo(1.818, 3)
      expect(result!.decay).toBeCloseTo(9.09, 1)
      expect(result!.isSignificant).toBe(true)
    })
  })

  describe('calculateStabilityMetrics', () => {
    it('should return null for empty stream', () => {
      expect(calculateStabilityMetrics([])).toBeNull()
    })

    it('should calculate CoV', () => {
      // Stream: 100, 110, 90. Mean = 100.
      // Variance = ((0)^2 + (10)^2 + (-10)^2) / 3 = 200/3 = 66.66
      // StdDev = sqrt(66.66) = 8.16
      // CoV = 8.16 / 100 * 100 = 8.16%

      const stream = [100, 110, 90]
      const result = calculateStabilityMetrics(stream)

      expect(result).not.toBeNull()
      expect(result!.overallCoV).toBeCloseTo(8.16, 2)
    })

    it('should calculate interval stability', () => {
      const stream = [100, 100, 100, 100, 100] // Perfect stability
      const intervals = [
        { type: 'WORK', start_index: 0, end_index: 2 },
        { type: 'REST', start_index: 3, end_index: 4 }
      ]

      const result = calculateStabilityMetrics(stream, intervals)

      expect(result!.intervalStability).toHaveLength(1)
      expect(result!.intervalStability[0].cov).toBe(0)
    })
  })

  describe('calculateWPrimeBalance', () => {
    it('should drain when power > FTP', () => {
      const ftp = 200
      const wPrime = 20000
      const power = [300, 300] // 100W above FTP
      const time = [0, 10] // 10 seconds duration
      // Drain = (300-200) * 10 = 1000J
      // New W' = 19000

      const result = calculateWPrimeBalance(power, time, ftp, wPrime)

      // index 0: time delta defaults to 1s? No, logic says dt = i > 0 ? t[i]-t[i-1] : 1
      // i=0: dt=1. Drain = 100*1 = 100. W'=19900
      // i=1: dt=10. Drain = 100*10 = 1000. W'=18900

      expect(result.wPrimeBalance[0]).toBe(19900)
      expect(result.wPrimeBalance[1]).toBe(18900)
      expect(result.minWPrimeBalance).toBe(18900)
    })

    it('should recharge when power < FTP', () => {
      const ftp = 200
      const wPrime = 20000
      const power = [100] // 100W below FTP
      const time = [10] // First point, dt=1s effectively? No, dt=1 for i=0.

      // Start with depleted W'
      // Wait, function assumes start at full W'
      // To test recharge, we need to drain first.

      const powerStream = [300, 100]
      const timeStream = [0, 100] // 100s gap

      // i=0: dt=1. Drain (300-200)*1 = 100. W' = 19900.
      // i=1: dt=100. Recharge.
      // Diff = 100. Tau = 546*exp(-0.01*100) + 316 = 546*0.367 + 316 = 200.3 + 316 = 516.3
      // W' = 20000 - (20000 - 19900) * exp(-100/516.3)
      // W' = 20000 - 100 * exp(-0.19)
      // W' = 20000 - 100 * 0.82
      // W' = 20000 - 82 = 19918 (approx)

      const result = calculateWPrimeBalance(powerStream, timeStream, ftp, wPrime)
      expect(result.wPrimeBalance[1]).toBeGreaterThan(result.wPrimeBalance[0])
    })
  })

  describe('calculateEfficiencyFactorDecay', () => {
    it('should return null on mismatch', () => {
      expect(calculateEfficiencyFactorDecay([], [1], [])).toBeNull()
    })

    it('should calculate EF decay', () => {
      const length = 10
      const power = Array(length).fill(200)
      const hr = Array(length).fill(100)
      const time = Array(length).fill(0)

      // First half EF = 2.0
      // Second half: set HR to 200 -> EF = 1.0
      for (let i = 5; i < 10; i++) {
        hr[i] = 200
      }

      const result = calculateEfficiencyFactorDecay(power, hr, time, 2) // Small window

      expect(result).not.toBeNull()
      // First half average roughly 2.0
      // Second half average roughly 1.0
      // With rolling average window=2, the transition point index 5 averages (2.0+1.0)/2 = 1.5
      // Second half values: [1.5, 1.0, 1.0, 1.0, 1.0] -> Avg = 5.5/5 = 1.1
      // Decay = (2.0 - 1.1)/2.0 = 45%
      expect(result!.totalDecay).toBeCloseTo(45, 0)
    })
  })

  describe('calculateQuadrantAnalysis', () => {
    it('should categorize points into quadrants', () => {
      const ftp = 200
      const targetCadence = 90

      const power = [
        300, // Q1 (High P, High C)
        300, // Q2 (High P, Low C)
        100, // Q3 (Low P, Low C)
        100  // Q4 (Low P, High C)
      ]
      const cadence = [
        100, // Q1
        80,  // Q2
        80,  // Q3
        100  // Q4
      ]

      const result = calculateQuadrantAnalysis(power, cadence, ftp, targetCadence)

      expect(result!.distribution.q1).toBe(25)
      expect(result!.distribution.q2).toBe(25)
      expect(result!.distribution.q3).toBe(25)
      expect(result!.distribution.q4).toBe(25)
    })

    it('should ignore coasting', () => {
      const power = [0, 300]
      const cadence = [0, 100]
      const result = calculateQuadrantAnalysis(power, cadence, 200, 90)

      expect(result!.seconds.q1).toBe(1)
      expect(result!.distribution.q1).toBe(100) // 1 valid point out of 2, 100% of valid
    })
  })
})
