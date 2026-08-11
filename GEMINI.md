# GEMINI.md

Gemini, please refer to **[AGENTS.md](./AGENTS.md)** and **[docs/04-guides/issue-management.md](./docs/04-guides/issue-management.md)** for the primary repository context, architecture, commands, operational rules, and Linear issue management standards.

This file (GEMINI.md) is an entry point to ensure you find the centralized instructions.

## Hot context (product notes)

Ongoing project state that has not yet been fully folded into `AGENTS.md` or `docs/`:

- **Typechecks**: `pnpm typecheck` is the canonical fresh check; use `pnpm typecheck:fast`, `:app`, `:server`, or `:watch` for shorter feedback loops. See `docs/04-guides/typechecking.md`.
- **Pricing Transition**: Transitioning from 'Free for Early Adopters' to tiered structure: Free ($0), Supporter ($8.99/mo), and Pro ($14.99/mo). See `docs/06-plans/pricing-and-entitlements.md`.
- **Wellness Tracking**: Weight and Blood Pressure via Intervals.icu.
- **Oura Integration**: SpO2, Stress, VO2 Max, and Weight. Raw biometrics (HRV/RHR) are extracted to avoid score conflicts.
- **Location Tracking**: `cw:cli users location` tools manage user countries based on last login IP.
- **Chat Stability**: AI SDK v5 UIMessage schema. See `docs/04-guides/chat-development.md`.
- **LLM Response Mocking**: Flat JSON fixtures in `tests/fixtures/llm-mocks/` when `MOCK_LLM_RESPONSES=true`. Update/create `tests/fixtures/llm-mocks/${operation}.json` when AI schemas or operations change. See `docs/04-guides/e2e-testing.md`.
- **Git & PR Workflow**: PRs target `develop` (`gh pr create --base develop`). Merge: ticket branches → `develop` → `master`. No direct pushes to `master` or `develop`.

### Feature pointers

- **CLI Reference**: `docs/04-guides/cli-reference.md` — maintain whenever the CLI changes.
- **Nutrition Logic**: `docs/02-features/nutrition/fueling-logic.md`
- **System Messages**: `docs/02-features/system-messages.md`
- **Email System**: `docs/02-features/email-communication.md`
- **Chat Development**: `docs/04-guides/chat-development.md`
- **Timezone Handling**: `docs/04-guides/timezone-handling.md`
- **E2E Testing**: `docs/04-guides/e2e-testing.md` — targeted specs during development; full suite (`pnpm test:e2e`) when work is complete.

### Critical Prisma workflow

- **NEVER use `prisma db push`**. It breaks migration history and causes schema drift.
- **NEVER use `prisma migrate reset`** on the local database unless explicitly told by the user. It destroys data.
- **Mandatory Migrations**: After changing `prisma/schema.prisma`, create a migration with `npx prisma migrate dev --name <descriptive_name>`. Do not commit schema changes without the matching `prisma/migrations` update.
- **Handling Schema Drift**: If `migrate dev` prompts to reset due to drift, **CANCEL IT**. Resolve manually (generate SQL, create migration folder, `npx prisma migrate resolve --applied <name>`, then `npx prisma migrate deploy`).
