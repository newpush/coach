import { describe, expect, it } from 'vitest'
import { ANALYSIS_SECTION_STATUSES } from '../../server/utils/services/workout-analysis-prompt'
import {
  ANALYSIS_STATUS_COLORS,
  ANALYSIS_STATUS_FALLBACK_COLOR,
  getAnalysisStatusColor
} from './analysis-status'

/**
 * CW-424 regression coverage.
 *
 * Four surfaces used to carry their own status->colour table, so the same analysis
 * rendered amber on the report page and red on the workout page. These tests pin the
 * one shared table, and -- crucially -- pin the *legacy* vocabulary too: analyses
 * written before CW-403 still sit in `aiAnalysisJson` and are never rewritten, so
 * dropping legacy handling would quietly turn correctly-stored old analyses grey.
 */
describe('getAnalysisStatusColor', () => {
  it('colours the current vocabulary along one warm severity ramp', () => {
    expect(getAnalysisStatusColor('excellent')).toBe('success')
    expect(getAnalysisStatusColor('good')).toBe('success')
    expect(getAnalysisStatusColor('moderate')).toBe('warning')
    expect(getAnalysisStatusColor('needs_improvement')).toBe('warning')
    expect(getAnalysisStatusColor('poor')).toBe('error')
  })

  it('keeps red for the worst tier only, so it stays meaningful', () => {
    const red = Object.entries(ANALYSIS_STATUS_COLORS)
      .filter(([, color]) => color === 'error')
      .map(([status]) => status)

    expect(red).toContain('poor')
    expect(red).not.toContain('needs_improvement')
    expect(red).not.toContain('needs_attention')
  })

  it('still colours the retired pre-CW-403 vocabulary', () => {
    // `fair` and `needs_attention` are the legacy equivalents of `moderate` and
    // `needs_improvement`; `info` marked a non-severity, informational section.
    expect(getAnalysisStatusColor('fair')).toBe('warning')
    expect(getAnalysisStatusColor('needs_attention')).toBe('warning')
    expect(getAnalysisStatusColor('info')).toBe('info')
  })

  it('preserves the defensive aliases the per-page mappers carried', () => {
    expect(getAnalysisStatusColor('failing')).toBe('error')
    expect(getAnalysisStatusColor('bad')).toBe('error')
  })

  it('is case- and whitespace-insensitive', () => {
    expect(getAnalysisStatusColor('NEEDS_IMPROVEMENT')).toBe('warning')
    expect(getAnalysisStatusColor('  Excellent  ')).toBe('success')
    expect(getAnalysisStatusColor('Poor')).toBe('error')
  })

  it('falls back to neutral for missing or unrecognised statuses', () => {
    expect(getAnalysisStatusColor(undefined)).toBe(ANALYSIS_STATUS_FALLBACK_COLOR)
    expect(getAnalysisStatusColor(null)).toBe(ANALYSIS_STATUS_FALLBACK_COLOR)
    expect(getAnalysisStatusColor('')).toBe(ANALYSIS_STATUS_FALLBACK_COLOR)
    expect(getAnalysisStatusColor('   ')).toBe(ANALYSIS_STATUS_FALLBACK_COLOR)
    expect(getAnalysisStatusColor('sideways')).toBe(ANALYSIS_STATUS_FALLBACK_COLOR)
  })
})

/**
 * The mapping must not silently fall behind the schema: if someone adds a status to
 * `ANALYSIS_SECTION_STATUSES` without colouring it, it would render grey on every
 * surface and this test fails instead.
 */
describe('coverage of the schema vocabulary', () => {
  it('colours every status the analysis schema can emit', () => {
    for (const status of ANALYSIS_SECTION_STATUSES) {
      expect(
        getAnalysisStatusColor(status),
        `${status} is in ANALYSIS_SECTION_STATUSES but has no colour`
      ).not.toBe(ANALYSIS_STATUS_FALLBACK_COLOR)
    }
  })

  it('never maps a schema status to the informational blue token', () => {
    // Blue is reserved for the legacy, non-severity `info` status.
    for (const status of ANALYSIS_SECTION_STATUSES) {
      expect(getAnalysisStatusColor(status)).not.toBe('info')
    }
  })
})
