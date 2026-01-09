# OAuth 2.0 Identity Provider Implementation Plan

**Status:** Draft
**Target Version:** 0.6.0
**Owner:** Engineering

## 1. Executive Summary

This plan outlines the transformation of Coach Watts into an OAuth 2.0 Identity Provider (IdP). This enables:

1.  **Third-Party Integration:** Developers can build apps that access Coach Watts user data (workouts, profile, health metrics) securely.
2.  **Ecosystem Growth:** Allows for community-built tools, visualizations, and importers/exporters.
3.  **Security:** Moves away from API Keys or password sharing towards standard, revocable tokens.

The implementation will strictly follow the **Authorization Code Flow with PKCE** (Proof Key for Code Exchange) to ensure security for both public (mobile/SPA) and confidential (server-side) clients.

---

## 2. Database Architecture (Prisma)

We need to introduce entities to manage Applications, User Consents, Authorization Codes, Access Tokens, and Audit Logs.

### 2.1 OAuth Models

Add the following to `prisma/schema.prisma`:

```prisma
// --------------------------------------
// OAuth 2.0 Provider
// --------------------------------------

model OAuthApp {
  id            String    @id @default(uuid())
  name          String
  description   String?   @db.Text
  homepageUrl   String?
  logoUrl       String?   // S3 URL

  // Credentials
  clientId      String    @unique @default(dbgenerated("gen_random_uuid()"))
  clientSecret  String    // Hashed (bcrypt/argon2) - Only known to owner once

  // Configuration
  redirectUris  String[]  // Array of allowed callback URLs
  isTrusted     Boolean   @default(false) // For internal system apps
  isPublic      Boolean   @default(false) // Visible in a public "Works with" directory

  // Ownership
  ownerId       String
  owner         User      @relation(fields: [ownerId], references: [id], onDelete: Cascade)

  // Relations
  tokens        OAuthToken[]
  codes         OAuthAuthCode[]
  consents      OAuthConsent[]

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([ownerId])
}

model OAuthConsent {
  id            String    @id @default(uuid())
  userId        String
  appId         String
  scopes        String[]  // Granted scopes e.g. ["user:read", "workout:read"]

  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  app           OAuthApp  @relation(fields: [appId], references: [id], onDelete: Cascade)

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@unique([userId, appId])
}

model OAuthAuthCode {
  code          String    @id @unique // High-entropy string
  appId         String
  userId        String

  redirectUri   String
  scopes        String[]
  codeChallenge String?   // PKCE support
  codeChallengeMethod String? @default("S256")

  expiresAt     DateTime

  app           OAuthApp  @relation(fields: [appId], references: [id], onDelete: Cascade)
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  createdAt     DateTime  @default(now())
}

model OAuthToken {
  id            String    @id @default(uuid())

  // Tokens
  accessToken   String    @unique // Hashed or cryptographically secure random
  refreshToken  String?   @unique

  // Expiry
  accessTokenExpiresAt  DateTime
  refreshTokenExpiresAt DateTime?

  // Context
  appId         String
  userId        String
  scopes        String[]

  app           OAuthApp  @relation(fields: [appId], references: [id], onDelete: Cascade)
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  createdAt     DateTime  @default(now())
  lastUsedAt    DateTime?
  lastIp        String?   // Audit: IP of last usage

  @@index([accessToken])
  @@index([refreshToken])
}
```

### 2.2 Audit Logging System

Since we are opening up API access, we need a robust audit log to track who did what.

```prisma
// --------------------------------------
// System Auditing
// --------------------------------------

model AuditLog {
  id            String    @id @default(uuid())
  userId        String?   // Nullable for system actions or unauthenticated attempts
  action        String    // e.g., "OAUTH_APP_CREATED", "TOKEN_REVOKED", "LOGIN_FAILED"
  resourceType  String?   // "OAuthApp", "User", "Workout"
  resourceId    String?   // ID of the affected resource

  // Context
  ipAddress     String?
  userAgent     String?
  metadata      Json?     // Detailed changes or context

  createdAt     DateTime  @default(now())

  user          User?     @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([userId])
  @@index([action])
  @@index([createdAt])
}
```

