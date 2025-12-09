# Goals Feature Improvement Plan

## Overview
This document outlines the comprehensive improvement plan for the Goals feature on `/profile/settings`. The goals feature allows users to set and track fitness goals across four categories: Body Composition, Event Preparation, Performance, and Consistency.

## Current Implementation

### Files
- [`app/pages/profile/settings.vue`](../app/pages/profile/settings.vue) - Main settings page with tabs
- [`app/components/profile/GoalsSettings.vue`](../app/components/profile/GoalsSettings.vue) - Goals tab container
- [`app/components/goals/GoalCard.vue`](../app/components/goals/GoalCard.vue) - Individual goal display
- [`app/components/goals/GoalWizard.vue`](../app/components/goals/GoalWizard.vue) - Goal creation wizard
- [`server/api/goals/index.get.ts`](../server/api/goals/index.get.ts) - Fetch goals API
- [`server/api/goals/index.post.ts`](../server/api/goals/index.post.ts) - Create goal API
- [`server/api/goals/[id].delete.ts`](../server/api/goals/[id].delete.ts) - Delete goal API

### Database Schema
The `Goal` model includes:
- Basic fields: id, userId, type, title, description
- Metrics: metric, currentValue, targetValue, startValue
- Dates: targetDate, eventDate, createdAt, updatedAt
- Status: status (ACTIVE/COMPLETED/ARCHIVED), priority (LOW/MEDIUM/HIGH)
- AI Context: aiContext field for AI integration

### Current Capabilities
- Create goals across 4 types
- View goals as cards with basic info
- Delete goals
- Progress bar for weight goals only
- Basic priority and date badges

### Current Limitations
- No editing functionality
- No progress updates after creation
- Status field unused in UI
- Limited progress visualization
- No filtering or sorting
- Browser confirm() for deletion
- No milestone tracking
- No analytics or insights

## Priority 1: Critical Functionality Gaps

### 1. Goal Editing Capability
**Problem**: Users can only create and delete goals, not edit them. Changes require deleting and recreating the goal.

**Solution**:
- Add "Edit Goal" option to GoalCard dropdown menu
- Modify GoalWizard to accept existing goal data as prop
- Add edit mode state in wizard
- Create PATCH endpoint: `server/api/goals/[id].patch.ts`

**Implementation**:
```typescript
export default defineEventHandler(async (event) => {
  const id = event.context.params?.id
  const body = await readBody(event)
  const session = await getServerSession(event)
  
  const goal = await prisma.goal.update({
    where: { id },
    data: { ...body, updatedAt: new Date() }
  })
  
  return { success: true, goal }
})
```

### 2. Progress Updates
**Problem**: `currentValue` is set at creation but never updated, making progress bars stale.

**Solution**:
- Add "Update Progress" button/modal to GoalCard
- Create quick-update component for numeric goals
- Auto-sync where possible:
  - Weight goals from nutrition data
  - FTP from power workouts
  - Pace from run activities
  - Weekly hours from workout totals

**Implementation**:
- New component: `GoalProgressModal.vue`
- New API endpoint: `server/api/goals/[id]/progress.patch.ts`
- Background job to auto-detect metric improvements

### 3. Goal Status Management
**Problem**: Status field exists but is not used in UI. Can't distinguish active from completed goals.

**Solution**:
- Add status filter tabs in GoalsSettings (Active, Completed, Archived)
- Add "Mark Complete" action to GoalCard
- Show completion celebration modal with achievement stats
- Display completion date and time to achieve

**UI Changes**:
```vue
<UTabs :items="statusTabs" v-model="activeStatus">
  <template #active>Active goals</template>
  <template #completed>Completed goals</template>
  <template #archived>Archived goals</template>
</UTabs>
```

### 4. Visual Progress for All Goal Types
**Problem**: Only weight goals show progress bar. Other goal types lack visual feedback.

**Solution**:
- **EVENT**: Circular progress showing days remaining (countdown)
- **PERFORMANCE**: Linear progress bar for metric improvement (start → current → target)
- **CONSISTENCY**: Weekly streak visualization or calendar heatmap
- **BODY_COMPOSITION**: Enhanced progress bar with milestone markers

**Components to Create**:
- `EventCountdown.vue` - Circular countdown timer
- `PerformanceProgress.vue` - Enhanced progress bar with zones
- `ConsistencyStreak.vue` - Streak calendar/heatmap

## Priority 2: UX Improvements

### 5. Enhanced Goal Cards
**Current State**: Minimal information display

**Improvements**:
- Expandable details section
- Recent updates/milestones timeline
- AI coaching tips specific to goal
- Quick actions bar (edit, update, share)
- Better mobile responsiveness
- Goal preview before expanding

