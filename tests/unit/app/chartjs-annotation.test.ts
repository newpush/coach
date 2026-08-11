// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { Chart as ChartJS } from 'chart.js'
import {
  ensureChartJsAnnotationDefaults,
  safeChartUpdate
} from '../../../app/utils/chartjs-annotation'

describe('chartjs-annotation', () => {
  it('sets default annotation config on Chart.js', () => {
    ensureChartJsAnnotationDefaults()
    expect(ChartJS.defaults.plugins?.annotation?.annotations).toEqual({})
  })

  // CW-422 regression guard. The helper used to assign a fresh
  // `{ annotations: {} }` over `ChartJS.defaults.plugins.annotation`, which wiped the
  // defaults `ChartJS.register(annotationPlugin)` had just installed. Losing
  // `common.drawTime` meant every annotation resolved to no draw phase and painted
  // nothing, silently. If this test ever fails, someone has gone back to replacing
  // the defaults object instead of merging into it.
  it('preserves the annotation plugin defaults instead of replacing them', () => {
    ensureChartJsAnnotationDefaults()

    const annotationDefaults = ChartJS.defaults.plugins?.annotation as
      Record<string, any> | undefined

    expect(annotationDefaults).toBeTruthy()
    // The one that actually broke rendering.
    expect(annotationDefaults?.common?.drawTime).toBe('afterDatasetsDraw')
    // The rest of what a wholesale replacement was also discarding.
    expect(annotationDefaults?.common?.init).toBe(false)
    expect(annotationDefaults?.common?.label).toBeTruthy()
    expect(annotationDefaults?.clip).toBe(true)
    expect(annotationDefaults?.animations?.numbers?.type).toBe('number')
    expect(annotationDefaults?.animations?.colors?.type).toBe('color')
    expect(annotationDefaults?.interaction).toBeTruthy()
  })

  it('is idempotent and keeps the plugin defaults on repeat calls', () => {
    ensureChartJsAnnotationDefaults()
    ensureChartJsAnnotationDefaults()

    const annotationDefaults = ChartJS.defaults.plugins?.annotation as
      Record<string, any> | undefined

    expect(annotationDefaults?.common?.drawTime).toBe('afterDatasetsDraw')
    expect(annotationDefaults?.annotations).toEqual({})
  })

  it('safeChartUpdate no-ops for destroyed charts', () => {
    expect(() => safeChartUpdate(null)).not.toThrow()
    expect(() => safeChartUpdate({})).not.toThrow()
    expect(() =>
      safeChartUpdate({
        canvas: document.createElement('canvas'),
        update: () => {
          throw new Error('destroyed')
        }
      })
    ).not.toThrow()
  })
})