---

## 3. Scope Granularity Strategy

We will use a resource-namespaced scope system. This allows for future extensibility without breaking existing apps.

| Scope            | Description                               | Risk Level |
| :--------------- | :---------------------------------------- | :--------- |
| `profile:read`   | Read public profile and settings          | Low        |
| `profile:write`  | Update profile settings (FTP, weight)     | Medium     |
| `workout:read`   | Read workout history and details          | Low        |
| `workout:write`  | Upload new workouts (FIT files)           | Medium     |
| `health:read`    | Read daily metrics (HRV, Sleep, Weight)   | Sensitive  |
| `offline_access` | Issue Refresh Tokens for long-term access | High       |

**Format:** `resource:action` or `resource:sub-resource:action`.

---

## 4. API Endpoints Design

### 4.1 OAuth Protocol Endpoints

- **`GET /api/oauth/authorize`**
  - **Params:** `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`, `code_challenge`, `code_challenge_method`.
  - **Action:** Renders the Consent UI.
- **`POST /api/oauth/token`**
  - **Params:** `grant_type` (authorization_code | refresh_token), `code`, `redirect_uri`, `client_id`, `client_secret`, `code_verifier`.
  - **Action:** Exchanges code for tokens.
- **`POST /api/oauth/revoke`**
  - **Params:** `token`.
  - **Action:** Invalidates a token.
- **`GET /api/oauth/userinfo`**
  - **Headers:** `Authorization: Bearer <token>`
  - **Action:** Returns standard OIDC-like user claims.

### 4.2 Protected Resource API

Existing endpoints (e.g., `/api/workouts`) must be upgraded to support **Dual Authentication**:

1.  **Session Cookie:** For the Coach Watts frontend (existing).
2.  **Bearer Token:** For OAuth apps (new).

**Middleware Strategy (`server/utils/auth-guard.ts`):**
Create a unified `requireAuth(event, requiredScopes)` utility.

1. Check `getServerSession`. If valid -> User is owner (Admin scopes).
2. Check `Authorization: Bearer`.
   - Hash token, look up DB.
   - Check expiry.
   - Check if `requiredScopes` are subset of `token.scopes`.
   - Log access to `AuditLog` (async).

---

## 5. UI/UX Implementation (Nuxt UI)

### 5.1 Developer Portal (`/developer`)

Target Audience: Developers creating apps.

- **Layout:** `layouts/dashboard.vue` (reuse existing).
- **Dashboard:**
  - `UCard` per app showing Name, Client ID snippet, Users count.
  - `UButton` "Create New App".
- **Create/Edit App Form:**
  - **Name:** `UInput`
  - **Description:** `UTextarea`
  - **Homepage URL:** `UInput` (type="url")
  - **Redirect URIs:** Dynamic list input (Add/Remove rows).
  - **Logo Upload:** `UInput` (type="file").
    - On change, upload to API -> S3 -> Return URL.
  - **Visibility:** A disabled `UToggle` or read-only text field indicating the app is private by default and requires admin review to be made public.
- **Credentials Section:**
  - **Client ID:** `UInput` (readonly, copyable).
  - **Client Secret:**
    - Hidden by default.
    - `UButton` "Regenerate Secret" (Triggering a modal warning).
    - Show once in `UAlert` (color="red") upon generation.

### 5.2 Consent Screen (`/oauth/authorize`)

Target Audience: Users connecting an app.

