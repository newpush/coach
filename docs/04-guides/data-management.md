# Data Management Guide

This guide covers the "User Universe" data portability system, used for GDPR compliance, data backups, and synchronizing user state between production and local development environments.

## Overview

The system centers around the **User Universe**, a complete snapshot of a user's data including:

- **Profile & Settings:** Bio, HR/Power zones, nutrition targets, and preferences.
- **Training Stack:** Goals, events, training plans, and scheduled workouts.
- **Activity History:** Completed workouts, raw `.fit` files, and high-frequency streams (Watts, HR, GPS).
- **Health & Wellness:** HRV, sleep logs, daily metrics, and check-ins.
- **AI Context:** Full chat history, AI-generated reports, and recommendations.

---

## Developer Workflow: Prod-to-Local Sync

The most powerful use case for this system is "teleporting" a production user's state to a local development instance for debugging or testing.

### 1. Prerequisites

Ensure you have an API Key for your production account. You can generate or find this in your production user settings.

### 2. Pull Data from Production

Use the `api-pull` command to fetch your production data via the API. This is useful when you don't have direct database access. Using the `.gz` extension is highly recommended for speed and storage efficiency.

```bash
# Set your production API key
export COACHWATTS_API_KEY="your_production_api_key"

# Pull data (defaults to https://coachwatts.com)
npx tsx cli/index.ts users data api-pull --output ./backups/prod_state.json.gz
```

_The package will be saved and automatically compressed to the specified path._

### 3. Import to Local Environment

Inject the downloaded package into your local Postgres database. The tool automatically detects and decompresses `.gz` files.

```bash
# Use the --clear flag to wipe the existing local user with that email
npx tsx cli/index.ts users data import ./backups/prod_state.json.gz --clear
```

#### Importing to a New Local Account

If you want to keep your existing local account and import production data as a _separate_ user:

```bash
npx tsx cli/index.ts users data import ./backups/prod_state.json.gz --email dev-tester@coachwatts.local
```

### 4. Safety & Sanitization

The import process automatically **sanitizes** sensitive production data:

- **Billing:** `stripeCustomerId` and `stripeSubscriptionId` are cleared to prevent accidental local billing.
- **Integrations:** `accessToken` and `refreshToken` for Strava, Oura, etc., are redacted. You will need to re-authenticate integrations locally if you wish to sync new data.
- **Identity:** Original UUIDs are preserved by default, ensuring all internal relations remain intact.

---

## Developer Workflow: Prod-to-Testing Transfer

The export/import pair above always creates a **new** user from a file. To load production data onto a user that **already exists** on another instance — typically your account on `testing.coachwatts.com` — use `users data transfer`. It copies straight from one database to the other, remaps every `userId` onto the target user, and can be narrowed to the sections and date range you actually need.

### 1. Prerequisites

