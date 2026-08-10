import { describe, expect, it } from 'vitest'
import {
  buildWorkoutAnalysisFacts,
  buildWorkoutAnalysisFactsV2,
  formatActualIntervalsForPrompt,
  formatCadenceWithUnit,
  getActualIntervalsForAnalysis,
  getActualIntervalsSourceForAnalysis,
  resolveCadenceUnit,
  toCanonicalCadence
} from './workout-analysis-facts'

function makeWorkout(overrides: Record<string, unknown> = {}) {
  return {
    id: 'workout-1',
    title: 'Debug Workout',
    type: 'Ride',
    durationSec: 5400,
    trainingLoad: 120,
    tss: 110,
    averageWatts: 210,
    averageHr: 145,
    decoupling: null,
    trainer: false,
    streams: null,
    ...overrides
  }
}

describe('buildWorkoutAnalysisFacts', () => {
  it('treats zero-heavy heart-rate streams as unusable telemetry', () => {
    const facts = buildWorkoutAnalysisFacts({
      workout: makeWorkout({
        streams: {
          heartrate: [0, 0, 0, 120, 122, 0, 0, 0],
          watts: [100, 120, 140, 160, 170, 150, 130, 110]
        }
      })
    })

    expect(facts.telemetry.hrUsable).toBe(false)
    expect(facts.telemetry.hrArtifactFlag).toBe(true)
    expect(facts.debugMeta.disabledInterpretations.join(' ')).toContain('Heart-rate-derived')
  })

  it('marks running power as estimated and avoids absolute power use', () => {
    const facts = buildWorkoutAnalysisFacts({
      workout: makeWorkout({
        type: 'Run',
        averageSpeed: 12.5,
        averageWatts: 290
      })
    })

    expect(facts.telemetry.powerSourceType).toBe('estimated')
    expect(facts.telemetry.powerAbsoluteUsable).toBe(false)
    expect(facts.telemetry.powerRelativeUsable).toBe(true)
    expect(facts.telemetry.analysisMode).toBe('pace')
  })

  it('treats power-zone telemetry as valid power evidence for rides', () => {
    const facts = buildWorkoutAnalysisFacts({
      workout: makeWorkout({
        averageWatts: null,
        normalizedPower: null,
        streams: {
          powerZoneTimes: [0, 600, 1200, 900, 300]
        }
      })
    })

    expect(facts.telemetry.powerSourceType).toBe('measured')
    expect(facts.telemetry.powerRelativeUsable).toBe(true)
  })

  it('detects efficiency gain when later power/hr ratio improves after warm-up exclusion', () => {
    const time = Array.from({ length: 180 }, (_, index) => index * 30)
    const watts = Array.from({ length: 180 }, (_, index) => (index < 90 ? 200 : 205))
    const heartrate = Array.from({ length: 180 }, (_, index) => (index < 90 ? 150 : 142))

    const facts = buildWorkoutAnalysisFacts({
      workout: makeWorkout({
        durationSec: 5400,
        streams: {
          time,
          watts,
          heartrate
        }
      })
    })

    expect(facts.physiology.decouplingValid).toBe(true)
    expect(facts.physiology.decouplingDirection).toBe('efficiency_gain')
  })

  it('flags expected hr lag during sharp power onsets', () => {
    const time = Array.from({ length: 80 }, (_, index) => index * 6)
    const watts = Array.from({ length: 80 }, (_, index) => (index < 20 ? 120 : 260))
    const heartrate = Array.from({ length: 80 }, (_, index) => {
      if (index < 20) return 120
      if (index < 30) return 122
      return 132
    })

    const facts = buildWorkoutAnalysisFacts({
      workout: makeWorkout({
        durationSec: 5400,
        streams: {
          time,
          watts,
          heartrate
        }
      })
    })

    expect(facts.physiology.normalHrLagExpected).toBe(true)
    expect(facts.physiology.normalHrLagDetected).toBe(true)
  })

  it('disables cargo e-bike lr balance interpretation and can correct suspected inversion', () => {
    const facts = buildWorkoutAnalysisFacts({
      workout: makeWorkout({
        deviceName: 'Bulcan Cargo Module',
        lrBalance: 68
      })
    })

    expect(facts.lrBalance.sourceSemantics).toBe('human_vs_motor')
    expect(facts.lrBalance.inversionSuspected).toBe(true)
    expect(facts.lrBalance.interpretationMode).toBe('corrected')
  })

  it('marks unavailable lr balance fields as ignored for prompt inclusion', () => {
    const facts = buildWorkoutAnalysisFacts({
      workout: makeWorkout({
        lrBalance: null
      })
    })

    expect(facts.lrBalance.sourceSemantics).toBe('unknown')
    expect(facts.lrBalance.interpretationMode).toBe('disabled')
    // correctionReason is included because it's non-null and explains why it's disabled
    expect(facts.debugMeta.promptDecisions['lrBalance.correctionReason']!.include).toBe(true)
  })

  it('detects ERG from tightly locked target power intervals', () => {
    const targetPower = Array.from({ length: 80 }, (_, index) => 220)
    const watts = targetPower.map((value, index) => value + (index % 2 === 0 ? 2 : -2))
    const cadence = Array.from({ length: 80 }, (_, index) => 82 + (index % 12))

    const facts = buildWorkoutAnalysisFacts({
      workout: makeWorkout({
        trainer: true,
        streams: {
          targetPower,
          watts,
          cadence
        }
      }),
      plannedWorkout: {
        structuredWorkout: { steps: [] }
      }
    })

    expect(facts.erg.detected).toBe(true)
    expect(facts.erg.powerControlMode).toBe('erg')
  })

  it('produces interpretable decoupling and durability facts for a steady endurance ride', () => {
    const time = Array.from({ length: 720 }, (_, index) => index * 5)
    const watts = Array.from({ length: 720 }, () => 205)
    const heartrate = Array.from({ length: 720 }, (_, index) => (index < 120 ? 138 : 142))

    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        title: 'Steady Endurance Ride',
        durationSec: 3600,
        averageWatts: 205,
        averageHr: 141,
        intensity: 0.76,
        variabilityIndex: 1.03,
        streams: {
          time,
          watts,
          heartrate,
          powerZoneTimes: [300, 2400, 900, 0, 0],
          hrZoneTimes: [120, 1800, 1680, 0, 0]
        }
      })
    })

    expect(facts.guardrails.archetype.primaryArchetype).toBe('endurance')
    expect(facts.performanceSignals.decoupling.interpretable).toBe(true)
    expect(facts.performanceSignals.durability.lateSessionFadePct).not.toBeNull()
    expect(facts.performanceSignals.zones.dominantPowerZone).toBe('Z2')
  })

  it('recomputes power zone facts from current sport settings instead of stale stream buckets', () => {
    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        title: 'Updated FTP Ride',
        durationSec: 300,
        averageWatts: 160,
        streams: {
          time: [0, 1, 2, 3, 4],
          watts: [100, 130, 160, 170, 190],
          heartrate: [120, 130, 140, 150, 160],
          powerZoneTimes: [0, 0, 0, 0, 5, 0, 0]
        }
      }),
      sportSettings: {
        ftp: 166,
        powerZones: [
          { min: 0, max: 91 },
          { min: 92, max: 125 },
          { min: 126, max: 149 },
          { min: 150, max: 174 },
          { min: 175, max: 199 },
          { min: 200, max: 249 },
          { min: 250, max: 2000 }
        ]
      }
    })

    expect(facts.performanceSignals.zones.dominantPowerZone).toBe('Z4')
    expect(facts.performanceSignals.zones.timeAboveThresholdPct).toBe(60)
  })

  it('prefers the stored workout decoupling over a divergent stream-derived value', () => {
    const time = Array.from({ length: 720 }, (_, index) => index * 5)
    const watts = Array.from({ length: 720 }, () => 205)
    const heartrate = Array.from({ length: 720 }, (_, index) => (index < 120 ? 138 : 142))

    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        title: 'Stored Metric Wins',
        durationSec: 3600,
        averageWatts: 205,
        averageHr: 141,
        decoupling: 5.6,
        streams: {
          time,
          watts,
          heartrate
        }
      })
    })

    expect(facts.performanceSignals.decoupling.interpretable).toBe(true)
    expect(facts.performanceSignals.decoupling.effective).toBe(5.6)
    expect(facts.performanceSignals.decoupling.direction).toBe('positive_drift')
  })

  it('suppresses classic decoupling for intervalled sessions while keeping repeatability signals', () => {
    const intervals = [
      { type: 'WORK', moving_time: 180, average_watts: 320, intensity: 1.18 },
      { type: 'REST', moving_time: 180, average_watts: 160, intensity: 0.6 },
      { type: 'WORK', moving_time: 180, average_watts: 315, intensity: 1.16 },
      { type: 'REST', moving_time: 180, average_watts: 150, intensity: 0.58 },
      { type: 'WORK', moving_time: 180, average_watts: 305, intensity: 1.12 }
    ]

    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        title: 'VO2 Session',
        durationSec: 3600,
        averageWatts: 230,
        averageHr: 152,
        intensity: 0.93,
        variabilityIndex: 1.15,
        rawJson: { icu_intervals: intervals },
        streams: {
          time: Array.from({ length: 720 }, (_, index) => index * 5),
          watts: Array.from({ length: 720 }, (_, index) => (index % 120 < 60 ? 320 : 150)),
          heartrate: Array.from({ length: 720 }, (_, index) => (index % 120 < 60 ? 165 : 135))
        }
      })
    })

    expect(facts.guardrails.archetype.sessionSteadiness).toBe('intervalled')
    expect(facts.performanceSignals.decoupling.interpretable).toBe(false)
    expect(facts.performanceSignals.durability.repeatabilityScore).not.toBeNull()
  })

  it('computes adherence metrics for a linked structured workout', () => {
    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        title: 'Threshold Session',
        type: 'Ride',
        durationSec: 3600,
        rawJson: {
          icu_intervals: [
            { type: 'WORK', moving_time: 600, average_watts: 248, intensity: 0.99 },
            { type: 'REST', moving_time: 300, average_watts: 150, intensity: 0.6 },
            { type: 'WORK', moving_time: 600, average_watts: 252, intensity: 1.01 }
          ]
        }
      }),
      sportSettings: { ftp: 250 },
      plannedWorkout: {
        structuredWorkout: {
          steps: [
            { type: 'Interval', durationSeconds: 600, power: { value: 100, units: '%' } },
            { type: 'Rest', durationSeconds: 300, power: { value: 60, units: '%' } },
            { type: 'Interval', durationSeconds: 600, power: { value: 100, units: '%' } }
          ]
        },
        durationSec: 3600
      }
    })

    expect(facts.adherence.planLinked).toBe(true)
    expect(facts.adherence.adherenceAssessable).toBe(true)
    expect(facts.adherence.structureMatched).toBe(true)
    expect(facts.adherence.workIntervalHitRate).toBeGreaterThanOrEqual(50)
    expect(facts.adherence.executionClassification).toBe('as_prescribed')
  })

  it('prefers the planned step primaryTarget over power for run adherence', () => {
    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        title: 'Threshold Run',
        type: 'Run',
        durationSec: 2100,
        rawJson: {
          intervals: [
            {
              type: 'WORK',
              moving_time: 480,
              average_watts: 320,
              average_heartrate: 168,
              average_speed: 4.05
            },
            {
              type: 'REST',
              moving_time: 120,
              average_watts: 280,
              average_heartrate: 132,
              average_speed: 2.65
            },
            {
              type: 'WORK',
              moving_time: 480,
              average_watts: 322,
              average_heartrate: 169,
              average_speed: 4.04
            },
            {
              type: 'REST',
              moving_time: 120,
              average_watts: 278,
              average_heartrate: 133,
              average_speed: 2.63
            }
          ]
        }
      }),
      plannedWorkout: {
        durationSec: 2100,
        structuredWorkout: {
          steps: [
            {
              type: 'Active',
              durationSeconds: 480,
              primaryTarget: 'pace',
              power: { value: 260, units: 'watts' },
              heartRate: { value: 168, units: 'bpm' },
              pace: { value: 4.05, units: 'm/s' }
            },
            {
              type: 'Rest',
              durationSeconds: 120,
              primaryTarget: 'pace',
              power: { value: 180, units: 'watts' },
              heartRate: { value: 132, units: 'bpm' },
              pace: { value: 2.65, units: 'm/s' }
            },
            {
              type: 'Active',
              durationSeconds: 480,
              primaryTarget: 'pace',
              power: { value: 260, units: 'watts' },
              heartRate: { value: 168, units: 'bpm' },
              pace: { value: 4.05, units: 'm/s' }
            },
            {
              type: 'Rest',
              durationSeconds: 120,
              primaryTarget: 'pace',
              power: { value: 180, units: 'watts' },
              heartRate: { value: 132, units: 'bpm' },
              pace: { value: 2.65, units: 'm/s' }
            }
          ]
        }
      }
    })

    expect(facts.adherence.workIntervalHitRate).toBe(100)
    expect(facts.adherence.recoveryHitRate).toBe(100)
    expect(facts.adherence.executionClassification).toBe('as_prescribed')
  })

  it('falls back to sport metric preference when primaryTarget is absent', () => {
    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        title: 'Threshold Run',
        type: 'Run',
        durationSec: 2100,
        rawJson: {
          intervals: [
            {
              type: 'WORK',
              moving_time: 480,
              average_watts: 320,
              average_heartrate: 168,
              average_speed: 4.05
            },
            {
              type: 'REST',
              moving_time: 120,
              average_watts: 280,
              average_heartrate: 132,
              average_speed: 2.65
            },
            {
              type: 'WORK',
              moving_time: 480,
              average_watts: 322,
              average_heartrate: 169,
              average_speed: 4.04
            },
            {
              type: 'REST',
              moving_time: 120,
              average_watts: 278,
              average_heartrate: 133,
              average_speed: 2.63
            }
          ]
        }
      }),
      sportSettings: {
        loadPreference: 'HR_PACE_POWER'
      },
      plannedWorkout: {
        durationSec: 2100,
        structuredWorkout: {
          steps: [
            {
              type: 'Active',
              durationSeconds: 480,
              power: { value: 260, units: 'watts' },
              heartRate: { value: 168, units: 'bpm' },
              pace: { value: 4.05, units: 'm/s' }
            },
            {
              type: 'Rest',
              durationSeconds: 120,
              power: { value: 180, units: 'watts' },
              heartRate: { value: 132, units: 'bpm' },
              pace: { value: 2.65, units: 'm/s' }
            },
            {
              type: 'Active',
              durationSeconds: 480,
              power: { value: 260, units: 'watts' },
              heartRate: { value: 168, units: 'bpm' },
              pace: { value: 4.05, units: 'm/s' }
            },
            {
              type: 'Rest',
              durationSeconds: 120,
              power: { value: 180, units: 'watts' },
              heartRate: { value: 132, units: 'bpm' },
              pace: { value: 2.65, units: 'm/s' }
            }
          ]
        }
      }
    })

    expect(facts.adherence.workIntervalHitRate).toBe(100)
    expect(facts.adherence.recoveryHitRate).toBe(100)
    expect(facts.adherence.executionClassification).toBe('as_prescribed')
  })

  it('treats Z1 pace-zone recoveries as low-intensity pace targets', () => {
    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        title: 'Marathon Pace Run',
        type: 'Run',
        durationSec: 1320,
        rawJson: {
          intervals: [
            {
              type: 'WORK',
              moving_time: 600,
              average_speed: 4.02
            },
            {
              type: 'REST',
              moving_time: 60,
              average_speed: 2.95
            },
            {
              type: 'WORK',
              moving_time: 600,
              average_speed: 4.01
            },
            {
              type: 'REST',
              moving_time: 60,
              average_speed: 3.0
            }
          ]
        }
      }),
      sportSettings: {
        thresholdPace: 4,
        paceZones: [
          { min: 0, max: 3.2 },
          { min: 3.21, max: 3.56 },
          { min: 3.57, max: 3.8 },
          { min: 3.81, max: 4.2 }
        ]
      },
      plannedWorkout: {
        durationSec: 1320,
        structuredWorkout: {
          steps: [
            {
              type: 'Active',
              durationSeconds: 600,
              primaryTarget: 'pace',
              pace: { value: 4, units: 'm/s' }
            },
            {
              type: 'Rest',
              durationSeconds: 60,
              primaryTarget: 'pace',
              pace: { value: 1, units: 'pace_zone' }
            },
            {
              type: 'Active',
              durationSeconds: 600,
              primaryTarget: 'pace',
              pace: { value: 4, units: 'm/s' }
            },
            {
              type: 'Rest',
              durationSeconds: 60,
              primaryTarget: 'pace',
              pace: { value: 1, units: 'pace_zone' }
            }
          ]
        }
      }
    })

    expect(facts.adherence.workIntervalHitRate).toBe(100)
    expect(facts.adherence.recoveryHitRate).toBe(100)
    expect(facts.adherence.structureMatched).toBe(true)
    expect(facts.adherence.executionClassification).toBe('as_prescribed')
  })

  it('does not classify high-intensity pace steps as recovery just because source type says rest', () => {
    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        title: 'Marathon Session',
        type: 'Run',
        durationSec: 6975,
        rawJson: {
          intervals: [
            { type: 'REST', moving_time: 3600, average_speed: 3.0 },
            { type: 'WORK', moving_time: 745, average_speed: 4.0 },
            { type: 'REST', moving_time: 180, average_speed: 2.95 },
            { type: 'WORK', moving_time: 745, average_speed: 4.01 },
            { type: 'REST', moving_time: 180, average_speed: 2.93 },
            { type: 'WORK', moving_time: 745, average_speed: 4.0 },
            { type: 'REST', moving_time: 180, average_speed: 2.92 },
            { type: 'REST', moving_time: 600, average_speed: 2.9 }
          ]
        }
      }),
      sportSettings: {
        thresholdPace: 4.3290043,
        paceZones: [
          { min: 2.6, max: 3.38, name: 'Z1 Easy' },
          { min: 3.38, max: 3.81, name: 'Z2 Endurance' },
          { min: 3.81, max: 4.11, name: 'Z3 Tempo' },
          { min: 4.11, max: 4.42, name: 'Z4 Threshold' }
        ]
      },
      plannedWorkout: {
        durationSec: 6975,
        structuredWorkout: {
          steps: [
            { type: 'Rest', durationSeconds: 3600, pace: { value: 1, units: 'pace_zone' } },
            {
              type: 'Active',
              reps: 3,
              steps: [
                { type: 'Rest', durationSeconds: 745, pace: { value: 93, units: '%pace' } },
                { type: 'Rest', durationSeconds: 180, pace: { value: 1, units: 'pace_zone' } }
              ]
            },
            {
              type: 'Rest',
              durationSeconds: 600,
              pace: { value: 1, units: 'pace_zone' }
            }
          ]
        }
      }
    })

    expect(facts.adherence.workIntervalHitRate).toBe(100)
    expect(facts.adherence.recoveryHitRate).toBe(100)
    expect(facts.adherence.structureMatched).toBe(true)
    expect(facts.adherence.executionClassification).toBe('as_prescribed')
  })

  it('marks outdoor substitutions as not fully assessable when no actual intervals exist', () => {
    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        title: 'Outdoor Endurance Ride',
        type: 'Ride',
        durationSec: 4200
      }),
      plannedWorkout: {
        durationSec: 3600,
        structuredWorkout: {
          steps: [{ type: 'Interval', durationSeconds: 1200, power: { value: 0.8, units: '%' } }]
        }
      }
    })

    expect(facts.adherence.adherenceAssessable).toBe(false)
    expect(facts.adherence.executionClassification).toBe('unstructured_substitution')
  })

  it('uses rawJson.intervals when icu_intervals is absent for adherence', () => {
    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        title: 'ERG Threshold Ride',
        type: 'Ride',
        durationSec: 3600,
        rawJson: {
          intervals: [
            { type: 'WORK', moving_time: 600, average_watts: 248, intensity: 0.99 },
            { type: 'REST', moving_time: 300, average_watts: 150, intensity: 0.6 },
            { type: 'WORK', moving_time: 600, average_watts: 252, intensity: 1.01 }
          ]
        }
      }),
      sportSettings: { ftp: 250 },
      plannedWorkout: {
        structuredWorkout: {
          steps: [
            { type: 'Interval', durationSeconds: 600, power: { value: 100, units: '%' } },
            { type: 'Rest', durationSeconds: 300, power: { value: 60, units: '%' } },
            { type: 'Interval', durationSeconds: 600, power: { value: 100, units: '%' } }
          ]
        },
        durationSec: 3600
      }
    })

    expect(facts.adherence.adherenceAssessable).toBe(true)
    expect(facts.adherence.structureMatched).toBe(true)
    expect(facts.adherence.executionClassification).toBe('as_prescribed')
  })

  it('scores RPE-target plans against provider laps on a single intensity scale', () => {
    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        title: 'RPE Tempo Session',
        type: 'Ride',
        durationSec: 3600,
        rawJson: {
          // Intervals.icu reports lap `intensity` as a percent of threshold.
          icu_intervals: [
            { type: 'WORK', moving_time: 600, average_watts: 228, intensity: 91 },
            { type: 'REST', moving_time: 300, average_watts: 125, intensity: 50 },
            { type: 'WORK', moving_time: 600, average_watts: 230, intensity: 92 }
          ]
        }
      }),
      sportSettings: { ftp: 250 },
      plannedWorkout: {
        structuredWorkout: {
          steps: [
            { type: 'Interval', durationSeconds: 600, rpe: 9 },
            { type: 'Rest', durationSeconds: 300, rpe: 5 },
            { type: 'Interval', durationSeconds: 600, rpe: 9 }
          ]
        },
        durationSec: 3600
      }
    })

    expect(facts.adherence.adherenceAssessable).toBe(true)
    expect(facts.adherence.structureMatched).toBe(true)
    expect(facts.adherence.workIntervalHitRate).toBe(100)
    expect(facts.adherence.recoveryHitRate).toBe(100)
    // ~1-2% over an intensity factor of 0.9, not the ~11,000% the percent-vs-
    // ratio comparison used to produce.
    expect(facts.adherence.targetOvershootPct).not.toBeNull()
    expect(facts.adherence.targetOvershootPct!).toBeLessThan(10)
    expect(facts.adherence.targetUndershootPct).toBeNull()
  })

  it('does not call an on-target RPE session intensity_inflated', () => {
    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        title: 'RPE Threshold Session',
        type: 'Ride',
        durationSec: 3600,
        rawJson: {
          icu_intervals: [
            { type: 'WORK', moving_time: 600, average_watts: 250, intensity: 100 },
            { type: 'REST', moving_time: 300, average_watts: 150, intensity: 60 },
            { type: 'WORK', moving_time: 600, average_watts: 250, intensity: 100 }
          ]
        }
      }),
      sportSettings: { ftp: 250 },
      plannedWorkout: {
        structuredWorkout: {
          steps: [
            { type: 'Interval', durationSeconds: 600, rpe: 10 },
            { type: 'Rest', durationSeconds: 300, rpe: 6 },
            { type: 'Interval', durationSeconds: 600, rpe: 10 }
          ]
        },
        durationSec: 3600
      }
    })

    expect(facts.adherence.executionClassification).not.toBe('intensity_inflated')
    expect(facts.adherence.executionClassification).toBe('as_prescribed')
    expect(facts.adherence.targetOvershootPct).toBeNull()
    expect(facts.adherence.workIntervalHitRate).toBe(100)
  })

  it('excludes RPE steps with no measurable intensity from the hit rate instead of scoring them as misses', () => {
    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        title: 'RPE Session Without Lap Intensity',
        type: 'Ride',
        durationSec: 3600,
        rawJson: {
          // Laps carry no `intensity` at all — the same situation as
          // engine-detected intervals, which never populate the field.
          icu_intervals: [
            { type: 'WORK', moving_time: 600, average_watts: 228 },
            { type: 'REST', moving_time: 300, average_watts: 125 },
            { type: 'WORK', moving_time: 600, average_watts: 230 }
          ]
        }
      }),
      sportSettings: { ftp: 250 },
      plannedWorkout: {
        structuredWorkout: {
          steps: [
            { type: 'Interval', durationSeconds: 600, rpe: 9 },
            { type: 'Rest', durationSeconds: 300, rpe: 5 },
            { type: 'Interval', durationSeconds: 600, rpe: 9 }
          ]
        },
        durationSec: 3600
      }
    })

    expect(facts.adherence.workIntervalHitRate).toBeNull()
    expect(facts.adherence.recoveryHitRate).toBeNull()
    expect(facts.adherence.targetOvershootPct).toBeNull()
    expect(facts.adherence.targetUndershootPct).toBeNull()
    expect(facts.adherence.executionClassification).not.toBe('intensity_inflated')
  })

  it('falls back to stream-detected intervals when synced intervals are missing', () => {
    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        title: 'Structured ERG Ride',
        type: 'VirtualRide',
        durationSec: 3606,
        ftp: 212,
        streams: {
          time: Array.from({ length: 3609 }, (_, index) => index),
          watts: [
            ...Array.from({ length: 1200 }, () => 127),
            ...Array.from({ length: 480 }, () => 153),
            ...Array.from({ length: 128 }, () => 113),
            ...Array.from({ length: 472 }, () => 153),
            ...Array.from({ length: 128 }, () => 113),
            ...Array.from({ length: 472 }, () => 153),
            ...Array.from({ length: 729 }, () => 89)
          ]
        },
        rawJson: {}
      }),
      plannedWorkout: {
        durationSec: 3600,
        structuredWorkout: {
          steps: [
            {
              type: 'Warmup',
              durationSeconds: 1200,
              power: { range: { start: 0.5, end: 0.7 }, units: '%' }
            },
            {
              type: 'Active',
              reps: 3,
              steps: [
                { type: 'Active', durationSeconds: 480, power: { value: 0.72, units: '%' } },
                { type: 'Rest', durationSeconds: 120, power: { value: 0.52, units: '%' } }
              ]
            },
            {
              type: 'Cooldown',
              durationSeconds: 600,
              power: { range: { start: 0.5, end: 0.3 }, units: '%' }
            }
          ]
        }
      }
    })

    expect(facts.adherence.adherenceAssessable).toBe(true)
    expect(facts.adherence.structureMatched).toBe(true)
    expect(facts.adherence.executionClassification).toBe('as_prescribed')
    expect(facts.adherence.workIntervalHitRate).toBe(100)
    expect(facts.adherence.recoveryHitRate).toBe(80)
  })

  it('prefers synced raw intervals when repeated hard reps are timed more accurately than detected fallback', () => {
    const time = Array.from({ length: 8540 }, (_, index) => index)
    const watts = [
      ...Array.from({ length: 2527 }, () => 135),
      ...Array.from({ length: 239 }, () => 264),
      ...Array.from({ length: 362 }, () => 59),
      ...Array.from({ length: 236 }, () => 270),
      ...Array.from({ length: 430 }, () => 74),
      ...Array.from({ length: 180 }, () => 275),
      ...Array.from({ length: 430 }, () => 75),
      ...Array.from({ length: 180 }, () => 269),
      ...Array.from({ length: 405 }, () => 62),
      ...Array.from({ length: 231 }, () => 269),
      ...Array.from({ length: 266 }, () => 41),
      ...Array.from({ length: 2475 }, () => 116),
      ...Array.from({ length: 599 }, () => 83)
    ]

    const workout = makeWorkout({
      title: 'VO2 Max Precision 5x4m',
      type: 'Ride',
      durationSec: 8540,
      ftp: 220,
      streams: {
        time,
        watts
      },
      rawJson: {
        icu_intervals: [
          { type: 'RECOVERY', elapsed_time: 2523, average_watts: 133 },
          { type: 'WORK', elapsed_time: 237, average_watts: 268, intensity: 1.22 },
          { type: 'RECOVERY', elapsed_time: 359, average_watts: 54, intensity: 0.25 },
          { type: 'WORK', elapsed_time: 241, average_watts: 271, intensity: 1.23 },
          { type: 'RECOVERY', elapsed_time: 359, average_watts: 52, intensity: 0.24 },
          { type: 'WORK', elapsed_time: 242, average_watts: 275, intensity: 1.25 },
          { type: 'RECOVERY', elapsed_time: 360, average_watts: 55, intensity: 0.25 },
          { type: 'WORK', elapsed_time: 238, average_watts: 272, intensity: 1.24 },
          { type: 'RECOVERY', elapsed_time: 359, average_watts: 52, intensity: 0.24 },
          { type: 'WORK', elapsed_time: 242, average_watts: 273, intensity: 1.24 },
          { type: 'RECOVERY', elapsed_time: 3380, average_watts: 103, intensity: 0.47 }
        ]
      }
    })

    const plannedWorkout = {
      structuredWorkout: {
        steps: [
          { type: 'Warmup', durationSeconds: 720, power: { range: { start: 0.48, end: 0.52 } } },
          { type: 'Active', durationSeconds: 1800, power: { range: { start: 0.63, end: 0.67 } } },
          { type: 'Active', durationSeconds: 240, power: { range: { start: 1.15, end: 1.19 } } },
          { type: 'Rest', durationSeconds: 360, power: { range: { start: 0.63, end: 0.67 } } },
          { type: 'Active', durationSeconds: 240, power: { range: { start: 1.15, end: 1.19 } } },
          { type: 'Rest', durationSeconds: 360, power: { range: { start: 0.63, end: 0.67 } } },
          { type: 'Active', durationSeconds: 240, power: { range: { start: 1.15, end: 1.19 } } },
          { type: 'Rest', durationSeconds: 360, power: { range: { start: 0.63, end: 0.67 } } },
          { type: 'Active', durationSeconds: 240, power: { range: { start: 1.15, end: 1.19 } } },
          { type: 'Rest', durationSeconds: 360, power: { range: { start: 0.63, end: 0.67 } } },
          { type: 'Active', durationSeconds: 240, power: { range: { start: 1.15, end: 1.19 } } },
          { type: 'Rest', durationSeconds: 360, power: { range: { start: 0.63, end: 0.67 } } },
          { type: 'Active', durationSeconds: 2400, power: { range: { start: 0.58, end: 0.62 } } },
          { type: 'Cooldown', durationSeconds: 600, power: { range: { start: 0.6, end: 0.45 } } }
        ]
      }
    }

    expect(getActualIntervalsSourceForAnalysis(workout, plannedWorkout)).toBe('raw')
  })

  it('suppresses late-session fade when the workout ends with a planned cooldown', () => {
    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        title: 'ERG Ride With Cooldown',
        type: 'Ride',
        durationSec: 3000,
        streams: {
          time: Array.from({ length: 600 }, (_, index) => index * 5),
          watts: [
            ...Array.from({ length: 240 }, () => 220),
            ...Array.from({ length: 240 }, () => 260),
            ...Array.from({ length: 120 }, () => 120)
          ]
        },
        rawJson: {
          intervals: [
            { type: 'WARMUP', moving_time: 600, average_watts: 180, intensity: 0.72 },
            { type: 'WORK', moving_time: 1200, average_watts: 255, intensity: 1.02 },
            { type: 'COOLDOWN', moving_time: 600, average_watts: 120, intensity: 0.48 }
          ]
        }
      }),
      sportSettings: { ftp: 250 },
      plannedWorkout: {
        structuredWorkout: {
          steps: [
            { type: 'Warmup', durationSeconds: 600, power: { value: 72, units: '%' } },
            { type: 'Interval', durationSeconds: 1200, power: { value: 102, units: '%' } },
            { type: 'Cooldown', durationSeconds: 600, power: { value: 48, units: '%' } }
          ]
        },
        durationSec: 2400
      }
    })

    expect(facts.performanceSignals.durability.lateSessionFadePct).toBeNull()
    expect(facts.guardrails.suppressions).toContain(
      'Late-session fade should not be penalized because the workout ends with a planned recovery/cooldown phase.'
    )
  })

  it('uses pace-first guardrails for runs with velocity data', () => {
    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        type: 'Run',
        averageSpeed: 12.2,
        averageWatts: 280,
        streams: {
          velocity: Array.from({ length: 600 }, () => 3.4),
          heartrate: Array.from({ length: 600 }, () => 150),
          cadence: Array.from({ length: 600 }, () => 168)
        }
      })
    })

    expect(facts.guardrails.archetype.primaryMetric).toBe('pace')
    expect(facts.guardrails.telemetry.paceUsable).toBe(true)
    expect(facts.guardrails.telemetry.gpsConfidence).toBe('high')
  })

  it('classifies zwift rides as indoor resistance when trainer flag is missing', () => {
    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        type: 'VirtualRide',
        source: 'zwift',
        trainer: false,
        deviceName: 'Zwift',
        title: 'Zwift - Tempus Fugit',
        variabilityIndex: 1.04
      })
    })

    expect(facts.guardrails.archetype.executionEnvironment).toBe('indoor_resistance')
  })

  it('suppresses pacing drift and steady-state assumptions for stop-and-go nordic ski sessions', () => {
    const speed = [
      ...Array.from({ length: 150 }, () => 0),
      ...Array.from({ length: 220 }, () => 3.2),
      ...Array.from({ length: 60 }, () => 0),
      ...Array.from({ length: 180 }, () => 5.8),
      ...Array.from({ length: 80 }, () => 0.4),
      ...Array.from({ length: 200 }, () => 4.9),
      ...Array.from({ length: 90 }, () => 0)
    ]

    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        type: 'NordicSki',
        title: 'Explosive Ski Intervals',
        durationSec: speed.length * 5,
        averageSpeed: 3.4,
        averageWatts: null,
        normalizedPower: null,
        intensity: 0.84,
        variabilityIndex: null,
        streams: {
          velocity: speed,
          heartrate: Array.from({ length: speed.length }, (_, index) =>
            index % 180 < 90 ? 168 : 132
          )
        }
      })
    })

    expect(facts.guardrails.archetype.primaryArchetype).toBe('mixed')
    expect(facts.guardrails.archetype.sessionSteadiness).toBe('stochastic')
    expect(facts.performanceSignals.sportSpecific.pacingDriftPct).toBeNull()
    expect(facts.performanceSignals.applicability.pacingDrift.applicable).toBe(false)
    expect(facts.performanceSignals.applicability.pacingDrift.reason).toContain(
      'steady run-like sessions'
    )
    expect(facts.performanceSignals.decoupling.interpretable).toBe(false)
    expect(facts.guardrails.suppressions.join(' ')).toContain('Stop-and-go motion pattern')
  })
})

