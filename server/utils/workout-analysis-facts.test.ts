import { describe, expect, it } from 'vitest'
import {
  alignPlannedToActualIntervals,
  buildIntervalGroupSummaries,
  buildWorkoutAnalysisFacts,
  buildWorkoutAnalysisFactsV2,
  deriveMetricUsabilitySignals,
  formatActualIntervalsForPrompt,
  formatCadenceWithUnit,
  getActualIntervalsForAnalysis,
  getActualIntervalsSourceForAnalysis,
  resolveAdherenceMetricOrder,
  resolveCadenceUnit,
  toCanonicalCadence,
  toIntervalIntensityFactor
} from './workout-analysis-facts'
import type { ActualIntervalForAnalysis } from './workout-analysis-facts'

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

describe('planned-step detection refs (CW-402)', () => {
  // The RECOVERY -> WORK promotion in `toDetectionPlannedSteps` reads an intensity
  // factor built from the athlete's references. When those were hardcoded to zero,
  // an absolute watts target fell back to a fixed "assume 250 W" divisor and an
  // absolute bpm target produced null, so the rule could not fire off real
  // references at all. The FTP below is deliberately far from 250 W so the two
  // paths give different answers for the same step.
  const FTP = 200
  const LTHR = 160
  const STEP_SECONDS = 300

  function repeat(value: number) {
    return Array.from({ length: STEP_SECONDS }, () => value)
  }

  function powerPlan() {
    return {
      structuredWorkout: {
        steps: [
          {
            name: 'Spin up',
            type: 'Warmup',
            durationSeconds: STEP_SECONDS,
            power: { value: 120, units: 'w' }
          },
          {
            name: 'Effort 1',
            type: 'Interval',
            durationSeconds: STEP_SECONDS,
            power: { value: 240, units: 'w' }
          },
          // Labelled recovery, but 170 W is 85% of a 200 W FTP: this is work.
          {
            name: 'Float 1',
            type: 'Recovery',
            durationSeconds: STEP_SECONDS,
            power: { value: 170, units: 'w' }
          },
          {
            name: 'Effort 2',
            type: 'Interval',
            durationSeconds: STEP_SECONDS,
            power: { value: 240, units: 'w' }
          },
          // Genuine recovery at 50% of FTP: must stay RECOVERY either way.
          {
            name: 'Easy spin',
            type: 'Recovery',
            durationSeconds: STEP_SECONDS,
            power: { value: 100, units: 'w' }
          },
          {
            name: 'Wind down',
            type: 'Cooldown',
            durationSeconds: STEP_SECONDS,
            power: { value: 110, units: 'w' }
          }
        ]
      }
    }
  }

  const powerStream = [
    ...repeat(120),
    ...repeat(240),
    ...repeat(170),
    ...repeat(240),
    ...repeat(100),
    ...repeat(110)
  ]

  const rideWorkout = makeWorkout({
    title: '2 x 5min with tempo floats',
    type: 'Ride',
    durationSec: powerStream.length,
    streams: {
      time: powerStream.map((_, index) => index),
      watts: powerStream
    }
  })

  it('promotes a work-intensity RECOVERY step when refs carry a real FTP', () => {
    const intervals = getActualIntervalsForAnalysis(rideWorkout, powerPlan(), {
      ftp: FTP,
      lthr: 0,
      maxHr: 0,
      thresholdPace: 0
    })

    expect(intervals.map((interval) => interval.type)).toEqual([
      'WARMUP',
      'WORK',
      'WORK',
      'WORK',
      'RECOVERY',
      'COOLDOWN'
    ])
    // The 100 W step is genuine recovery and must not be swept up by the promotion.
    expect(intervals[4]?.classification).toBe('recovery')
  })

  it('leaves the same step as RECOVERY when no FTP reference exists', () => {
    const intervals = getActualIntervalsForAnalysis(rideWorkout, powerPlan(), {
      ftp: 0,
      lthr: 0,
      maxHr: 0,
      thresholdPace: 0
    })

    expect(intervals.map((interval) => interval.type)).toEqual([
      'WARMUP',
      'WORK',
      'RECOVERY',
      'WORK',
      'RECOVERY',
      'COOLDOWN'
    ])
  })

  it('reads the FTP from sport settings when refs are not passed explicitly', () => {
    const intervals = getActualIntervalsForAnalysis(
      { ...rideWorkout, sportSettings: { ftp: FTP } },
      powerPlan()
    )

    expect(intervals.map((interval) => interval.type)).toEqual([
      'WARMUP',
      'WORK',
      'WORK',
      'WORK',
      'RECOVERY',
      'COOLDOWN'
    ])
  })

  function hrPlan() {
    return {
      structuredWorkout: {
        steps: [
          {
            name: 'Ease in',
            type: 'Warmup',
            durationSeconds: STEP_SECONDS,
            heartRate: { value: 120, units: 'bpm' }
          },
          {
            name: 'Effort 1',
            type: 'Interval',
            durationSeconds: STEP_SECONDS,
            heartRate: { value: 172, units: 'bpm' }
          },
          // 142 bpm is 89% of a 160 bpm LTHR: work, despite the label.
          {
            name: 'Float 1',
            type: 'Recovery',
            durationSeconds: STEP_SECONDS,
            heartRate: { value: 142, units: 'bpm' }
          },
          {
            name: 'Effort 2',
            type: 'Interval',
            durationSeconds: STEP_SECONDS,
            heartRate: { value: 172, units: 'bpm' }
          },
          {
            name: 'Easy spin',
            type: 'Recovery',
            durationSeconds: STEP_SECONDS,
            heartRate: { value: 118, units: 'bpm' }
          },
          {
            name: 'Wind down',
            type: 'Cooldown',
            durationSeconds: STEP_SECONDS,
            heartRate: { value: 110, units: 'bpm' }
          }
        ]
      }
    }
  }

  const hrStream = [
    ...repeat(120),
    ...repeat(172),
    ...repeat(142),
    ...repeat(172),
    ...repeat(118),
    ...repeat(110)
  ]

  const hrWorkout = makeWorkout({
    title: '2 x 5min HR-guided',
    type: 'Ride',
    durationSec: hrStream.length,
    averageWatts: null,
    streams: {
      time: hrStream.map((_, index) => index),
      heartrate: hrStream
    }
  })

  it('promotes a work-intensity RECOVERY step from an absolute bpm target and a real LTHR', () => {
    const intervals = getActualIntervalsForAnalysis(hrWorkout, hrPlan(), {
      ftp: 0,
      lthr: LTHR,
      maxHr: 0,
      thresholdPace: 0
    })

    expect(intervals.map((interval) => interval.type)).toEqual([
      'WARMUP',
      'WORK',
      'WORK',
      'WORK',
      'RECOVERY',
      'COOLDOWN'
    ])
  })

  it('keeps the bpm step as RECOVERY when there is no LTHR or max HR to compare against', () => {
    const intervals = getActualIntervalsForAnalysis(hrWorkout, hrPlan(), {
      ftp: 0,
      lthr: 0,
      maxHr: 0,
      thresholdPace: 0
    })

    expect(intervals.map((interval) => interval.type)).toEqual([
      'WARMUP',
      'WORK',
      'RECOVERY',
      'WORK',
      'RECOVERY',
      'COOLDOWN'
    ])
  })
})