- Network access to both databases — see [Reaching the testing database](#reaching-the-testing-database) below, which is not as simple as it sounds.
- `DATABASE_URL_PROD` and `DATABASE_URL_TESTING` in `.env` (either option also accepts a literal `postgresql://…` URL).
- The target user must already exist on the target instance. Sign in there once, then look up the id:

```bash
pnpm cw:cli users search you@example.com
```

#### Reaching the testing database

The testing instance's database runs inside the deployment's private container network and **publishes no host port**, so its connection string cannot be used from a workstation as-is. Reaching it needs a forward from your machine to that network — typically a short-lived proxy container on the deployment host plus an SSH local forward.

`DATABASE_URL_TESTING` should therefore point at the **local end** of that forward, not at the internal hostname:

```bash
DATABASE_URL_TESTING="postgresql://<user>:<password>@127.0.0.1:15432/<database>"
```

The forward has to be up before the command runs; without it you get a connection refused on `127.0.0.1:15432`.

> [!NOTE]
> The host-specific recipe — stack and container names, host address, and the exact proxy/tunnel commands — lives in the private infrastructure runbook (`hdkiller/docs/applications/coach-watts.md`, "Testing instance database access"), not in this repository. Credentials come from the deployed stack; they are not stored in the repo or in `.env.example`.

Tear the forward down when you are done, and keep the credentials out of anything tracked by git — `.env` is git-ignored, command lines and shell history are not, which is why `--to` also accepts an env var name rather than a literal URL.

### 2. See what would move

```bash
pnpm cw:cli users data transfer --user you@example.com --target-user <target-user-id> --dry-run
```

Nothing is written; you get a per-table row count for the selected sections.

### 3. Run it

```bash
pnpm cw:cli users data transfer --user you@example.com --target-user <target-user-id>
```

The command prints source, target, sections and date range, then asks for confirmation (`--yes` skips it). Inserts use `skipDuplicates`, so **re-running is safe** — a second run copies only what is new.

### Options

| Option                      | Default                | Description                                                                    |
| :-------------------------- | :--------------------- | :----------------------------------------------------------------------------- |
| `--user <email\|id>`        | —                      | Source user (required).                                                        |
| `--target-user <id\|email>` | same id as source      | User in the target database that receives the data.                            |
| `--from <envVar\|url>`      | `DATABASE_URL_PROD`    | Source database.                                                               |
| `--to <envVar\|url>`        | `DATABASE_URL_TESTING` | Target database.                                                               |
| `--sections <list>`         | everything but opt-ins | Comma-separated section keys, or `all`.                                        |
| `--skip <list>`             | —                      | Sections to exclude from the selection.                                        |
| `--since` / `--until`       | —                      | Bound date-ranged tables (`YYYY-MM-DD`).                                       |
| `--replace`                 | off                    | Delete the target user's rows in the selected sections (and date range) first. |
| `--dry-run`                 | off                    | Count only, write nothing.                                                     |
| `--list-sections`           | —                      | Print sections and what is never transferred.                                  |
| `-y, --yes`                 | off                    | Skip the confirmation prompt.                                                  |

### Sections

`profile`, `settings`, `goals`, `events`, `plans`, `planned`, `workouts`, `streams`, `wellness`, `metrics`, `nutrition`, `calendar`, `memories`, `ai` are transferred by default. `fitfiles` (raw `.fit` blobs) and `chat` (full AI conversation history) are **opt-in** because of their size:

```bash
# Last three months of training data only
pnpm cw:cli users data transfer --user you@example.com --target-user <id> \
  --sections workouts,streams,planned,wellness --since 2026-05-01

# Everything, including chat history and FIT files
pnpm cw:cli users data transfer --user you@example.com --target-user <id> --sections all
```

Run `--list-sections` for the full table.

### Safety

- **Never writes to the source**, and refuses to run if the target resolves to `DATABASE_URL_PROD` or to the same URL as the source.
- Credentials are never printed — only `host:port/database`.
- Auth material (`Account`, `Session`, `ApiKey`, OAuth tables), provider tokens (`Integration`), push tokens, billing rows and operational logs are **not** transferred. Re-connect integrations on the target instance if you need live syncing there.
- The profile section copies training and preference columns only. Email, name, admin flag, subscription state and public profile slugs on the target user are left untouched.
- Globally unique artefacts are cleared on the way in: workout and planned-workout share tokens, and training plan slugs (transferred plans also arrive as non-public).

### How partial selections stay consistent

Skipping a section, or applying a date range, can leave foreign keys pointing at rows that are not in the target. Each is handled explicitly:

- Optional references are **nulled** — a workout whose planned workout was not transferred simply arrives unlinked.
- Required references cause the row to be **dropped**, and the count shows up in the `Dropped` column.
- Rows that already exist in the target (from an earlier run) still satisfy references, so incremental runs link up correctly.
- The strength `Exercise` library is shared reference data; entries your workouts need are copied automatically if the target lacks them.

`WorkoutStreamV2` is copied with plain SQL rather than Prisma: production rows contain NULL elements inside the `Int[]` / `Float[]` time-series columns, which the Prisma client refuses to decode.

---

## User Feature: Self-Service Export

Regular users can download their data directly from the application for portability or compliance (GDPR).

### How to Export

1. Log in to the application.
2. Navigate to **Settings > Danger Zone**.
3. Under **Data Portability**, click **Export My Data (.json)**.
4. Your browser will download a single JSON file containing your entire history.

---

## CLI Reference: `cw:cli users data`

| Command    | Arguments | Options                                                                                                                                         | Description                                                                 |
| :--------- | :-------- | :---------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------- |
| `export`   | `<id>`    | `--prod`, `--output`                                                                                                                            | Direct DB export to a local file. Supports `.gz`.                           |
| `api-pull` |           | `--key`, `--host`, `--output`                                                                                                                   | API-based export from a remote instance. Supports `.gz`.                    |
| `import`   | `<path>`  | `--clear`, `--email`                                                                                                                            | Injects an export package into the local database.                          |
| `transfer` |           | `--user`, `--target-user`, `--from`, `--to`, `--sections`, `--skip`, `--since`, `--until`, `--replace`, `--dry-run`, `--list-sections`, `--yes` | Selective database-to-database copy onto an existing user (prod → testing). |

---

## Limitations & Constraints

### Same-Instance Collisions

The system is designed for **Cross-Instance Migration** (e.g., Prod to Local). Importing a user into the _same_ database instance they were exported from (under a different email) is **not supported**.

- Child records (like `emailPreference` or `sportSettings`) have unique IDs that will collide if the original user still exists in the same database.
- Always use the `--clear` flag if the user already exists in the target environment.

### Large Files

For users with many years of data, the `WorkoutStream` data can make the JSON file very large (100MB+).

- Always use **GZIP** (`.json.gz`) for transfers.
- Browser downloads may be slow for very large accounts; the CLI `api-pull` method is more robust for these cases.

## Troubleshooting

### Foreign Key Violations

If an import fails, ensure your local database schema matches production. Run `npx prisma migrate dev` to ensure you are up to date.