describe('run pace interval detection refs (CW-384)', () => {
  const thresholdPace = 4.0 // m/s, as stored on sportSettings.thresholdPace
  const velocity = [
    ...Array.from({ length: 600 }, () => 2.3), // warmup
    ...Array.from({ length: 5 }, () => [
      ...Array.from({ length: 180 }, () => 4.3), // rep at ~108% of threshold pace
      ...Array.from({ length: 180 }, () => 2.4) // recovery jog at 60% of threshold pace
    ]).flat(),
    ...Array.from({ length: 300 }, () => 2.2) // cooldown
  ]

  const runWorkout = makeWorkout({
    title: '5 x 3min Threshold Run',
    type: 'Run',
    durationSec: velocity.length,
    averageWatts: null,
    averageSpeed: 3.1,
    streams: {
      time: velocity.map((_, index) => index),
      velocity
    }
  })

  it('splits reps from recovery jogs when sport-settings refs carry a real threshold pace', () => {
    const intervals = getActualIntervalsForAnalysis(runWorkout, undefined, {
      ftp: 0,
      lthr: 0,
      maxHr: 0,
      thresholdPace
    })

    expect(intervals.filter((interval) => interval.classification === 'work')).toHaveLength(5)
    expect(intervals.filter((interval) => interval.type === 'RECOVERY')).toHaveLength(4)
  })

  it('collapses the same run into one block when no threshold pace reference exists', () => {
    // Documents the pre-fix behaviour: with thresholdPace 0 the detection engine falls back to
    // 0.65 * median(stream), which a recovery jog clears, so nothing separates the reps.
    const intervals = getActualIntervalsForAnalysis(runWorkout, undefined, {
      ftp: 0,
      lthr: 0,
      maxHr: 0,
      thresholdPace: 0
    })

    expect(intervals.filter((interval) => interval.classification === 'work')).toHaveLength(1)
  })

  it('reads the threshold pace from sport settings when refs are not passed explicitly', () => {
    const intervals = getActualIntervalsForAnalysis({
      ...runWorkout,
      sportSettings: { thresholdPace }
    })

    expect(intervals.filter((interval) => interval.classification === 'work')).toHaveLength(5)
  })
})

