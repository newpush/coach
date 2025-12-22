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
    *Using `--create-only` allows you to review and modify the SQL before applying it, which is especially important for data migrations or complex alterations.*
3.  **Review/Edit**: Check the generated `migration.sql`. If you need to handle data migrations, renames, or custom logic, edit this file now.
4.  **Apply**: Once satisfied, apply the migration:
    ```bash
    pnpm prisma migrate dev
    ```

### Why?
-   Ensures the migration history tracks with the schema.
-   Prevents syntax errors and type mismatches.
-   Maintains consistency between the Prisma Client and the database.
