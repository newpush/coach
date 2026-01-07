# Deployment Guide

## Environment Configuration

### Critical: Authentication Callback URLs

The application uses OAuth authentication which requires proper callback URL configuration. **Failure to configure these correctly will redirect users to localhost even in production.**

### Step 1: Update Environment Variables

In your production environment, you MUST set the following environment variables:

```bash
# Replace with your actual production domain
NUXT_AUTH_ORIGIN="https://your-domain.com/api/auth"
NUXT_PUBLIC_SITE_URL="https://your-domain.com"
```

**DO NOT** use `localhost` URLs in production.

### Step 2: Configure OAuth Provider Callback URLs

#### Google OAuth Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Select your OAuth 2.0 Client ID
3. Add your production URLs to **Authorized redirect URIs**:
   ```
   https://your-domain.com/api/auth/callback/google
   ```
4. Also add to **Authorized JavaScript origins**:
   ```
   https://your-domain.com
   ```

#### Strava OAuth

If using Strava integration, update the Authorization Callback Domain in [Strava API Settings](https://www.strava.com/settings/api):

```
https://your-domain.com/api/integrations/strava/callback
```

#### WHOOP OAuth

If using WHOOP integration, update the callback URL in your WHOOP Developer Portal:

```
https://your-domain.com/api/integrations/whoop/callback
```

### Common Issues

**Problem**: Users are redirected to localhost after signing in on production.

**Solution**:

1. Check that `NUXT_AUTH_ORIGIN` is set to your production URL (not localhost)
2. Verify that OAuth provider callback URLs include your production domain
3. Restart your production server after updating environment variables

**Problem**: "Redirect URI mismatch" error from Google.

**Solution**:

1. Ensure the exact callback URL is added to Google OAuth Console
2. Match the protocol (http vs https) - production should use https
3. Don't include trailing slashes

### Environment Variable Checklist for Production

- [ ] `NUXT_AUTH_ORIGIN` - Set to production URL
- [ ] `NUXT_PUBLIC_SITE_URL` - Set to production URL
- [ ] `DATABASE_URL` - Set to production database
- [ ] `NUXT_AUTH_SECRET` - Set to a secure random string
- [ ] `GOOGLE_CLIENT_ID` - Production OAuth client
- [ ] `GOOGLE_CLIENT_SECRET` - Production OAuth secret
- [ ] Google OAuth Console - Callback URLs updated
- [ ] Strava API Settings - Callback domain updated (if applicable)
- [ ] WHOOP Developer Portal - Callback URL updated (if applicable)

### Testing Authentication

After deployment, test the authentication flow:

1. Visit your production site
2. Click "Sign in with Google"
3. Verify you're redirected to your production domain (not localhost)
4. Check that you can successfully sign in and access the dashboard

### Local Development

For local development, keep these values in your `.env` file:

```bash
NUXT_AUTH_ORIGIN="http://localhost:3099/api/auth"
NUXT_PUBLIC_SITE_URL="http://localhost:3099"
```

And ensure your OAuth providers also have localhost callback URLs configured for development.
