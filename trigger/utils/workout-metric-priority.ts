type MetricKey = 'PACE' | 'HR' | 'POWER'

const DEFAULT_PRIORITY: MetricKey[] = ['HR', 'PACE', 'POWER']
const VALID_METRICS = new Set<MetricKey>(['PACE', 'HR', 'POWER'])

function isMetricKey(value: string): value is MetricKey {
  return VALID_METRICS.has(value as MetricKey)
}

export interface MetricAvailability {
  hasPace: boolean
  hasHr: boolean
  hasPower: boolean
}

export interface MetricUsability {
  pace: boolean
  hr: boolean
  power: boolean
}

/**
 * The subset of the V2 analysis facts that decides whether a metric may lead the
 * analysis. Declared structurally (rather than importing `WorkoutAnalysisFactsV2`)
 * so this module stays free of a `server/` dependency; `deriveMetricUsabilitySignals`
 * in `server/utils/workout-analysis-facts.ts` is the adapter that fills it in.
 *
 * `undefined` means "the facts had nothing to say" and leaves raw availability in
 * charge. Only an explicit `false` (or a `high` HR artifact severity) demotes.
 */
export interface MetricUsabilitySignals {
  hrUsable?: boolean
  hrArtifactSeverity?: 'none' | 'low' | 'moderate' | 'high' | null
  powerUsable?: boolean
  /** Whether the pace *data* is trustworthy — a telemetry question. */
  paceUsable?: boolean
  /**
   * Whether pace is allowed to *lead* for this modality — a physics question,
   * independent of data quality. False only for rides, where speed moves with
   * wind, gradient and drafting rather than with the work done (CW-437).
   *
   * Kept separate from `paceUsable` on purpose: a ride's pace telemetry is often
   * perfectly good, and the facts block says so. Folding the two together made
   * the prompt claim the telemetry was unusable when it plainly was not.
   */
  paceMayLead?: boolean
  /**
   * `guardrails.archetype.primaryMetric` from the same facts block. When the
   * preference primary has to be demoted this is what gets promoted, so the
   * "Primary Metric" the facts print and the one the metric priority block names
   * are the same metric by construction. `mixed`/`subjective` name no single
   * metric and are ignored.
   */
  factsPrimaryMetric?: 'power' | 'pace' | 'hr' | 'subjective' | 'mixed' | null
}

/**
 * Why a preferred primary metric had to step aside. The prompt must say which,
 * because the two have opposite implications for the rest of the document: a
 * `data_unusable` metric should not be quoted at all, while a
 * `not_valid_for_modality` one is measured perfectly well and may still be
 * described — it just cannot carry the conclusions.
 */
export type MetricDemotionKind = 'data_unusable' | 'not_valid_for_modality'

/** How a metric should be labelled in the prompt's status parentheses. */
export type MetricStatus = 'available' | 'unusable' | 'present_but_not_leading' | 'missing'

export interface MetricPriorityContext {
  loadPreference: string
  /** The athlete's configured preference order, untouched by demotion. */
  priority: MetricKey[]
  /** The preference order after unusable metrics are sunk to the back. */
  resolvedPriority: MetricKey[]
  primaryMetric: MetricKey
  primaryMetricAvailable: boolean
  secondaryMetric: MetricKey | null
  secondaryMetricAvailable: boolean
  availability: MetricAvailability
  usability: MetricUsability
  /** The preferred primary that was demoted, or `null` when none was. */
  demotedFrom: MetricKey | null
  demotionKind: MetricDemotionKind | null
  demotionReason: string | null
  /** Pace has good data but this modality forbids it from leading (CW-437). */
  paceBlockedByModality: boolean
}

export function parseLoadPreference(loadPreference?: string | null): MetricKey[] {
  const strVal =
    typeof loadPreference === 'string'
      ? loadPreference
      : loadPreference
        ? String(loadPreference)
        : ''
  const parsed = strVal
    .toUpperCase()
    .split('_')
    .map((m) => m.trim())
    .filter(isMetricKey)

  const merged = [...parsed, ...DEFAULT_PRIORITY]
  const unique: MetricKey[] = []
  for (const metric of merged) {
    if (!unique.includes(metric)) unique.push(metric)
  }
  return unique
}

export function detectMetricAvailability(workoutData: any): MetricAvailability {
  const hasPace = Boolean(
    (Array.isArray(workoutData?.lap_splits) && workoutData.lap_splits.length > 0) ||
    workoutData?.pace_variability_seconds ||
    workoutData?.avg_speed_ms ||
    workoutData?.pace_stability ||
    (workoutData?.distance_m && workoutData?.duration_s)
  )

  const hasHr = Boolean(workoutData?.avg_hr || workoutData?.max_hr)
  const hasPower = Boolean(
    workoutData?.avg_power ||
    workoutData?.normalized_power ||
    workoutData?.weighted_avg_power ||
    workoutData?.max_power ||
    workoutData?.has_power_stream ||
    (Array.isArray(workoutData?.power_zone_times) &&
      workoutData.power_zone_times.some((value: unknown) => Number(value) > 0))
  )

  return { hasPace, hasHr, hasPower }
}

