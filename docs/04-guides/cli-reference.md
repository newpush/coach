# Coach Watts CLI (`cw:cli`)

The Coach Watts CLI (`cw:cli`) is the primary tool for development, debugging, and operational tasks. It replaces ad-hoc scripts and provides a structured way to interact with the application backend, database, and integrations.

## Philosophy

- **Centralization**: All utility scripts should be migrated to or created within `cli/`.
- **Consistency**: Uses the same environment variables, database connections, and utilities as the main application.
- **Discoverability**: Commands are self-documenting via `--help`.

## Usage

Run the CLI using the npm script:

```bash
npm run cw:cli -- <command> [subcommand] [options]
```

Or directly via `tsx`:

```bash
npx tsx cli/index.ts <command> ...
```

## Available Commands

### 1. Database (`db`)

Manage database operations and diagnostics.

- **Compare Schemas**: Check for schema drift between local and production databases.

  ```bash
  npm run cw:cli -- db compare
  ```

  _Requires `DATABASE_URL` and `DATABASE_URL_PROD` in `.env`._

- **Backup**: Create a database backup (wrapper around `dump-db.sh`).
  ```bash
  npm run cw:cli -- db backup
  ```

### 2. Debugging (`debug`)

Debug specific data ingestion and processing flows.

- **Workout**: Debug a specific workout by ID or source ref.
  ```bash
  npm run cw:cli -- debug workout <id_or_ref>
  ```

### 3. Users (`users`)

Manage user accounts.

- **List**: List all users.

  ```bash
  npm run cw:cli -- users list
  ```

- **Search**: Search for users by name or email.
  ```bash
  npm run cw:cli -- users search "john"
  ```

### 4. Backfill (`backfill`)

Run data backfill operations.

- **Fit Pacing**: Backfill pacing data from FIT files.
  ```bash
  npm run cw:cli -- backfill fit-pacing
  ```

### 5. Check (`check`)

Run system health checks.

- **Env**: Verify environment variables.
  ```bash
  npm run cw:cli -- check env
  ```

## Extending the CLI

To add a new command:

1.  Create a new directory or file in `cli/<category>/`.
2.  Define the command using `commander`.
3.  Register the command in `cli/index.ts` (or the parent category's `index.ts`).

**Example: Adding a new debug command**

File: `cli/debug/my-debug.ts`

```typescript
import { Command } from 'commander'

export const myDebugCommand = new Command('my-debug')
  .description('Debug something new')
  .action(async () => {
    // ... logic
  })
```

File: `cli/debug/index.ts`

```typescript
import { myDebugCommand } from './my-debug'

debugCommand.addCommand(myDebugCommand)
```
