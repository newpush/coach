# Database Management Guidelines

## 1. Database Safety

### Rule: NEVER Reset the Development Database

The agent must **NEVER** execute commands that completely reset the database schema and wipe data, such as:

- `pnpm prisma migrate reset`
- `pnpm prisma db push --force-reset`

**Rationale:**
The development database often contains critical test data, user configurations, and state that cannot be easily reproduced. Resetting it causes significant disruption.

## 2. Schema Changes & Migrations

### Rule: Use Prisma to Scaffold Migrations

When making changes to the database schema (`prisma/schema.prisma`):

1.  **Do NOT manually create** migration directories or SQL files from scratch.
2.  **ALWAYS use the CLI** to scaffold the migration.

### Workflow

1.  Make your changes to `prisma/schema.prisma`.
2.  Run the migration command to generate the SQL:
    ```bash
    pnpm prisma migrate dev --name <meaningful-name> --create-only
    ```
    _Using `--create-only` allows you to review and modify the SQL before applying it, which is especially important for data migrations or complex alterations._
3.  **Review/Edit**: Check the generated `migration.sql`. If you need to handle data migrations, renames, or custom logic, edit this file now.
4.  **Apply**: Once satisfied, apply the migration:
    ```bash
    pnpm prisma migrate dev
    ```

### Why?

- Ensures the migration history tracks with the schema.
- Prevents syntax errors and type mismatches.
- Maintains consistency between the Prisma Client and the database.

## 3. Production Consistency & Verification

### Rule: Verify Migrations Before Deployment

Before deployment or merging changes, ensure that:

1.  **All schema changes are reflected in migrations**: Run `pnpm prisma migrate status` to check for unapplied migrations or schema drift.
2.  **Migrations are committed**: The `prisma/migrations` directory must contain the generated SQL files.
3.  **Schema and Client match**: Ensure `pnpm prisma generate` has been run if the schema changed.

### Rule: Check for Drift

If the database schema has drifted (changes made manually or outside of migrations):

1.  **Do NOT use** `migrate resolve` unless you are certain of the resolution.
2.  Use `pnpm prisma migrate diff` to analyze differences between the schema and the database.

### Rule: Ensure Schema Consistency

To prevent schema drift between environment, always ensure that:

1.  **All schema changes** (e.g., new tables, columns, indexes) in `prisma/schema.prisma` have a corresponding migration file in `prisma/migrations`.
2.  **Never rely solely on `prisma db push`** in development if you intend to have reproducible migrations for production. `prisma db push` updates the database schema but does not create migration files.
3.  **Before deploying**, verify that the production database schema matches the local schema. Use schema comparison tools or scripts (like `scripts/compare-schema.ts`) to detect discrepancies.
