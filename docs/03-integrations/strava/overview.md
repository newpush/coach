# Strava Integration

This document describes the Strava integration implementation for importing workout data.

## Overview

The Strava integration allows users to connect their Strava account and automatically import their activities (rides, runs, swims, etc.) into the application. It follows the same pattern as the Intervals.icu integration but uses OAuth2 for authentication.

## Components

### 1. Server Utilities (`server/utils/strava.ts`)

Contains all Strava API interaction logic:

- **OAuth & Token Management**
  - `refreshStravaToken()` - Automatically refreshes expired access tokens
  - `ensureValidToken()` - Ensures valid token before API calls
  - Token expiration checking with 5-minute buffer

- **API Methods**
  - `fetchStravaActivities()` - Fetches activities for a date range (paginated)
  - `fetchStravaActivityDetails()` - Fetches detailed activity data
  - `fetchStravaAthlete()` - Fetches athlete profile

- **Data Normalization**
  - `normalizeStravaActivity()` - Converts Strava activity format to our Workout model
  - Maps Strava sport types to our types (e.g., VirtualRide → Ride)

### 2. API Endpoints

#### Authorization Flow

- **`/api/integrations/strava/authorize` (GET)**
  - Initiates OAuth flow
  - Redirects user to Strava authorization page
  - Uses CSRF protection with state parameter

- **`/api/integrations/strava/callback` (GET)**
  - Handles OAuth callback from Strava
  - Exchanges authorization code for access token
  - Stores integration in database

#### Management

- **`/api/integrations/strava/disconnect` (DELETE)**
  - Disconnects Strava integration
  - Removes integration from database

- **`/api/integrations/sync` (POST)**
  - Updated to support Strava sync
  - Triggers background job to import activities
  - Default: Last 90 days of activities

### 3. UI Components

#### Connect Page (`app/pages/connect-strava.vue`)

- User-friendly connection page
- Explains what data will be imported
- OAuth authorization flow

#### Settings Integration (`app/pages/settings.vue`)

- Shows Strava connection status
- Connect/Disconnect buttons
- Sync button to manually trigger data import
- OAuth callback handling with toast notifications

### 4. Background Job (`trigger/ingest-strava.ts`)

Trigger.dev task for importing Strava data:

- Fetches activities for specified date range
- Handles pagination automatically
- Upserts activities to avoid duplicates
- Updates integration sync status
- Error handling and logging

## Setup

### Environment Variables

Add these to your `.env` file:

```env
STRAVA_CLIENT_ID=your_client_id
STRAVA_CLIENT_SECRET=your_client_secret
```

### Obtaining Strava API Credentials

1. Go to https://www.strava.com/settings/api
2. Create an application
3. Set Authorization Callback Domain to your app's domain (e.g., `localhost` for development)
4. Note your Client ID and Client Secret

## Usage Flow

1. **User Connection**
   - User navigates to Settings → Connected Apps
   - Clicks "Connect" on Strava card
   - Redirected to `/connect-strava` page
   - Clicks "Connect with Strava" button
   - Redirected to Strava for authorization
   - After approval, redirected back with success/error message

2. **Data Sync**
   - Automatic: First sync happens after connection
   - Manual: User clicks "Sync Strava" button in Settings or Data page
   - Background job fetches last **7 days** of activities (optimized for rate limits)
   - Activities are intelligently cached and deduplicated
   - Only new or updated activities require detailed API calls

3. **Token Refresh**
   - Access tokens expire after ~6 hours
   - Automatic refresh happens before each API call
   - Uses refresh token stored in database
   - User never needs to re-authorize unless integration is disconnected

## Data Mapping

Strava activities are mapped to our Workout model with the following fields:

- **Basic Info**: title, description, date, type
- **Duration & Distance**: durationSec, distanceMeters, elevationGain
- **Power Metrics**: averageWatts, maxWatts, normalizedPower, kilojoules
- **Heart Rate**: averageHr, maxHr
- **Cadence**: averageCadence
- **Speed**: averageSpeed
- **Training Load**: trimp (from Strava's suffer score)
- **Environment**: avgTemp, trainer flag

## Comparison with Intervals.icu

| Feature          | Strava        | Intervals.icu    |
| ---------------- | ------------- | ---------------- |
| Auth Method      | OAuth2        | API Key          |
| Token Expiry     | Yes (6 hours) | No               |
| Planned Workouts | No            | Yes              |
| Wellness Data    | No            | Yes              |
| Activity Import  | Direct        | Via Strava sync  |
| Real-time Sync   | Yes           | Manual/Scheduled |

## Deduplication with Intervals.icu

Since Intervals.icu can sync with Strava, you might have the same activities in both systems. The Strava integration includes intelligent deduplication:

**How it Works:**

- Before importing a Strava activity, checks if it already exists from Intervals.icu
- Matches activities by:
  - Date (within 5-minute window)
  - Duration (within 30-second tolerance)
- **Prefers Intervals.icu data** over Strava when duplicates are found
- Skips importing the Strava version if already in Intervals.icu

**Why Prefer Intervals.icu?**

- Intervals.icu provides richer training metrics (CTL, ATL, TSS)
- More detailed power analysis
- Better integration with training plans
- Strava data is already in Intervals.icu anyway

**Log Output:**
The sync job logs how many activities were:

- Upserted (new or updated from Strava)
- Skipped (already existed from Intervals.icu)
- Total activities found in Strava

**Example:**

```
Strava sync complete: 15 upserted, 25 skipped (already in Intervals.icu)
```

This means you only get Strava-exclusive activities (like activities recorded on Strava but not synced to Intervals.icu).

## Known Limitations

1. **7-Day Sync Window**: Only syncs last 7 days (optimized for rate limits vs. Intervals.icu's 90 days)
2. **No Planned Workouts**: Strava doesn't provide a planned workouts API
3. **No Wellness Data**: Strava doesn't provide HRV, sleep, or recovery data
4. **Limited Training Load**: Only "suffer score" available (similar to TRIMP)
5. **Deduplication Tolerance**: 5-minute time window and 30-second duration tolerance may not catch all duplicates if times are significantly different

## API Scopes

The integration requests these Strava scopes:

- `read` - Basic profile information
- `activity:read_all` - Read all activities
- `profile:read_all` - Read full profile

## Security

- OAuth state parameter for CSRF protection
- Tokens stored securely in database
- HTTPS required in production
- Automatic token refresh
- Secure cookie settings

## Testing

To test the integration:

1. Ensure Trigger.dev is running: `pnpm dev:trigger`
2. Start the application: `pnpm dev`
3. Go to Settings and connect Strava
4. Check database for Integration record
5. Click "Sync Strava" and verify activities are imported
6. Check Trigger.dev dashboard for job status

## Troubleshooting

### "Invalid client" error

- Check STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET are set correctly
- Verify callback domain matches in Strava app settings

### "Authorization failed"

- User may have denied access
- Check browser console for errors
- Verify OAuth flow completes correctly

### No activities imported

- Check Trigger.dev job logs
- Verify user has activities in date range
- Check for API rate limit errors

### Token expired

- Should auto-refresh - check logs for refresh errors
- If persistent, ask user to disconnect and reconnect

## Future Enhancements

Possible improvements:

1. Webhook support for real-time activity sync
2. Activity segments and efforts
3. Kudos and comments
4. Routes and photos
5. Performance analysis and records
