import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { PRIVACY_POLICY_VERSION, TERMS_OF_SERVICE_VERSION } from '../shared/policy-versions'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

// The auth bypass (server/plugins/auth-bypass.ts) makes this user genuinely
// authenticated, but app/middleware/onboarding.global.ts is a *global* middleware
// that redirects every authenticated page to /onboarding while termsAcceptedAt is
// null. A dev user seeded without consent therefore cannot reach a single page, and
// the redirect reads like an auth-bypass failure rather than a consent gate (CW-548).
// So the seeded user is consented by default, exactly as server/api/user/consent.post.ts
// would leave them (terms + health consent, both versions) — a half-consented user
// would clear the middleware but still report incomplete consent from
// server/utils/onboarding-status.ts.
//
// SEED_SKIP_CONSENT=1 does the opposite on purpose: it puts the dev user back at the
// consent gate so the real /onboarding flow can be exercised end to end without
// hand-editing the database. (Two other escape hatches already exist and are
// unaffected by consent: /onboarding?testing=1 and /onboarding/restart.)
const skipConsent = process.env.SEED_SKIP_CONSENT === '1'

async function main() {
  const email = process.env.AUTH_BYPASS_USER || 'dev@coachwatts.test'
  const now = new Date()

  const consent = {
    termsAcceptedAt: now,
    termsVersion: TERMS_OF_SERVICE_VERSION,
    healthConsentAcceptedAt: now,
    privacyPolicyVersion: PRIVACY_POLICY_VERSION
  }

  const clearedConsent = {
    termsAcceptedAt: null,
    termsVersion: null,
    healthConsentAcceptedAt: null,
    privacyPolicyVersion: null
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { termsAcceptedAt: true, healthConsentAcceptedAt: true }
  })

  // Backfill, never clobber. Re-running the seed has to repair a worktree that was
  // seeded before this fix (otherwise the fix only helps brand-new worktrees), but it
  // must not stomp consent timestamps the user actually produced by walking the flow.
  // Only null fields are filled in.
  const update = skipConsent
    ? clearedConsent
    : {
        ...(existing?.termsAcceptedAt
          ? {}
          : { termsAcceptedAt: now, termsVersion: TERMS_OF_SERVICE_VERSION }),
        ...(existing?.healthConsentAcceptedAt
          ? {}
          : { healthConsentAcceptedAt: now, privacyPolicyVersion: PRIVACY_POLICY_VERSION })
      }

  const user = await prisma.user.upsert({
    where: { email },
    update,
    create: {
      email,
      name: process.env.AUTH_BYPASS_NAME || 'Dev Athlete',
      emailVerified: new Date(),
      isAdmin: true,
      ftp: 250,
      maxHr: 190,
      weight: 72,
      uiLanguage: 'en',
      timezone: 'UTC',
      ...(skipConsent ? {} : consent)
    }
  })

  console.log('Seeded dev user:', {
    id: user.id,
    email: user.email,
    isAdmin: user.isAdmin,
    termsAcceptedAt: user.termsAcceptedAt
  })
  if (skipConsent) {
    console.log(
      'SEED_SKIP_CONSENT=1 — consent cleared; every authenticated page will redirect to /onboarding.'
    )
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