describe('planned-to-actual alignment (CW-386)', () => {
  const plannedStep = (
    overrides: Partial<{
      type: string
      durationSeconds: number
      classification: 'work' | 'recovery'
      cadence: number | null
    }> = {}
  ) => ({
    type: 'Active',
    durationSeconds: 300,
    metric: 'power' as const,
    targetValue: 250,
    targetUnits: 'watts',
    intensityFactor: 1,
    cadence: null,
    ramp: false,
    classification: 'work' as const,
    ...overrides
  })

  const actualSegment = (
    overrides: Partial<{
      type: string
      durationSeconds: number
      classification: 'work' | 'recovery'
      avgCadence: number | null
      startIndex: number | null
      endIndex: number | null
    }> = {}
  ) => ({
    type: 'WORK',
    durationSeconds: 300,
    avgPower: 250,
    avgHr: null,
    avgSpeed: null,
    avgCadence: null,
    intensity: 1,
    matchScore: null,
    confidence: null,
    ambiguityNote: null,
    classification: 'work' as const,
    // Sample bounds are optional on ActualInterval (CW-393); these fixtures
    // exercise the alignment, which does not read them.
    startIndex: null,
    endIndex: null,
    ...overrides
  })

  it('returns one pair per planned step and reports extra actual segments explicitly', () => {
    const planned = [
      plannedStep({ durationSeconds: 300 }),
      plannedStep({ type: 'Rest', durationSeconds: 120, classification: 'recovery' }),
      plannedStep({ durationSeconds: 300 })
    ]
    const actual = [
      actualSegment({ durationSeconds: 300 }),
      actualSegment({ type: 'RECOVERY', durationSeconds: 120, classification: 'recovery' }),
      // An unplanned extra rep the athlete threw in.
      actualSegment({ durationSeconds: 300 }),
      actualSegment({ durationSeconds: 300 })
    ]

    const alignment = alignPlannedToActualIntervals(planned, actual)

    expect(alignment.pairs).toHaveLength(3)
    expect(alignment.pairs.every((pair) => pair.actual !== null)).toBe(true)
    expect(alignment.pairs.map((pair) => pair.actualIndex)).toEqual([0, 1, 2])
    expect(alignment.extraActual.map((entry) => entry.actualIndex)).toEqual([3])
    expect(alignment.droppedStubs).toBe(0)
  })

  it('never pairs a work step with a recovery segment, leaving both unpaired instead', () => {
    const planned = [plannedStep({ durationSeconds: 300 })]
    const actual = [
      actualSegment({ type: 'RECOVERY', durationSeconds: 300, classification: 'recovery' })
    ]

    const alignment = alignPlannedToActualIntervals(planned, actual)

    expect(alignment.pairs[0]!.actual).toBeNull()
    expect(alignment.extraActual).toHaveLength(1)
  })

  it('drops sub-15-second stub segments before pairing', () => {
    const planned = [plannedStep({ durationSeconds: 300 }), plannedStep({ durationSeconds: 300 })]
    const actual = [
      actualSegment({ durationSeconds: 300 }),
      actualSegment({ durationSeconds: 4 }),
      actualSegment({ durationSeconds: 300 })
    ]

    const alignment = alignPlannedToActualIntervals(planned, actual)

    expect(alignment.droppedStubs).toBe(1)
    expect(alignment.actualSegments).toHaveLength(2)
    expect(alignment.pairs.every((pair) => pair.actual !== null)).toBe(true)
    expect(alignment.extraActual).toHaveLength(0)
  })

  it('keeps genuinely short prescribed reps when the plan itself asks for them', () => {
    // A 10s sprint plan lowers the stub bar to its own shortest step, so the
    // reps the athlete executed are not thrown away as device noise.
    const planned = [plannedStep({ durationSeconds: 10 }), plannedStep({ durationSeconds: 10 })]
    const actual = [actualSegment({ durationSeconds: 10 }), actualSegment({ durationSeconds: 11 })]

    const alignment = alignPlannedToActualIntervals(planned, actual)

    expect(alignment.droppedStubs).toBe(0)
    expect(alignment.pairs.every((pair) => pair.actual !== null)).toBe(true)
  })

  it('scores a cadence-targeted plan against the matching rep instead of the warmup', () => {
    // Shape of the workouts on the originating support case: the athlete's
    // warmup arrives as two laps (a mid-warmup lap press) and the file ends in
    // a 4-second stub. Index pairing shifted every cadence comparison by one
    // from the second lap onwards, so plan step 1 was scored against the
    // warmup and the hit rate came out at 20%.
    const rep = (index: number) => [
      {
        type: 'WORK',
        moving_time: 300,
        average_watts: 250,
        average_cadence: 95,
        intensity: 100,
        lap: index
      },
      {
        type: 'REST',
        moving_time: 180,
        average_watts: 125,
        average_cadence: 85,
        intensity: 50,
        lap: index
      }
    ]

    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        title: 'Cadence Threshold Session',
        type: 'Ride',
        durationSec: 3120,
        rawJson: {
          icu_intervals: [
            {
              type: 'WARMUP',
              moving_time: 300,
              average_watts: 140,
              average_cadence: 85,
              intensity: 56
            },
            {
              type: 'WARMUP',
              moving_time: 300,
              average_watts: 140,
              average_cadence: 85,
              intensity: 56
            },
            ...rep(1),
            ...rep(2),
            ...rep(3),
            ...rep(4),
            {
              type: 'COOLDOWN',
              moving_time: 600,
              average_watts: 125,
              average_cadence: 80,
              intensity: 50
            },
            // Terminal stub lap: the athlete stopping the timer.
            { type: 'WORK', moving_time: 4, average_watts: 240, average_cadence: 60, intensity: 96 }
          ]
        }
      }),
      sportSettings: { ftp: 250 },
      plannedWorkout: {
        durationSec: 3120,
        structuredWorkout: {
          steps: [
            {
              type: 'Warmup',
              durationSeconds: 600,
              power: { value: 55, units: '%' },
              cadence: 85
            },
            ...Array.from({ length: 4 }, () => [
              {
                type: 'Interval',
                durationSeconds: 300,
                power: { value: 100, units: '%' },
                cadence: 95
              },
              { type: 'Rest', durationSeconds: 180, power: { value: 50, units: '%' }, cadence: 85 }
            ]).flat(),
            {
              type: 'Cooldown',
              durationSeconds: 600,
              power: { value: 50, units: '%' },
              cadence: 80
            }
          ]
        }
      }
    })

    expect(facts.adherence.cadenceAssessable).toBe(true)
    expect(facts.adherence.cadenceHitRate).toBe(100)
    expect(facts.adherence.workIntervalHitRate).toBe(100)
    expect(facts.adherence.recoveryHitRate).toBe(100)
    expect(facts.adherence.structureMatched).toBe(true)
    expect(facts.adherence.executionClassification).toBe('as_prescribed')
  })

  describe('cadence hit-rate denominator (CW-419)', () => {
    // A four-step cadence-targeted plan: two reps at 95 rpm with 85 rpm
    // recoveries. Every variation below only changes what the executed laps
    // recorded, so the denominator behaviour is the only moving part.
    const cadencePlan = {
      durationSec: 1200,
      structuredWorkout: {
        steps: [
          {
            type: 'Interval',
            durationSeconds: 300,
            power: { value: 100, units: '%' },
            cadence: 95
          },
          { type: 'Rest', durationSeconds: 300, power: { value: 50, units: '%' }, cadence: 85 },
          {
            type: 'Interval',
            durationSeconds: 300,
            power: { value: 100, units: '%' },
            cadence: 95
          },
          { type: 'Rest', durationSeconds: 300, power: { value: 50, units: '%' }, cadence: 85 }
        ]
      }
    }

    const factsFor = (icuIntervals: Record<string, unknown>[]) =>
      buildWorkoutAnalysisFactsV2({
        workout: makeWorkout({
          title: 'Cadence Denominator Session',
          type: 'Ride',
          durationSec: 1200,
          rawJson: { icu_intervals: icuIntervals }
        }),
        sportSettings: { ftp: 250 },
        plannedWorkout: cadencePlan
      })

    it('excludes aligned steps whose segment carries no cadence measurement', () => {
      // Every planned step is paired, the reps were executed on target power,
      // but the head unit had no cadence sensor. Before CW-419 this reported
      // `cadenceHitRate: 0` with `cadenceAssessable: true` — an explicit
      // "assessable" hard zero the AI could only read as total non-compliance.
      const facts = factsFor([
        { type: 'WORK', moving_time: 300, average_watts: 250, intensity: 100 },
        { type: 'REST', moving_time: 300, average_watts: 125, intensity: 50 },
        { type: 'WORK', moving_time: 300, average_watts: 250, intensity: 100 },
        { type: 'REST', moving_time: 300, average_watts: 125, intensity: 50 }
      ])

      expect(facts.adherence.cadenceHitRate).toBeNull()
      expect(facts.adherence.cadenceAssessable).toBe(false)
    })

    it('treats a zero cadence average as unmeasured rather than a miss', () => {
      const facts = factsFor([
        { type: 'WORK', moving_time: 300, average_watts: 250, average_cadence: 0, intensity: 100 },
        { type: 'REST', moving_time: 300, average_watts: 125, average_cadence: 0, intensity: 50 },
        { type: 'WORK', moving_time: 300, average_watts: 250, average_cadence: 0, intensity: 100 },
        { type: 'REST', moving_time: 300, average_watts: 125, average_cadence: 0, intensity: 50 }
      ])

      expect(facts.adherence.cadenceHitRate).toBeNull()
      expect(facts.adherence.cadenceAssessable).toBe(false)
    })

    it('still counts a planned cadence step with no aligned segment as a miss', () => {
      // Only the first rep and its recovery were executed. The two unpaired
      // planned steps are execution evidence, not missing measurement, so they
      // stay in the denominator (CW-386).
      const facts = factsFor([
        { type: 'WORK', moving_time: 300, average_watts: 250, average_cadence: 95, intensity: 100 },
        { type: 'REST', moving_time: 300, average_watts: 125, average_cadence: 85, intensity: 50 }
      ])

      expect(facts.adherence.cadenceAssessable).toBe(true)
      expect(facts.adherence.cadenceHitRate).toBe(50)
    })

    it('reports a real miss rate when cadence was recorded and missed', () => {
      const facts = factsFor([
        { type: 'WORK', moving_time: 300, average_watts: 250, average_cadence: 70, intensity: 100 },
        { type: 'REST', moving_time: 300, average_watts: 125, average_cadence: 70, intensity: 50 },
        { type: 'WORK', moving_time: 300, average_watts: 250, average_cadence: 70, intensity: 100 },
        { type: 'REST', moving_time: 300, average_watts: 125, average_cadence: 70, intensity: 50 }
      ])

      expect(facts.adherence.cadenceAssessable).toBe(true)
      expect(facts.adherence.cadenceHitRate).toBe(0)
    })

    it('scores only the measured steps when cadence coverage is partial', () => {
      // Rep 1 recorded cadence and hit it; rep 2's lap has no cadence at all.
      // Denominator drops to the two measured steps rather than diluting the
      // athlete's real compliance with unmeasurable ones.
      const facts = factsFor([
        { type: 'WORK', moving_time: 300, average_watts: 250, average_cadence: 95, intensity: 100 },
        { type: 'REST', moving_time: 300, average_watts: 125, average_cadence: 85, intensity: 50 },
        { type: 'WORK', moving_time: 300, average_watts: 250, intensity: 100 },
        { type: 'REST', moving_time: 300, average_watts: 125, intensity: 50 }
      ])

      expect(facts.adherence.cadenceAssessable).toBe(true)
      expect(facts.adherence.cadenceHitRate).toBe(100)
    })

    it('always surfaces the cadence assessability flag to the prompt', () => {
      // The narrative must be able to say "cadence was not assessable"; gating
      // the flag on its own truth value hid exactly the case that matters.
      const facts = factsFor([
        { type: 'WORK', moving_time: 300, average_watts: 250, intensity: 100 },
        { type: 'REST', moving_time: 300, average_watts: 125, intensity: 50 },
        { type: 'WORK', moving_time: 300, average_watts: 250, intensity: 100 },
        { type: 'REST', moving_time: 300, average_watts: 125, intensity: 50 }
      ])

      expect(facts.adherence.cadenceAssessable).toBe(false)
      expect(
        facts.confidence.debugMeta.promptDecisions['adherence.cadenceAssessable']!.include
      ).toBe(true)
      expect(facts.confidence.debugMeta.promptDecisions['adherence.cadenceHitRate']!.include).toBe(
        false
      )
    })
  })

  it('does not let a mid-session stub lap consume a planned rep', () => {
    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        title: 'Stub Lap Session',
        type: 'Ride',
        durationSec: 1260,
        rawJson: {
          icu_intervals: [
            { type: 'WORK', moving_time: 300, average_watts: 250 },
            // 5-second fragment between rep 1 and its recovery. Index pairing
            // handed it to planned rep 2, which then read as a 16% undershoot.
            { type: 'WORK', moving_time: 5, average_watts: 210 },
            { type: 'REST', moving_time: 120, average_watts: 125 },
            { type: 'WORK', moving_time: 300, average_watts: 250 },
            { type: 'REST', moving_time: 120, average_watts: 125 },
            { type: 'WORK', moving_time: 300, average_watts: 250 },
            { type: 'REST', moving_time: 120, average_watts: 125 }
          ]
        }
      }),
      sportSettings: { ftp: 250 },
      plannedWorkout: {
        durationSec: 1260,
        structuredWorkout: {
          steps: Array.from({ length: 3 }, () => [
            { type: 'Interval', durationSeconds: 300, power: { value: 100, units: '%' } },
            { type: 'Rest', durationSeconds: 120, power: { value: 50, units: '%' } }
          ]).flat()
        }
      }
    })

    expect(facts.adherence.workIntervalHitRate).toBe(100)
    expect(facts.adherence.recoveryHitRate).toBe(100)
    expect(facts.adherence.targetUndershootPct).toBeNull()
    expect(facts.adherence.structureMatched).toBe(true)
  })

  it('keeps the remaining reps aligned when one prescribed rep was never executed', () => {
    // Ladder session: 4 reps of falling intensity and rising duration. The
    // athlete skipped rep 3 (360s @ 260W) and rode the last rep 12% over its
    // target. Index pairing scored the executed 420s rep against planned rep 3
    // (260W), where +7.7% still counted as a hit - so the session came out at
    // 75% with a 7.7% overshoot and the missed rep was never visible. Aligned,
    // the skipped rep is the miss and the last rep is scored against its own
    // target.
    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        title: 'Descending Ladder',
        type: 'Ride',
        durationSec: 1320,
        rawJson: {
          icu_intervals: [
            { type: 'WORK', moving_time: 240, average_watts: 280 },
            { type: 'REST', moving_time: 180, average_watts: 120 },
            { type: 'WORK', moving_time: 300, average_watts: 270 },
            { type: 'REST', moving_time: 180, average_watts: 120 },
            { type: 'WORK', moving_time: 420, average_watts: 280 }
          ]
        }
      }),
      sportSettings: { ftp: 250 },
      plannedWorkout: {
        durationSec: 1620,
        structuredWorkout: {
          steps: [
            { type: 'Interval', durationSeconds: 240, power: { value: 280, units: 'watts' } },
            { type: 'Rest', durationSeconds: 180, power: { value: 120, units: 'watts' } },
            { type: 'Interval', durationSeconds: 300, power: { value: 270, units: 'watts' } },
            { type: 'Rest', durationSeconds: 180, power: { value: 120, units: 'watts' } },
            { type: 'Interval', durationSeconds: 360, power: { value: 260, units: 'watts' } },
            { type: 'Rest', durationSeconds: 180, power: { value: 120, units: 'watts' } },
            { type: 'Interval', durationSeconds: 420, power: { value: 250, units: 'watts' } }
          ]
        }
      }
    })

    expect(facts.adherence.workIntervalHitRate).toBe(50)
    expect(facts.adherence.targetOvershootPct).toBe(12)
    expect(facts.adherence.recoveryHitRate).toBeCloseTo(66.7, 1)
  })
})

/* -------------------------------------------------------------------------- */
/* Rep-scoped durability and stability signals (CW-393)                        */
/* -------------------------------------------------------------------------- */