describe('cadence units and pace in actual interval rows (CW-387)', () => {
  const RUN_WITH_LAPS = makeWorkout({
    title: '3 x 1km Threshold',
    type: 'Run',
    averageWatts: null,
    rawJson: {
      icu_intervals: [
        {
          type: 'WORK',
          moving_time: 240,
          distance: 1000,
          average_heartrate: 168,
          // One-legged, exactly as Strava / Intervals.icu store run cadence.
          average_cadence: 88,
          average_speed: 4.1667,
          intensity: 101
        },
        {
          type: 'RECOVERY',
          moving_time: 120,
          distance: 400,
          average_heartrate: 138,
          average_cadence: 76,
          average_speed: 3.0,
          intensity: 68
        }
      ]
    }
  })

  it('doubles run cadence once and labels it spm, and adds min/km pace', () => {
    const rows = formatActualIntervalsForPrompt(RUN_WITH_LAPS)

    // 88 rpm one-legged -> 176 spm, and the unit agrees with the number.
    expect(rows).toContain('176spm')
    expect(rows).toContain('152spm')
    expect(rows).not.toContain('rpm')
    // 4.1667 m/s -> 240 s/km -> 4:00/km; 3.0 m/s -> 333 s/km -> 5:33/km.
    expect(rows).toContain('4:00/km')
    expect(rows).toContain('5:33/km')
  })

  it('leaves ride cadence untouched, keeps rpm and omits the pace column', () => {
    const rows = formatActualIntervalsForPrompt(
      makeWorkout({
        type: 'Ride',
        rawJson: {
          icu_intervals: [
            {
              type: 'WORK',
              moving_time: 720,
              distance: 6400,
              average_watts: 255,
              average_heartrate: 155,
              average_cadence: 88,
              average_speed: 8.9,
              intensity: 93
            }
          ]
        }
      })
    )

    expect(rows).toContain('88rpm')
    expect(rows).not.toContain('spm')
    expect(rows).not.toContain('/km')
  })

  it('emits N/A for pace on a pace-capable workout with no speed', () => {
    const rows = formatActualIntervalsForPrompt(
      makeWorkout({
        type: 'Run',
        averageWatts: null,
        rawJson: {
          icu_intervals: [
            { type: 'WORK', moving_time: 300, average_heartrate: 160, average_cadence: 90 }
          ]
        }
      })
    )

    expect(rows).toContain('180spm | N/A')
  })
})

