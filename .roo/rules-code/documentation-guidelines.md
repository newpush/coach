# Documentation Guidelines

This document outlines the standards and processes for maintaining the project documentation in the `docs/` directory.

## 1. Directory Structure

The documentation is organized hierarchically to keep it manageable. All documentation **MUST** reside in `docs/` and follow this structure:

- `01-architecture/`: Core system design, database schemas, infrastructure, and high-level decisions.
- `02-features/`: Detailed specifications and guides for specific features (e.g., `chat/`, `analytics/`, `goals/`).
- `03-integrations/`: Documentation for external services (e.g., `strava/`, `whoop/`, `intervals/`).
- `04-guides/`: Instructional guides for developers (e.g., implementation steps, deployment, technical how-tos).
- `05-archive/`: Obsolete documents, past status reports, and resolved bug fix logs.
- `06-plans/`: Future feature specifications and improvement plans.

**Rule:** Do not create files directly in the root of `docs/` (except `INDEX.md`, `README.md`, and `RULES.md`). Always categorize them into one of the numbered subdirectories.

## 2. Indexing

The file `docs/INDEX.md` serves as the central Table of Contents for the entire documentation set.

**Rule:** Whenever you add, rename, or move a documentation file, you **MUST** update `docs/INDEX.md` to reflect the change.
**Rule:** Ensure the link description in `INDEX.md` is concise and helpful.

## 3. Naming Conventions

- **File Names:** Use `kebab-case.md` (lowercase with hyphens). Example: `user-authentication.md`.
- **Titles:** The first line of the file must be a level 1 header (`# Title`).
- **Images:** Store images in `docs/images/` or a feature-specific assets folder if created.

## 4. Documentation Lifecycle

### Adding New Features

When implementing a new feature:

1.  Create a corresponding markdown file in `docs/02-features/<feature-name>/`.
2.  Describe the overview, architecture, data flow, and key components.
3.  Add the new file to `docs/INDEX.md`.

### Updating Existing Features

When modifying code:

1.  Check if there is existing documentation in `docs/`.
2.  Update the documentation to match the new behavior (e.g., updated API endpoints, schema changes).
3.  **Crucial:** Keep the "Database Schema" doc in `docs/01-architecture/` in sync with `prisma.schema`.

### Archiving

When a document becomes obsolete or represents a point-in-time status (like a bug fix report):

1.  Move it to `docs/05-archive/`.
2.  Update the link in `docs/INDEX.md` to point to the archive section.

## 5. Writing Style

- **Concise:** Be direct. Use bullet points where possible.
- **Code Blocks:** Use syntax highlighting (e.g.,

```typescript
).
-   **Links:** Use relative paths for links between documents (e.g., `[Architecture](../01-architecture/system-overview.md)`).

## 6. Review Process

AI Agents and Developers should:
1.  Read `docs/INDEX.md` to find relevant documentation before starting a task.
2.  Update documentation as part of the PR/Commit process.
3.  Run a quick check to ensure no dead links are introduced when moving files.
```