describe('rep-scoped durability and stability signals', () => {
  const THRESHOLD_FIXTURE_FTP = 280

  /**
   * The shape of production workout `81597338-b680-459a-a97e-d7caf1ede3da`:
   * warmup, 3 x 4min at threshold (271 / 274 / 276 W — a CoV of 0.75%, i.e.
   * excellent), recovery jogs between them, a long endurance-buffer block that
   * the provider also labels WORK, and a cooldown.
   *
   * Measured session-wide, every durability signal on this session lies:
   *   - execution stability: whole-stream CoV 29.2% -> clamped to 0.0/100
   *   - repeatability: the 223 W buffer averaged in with the reps -> 33.0/100
   *   - cadence drift: warmup window vs cooldown window -> "cadence fell 6.8%"
   *   - late-session fade: withheld entirely by the cooldown suppression
   */
  const THRESHOLD_BLOCKS = [
    { seconds: 600, watts: 150, cadence: 85, intensity: 0.54 },
    { seconds: 240, watts: 271, cadence: 92, intensity: 0.97 },
    { seconds: 240, watts: 140, cadence: 80, intensity: 0.5 },
    { seconds: 240, watts: 274, cadence: 92, intensity: 0.98 },
    { seconds: 240, watts: 140, cadence: 80, intensity: 0.5 },
    { seconds: 240, watts: 276, cadence: 92, intensity: 0.99 },
    { seconds: 240, watts: 140, cadence: 80, intensity: 0.5 },
    { seconds: 900, watts: 223, cadence: 88, intensity: 0.8 },
    { seconds: 300, watts: 120, cadence: 70, intensity: 0.43 }
  ]

  function buildThresholdWorkout() {
    const time: number[] = []
    const watts: number[] = []
    const cadence: number[] = []
    const heartrate: number[] = []
    // Every lap is labelled WORK, the way Intervals.icu labels them;
    // `resolveProviderIntervalTypes` demotes the warmup, jogs and cooldown but
    // leaves the endurance-buffer block as work — which is the bug's premise.
    const laps: any[] = []
    let cursor = 0
    for (const block of THRESHOLD_BLOCKS) {
      const start = cursor
      for (let index = 0; index < block.seconds; index++) {
        time.push(cursor)
        // Small deterministic jitter so a per-rep CoV is not trivially zero.
        watts.push(block.watts + ((index % 5) - 2))
        cadence.push(block.cadence)
        heartrate.push(110 + Math.round(block.watts / 6))
        cursor++
      }
      laps.push({
        type: 'WORK',
        start_index: start,
        end_index: cursor - 1,
        moving_time: block.seconds,
        average_watts: block.watts,
        average_cadence: block.cadence,
        average_heartrate: 110 + Math.round(block.watts / 6),
        intensity: block.intensity
      })
    }

    return makeWorkout({
      title: '4x4 Threshold',
      type: 'Ride',
      durationSec: time.length,
      averageWatts: 193,
      averageHr: 145,
      intensity: 0.85,
      variabilityIndex: 1.14,
      rawJson: { icu_intervals: laps },
      streams: { time, watts, cadence, heartrate }
    })
  }

  const thresholdPlan = {
    durationSec: 3240,
    structuredWorkout: {
      steps: [
        { type: 'Warmup', durationSeconds: 600, power: { value: 54, units: '%' } },
        { type: 'Interval', durationSeconds: 240, power: { value: 97, units: '%' } },
        { type: 'Rest', durationSeconds: 240, power: { value: 50, units: '%' } },
        { type: 'Interval', durationSeconds: 240, power: { value: 98, units: '%' } },
        { type: 'Rest', durationSeconds: 240, power: { value: 50, units: '%' } },
        { type: 'Interval', durationSeconds: 240, power: { value: 99, units: '%' } },
        { type: 'Rest', durationSeconds: 240, power: { value: 50, units: '%' } },
        // The endurance buffer: prescribed, work-classified, and NOT a threshold rep.
        { type: 'Interval', durationSeconds: 900, power: { value: 80, units: '%' } },
        { type: 'Cooldown', durationSeconds: 300, power: { value: 43, units: '%' } }
      ]
    }
  }

  it('scores repeatability on the threshold reps alone, not against the endurance buffer', () => {
    const facts = buildWorkoutAnalysisFactsV2({
      workout: buildThresholdWorkout(),
      plannedWorkout: thresholdPlan,
      sportSettings: { ftp: THRESHOLD_FIXTURE_FTP }
    })

    expect(facts.guardrails.archetype.sessionSteadiness).toBe('intervalled')
    // Session-wide (pre-CW-393) this was 33.0: the 223 W buffer was averaged in
    // with reps of 271/274/276 W. Rep-scoped it is the reps' own CoV of 0.75%.
    expect(facts.performanceSignals.durability.repeatabilityScore).toBe(94)
    expect(facts.performanceSignals.applicability.repeatability).toEqual({
      applicable: true,
      reason: null
    })
  })

  it('reports execution stability from within the reps instead of across the whole session', () => {
    const facts = buildWorkoutAnalysisFactsV2({
      workout: buildThresholdWorkout(),
      plannedWorkout: thresholdPlan,
      sportSettings: { ftp: THRESHOLD_FIXTURE_FTP }
    })

    // Whole-stream CoV on this fixture is 29.2%, which scores -74.9 and clamps
    // to 0.0 — "very unstable execution" for a session ridden perfectly.
    expect(facts.performanceSignals.durability.executionStabilityScore).not.toBeNull()
    expect(facts.performanceSignals.durability.executionStabilityScore!).toBeGreaterThan(70)
    expect(facts.performanceSignals.applicability.executionStability.applicable).toBe(true)
  })

  it('does not manufacture a cadence-drift claim out of the cooldown', () => {
    const facts = buildWorkoutAnalysisFactsV2({
      workout: buildThresholdWorkout(),
      plannedWorkout: thresholdPlan,
      sportSettings: { ftp: THRESHOLD_FIXTURE_FTP }
    })

    // The reps were all ridden at 92 rpm. The first-20% / last-20% window read
    // the 85 rpm warmup against the 70 rpm cooldown and reported a 6.8% decay.
    expect(facts.performanceSignals.sportSpecific.cadenceDriftPct).toBeCloseTo(0, 5)
  })

  it('scores cadence stability within the reps rather than across the whole session (CW-427)', () => {
    const facts = buildWorkoutAnalysisFactsV2({
      workout: buildThresholdWorkout(),
      plannedWorkout: thresholdPlan,
      sportSettings: { ftp: THRESHOLD_FIXTURE_FTP }
    })

    // Session-wide, this fixture's cadence CoV is 7.43% — the 85 rpm warmup,
    // the 80 rpm jogs, the 88 rpm buffer and the 70 rpm cooldown all averaged
    // together — and scored 62.9/100 as if the athlete's cadence had wandered.
    // The reps themselves were all ridden at a flat 92 rpm.
    expect(facts.performanceSignals.sportSpecific.cadenceStabilityScore).toBe(100)
    expect(facts.performanceSignals.applicability.cadenceStability).toEqual({
      applicable: true,
      reason: null
    })
  })

  it('withholds cadence stability with a reason when the reps cannot be scoped (CW-427)', () => {
    // Same premise as the mixed-ride case below: an intervalled session whose
    // work efforts are not repetitions of one another. A session-wide cadence
    // CoV here would be presented as execution quality, which is the
    // substitution CW-393 forbade and CW-427 extends to this signal.
    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        title: 'Unstructured Mixed Ride',
        type: 'Ride',
        durationSec: 2160,
        averageWatts: 200,
        variabilityIndex: 1.16,
        rawJson: {
          icu_intervals: [
            {
              type: 'WORK',
              moving_time: 60,
              average_watts: 350,
              average_cadence: 95,
              intensity: 1.25,
              start_index: 0,
              end_index: 59
            },
            {
              type: 'REST',
              moving_time: 300,
              average_watts: 120,
              average_cadence: 78,
              intensity: 0.43,
              start_index: 60,
              end_index: 359
            },
            {
              type: 'WORK',
              moving_time: 300,
              average_watts: 260,
              average_cadence: 90,
              intensity: 0.93,
              start_index: 360,
              end_index: 659
            },
            {
              type: 'REST',
              moving_time: 300,
              average_watts: 120,
              average_cadence: 78,
              intensity: 0.43,
              start_index: 660,
              end_index: 959
            },
            {
              type: 'WORK',
              moving_time: 900,
              average_watts: 205,
              average_cadence: 86,
              intensity: 0.73,
              start_index: 960,
              end_index: 1859
            },
            {
              type: 'WORK',
              moving_time: 300,
              average_watts: 110,
              average_cadence: 70,
              intensity: 0.4,
              start_index: 1860,
              end_index: 2159
            }
          ]
        },
        streams: {
          time: Array.from({ length: 2160 }, (_, index) => index),
          watts: Array.from({ length: 2160 }, (_, index) =>
            index < 60
              ? 350
              : index < 360
                ? 120
                : index < 660
                  ? 260
                  : index < 960
                    ? 120
                    : index < 1860
                      ? 205
                      : 110
          ),
          cadence: Array.from({ length: 2160 }, (_, index) => (index < 60 ? 95 : 86))
        }
      }),
      sportSettings: { ftp: 280 }
    })

    expect(facts.guardrails.archetype.sessionSteadiness).toBe('intervalled')
    // Withheld, not quietly replaced by the session-wide figure.
    expect(facts.performanceSignals.sportSpecific.cadenceStabilityScore).toBeNull()
    expect(facts.performanceSignals.applicability.cadenceStability.applicable).toBe(false)
    expect(facts.performanceSignals.applicability.cadenceStability.reason).toContain(
      'comparable work reps'
    )
  })

  it('withholds cadence stability when an interval session carries no cadence (CW-427)', () => {
    const workout = buildThresholdWorkout()
    delete (workout as any).streams.cadence

    const facts = buildWorkoutAnalysisFactsV2({
      workout,
      plannedWorkout: thresholdPlan,
      sportSettings: { ftp: THRESHOLD_FIXTURE_FTP }
    })

    expect(facts.guardrails.archetype.sessionSteadiness).toBe('intervalled')
    expect(facts.performanceSignals.sportSpecific.cadenceStabilityScore).toBeNull()
    expect(facts.performanceSignals.applicability.cadenceStability).toEqual({
      applicable: false,
      reason: 'Cadence stability is unavailable because cadence telemetry is missing or too sparse.'
    })
  })

  it('reads late-session fade as first rep versus last rep for an interval session', () => {
    const facts = buildWorkoutAnalysisFactsV2({
      workout: buildThresholdWorkout(),
      plannedWorkout: thresholdPlan,
      sportSettings: { ftp: THRESHOLD_FIXTURE_FTP }
    })

    // Session-wide this was withheld entirely (the plan ends in a cooldown, so
    // `hasTerminalRecoveryPhase` suppressed it). Rep-scoped it is answerable and
    // negative: the athlete finished the set STRONGER than they started it.
    expect(facts.performanceSignals.durability.lateSessionFadePct).toBe(-1.8)
    expect(facts.performanceSignals.durability.firstVsLastIntervalDeltaPct).toBe(-1.8)
    expect(facts.performanceSignals.applicability.lateSessionFade.applicable).toBe(true)
    // ...and the cooldown caution is no longer emitted, because nothing reads
    // the cooldown any more.
    expect(facts.guardrails.suppressions).not.toContain(
      'Late-session fade should not be penalized because the workout ends with a planned recovery/cooldown phase.'
    )
  })

  it('groups reps by duration and effort similarity when no plan is linked', () => {
    const facts = buildWorkoutAnalysisFactsV2({
      workout: buildThresholdWorkout(),
      sportSettings: { ftp: THRESHOLD_FIXTURE_FTP }
    })

    // Same answer without a plan: the 15-minute buffer is not a 4-minute rep.
    expect(facts.performanceSignals.durability.repeatabilityScore).toBe(94)
    expect(facts.performanceSignals.applicability.repeatability.applicable).toBe(true)
  })

  it('withholds rep-scoped signals with a reason when no comparable rep set exists', () => {
    // Three work efforts that are not repetitions of anything: a 1-minute
    // sprint, a 5-minute tempo block and a 15-minute endurance block. The
    // session is intervalled, so a session-wide CoV would be presented as
    // "execution stability" — the exact substitution CW-393 forbids.
    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        title: 'Unstructured Mixed Ride',
        type: 'Ride',
        durationSec: 3600,
        averageWatts: 200,
        variabilityIndex: 1.16,
        rawJson: {
          icu_intervals: [
            {
              type: 'WORK',
              moving_time: 60,
              average_watts: 350,
              average_cadence: 95,
              intensity: 1.25,
              start_index: 0,
              end_index: 59
            },
            {
              type: 'REST',
              moving_time: 300,
              average_watts: 120,
              average_cadence: 78,
              intensity: 0.43,
              start_index: 60,
              end_index: 359
            },
            {
              type: 'WORK',
              moving_time: 300,
              average_watts: 260,
              average_cadence: 90,
              intensity: 0.93,
              start_index: 360,
              end_index: 659
            },
            {
              type: 'REST',
              moving_time: 300,
              average_watts: 120,
              average_cadence: 78,
              intensity: 0.43,
              start_index: 660,
              end_index: 959
            },
            {
              type: 'WORK',
              moving_time: 900,
              average_watts: 205,
              average_cadence: 86,
              intensity: 0.73,
              start_index: 960,
              end_index: 1859
            },
            {
              type: 'WORK',
              moving_time: 300,
              average_watts: 110,
              average_cadence: 70,
              intensity: 0.4,
              start_index: 1860,
              end_index: 2159
            }
          ]
        },
        streams: {
          time: Array.from({ length: 2160 }, (_, index) => index),
          watts: Array.from({ length: 2160 }, (_, index) =>
            index < 60
              ? 350
              : index < 360
                ? 120
                : index < 660
                  ? 260
                  : index < 960
                    ? 120
                    : index < 1860
                      ? 205
                      : 110
          ),
          cadence: Array.from({ length: 2160 }, (_, index) => (index < 60 ? 95 : 86))
        }
      }),
      sportSettings: { ftp: 280 }
    })

    expect(facts.guardrails.archetype.sessionSteadiness).toBe('intervalled')
    for (const signal of ['executionStability', 'repeatability', 'cadenceDrift'] as const) {
      expect(facts.performanceSignals.applicability[signal].applicable).toBe(false)
      expect(facts.performanceSignals.applicability[signal].reason).toContain(
        'comparable work reps'
      )
    }
    expect(facts.performanceSignals.durability.executionStabilityScore).toBeNull()
    expect(facts.performanceSignals.durability.repeatabilityScore).toBeNull()
    expect(facts.performanceSignals.sportSpecific.cadenceDriftPct).toBeNull()
  })

  it('leaves a steady endurance ride on its session-wide values and applicability', () => {
    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        title: 'Steady Endurance Ride',
        durationSec: 3600,
        averageWatts: 205,
        averageHr: 141,
        intensity: 0.76,
        variabilityIndex: 1.03,
        streams: {
          time: Array.from({ length: 720 }, (_, index) => index * 5),
          watts: Array.from({ length: 720 }, (_, index) => 205 + ((index % 7) - 3)),
          heartrate: Array.from({ length: 720 }, (_, index) => (index < 120 ? 138 : 142)),
          cadence: Array.from({ length: 720 }, (_, index) => 88 + ((index % 5) - 2))
        }
      })
    })

    // Not intervalled -> no rep scoping -> exactly today's numbers.
    expect(facts.guardrails.archetype.sessionSteadiness).toBe('steady')
    expect(facts.performanceSignals.durability.executionStabilityScore).toBe(94.2)
    expect(facts.performanceSignals.applicability.executionStability).toEqual({
      applicable: true,
      reason: null
    })
    expect(facts.performanceSignals.durability.lateSessionFadePct).toBeCloseTo(0, 5)
    expect(facts.performanceSignals.applicability.lateSessionFade).toEqual({
      applicable: true,
      reason: null
    })
    expect(facts.performanceSignals.sportSpecific.cadenceDriftPct).toBeCloseTo(0, 5)
    expect(facts.performanceSignals.applicability.cadenceDrift).toEqual({
      applicable: true,
      reason: null
    })
    // A steady ride has no repeated efforts, so repeatability stays withheld.
    expect(facts.performanceSignals.durability.repeatabilityScore).toBeNull()
    expect(facts.performanceSignals.applicability.repeatability.applicable).toBe(false)
    // CW-427: no rep structure to scope to, so cadence stability keeps the
    // session-wide CoV (1.61%) and the value it produced before the change.
    expect(facts.performanceSignals.sportSpecific.cadenceStabilityScore).toBe(92)
    expect(facts.performanceSignals.applicability.cadenceStability).toEqual({
      applicable: true,
      reason: null
    })
  })
})