describe('cadence convention helpers (CW-387)', () => {
  it('resolves the unit from the workout family, not from a hardcoded string', () => {
    expect(resolveCadenceUnit('Run')).toBe('spm')
    expect(resolveCadenceUnit('TrailRun')).toBe('spm')
    expect(resolveCadenceUnit('Treadmill')).toBe('spm')
    expect(resolveCadenceUnit('Ride')).toBe('rpm')
    expect(resolveCadenceUnit('VirtualRide')).toBe('rpm')
    expect(resolveCadenceUnit(null)).toBe('rpm')
  })

  it('doubles one-legged run cadence and is idempotent for realistic values', () => {
    expect(toCanonicalCadence(88, true)).toBe(176)
    // Already steps-per-minute (Garmin's averageRunCadenceInStepsPerMinute).
    expect(toCanonicalCadence(176, true)).toBe(176)
    expect(toCanonicalCadence(toCanonicalCadence(88, true), true)).toBe(176)
    // Never scales cycling cadence.
    expect(toCanonicalCadence(88, false)).toBe(88)
    expect(toCanonicalCadence(null, true)).toBeNull()
    expect(toCanonicalCadence(0, true)).toBe(0)
  })

  it('keeps the value and its unit together', () => {
    expect(formatCadenceWithUnit(176, 'Run')).toBe('176 spm')
    expect(formatCadenceWithUnit(88.4, 'Ride')).toBe('88 rpm')
    expect(formatCadenceWithUnit(88, 'Ride', '')).toBe('88rpm')
    expect(formatCadenceWithUnit(null, 'Run')).toBe('N/A')
  })
})
