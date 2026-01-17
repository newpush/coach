# Timezone Handling Guide

This document outlines the strategy and best practices for handling dates, times, and timezones across the Coach Watts application.

## 1. Core Principles

To ensure consistency for athletes training across different timezones, we follow these rules:

1.  **Storage**: All timestamps are stored in **UTC** in the database.
2.  **Date-only Fields**: For fields like "Workout Date" or "Wellness Date" where we only care about the calendar day (Prisma `@db.Date`), we store them as **UTC Midnight** representing that specific local day.
3.  **Calculations**: All date arithmetic (adding days, finding start of week) MUST be done in **UTC** or explicitly relative to the **User's Timezone**.
4.  **Display**: Dates and times are always formatted according to the user's local timezone preference.

---

## 2. Database Strategy

### `DateTime` (Timestamps)

Used for completed workouts, message creation, and system logs.

- **Rule**: Stored exactly as received (normalized to UTC).
- **Example**: `2026-01-17T14:30:00Z`

### `@db.Date` (Calendar Days)

Used for `PlannedWorkout.date`, `DailyMetric.date`, `Nutrition.date`, and `TrainingWeek.startDate`.

- **Rule**: Stored as `YYYY-MM-DDT00:00:00Z`.
- **Note**: This value is an _abstraction_ of a local day. Jan 15th is always Jan 15th UTC midnight, regardless of where the user is.

---

## 3. Server Utilities (`server/utils/date.ts`)

Always use the centralized helpers in `server/utils/date.ts` for backend logic.

### Key Helpers

- `getUserTimezone(userId)`: Fetches the user's preferred timezone (falls back to 'UTC').
- `getUserLocalDate(timezone, [date])`: Returns a Date object set to **UTC Midnight** representing the given date in the user's timezone. Essential for querying `@db.Date` columns.
- `getStartOfDayUTC(timezone, [date])`: Returns the true UTC timestamp for the _start_ of the user's day. Essential for querying `DateTime` ranges.
- `getEndOfDayUTC(timezone, [date])`: Returns the true UTC timestamp for the _end_ of the user's day.
- `formatUserDate(date, timezone, [format])`: Formats a date for display/prompts in the user's timezone.

---

## 4. Frontend Helpers (`app/composables/useFormat.ts`)

The `useFormat` composable provides reactive timezone-aware formatting.

- `formatDate(date, [format])`: Standard formatting in user's zone.
- `formatDateUTC(date, [format])`: Formats UTC dates (calendar days) without shifting. **Use this for Planned Workouts and Calendar grid numbers.**
- `getUserLocalDate()`: Returns the user's current local date as a UTC-midnight object.
- `getUserDateFromLocal(dateStr, timeStr)`: Constructs a UTC timestamp from local input (e.g., from a form).

---

## 5. API & Trigger Patterns

### Querying "Today's" Data

Never use `new Date()` directly on the server to find "today".

```typescript
// WRONG - relies on server local time (UTC)
const today = new Date()

// CORRECT
const timezone = await getUserTimezone(userId)
const localToday = getUserLocalDate(timezone) // 2026-01-17T00:00:00Z

const workout = await prisma.plannedWorkout.findFirst({
  where: { userId, date: localToday }
})
```

### Date Arithmetic

Avoid `.setDate()` as it operates on local time. Use `setUTCDate()` or `date-fns`.

```typescript
// Safely moving ahead 7 days in UTC
const nextWeek = new Date(startDate)
nextWeek.setUTCDate(nextWeek.getUTCDate() + 7)
```

### AI Prompts

Always pass the user's timezone to prompt builders. Use `formatUserDate` to ensure the AI "sees" the same day the user does.

---

## 6. Prohibited Patterns

The following patterns are banned and caught by static analysis:

- `new Date().toISOString().split('T')[0]`: Relies on server time.
- `.toLocaleDateString()`: Defaults to server locale. Use `formatUserDate` instead.
- `86400000`: Hardcoded day duration ignores DST. Use `setUTCDate` or `date-fns`.
- `.setDate()`: Local time drift. Use `setUTCDate()`.

---

## 7. Troubleshooting

If the "Today" indicator is missing on the calendar:

1. Check if the frontend `isToday` check uses `getUserLocalDate()` comparison.
2. Verify the API is returning dates as UTC Midnight.
3. Ensure the user's timezone is correctly set in their profile.