describe('archetype classification robustness (CW-396)', () => {
  const FTP = 250
  const THRESHOLD_PACE = 4.0 // m/s, roughly 4:10/km

  /** Work laps at `intensity`, separated by recovery laps, plus a warmup/cooldown. */
  function lapSet(reps: number, workSeconds: number, intensity: number) {
    const laps: Array<Record<string, unknown>> = [
      { type: 'WORK', moving_time: 600, average_watts: FTP * 0.55, intensity: 0.55 }
    ]
    for (let rep = 0; rep < reps; rep++) {
      laps.push({
        type: 'WORK',
        moving_time: workSeconds,
        average_watts: Math.round(FTP * intensity),
        intensity
      })
      if (rep < reps - 1)
        laps.push({
          type: 'WORK',
          moving_time: 180,
          average_watts: Math.round(FTP * 0.5),
          intensity: 0.5
        })
    }
    laps.push({ type: 'WORK', moving_time: 600, average_watts: FTP * 0.5, intensity: 0.5 })
    return laps
  }

  /** A structured plan of `reps` work steps at `watts`, bracketed by warmup/cooldown. */
  function repPlan(reps: number, workSeconds: number, watts: number) {
    return {
      structuredWorkout: {
        steps: [
          {
            name: 'Warmup',
            type: 'Warmup',
            durationSeconds: 600,
            power: { value: Math.round(FTP * 0.55), units: 'w' }
          },
          {
            reps,
            steps: [
              {
                name: 'Effort',
                type: 'Interval',
                durationSeconds: workSeconds,
                power: { value: watts, units: 'w' }
              },
              {
                name: 'Float',
                type: 'Recovery',
                durationSeconds: 180,
                power: { value: Math.round(FTP * 0.5), units: 'w' }
              }
            ]
          },
          {
            name: 'Cooldown',
            type: 'Cooldown',
            durationSeconds: 600,
            power: { value: Math.round(FTP * 0.5), units: 'w' }
          }
        ]
      }
    }
  }

  it('classifies six long sub-threshold reps as tempo rather than vo2', () => {
    // Six work reps used to be enough on their own: the arm read
    // `intervalCount >= 6` with no reference to intensity, so this session came
    // back as `vo2` and was judged against VO2max expectations. At IF 0.9 and
    // six minutes a rep, the only honest reading is tempo.
    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        title: '6 x 6min tempo blocks',
        durationSec: 4500,
        intensity: 0.88,
        variabilityIndex: 1.08,
        rawJson: { icu_intervals: lapSet(6, 360, 0.9) }
      }),
      plannedWorkout: repPlan(6, 360, Math.round(FTP * 0.9)),
      sportSettings: { ftp: FTP }
    })

    expect(facts.guardrails.archetype.primaryArchetype).toBe('tempo')
  })

  it('still classifies six short hard reps as vo2 and says which evidence fired', () => {
    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        title: '6 x 3min hard',
        durationSec: 3600,
        intensity: 0.95,
        variabilityIndex: 1.18,
        rawJson: { icu_intervals: lapSet(6, 180, 1.12) }
      }),
      plannedWorkout: repPlan(6, 180, Math.round(FTP * 1.12)),
      sportSettings: { ftp: FTP }
    })

    expect(facts.guardrails.archetype.primaryArchetype).toBe('vo2')
    // The rationale must name the evidence instead of asserting an unchecked
    // "Repeated hard work intervals detected."
    expect(facts.guardrails.archetype.rationale.join(' ')).toContain('median intensity factor')
  })

  it('treats repeated short reps with no recorded intensity as vo2-shaped', () => {
    // Engine-detected intervals carry no intensity at all, so rep length is the
    // only shape evidence available; 45s reps repeated eight times are not tempo.
    const laps = Array.from({ length: 8 }, () => ({ type: 'WORK', moving_time: 45 }))
    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        title: 'Sprint set',
        durationSec: 3600,
        intensity: 0.95,
        variabilityIndex: 1.3,
        rawJson: { icu_intervals: laps }
      }),
      sportSettings: { ftp: FTP }
    })

    expect(facts.guardrails.archetype.primaryArchetype).toBe('vo2')
    expect(facts.guardrails.archetype.rationale.join(' ')).toContain('no recorded intensity')
  })

  it('does not read a trailing "event" in a title as a race', () => {
    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        title: 'Recovery spin after event',
        durationSec: 3600,
        intensity: 0.55,
        variabilityIndex: 1.02
      })
    })

    expect(facts.guardrails.archetype.primaryArchetype).not.toBe('race')
    expect(facts.guardrails.archetype.primaryArchetype).toBe('recovery')
  })

  it('does not match race tokens inside longer words', () => {
    for (const title of ['Prevention ride', 'Eventually easy', 'Laps of the terrace']) {
      const facts = buildWorkoutAnalysisFactsV2({
        workout: makeWorkout({ title, durationSec: 3600, intensity: 0.55, variabilityIndex: 1.02 })
      })
      expect(facts.guardrails.archetype.primaryArchetype).not.toBe('race')
    }
  })

  it('still classifies genuine race titles as race', () => {
    for (const title of ['Race day', 'Local criterium', 'Marathon', 'Event day']) {
      const facts = buildWorkoutAnalysisFactsV2({
        workout: makeWorkout({ title, durationSec: 3600, intensity: 0.55, variabilityIndex: 1.02 })
      })
      expect(facts.guardrails.archetype.primaryArchetype).toBe('race')
    }
  })

  it('classifies a pace-targeted threshold run plan as threshold (refs plumbing regression)', () => {
    // Guards the CW-384 / CW-402 refs plumbing: with a real threshold pace the
    // planned steps carry an intensity factor, so the threshold arm can fire.
    // With zeroed refs the IFs come back null and this lands on endurance.
    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        title: 'Threshold repeats',
        type: 'Run',
        durationSec: 3600,
        averageWatts: null,
        averageSpeed: 3.9,
        intensity: 0.92,
        variabilityIndex: 1.04
      }),
      plannedWorkout: {
        structuredWorkout: {
          steps: [
            {
              name: 'Warmup',
              type: 'Warmup',
              durationSeconds: 600,
              pace: { value: 3.0, units: 'm/s' }
            },
            {
              name: 'Threshold rep',
              type: 'Interval',
              durationSeconds: 900,
              pace: { value: 4.2, units: 'm/s' }
            },
            {
              name: 'Cooldown',
              type: 'Cooldown',
              durationSeconds: 600,
              pace: { value: 3.0, units: 'm/s' }
            }
          ]
        }
      },
      sportSettings: { thresholdPace: THRESHOLD_PACE }
    })

    expect(facts.guardrails.archetype.primaryArchetype).toBe('threshold')
  })
})

describe('Strava estimated ride power provenance (CW-394)', () => {
  // Strava synthesises watts from speed/gradient/weight when there is no power meter and
  // marks that with `device_watts: false`. Those numbers must not earn absolute-power
  // benchmarking rights, so they route into the same 'estimated' path as run/ski power.
  function estimatedPowerRide(rawJson: Record<string, unknown>) {
    return buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        type: 'Ride',
        title: 'Outdoor Ride',
        durationSec: 3600,
        averageWatts: 198,
        normalizedPower: 214,
        rawJson
      })
    })
  }

  it('treats a ride with device_watts:false as estimated and suppresses absolute power', () => {
    const facts = estimatedPowerRide({ device_watts: false })

    expect(facts.guardrails.telemetry.powerSourceType).toBe('estimated')
    expect(facts.guardrails.telemetry.powerAbsoluteUsable).toBe(false)
    expect(facts.guardrails.telemetry.powerRelativeUsable).toBe(true)
    expect(facts.guardrails.suppressions.join(' ')).toContain(
      'Absolute power benchmarking suppressed'
    )
  })

  it('honours the lap-level device_watts fallback', () => {
    const facts = estimatedPowerRide({ laps: [{ device_watts: false }, { device_watts: false }] })

    expect(facts.guardrails.telemetry.powerSourceType).toBe('estimated')
    expect(facts.guardrails.telemetry.powerAbsoluteUsable).toBe(false)
  })

  it('keeps device_watts:true rides on measured absolute power', () => {
    const facts = estimatedPowerRide({ device_watts: true })

    expect(facts.guardrails.telemetry.powerSourceType).toBe('measured')
    expect(facts.guardrails.telemetry.powerAbsoluteUsable).toBe(true)
    expect(facts.guardrails.suppressions.join(' ')).not.toContain(
      'Absolute power benchmarking suppressed'
    )
  })

  it('leaves rides with no device_watts flag on measured (Intervals.icu, FIT, legacy rows)', () => {
    const withoutFlag = estimatedPowerRide({ icu_intervals: [] })
    const withoutRawJson = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({ type: 'Ride', averageWatts: 198 })
    })

    expect(withoutFlag.guardrails.telemetry.powerSourceType).toBe('measured')
    expect(withoutFlag.guardrails.telemetry.powerAbsoluteUsable).toBe(true)
    expect(withoutRawJson.guardrails.telemetry.powerSourceType).toBe('measured')
    expect(withoutRawJson.guardrails.telemetry.powerAbsoluteUsable).toBe(true)
  })

  it('does not claim power provenance for a ride carrying no power at all', () => {
    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        type: 'Ride',
        averageWatts: null,
        normalizedPower: null,
        rawJson: { device_watts: false }
      })
    })

    expect(facts.guardrails.telemetry.powerSourceType).toBe('unknown')
  })
})