const FACTS_PRIMARY_TO_METRIC_KEY: Record<string, MetricKey> = {
  power: 'POWER',
  pace: 'PACE',
  hr: 'HR'
}

/**
 * Whether each metric is fit to lead the analysis: present in the workout data
 * *and* not contradicted by the facts block that ships in the same prompt.
 */
export function resolveMetricUsability(
  availability: MetricAvailability,
  signals?: MetricUsabilitySignals | null
): MetricUsability {
  // A `high` artifact severity means the HR stream misbehaved for the whole
  // session, so it cannot carry the analysis even if `hrUsable` slipped through.
  const hrSuppressed = signals?.hrUsable === false || signals?.hrArtifactSeverity === 'high'

  return {
    pace: availability.hasPace && signals?.paceUsable !== false && signals?.paceMayLead !== false,
    hr: availability.hasHr && !hrSuppressed,
    power: availability.hasPower && signals?.powerUsable !== false
  }
}

/**
 * Pace has trustworthy data but this modality forbids it from leading (CW-437).
 * Distinct from "pace is unusable", and the distinction is load-bearing: the
 * facts block prints `Pace Usable: Yes` for exactly these sessions, so calling
 * the metric unusable would contradict the same document.
 */
function isPaceBlockedByModality(
  availability: MetricAvailability,
  signals?: MetricUsabilitySignals | null
): boolean {
  return availability.hasPace && signals?.paceUsable !== false && signals?.paceMayLead === false
}

/**
 * How a metric should be labelled in the prompt's status parentheses.
 * `present_but_not_leading` exists so a ride's pace is never described as missing
 * or unusable while the facts block in the same prompt reports `Pace Usable: Yes`.
 */
export function describeMetricStatus(ctx: MetricPriorityContext, metric: MetricKey): MetricStatus {
  const usable =
    metric === 'PACE'
      ? ctx.usability.pace
      : metric === 'HR'
        ? ctx.usability.hr
        : ctx.usability.power
  if (usable) return 'available'

  if (metric === 'PACE' && ctx.paceBlockedByModality) return 'present_but_not_leading'

  const present =
    metric === 'PACE'
      ? ctx.availability.hasPace
      : metric === 'HR'
        ? ctx.availability.hasHr
        : ctx.availability.hasPower
  return present ? 'unusable' : 'missing'
}

/**
 * Sinks unusable metrics behind usable ones, promoting the facts' own primary
 * metric when the preferred primary has to step aside.
 *
 * When the preferred primary is usable the order is returned untouched: the
 * HR-first seeded default exists for athletes without a power meter and must
 * keep working for them.
 */
export function resolveMetricPriorityOrder(
  priority: MetricKey[],
  usability: MetricUsability,
  factsPrimaryMetric?: MetricUsabilitySignals['factsPrimaryMetric']
): MetricKey[] {
  const isUsable = (metric: MetricKey): boolean =>
    metric === 'PACE' ? usability.pace : metric === 'HR' ? usability.hr : usability.power

  const preferredPrimary = priority[0]
  if (!preferredPrimary || isUsable(preferredPrimary)) return [...priority]

  const factsPrimary = factsPrimaryMetric
    ? FACTS_PRIMARY_TO_METRIC_KEY[factsPrimaryMetric]
    : undefined
  const promoted =
    factsPrimary && priority.includes(factsPrimary) && isUsable(factsPrimary) ? factsPrimary : null

  const usable = priority.filter((metric) => metric !== promoted && isUsable(metric))
  const unusable = priority.filter((metric) => metric !== promoted && !isUsable(metric))

  return promoted ? [promoted, ...usable, ...unusable] : [...usable, ...unusable]
}

export function resolveMetricPriorityContext(
  loadPreference: string | null | undefined,
  workoutData: any,
  signals?: MetricUsabilitySignals | null
): MetricPriorityContext {
  const priority = parseLoadPreference(loadPreference)
  const availability = detectMetricAvailability(workoutData)
  const usability = resolveMetricUsability(availability, signals)
  const resolvedPriority = resolveMetricPriorityOrder(
    priority,
    usability,
    signals?.factsPrimaryMetric
  )

  const isUsable = (metric: MetricKey): boolean =>
    metric === 'PACE' ? usability.pace : metric === 'HR' ? usability.hr : usability.power

  const preferredPrimary = priority[0] || 'HR'
  const primaryMetric = resolvedPriority[0] || preferredPrimary
  const secondaryMetric = resolvedPriority[1] || null
  const demoted = primaryMetric !== preferredPrimary
  const paceBlockedByModality = isPaceBlockedByModality(availability, signals)
  const demotionKind: MetricDemotionKind | null = !demoted
    ? null
    : preferredPrimary === 'PACE' && paceBlockedByModality
      ? 'not_valid_for_modality'
      : 'data_unusable'

  return {
    loadPreference: loadPreference || 'HR_PACE_POWER',
    priority,
    resolvedPriority,
    primaryMetric,
    // Now describes the metric actually leading the analysis. It is `false` only
    // when nothing in the preference order is usable, which is the one case where
    // the block still has to admit a gap instead of naming a replacement.
    primaryMetricAvailable: isUsable(primaryMetric),
    secondaryMetric,
    secondaryMetricAvailable: secondaryMetric ? isUsable(secondaryMetric) : false,
    availability,
    usability,
    paceBlockedByModality,
    demotedFrom: demoted ? preferredPrimary : null,
    demotionKind,
    demotionReason:
      demotionKind === 'not_valid_for_modality'
        ? `${preferredPrimary} is measured reliably here, but speed is not a valid proxy for cycling effort -- wind, gradient and drafting move it independently of the work done -- so it may not lead. ${primaryMetric} leads instead.`
        : demotionKind === 'data_unusable'
          ? `${preferredPrimary} is unusable or absent for this session, so ${primaryMetric} leads instead.`
          : null
  }
}

