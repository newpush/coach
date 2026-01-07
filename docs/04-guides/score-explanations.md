# Score Explanations Implementation Guide

## Overview

This document tracks the implementation of clickable score cards with AI-generated explanations and actionable improvement guidance.

## Architecture

### Database Layer ✅ COMPLETED

- **Migration**: `20251203223300_add_score_explanations`
- **Added Fields**: 19 explanation TEXT fields across 4 tables
  - User: 4 athlete profile explanations
  - Workout: 5 workout performance explanations
  - Nutrition: 5 nutrition quality explanations
  - Report: 5 report assessment explanations

### AI Analysis Layer ✅ PARTIALLY COMPLETED

#### ✅ Completed Triggers

1. **generate-athlete-profile.ts**
   - Schema updated with explanation fields
   - Extraction code saves explanations to User table
   - Generates detailed, actionable guidance for each score

2. **analyze-workout.ts**
   - Schema updated with explanation fields
   - Extraction code saves explanations to Workout table
   - Generates specific improvement recommendations

#### 🔄 Remaining Triggers (Similar Pattern)

3. **analyze-nutrition.ts**
   - Update schema to add explanation fields
   - Update extraction code to save explanations
   - Pattern: Same as workout (5 scores + 5 explanations)

4. **generate-weekly-report.ts**
   - Update schema to add explanation fields
   - Update extraction code to save explanations
   - Pattern: Same as workout (5 scores + 5 explanations)

### API Layer 🔄 IN PROGRESS

- ✅ `server/api/scores/athlete-profile.get.ts` - Updated to select explanation fields
- ⏳ Need to update to return explanations in response
- ⏳ `server/api/scores/workout-trends.get.ts` - Need to include explanations
- ⏳ `server/api/scores/nutrition-trends.get.ts` - Need to include explanations

### UI Layer ⏳ TODO

#### Components to Create/Update

1. **ScoreDetailModal.vue** (NEW)
   - Props: title, score, explanation, color
   - Shows score with color-coded bar
   - Displays detailed explanation
   - Lists actionable improvements
   - Close button

2. **ScoreCard.vue** (UPDATE)
   - Make clickable (add @click handler)
   - Emit 'click' event with score data
   - Add cursor-pointer styling
   - Pass explanation data up

3. **Performance.vue** (UPDATE)
   - Add modal state management
   - Handle click events from ScoreCards
   - Pass explanation data to modal
   - Fetch explanations from API

## Explanation Format

### AI Generates (for each score):

```typescript
{
  score: number,        // 1-10
  explanation: string   // 2-3 sentences covering:
                       // 1. Why this score (key factors)
                       // 2. What's working / not working
                       // 3. 2-3 specific actionable improvements
}
```

### Example Explanation:

```
"Your recovery capacity scored 2/10 due to consistently low HRV
(avg 35ms, 25% below baseline) and poor sleep quality (avg 5.2 hours).
Contributing factors include training load spikes and insufficient
rest days. To improve: (1) Prioritize 8+ hours of sleep nightly,
(2) Add one full rest day per week, (3) Consider deload week every
3-4 weeks to allow adaptation."
```

## Implementation Steps

### Phase 1: Complete AI Analysis ✅ 50% DONE

- [x] Update athlete profile schema & extraction
- [x] Update workout analysis schema & extraction
- [ ] Update nutrition analysis schema & extraction
- [ ] Update report analysis schema & extraction

### Phase 2: API Updates ⏳ NEXT

- [ ] Update athlete-profile.get.ts to return explanations
- [ ] Update workout-trends.get.ts to return explanations
- [ ] Update nutrition-trends.get.ts to return explanations
- [ ] Test API responses include all data

### Phase 3: UI Components ⏳ PENDING

- [ ] Create ScoreDetailModal component
- [ ] Update ScoreCard to be clickable
- [ ] Update Performance page with modal
- [ ] Test full click-through flow

### Phase 4: Testing & Refinement ⏳ PENDING

- [ ] Regenerate athlete profile to get explanations
- [ ] Re-analyze workouts to get explanations
- [ ] Re-analyze nutrition to get explanations
- [ ] Verify modal displays correctly
- [ ] Polish styling and UX

## Usage Flow

1. User visits `/performance` page
2. Sees score cards with current scores
3. Clicks on any score card
4. Modal opens showing:
   - Score value and color-coded bar
   - Detailed explanation of why that score
   - Specific, actionable improvements
5. User understands what to focus on
6. User can track if improvements help score over time

## Database Commands

```bash
# Apply migration
npx prisma migrate dev

# Regenerate Prisma client
npx prisma generate

# Restart dev server (for API changes)
npm run dev

# Restart trigger.dev (for analysis changes)
npm run dev:trigger
```

## Testing Commands

```bash
# Regenerate athlete profile with explanations
curl -X POST http://localhost:3000/api/profile/generate

# Re-analyze a workout
curl -X POST http://localhost:3000/api/workouts/[id]/analyze

# Check if explanations are saved
tsx scripts/check-profile-scores.ts
```

## Next Steps

1. Complete remaining trigger updates (nutrition, report)
2. Update API endpoints to return explanations
3. Create ScoreDetailModal component
4. Make ScoreCards clickable
5. Wire up modal in Performance page
6. Test end-to-end flow
7. Document for users

## Benefits

- **User Clarity**: Users understand why they got each score
- **Actionable Guidance**: Specific steps to improve
- **Progress Tracking**: See how changes affect scores over time
- **Motivation**: Clear path to improvement
- **Coaching Value**: AI provides personalized coaching insights