describe('analysis mode for estimated-power rides (CW-437)', () => {
  // CW-394 started routing power-meter-less Strava rides through the 'estimated' branch of
  // getAnalysisMode, which used to mean run/ski and therefore led on pace. Cycling speed is
  // confounded by wind, gradient and drafting far more than running pace is, so an
  // estimated-power ride must resolve to 'mixed' — no single metric leads. Every case here
  // drops averageHr so hrUsable is false: that isolates the estimated branch from the
  // `if (hrUsable) return 'mixed'` fallback further down, and makes 'mixed' load-bearing.
  function modes(workout: Record<string, unknown>) {
    return {
      v1: buildWorkoutAnalysisFacts({ workout }).telemetry.analysisMode,
      v2: buildWorkoutAnalysisFactsV2({ workout }).guardrails.analysisMode
    }
  }

  function outdoorRide(overrides: Record<string, unknown> = {}) {
    return makeWorkout({
      type: 'Ride',
      title: 'Outdoor Ride',
      durationSec: 3600,
      averageWatts: 198,
      normalizedPower: 214,
      averageHr: null,
      averageSpeed: 8.1,
      ...overrides
    })
  }

  it('routes an estimated-power ride with a speed signal to mixed rather than pace', () => {
    const workout = outdoorRide({ rawJson: { device_watts: false } })
    const facts = buildWorkoutAnalysisFactsV2({ workout })

    expect(facts.guardrails.telemetry.powerSourceType).toBe('estimated')
    expect(facts.guardrails.telemetry.paceUsable).toBe(true)
    expect(modes(workout)).toEqual({ v1: 'mixed', v2: 'mixed' })
  })

  it('routes an estimated-power ride carrying a velocity stream to mixed as well', () => {
    const workout = outdoorRide({
      averageSpeed: null,
      rawJson: { device_watts: false },
      streams: { velocity: [7.8, 8.2, 8.6, 9.1, 8.4, 7.9] }
    })
    const facts = buildWorkoutAnalysisFactsV2({ workout })

    expect(facts.guardrails.telemetry.powerSourceType).toBe('estimated')
    expect(facts.guardrails.telemetry.paceUsable).toBe(true)
    expect(modes(workout)).toEqual({ v1: 'mixed', v2: 'mixed' })
  })

  it('leaves measured-power rides on their existing modes', () => {
    const withoutHr = outdoorRide({ rawJson: { device_watts: true } })
    const withHr = outdoorRide({ averageHr: 145, rawJson: { device_watts: true } })

    expect(
      buildWorkoutAnalysisFactsV2({ workout: withoutHr }).guardrails.telemetry.powerSourceType
    ).toBe('measured')
    expect(modes(withoutHr)).toEqual({ v1: 'power', v2: 'power' })
    expect(modes(withHr)).toEqual({ v1: 'mixed', v2: 'mixed' })
  })

  it('leaves a run with pace on pace mode', () => {
    const workout = makeWorkout({
      type: 'Run',
      durationSec: 3600,
      averageWatts: 290,
      averageHr: null,
      averageSpeed: 3.3
    })

    expect(buildWorkoutAnalysisFactsV2({ workout }).guardrails.telemetry.powerSourceType).toBe(
      'estimated'
    )
    expect(modes(workout)).toEqual({ v1: 'pace', v2: 'pace' })
  })

  it('leaves estimated-power ski sessions on pace mode', () => {
    const withPace = makeWorkout({
      type: 'NordicSki',
      durationSec: 3600,
      averageWatts: 180,
      averageHr: null,
      averageSpeed: 4.2
    })
    const withoutPace = makeWorkout({
      type: 'NordicSki',
      durationSec: 3600,
      averageWatts: 180,
      averageHr: null,
      averageSpeed: null
    })

    expect(
      buildWorkoutAnalysisFactsV2({ workout: withPace }).guardrails.telemetry.powerSourceType
    ).toBe('estimated')
    expect(modes(withPace)).toEqual({ v1: 'pace', v2: 'pace' })
    expect(modes(withoutPace)).toEqual({ v1: 'mixed', v2: 'mixed' })
  })
})

describe('V1/V2 shared derivation agreement (CW-438)', () => {
  // HR usability, power provenance and the analysis mode are derived once, in
  // `deriveSharedAnalysisSignals`, and consumed by both builders. Before CW-438 each builder
  // re-implemented them from expressions that merely happened to match, so the two could
  // silently disagree — a workout could be `hrUsable` in V1 and not in V2 — and no test
  // would fail. CW-394, CW-395 and CW-437 each had to land their fix twice for that reason.
  //
  // This block is the guarantee, not the extraction: if either builder ever starts deriving
  // one of these itself and the copies drift, one of the cases below breaks. The cases are
  // chosen to hit every branch of `inferPowerSourceType` and `getAnalysisMode` — measured,
  // estimated and unknown power; usable, artifact-ruined and absent HR; pace present and
  // absent; and the RPE-only fallback.
  function sharedSignals(workout: Record<string, unknown>) {
    const v1 = buildWorkoutAnalysisFacts({ workout })
    const v2 = buildWorkoutAnalysisFactsV2({ workout })

    return {
      v1: {
        analysisMode: v1.telemetry.analysisMode,
        hrUsable: v1.telemetry.hrUsable,
        hrZeroRatio: v1.telemetry.hrZeroRatio,
        hrMissingRatio: v1.telemetry.hrMissingRatio,
        powerSourceType: v1.telemetry.powerSourceType,
        powerAbsoluteUsable: v1.telemetry.powerAbsoluteUsable,
        powerRelativeUsable: v1.telemetry.powerRelativeUsable
      },
      v2: {
        analysisMode: v2.guardrails.analysisMode,
        hrUsable: v2.guardrails.telemetry.hrUsable,
        hrZeroRatio: v2.guardrails.telemetry.hrZeroRatio,
        hrMissingRatio: v2.guardrails.telemetry.hrMissingRatio,
        powerSourceType: v2.guardrails.telemetry.powerSourceType,
        powerAbsoluteUsable: v2.guardrails.telemetry.powerAbsoluteUsable,
        powerRelativeUsable: v2.guardrails.telemetry.powerRelativeUsable
      }
    }
  }

  const cases: Array<[string, Record<string, unknown>]> = [
    ['a measured-power indoor ride with usable HR', makeWorkout({ trainer: true })],
    [
      'a measured-power outdoor ride flagged by Strava device_watts',
      makeWorkout({ averageSpeed: 8.1, rawJson: { device_watts: true } })
    ],
    [
      'an estimated-power outdoor ride (device_watts false)',
      makeWorkout({ averageSpeed: 8.1, averageHr: null, rawJson: { device_watts: false } })
    ],
    [
      'a run with pace and estimated running power',
      makeWorkout({ type: 'Run', averageSpeed: 3.3, averageWatts: 290 })
    ],
    [
      'an estimated-power ski session without a pace signal',
      makeWorkout({ type: 'NordicSki', averageWatts: 180, averageHr: null, averageSpeed: null })
    ],
    [
      'a zero-heavy heart-rate stream that ruins HR usability',
      makeWorkout({
        streams: {
          heartrate: [0, 0, 0, 120, 122, 0, 0, 0],
          watts: [100, 120, 140, 160, 170, 150, 130, 110]
        }
      })
    ],
    [
      'power present only as a watts stream',
      makeWorkout({ averageWatts: null, streams: { watts: [180, 195, 210, 205, 190] } })
    ],
    [
      'power present only as power-zone times',
      makeWorkout({ averageWatts: null, streams: { powerZoneTimes: [0, 600, 1200, 300, 0] } })
    ],
    [
      'a strength session with no power, no pace and no HR but an RPE',
      makeWorkout({
        type: 'WeightTraining',
        averageWatts: null,
        averageHr: null,
        trainingLoad: null,
        tss: null,
        rpe: 7
      })
    ],
    [
      'a bare session with no telemetry at all',
      makeWorkout({ averageWatts: null, averageHr: null, trainingLoad: null, tss: null })
    ],
    [
      // The only shape where powerRelativeUsable's extra clauses are load-bearing:
      // an unknown-provenance family (neither ride, run nor ski) that still has power.
      // Everywhere else powerRelativeUsable happens to equal powerSourceType !== 'unknown',
      // so without this case a builder could re-inline that simpler expression and the
      // whole agreement block would still pass.
      'a strength session carrying power, where provenance stays unknown',
      makeWorkout({
        type: 'WeightTraining',
        averageWatts: 150,
        averageHr: 130,
        averageSpeed: null
      })
    ]
  ]

  it.each(cases)('derives identical shared signals for %s', (_label, workout) => {
    const { v1, v2 } = sharedSignals(workout)

    expect(v2).toEqual(v1)
  })

  it('keeps the shared signals meaningful rather than trivially equal everywhere', () => {
    const observed = cases.map(([, workout]) => sharedSignals(workout).v1)

    // Guards the block above against decaying into a tautology: if every case collapsed to
    // the same telemetry, agreement would prove nothing about the branches it claims to
    // cover. All three power provenances and more than one analysis mode must be present.
    expect(new Set(observed.map((signals) => signals.powerSourceType))).toEqual(
      new Set(['measured', 'estimated', 'unknown'])
    )
    expect(new Set(observed.map((signals) => signals.analysisMode)).size).toBeGreaterThan(1)
    expect(new Set(observed.map((signals) => signals.hrUsable))).toEqual(new Set([true, false]))

    // powerRelativeUsable is the one derivation whose extra clauses (averageWatts /
    // normalizedPower / watts stream / zone times) are invisible unless provenance is
    // unknown while power is present. Assert the corpus actually reaches that branch,
    // otherwise `powerRelativeUsable = powerSourceType !== 'unknown'` would be an
    // undetectable re-inlining.
    expect(
      observed.some(
        (signals) => signals.powerSourceType === 'unknown' && signals.powerRelativeUsable === true
      )
    ).toBe(true)
  })
})

describe('heart-rate physiological plausibility (CW-395)', () => {
  // A clean stream reading `usable: true` is the primary acceptance criterion here:
  // falsely suppressing HR removes decoupling, zone times, EF and durability from the
  // analysis, which is a worse outcome than the over-trusting behaviour being fixed.
  function cleanHrStream(length = 3600) {
    return Array.from({ length }, (_, index) => {
      const ramp = 120 + (45 * index) / (length - 1)
      // Deterministic beat-to-beat variation of a few bpm, as a real 1 Hz stream shows.
      const variation = 2 * Math.sin(index / 7) + 1.5 * Math.sin(index / 3)
      return Math.round(ramp + variation)
    })
  }

  function hrFacts(heartrate: number[]) {
    return buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        type: 'Ride',
        title: 'HR Telemetry Session',
        durationSec: heartrate.length,
        averageWatts: 200,
        streams: {
          time: heartrate.map((_, index) => index),
          watts: heartrate.map(() => 200),
          heartrate
        }
      })
    })
  }

  it('REGRESSION: a clean ramping stream stays fully usable with no artifact', () => {
    const facts = hrFacts(cleanHrStream())

    expect(facts.guardrails.telemetry.hrUsable).toBe(true)
    expect(facts.guardrails.telemetry.hrArtifactSeverity).toBe('none')
    expect(facts.guardrails.suppressions.join(' ')).not.toContain('Heart-rate-derived')
  })

  it('REGRESSION: a clean stream sampled at 5 s is not mistaken for impossible jumps', () => {
    // 30 bpm across a 5 s gap is 6 bpm/s - a real interval onset, not an artifact. The
    // rate-of-change check reads the time stream precisely so this cannot false-positive.
    const heartrate = Array.from({ length: 720 }, (_, index) => (index % 120 < 60 ? 165 : 135))
    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        type: 'Ride',
        durationSec: 3600,
        averageWatts: 230,
        streams: {
          time: Array.from({ length: 720 }, (_, index) => index * 5),
          watts: Array.from({ length: 720 }, (_, index) => (index % 120 < 60 ? 320 : 150)),
          heartrate
        }
      })
    })

    expect(facts.guardrails.telemetry.hrUsable).toBe(true)
    expect(facts.guardrails.telemetry.hrArtifactSeverity).toBe('none')
  })

  it('treats a 240 bpm strap-static burst as unusable with high severity', () => {
    const clean = cleanHrStream(600)
    const heartrate = clean.map((value, index) => (index < 60 ? 240 : value))
    const facts = hrFacts(heartrate)

    expect(facts.guardrails.telemetry.hrUsable).toBe(false)
    expect(facts.guardrails.telemetry.hrArtifactSeverity).toBe('high')
    expect(facts.guardrails.suppressions.join(' ')).toContain('Heart-rate-derived')
  })

  it('treats sample-to-sample jumps of 40 bpm as unusable', () => {
    const heartrate = Array.from({ length: 600 }, (_, index) => (index % 2 === 0 ? 130 : 170))
    const facts = hrFacts(heartrate)

    expect(facts.guardrails.telemetry.hrUsable).toBe(false)
    expect(facts.guardrails.telemetry.hrArtifactSeverity).toBe('high')
  })

  it('flags a handful of isolated out-of-range samples without discarding the stream', () => {
    const clean = cleanHrStream(1200)
    // 37 samples ~= 3.1% of the stream: past the 2% flag line, short of the 5% degrade
    // line, so the artifact is reported but the stream survives.
    const heartrate = clean.map((value, index) => (index % 33 === 0 ? 245 : value))
    const facts = hrFacts(heartrate)
    const v1 = buildWorkoutAnalysisFacts({
      workout: makeWorkout({
        type: 'Ride',
        durationSec: heartrate.length,
        streams: { time: heartrate.map((_, index) => index), heartrate }
      })
    })

    expect(facts.guardrails.telemetry.hrUsable).toBe(true)
    expect(facts.guardrails.telemetry.hrArtifactSeverity).toBe('low')
    expect(v1.telemetry.hrArtifactFlag).toBe(true)
    expect(v1.telemetry.hrUsable).toBe(true)
  })

  it('does not double-penalise dropout samples as implausible or as jumps', () => {
    // A stream whose only defect is a 4% dropout must behave exactly as it did before
    // the plausibility checks existed: flagged nowhere, still usable.
    const clean = cleanHrStream(1000)
    const heartrate = clean.map((value, index) => (index % 25 === 0 ? 0 : value))
    const facts = hrFacts(heartrate)

    expect(facts.guardrails.telemetry.hrUsable).toBe(true)
    expect(facts.guardrails.telemetry.hrZeroRatio).toBe(0.04)
  })
})

