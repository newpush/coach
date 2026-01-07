# Server Management Rule

## Do Not Run the Development Server

The agent should **NEVER** run the node development server (e.g., `pnpm dev`, etc.).

### Rationale

- The user will run and manage the development server themselves
- The application uses hot module replacement (HMR) and will automatically detect and reload changes
- All code changes made by the agent will be picked up automatically without requiring a server restart

### What This Means

When making changes to the codebase:

- Make file edits directly using the Edit or Write tools
- Do not start, stop, or restart the development server
- Trust that the user's running server will automatically reflect the changes
