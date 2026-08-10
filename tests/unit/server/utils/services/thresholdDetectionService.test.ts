import { beforeEach, describe, expect, it, vi } from 'vitest'

import { prisma } from '../../../../../server/utils/db'
import { sportSettingsRepository } from '../../../../../server/utils/repositories/sportSettingsRepository'
import {
  DEFAULT_PEAK_DURATIONS,
  findPeakEfforts
} from '../../../../../server/utils/interval-detection'
import { createUserNotification } from '../../../../../server/utils/notifications'
import { queueThresholdUpdateEmail } from '../../../../../server/utils/workout-insight-email'
import {
  corroborateThresholdEffortWithHr,
  corroborateThresholdEffortWithWorkRate,
  THRESHOLD_PACE_PEAK_DURATION_SEC,
  thresholdDetectionService
} from '../../../../../server/utils/services/thresholdDetectionService'

vi.mock('../../../../../server/utils/db', () => ({
  prisma: {
    metricHistory: {
      create: vi.fn(),
      createMany: vi.fn()
    },
    recommendation: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    }
  }
}))

vi.mock('../../../../../server/utils/repositories/sportSettingsRepository', () => ({
  sportSettingsRepository: {
    getForActivityType: vi.fn()
  }
}))

// `interval-detection` is deliberately NOT mocked. It used to be, and the stub
// handed the service a synthetic `{ duration: 2400 }` peak bucket that the real
// `findPeakEfforts` never produced — so threshold pace detection was dead code
// for every athlete while the suite stayed green (CW-405). Driving the service
// with real streams through the real implementation is what keeps the bucket
// the service asks for and the bucket the detector emits from drifting apart.

vi.mock('../../../../../server/utils/notifications', () => ({
  createUserNotification: vi.fn()
}))

vi.mock('../../../../../server/utils/workout-insight-email', () => ({
  queueThresholdUpdateEmail: vi.fn()
}))

vi.mock('@trigger.dev/sdk/v3', () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn()
  }
}))

/** A 1Hz stream: `warmupSec` seconds easy, then `effortSec` seconds steady. */
function steadyEffortStream(options: {
  warmupSec: number
  warmupValue: number
  effortSec: number
  effortValue: number
}) {
  const time: number[] = []
  const values: number[] = []
  for (let t = 0; t <= options.warmupSec + options.effortSec; t++) {
    time.push(t)
    values.push(t <= options.warmupSec ? options.warmupValue : options.effortValue)
  }
  return { time, values }
}

/** A run whose best sustained 40 minutes average exactly `velocity` m/s. */
function runWithSustained40mEffort(velocity: number) {
  const { time, values } = steadyEffortStream({
    warmupSec: 300,
    warmupValue: 2.5,
    effortSec: THRESHOLD_PACE_PEAK_DURATION_SEC,
    effortValue: velocity
  })
  return { time, velocity: values }
}

/**
 * The same run, with a heart rate stream that holds `effortHr` over exactly the
 * 40 minutes the pace peak is read from.
 */
function runWithSustained40mEffortAndHr(options: {
  velocity: number
  warmupHr: number
  effortHr: number
}) {
  const { time, velocity } = runWithSustained40mEffort(options.velocity)
  const heartrate = time.map((t) => (t <= 300 ? options.warmupHr : options.effortHr))
  return { time, velocity, heartrate }
}

/**
 * A 1Hz session: 5 minutes easy, then exactly 20 minutes steady — so the real
 * `findPeakEfforts` reads its 20 minute bucket off the effort, not the warmup.
 * Only the channels whose values are supplied are attached, which is how the
 * "no corroborating signal at all" cases are built.
 */
function sessionWith20mEffort(options: {
  warmupHr?: number
  effortHr?: number
  warmupWatts?: number
  effortWatts?: number
  warmupVelocity?: number
  effortVelocity?: number
}) {
  const WARMUP_SEC = 300
  const EFFORT_SEC = 1200

  const time: number[] = []
  for (let t = 0; t <= WARMUP_SEC + EFFORT_SEC; t++) time.push(t)

  const channel = (warmup?: number, effort?: number) =>
    warmup === undefined || effort === undefined
      ? undefined
      : time.map((t) => (t <= WARMUP_SEC ? warmup : effort))

  const streams: Record<string, number[]> = { time }
  const heartrate = channel(options.warmupHr, options.effortHr)
  if (heartrate) streams.heartrate = heartrate
  const watts = channel(options.warmupWatts, options.effortWatts)
  if (watts) streams.watts = watts
  const velocity = channel(options.warmupVelocity, options.effortVelocity)
  if (velocity) streams.velocity = velocity

  return streams
}

