# WHOOP OAuth Integration

This document describes the WHOOP OAuth integration implementation and how to test it.

## Overview

The WHOOP integration allows users to connect their WHOOP account to sync recovery, sleep, and workout data. It uses OAuth 2.0 authorization code flow as specified in the [WHOOP API documentation](https://developer.whoop.com/docs/developing/oauth).

## Configuration

### Environment Variables

The following environment variables must be set in your `.env` file:

```bash
WHOOP_CLIENT_ID=your_client_id_here
WHOOP_CLIENT_SECRET=your_client_secret_here
```

These credentials are obtained from the WHOOP Developer Portal.

### Runtime Configuration

The integration requires the site URL to be configured for OAuth callbacks. This is set automatically in development:

```typescript
// nuxt.config.ts
runtimeConfig: {
  public: {
    siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3099'
  }
}
```

For production, set the `NUXT_PUBLIC_SITE_URL` environment variable to your production URL.

## Implementation Details

### API Endpoints

#### 1. Authorization Endpoint

- **URL**: `GET /api/integrations/whoop/authorize`
- **Purpose**: Initiates the OAuth flow by redirecting to WHOOP's authorization page at `https://api.prod.whoop.com/oauth/oauth2/auth`
- **Scopes Requested**:
  - `read:recovery` - Recovery score, heart rate variability, and resting heart rate
  - `read:cycles` - Day Strain and average heart rate during physiological cycles
  - `read:sleep` - Sleep performance % and duration per sleep stage
  - `read:workout` - Workout activity Strain and average heart rate
  - `read:profile` - User profile (name and email)
  - `read:body_measurement` - Body measurements (height, weight, max heart rate)

#### 2. Callback Endpoint

- **URL**: `GET /api/integrations/whoop/callback`
- **Purpose**: Receives the authorization code from WHOOP and exchanges it for access tokens via `https://api.prod.whoop.com/oauth/oauth2/token`
- **Process**:
  1. Receives authorization code from WHOOP
  2. Exchanges code for access token and refresh token using token endpoint
  3. Fetches user profile via `https://api.prod.whoop.com/developer/v1/user/profile/basic`
  4. Stores integration in database with tokens and WHOOP user ID
  5. Redirects back to settings page with success/error message

#### 3. Disconnect Endpoint

- **URL**: `DELETE /api/integrations/[provider]/disconnect`
- **Purpose**: Removes the integration and associated tokens from the database

### Frontend Components

#### 1. Connect WHOOP Page

- **Route**: `/connect-whoop`
- **File**: [`app/pages/connect-whoop.vue`](../app/pages/connect-whoop.vue)
- **Features**:
  - Explains what data will be synced
  - Lists OAuth permissions being requested
  - Secure connection information
  - Initiates OAuth flow on button click

#### 2. Settings Page Integration

- **Route**: `/settings`
- **File**: [`app/pages/settings.vue`](../app/pages/settings.vue)
- **Features**:
  - Shows WHOOP connection status
  - Connect button when not connected
  - Disconnect button when connected
  - Success/error notifications from OAuth callback

## Testing the Integration

### Prerequisites

1. Ensure your `.env` file has valid WHOOP credentials:

   ```bash
   WHOOP_CLIENT_ID=8e6b159b-f683-4b06-b1d0-fd866baeb35c
   WHOOP_CLIENT_SECRET=ad268ca50130041489dedfd7cebaf7401fc9f027610e7c382ba7e83014baabfe
   ```

2. Make sure your WHOOP Developer Portal callback URL is set to:

   ```
   http://localhost:3099/api/integrations/whoop/callback
   ```

3. Start your development server:
   ```bash
   npm run dev
   # or
   pnpm dev
   ```

### Testing Steps

1. **Navigate to Settings**
   - Open [http://localhost:3099/settings](http://localhost:3099/settings)
   - Log in if not already authenticated

2. **Connect WHOOP**
   - Find the "WHOOP" section under "Connected Apps"
   - Click the "Connect" button
   - You should be redirected to `/connect-whoop`

3. **Review Permissions**
   - On the connect page, review the permissions being requested
   - Click "Connect WHOOP" button

4. **Authorize on WHOOP**
   - You'll be redirected to WHOOP's authorization page
   - Log in with your WHOOP credentials
   - Review and approve the requested permissions

5. **Verify Success**
   - You should be redirected back to `/settings`
   - A success notification should appear
   - The WHOOP integration should show as "Connected"
   - A "Disconnect" button should be visible

6. **Test Disconnect**
   - Click the "Disconnect" button next to WHOOP
   - Confirm the integration is removed
   - The status should change back to showing a "Connect" button

### Troubleshooting

#### OAuth Redirect Issues

- Ensure the callback URL in WHOOP Developer Portal matches exactly: `http://localhost:3099/api/integrations/whoop/callback`
- Check that `NUXT_PUBLIC_SITE_URL` is set correctly if not using localhost

#### Token Exchange Failures

- Verify client ID and secret are correct
- Check server logs for detailed error messages
- Ensure your WHOOP app has the correct scopes enabled

#### Database Integration Not Saved

- Check that the user is properly authenticated
- Verify database connection is working
- Check server logs for Prisma errors

### Verifying Database Records

After successful connection, verify the integration was saved:

```sql
-- Check integration record
SELECT * FROM "Integration" WHERE provider = 'whoop';

-- Should show:
-- - userId: Your user ID
-- - provider: 'whoop'
-- - accessToken: Encrypted token
-- - refreshToken: Encrypted refresh token
-- - externalUserId: Your WHOOP user ID
-- - syncStatus: 'SUCCESS'
```

## Data Syncing

Once connected, the WHOOP integration can be used by the background jobs to sync data:

- **Recovery Data**: [`trigger/ingest-whoop.ts`](../trigger/ingest-whoop.ts)
- **Wellness Data**: Stored in `Wellness` table
- **Utilization**: Used by coaching and report generation features

## Security Considerations

1. **Token Storage**: Access tokens and refresh tokens are stored in the database. Consider encrypting these at rest.
2. **Token Refresh**: Implement token refresh logic before expiration (tokens expire based on `expiresAt` field)
3. **Revocation**: Users can revoke access from WHOOP's account settings
4. **Scopes**: Only request the minimum scopes needed for your application

## Future Enhancements

- [ ] Implement automatic token refresh before expiration
- [ ] Add webhook support for real-time data updates
- [ ] Display last sync time in settings
- [ ] Add manual sync trigger button
- [ ] Show sync errors and retry logic
