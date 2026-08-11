/**
 * Declarative plan for a selective user-data transfer between two Coach Watts
 * databases (typically production → testing).
 *
 * Every table is described once, in dependency order, with:
 * - the Prisma `where` that selects one user's rows (also reused for counting
 *   and for `--replace` deletes against the target DB),
 * - which columns hold the owning user id (they get remapped to the target user),
 * - which foreign keys may dangle when a section is skipped or a date range is
 *   applied, and what to do about them (null the column, or drop the row).
 *
 * Order matters: a table may only reference tables declared before it.
 */

export type TransferSection =
  | 'profile'
  | 'settings'
  | 'goals'
  | 'events'
  | 'plans'
  | 'planned'
  | 'workouts'
  | 'streams'
  | 'fitfiles'
  | 'wellness'
  | 'metrics'
  | 'nutrition'
  | 'calendar'
  | 'chat'
  | 'memories'
  | 'ai'

export interface SectionInfo {
  key: TransferSection
  description: string
  /** Excluded unless explicitly asked for (huge, or carries little test value). */
  optIn?: boolean
}

export const TRANSFER_SECTIONS: SectionInfo[] = [
  {
    key: 'profile',
    description: 'User profile scalars: FTP, zones, units, AI + display preferences'
  },
  {
    key: 'settings',
    description: 'Sport settings, nutrition settings, availability, email preferences'
  },
  { key: 'goals', description: 'Goals' },
  { key: 'events', description: 'Events (races, target dates)' },
  { key: 'plans', description: 'Training plans, blocks, weeks, weekly AI plans' },
  { key: 'planned', description: 'Planned workouts and their publish targets' },
  { key: 'workouts', description: 'Workouts, strength exercises/sets, plan adherence' },
  { key: 'streams', description: 'Workout time-series streams (large)' },
  { key: 'fitfiles', description: 'Raw .fit file blobs (very large)', optIn: true },
  {
    key: 'wellness',
    description: 'Wellness, daily metrics, check-ins, body measurements, journey events'
  },
  { key: 'metrics', description: 'Metric history (FTP/LTHR changes) and personal bests' },
  { key: 'nutrition', description: 'Nutrition days, nutrition plans + meals, recommendations' },
  { key: 'calendar', description: 'Calendar notes' },
  {
    key: 'chat',
    description: 'AI chat rooms, turns, messages, tool executions (large)',
    optIn: true
  },
  { key: 'memories', description: 'AI user memories' },
  { key: 'ai', description: 'Recommendations, score explanations, reports' }
]

export const DEFAULT_SECTIONS: TransferSection[] = TRANSFER_SECTIONS.filter((s) => !s.optIn).map(
  (s) => s.key
)

export const ALL_SECTIONS: TransferSection[] = TRANSFER_SECTIONS.map((s) => s.key)

export interface DateRange {
  from?: Date
  to?: Date
}

export interface WhereCtx {
  userId: string
  range: DateRange
}

export interface TransferRef {
  /** Column holding the foreign key. */
  field: string
  /** Prisma delegate name of the referenced table. */
  model: string
  /** What to do when the referenced row is in neither the batch nor the target DB. */
  onMissing: 'null' | 'drop'
  /**
   * How to look the id up in the target database when it was not part of this
   * transfer: 'user' restricts to the target user's rows, 'global' does not
   * (shared/library tables such as Exercise or system report templates).
   */
  scope?: 'user' | 'global'
  /**
   * Copy the referenced rows from the source when the target does not have
   * them. Only for shared reference data that is not user-owned — the strength
   * exercise library, which a testing instance may never have been seeded with.
   */
  copyMissing?: boolean
}

export interface TransferTable {
  /** Prisma delegate name, e.g. `workoutStreamV2`. */
  model: string
  section: TransferSection
  label: string
  where: (ctx: WhereCtx) => Record<string, unknown>
  /** Columns holding the source user's id; remapped to the target user. Default `['userId']`. */
  userFields?: string[]
  /** Columns forced to null before insert (globally unique tokens, foreign refs we never carry). */
  nullify?: string[]
  /** Columns forced to a fixed value before insert. */
  set?: Record<string, unknown>
  refs?: TransferRef[]
  /** Self-referencing FKs: nulled on insert, then patched once the table is done. */
  selfRefs?: string[]
  /** Rows fetched (and inserted) per batch. */
  pageSize?: number
  /** `true` when the table has no `userId` column, so `--replace` cannot delete by user directly. */
  deleteViaRelation?: boolean
  /**
   * Copy this table with plain SQL instead of Prisma.
   *
   * Needed for `WorkoutStreamV2`: its time-series columns are typed `Int[]` /
   * `Float[]`, but production rows contain NULL *elements* inside those arrays,
   * which the Prisma client refuses to decode. Raw reads and writes pass the
   * arrays through node-postgres untouched. Rows are selected by the ids
   * already transferred for `parentModel`.
   */
  raw?: { table: string; parentModel: string; parentColumn: string }
}

