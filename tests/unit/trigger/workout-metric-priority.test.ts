import { describe, it, expect } from 'vitest'
import {
  buildAnalysisRequestMetricRules,
  buildMetricPriorityPromptBlock,
  parseLoadPreference,
  resolveMetricPriorityContext,
  shouldCondenseHeartRateSection
} from '../../../trigger/utils/workout-metric-priority'

describe('workout metric priority', () => {
  it('parses load preference and preserves order', () => {
    expect(parseLoadPreference('PACE_HR_POWER')).toEqual(['PACE', 'HR', 'POWER'])
  })

  it('defaults to HR > PACE > POWER when preference is missing', () => {
    expect(parseLoadPreference(undefined)).toEqual(['HR', 'PACE', 'POWER'])
  })

  it('marks pace as primary and condenses HR when pace data is available', () => {
    const ctx = resolveMetricPriorityContext('PACE_HR_POWER', {
      lap_splits: [{ lap: 1 }],
      avg_hr: 130
    })

    expect(ctx.primaryMetric).toBe('PACE')
    expect(ctx.primaryMetricAvailable).toBe(true)
    expect(shouldCondenseHeartRateSection(ctx)).toBe(true)

    const promptBlock = buildMetricPriorityPromptBlock(ctx)
    expect(promptBlock).toContain('Preferred Metric Order')
    expect(promptBlock).toContain('Primary Metric for this analysis')
    expect(promptBlock).toContain('Do not make heart-rate zones the primary narrative')
  })

  it('promotes the next usable metric when the primary pace metric is missing', () => {
    // Before CW-397 this kept PACE as primary and merely softened the wording.
    // A metric the session has no data for cannot lead the analysis at all.
    const ctx = resolveMetricPriorityContext('PACE_HR_POWER', {
      avg_hr: 128
    })

    expect(ctx.demotedFrom).toBe('PACE')
    expect(ctx.primaryMetric).toBe('HR')
    expect(ctx.primaryMetricAvailable).toBe(true)
    expect(shouldCondenseHeartRateSection(ctx)).toBe(false)

    const rules = buildAnalysisRequestMetricRules(ctx)
    expect(rules.join(' ')).toContain('preferred primary metric PACE is unusable or absent')

    const block = buildMetricPriorityPromptBlock(ctx)
    expect(block).toContain('**Hard Rule**: Base most conclusions on HR evidence')
    expect(block).not.toContain('Base most conclusions on PACE')
  })

  it('states a fallback instead of a hard rule when no preferred metric is usable', () => {
    const ctx = resolveMetricPriorityContext('PACE_HR_POWER', { rpe: 6 })

    expect(ctx.primaryMetricAvailable).toBe(false)

    const block = buildMetricPriorityPromptBlock(ctx)
    expect(block).not.toContain('**Hard Rule**')
    expect(block).toContain('**Fallback Rule**: No preferred metric (PACE > HR > POWER) is usable')
  })

  it('treats stream-derived power metadata as available power', () => {
    const ctx = resolveMetricPriorityContext('POWER_HR_PACE', {
      power_zone_times: [0, 0, 300, 600, 120]
    })

    expect(ctx.primaryMetric).toBe('POWER')
    expect(ctx.primaryMetricAvailable).toBe(true)
    expect(ctx.availability.hasPower).toBe(true)
  })
})

/**
 * CW-397. The seeded sport-profile default is `HR_PACE_POWER` -- deliberately
 * HR-first, because it works across sports and for athletes with no power meter.
 * The default is not the defect; the defect was the prompt asserting a
 * `**Hard Rule**` on HR while the V2 facts block a few sections away in the same
 * prompt reported `HR Usable: No`. The resolver now reads those facts.
 */
