/**
 * Shared response-schema builder for the athlete-facing *report* tasks.
 *
 * `trigger/generate-weekly-report.ts`, `trigger/generate-custom-report.ts` and
 * `trigger/analyze-last-3-workouts.ts` each used to carry their own inline
 * `const analysisSchema = { ... }` literal (CW-425). The three literals were
 * near-copies of each other and of the workout-analysis schema in
 * `./workout-analysis-prompt.ts`, and each restated the section-status
 * vocabulary and the score bounds as hardcoded values.
 *
 * That is the exact duplication pattern that produced CW-403: the workout
 * schema drifted to `fair`/`needs_attention`/`info` and 0-100 scores while the
 * prompt still asked for `excellent`/.../`poor` and 1-10, and because Gemini
 * enforces the schema rather than the prompt, every UI status->colour mapper
 * fell through to grey. Nothing caught it.
 *
 * So the *values that can drift* live in one place only:
 * - the section-status enum is always `ANALYSIS_SECTION_STATUSES`
 * - the score bounds (and the "(1-10)" text inside the score descriptions) are
 *   always derived from `ANALYSIS_SCORE_MIN` / `ANALYSIS_SCORE_MAX`
 *
 * What legitimately differs between the three reports is *copy* -- which
 * example section titles to suggest, how verbose each score explanation should
 * be, which metrics the period summary carries -- and whether a report has
 * period scores at all (the last-3-workouts comparison does not). Those are the
 * builder's parameters. This is deliberately NOT the workout `analysisSchema`
 * from `./workout-analysis-prompt.ts`: reports ask the model for a different
 * set of scores (`training_load`/`recovery`/`progress`/`consistency` rather
 * than `technical`/`effort`/`pacing`/`execution`) and a different metrics
 * summary, so forcing them onto that shape would change what the model is
 * asked for.
 *
 * The "report analysis schemas match the prompts they are handed with (CW-425)"
 * suite in `./workout-analysis-prompt.test.ts` reads the status vocabulary and
 * the score scale back out of each task's *prompt source* and compares them to
 * the schema that task builds, so a prompt and its schema cannot silently
 * disagree again -- the same technique CW-403 introduced for the workout
 * schema. A shared schema that can still drift from its prompt would only have
 * moved the problem.
 */
import {
  ANALYSIS_SCORE_MAX,
  ANALYSIS_SCORE_MIN,
  ANALYSIS_SECTION_STATUSES
} from './workout-analysis-prompt'

/** The `type` discriminator every report schema declares. */
const REPORT_ANALYSIS_TYPES = ['workout', 'weekly_report', 'planning', 'comparison'] as const

/**
 * The period-score dimensions a report may ask for, in schema order.
 *
 * Distinct from the workout schema's `overall`/`technical`/`effort`/`pacing`/
 * `execution`: a report scores a training *period*, not a session.
 */
export const REPORT_SCORE_KEYS = [
  'overall',
  'training_load',
  'recovery',
  'progress',
  'consistency'
] as const

export type ReportScoreKey = (typeof REPORT_SCORE_KEYS)[number]

/**
 * How the score scale is named in prose, derived from the shared bounds.
 *
 * Report tasks interpolate this into their `scores` description and into their
 * prompt text, so the sentence the model reads ("... on a 1-10 scale ...") and
 * the `minimum`/`maximum` the schema enforces cannot say different things.
 */
export const REPORT_SCORE_SCALE_TEXT = `${ANALYSIS_SCORE_MIN}-${ANALYSIS_SCORE_MAX} scale`

/**
 * The one-line description of each score value.
 *
 * The `(1-10)` suffix is interpolated from the shared bounds rather than typed
 * out, so the prose the model reads can never contradict the `minimum` /
 * `maximum` the schema enforces.
 */
const REPORT_SCORE_DESCRIPTIONS: Record<ReportScoreKey, string> = {
  overall: `Overall period assessment (${ANALYSIS_SCORE_MIN}-${ANALYSIS_SCORE_MAX})`,
  training_load: `Training load management quality (${ANALYSIS_SCORE_MIN}-${ANALYSIS_SCORE_MAX})`,
  recovery: `Recovery adequacy score (${ANALYSIS_SCORE_MIN}-${ANALYSIS_SCORE_MAX})`,
  progress: `Progress and adaptation score (${ANALYSIS_SCORE_MIN}-${ANALYSIS_SCORE_MAX})`,
  consistency: `Training consistency score (${ANALYSIS_SCORE_MIN}-${ANALYSIS_SCORE_MAX})`
}

/**
 * Metrics every report summarises. Extra per-report fields (nutrition totals on
 * the custom report) are appended after these, preserving schema key order.
 */
const BASE_METRICS_SUMMARY_KEYS = [
  'total_duration_minutes',
  'total_tss',
  'avg_power',
  'avg_heart_rate',
  // NOTE: kept as kilometers (not renamed to a unit-agnostic name) because this exact
  // field name/shape is a shared contract also consumed by app/pages/report/[id].vue,
  // which independently converts to meters and re-formats via the user's distanceUnits
  // client-side. Kilometers is treated as the canonical storage unit here; unit-aware
  // formatting happens at render time.
  'total_distance_km'
] as const