/**
 * `chooseActualIntervalsSource` decides whether the provider's own laps or the
 * engine-detected segmentation becomes the athlete's actual intervals. That one
 * choice feeds the adherence facts, the AI prompt, every rep-scoped durability
 * signal, and the interval chart the athlete looks at (CW-430) — so it needs a
 * regression floor of its own.
 *
 * Its first discriminator is `scoreHardRepeatDurationAccuracy`, which asks
 * `getActualHardRepeats` which laps were hard, and that filters on
 * `interval.intensity >= 0.95`. The comparison is only meaningful because
 * `mapIntervalsToActual` normalises the provider's percentage-of-threshold
 * `intensity` onto the intensity-factor scale via `toIntervalIntensityFactor`.
 * Until CW-385 it did not: `101` went through verbatim, `>= 0.95` was true of
 * every work lap, and the hard-repeat count — the input to the whole
 * arbitration — was noise. These tests pin both the scale and both branches of
 * the arbitration so that class of regression fails loudly here (CW-408).
 */
describe('actual-interval source arbitration and hard-repeat scale (CW-408)', () => {
  const ARBITRATION_FIXTURE_FTP = 260

  /**
   * The physical session, as a power stream: warmup, 5 x ~4min at ~105% of FTP
   * with recovery jogs between them, a long sub-threshold endurance block, and
   * a cooldown.
   *
   * The rep boundaries in the stream are deliberately ragged (196s to 298s for
   * what the athlete rode as a 240s rep) the way a real outdoor effort is, so
   * the detection engine cannot time the reps as well as an accurately lapped
   * head unit can. That is what makes the `'raw'` branch reachable below.
   */
  const ARBITRATION_STREAM_BLOCKS = [
    { seconds: 600, watts: 143 },
    { seconds: 196, watts: 276 },
    { seconds: 224, watts: 135 },
    { seconds: 298, watts: 273 },
    { seconds: 122, watts: 135 },
    { seconds: 203, watts: 271 },
    { seconds: 217, watts: 133 },
    { seconds: 287, watts: 273 },
    { seconds: 133, watts: 135 },
    { seconds: 241, watts: 268 },
    { seconds: 179, watts: 133 },
    { seconds: 900, watts: 221 },
    { seconds: 300, watts: 117 }
  ]

  type FixtureLap = { seconds: number; watts: number; intensity: number }

  /**
   * Well-lapped provider laps: each rep timed at the prescribed 240s. The
   * endurance block is the load-bearing lap — it is work-classified (the
   * provider labels it WORK and `resolveProviderIntervalTypes` leaves it as
   * work, because 0.85 sits inside the session's work band) but at 85% of
   * threshold it is emphatically NOT a hard repeat.
   */
  const ACCURATE_PROVIDER_LAPS: FixtureLap[] = [
    { seconds: 600, watts: 143, intensity: 0.55 },
    { seconds: 240, watts: 276, intensity: 1.06 },
    { seconds: 180, watts: 135, intensity: 0.52 },
    { seconds: 240, watts: 273, intensity: 1.05 },
    { seconds: 180, watts: 135, intensity: 0.52 },
    { seconds: 240, watts: 271, intensity: 1.04 },
    { seconds: 180, watts: 133, intensity: 0.51 },
    { seconds: 240, watts: 273, intensity: 1.05 },
    { seconds: 180, watts: 135, intensity: 0.52 },
    { seconds: 240, watts: 268, intensity: 1.03 },
    { seconds: 180, watts: 133, intensity: 0.51 },
    { seconds: 900, watts: 221, intensity: 0.85 },
    { seconds: 300, watts: 117, intensity: 0.45 }
  ]

  /**
   * The same session, degraded: the head unit swallowed two lap presses, so
   * laps 2 and 4 each fold `rep + jog + rep` into one 660s block averaged
   * down to ~91% of threshold. Only the fifth rep survives as its own lap.
   */
  const MERGED_PROVIDER_LAPS: FixtureLap[] = [
    { seconds: 600, watts: 143, intensity: 0.55 },
    { seconds: 660, watts: 236, intensity: 0.91 },
    { seconds: 180, watts: 135, intensity: 0.52 },
    { seconds: 660, watts: 235, intensity: 0.9 },
    { seconds: 180, watts: 135, intensity: 0.52 },
    { seconds: 240, watts: 268, intensity: 1.03 },
    { seconds: 180, watts: 133, intensity: 0.51 },
    { seconds: 900, watts: 221, intensity: 0.85 },
    { seconds: 300, watts: 117, intensity: 0.45 }
  ]

  /**
   * @param intensityScale `'factor'` writes the fraction of threshold that
   * `ActualInterval.intensity` is documented to carry; `'percent'` writes what
   * Intervals.icu actually puts on the wire (`icu_intervals[].intensity` is a
   * percentage), which `mapIntervalsToActual` has to normalise.
   */
  function buildArbitrationWorkout(
    laps: FixtureLap[],
    intensityScale: 'factor' | 'percent' = 'factor'
  ) {
    const time: number[] = []
    const watts: number[] = []
    let cursor = 0
    for (const block of ARBITRATION_STREAM_BLOCKS) {
      for (let index = 0; index < block.seconds; index++) {
        time.push(cursor)
        // Deterministic jitter so the stream is not a perfect square wave.
        watts.push(block.watts + ((index % 5) - 2))
        cursor++
      }
    }

    return makeWorkout({
      title: 'VO2 5x4min',
      type: 'Ride',
      durationSec: time.length,
      ftp: ARBITRATION_FIXTURE_FTP,
      rawJson: {
        // Intervals.icu labels nearly every lap WORK, warmup and jogs included.
        icu_intervals: laps.map((lap) => ({
          type: 'WORK',
          moving_time: lap.seconds,
          average_watts: lap.watts,
          intensity: intensityScale === 'percent' ? Math.round(lap.intensity * 100) : lap.intensity
        }))
      },
      streams: { time, watts }
    })
  }

  const arbitrationPlan = {
    structuredWorkout: {
      steps: [
        { type: 'Warmup', durationSeconds: 600, power: { value: 55, units: '%' } },
        { type: 'Interval', durationSeconds: 240, power: { value: 105, units: '%' } },
        { type: 'Rest', durationSeconds: 180, power: { value: 52, units: '%' } },
        { type: 'Interval', durationSeconds: 240, power: { value: 105, units: '%' } },
        { type: 'Rest', durationSeconds: 180, power: { value: 52, units: '%' } },
        { type: 'Interval', durationSeconds: 240, power: { value: 105, units: '%' } },
        { type: 'Rest', durationSeconds: 180, power: { value: 52, units: '%' } },
        { type: 'Interval', durationSeconds: 240, power: { value: 105, units: '%' } },
        { type: 'Rest', durationSeconds: 180, power: { value: 52, units: '%' } },
        { type: 'Interval', durationSeconds: 240, power: { value: 105, units: '%' } },
        { type: 'Rest', durationSeconds: 180, power: { value: 52, units: '%' } },
        // Prescribed, work-classified, and not a hard repeat.
        { type: 'Interval', durationSeconds: 900, power: { value: 85, units: '%' } },
        { type: 'Cooldown', durationSeconds: 300, power: { value: 45, units: '%' } }
      ]
    }
  }

  const workLapsOf = (intervals: ActualIntervalForAnalysis[]) =>
    intervals.filter((interval) => interval.classification === 'work')

  /**
   * `getActualHardRepeats` is private, so its predicate is mirrored here and
   * applied to the very objects it filters — the intervals
   * `getActualIntervalsForAnalysis` hands to the arbitration and to every
   * downstream fact. `>= 0.95` means "95% of threshold" ONLY on the intensity
   * factor scale; on the provider's percentage scale it means 0.95%, which is
   * true of every lap in every workout ever ridden.
   */
  const hardRepeatsOf = (intervals: ActualIntervalForAnalysis[]) =>
    workLapsOf(intervals).filter(
      (interval) => interval.intensity !== null && interval.intensity >= 0.95
    )

  it('counts only genuinely hard laps as hard repeats, not every work lap', () => {
    // Built on the percentage scale because that is what Intervals.icu puts on
    // the wire — the exact input the pre-CW-385 code got wrong. No planned
    // workout, so `extractActualIntervals` short-circuits to the raw provider
    // laps and this test sees exactly what the arbitration scores.
    const actual = getActualIntervalsForAnalysis(
      buildArbitrationWorkout(ACCURATE_PROVIDER_LAPS, 'percent')
    )

    // Six laps survive as work: the five reps plus the endurance block.
    expect(workLapsOf(actual).map((interval) => interval.durationSeconds)).toEqual([
      240, 240, 240, 240, 240, 900
    ])

    // But only five of them are hard repeats. This is the assertion that would
    // have failed on the pre-CW-385 code: with the provider's `85` left
    // unnormalised, the 900s endurance block reads as `85 >= 0.95` and the
    // count becomes six — the number of work laps, not the number of reps.
    const hardRepeats = hardRepeatsOf(actual)
    expect(hardRepeats).toHaveLength(5)
    expect(hardRepeats.map((interval) => interval.durationSeconds)).toEqual([
      240, 240, 240, 240, 240
    ])
    expect(hardRepeats.every((interval) => (interval.avgPower ?? 0) >= 268)).toBe(true)

    const enduranceBlock = actual.find((interval) => interval.durationSeconds === 900)
    expect(enduranceBlock?.classification).toBe('work')
    expect(enduranceBlock?.intensity).toBe(0.85)
    expect(hardRepeats).not.toContain(enduranceBlock)
  })

  it('normalises provider intensity off the percentage scale before the arbitration reads it', () => {
    // The unit boundary itself: Intervals.icu percentages are divided by 100,
    // values already on the factor scale pass through untouched.
    expect(toIntervalIntensityFactor(101)).toBe(1.01)
    expect(toIntervalIntensityFactor(52)).toBe(0.52)
    expect(toIntervalIntensityFactor(1.01)).toBe(1.01)
    expect(toIntervalIntensityFactor(0.52)).toBe(0.52)
    // A lap with no intensity field at all (and every engine-detected
    // interval) has no second unit to reconcile and stays null.
    expect(toIntervalIntensityFactor(undefined)).toBeNull()
    expect(toIntervalIntensityFactor('not a number')).toBeNull()

    const asFactor = getActualIntervalsForAnalysis(
      buildArbitrationWorkout(ACCURATE_PROVIDER_LAPS, 'factor')
    )
    const asPercent = getActualIntervalsForAnalysis(
      buildArbitrationWorkout(ACCURATE_PROVIDER_LAPS, 'percent')
    )

    // Same session on the wire two different ways, one scale downstream.
    expect(asPercent.map((interval) => interval.intensity)).toEqual(
      asFactor.map((interval) => interval.intensity)
    )
    expect(asPercent.map((interval) => interval.intensity)).toEqual([
      0.55, 1.06, 0.52, 1.05, 0.52, 1.04, 0.51, 1.05, 0.52, 1.03, 0.51, 0.85, 0.45
    ])
    expect(hardRepeatsOf(asPercent)).toHaveLength(5)
  })

  it('pins the arbitration outcome when provider intensity arrives as a percentage', () => {
    const asFactor = buildArbitrationWorkout(ACCURATE_PROVIDER_LAPS, 'factor')
    const asPercent = buildArbitrationWorkout(ACCURATE_PROVIDER_LAPS, 'percent')

    // Accurately lapped reps beat a segmentation the engine had to infer from a
    // ragged stream — and the percentage-scale copy of the same session must
    // reach the identical verdict. If `toIntervalIntensityFactor` regresses, the
    // percentage side stops describing the same workout as the factor side.
    expect(getActualIntervalsSourceForAnalysis(asFactor, arbitrationPlan)).toBe('raw')
    expect(getActualIntervalsSourceForAnalysis(asPercent, arbitrationPlan)).toBe('raw')

    // 'raw' means the provider laps are what everything downstream sees.
    const chosen = getActualIntervalsForAnalysis(asPercent, arbitrationPlan)
    expect(chosen.map((interval) => interval.durationSeconds)).toEqual(
      ACCURATE_PROVIDER_LAPS.map((lap) => lap.seconds)
    )
  })

  it('prefers the detected segmentation when provider laps merge two planned reps into one', () => {
    const workout = buildArbitrationWorkout(MERGED_PROVIDER_LAPS, 'percent')

    // What the arbitration is being offered on the raw side: two 660s blocks
    // averaged below threshold, so only one rep still reads as a hard repeat
    // against a plan that prescribes five.
    const rawLaps = getActualIntervalsForAnalysis(workout)
    expect(workLapsOf(rawLaps).map((interval) => interval.durationSeconds)).toEqual([
      660, 660, 240, 900
    ])
    expect(hardRepeatsOf(rawLaps).map((interval) => interval.durationSeconds)).toEqual([240])

    expect(getActualIntervalsSourceForAnalysis(workout, arbitrationPlan)).toBe('detected')

    // The chosen intervals are the engine's, not the provider's: detected
    // intervals carry no provider intensity, and none of them is a merged block.
    const chosen = getActualIntervalsForAnalysis(workout, arbitrationPlan)
    expect(chosen.every((interval) => interval.intensity === null)).toBe(true)
    expect(chosen.some((interval) => interval.durationSeconds === 660)).toBe(false)
    expect(workLapsOf(chosen).filter((interval) => interval.durationSeconds < 400)).toHaveLength(5)

    // The stream is byte-for-byte the fixture that returns 'raw' above, so the
    // degraded laps are the only thing that moved the verdict.
    expect(
      getActualIntervalsSourceForAnalysis(
        buildArbitrationWorkout(ACCURATE_PROVIDER_LAPS, 'percent'),
        arbitrationPlan
      )
    ).toBe('raw')
  })

  /**
   * Nested inside the CW-408 suite to reuse its stream, plan and FTP: this is
   * the same physical session and the same arbitration, asked one further
   * question. Nothing above is modified — CW-408 deliberately left the `null`
   * case unpinned, and these tests are what pin it.
   *
   * A provider that cannot compute a lap's intensity sends `intensity: null`.
   * `Number(null)` is `0` and `0` is finite, so that lap used to arrive
   * downstream claiming an intensity factor of zero. `getActualHardRepeats`
   * reads `intensity !== null` as "this lap has a usable intensity signal" and
   * only falls back to average power when it does not, so the fabricated `0`
   * short-circuited the fallback and made the lap permanently un-hard — at any
   * wattage. An ABSENT field never had the problem (`Number(undefined)` is
   * `NaN`), which is the asymmetry these tests exist to document (CW-439).
   */
  describe('provider laps with an explicit null intensity (CW-439)', () => {
    /**
     * The same laps as `ACCURATE_PROVIDER_LAPS`, except the provider could not
     * compute an intensity for the five reps and sent `null` for them.
     *
     * Types are stated explicitly rather than left as the provider's blanket
     * `WORK`, so lap classification here comes from the labels alone and this
     * test is measuring the hard-repeat predicate rather than the type
     * re-derivation heuristic.
     */
    const NULL_INTENSITY_LAPS: Array<{
      type: string
      seconds: number
      watts: number
      intensity: number | null
    }> = [
      { type: 'WARMUP', seconds: 600, watts: 143, intensity: 55 },
      { type: 'WORK', seconds: 240, watts: 276, intensity: null },
      { type: 'RECOVERY', seconds: 180, watts: 135, intensity: 52 },
      { type: 'WORK', seconds: 240, watts: 273, intensity: null },
      { type: 'RECOVERY', seconds: 180, watts: 135, intensity: 52 },
      { type: 'WORK', seconds: 240, watts: 271, intensity: null },
      { type: 'RECOVERY', seconds: 180, watts: 133, intensity: 51 },
      { type: 'WORK', seconds: 240, watts: 273, intensity: null },
      { type: 'RECOVERY', seconds: 180, watts: 135, intensity: 52 },
      { type: 'WORK', seconds: 240, watts: 268, intensity: null },
      { type: 'RECOVERY', seconds: 180, watts: 133, intensity: 51 },
      { type: 'WORK', seconds: 900, watts: 221, intensity: 85 },
      { type: 'COOLDOWN', seconds: 300, watts: 117, intensity: 45 }
    ]

    function buildNullIntensityWorkout() {
      const time: number[] = []
      const watts: number[] = []
      let cursor = 0
      for (const block of ARBITRATION_STREAM_BLOCKS) {
        for (let index = 0; index < block.seconds; index++) {
          time.push(cursor)
          watts.push(block.watts + ((index % 5) - 2))
          cursor++
        }
      }

      return makeWorkout({
        title: 'VO2 5x4min',
        type: 'Ride',
        durationSec: time.length,
        ftp: ARBITRATION_FIXTURE_FTP,
        rawJson: {
          icu_intervals: NULL_INTENSITY_LAPS.map((lap) => ({
            type: lap.type,
            moving_time: lap.seconds,
            average_watts: lap.watts,
            intensity: lap.intensity
          }))
        },
        streams: { time, watts }
      })
    }

    it('keeps a null intensity null instead of coercing it to a zero it never sent', () => {
      // The unit boundary. `null` is "no intensity signal", exactly as an
      // absent field already was; it is not an intensity factor of zero.
      expect(toIntervalIntensityFactor(null)).toBeNull()
      expect(toIntervalIntensityFactor(undefined)).toBeNull()

      // Every other falsy non-number `Number()` would silently turn into 0.
      expect(toIntervalIntensityFactor('')).toBeNull()
      expect(toIntervalIntensityFactor('   ')).toBeNull()
      expect(toIntervalIntensityFactor(false)).toBeNull()
      expect(toIntervalIntensityFactor(true)).toBeNull()
      expect(toIntervalIntensityFactor([])).toBeNull()
      expect(toIntervalIntensityFactor({})).toBeNull()

      // A real zero on the wire is still a real zero, and numeric strings from
      // looser providers and older fixtures still convert.
      expect(toIntervalIntensityFactor(0)).toBe(0)
      expect(toIntervalIntensityFactor('101')).toBe(1.01)
      expect(toIntervalIntensityFactor('0.52')).toBe(0.52)
    })

    it('carries the null through mapping instead of fabricating an intensity factor', () => {
      const actual = getActualIntervalsForAnalysis(buildNullIntensityWorkout())

      // The five reps and the endurance block are the work laps; the reps
      // report no intensity, which is the truth the provider sent.
      expect(workLapsOf(actual).map((interval) => interval.durationSeconds)).toEqual([
        240, 240, 240, 240, 240, 900
      ])
      expect(
        workLapsOf(actual)
          .filter((interval) => interval.durationSeconds === 240)
          .map((interval) => interval.intensity)
      ).toEqual([null, null, null, null, null])

      // The laps that did carry an intensity are untouched by the guard.
      expect(actual.find((interval) => interval.durationSeconds === 900)?.intensity).toBe(0.85)
    })

    it('counts a null-intensity lap as a hard repeat on average power alone', () => {
      const workout = buildNullIntensityWorkout()

      // `getActualHardRepeats` is private; the arbitration is where its verdict
      // becomes observable. Accurately lapped reps only beat the engine's
      // ragged segmentation through `scoreHardRepeatDurationAccuracy`, and that
      // discriminator needs the raw side to have hard repeats at all. With the
      // reps' intensity fabricated as `0`, the `avgPower` fallback never ran,
      // the raw side had zero hard repeats, and this session — whose laps are
      // timed to the second — lost the arbitration to the detection engine.
      expect(getActualIntervalsSourceForAnalysis(workout, arbitrationPlan)).toBe('raw')

      // 'raw' means the provider's own laps are what every downstream fact,
      // the prompt and the athlete's interval chart are built from.
      const chosen = getActualIntervalsForAnalysis(workout, arbitrationPlan)
      expect(chosen.map((interval) => interval.durationSeconds)).toEqual(
        NULL_INTENSITY_LAPS.map((lap) => lap.seconds)
      )

      // Each rep is well above 0.95 x FTP (247W), which is the whole reason the
      // power fallback is the right answer for these laps.
      expect(
        workLapsOf(chosen)
          .filter((interval) => interval.durationSeconds === 240)
          .every((interval) => (interval.avgPower ?? 0) >= ARBITRATION_FIXTURE_FTP * 0.95)
      ).toBe(true)
    })
  })
})

