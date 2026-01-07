# Scoring System Setup & Maintenance

This guide covers the technical setup, maintenance, and troubleshooting of the [Coach Watts Scoring System](../02-features/analytics/scoring-system.md).

## 🚀 Quick Start

To backfill missing scores for workouts and nutrition entries:

```bash
pnpm backfill-scores
```

This script scans the database for items without scores and triggers the necessary AI analysis tasks.

---

## 🛠️ Components

The scoring system relies on the following components:

1.  **Database Schema**: `overallScore`, `technicalScore`, etc., columns on `Workout` and `Nutrition` tables.
2.  **AI Analysis Tasks**: Trigger.dev tasks (`analyze-workout`, `analyze-nutrition`) that generate scores.
3.  **Backfill Script**: `scripts/backfill-scores.ts` for batch processing.

## 🔄 Backfilling Scores

The backfill process is useful when:

- You have imported historical data.
- You have added new scoring metrics to the schema.
- You want to re-analyze items that failed previously (if status is reset).

### Running the Backfill

1.  Ensure your `.env` file is configured with `DATABASE_URL` and `TRIGGER_API_KEY`.
2.  Ensure your Trigger.dev dev server is running if working locally:
    ```bash
    pnpm dev:trigger
    ```
3.  Run the backfill script:
    ```bash
    pnpm backfill-scores
    ```
4.  The script will:
    - Scan for workouts/nutrition with `overallScore: null`.
    - Show a count of items to be processed.
    - Ask for confirmation.
    - Trigger background jobs for each item.

## 📊 Monitoring

Scores are generated asynchronously. You can monitor progress in:

1.  **Console Output**: The backfill script provides immediate feedback on triggered tasks.
2.  **Trigger.dev Dashboard**: View the status of `analyze-workout` and `analyze-nutrition` runs, including logs and any AI generation errors.
3.  **Database**:
    ```sql
    -- Check progress
    SELECT count(*) FROM "Workout" WHERE "overallScore" IS NOT NULL;
    ```

## 🐛 Troubleshooting

| Issue                        | Possible Cause                              | Solution                                                                                      |
| ---------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Script fails to connect**  | Database or Trigger.dev connectivity issues | Check `.env` variables and ensure DB/Trigger dev server is running.                           |
| **Tasks triggered but fail** | AI API errors or Prompt issues              | Check Trigger.dev logs for specific error messages (e.g., Gemini API quota, invalid prompts). |
| **Scores remain null**       | Analysis jobs not completing                | Verify that `aiAnalysisStatus` is being updated to `COMPLETED` in the jobs.                   |

## 🔗 Related Documentation

- [Scoring System Features](../02-features/analytics/scoring-system.md) - Detailed explanation of scoring logic and metrics.
