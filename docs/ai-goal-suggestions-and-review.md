# AI Goal Suggestions and Review Feature

## Overview
This document describes the AI-powered goal suggestion and review features for the `/profile/goals` page. These features use Gemini AI to analyze the athlete's profile, workouts, and performance data to suggest achievable goals and review existing goals for rationality and achievability.

## Features

### 1. AI Goal Suggestions
Analyzes the athlete's complete profile to suggest personalized, achievable goals.

**What it analyzes:**
- Athlete profile scores (fitness, recovery, nutrition, training consistency)
- Recent workout data (last 30 days)
- Recovery and wellness metrics
- Existing active goals
- Recent reports and performance trends

**What it provides:**
- 3-5 suggested goals across different types
- Clear rationale for each suggestion
- Priority levels (HIGH, MEDIUM, LOW)
- Difficulty assessment (easy, moderate, challenging, very_challenging)
- Specific targets with current and target values
- Prerequisites and success indicators
- Timing considerations (immediate, near-term, future)
- Potential goal conflicts

### 2. Goal Review
Reviews existing active goals for rationality, achievability, and alignment with athlete profile.

**What it analyzes:**
- All active goals with their current progress
- Alignment with athlete's profile and capabilities
- Goal conflicts and resource competition
- Progress rates and timeline feasibility
- Balance across goal types

**What it provides:**
- Overall assessment (goal balance, alignment rating)
- Individual reviews for each goal
- Assessment categories: realistic, slightly_ambitious, too_ambitious, too_conservative, needs_adjustment
- Progress analysis when metrics available
- Specific recommendations for improvement
- Suggested adjustments (target, date, priority)
- Risk identification
- Action plan with immediate steps

## Implementation

### Backend Components

#### Triggers
1. **`trigger/suggest-goals.ts`** - Goal suggestions task
   - Uses `userReportsQueue` for per-user concurrency
   - Max duration: 300 seconds
   - Generates structured JSON output via Gemini Flash

2. **`trigger/review-goals.ts`** - Goal review task
   - Uses `userReportsQueue` for per-user concurrency
   - Max duration: 300 seconds
   - Analyzes active goals with detailed feedback

#### API Endpoints
1. **`POST /api/goals/suggest`**
   - Triggers goal suggestion generation
   - Returns job ID for polling
   - Uses per-user concurrency key

2. **`POST /api/goals/review`**
   - Triggers goal review for active goals
   - Validates user has active goals first
   - Returns job ID for polling

### Frontend Components

#### Updated Files
- **`app/pages/profile/goals.vue`** - Enhanced with AI features

#### New UI Elements
1. **AI Feature Buttons**
   - "AI Suggest Goals" button - triggers suggestion generation
   - "Review Goals" button - triggers goal review (only shown if active goals exist)

2. **Suggestions Panel**
   - Collapsible card showing AI-generated suggestions
   - Loading state with spinner and skeleton
   - Executive summary of athlete's goal readiness
   - Individual suggestion cards with:
     - Priority, type, and difficulty badges
     - Title and description
     - Rationale (why this goal)
     - Target metrics and timeframe
     - Prerequisites list
     - "Accept" button to create goal from suggestion

3. **Review Panel**
   - Collapsible card showing goal review results
   - Loading state with analysis message
   - Overall assessment with badges
   - Key concerns highlighted
   - Individual goal reviews with:
     - Assessment badge (color-coded)
     - Progress analysis
     - Recommendations list
     - Risk warnings
   - Action plan section with immediate actions

## Data Flow

### Goal Suggestions Flow
```
User clicks "AI Suggest Goals"
    ↓
POST /api/goals/suggest
    ↓
Triggers suggest-goals task with userId
    ↓
Task fetches:
  - User profile & scores
  - Recent workouts (30 days)
  - Wellness data
  - Nutrition data
  - Existing goals
  - Recent reports
    ↓
Builds comprehensive prompt
    ↓
Calls Gemini Flash with structured schema
    ↓
Returns structured suggestions JSON
    ↓
Frontend polls for completion
    ↓
Displays suggestions in UI
    ↓
User can accept suggestions to create goals
```

### Goal Review Flow
```
User clicks "Review Goals"
    ↓
POST /api/goals/review
    ↓
Validates active goals exist
    ↓
Triggers review-goals task with userId
    ↓
Task fetches:
  - User profile & scores
  - All active goals with metrics
  - Recent training data
  - Recovery trends
  - Athlete profile report
    ↓
Analyzes each goal for:
  - Realism
  - Alignment with profile
  - Progress rate
  - Conflicts
  - Timing appropriateness
    ↓
Calls Gemini Flash with structured schema
    ↓
Returns structured review JSON
    ↓
Frontend polls for completion
    ↓
Displays review results in UI
```

## JSON Schemas