const ANALYSIS_POINTS_DESCRIPTION =
  'Detailed analysis points for this section. Each point should be 1-2 sentences maximum as a separate array item.'

const NO_PARAGRAPH_BLOCKS_DESCRIPTION = ' Do NOT combine multiple points into paragraph blocks.'

export interface ReportAnalysisScoresOptions {
  /** Description of the `scores` object itself. */
  description: string
  /**
   * Per-dimension explanation copy. How much detail a report asks for in each
   * `*_explanation` string is a product decision per report, so it is passed in
   * rather than shared.
   */
  explanations: Record<ReportScoreKey, string>
  /**
   * When true the schema marks every score and explanation as required AND
   * lists `scores` in the top-level `required` array -- i.e. the report is not
   * valid without scores. The weekly report requires them; the custom report
   * does not, because a nutrition-only custom report legitimately has none (its
   * prompt only asks for scores when workout data is included).
   */
  required: boolean
}

export interface ReportAnalysisSchemaOptions {
  /** Description of `sections[].title`, usually naming example section titles. */
  sectionTitleDescription: string
  /**
   * Append "Do NOT combine multiple points into paragraph blocks." to the
   * `analysis_points` description.
   */
  forbidParagraphBlocks: boolean
  /** Omit entirely for reports that ask for no period scores. */
  scores?: ReportAnalysisScoresOptions
  /** Description of the `metrics_summary` object. */
  metricsSummaryDescription: string
  /** Extra numeric `metrics_summary` fields, appended after the base set. */
  extraMetricsSummaryKeys?: readonly string[]
}

function buildScoresSchema(options: ReportAnalysisScoresOptions) {
  const properties: Record<string, unknown> = {}
  const required: string[] = []

  for (const key of REPORT_SCORE_KEYS) {
    properties[key] = {
      type: 'number',
      description: REPORT_SCORE_DESCRIPTIONS[key],
      minimum: ANALYSIS_SCORE_MIN,
      maximum: ANALYSIS_SCORE_MAX
    }
    properties[`${key}_explanation`] = {
      type: 'string',
      description: options.explanations[key]
    }
    required.push(key, `${key}_explanation`)
  }

  return {
    type: 'object',
    description: options.description,
    properties,
    ...(options.required ? { required } : {})
  }
}

function buildMetricsSummarySchema(options: ReportAnalysisSchemaOptions) {
  const properties: Record<string, unknown> = {}
  for (const key of [...BASE_METRICS_SUMMARY_KEYS, ...(options.extraMetricsSummaryKeys ?? [])]) {
    properties[key] = { type: 'number' }
  }

  return {
    type: 'object',
    description: options.metricsSummaryDescription,
    properties
  }
}

/**
 * Build the structured-output schema a report task hands to
 * `generateStructuredAnalysis`.
 *
 * Gemini enforces the returned schema, so it -- not the prompt text -- is what
 * ultimately decides the vocabulary the model may emit. Keep it in lockstep
 * with the prompt that describes it.
 */
export function buildReportAnalysisSchema(options: ReportAnalysisSchemaOptions) {
  return {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description: 'Type of analysis: workout, weekly_report, planning, comparison',
        enum: [...REPORT_ANALYSIS_TYPES]
      },
      title: {
        type: 'string',
        description: 'Title of the analysis'
      },
      date: {
        type: 'string',
        description: 'Date or date range of the analysis'
      },
      executive_summary: {
        type: 'string',
        description: '2-3 sentence high-level summary of key findings'
      },
      sections: {
        type: 'array',
        description: 'Analysis sections with status and points',
        items: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: options.sectionTitleDescription
            },
            status: {
              type: 'string',
              description: 'Overall assessment',
              // The single source of the section-status vocabulary. Every UI
              // status->colour mapper understands exactly this list (CW-403).
              enum: [...ANALYSIS_SECTION_STATUSES]
            },
            status_label: {
              type: 'string',
              description: 'Display label for status'
            },
            analysis_points: {
              type: 'array',
              description: options.forbidParagraphBlocks
                ? `${ANALYSIS_POINTS_DESCRIPTION}${NO_PARAGRAPH_BLOCKS_DESCRIPTION}`
                : ANALYSIS_POINTS_DESCRIPTION,
              items: {
                type: 'string'
              }
            }
          },
          // Reports render `status_label` directly (see the markdown converters
          // in the report tasks), so unlike the workout schema it is required.
          required: ['title', 'status', 'status_label', 'analysis_points']
        }
      },
      recommendations: {
        type: 'array',
        description: 'Actionable coaching recommendations',
        items: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Recommendation title'
            },
            priority: {
              type: 'string',
              description: 'Priority level',
              enum: ['high', 'medium', 'low']
            },
            description: {
              type: 'string',
              description: 'Detailed recommendation'
            }
          },
          required: ['title', 'priority', 'description']
        }
      },
      ...(options.scores ? { scores: buildScoresSchema(options.scores) } : {}),
      metrics_summary: buildMetricsSummarySchema(options)
    },
    required: [
      'type',
      'title',
      'executive_summary',
      'sections',
      ...(options.scores?.required ? ['scores'] : [])
    ]
  }
}