export function buildMetricPriorityPromptBlock(ctx: MetricPriorityContext): string {
  const priorityOrder = ctx.priority.join(' > ')
  const primaryStatus = describeMetricStatus(ctx, ctx.primaryMetric)
  const secondaryStatus = ctx.secondaryMetric
    ? describeMetricStatus(ctx, ctx.secondaryMetric)
    : 'missing'

  let block = '\n## Metric Priority Rules\n'
  block += `- **Preferred Metric Order**: ${priorityOrder}\n`
  block += `- **Primary Metric for this analysis**: ${ctx.primaryMetric} (${primaryStatus})\n`
  if (ctx.secondaryMetric) {
    block += `- **Secondary Metric for corroboration**: ${ctx.secondaryMetric} (${secondaryStatus})\n`
  }
  if (ctx.demotedFrom && ctx.demotionKind === 'not_valid_for_modality') {
    // Deliberately does NOT claim the telemetry is bad: the facts block in this
    // same prompt reports `Pace Usable: Yes` for these sessions, and pointing the
    // model at those facts as evidence of the opposite is the contradiction
    // CW-397 exists to remove.
    block += `- **Demoted Metric**: ${ctx.demotedFrom} is the athlete's preferred primary and is measured reliably here, but speed is not a valid proxy for cycling effort -- wind, gradient and drafting move it independently of the work done -- so it may not lead a ride. Quote ${ctx.demotedFrom} figures where they are informative, but do not build conclusions on them.\n`
  } else if (ctx.demotedFrom) {
    block += `- **Demoted Metric**: ${ctx.demotedFrom} is the athlete's preferred primary, but this session's telemetry does not support it (see the analysis facts). Do not lead with ${ctx.demotedFrom}.\n`
  }

  // The Hard Rule may only ever name a metric this session can actually support.
  // Otherwise it contradicts the facts block printed in the same prompt -- and
  // "Hard Rule" phrasing wins that argument, which is exactly CW-397.
  if (ctx.primaryMetricAvailable) {
    block += `- **Hard Rule**: Base most conclusions on ${ctx.primaryMetric} evidence. Use other metrics mainly for corroboration.\n`
  } else {
    block += `- **Fallback Rule**: No preferred metric (${priorityOrder}) is usable for this session. Explicitly state which evidence you fell back to and why.\n`
  }

  if (ctx.primaryMetric === 'PACE' && ctx.primaryMetricAvailable) {
    block +=
      '- **Guardrail**: Do not make heart-rate zones the primary narrative when pace data is available.\n'
  }

  return block
}

export function shouldCondenseHeartRateSection(ctx: MetricPriorityContext): boolean {
  return ctx.primaryMetric === 'PACE' && ctx.primaryMetricAvailable
}

export function buildAnalysisRequestMetricRules(ctx: MetricPriorityContext): string[] {
  const rules: string[] = [
    `Prioritize metrics in this order: ${ctx.resolvedPriority.join(' > ')}.`,
    `Use ${ctx.primaryMetric} as the primary evidence base whenever available.`
  ]

  if (ctx.primaryMetric === 'PACE' && ctx.primaryMetricAvailable) {
    rules.push(
      'If pace is available, keep heart-rate discussion secondary and use it only to support or challenge pace-based conclusions.'
    )
  }

  if (ctx.demotedFrom && ctx.demotionKind === 'not_valid_for_modality') {
    rules.push(
      `The athlete's preferred primary metric ${ctx.demotedFrom} is measured reliably here but may not lead a ride, because speed reflects wind, gradient and drafting as much as effort; judge execution on ${ctx.primaryMetric}. ${ctx.demotedFrom} figures may still be reported, just not used as the basis for conclusions.`
    )
  } else if (ctx.demotedFrom) {
    rules.push(
      `The athlete's preferred primary metric ${ctx.demotedFrom} is unusable or absent for this session; judge execution on ${ctx.primaryMetric} and say so instead of leaning on ${ctx.demotedFrom}.`
    )
  }

  if (!ctx.primaryMetricAvailable) {
    rules.push(
      `Primary metric ${ctx.primaryMetric} is unavailable; explicitly call out the fallback metric you used and why.`
    )
  }

  return rules
}
