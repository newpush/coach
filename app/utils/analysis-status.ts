/**
 * Single source of truth for colouring an AI analysis section status.
 *
 * CW-403 unified the *schema* so every new analysis emits one status vocabulary
 * (`ANALYSIS_SECTION_STATUSES` in `server/utils/services/workout-analysis-prompt.ts`).
 * CW-424 unifies how that vocabulary is *coloured*: before this module the workout
 * page, the report page, the share page and the score modal each carried their own
 * mapper with three different colour tables, so the same analysis rendered amber on
 * one surface and red on another.
 *
 * ## The ramp
 *
 * Severity is carried by a warm, monotonic ramp -- green -> amber -> red. Blue
 * (`info`) sits deliberately *outside* that ramp and is reserved for the one legacy
 * status that is not a severity judgement at all. Grey (`neutral`) means "no status /
 * unrecognised"; after CW-424 no value of either the current or the legacy vocabulary
 * lands there.
 *
 * Five ordered statuses have to share four usable tokens, so exactly one adjacent pair
 * must collapse. `excellent` + `good` collapse to green: both mean "nothing to act on",
 * and the degree of praise is already carried by the badge label. Collapsing
 * `needs_improvement` into `poor` (red) instead would erase the difference between
 * "work on this" and "this went badly", and would make red -- which should be rare
 * enough to mean something -- the colour of the single most common finding in a
 * workout analysis.
 *
 * ## Legacy values
 *
 * Analyses written before CW-403 are stored verbatim in `aiAnalysisJson` and are never
 * rewritten, so the retired vocabulary (`excellent/good/fair/needs_attention/info`)
 * still reaches these renderers and must keep colouring correctly. `fair` and
 * `needs_attention` are the legacy equivalents of `moderate` and `needs_improvement`;
 * `info` marks a purely informational section, which is why it -- and nothing else --
 * gets the blue token.
 */

/** Nuxt UI colour tokens this module is allowed to return. */
export type AnalysisStatusColor = 'success' | 'warning' | 'error' | 'info' | 'neutral'

/**
 * Status -> colour token. Keys are lowercase; look-ups go through
 * {@link getAnalysisStatusColor}, which normalises first.
 */
export const ANALYSIS_STATUS_COLORS: Readonly<Record<string, AnalysisStatusColor>> = Object.freeze({
  // Current vocabulary (ANALYSIS_SECTION_STATUSES, CW-403).
  excellent: 'success',
  good: 'success',
  moderate: 'warning',
  needs_improvement: 'warning',
  poor: 'error',

  // Retired vocabulary, still present in analyses stored before CW-403.
  fair: 'warning',
  needs_attention: 'warning',
  info: 'info',

  // Defensive aliases carried over from the per-page mappers this module replaced,
  // so nothing that renders red today silently turns grey.
  failing: 'error',
  bad: 'error'
})

/** Colour token used when a status is missing, empty or unrecognised. */
export const ANALYSIS_STATUS_FALLBACK_COLOR: AnalysisStatusColor = 'neutral'

/**
 * Map an analysis section status to a Nuxt UI colour token.
 *
 * Case- and whitespace-insensitive: stored analyses have carried `Needs_Improvement`
 * and padded values. Call sites that need CSS classes derive them from the returned
 * token rather than re-deriving the mapping.
 */
export function getAnalysisStatusColor(status?: string | null): AnalysisStatusColor {
  if (!status) return ANALYSIS_STATUS_FALLBACK_COLOR
  const normalised = String(status).trim().toLowerCase()
  if (!normalised) return ANALYSIS_STATUS_FALLBACK_COLOR
  return ANALYSIS_STATUS_COLORS[normalised] ?? ANALYSIS_STATUS_FALLBACK_COLOR
}