describe('metric priority demotion against the V2 facts (CW-397)', () => {
  const POWER_METER_RIDE = {
    avg_power: 231,
    normalized_power: 248,
    avg_hr: 148,
    max_hr: 176,
    distance_m: 48000,
    duration_s: 5400
  }

  const HR_UNUSABLE_POWER_RIDE_FACTS = {
    hrUsable: false,
    hrArtifactSeverity: 'high' as const,
    powerUsable: true,
    paceUsable: true,
    factsPrimaryMetric: 'power' as const
  }

  it('demotes HR and leads with the facts primary metric on a default-settings power ride', () => {
    const ctx = resolveMetricPriorityContext(
      'HR_PACE_POWER',
      POWER_METER_RIDE,
      HR_UNUSABLE_POWER_RIDE_FACTS
    )

    expect(ctx.priority).toEqual(['HR', 'PACE', 'POWER'])
    expect(ctx.demotedFrom).toBe('HR')
    expect(ctx.primaryMetric).toBe('POWER')
    // Pace is usable but did not win: the facts' own primary metric is what gets
    // promoted, so the two prompt sections name the same metric.
    expect(ctx.resolvedPriority).toEqual(['POWER', 'PACE', 'HR'])
    expect(ctx.usability).toEqual({ hr: false, pace: true, power: true })

    const block = buildMetricPriorityPromptBlock(ctx)
    expect(block).toContain('**Primary Metric for this analysis**: POWER (available)')
    expect(block).toContain('**Hard Rule**: Base most conclusions on POWER evidence')
    expect(block).toContain("**Demoted Metric**: HR is the athlete's preferred primary")
    expect(block).not.toContain('Base most conclusions on HR evidence')

    const rules = buildAnalysisRequestMetricRules(ctx).join(' ')
    expect(rules).toContain('Prioritize metrics in this order: POWER > PACE > HR.')
    expect(rules).toContain('judge execution on POWER')
  })

  it('leaves the HR-first default alone for an athlete with no power meter', () => {
    // The case the seeded default exists to serve. Nothing about it may change.
    const ctx = resolveMetricPriorityContext(
      'HR_PACE_POWER',
      { avg_hr: 148, max_hr: 176, distance_m: 10000, duration_s: 3300 },
      { hrUsable: true, hrArtifactSeverity: 'none', powerUsable: false, paceUsable: true }
    )

    expect(ctx.demotedFrom).toBeNull()
    expect(ctx.primaryMetric).toBe('HR')
    expect(ctx.resolvedPriority).toEqual(['HR', 'PACE', 'POWER'])

    const block = buildMetricPriorityPromptBlock(ctx)
    expect(block).toContain('**Hard Rule**: Base most conclusions on HR evidence')
    expect(block).not.toContain('**Demoted Metric**')
  })

  it('treats a high HR artifact severity as unusable even when hrUsable slipped through', () => {
    const ctx = resolveMetricPriorityContext('HR_PACE_POWER', POWER_METER_RIDE, {
      hrUsable: true,
      hrArtifactSeverity: 'high',
      powerUsable: true,
      paceUsable: false,
      factsPrimaryMetric: 'power'
    })

    expect(ctx.primaryMetric).toBe('POWER')
    expect(ctx.usability.hr).toBe(false)
  })

  it('falls back to the preference order when the facts primary metric is not a single metric', () => {
    const ctx = resolveMetricPriorityContext('HR_PACE_POWER', POWER_METER_RIDE, {
      hrUsable: false,
      powerUsable: true,
      paceUsable: true,
      factsPrimaryMetric: 'mixed'
    })

    // `mixed` names no metric, so preference order decides among the usable ones.
    expect(ctx.primaryMetric).toBe('PACE')
    expect(ctx.resolvedPriority).toEqual(['PACE', 'POWER', 'HR'])
  })

  it('never names an unusable metric in a hard rule, for any preference order', () => {
    const preferences = ['HR_PACE_POWER', 'PACE_HR_POWER', 'POWER_HR_PACE', 'HR', 'PACE', 'POWER']
    const factsCases = [
      {
        hrUsable: false,
        powerUsable: true,
        paceUsable: true,
        factsPrimaryMetric: 'power' as const
      },
      { hrUsable: true, powerUsable: false, paceUsable: false, factsPrimaryMetric: 'hr' as const },
      {
        hrUsable: false,
        powerUsable: false,
        paceUsable: true,
        factsPrimaryMetric: 'pace' as const
      },
      {
        hrUsable: false,
        powerUsable: false,
        paceUsable: false,
        factsPrimaryMetric: 'mixed' as const
      }
    ]

    for (const loadPreference of preferences) {
      for (const facts of factsCases) {
        const ctx = resolveMetricPriorityContext(loadPreference, POWER_METER_RIDE, facts)
        const block = buildMetricPriorityPromptBlock(ctx)
        const hardRule = block.split('\n').find((line) => line.includes('**Hard Rule**'))
        if (!hardRule) {
          expect(block).toContain('**Fallback Rule**')
          continue
        }
        expect(hardRule).toContain(ctx.primaryMetric)
        const usable =
          ctx.primaryMetric === 'HR'
            ? ctx.usability.hr
            : ctx.primaryMetric === 'PACE'
              ? ctx.usability.pace
              : ctx.usability.power
        expect(usable).toBe(true)
      }
    }
  })

  it('leaves the no-facts path driven by raw availability alone', () => {
    const ctx = resolveMetricPriorityContext('HR_PACE_POWER', POWER_METER_RIDE)

    expect(ctx.demotedFrom).toBeNull()
    expect(ctx.primaryMetric).toBe('HR')
  })
})
