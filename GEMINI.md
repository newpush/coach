## Coach Watts Hot Context

This file tracks ongoing project state, active blockers, and recent architectural changes that haven't yet been formalized in `RULES.md` or `docs/`.

### Active Status & Known Issues

- **Typechecks**: The project has failing typechecks (TS2307, TS2578) across multiple existing files (share API, user store, fit utils). This is a known cleanup task.
- **Pricing Transition**: Transitioning from 'Free for Early Adopters' to tiered structure: Free ($0), Supporter ($8.99/mo), and Pro ($14.99/mo). See `docs/06-plans/pricing-and-entitlements.md`.

### Recent Integrations & Changes

- **Wellness Tracking**: Added Weight and Blood Pressure tracking via Intervals.icu.
- **Oura Integration**: Expanded to include SpO2, Stress, VO2 Max, and Weight. Raw biometrics (HRV/RHR) are strictly extracted to avoid score conflicts.
- **Location Tracking**: Added `cw:cli users location` tools to manage user countries based on last login IP.
- **Chat Stability**: fully stabilized using AI SDK v5 UIMessage schema. See `docs/04-guides/chat-development.md`.

### Feature Pointers

- **Nutrition Logic**: See `docs/02-features/nutrition/fueling-logic.md`.
- **System Messages**: See `docs/02-features/system-messages.md`.
- **Chat Development**: See `docs/04-guides/chat-development.md`.
- **Timezone Handling**: See `docs/04-guides/timezone-handling.md`.