/**
 * CW-381: duration-weighted work-only / recovery-only aggregates.
 *
 * The payload used to hand the model per-lap rows and session means with
 * nothing in between, so interval-level claims were made from the session mean.
 * These cover the aggregate helper directly: the grouping (resolved type, never
 * `lap_splits`), the weighting (duration, not lap count), and the three shapes
 * a session can take -- all work, no work, mixed.
 */
describe('buildIntervalGroupSummaries', () => {
  function makeInterval(
    overrides: Partial<ActualIntervalForAnalysis> = {}
  ): ActualIntervalForAnalysis {
    const type = String(overrides.type ?? 'WORK')
    const lower = type.toLowerCase()
    const classification =
      lower.includes('rest') ||
      lower.includes('recovery') ||
      lower.includes('warm') ||
      lower.includes('cool')
        ? ('recovery' as const)
        : ('work' as const)

    return {
      type,
      durationSeconds: 240,
      avgPower: null,
      avgHr: null,
      avgSpeed: null,
      avgCadence: null,
      intensity: null,
      matchScore: null,
      confidence: null,
      ambiguityNote: null,
      classification,
      startIndex: null,
      endIndex: null,
      ...overrides
    }
  }

  /** Nothing an aggregate emits may ever be NaN — the model would quote it. */
  function expectNoNaN(summary: Record<string, unknown> | null) {
    expect(summary).not.toBeNull()
    for (const [key, value] of Object.entries(summary || {})) {
      if (typeof value === 'number') {
        expect(Number.isNaN(value), `${key} is NaN`).toBe(false)
      }
    }
  }

  it('weights by duration, not by lap count', () => {
    // A 6-minute rep at 90 and a 2-minute rep at 60. The mean-of-lap-means is
    // 75; the duration-weighted mean is 82.5, because the athlete spent three
    // times as long at 90. This gap is exactly the 162-vs-177 spm inversion the
    // ticket is about, in miniature.
    const summaries = buildIntervalGroupSummaries([
      makeInterval({ durationSeconds: 360, avgCadence: 90, avgPower: 300 }),
      makeInterval({ durationSeconds: 120, avgCadence: 60, avgPower: 180 })
    ])

    expect(summaries.work?.avgCadence).toBe(82.5)
    expect(summaries.work?.avgPower).toBe(270)
    expect(summaries.work?.repCount).toBe(2)
    expect(summaries.work?.totalDurationSeconds).toBe(480)
    expect(summaries.work?.avgDurationSeconds).toBe(240)
    expectNoNaN(summaries.work)
  })

  it('summarises a session where every lap is work and there are no recoveries', () => {
    const summaries = buildIntervalGroupSummaries([
      makeInterval({ durationSeconds: 600, avgPower: 200, avgHr: 140, avgCadence: 88 }),
      makeInterval({ durationSeconds: 600, avgPower: 220, avgHr: 150, avgCadence: 90 })
    ])

    expect(summaries.work?.repCount).toBe(2)
    expect(summaries.work?.avgPower).toBe(210)
    expect(summaries.work?.avgHr).toBe(145)
    expect(summaries.work?.avgCadence).toBe(89)
    expectNoNaN(summaries.work)

    // No recoveries is not "recoveries averaging zero": the aggregate is absent
    // so the prompt can say there were none instead of printing a fabricated 0.
    expect(summaries.recovery).toBeNull()
  })

  it('returns no work aggregate at all for a session with no work laps', () => {
    const summaries = buildIntervalGroupSummaries([
      makeInterval({ type: 'WARMUP', durationSeconds: 600, avgHr: 120 }),
      makeInterval({ type: 'RECOVERY', durationSeconds: 300, avgHr: 128 }),
      makeInterval({ type: 'COOLDOWN', durationSeconds: 600, avgHr: 115 })
    ])

    expect(summaries.work).toBeNull()

    // Warmup and cooldown are classified `recovery` but are not the recoveries
    // between reps; only the genuine RECOVERY lap is aggregated.
    expect(summaries.recovery?.repCount).toBe(1)
    expect(summaries.recovery?.totalDurationSeconds).toBe(300)
    expect(summaries.recovery?.avgHr).toBe(128)
    expectNoNaN(summaries.recovery)
  })

  it('splits a mixed session into work and recovery without letting either leak', () => {
    const summaries = buildIntervalGroupSummaries([
      makeInterval({ type: 'WARMUP', durationSeconds: 600, avgCadence: 76, avgHr: 130 }),
      makeInterval({ type: 'WORK', durationSeconds: 240, avgCadence: 89, avgHr: 168 }),
      makeInterval({ type: 'RECOVERY', durationSeconds: 120, avgCadence: 78, avgHr: 140 }),
      makeInterval({ type: 'WORK', durationSeconds: 240, avgCadence: 88, avgHr: 172 }),
      makeInterval({ type: 'RECOVERY', durationSeconds: 120, avgCadence: 78, avgHr: 142 }),
      makeInterval({ type: 'COOLDOWN', durationSeconds: 600, avgCadence: 74, avgHr: 128 })
    ])

    expect(summaries.work?.repCount).toBe(2)
    expect(summaries.work?.totalDurationSeconds).toBe(480)
    expect(summaries.work?.avgCadence).toBe(88.5)
    expect(summaries.work?.avgHr).toBe(170)

    expect(summaries.recovery?.repCount).toBe(2)
    expect(summaries.recovery?.totalDurationSeconds).toBe(240)
    expect(summaries.recovery?.avgCadence).toBe(78)
    expect(summaries.recovery?.avgHr).toBe(141)

    expectNoNaN(summaries.work)
    expectNoNaN(summaries.recovery)
  })

  it('skips laps missing a metric rather than counting them as zero', () => {
    // A rep with no power meter must not halve the work power average.
    const summaries = buildIntervalGroupSummaries([
      makeInterval({ durationSeconds: 240, avgPower: 300, avgHr: 170 }),
      makeInterval({ durationSeconds: 240, avgPower: null, avgHr: 172 })
    ])

    expect(summaries.work?.avgPower).toBe(300)
    expect(summaries.work?.avgHr).toBe(171)
    // Nothing carried cadence or speed, so those stay absent instead of 0.
    expect(summaries.work?.avgCadence).toBeNull()
    expect(summaries.work?.avgSpeed).toBeNull()
    expect(summaries.work?.avgPaceSecondsPerKm).toBeNull()
    expectNoNaN(summaries.work)
  })

  it('falls back to an unweighted mean instead of NaN when no lap carries a duration', () => {
    const summaries = buildIntervalGroupSummaries([
      makeInterval({ durationSeconds: 0, avgHr: 160 }),
      makeInterval({ durationSeconds: 0, avgHr: 170 })
    ])

    expect(summaries.work?.avgHr).toBe(165)
    expect(summaries.work?.totalDurationSeconds).toBe(0)
    expect(summaries.work?.avgDurationSeconds).toBe(0)
    expectNoNaN(summaries.work)
  })

  it('returns both aggregates as null for an empty interval list', () => {
    expect(buildIntervalGroupSummaries([])).toEqual({ work: null, recovery: null })
  })

  it('derives pace from total distance over total time, not from a mean of lap paces', () => {
    // 4.0 m/s for 300s (1200 m) and 2.0 m/s for 100s (200 m): 1400 m in 400 s
    // is 3.5 m/s, i.e. 285.7 s/km. Averaging the two lap paces would say 375.
    const summaries = buildIntervalGroupSummaries([
      makeInterval({ durationSeconds: 300, avgSpeed: 4 }),
      makeInterval({ durationSeconds: 100, avgSpeed: 2 })
    ])

    expect(summaries.work?.avgSpeed).toBe(3.5)
    expect(summaries.work?.avgPaceSecondsPerKm).toBeCloseTo(285.71, 2)
  })

  it('groups by the RE-DERIVED provider labels, not the ones the provider sent (CW-376)', () => {
    // Intervals.icu marks nearly every lap WORK. Straight off the provider this
    // would be nine work laps averaging the whole session; after CW-376's
    // re-derivation only the four reps are work.
    const laps = [
      { seconds: 600, speed: 2.6, cadence: 76, hr: 130 },
      { seconds: 240, speed: 4.1, cadence: 89, hr: 168 },
      { seconds: 120, speed: 2.8, cadence: 78, hr: 140 },
      { seconds: 240, speed: 4.1, cadence: 88, hr: 172 },
      { seconds: 120, speed: 2.8, cadence: 78, hr: 142 },
      { seconds: 240, speed: 4.0, cadence: 89, hr: 174 },
      { seconds: 120, speed: 2.8, cadence: 77, hr: 143 },
      { seconds: 240, speed: 4.0, cadence: 88, hr: 175 },
      { seconds: 600, speed: 2.5, cadence: 74, hr: 128 }
    ]

    const intervals = getActualIntervalsForAnalysis({
      id: 'cw-381-fixture',
      type: 'Run',
      durationSec: 2520,
      rawJson: {
        icu_intervals: laps.map((lap) => ({
          type: 'WORK',
          moving_time: lap.seconds,
          average_speed: lap.speed,
          average_cadence: lap.cadence,
          average_heartrate: lap.hr
        }))
      }
    })

    const summaries = buildIntervalGroupSummaries(intervals)

    expect(summaries.work?.repCount).toBe(4)
    expect(summaries.work?.totalDurationSeconds).toBe(960)
    // Still one-legged here: the facts module never re-scales running cadence
    // (`buildWorkoutAnalysisData` is the single conversion point), so 88.5 is
    // the 177 spm the athlete actually ran.
    expect(summaries.work?.avgCadence).toBe(88.5)
    expect(summaries.recovery?.repCount).toBe(3)
    expect(summaries.recovery?.totalDurationSeconds).toBe(360)
    expectNoNaN(summaries.work)
    expectNoNaN(summaries.recovery)
  })
})