- **Layout:** `layouts/auth.vue` (Minimal, focused).
- **Components:**
  - **Header:** Coach Watts Logo + "Connects with" + App Logo.
  - **Body:**
    - "**[App Name]** would like to access your Coach Watts account."
    - **Scope List:** `UCard` with list of permissions.
      - Icon (e.g., `i-heroicons-heart`) + "Read your heart rate data".
  - **Footer Actions:**
    - `UButton` (variant="ghost", color="red") -> "Cancel".
    - `UButton` (color="primary") -> "Authorize".

### 5.3 User Connected Apps (`/settings/security`)

- List of `OAuthConsent` records.
- `UButton` "Revoke Access" -> Deletes `OAuthConsent` and cascades to delete tokens.

---

## 6. Infrastructure & Storage (S3)

We need S3 storage for App Logos (and eventually user avatars/workout media).

**Environment Variables:**

```env
STORAGE_DRIVER=s3
S3_ENDPOINT=...
S3_REGION=...
S3_BUCKET=coach-watts-assets
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
```

**Utility (`server/utils/storage.ts`):**

- Use `unjs/h3` or AWS SDK v3.
- Implement `uploadPublicFile(file)` -> Returns public URL.

---

## 7. Development & Debugging Tools

### 7.1 Debugging

- **Request ID:** Add `x-request-id` header to all responses.
- **Error Responses:** Standardize OAuth 2.0 error JSON (e.g., `invalid_grant`, `invalid_scope`).

### 7.2 CLI Tools (`cw:cli`)

Extend the CLI for administrative tasks.

- `pnpm cw:cli oauth:create-system-app --name="Official Mobile App"`
  - Creates an app marked `isTrusted=true` (skips consent screen if needed).
- `pnpm cw:cli oauth:rotate-secret --client-id="..."`
- `pnpm cw:cli audit:tail --follow`
  - Live streams rows from `AuditLog`.

### 7.3 Example Application

Create `examples/oauth-client-demo/`:

- A minimal Nuxt app that consumes the Coach Watts API.
- Demonstrates the "Login with Coach Watts" button and Token Exchange.

---

## 8. Implementation Steps

### Phase 1: Foundation (Schema & Core)

1.  [ ] Add OAuth & Audit models to `schema.prisma`.
2.  [ ] Run migration.
3.  [ ] Implement `server/utils/s3.ts` for file uploads.
4.  [ ] Implement `server/utils/audit.ts` for logging.

### Phase 2: Developer Portal

5.  [ ] Create `/developer` pages.
6.  [ ] Implement App CRUD API (`/api/developer/apps`).
7.  [ ] Implement Logo Upload endpoint.

### Phase 3: The Protocol (Backend)

8.  [ ] Implement `GET /api/oauth/authorize` logic (validation only).
9.  [ ] Implement `POST /api/oauth/token` logic (exchange & issue).
10. [ ] Upgrade `auth` middleware to support Bearer tokens.

### Phase 4: The UI (Frontend)

11. [ ] Build the Consent Screen (`pages/oauth/authorize.vue`).
12. [ ] Connect Consent Screen to backend logic (Allow/Deny).
13. [ ] Build "Connected Apps" list in User Settings.

### Phase 5: Verification

14. [ ] Create `cw:cli oauth` commands.
15. [ ] Build Example Client App.
16. [ ] Security Audit (PKCE check, Scope leakage check).

---

## 9. Progress Tracker

- [ ] **Schema**: Models added and migrated.
- [ ] **Infra**: S3 Storage utility implemented.
- [ ] **Infra**: Audit Logger implemented.
- [ ] **UI**: Developer Portal (List/Create/Edit).
- [ ] **UI**: Consent Screen.
- [ ] **API**: Authorization Endpoint.
- [ ] **API**: Token Endpoint.
- [ ] **API**: UserInfo Endpoint.
- [ ] **Security**: Unified Auth Guard (Session + Bearer).
- [ ] **Security**: Scope validation logic.
- [ ] **Feature**: Revoke Access (User Settings).
- [ ] **Tooling**: CLI commands.
- [ ] **Docs**: API Reference for Developers.