const between = (field: string, range: DateRange): Record<string, unknown> => {
  const clause: Record<string, Date> = {}
  if (range.from) clause.gte = range.from
  if (range.to) clause.lte = range.to
  return Object.keys(clause).length ? { [field]: clause } : {}
}

/**
 * Profile columns copied onto the existing target user.
 *
 * Deliberately excluded: identity and auth (`email`, `name`, `image`,
 * `emailVerified`, `isAdmin`), billing (`stripe*`, `subscription*`, `trialEndsAt`),
 * referrals, public profile slugs (globally unique), login/registration
 * telemetry, and consent timestamps.
 */
export const PROFILE_FIELDS = [
  // Physiology
  'ftp',
  'maxHr',
  'lthr',
  'restingHr',
  'weight',
  'height',
  'dob',
  'sex',
  'altitude',
  'hrZones',
  'powerZones',
  'weightSourceMode',
  // Units and locale
  'distanceUnits',
  'heightUnits',
  'weightUnits',
  'temperatureUnits',
  'language',
  'uiLanguage',
  'timezone',
  'city',
  'country',
  'state',
  'form',
  // Scores and explanations
  'currentFitnessScore',
  'recoveryCapacityScore',
  'nutritionComplianceScore',
  'trainingConsistencyScore',
  'hrPowerAlignmentScore',
  'currentFitnessExplanation',
  'recoveryCapacityExplanation',
  'nutritionComplianceExplanation',
  'trainingConsistencyExplanation',
  'hrPowerAlignmentExplanation',
  'currentFitnessExplanationJson',
  'recoveryCapacityExplanationJson',
  'nutritionComplianceExplanationJson',
  'trainingConsistencyExplanationJson',
  'hrPowerAlignmentExplanationJson',
  'profileLastUpdated',
  'personalBestsBackfilledAt',
  // Product preferences
  'nickname',
  'visibility',
  'teamVisibility',
  'dashboardSettings',
  'featureFlags',
  'nutritionTrackingEnabled',
  'recoverySensitivity',
  'updateWorkoutNotesEnabled',
  // AI preferences
  'aiContext',
  'aiPersona',
  'aiModelPreference',
  'aiAutoAnalyzeWorkouts',
  'aiAutoAnalyzeNutrition',
  'aiAutoAnalyzeReadiness',
  'aiDeepAnalysisEnabled',
  'aiProactivityEnabled',
  'aiRequireToolApproval',
  'aiConversationalEngagement',
  'aiMemoryEnabled',
  'aiTtsStyle',
  'aiTtsVoiceName',
  'aiTtsSpeed',
  'aiTtsAutoReadMessages'
] as const

