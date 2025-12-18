# Coaching Feature Architecture

## 1. Overview
The Coaching feature allows users to connect in a Coach-Athlete relationship. 
- **Athlete:** The user whose data is being viewed/managed.
- **Coach:** The user who gains access to the Athlete's data.
- **Relationship:** One-to-Many (One Athlete can have multiple Coaches; One Coach can have multiple Athletes).
- **Permissions:** 
    - Coaches have full view access to Athlete's data (Workouts, Nutrition, Profile, etc.).
    - Coaches can create/edit Plans and Workouts.
    - No granular permissions for now (all-or-nothing access).

## 2. Database Schema

We need to introduce a new model to track these relationships and the invitation process.

### New Model: `CoachingRelationship`
Stores the active link between a coach and an athlete.

```prisma
model CoachingRelationship {
  id        String   @id @default(uuid())
  coachId   String
  athleteId String
  
  // Status
  status    String   @default("ACTIVE") // ACTIVE, SUSPENDED
  
  // Permissions (reserved for future granular control, currently implicitly "ALL")
  permissions Json?  // e.g. { "view_workouts": true, "edit_plans": true }

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  coach     User     @relation("CoachRelation", fields: [coachId], references: [id], onDelete: Cascade)
  athlete   User     @relation("AthleteRelation", fields: [athleteId], references: [id], onDelete: Cascade)

  @@unique([coachId, athleteId])
  @@index([coachId])
  @@index([athleteId])
}
```

### New Model: `CoachingInvite`
Handles the handshake process. Since we use code-based invites (no email sending yet), the flow is:
1. **Coach** generates a unique invite code.
2. **Coach** shares code with Athlete.
3. **Athlete** enters code to accept the relationship.

Alternatively, to support the requested "Coach sends request" flow via code:
*Actually, the prompt said "Coach has read-only access to workouts. Code based invites." in the suggestions, but the user Selected "Coach can view all data... Email invites. No limits." BUT then in the follow-up text said "We don't support e-mail sending yet, what are your suggestions for 'connecting'?"*

**Revised Connection Flow (Code-based):**
1. **Athlete** generates a "Connect Coach" code in their settings.
2. **Athlete** shares this code with their Coach.
3. **Coach** enters the code in their "My Athletes" dashboard.
4. System validates code and creates `CoachingRelationship`.

```prisma
model CoachingInvite {
  id        String   @id @default(uuid())
  athleteId String   // The user issuing the invite (The Athlete)
  code      String   @unique // Short alphanumeric code (e.g., "TR-8821")
  
  expiresAt DateTime
  
  usedBy    String?  // ID of the Coach who used it (optional, mostly for audit)
  status    String   @default("PENDING") // PENDING, ACCEPTED, EXPIRED

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  athlete   User     @relation(fields: [athleteId], references: [id], onDelete: Cascade)
  
  @@index([code])
}
```

### Updates to `User` Model
Add the reverse relations.

```prisma
model User {
  // ... existing fields
  
  // Coaching Relations
  coaches    CoachingRelationship[] @relation("AthleteRelation")
  athletes   CoachingRelationship[] @relation("CoachRelation")
  invites    CoachingInvite[]
}
```

## 3. API Endpoints

### For Athletes (Managing their Coaches)
- `GET /api/coaching/coaches` - List my coaches.
- `DELETE /api/coaching/coaches/:id` - Remove a coach.
- `POST /api/coaching/invite` - Generate a new invite code.
- `GET /api/coaching/invite` - Get active invite code.

### For Coaches (Managing their Athletes)
- `GET /api/coaching/athletes` - List my athletes.
- `POST /api/coaching/athletes/connect` - Connect using a code (Body: `{ code: "..." }`).
- `DELETE /api/coaching/athletes/:id` - Remove an athlete.

## 4. "Acting As" Context Switching Mechanism

To allow a Coach to view the App *as* the Athlete, we need a mechanism to switch the data context without logging out.

### Strategy: `x-act-as-user` Header
1. **Frontend:** When a Coach selects an Athlete from their dashboard, the App stores the `athleteId` in a Pinia state (e.g., `useCoachingStore`).
2. **Middleware/Interceptors:** A Nuxt plugin/interceptor adds an `x-act-as-user: <athleteId>` header to all API requests if this state is active.
3. **Backend Middleware (`server/middleware/coaching.ts`):**
   - Intercepts requests.
   - Checks for `x-act-as-user` header.
   - Verifies if the authenticated user (`event.context.user.id`) has a valid `CoachingRelationship` with the target `athleteId`.
   - If valid, **swaps** `event.context.user` or adds a specialized `event.context.viewingUser` property.
   - existing API endpoints (like `workouts/index.get.ts`) generally use `session.user.id`. We might need to update them to prefer `event.context.viewingUser.id` if present.

**Refactoring Backend Utilities:**
To avoid rewriting every endpoint, we can create a helper:
`getUserContext(event)` -> returns the `User` object to use for data queries.
- Default: Returns logged-in user.
- If "Acting As": Returns the Athlete user (after permission check).

## 5. UI/UX

### Coach Dashboard (`/coaching`)
- **Athletes List:** Cards/List of connected athletes with summary stats (Last workout, Compliance score).
- **"Add Athlete" Button:** Opens modal to enter Invite Code.
- **Context Switch:** Clicking an athlete enters "Coaching Mode".
- **Coaching Mode Indicator:** A persistent banner at the top of the screen: "You are viewing [Athlete Name]'s profile. [Exit]".

### Athlete Settings (`/settings/coaches`)
- **My Coaches:** List of active coaches with "Remove" button.
- **Invite Coach:** "Generate Code" button. Displays large code (e.g., "X7Y-99A") with copy button.

## 6. Implementation Steps

1. **Schema:** Update `schema.prisma` and run migrations.
2. **Backend:** Implement `CoachingRelationship` logic and API endpoints.
3. **Middleware:** Implement the "Context Switching" server middleware and helper utilities.
4. **Refactor:** Update key data endpoints (`workouts`, `nutrition`, `profile`) to use the context-aware user ID.
5. **Frontend (Store):** Create `coaching` store to manage "Acting As" state.
6. **Frontend (Pages):** Build `/coaching` dashboard and `/settings/coaches` page.
7. **Frontend (Global):** Add "Coaching Mode" banner and API interceptor.