/**
 * CW-397. `deriveAdherence` picks which planned target a step is scored against
 * from the athlete's `loadPreference`. At the seeded `HR_PACE_POWER` default that
 * meant a step carrying *both* a power and an HR target was judged on HR -- even
 * on a power-meter ride whose HR trace the same facts object had already marked
 * unusable. The order now runs through the same demotion the prompt uses.
 */
describe('adherence metric demotion (CW-397)', () => {
  // 10% zero samples trips the dropout flag, so `getHrStats().usable` is false --
  // the same shape a chest strap that kept losing contact produces.
  const DROPOUT_HR_STREAM = Array.from({ length: 200 }, (_, index) => (index % 10 === 0 ? 0 : 150))
  const CLEAN_HR_STREAM = Array.from({ length: 200 }, () => 150)

  const INTERVALS = [
    { type: 'WORK', moving_time: 480, average_watts: 260, average_heartrate: 168 },
    { type: 'REST', moving_time: 120, average_watts: 180, average_heartrate: 132 },
    { type: 'WORK', moving_time: 480, average_watts: 260, average_heartrate: 168 },
    { type: 'REST', moving_time: 120, average_watts: 180, average_heartrate: 132 }
  ]

  // Power targets are hit exactly; HR targets are ~30-40% off. Whichever metric
  // adherence chose is legible straight off the hit rate.
  //
  // `primaryTarget: 'heartRate'` is the production shape, not decoration: every
  // structured workout the app persists goes through
  // `normalizeStructuredWorkoutForPersistence`, which stamps `primaryTarget` from
  // the athlete's `loadPreference` -- HR-first at the seeded default. A fixture
  // without it exercises only legacy plans written before that field existed.
  const step = (
    type: string,
    durationSeconds: number,
    watts: number,
    bpm: number,
    primaryTarget: string | null = 'heartRate'
  ) => ({
    type,
    durationSeconds,
    ...(primaryTarget ? { primaryTarget } : {}),
    power: { value: watts, units: 'watts' },
    heartRate: { value: bpm, units: 'bpm' }
  })

  const plan = (primaryTarget: string | null) => ({
    durationSec: 1200,
    structuredWorkout: {
      steps: [
        step('Active', 480, 260, 120, primaryTarget),
        step('Rest', 120, 180, 95, primaryTarget),
        step('Active', 480, 260, 120, primaryTarget),
        step('Rest', 120, 180, 95, primaryTarget)
      ]
    }
  })

  const buildFacts = (heartrate: number[], primaryTarget: string | null = 'heartRate') =>
    buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        title: 'Sweet Spot Intervals',
        type: 'Ride',
        durationSec: 1200,
        averageWatts: 231,
        averageHr: 150,
        trainer: true,
        streams: { heartrate },
        rawJson: { icu_intervals: INTERVALS }
      }),
      // The seeded default, verbatim. Nothing about the athlete's settings changes.
      sportSettings: { loadPreference: 'HR_PACE_POWER', ftp: 275 },
      plannedWorkout: plan(primaryTarget)
    })

  it('scores a power+HR step on power when the facts mark HR unusable', () => {
    // The production shape: `primaryTarget: 'heartRate'` stamped on every step.
    const facts = buildFacts(DROPOUT_HR_STREAM)

    expect(facts.guardrails.telemetry.hrUsable).toBe(false)
    expect(facts.adherence.workIntervalHitRate).toBe(100)
    expect(facts.adherence.recoveryHitRate).toBe(100)
  })

  it('scores a legacy plan without primaryTarget on power too', () => {
    const facts = buildFacts(DROPOUT_HR_STREAM, null)

    expect(facts.adherence.workIntervalHitRate).toBe(100)
    expect(facts.adherence.recoveryHitRate).toBe(100)
  })

  it('still honours primaryTarget when the metric it names is not demoted', () => {
    // The discriminating case. With a clean HR trace, `primaryTarget: 'power'`
    // must still win even though the resolved metric order is HR-first -- which
    // is only true if the short-circuit is alive. Under an unconditional skip
    // this scores 0 (HR-scored), so the assertion distinguishes the two
    // implementations rather than merely passing.
    //
    // `primaryTarget: 'heartRate'` + clean HR would NOT discriminate: the order
    // head and the stamp are both `heartRate`, so both paths agree.
    const facts = buildFacts(CLEAN_HR_STREAM, 'power')

    expect(facts.guardrails.telemetry.hrUsable).toBe(true)
    expect(facts.adherence.workIntervalHitRate).toBe(100)
  })

  it('still scores a legacy plan on HR when the HR trace is clean', () => {
    // The control, on the legacy shape. Without it the demotion tests would also
    // pass if adherence had simply stopped looking at HR altogether.
    const facts = buildFacts(CLEAN_HR_STREAM, null)

    expect(facts.guardrails.telemetry.hrUsable).toBe(true)
    expect(facts.adherence.workIntervalHitRate).toBe(0)
  })

  it('leaves rpe last so a demotion never promotes it over a real target', () => {
    expect(
      resolveAdherenceMetricOrder('HR_PACE_POWER', { hr: false, pace: true, power: true }, 'power')
    ).toEqual(['power', 'pace', 'heartRate', 'rpe'])
  })

  it('returns the preference order untouched when the preferred primary is usable', () => {
    expect(
      resolveAdherenceMetricOrder('HR_PACE_POWER', { hr: true, pace: true, power: true }, 'mixed')
    ).toEqual(['heartRate', 'pace', 'power', 'rpe'])
  })

  it('exposes the facts usability signals the prompt resolver consumes', () => {
    const facts = buildFacts(DROPOUT_HR_STREAM)
    const signals = deriveMetricUsabilitySignals(facts)

    expect(signals).toMatchObject({
      hrUsable: false,
      powerUsable: true,
      factsPrimaryMetric: facts.guardrails.archetype.primaryMetric
    })
    expect(deriveMetricUsabilitySignals(undefined)).toBeUndefined()
  })

  it('refuses to let pace lead a ride even when the session has speed data (CW-437)', () => {
    // The regression the first cut of CW-397 introduced: an outdoor ride with no
    // power meter and a dropout-riddled HR trace demoted HR and promoted PACE.
    // `getAnalysisMode` resolves this session to `mixed` precisely so speed cannot
    // lead it, and the demotion path must respect that.
    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        title: 'Outdoor Ride',
        type: 'Ride',
        durationSec: 5400,
        distanceMeters: 48000,
        averageSpeed: 8.9,
        averageWatts: null,
        averageHr: 150,
        trainer: false,
        streams: { heartrate: DROPOUT_HR_STREAM }
      }),
      sportSettings: { loadPreference: 'HR_PACE_POWER' }
    } as any)

    expect(facts.guardrails.telemetry.paceUsable).toBe(true)
    expect(facts.guardrails.analysisMode).not.toBe('pace')

    // Data quality and permission-to-lead are reported separately: the telemetry
    // is fine and the facts block says so, but speed may not lead a ride.
    const signals = deriveMetricUsabilitySignals(facts, 'Ride')
    expect(signals?.paceUsable).toBe(true)
    expect(signals?.paceMayLead).toBe(false)
  })

  it('lets pace lead a run, where it is the primary effort metric', () => {
    const facts = buildWorkoutAnalysisFactsV2({
      workout: makeWorkout({
        title: 'Easy Endurance',
        type: 'Run',
        durationSec: 3300,
        distanceMeters: 10000,
        averageSpeed: 3.03,
        averageWatts: null,
        averageHr: 148,
        streams: { heartrate: DROPOUT_HR_STREAM }
      }),
      sportSettings: { loadPreference: 'HR_PACE_POWER' }
    } as any)

    expect(facts.guardrails.analysisMode).toBe('pace')
    expect(deriveMetricUsabilitySignals(facts, 'Run')?.paceMayLead).toBe(true)
  })

  it('leaves pace leading for swim, row, ski and walk (CW-437 is about bikes)', () => {
    // `analysisMode === 'pace'` is far too narrow to use as the gate:
    // `getAnalysisMode` only returns it for runs and power-carrying ski, so every
    // one of these sports resolves to `mixed`. Gating on that alone silently
    // demoted `PACE_*` -- a first-class, user-selectable preference -- onto HR for
    // four sports where pace IS the effort metric. The gate is the ride family.
    const sports: Array<[string, number]> = [
      ['Swim', 1.2],
      ['Rowing', 3.5],
      ['NordicSki', 4.0],
      ['Walk', 1.4]
    ]

    for (const [type, averageSpeed] of sports) {
      const facts = buildWorkoutAnalysisFactsV2({
        workout: makeWorkout({
          title: type,
          type,
          durationSec: 3600,
          distanceMeters: Math.round(averageSpeed * 3600),
          averageSpeed,
          averageWatts: null,
          averageHr: 150,
          streams: { heartrate: CLEAN_HR_STREAM }
        }),
        sportSettings: { loadPreference: 'PACE_HR_POWER' }
      } as any)

      // Every one of these is `mixed` -- which is exactly why the narrow gate broke them.
      expect(facts.guardrails.analysisMode).not.toBe('pace')
      expect(deriveMetricUsabilitySignals(facts, type)?.paceMayLead).toBe(true)
    }
  })
})
