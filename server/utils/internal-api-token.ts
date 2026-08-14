import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Shared resolver + diagnostics for `INTERNAL_API_TOKEN`, the shared secret the
 * worker (Trigger.dev) uses to call the web service's `/api/internal/*` routes.
 *
 * The web and worker containers run the *same image* but get their environment
 * from *separate* service definitions, so it is entirely possible for one of
 * them to resolve a token and the other to resolve `null` (or a different
 * value). When that happens every internal call 401s and outbound email stops,
 * with the only symptom being a background task error (CW-290).
 *
 * Everything in this module is built so that mismatch is diagnosable from logs
 * alone, **without ever writing the token value anywhere**: both sides log a
 * salted, truncated fingerprint at boot, and an operator can compare the two
 * log lines to tell "absent on one side" from "different on each side".
 */

const DEV_FALLBACK_TOKEN = 'dev-internal-token'

/**
 * Domain-separation salt for the fingerprint. It is deliberately a constant
 * (not a secret and not random): every process must derive the *same*
 * fingerprint for the same token, otherwise cross-service comparison is
 * impossible. The salt only stops the fingerprint from being a plain,
 * rainbow-table-able hash of the raw secret.
 */
const FINGERPRINT_SALT = 'coachwatts:internal-api-token:v1'

export type InternalApiTokenSource = 'env' | 'dev-fallback' | 'missing'

export interface InternalApiTokenStatus {
  /** True when a token was resolved by any means (env var or dev fallback). */
  configured: boolean
  source: InternalApiTokenSource
  /** Salted, truncated hash. Safe to log. `null` when no token is configured. */
  fingerprint: string | null
  /**
   * Character length of the resolved token, `0` when absent. Not the value —
   * but it is what catches the classic deploy mistakes (a value that kept its
   * surrounding quotes, or picked up a trailing newline) that a fingerprint
   * mismatch alone cannot explain.
   */
  length: number
}

export type InternalAuthFailureReason =
  /** The receiving service has no `INTERNAL_API_TOKEN` at all. */
  | 'receiver_token_missing'
  /** The caller sent no `x-internal-api-token` header. */
  | 'caller_token_missing'
  /** Both sides have a token, but they are not the same value. */
  | 'token_mismatch'

export interface InternalAuthDiagnostics {
  reason: InternalAuthFailureReason
  receiverFingerprint: string | null
  callerFingerprint: string | null
  receiverTokenLength: number
  callerTokenLength: number
  receiverTokenSource: InternalApiTokenSource
  nodeEnv: string
}

export type InternalAuthResult =
  | { ok: true }
  | { ok: false; reason: InternalAuthFailureReason; diagnostics: InternalAuthDiagnostics }

/**
 * Resolve the shared internal API token.
 *
 * Returns `null` in every environment except `development`, where a well-known
 * fallback keeps local dev working without a configured secret.
 */
export function getInternalApiToken(): string | null {
  return (
    process.env.INTERNAL_API_TOKEN ||
    (process.env.NODE_ENV === 'development' ? DEV_FALLBACK_TOKEN : null)
  )
}

/**
 * One-way, salted, truncated fingerprint of a token — safe to write to logs.
 *
 * Two services that resolved the same token produce the same fingerprint, so
 * comparing the boot log lines of the web and worker containers is enough to
 * prove they agree, without either value ever being printed.
 */
export function fingerprintInternalApiToken(token: string | null | undefined): string | null {
  if (!token) return null
  return createHash('sha256').update(`${FINGERPRINT_SALT}:${token}`).digest('hex').slice(0, 12)
}

/** Describe how (and whether) this process resolved the internal API token. */
export function getInternalApiTokenStatus(): InternalApiTokenStatus {
  const fromEnv = process.env.INTERNAL_API_TOKEN
  const token = getInternalApiToken()

  const source: InternalApiTokenSource = fromEnv ? 'env' : token ? 'dev-fallback' : 'missing'

  return {
    configured: token !== null,
    source,
    fingerprint: fingerprintInternalApiToken(token),
    length: token?.length ?? 0
  }
}

/** Constant-time string comparison that does not leak length via early exit. */
function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  // timingSafeEqual throws on differing lengths, so hash first to equalise them.
  const digestA = createHash('sha256').update(bufA).digest()
  const digestB = createHash('sha256').update(bufB).digest()
  return timingSafeEqual(digestA, digestB)
}

/**
 * Authorize an inbound internal API request.
 *
 * On failure the result carries a `reason` that distinguishes the three
 * genuinely different operational faults — the receiver has no token, the
 * caller sent none, or the two disagree — plus fingerprints for both sides.
 * All of it is safe to log; none of it contains a token value.
 */
export function authorizeInternalApiRequest(
  incomingToken: string | null | undefined
): InternalAuthResult {
  const receiverToken = getInternalApiToken()
  const status = getInternalApiTokenStatus()

  const fail = (reason: InternalAuthFailureReason): InternalAuthResult => ({
    ok: false,
    reason,
    diagnostics: {
      reason,
      receiverFingerprint: status.fingerprint,
      callerFingerprint: fingerprintInternalApiToken(incomingToken),
      receiverTokenLength: status.length,
      callerTokenLength: incomingToken?.length ?? 0,
      receiverTokenSource: status.source,
      nodeEnv: process.env.NODE_ENV || 'development'
    }
  })

  if (!receiverToken) return fail('receiver_token_missing')
  if (!incomingToken) return fail('caller_token_missing')
  if (!tokensMatch(incomingToken, receiverToken)) return fail('token_mismatch')

  return { ok: true }
}