describe('thresholdDetectionService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.recommendation.findFirst).mockResolvedValue(null as any)
    vi.mocked(prisma.recommendation.create).mockResolvedValue({ id: 'rec-1' } as any)
    vi.mocked(prisma.metricHistory.create).mockResolvedValue({ id: 'mh-1' } as any)
    vi.mocked(prisma.metricHistory.createMany).mockResolvedValue({ count: 0 } as any)
  })

  it('asks for a pace bucket the real findPeakEfforts actually produces', () => {
    const { time, velocity } = runWithSustained40mEffort(4)

    // The bucket the service requests is real...
    const requested = findPeakEfforts(time, velocity, 'pace', [
      { sec: THRESHOLD_PACE_PEAK_DURATION_SEC, label: '40m' }
    ])
    expect(requested.find((p) => p.duration === THRESHOLD_PACE_PEAK_DURATION_SEC)?.value).toBe(4)

    // ...and it stays off the shared default list, so no POWER_40M personal-best
    // type and no extra "40m" row in the UI peaks table appear as a side effect.
    expect(DEFAULT_PEAK_DURATIONS.map((d) => d.sec)).not.toContain(THRESHOLD_PACE_PEAK_DURATION_SEC)
    expect(
      findPeakEfforts(time, velocity, 'pace').find(
        (p) => p.duration === THRESHOLD_PACE_PEAK_DURATION_SEC
      )
    ).toBeUndefined()
  })

  it('logs FTP history on the triggering workout date and stores the sport profile', async () => {
    const workoutDate = new Date('2025-02-05T10:00:00Z')

    vi.mocked(sportSettingsRepository.getForActivityType).mockResolvedValue({
      name: 'Cycling',
      ftp: 250
    } as any)

    const { time, values } = steadyEffortStream({
      warmupSec: 300,
      warmupValue: 150,
      effortSec: 1200,
      effortValue: 280
    })

    await thresholdDetectionService.detectThresholdIncreases({
      id: 'workout-1',
      userId: 'user-1',
      type: 'Ride',
      title: 'Threshold Builder',
      durationSec: 3600,
      date: workoutDate,
      streams: {
        watts: values,
        time
      },
      user: {
        ftp: 250
      }
    })

    expect(prisma.metricHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'FTP',
        value: 266,
        oldValue: 250,
        date: workoutDate,
        sportProfileName: 'Cycling'
      })
    })
    expect(createUserNotification).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        title: 'New Cycling FTP Detected',
        message: expect.stringContaining('Cycling profile FTP increased')
      })
    )
    expect(queueThresholdUpdateEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        metric: 'FTP',
        sportProfileName: 'Cycling'
      })
    )
  })

  it('detects a threshold pace improvement from a real 40 minute effort', async () => {
    const workoutDate = new Date('2025-01-10T07:30:00Z')

    vi.mocked(sportSettingsRepository.getForActivityType).mockResolvedValue({
      name: 'Running',
      thresholdPace: 300
    } as any)

    const results = await thresholdDetectionService.detectThresholdIncreases({
      id: 'workout-2a',
      userId: 'user-1',
      type: 'Run',
      title: 'Threshold Run',
      durationSec: 2700,
      date: workoutDate,
      streams: runWithSustained40mEffort(4),
      user: {}
    })

    // 4 m/s sustained for 40 minutes is 250 s/km, comfortably faster than the
    // athlete's stored 300 s/km threshold pace.
    expect(results?.thresholdPace?.detected).toBe(true)
    expect(results?.thresholdPace?.old).toBe(300)
    expect(results?.thresholdPace?.new).toBeCloseTo(250, 5)
    expect(prisma.recommendation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ metric: 'THRESHOLD_PACE' })
    })
  })

  it('does not detect a threshold pace when no 40 minute effort exists', async () => {
    const workoutDate = new Date('2025-01-11T07:30:00Z')

    vi.mocked(sportSettingsRepository.getForActivityType).mockResolvedValue({
      name: 'Running',
      thresholdPace: 300
    } as any)

    // A brisk 35 minute run: fast enough to beat the stored threshold pace, but
    // too short to hold a 40 minute effort.
    const { time, values } = steadyEffortStream({
      warmupSec: 300,
      warmupValue: 2.5,
      effortSec: 1800,
      effortValue: 4.5
    })

    const results = await thresholdDetectionService.detectThresholdIncreases({
      id: 'workout-2b',
      userId: 'user-1',
      type: 'Run',
      title: 'Short Tempo',
      durationSec: 2100,
      date: workoutDate,
      streams: { time, velocity: values },
      user: {}
    })

    expect(results?.thresholdPace).toBeNull()
    expect(prisma.recommendation.create).not.toHaveBeenCalled()
    expect(prisma.metricHistory.create).not.toHaveBeenCalled()
  })

  it('reports no improvement when the 40 minute effort is slower than the stored pace', async () => {
    const workoutDate = new Date('2025-01-12T07:30:00Z')

    vi.mocked(sportSettingsRepository.getForActivityType).mockResolvedValue({
      name: 'Running',
      thresholdPace: 240
    } as any)

    // 3.2 m/s over 40 minutes is 312.5 s/km, slower than the stored 240 s/km.
    const results = await thresholdDetectionService.detectThresholdIncreases({
      id: 'workout-2c',
      userId: 'user-1',
      type: 'Run',
      title: 'Easy Long Run',
      durationSec: 2700,
      date: workoutDate,
      streams: runWithSustained40mEffort(3.2),
      user: {}
    })

    expect(results?.thresholdPace?.detected).toBe(false)
    expect(prisma.recommendation.create).not.toHaveBeenCalled()
  })

  // The athlete with no stored threshold pace has nothing for the 2 s/km
  // improvement test to compare against, so before CW-413 any 40 minute stretch
  // — including the steady middle of a long easy run — nominated a threshold
  // pace. That value then feeds interval detection's pace work bar
  // (0.8 x thresholdPace), so a too-slow nomination pushes recovery jogs back
  // into WORK. The first nomination now has to be corroborated by heart rate.
  describe('first threshold pace nomination (athlete has none)', () => {
    it('does not nominate one from a long easy run', async () => {
      vi.mocked(sportSettingsRepository.getForActivityType).mockResolvedValue({
        name: 'Running',
        lthr: 170
      } as any)

      // 3 m/s for 40 minutes is 333 s/km at 132 bpm — 78% of LTHR, an easy
      // aerobic heart rate nowhere near the Z4 band floor (159 bpm).
      const results = await thresholdDetectionService.detectThresholdIncreases({
        id: 'workout-6',
        userId: 'user-1',
        type: 'Run',
        title: 'Long Easy Run',
        durationSec: 5400,
        date: new Date('2025-03-01T07:30:00Z'),
        streams: runWithSustained40mEffortAndHr({ velocity: 3, warmupHr: 110, effortHr: 132 }),
        user: {}
      })

      expect(results?.thresholdPace?.detected).toBe(false)
      expect(results?.thresholdPace?.old).toBe(0)
      expect(prisma.recommendation.create).not.toHaveBeenCalled()
      expect(prisma.metricHistory.create).not.toHaveBeenCalled()
    })

    it('nominates one from a sustained 40 minute effort at threshold heart rate', async () => {
      const workoutDate = new Date('2025-03-02T07:30:00Z')

      vi.mocked(sportSettingsRepository.getForActivityType).mockResolvedValue({
        name: 'Running',
        lthr: 170
      } as any)

      // 4 m/s for 40 minutes is 250 s/km at 168 bpm — 99% of LTHR, comfortably
      // inside the Z4 threshold band.
      const results = await thresholdDetectionService.detectThresholdIncreases({
        id: 'workout-7',
        userId: 'user-1',
        type: 'Run',
        title: 'Threshold Test',
        durationSec: 3000,
        date: workoutDate,
        streams: runWithSustained40mEffortAndHr({ velocity: 4, warmupHr: 120, effortHr: 168 }),
        user: {}
      })

      expect(results?.thresholdPace?.detected).toBe(true)
      expect(results?.thresholdPace?.new).toBeCloseTo(250, 5)
      expect(prisma.recommendation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ metric: 'THRESHOLD_PACE' })
      })
    })

    it('does not nominate one when the run carries no heart rate stream', async () => {
      vi.mocked(sportSettingsRepository.getForActivityType).mockResolvedValue({
        name: 'Running',
        lthr: 170
      } as any)

      const results = await thresholdDetectionService.detectThresholdIncreases({
        id: 'workout-8',
        userId: 'user-1',
        type: 'Run',
        title: 'Unstrapped Run',
        durationSec: 3000,
        date: new Date('2025-03-03T07:30:00Z'),
        streams: runWithSustained40mEffort(4),
        user: {}
      })

      expect(results?.thresholdPace?.detected).toBe(false)
      expect(prisma.recommendation.create).not.toHaveBeenCalled()
    })

    it('does not nominate one when the athlete has no LTHR or max HR reference', async () => {
      vi.mocked(sportSettingsRepository.getForActivityType).mockResolvedValue({
        name: 'Running'
      } as any)

      const results = await thresholdDetectionService.detectThresholdIncreases({
        id: 'workout-9',
        userId: 'user-1',
        type: 'Run',
        title: 'Hard Run, No Profile',
        durationSec: 3000,
        date: new Date('2025-03-04T07:30:00Z'),
        streams: runWithSustained40mEffortAndHr({ velocity: 4, warmupHr: 120, effortHr: 168 }),
        user: {}
      })

      expect(results?.thresholdPace?.detected).toBe(false)
      expect(prisma.recommendation.create).not.toHaveBeenCalled()
    })

    it('leaves the improvement path ungated for an athlete who already has a pace', async () => {
      vi.mocked(sportSettingsRepository.getForActivityType).mockResolvedValue({
        name: 'Running',
        lthr: 170,
        thresholdPace: 300
      } as any)

      // Easy heart rate, but 250 s/km beats the stored 300 s/km by far more than
      // 2 s/km. Holding 40 minutes faster than a known threshold pace is its own
      // evidence, so the HR gate deliberately does not apply here.
      const results = await thresholdDetectionService.detectThresholdIncreases({
        id: 'workout-10',
        userId: 'user-1',
        type: 'Run',
        title: 'Steady Run',
        durationSec: 3000,
        date: new Date('2025-03-05T07:30:00Z'),
        streams: runWithSustained40mEffortAndHr({ velocity: 4, warmupHr: 110, effortHr: 130 }),
        user: {}
      })

      expect(results?.thresholdPace?.detected).toBe(true)
      expect(results?.thresholdPace?.old).toBe(300)
      expect(prisma.recommendation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ metric: 'THRESHOLD_PACE' })
      })
    })
  })

  // Before CW-420 both branches required the athlete's CURRENT value to be
  // truthy, so an athlete who had never configured an FTP or an LTHR got no
  // first detection, ever — silently. Enabling it naively would have been the
  // CW-413 bug inverted: the 0.95 coefficient cannot tell a maximal 20 minutes
  // from the strongest 20 minutes of an easy session, and a first nomination has
  // nothing to beat. Each metric now needs corroboration on an axis it is not
  // itself derived from.
  describe('first FTP nomination (athlete has none)', () => {
    it('nominates one from a 20 minute effort held in the threshold heart rate band', async () => {
      const workoutDate = new Date('2025-04-01T06:00:00Z')

      vi.mocked(sportSettingsRepository.getForActivityType).mockResolvedValue({
        name: 'Cycling',
        lthr: 170
      } as any)

      // 280W held for 20 minutes at 168 bpm — 99% of LTHR, well inside the Z4
      // band (floor 159 bpm).
      const results = await thresholdDetectionService.detectThresholdIncreases({
        id: 'workout-ftp-first',
        userId: 'user-1',
        type: 'Ride',
        title: 'FTP Test',
        durationSec: 3600,
        date: workoutDate,
        streams: sessionWith20mEffort({
          warmupHr: 115,
          effortHr: 168,
          warmupWatts: 150,
          effortWatts: 280
        }),
        user: {}
      })

      expect(results?.ftp).toMatchObject({ old: 0, new: 266, detected: true })
      expect(prisma.recommendation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metric: 'FTP',
          description: 'We detected your Cycling FTP: 266W.'
        })
      })
      expect(createUserNotification).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          message: 'We detected your Cycling profile FTP: 266W, based on "FTP Test".'
        })
      )
    })

    it('does not nominate one from an easy 20 minute segment', async () => {
      vi.mocked(sportSettingsRepository.getForActivityType).mockResolvedValue({
        name: 'Cycling',
        lthr: 170
      } as any)

      // The same 280W block, but at 130 bpm — 76% of LTHR, an easy aerobic heart
      // rate nowhere near the Z4 floor. Nothing about this was maximal.
      const results = await thresholdDetectionService.detectThresholdIncreases({
        id: 'workout-ftp-easy',
        userId: 'user-1',
        type: 'Ride',
        title: 'Endurance Ride',
        durationSec: 3600,
        date: new Date('2025-04-02T06:00:00Z'),
        streams: sessionWith20mEffort({
          warmupHr: 105,
          effortHr: 130,
          warmupWatts: 150,
          effortWatts: 280
        }),
        user: {}
      })

      expect(results?.ftp).toMatchObject({ old: 0, new: 266, detected: false })
      expect(prisma.recommendation.create).not.toHaveBeenCalled()
      expect(prisma.metricHistory.create).not.toHaveBeenCalled()
    })

    it('does not nominate one when the ride carries no heart rate stream', async () => {
      vi.mocked(sportSettingsRepository.getForActivityType).mockResolvedValue({
        name: 'Cycling',
        lthr: 170
      } as any)

      const results = await thresholdDetectionService.detectThresholdIncreases({
        id: 'workout-ftp-nostrap',
        userId: 'user-1',
        type: 'Ride',
        title: 'Unstrapped Ride',
        durationSec: 3600,
        date: new Date('2025-04-03T06:00:00Z'),
        streams: sessionWith20mEffort({ warmupWatts: 150, effortWatts: 280 }),
        user: {}
      })

      expect(results?.ftp?.detected).toBe(false)
      expect(prisma.recommendation.create).not.toHaveBeenCalled()
    })

    it('does not nominate one when the athlete has no LTHR or max HR reference', async () => {
      vi.mocked(sportSettingsRepository.getForActivityType).mockResolvedValue({
        name: 'Cycling'
      } as any)

      const results = await thresholdDetectionService.detectThresholdIncreases({
        id: 'workout-ftp-noref',
        userId: 'user-1',
        type: 'Ride',
        title: 'Hard Ride, No Profile',
        durationSec: 3600,
        date: new Date('2025-04-04T06:00:00Z'),
        streams: sessionWith20mEffort({
          warmupHr: 115,
          effortHr: 168,
          warmupWatts: 150,
          effortWatts: 280
        }),
        user: {}
      })

      expect(results?.ftp?.detected).toBe(false)
      expect(prisma.recommendation.create).not.toHaveBeenCalled()
    })

    it('leaves the improvement path ungated for an athlete who already has an FTP', async () => {
      vi.mocked(sportSettingsRepository.getForActivityType).mockResolvedValue({
        name: 'Cycling',
        ftp: 250,
        lthr: 170
      } as any)

      // Easy heart rate, but 266W beats the stored 250W. Twenty minutes above a
      // known FTP is its own evidence, so the HR gate deliberately does not apply.
      const results = await thresholdDetectionService.detectThresholdIncreases({
        id: 'workout-ftp-improve',
        userId: 'user-1',
        type: 'Ride',
        title: 'Steady Ride',
        durationSec: 3600,
        date: new Date('2025-04-05T06:00:00Z'),
        streams: sessionWith20mEffort({
          warmupHr: 105,
          effortHr: 130,
          warmupWatts: 150,
          effortWatts: 280
        }),
        user: {}
      })

      expect(results?.ftp).toMatchObject({ old: 250, new: 266, detected: true })
      expect(prisma.recommendation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metric: 'FTP',
          description: 'Your Cycling FTP has increased from 250W to 266W.'
        })
      })
      expect(createUserNotification).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          message: expect.stringContaining('Cycling profile FTP increased to 266W (previous: 250W)')
        })
      )
    })
  })

  // LTHR cannot be corroborated by heart rate — the window would be both the
  // claim and its own evidence — so it is corroborated on a work-rate axis
  // instead: power against the stored FTP, or pace against the stored threshold
  // pace. With neither, there is no nomination.
  describe('first LTHR nomination (athlete has none)', () => {
    it('nominates one when the 20 minute peak coincides with threshold power', async () => {
      const workoutDate = new Date('2025-05-01T06:00:00Z')

      vi.mocked(sportSettingsRepository.getForActivityType).mockResolvedValue({
        name: 'Cycling',
        ftp: 250
      } as any)

      // 260W over the same 20 minutes is above the Z4 power floor (226W), so the
      // 180 bpm was earned. 260W is below the stored FTP, so this test isolates
      // the LTHR branch.
      const results = await thresholdDetectionService.detectThresholdIncreases({
        id: 'workout-lthr-first',
        userId: 'user-1',
        type: 'Ride',
        title: 'Threshold Intervals',
        durationSec: 3600,
        date: workoutDate,
        streams: sessionWith20mEffort({
          warmupHr: 115,
          effortHr: 180,
          warmupWatts: 150,
          effortWatts: 260
        }),
        user: {}
      })

      expect(results?.lthr).toMatchObject({ old: 0, new: 171, detected: true })
      expect(results?.ftp?.detected).toBe(false)
      expect(prisma.recommendation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metric: 'LTHR',
          description: 'We detected your Cycling LTHR: 171 bpm.'
        })
      })
      expect(createUserNotification).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          message:
            'We detected your Cycling profile threshold heart rate: 171 bpm, based on "Threshold Intervals".'
        })
      )
    })

    it('nominates one when the 20 minute peak coincides with threshold pace', async () => {
      vi.mocked(sportSettingsRepository.getForActivityType).mockResolvedValue({
        name: 'Running',
        thresholdPace: 300
      } as any)

      // 4 m/s clears the Z4 pace floor (0.95 x 3.33 m/s threshold speed). The
      // effort is only 20 minutes, so no 40 minute pace bucket exists and the
      // threshold-pace branch stays out of this.
      const results = await thresholdDetectionService.detectThresholdIncreases({
        id: 'workout-lthr-pace',
        userId: 'user-1',
        type: 'Run',
        title: 'Tempo Run',
        durationSec: 3000,
        date: new Date('2025-05-02T06:00:00Z'),
        streams: sessionWith20mEffort({
          warmupHr: 115,
          effortHr: 172,
          warmupVelocity: 2.5,
          effortVelocity: 4
        }),
        user: {}
      })

      expect(results?.lthr).toMatchObject({ old: 0, new: 163, detected: true })
      expect(results?.thresholdPace).toBeNull()
      expect(prisma.recommendation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ metric: 'LTHR' })
      })
    })

    it('does not nominate one from an easy 20 minute segment', async () => {
      vi.mocked(sportSettingsRepository.getForActivityType).mockResolvedValue({
        name: 'Cycling',
        ftp: 250
      } as any)

      // 150W is Z2 endurance for a 250W athlete — the highest 20 minutes of an
      // easy ride, and nothing the 142 bpm can be read as a threshold from.
      const results = await thresholdDetectionService.detectThresholdIncreases({
        id: 'workout-lthr-easy',
        userId: 'user-1',
        type: 'Ride',
        title: 'Recovery Spin',
        durationSec: 3600,
        date: new Date('2025-05-03T06:00:00Z'),
        streams: sessionWith20mEffort({
          warmupHr: 105,
          effortHr: 142,
          warmupWatts: 120,
          effortWatts: 150
        }),
        user: {}
      })

      expect(results?.lthr).toMatchObject({ old: 0, detected: false })
      expect(prisma.recommendation.create).not.toHaveBeenCalled()
      expect(prisma.metricHistory.create).not.toHaveBeenCalled()
    })

    it('does not nominate one when there is no power or pace axis to corroborate with', async () => {
      vi.mocked(sportSettingsRepository.getForActivityType).mockResolvedValue({
        name: 'Cycling'
      } as any)

      // Heart rate only, and no stored FTP or threshold pace to measure any work
      // rate against. Prefer no recommendation over a weak one.
      const results = await thresholdDetectionService.detectThresholdIncreases({
        id: 'workout-lthr-noaxis',
        userId: 'user-1',
        type: 'Ride',
        title: 'Strap Only',
        durationSec: 3600,
        date: new Date('2025-05-04T06:00:00Z'),
        streams: sessionWith20mEffort({ warmupHr: 115, effortHr: 180 }),
        user: {}
      })

      expect(results?.lthr).toMatchObject({ old: 0, new: 171, detected: false })
      expect(prisma.recommendation.create).not.toHaveBeenCalled()
    })

    it('does not nominate one when the athlete has a stored FTP but the ride has no power', async () => {
      vi.mocked(sportSettingsRepository.getForActivityType).mockResolvedValue({
        name: 'Cycling',
        ftp: 250
      } as any)

      const results = await thresholdDetectionService.detectThresholdIncreases({
        id: 'workout-lthr-nopower',
        userId: 'user-1',
        type: 'Ride',
        title: 'No Power Meter',
        durationSec: 3600,
        date: new Date('2025-05-05T06:00:00Z'),
        streams: sessionWith20mEffort({ warmupHr: 115, effortHr: 180 }),
        user: {}
      })

      expect(results?.lthr?.detected).toBe(false)
      expect(prisma.recommendation.create).not.toHaveBeenCalled()
    })

    it('leaves the improvement path ungated for an athlete who already has an LTHR', async () => {
      vi.mocked(sportSettingsRepository.getForActivityType).mockResolvedValue({
        name: 'Cycling',
        lthr: 160
      } as any)

      // No power and no pace at all, so the work-rate gate could not pass if it
      // applied. Beating a known LTHR over 20 minutes is its own evidence.
      const results = await thresholdDetectionService.detectThresholdIncreases({
        id: 'workout-lthr-improve',
        userId: 'user-1',
        type: 'Ride',
        title: 'Hard Group Ride',
        durationSec: 3600,
        date: new Date('2025-05-06T06:00:00Z'),
        streams: sessionWith20mEffort({ warmupHr: 115, effortHr: 180 }),
        user: {}
      })

      expect(results?.lthr).toMatchObject({ old: 160, new: 171, detected: true })
      expect(prisma.recommendation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metric: 'LTHR',
          description: 'Your Cycling LTHR has increased from 160 to 171 bpm.'
        })
      })
      expect(createUserNotification).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          message: expect.stringContaining(
            'threshold heart rate increased to 171 bpm (previous: 160 bpm)'
          )
        })
      )
    })

    it('still respects the minimum workout duration on a first nomination', async () => {
      vi.mocked(sportSettingsRepository.getForActivityType).mockResolvedValue({
        name: 'Cycling',
        ftp: 250
      } as any)

      // Corroborated by power, but a 40 minute ride is under the 50 minute bar
      // the LTHR branch has always applied.
      const results = await thresholdDetectionService.detectThresholdIncreases({
        id: 'workout-lthr-short',
        userId: 'user-1',
        type: 'Ride',
        title: 'Short Session',
        durationSec: 2400,
        date: new Date('2025-05-07T06:00:00Z'),
        streams: sessionWith20mEffort({
          warmupHr: 115,
          effortHr: 180,
          warmupWatts: 150,
          effortWatts: 260
        }),
        user: {}
      })

      expect(results?.minDurationMet).toBe(false)
      expect(results?.lthr?.detected).toBe(false)
      expect(prisma.recommendation.create).not.toHaveBeenCalled()
    })
  })

  describe('corroborateThresholdEffortWithWorkRate', () => {
    const times = Array.from({ length: 601 }, (_, i) => i)

    it('accepts a window ridden above the Z4 power floor', () => {
      expect(
        corroborateThresholdEffortWithWorkRate({
          times,
          watts: times.map(() => 240),
          startSec: 0,
          endSec: 600,
          ftp: 250
        })
      ).toMatchObject({ corroborated: true, reason: 'in_threshold_band', axis: 'power' })
    })

    it('rejects a window ridden below the Z4 power floor', () => {
      expect(
        corroborateThresholdEffortWithWorkRate({
          times,
          watts: times.map(() => 180),
          startSec: 0,
          endSec: 600,
          ftp: 250
        })
      ).toMatchObject({ corroborated: false, reason: 'below_threshold_band', axis: 'power' })
    })

    it('falls back to the pace axis when there is no power to read', () => {
      expect(
        corroborateThresholdEffortWithWorkRate({
          times,
          velocity: times.map(() => 4),
          startSec: 0,
          endSec: 600,
          thresholdPaceSecPerKm: 300
        })
      ).toMatchObject({ corroborated: true, reason: 'in_threshold_band', axis: 'pace' })
    })

    it('reports no axis when neither a stored FTP nor a stored threshold pace exists', () => {
      expect(
        corroborateThresholdEffortWithWorkRate({
          times,
          watts: times.map(() => 300),
          velocity: times.map(() => 5),
          startSec: 0,
          endSec: 600
        })
      ).toMatchObject({ corroborated: false, reason: 'no_corroborating_axis' })
    })

    it('rejects a window whose power mostly dropped out', () => {
      expect(
        corroborateThresholdEffortWithWorkRate({
          times,
          watts: times.map((t) => (t > 480 ? 300 : Number.NaN)),
          startSec: 0,
          endSec: 600,
          ftp: 250
        })
      ).toMatchObject({ corroborated: false, reason: 'insufficient_coverage', axis: 'power' })
    })
  })

  describe('corroborateThresholdEffortWithHr', () => {
    const times = Array.from({ length: 601 }, (_, i) => i)

    it('rejects a window whose heart rate mostly dropped out', () => {
      // 160 bpm where it recorded — but only over a fifth of the window.
      const heartrate = times.map((t) => (t > 480 ? 160 : 0))

      expect(
        corroborateThresholdEffortWithHr({
          times,
          heartrate,
          startSec: 0,
          endSec: 600,
          lthr: 170
        })
      ).toMatchObject({ corroborated: false, reason: 'insufficient_hr_coverage' })
    })

    it('falls back to the max HR band when no LTHR is known', () => {
      const maxHr = 190

      // Z4 for a max-HR athlete starts at 0.8 x max HR (153 bpm).
      expect(
        corroborateThresholdEffortWithHr({
          times,
          heartrate: times.map(() => 165),
          startSec: 0,
          endSec: 600,
          maxHr
        })
      ).toMatchObject({ corroborated: true, reason: 'in_threshold_band' })

      expect(
        corroborateThresholdEffortWithHr({
          times,
          heartrate: times.map(() => 140),
          startSec: 0,
          endSec: 600,
          maxHr
        })
      ).toMatchObject({ corroborated: false, reason: 'below_threshold_band' })
    })
  })

  it('logs running threshold pace history on the workout date', async () => {
    const workoutDate = new Date('2025-01-10T07:30:00Z')

    vi.mocked(sportSettingsRepository.getForActivityType).mockResolvedValue({
      name: 'Running',
      thresholdPace: 260
    } as any)

    await thresholdDetectionService.detectThresholdIncreases({
      id: 'workout-2',
      userId: 'user-1',
      type: 'Run',
      title: 'Tempo Run',
      durationSec: 3600,
      date: workoutDate,
      streams: runWithSustained40mEffort(4),
      user: {}
    })

    expect(prisma.metricHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'THRESHOLD_PACE',
        date: workoutDate,
        sportProfileName: 'Running'
      })
    })
  })

  it('formats the threshold pace recommendation in km when the athlete prefers Kilometers', async () => {
    const workoutDate = new Date('2025-01-10T07:30:00Z')

    vi.mocked(sportSettingsRepository.getForActivityType).mockResolvedValue({
      name: 'Running',
      thresholdPace: 260
    } as any)

    await thresholdDetectionService.detectThresholdIncreases({
      id: 'workout-3',
      userId: 'user-1',
      type: 'Run',
      title: 'Tempo Run',
      durationSec: 3600,
      date: workoutDate,
      streams: runWithSustained40mEffort(4),
      user: { distanceUnits: 'Kilometers' }
    })

    expect(prisma.recommendation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metric: 'THRESHOLD_PACE',
        description: expect.stringContaining('4:10/km')
      })
    })
  })

  it('formats the threshold pace recommendation in km when distanceUnits is not provided', async () => {
    const workoutDate = new Date('2025-01-10T07:30:00Z')

    vi.mocked(sportSettingsRepository.getForActivityType).mockResolvedValue({
      name: 'Running',
      thresholdPace: 260
    } as any)

    await thresholdDetectionService.detectThresholdIncreases({
      id: 'workout-4',
      userId: 'user-1',
      type: 'Run',
      title: 'Tempo Run',
      durationSec: 3600,
      date: workoutDate,
      streams: runWithSustained40mEffort(4),
      user: {}
    })

    expect(prisma.recommendation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metric: 'THRESHOLD_PACE',
        description: expect.stringContaining('4:10/km')
      })
    })
  })

  it('formats the threshold pace recommendation in miles when the athlete prefers Miles', async () => {
    const workoutDate = new Date('2025-01-10T07:30:00Z')

    vi.mocked(sportSettingsRepository.getForActivityType).mockResolvedValue({
      name: 'Running',
      thresholdPace: 260
    } as any)

    await thresholdDetectionService.detectThresholdIncreases({
      id: 'workout-5',
      userId: 'user-1',
      type: 'Run',
      title: 'Tempo Run',
      durationSec: 3600,
      date: workoutDate,
      streams: runWithSustained40mEffort(4),
      user: { distanceUnits: 'Miles' }
    })

    expect(prisma.recommendation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metric: 'THRESHOLD_PACE',
        description: expect.stringContaining('6:42/mi')
      })
    })
  })

  describe('createThresholdRecommendation copy', () => {
    const workoutDate = new Date('2025-03-01T06:00:00Z')

    /** Runs the recommendation and returns the `{ title, description }` written. */
    async function recommendationCopy(options: {
      metric: 'LTHR' | 'FTP' | 'MAX_HR' | 'THRESHOLD_PACE'
      oldValue: number
      newValue: number
      sportName?: string | null
    }) {
      await thresholdDetectionService.createThresholdRecommendation(
        'user-1',
        'workout-copy',
        options.metric,
        options.oldValue,
        options.newValue,
        options.newValue,
        options.sportName ?? null,
        workoutDate,
        undefined,
        true,
        'Kilometers'
      )

      const { data } = vi.mocked(prisma.recommendation.create).mock.calls.at(-1)![0] as any
      return { title: data.title as string, description: data.description as string }
    }

    // A first detection arrives with oldValue 0 — the copy must not imply there
    // was a previous value to improve on (CW-421).
    it('does not frame a first LTHR detection as an increase from zero', async () => {
      const { title, description } = await recommendationCopy({
        metric: 'LTHR',
        oldValue: 0,
        newValue: 158
      })

      expect(description).toBe('We detected your LTHR: 158 bpm.')
      expect(description).not.toContain('increased')
      expect(description).not.toContain('0')
      expect(title).toBe('New LTHR Detected')
    })

    it('still frames an LTHR improvement over an existing value as an increase', async () => {
      const { description } = await recommendationCopy({
        metric: 'LTHR',
        oldValue: 152,
        newValue: 158
      })

      expect(description).toBe('Your LTHR has increased from 152 to 158 bpm.')
    })

    it('does not frame a first FTP detection as an increase from zero', async () => {
      const { title, description } = await recommendationCopy({
        metric: 'FTP',
        oldValue: 0,
        newValue: 265
      })

      expect(description).toBe('We detected your FTP: 265W.')
      expect(description).not.toContain('increased')
      expect(description).not.toContain('0W')
      expect(title).toBe('New FTP Detected')
    })

    it('still frames an FTP improvement over an existing value as an increase', async () => {
      const { description } = await recommendationCopy({
        metric: 'FTP',
        oldValue: 250,
        newValue: 265
      })

      expect(description).toBe('Your FTP has increased from 250W to 265W.')
    })

    it('does not report a previous max heart rate of zero on a first detection', async () => {
      const { title, description } = await recommendationCopy({
        metric: 'MAX_HR',
        oldValue: 0,
        newValue: 191
      })

      expect(description).toBe('We detected your max heart rate: 191 bpm.')
      expect(description).not.toContain('previous')
      expect(title).toBe('New Max Heart Rate Detected')
    })

    it('still reports the previous max heart rate when there was one', async () => {
      const { description } = await recommendationCopy({
        metric: 'MAX_HR',
        oldValue: 186,
        newValue: 191
      })

      expect(description).toBe('We detected a new max heart rate of 191 bpm (previous: 186 bpm).')
    })

    it('does not frame a first threshold pace detection as an improvement', async () => {
      const { title, description } = await recommendationCopy({
        metric: 'THRESHOLD_PACE',
        oldValue: 0,
        newValue: 250
      })

      expect(description).toBe('We detected your threshold pace: 4:10/km.')
      expect(description).not.toContain('improved')
      expect(title).toBe('New Threshold Pace Detected')
    })

    it('still frames a threshold pace improvement over an existing pace as an improvement', async () => {
      const { description } = await recommendationCopy({
        metric: 'THRESHOLD_PACE',
        oldValue: 260,
        newValue: 250
      })

      expect(description).toBe('Your threshold pace has improved to 4:10/km.')
    })

    it('keeps the sport profile name in both the first-detection and improvement copy', async () => {
      const first = await recommendationCopy({
        metric: 'THRESHOLD_PACE',
        oldValue: 0,
        newValue: 250,
        sportName: 'Running'
      })
      expect(first.description).toBe('We detected your Running threshold pace: 4:10/km.')
      expect(first.title).toBe('New Threshold Pace Detected (Running)')

      const improved = await recommendationCopy({
        metric: 'FTP',
        oldValue: 250,
        newValue: 265,
        sportName: 'Cycling'
      })
      expect(improved.description).toBe('Your Cycling FTP has increased from 250W to 265W.')
    })

    it('treats a non-finite previous value as no previous value', async () => {
      const { description } = await recommendationCopy({
        metric: 'FTP',
        oldValue: Number.NaN,
        newValue: 265
      })

      expect(description).toBe('We detected your FTP: 265W.')
    })
  })
})