### 6. Wizard Improvements
**Current Issues**:
- No visual progress indicator
- Mock AI suggestions
- Limited validation
- No templates

**Enhancements**:
- Visual step indicator (1 of 2, 2 of 2)
- Real AI-powered goal suggestions using user data
- Smart validation:
  - Realistic weight loss rates (0.5-1kg/week)
  - Achievable performance improvements
  - Appropriate training volumes
- Goal templates for common scenarios
- Better field help text with examples
- "Save as Draft" option
- Goal conflict detection

### 7. Filtering & Organization
**Add to GoalsSettings**:
- Filter by:
  - Goal type (multi-select)
  - Priority level
  - Status
  - Timeline (overdue, this week, this month)
- Sort by:
  - Due date
  - Priority
  - Creation date
  - Progress percentage
  - Type
- Search by title/description
- Group view options (by type, by timeline)

### 8. Modern Confirmation Dialogs
**Problem**: Uses browser `confirm()` function

**Solution**: 
Replace with UModal for consistent, branded experience

## Priority 3: Advanced Features

### 9. Milestone System
**Purpose**: Break large goals into manageable steps

**Features**:
- Multiple milestones per goal
- Visual timeline of milestones
- Celebrate milestone achievements
- Auto-suggest milestones for common goals

**Database Schema Addition**:
```prisma
model GoalMilestone {
  id          String   @id @default(uuid())
  goalId      String
  title       String
  description String?
  targetValue Float?
  targetDate  DateTime?
  completed   Boolean  @default(false)
  completedAt DateTime?
  order       Int      @default(0)
  
  goal        Goal     @relation(fields: [goalId], references: [id], onDelete: Cascade)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([goalId])
}
```

### 10. Goal Analytics Dashboard
**New Component**: `GoalsDashboard.vue`

**Metrics to Display**:
- Overall completion rate (% of goals completed)
- Goals by type (pie/donut chart)
- Progress trends over time (line chart)
- Average time to completion by type
- Success patterns and insights
- Most improved metrics
- Goal difficulty analysis

### 11. Smart Goal Integration
**AI-Powered Features**:
- Auto-suggest goals based on:
  - Recent fitness profile
  - Training consistency patterns
  - Current metrics (FTP, weight, etc.)
  - Upcoming events in calendar
- Detect goal conflicts:
  - Weight loss + performance gain
  - Volume increases too rapid
  - Multiple A-priority goals
- Recommend adjustments based on:
  - Actual vs expected progress
  - Training consistency
  - Recovery capacity
- Chat AI coach integration for goal guidance

### 12. Automated Progress Tracking
**Auto-Update Logic**:

**Body Composition**:
- Sync from Nutrition entries (weight field)
- Sync from Wellness data (if integrated)
- Update daily when new data available

**Performance**:
- FTP: Detect from power workout maxes
- VO2 Max: Calculate from running data
- Pace: Track best times from runs
- Update after significant workout completions

**Consistency**:
- Auto-track from workout frequency
- Calculate weekly hours/TSS automatically
- Update in real-time as workouts complete

### 13. Goal Templates Library
**Pre-configured Templates**:

1. **Marathon Training**
   - Type: EVENT
   - Milestones: Base building, peak weeks, taper
   - Timeline: 16-20 weeks
   
2. **Weight Loss**
   - Type: BODY_COMPOSITION
   - Healthy rate: 0.5kg/week
   - Milestones: Every 5kg
   
3. **FTP Improvement**
   - Type: PERFORMANCE
   - Target: 5-10% increase
   - Timeline: 8-12 weeks
   
4. **Training Consistency**
   - Type: CONSISTENCY
   - Target: 5 workouts/week
   - Streak tracking

## Priority 4: Polish & Engagement

### 14. Achievement System
**Features**:
- Badges for goal completion
- Special badges for streaks, challenges
- Achievement showcase on profile
- Social sharing capabilities
- Confetti animation on completion

**Badge Types**:
- First Goal Completed
- 5 Goals Completed
- 30-Day Streak
- Event Finisher
- Performance Breakthrough
- Consistency Champion

### 15. Goal Insights & Recommendations
**AI-Generated Content**:
- Weekly progress insights
- Pace analysis (ahead/behind schedule)
- Adjustment recommendations
- Motivational messages
- Warning alerts if falling behind
- Celebration when ahead

### 16. Visual Enhancements
**Improvements**:
- Animated progress bars
- Goal type color coding (already good, enhance)
- Illustrations for empty states
- Micro-interactions (hover effects, transitions)
- Dark mode optimization
- Responsive animations
- Loading states (skeletons already exist)

### 17. Goal History & Archive
**Features**:
- View completed goals with stats
- Archive old goals without deleting
- Reactivate archived goals
- Export goal history to CSV/PDF
- Year-in-review summary
- Goal timeline visualization

