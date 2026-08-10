import { Chart as ChartJS } from 'chart.js'
import annotationPlugin from 'chartjs-plugin-annotation'

let registered = false

/**
 * Register chartjs-plugin-annotation once and ensure every chart instance
 * has a safe default annotation config. Without this, charts that do not
 * explicitly set plugins.annotation crash when the plugin initializes.
 *
 * MERGE into `ChartJS.defaults.plugins.annotation` - never reassign it.
 *
 * `ChartJS.register()` above is what populates that object with the plugin's own
 * defaults: `common.drawTime: 'afterDatasetsDraw'`, `common.init`, `common.label`,
 * `clip: true`, the `animations` number/colour descriptors and the `interaction`
 * fallbacks. Replacing the object wholesale (as this helper used to) throws all of
 * that away. The fatal one is `drawTime`: an annotation whose draw time resolves to
 * `undefined` is never collected into any draw phase, so it paints nothing - no
 * error, no warning, no annotation. That is CW-422: the WORK/STEADY interval shading
 * on the workout intervals chart was invisible for every session since this helper
 * landed, and every other component adding annotations hit the same silent no-op.
 *
 * `annotations` is the only key we own here; the plugin does not define it, and
 * charts that never set `plugins.annotation` need it present to initialise.
 */
export function ensureChartJsAnnotationDefaults() {
  if (registered) return

  ChartJS.register(annotationPlugin)
  ChartJS.defaults.plugins = ChartJS.defaults.plugins || {}

  const annotationDefaults = (ChartJS.defaults.plugins.annotation ||
    ({} as typeof ChartJS.defaults.plugins.annotation)) as { annotations?: unknown }

  if (!annotationDefaults.annotations) {
    annotationDefaults.annotations = {}
  }

  ChartJS.defaults.plugins.annotation =
    annotationDefaults as typeof ChartJS.defaults.plugins.annotation

  registered = true
}

export function safeChartUpdate(
  chart: { canvas?: HTMLCanvasElement; update?: (mode?: string) => void } | null | undefined,
  mode?: string
) {
  if (!chart?.canvas || typeof chart.update !== 'function') return

  try {
    chart.update(mode)
  } catch {
    // Chart was destroyed mid-update (common during route changes).
  }
}

export { annotationPlugin }