/** Human-readable, operator-facing explanation of a 401 reason. */
export function describeInternalAuthFailure(reason: InternalAuthFailureReason): string {
  switch (reason) {
    case 'receiver_token_missing':
      return 'the receiving service has no INTERNAL_API_TOKEN configured'
    case 'caller_token_missing':
      return 'the caller sent no x-internal-api-token header'
    case 'token_mismatch':
      return 'the caller and the receiving service resolved different INTERNAL_API_TOKEN values'
  }
}

const AUTH_FAILURE_REASONS: readonly InternalAuthFailureReason[] = [
  'receiver_token_missing',
  'caller_token_missing',
  'token_mismatch'
]

/**
 * Recover the failure reason from a 401 response body produced by an internal
 * API route, so the *calling* service can report the specific fault instead of
 * a bare "401". Returns `null` for any body that does not carry one (e.g. a 401
 * synthesised by a proxy in front of the app).
 */
export function parseInternalAuthFailureReason(
  responseBody: string | null | undefined
): InternalAuthFailureReason | null {
  if (!responseBody) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(responseBody)
  } catch {
    return null
  }

  const reason = (parsed as { data?: { reason?: unknown } })?.data?.reason
  return AUTH_FAILURE_REASONS.includes(reason as InternalAuthFailureReason)
    ? (reason as InternalAuthFailureReason)
    : null
}

export interface AssertInternalApiTokenOptions {
  /** Which side is booting, e.g. `'web'` or `'worker'`. Used in the log line. */
  service?: string
  /** Injectable for tests. */
  logger?: Pick<Console, 'error' | 'warn' | 'info'>
  /** Override the environment used to decide how loud to be. */
  nodeEnv?: string
}

/**
 * Boot-time assertion: shout about a missing `INTERNAL_API_TOKEN` now, rather
 * than discovering it on the first outbound email of the day.
 *
 * Deliberately does **not** throw. A hard crash here would turn an email outage
 * into a full site outage plus a container restart loop, which is strictly
 * worse. Instead it emits one loud, greppable `console.error` banner — and, on
 * every successful boot, an info line carrying the token fingerprint so the web
 * and worker log lines can be compared to catch a *mismatch* (which no single
 * process can detect on its own).
 */
export function assertInternalApiTokenConfigured(
  options: AssertInternalApiTokenOptions = {}
): InternalApiTokenStatus {
  const { service = 'unknown', logger = console } = options
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? 'development'
  const status = getInternalApiTokenStatus()

  if (!status.configured) {
    logger.error(
      [
        '',
        '!!! ================================================================= !!!',
        `!!! INTERNAL_API_TOKEN IS NOT CONFIGURED (service=${service}, NODE_ENV=${nodeEnv})`,
        '!!! Every internal API call will be rejected with 401 and NO EMAIL',
        '!!! WILL BE DELIVERED. Set INTERNAL_API_TOKEN to the SAME value on the',
        '!!! web service and the worker service of this deployment.',
        '!!! ================================================================= !!!',
        ''
      ].join('\n')
    )
    return status
  }

  if (status.source === 'dev-fallback') {
    logger.warn(
      `[InternalApiToken] service=${service} is using the built-in development fallback token. ` +
        'Set INTERNAL_API_TOKEN explicitly for any non-development deployment.'
    )
    return status
  }

  logger.info(
    `[InternalApiToken] service=${service} token configured ` +
      `(fingerprint=${status.fingerprint}, length=${status.length}, NODE_ENV=${nodeEnv}). ` +
      'The web and worker services must report an identical fingerprint.'
  )

  return status
}

/**
 * Best-effort boot check.
 *
 * This module is imported by both the internal API route handlers (web) and by
 * `emailDeliveryService` (worker), so the check runs at the earliest point each
 * side touches internal-API auth. Skipped under test so the suite is not spammed.
 *
 * NOTE: for the web service this fires on first module load rather than on
 * process start; wiring `assertInternalApiTokenConfigured` into a nitro startup
 * plugin and/or `/api/health` would make it a true boot check, but those files
 * are outside CW-290's owned paths. Tracked as CW-635.
 */
function runBootCheck() {
  if (process.env.VITEST || process.env.NODE_ENV === 'test') return
  if (process.env.INTERNAL_API_TOKEN_BOOT_CHECK === 'false') return

  const service =
    process.env.INTERNAL_API_TOKEN_SERVICE_NAME ||
    (process.env.TRIGGER_API_URL || process.env.TRIGGER_SECRET_KEY ? 'worker' : 'web')

  try {
    assertInternalApiTokenConfigured({ service })
  } catch {
    // A diagnostic must never be the reason a process fails to start.
  }
}

runBootCheck()