### Goal Suggestions Schema
```typescript
{
  type: "goal_suggestions",
  generated_date: string,
  executive_summary: string,
  suggested_goals: [
    {
      type: "BODY_COMPOSITION" | "EVENT" | "PERFORMANCE" | "CONSISTENCY",
      title: string,
      description: string,
      rationale: string,
      priority: "HIGH" | "MEDIUM" | "LOW",
      metric: string,
      currentValue: number,
      targetValue: number,
      targetDate: string,
      timeframe_weeks: number,
      difficulty: "easy" | "moderate" | "challenging" | "very_challenging",
      prerequisites: string[],
      success_indicators: string[]
    }
  ],
  timing_considerations: {
    immediate: string[],
    near_term: string[],
    future: string[]
  },
  goal_conflicts: [
    {
      goals: string[],
      conflict: string,
      resolution: string
    }
  ]
}
```

### Goal Review Schema
```typescript
{
  type: "goal_review",
  generated_date: string,
  overall_assessment: {
    summary: string,
    goal_balance: "well_balanced" | "needs_rebalancing" | "too_ambitious" | "too_conservative",
    alignment_with_profile: "excellent" | "good" | "fair" | "poor",
    key_concerns: string[]
  },
  goal_reviews: [
    {
      goalId: string,
      title: string,
      assessment: "realistic" | "slightly_ambitious" | "too_ambitious" | "too_conservative" | "needs_adjustment",
      rationale: string,
      progress_analysis: string,
      recommendations: string[],
      suggested_adjustments: {
        targetValue?: number,
        targetDate?: string,
        priority?: "HIGH" | "MEDIUM" | "LOW",
        reasoning: string
      },
      risks: string[],
      support_needed: string[]
    }
  ],
  goal_conflicts: [
    {
      goals: string[],
      conflict_type: "direct_conflict" | "resource_competition" | "timeline_overlap" | "recovery_concern",
      description: string,
      severity: "critical" | "moderate" | "minor",
      resolution_options: string[]
    }
  ],
  missing_areas: [
    {
      area: string,
      importance: "high" | "medium" | "low",
      suggestion: string
    }
  ],
  action_plan: {
    immediate_actions: string[],
    goals_to_adjust: string[],
    goals_to_pause: string[],
    new_goals_to_consider: string[]
  }
}
```

## Setup Instructions

### 1. Database Migration
The Goal model already exists in the schema. No migration needed.

### 2. Prisma Client Generation
```bash
npx prisma generate
```

### 3. Deploy Trigger Tasks
```bash
npx trigger.dev@latest deploy
```

### 4. Environment Variables
Ensure these are set:
```
GEMINI_API_KEY=your_gemini_api_key
TRIGGER_PROJECT_REF=your_trigger_project_ref
DATABASE_URL=your_database_url
```

## Usage

### For Users

1. **Navigate to Goals Page**
   - Go to `/profile/goals`

2. **Generate Suggestions**
   - Click "AI Suggest Goals" button
   - Wait for analysis to complete (30-60 seconds)
   - Review suggested goals with rationales
   - Click "Accept" on any suggestion to create it as a goal

3. **Review Existing Goals**
   - Ensure you have at least one active goal
   - Click "Review Goals" button
   - Wait for analysis to complete (30-60 seconds)
   - Review feedback on each goal
   - Follow action plan recommendations

### For Developers

#### Testing Locally
```bash
# Start dev server
npm run dev

# In separate terminal, start Trigger.dev dev
npx trigger.dev@latest dev
```

#### Customizing Prompts
Edit the prompt strings in:
- `trigger/suggest-goals.ts` - Line ~460
- `trigger/review-goals.ts` - Line ~180

#### Adjusting Schemas
Modify the JSON schemas at the top of each trigger file:
- `goalSuggestionsSchema` in `suggest-goals.ts`
- `goalReviewSchema` in `review-goals.ts`

## Cost Considerations

- Both features use Gemini Flash (cost-effective model)
- Typical suggestion generation: ~5,000-10,000 tokens
- Typical goal review: ~3,000-8,000 tokens
- Estimated cost per operation: $0.001-0.005

## Future Enhancements

1. **Persistent Storage**
   - Store suggestions and reviews in database
   - Allow viewing history of suggestions
   - Track which suggestions were accepted

2. **Real-time Updates**
   - WebSocket connection for live updates
   - Remove polling mechanism
   - Instant feedback on completion

3. **Goal Templates**
   - Convert popular suggestions into templates
   - Allow users to browse and use templates
   - Community-shared goal templates

4. **Smart Notifications**
   - Notify when new suggestions are available
   - Alert when goals need review
   - Remind to update progress

5. **Integration with Training Plans**
   - Link goals to specific training plans
   - Suggest goals based on upcoming plan milestones
   - Auto-adjust goals based on plan changes

## Related Documentation

- [Goals Feature Overview](./goals.md)
- [Gemini Integration](./GEMINI.md)
- [Trigger.dev Tasks](./trigger-queue-concurrency.md)
- [Athlete Profile Generation](./architecture.md#athlete-profile)

## Last Updated
2025-12-09