export const TRANSFER_TABLES: TransferTable[] = [
  // ---------------------------------------------------------------- settings
  {
    model: 'sportSettings',
    section: 'settings',
    label: 'Sport settings',
    where: ({ userId }) => ({ userId })
  },
  {
    model: 'userNutritionSettings',
    section: 'settings',
    label: 'Nutrition settings',
    where: ({ userId }) => ({ userId })
  },
  {
    model: 'trainingAvailability',
    section: 'settings',
    label: 'Training availability',
    where: ({ userId }) => ({ userId })
  },
  {
    model: 'emailPreference',
    section: 'settings',
    label: 'Email preferences',
    where: ({ userId }) => ({ userId })
  },

  // ------------------------------------------------------------------- goals
  { model: 'goal', section: 'goals', label: 'Goals', where: ({ userId }) => ({ userId }) },

  // ------------------------------------------------------------------ events
  { model: 'event', section: 'events', label: 'Events', where: ({ userId }) => ({ userId }) },

  // ------------------------------------------------------------------- plans
  {
    model: 'trainingPlan',
    section: 'plans',
    label: 'Training plans',
    where: ({ userId }) => ({ userId }),
    // `slug` is globally unique; folders/teams are never transferred.
    nullify: ['slug', 'folderId', 'teamId'],
    set: { isPublic: false, isFeatured: false },
    refs: [{ field: 'goalId', model: 'goal', onMissing: 'null' }],
    selfRefs: ['fromTemplateId']
  },
  {
    model: 'trainingBlock',
    section: 'plans',
    label: 'Training blocks',
    where: ({ userId }) => ({ plan: { userId } }),
    userFields: [],
    refs: [{ field: 'trainingPlanId', model: 'trainingPlan', onMissing: 'drop' }],
    deleteViaRelation: true
  },
  {
    model: 'trainingWeek',
    section: 'plans',
    label: 'Training weeks',
    where: ({ userId }) => ({ block: { plan: { userId } } }),
    userFields: [],
    refs: [{ field: 'blockId', model: 'trainingBlock', onMissing: 'drop' }],
    deleteViaRelation: true
  },
  {
    model: 'weeklyTrainingPlan',
    section: 'plans',
    label: 'Weekly AI plans',
    where: ({ userId, range }) => ({ userId, ...between('weekStartDate', range) })
  },

  // ---------------------------------------------------------------- planned
  {
    model: 'plannedWorkout',
    section: 'planned',
    label: 'Planned workouts',
    where: ({ userId, range }) => ({ userId, ...between('date', range) }),
    nullify: ['shareToken'],
    refs: [{ field: 'trainingWeekId', model: 'trainingWeek', onMissing: 'null' }]
  },
  {
    model: 'plannedWorkoutPublishTarget',
    section: 'planned',
    label: 'Planned workout publish targets',
    where: ({ userId, range }) => ({ plannedWorkout: { userId, ...between('date', range) } }),
    userFields: [],
    refs: [{ field: 'plannedWorkoutId', model: 'plannedWorkout', onMissing: 'drop' }],
    deleteViaRelation: true
  },

  // --------------------------------------------------------------- workouts
  {
    model: 'workout',
    section: 'workouts',
    label: 'Workouts',
    where: ({ userId, range }) => ({ userId, ...between('date', range) }),
    nullify: ['shareToken'],
    refs: [
      { field: 'plannedWorkoutId', model: 'plannedWorkout', onMissing: 'null' },
      { field: 'oauthAppId', model: 'oAuthApp', onMissing: 'null', scope: 'global' }
    ],
    selfRefs: ['duplicateOf'],
    pageSize: 200
  },
  {
    model: 'workoutExercise',
    section: 'workouts',
    label: 'Strength exercises',
    where: ({ userId, range }) => ({ workout: { userId, ...between('date', range) } }),
    userFields: [],
    refs: [
      { field: 'workoutId', model: 'workout', onMissing: 'drop' },
      // The Exercise library is shared reference data; copy the entries this
      // user's workouts need if the target instance lacks them.
      {
        field: 'exerciseId',
        model: 'exercise',
        onMissing: 'drop',
        scope: 'global',
        copyMissing: true
      }
    ],
    deleteViaRelation: true
  },
  {
    model: 'workoutSet',
    section: 'workouts',
    label: 'Strength sets',
    where: ({ userId, range }) => ({
      workoutExercise: { workout: { userId, ...between('date', range) } }
    }),
    userFields: [],
    refs: [{ field: 'workoutExerciseId', model: 'workoutExercise', onMissing: 'drop' }],
    deleteViaRelation: true
  },
  {
    model: 'planAdherence',
    section: 'workouts',
    label: 'Plan adherence',
    where: ({ userId, range }) => ({ workout: { userId, ...between('date', range) } }),
    userFields: [],
    refs: [
      { field: 'workoutId', model: 'workout', onMissing: 'drop' },
      { field: 'plannedWorkoutId', model: 'plannedWorkout', onMissing: 'drop' }
    ],
    deleteViaRelation: true
  },

  // ---------------------------------------------------------------- streams
  {
    model: 'workoutStreamV2',
    section: 'streams',
    label: 'Workout streams',
    where: ({ userId, range }) => ({ workout: { userId, ...between('date', range) } }),
    userFields: [],
    refs: [{ field: 'workoutId', model: 'workout', onMissing: 'drop' }],
    pageSize: 25,
    deleteViaRelation: true,
    raw: { table: 'WorkoutStreamV2', parentModel: 'workout', parentColumn: 'workoutId' }
  },

  // --------------------------------------------------------------- fitfiles
  {
    model: 'fitFile',
    section: 'fitfiles',
    label: 'FIT files',
    where: ({ userId, range }) => ({ userId, ...between('createdAt', range) }),
    refs: [{ field: 'workoutId', model: 'workout', onMissing: 'null' }],
    pageSize: 10
  },

  // --------------------------------------------------------------- wellness
  {
    model: 'wellness',
    section: 'wellness',
    label: 'Wellness days',
    where: ({ userId, range }) => ({ userId, ...between('date', range) })
  },
  {
    model: 'dailyMetric',
    section: 'wellness',
    label: 'Daily metrics',
    where: ({ userId, range }) => ({ userId, ...between('date', range) })
  },
  {
    model: 'dailyCheckin',
    section: 'wellness',
    label: 'Daily check-ins',
    where: ({ userId, range }) => ({ userId, ...between('date', range) })
  },
  {
    model: 'bodyMeasurementEntry',
    section: 'wellness',
    label: 'Body measurements',
    where: ({ userId, range }) => ({ userId, ...between('recordedAt', range) })
  },
  {
    model: 'athleteJourneyEvent',
    section: 'wellness',
    label: 'Journey events',
    where: ({ userId, range }) => ({ userId, ...between('timestamp', range) })
  },

  // ---------------------------------------------------------------- metrics
  {
    model: 'metricHistory',
    section: 'metrics',
    label: 'Metric history',
    where: ({ userId, range }) => ({ userId, ...between('date', range) }),
    refs: [{ field: 'workoutId', model: 'workout', onMissing: 'null' }]
  },
  {
    model: 'personalBest',
    section: 'metrics',
    label: 'Personal bests',
    where: ({ userId, range }) => ({ userId, ...between('date', range) }),
    refs: [{ field: 'workoutId', model: 'workout', onMissing: 'null' }]
  },

  // -------------------------------------------------------------- nutrition
  {
    model: 'nutrition',
    section: 'nutrition',
    label: 'Nutrition days',
    where: ({ userId, range }) => ({ userId, ...between('date', range) })
  },
  {
    model: 'nutritionPlan',
    section: 'nutrition',
    label: 'Nutrition plans',
    where: ({ userId, range }) => ({ userId, ...between('startDate', range) })
  },
  {
    model: 'nutritionPlanMeal',
    section: 'nutrition',
    label: 'Nutrition plan meals',
    where: ({ userId, range }) => ({ plan: { userId, ...between('startDate', range) } }),
    userFields: [],
    refs: [{ field: 'planId', model: 'nutritionPlan', onMissing: 'drop' }],
    deleteViaRelation: true
  },
  {
    model: 'nutritionRecommendation',
    section: 'nutrition',
    label: 'Nutrition recommendations',
    where: ({ userId, range }) => ({ userId, ...between('date', range) })
  },

  // --------------------------------------------------------------- calendar
  {
    model: 'calendarNote',
    section: 'calendar',
    label: 'Calendar notes',
    where: ({ userId, range }) => ({ userId, ...between('startDate', range) })
  },

  // ------------------------------------------------------------------- chat
  {
    model: 'chatRoom',
    section: 'chat',
    label: 'Chat rooms',
    where: ({ userId, range }) => ({
      users: { some: { userId } },
      ...between('createdAt', range)
    }),
    userFields: [],
    deleteViaRelation: true
  },
  {
    model: 'chatParticipant',
    section: 'chat',
    label: 'Chat participants',
    where: ({ userId, range }) => ({ userId, room: between('createdAt', range) }),
    refs: [{ field: 'roomId', model: 'chatRoom', onMissing: 'drop' }]
  },
  {
    model: 'chatTurn',
    section: 'chat',
    label: 'Chat turns',
    where: ({ userId, range }) => ({ userId, room: between('createdAt', range) }),
    refs: [{ field: 'roomId', model: 'chatRoom', onMissing: 'drop' }]
  },
  {
    model: 'chatMessage',
    section: 'chat',
    label: 'Chat messages',
    where: ({ userId, range }) => ({
      room: { users: { some: { userId } }, ...between('createdAt', range) }
    }),
    // `senderId` has no FK; it holds the author's user id for human messages.
    userFields: ['senderId'],
    refs: [
      { field: 'roomId', model: 'chatRoom', onMissing: 'drop' },
      { field: 'turnId', model: 'chatTurn', onMissing: 'null' }
    ],
    deleteViaRelation: true,
    pageSize: 200
  },
  {
    model: 'chatTurnEvent',
    section: 'chat',
    label: 'Chat turn events',
    where: ({ userId, range }) => ({ turn: { userId, room: between('createdAt', range) } }),
    userFields: [],
    refs: [{ field: 'turnId', model: 'chatTurn', onMissing: 'drop' }],
    deleteViaRelation: true,
    pageSize: 200
  },
  {
    model: 'chatTurnToolExecution',
    section: 'chat',
    label: 'Chat tool executions',
    where: ({ userId, range }) => ({ turn: { userId, room: between('createdAt', range) } }),
    userFields: [],
    refs: [{ field: 'turnId', model: 'chatTurn', onMissing: 'drop' }],
    deleteViaRelation: true,
    pageSize: 200
  },

  // --------------------------------------------------------------- memories
  {
    model: 'userMemory',
    section: 'memories',
    label: 'AI memories',
    where: ({ userId }) => ({ userId }),
    refs: [{ field: 'roomId', model: 'chatRoom', onMissing: 'null' }]
  },

  // --------------------------------------------------------------------- ai
  {
    model: 'recommendation',
    section: 'ai',
    label: 'Recommendations',
    where: ({ userId, range }) => ({ userId, ...between('generatedAt', range) })
  },
  {
    model: 'activityRecommendation',
    section: 'ai',
    label: 'Activity recommendations',
    where: ({ userId, range }) => ({ userId, ...between('date', range) }),
    refs: [{ field: 'plannedWorkoutId', model: 'plannedWorkout', onMissing: 'null' }]
  },
  {
    model: 'scoreTrendExplanation',
    section: 'ai',
    label: 'Score trend explanations',
    where: ({ userId, range }) => ({ userId, ...between('createdAt', range) })
  },
  {
    model: 'report',
    section: 'ai',
    label: 'Reports',
    where: ({ userId, range }) => ({ userId, ...between('createdAt', range) }),
    refs: [{ field: 'templateId', model: 'reportTemplate', onMissing: 'null', scope: 'global' }]
  },
  {
    model: 'reportWorkout',
    section: 'ai',
    label: 'Report ↔ workout links',
    where: ({ userId, range }) => ({ report: { userId, ...between('createdAt', range) } }),
    userFields: [],
    refs: [
      { field: 'reportId', model: 'report', onMissing: 'drop' },
      { field: 'workoutId', model: 'workout', onMissing: 'drop' }
    ],
    deleteViaRelation: true
  },
  {
    model: 'reportNutrition',
    section: 'ai',
    label: 'Report ↔ nutrition links',
    where: ({ userId, range }) => ({ report: { userId, ...between('createdAt', range) } }),
    userFields: [],
    refs: [
      { field: 'reportId', model: 'report', onMissing: 'drop' },
      { field: 'nutritionId', model: 'nutrition', onMissing: 'drop' }
    ],
    deleteViaRelation: true
  }
]

/**
 * Tables that are intentionally never transferred, and why. Surfaced by
 * `--list-sections` so the omission is visible rather than silent.
 */
export const EXCLUDED_TABLES: { name: string; reason: string }[] = [
  { name: 'Integration', reason: 'holds provider OAuth access/refresh tokens' },
  { name: 'Account / Session / ApiKey', reason: 'authentication material' },
  { name: 'OAuthApp / OAuthToken / OAuthConsent', reason: 'authentication material' },
  { name: 'MobilePushDevice', reason: 'push tokens bound to the production install' },
  { name: 'ProviderSubscription / SubscriptionLifecycleEvent', reason: 'billing state' },
  { name: 'SyncQueue', reason: 'transient provider sync jobs' },
  { name: 'AuditLog / WebhookLog / LlmUsage / QuotaDenial', reason: 'operational logs' },
  { name: 'ShareToken / UserNotification', reason: 'environment-specific artefacts' },
  { name: 'WorkoutStream (v1)', reason: 'superseded by WorkoutStreamV2' },
  { name: 'Event ↔ Goal links', reason: 'implicit many-to-many, not carried' }
]
