# Agent Guidelines (AGENTS.md)

Primary context for AI agents (Claude Code, Gemini CLI, Cursor) working in this repository.

## Project

**Coach Watts** — AI endurance coaching platform. Nuxt 3 + Nuxt UI, Vercel AI SDK, Prisma, Trigger.dev.

## Issue tracking

All work is tracked in **Linear**, team key **`CW`**. Issue IDs look like `CW-105`.

**Read [`docs/04-guides/issue-management.md`](docs/04-guides/issue-management.md) before picking up any ticket.** It defines the label taxonomy, workflow states, the AI-ready ticket template, and the concurrent-agent claim protocol.

Task state lives in Linear, never in git-tracked markdown. Files under `docs/issues/` are the **archive** of already-resolved issues plus specs — do not treat them as a live queue and do not update their status as a way of tracking work.

## Non-negotiables for agents

1. **One git worktree per ticket.** Never work on two tickets in the same checkout.
   ```bash
   git worktree add ~/Develop/.worktrees/coach-wattz/CW-105 -b feat/CW-105-slug
   ```
2. **Claim before you code.** Set the ticket to `In Progress`, assign it to yourself, add `ai:in-progress` — then re-read it. If the assignee is not you, another agent won the race; take the next ticket.
3. **Only touch the ticket's `Owned Paths`.** If the work requires files outside that set, stop and move the ticket to `Blocked`.
4. **Never mark a ticket `Done` without clean verification output.** Run the ticket's Verification Command and post the output as a comment.
5. **Blocked is a state, not a vibe.** Missing credentials, ambiguity, or an external dependency → move to `Blocked` and say what you need. Never leave a stalled ticket sitting in `In Progress`.
6. **File follow-ups in Linear.** Bugs, risks, missing requirements, tech debt, or out-of-scope todos discovered while working → create a `CW` issue in `Triage` (see issue-management §8). Do not expand the current ticket's scope to absorb them.

## Execution loop

**Plan → Act → Verify → Push & Open PR → Log & Transition.** Confirm file locations and restate the approach on the ticket; implement inside the worktree; run the verification command; push branch (`git push origin <branch>`) and open Pull Request (`gh pr create --base develop --body "Fixes CW-XYZ"`); post results, PR link, and diff summary to Linear.

## Commands

```bash
pnpm dev              # dev server
pnpm build            # production build
pnpm typecheck        # tsc
pnpm test             # unit tests
pnpm lint             # eslint
npx prisma migrate dev
```

See [`docs/04-guides/`](docs/04-guides/) for typechecking, e2e testing, chat development, localization, and analytics guides.

## Scope

This repository is Coach Watts product development only. Do not reference internal corporate teams, internal financial namespaces, or client engagements in code, commits, PR descriptions, or issue comments here.

## Cursor Cloud specific instructions

The Cloud VM snapshot already has: Node 24 (via nvm), pnpm deps, a local `.env`, and locally-installed PostgreSQL 16 + Redis 7. The startup update script runs `pnpm install` (which regenerates Prisma Client via `postinstall`). Everything below is what an agent still needs to do/know per session.

- Node: the project requires Node `>=24.11 <25`. The VM's default `/exec-daemon/node` is v22, so `~/.bashrc` prepends the nvm Node 24 bin to `PATH`. Always run commands through a login shell (e.g. `bash -lc '…'`) so `node --version` reports 24.x; a non-login shell may fall back to v22.
- Services are NOT auto-started (no systemd). Start them at the beginning of each session:
  - Postgres: `sudo pg_ctlcluster 16 main start` (cluster `16 main`, listens on `localhost:5432`).
  - Redis: `sudo redis-server /etc/redis/redis.conf --daemonize yes` (password `dragonfly`, port 6379). Check with `redis-cli -a dragonfly ping`.
- Local `.env` (gitignored) differs from `.env.example`: Postgres runs on the standard port `5432` (not 5439) with role/db `watts`/`watts` (password `password`), so `DATABASE_URL=postgresql://watts:password@localhost:5432/watts`. The dev server runs on `http://localhost:3099`.
- Apply DB migrations with `npx prisma migrate deploy` (or `npx prisma migrate dev`). The DB already has migrations applied in the snapshot; re-running deploy is a no-op.
- Login without Google OAuth: `.env` sets `AUTH_BYPASS_USER=dev@coachwatts.test`, so hitting any protected page auto-creates a session for that seeded admin user (see `server/plugins/auth-bypass.ts`). Recreate the user if the DB is reset with `npx tsx scripts/seed-dev-user.ts`.
- Prisma 7 uses a driver adapter — construct `PrismaClient` with `new PrismaPg(new pg.Pool(...))` (see `server/utils/db.ts`); `new PrismaClient()` alone throws. Standalone scripts must do the same.
- Commands (`pnpm dev`, `build`, `typecheck`, `test`, `lint`, etc.) are defined in `package.json`. Note: `pnpm lint` and `pnpm typecheck` need generated Nuxt types first — run `pnpm exec nuxt prepare` once (CI does this) or start `pnpm dev` before them.
- AI features (chat, analysis) need a real `GEMINI_API_KEY`; external integrations (Strava/Whoop/etc.) and Stripe use placeholder credentials in local dev and won't complete real OAuth/payment flows.