## Implementation Phases

### Phase 1: Essential (1-2 weeks)
**Focus**: Core functionality that makes feature usable

1. **Goal Editing** (2 days)
   - Add edit button to GoalCard
   - Modify GoalWizard for edit mode
   - Create PATCH API endpoint
   - Add validation

2. **Progress Updates** (2 days)
   - Create progress update modal
   - Add update API endpoint
   - Implement quick-update UI
   - Add update history tracking

3. **Status Management** (1 day)
   - Add status filter tabs
   - Implement mark complete action
   - Add completion modal
   - Update API to filter by status

4. **Enhanced Progress Visualization** (2 days)
   - EVENT countdown component
   - PERFORMANCE progress bar
   - CONSISTENCY streak calendar
   - Update GoalCard to use new components

### Phase 2: Enhanced UX (1-2 weeks)
**Focus**: Better user experience and usability

5. **Enhanced Goal Cards** (2 days)
6. **Wizard Improvements** (2 days)
7. **Filtering & Organization** (2 days)
8. **Modern Dialogs** (1 day)

### Phase 3: Advanced Features (2-3 weeks)
**Focus**: Power features and automation

9. **Milestone System** (3 days)
10. **Analytics Dashboard** (3 days)
11. **Automated Progress Tracking** (3 days)
12. **Smart AI Suggestions** (3 days)

### Phase 4: Engagement (1-2 weeks)
**Focus**: Keep users motivated and engaged

13. **Goal Templates** (2 days)
14. **Achievement System** (2 days)
15. **AI Insights** (2 days)
16. **Visual Polish** (2 days)

## Database Schema Changes

### New Models

```prisma
model GoalMilestone {
  id          String   @id @default(uuid())
  goalId      String
  title       String
  description String?
  targetValue Float?
  targetDate  DateTime?
  completed   Boolean  @default(false)
  completedAt DateTime?
  order       Int      @default(0)
  
  goal        Goal     @relation(fields: [goalId], references: [id], onDelete: Cascade)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([goalId])
}

model GoalUpdate {
  id          String   @id @default(uuid())
  goalId      String
  value       Float
  previousValue Float?
  note        String?
  source      String   @default("MANUAL")
  
  goal        Goal     @relation(fields: [goalId], references: [id], onDelete: Cascade)
  createdAt   DateTime @default(now())
  
  @@index([goalId, createdAt])
}

model GoalAchievement {
  id          String   @id @default(uuid())
  userId      String
  goalId      String?
  type        String
  title       String
  description String?
  badgeIcon   String?
  earnedAt    DateTime @default(now())
  
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  goal        Goal?    @relation(fields: [goalId], references: [id], onDelete: SetNull)
  
  @@index([userId])
}
```

### Goal Model Updates

```prisma
model Goal {
  completedAt   DateTime?
  archivedAt    DateTime?
  lastUpdatedBy String?
  updateCount   Int      @default(0)
  
  milestones    GoalMilestone[]
  updates       GoalUpdate[]
  achievements  GoalAchievement[]
}
```

## API Endpoints to Create

### Goal Management
- `PATCH /api/goals/[id]` - Update goal details
- `PATCH /api/goals/[id]/status` - Update goal status
- `PATCH /api/goals/[id]/progress` - Update goal progress
- `POST /api/goals/[id]/complete` - Mark goal as complete
- `POST /api/goals/[id]/archive` - Archive goal

### Milestones
- `GET /api/goals/[id]/milestones` - List milestones
- `POST /api/goals/[id]/milestones` - Create milestone
- `PATCH /api/goals/[id]/milestones/[milestoneId]` - Update milestone
- `DELETE /api/goals/[id]/milestones/[milestoneId]` - Delete milestone
- `POST /api/goals/[id]/milestones/[milestoneId]/complete` - Complete milestone

### Analytics
- `GET /api/goals/analytics` - Goal analytics data
- `GET /api/goals/insights` - AI-generated insights

### Templates
- `GET /api/goals/templates` - List goal templates
- `POST /api/goals/from-template` - Create goal from template

## Success Metrics

### User Engagement
- % of users who create goals
- Average goals per user
- Goal completion rate
- Time to first goal
- Return rate to goals page

### Feature Usage
- Edit vs create ratio
- Manual vs auto updates
- Filter usage
- Template adoption
- Achievement unlocks

## Future Enhancements
- Social goal sharing
- Coach-athlete goal collaboration
- Recurring goals (weekly, monthly)
- Custom goal types
- Goal recommendations from coach
- Integration with third-party apps
- Goal-based training plan generation
- Predictive completion dates using ML

---

**Last Updated**: 2025-12-09
**Status**: Planning & Documentation Complete
**Next Steps**: Begin Phase 1 implementation