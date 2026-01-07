# Goal-Driven Training Plan Architecture

## 1. Overview

This document outlines the architecture for a "Goal-Driven Training Plan" system. The core concept is that a user's **Goal** (specifically an **Event**) should be the primary configuration source for their **Training Plan**. Instead of generic "fitness maintenance", the AI will generate workouts specifically tailored to the demands of a target race (e.g., a hilly Grandfondo requires different preparation than a flat Criterium).

## 2. User Journey (Wizard Flow)

We will introduce a "Create Training Plan" wizard that guides the user through setting up their primary goal.

### Step 1: Goal Type Selection

"What are you training for?"

- **Target Event** (Race, Sportive, Gran Fondo)
- **Fitness Improvement** (Increase FTP, Weight Loss, General Fitness)
- **Specific Skill** (Climbing, Sprinting, Endurance)

### Step 2: Event Details (If "Target Event" selected)

"Tell us about your race"

- **Event Source:**
  - _Select from Calendar:_ Pick an existing event synced from Intervals.icu or Strava.
  - _Create New:_ Manually enter details.
- **Event Name:** (e.g., "Maratona dles Dolomites")
- **Event Date:** (Date picker)
- **Event Type:**
  - _Cycling:_ Road Race, Criterium, Time Trial, Gran Fondo, MTB (XC), MTB (Marathon), Cyclocross, Gravel
  - _Running:_ 5k, 10k, Half Marathon, Marathon, Ultra
  - _Triathlon:_ Sprint, Olympic, 70.3, Full Distance
- **Race Priority:** A (Key Race), B (Preparation Race), C (Training Race)

### Step 3: Course Profile (Crucial for AI Context)

"What is the course like?"

- **Distance:** (km/miles)
- **Elevation Gain:** (m/ft)
- **Expected Duration:** (hh:mm)
- **Terrain Type:** Flat, Rolling, Hilly, Mountainous, Technical (for MTB)
- **Key Segments:** (Optional - e.g., "30min climb at 8%")

### Step 4: Training Phase & Approach (New)

"How should we structure your training?"

- **AI Recommendation:** The system analyzes the timeline (e.g., 12 weeks to race) and suggests: "Based on your timeline, you should be in the **Base Phase**."
- **User Override:** "I want to start in Build Phase" or "I'm just maintaining right now."
- **Phase Selection:**
  - _Base:_ Focus on aerobic endurance and fundamental skills.
  - _Build:_ Increasing specificity and intensity (e.g., threshold, VO2max).
  - _Specialty/Peak:_ Race-specific simulation and tapering.
  - _Transition/Off-Season:_ Unstructured, fun riding.

### Step 5: Training Availability & Preferences

"When can you train?"

- **Weekly Schedule:** (Mon-Sun: Available time slots)
- **Volume Preference:** Low (3-5h), Mid (6-9h), High (10h+)
- **Indoor/Outdoor:** Preference ratio

## 3. Data Model Strategy

### 3.1. Leveraging the Existing `Goal` Model

We will use the existing `Goal` model in `prisma/schema.prisma` but formalize how we store the rich metadata in the `aiContext` or a new `metadata` JSON field.

**Current Model:**

```prisma
model Goal {
  id          String   @id @default(uuid())
  type        String   // "EVENT", "PERFORMANCE", "CONSISTENCY" (We will use "EVENT")
  eventType   String?  // "Grandfondo", "MTB", etc.
  eventDate   DateTime?
  metric      String?  // "distance", "elevation"
  targetValue Float?
  aiContext   String?  @db.Text // We will store the rich profile description here
  // ...
}
```

**Proposed Utilization:**

- `type`: "EVENT"
- `eventType`: "Gran Fondo" (or specific sub-type)
- `eventDate`: The race date
- `aiContext`: A structured natural language summary for the AI.
  _Example:_ "Targeting Maratona dles Dolomites. Distance: 138km. Elevation: 4230m. Terrain: Mountainous. Key demand: Long sustained climbs at threshold and tempo. Estimated duration: 6h 30m."

### 3.2. Integration with `WeeklyTrainingPlan`

The `WeeklyTrainingPlan` generation task (`trigger/generate-weekly-plan.ts`) is already set up to read active goals. We need to enhance the **Prompt Engineering** in this task.

**Current Prompt Logic:**

- Fetches active goals.
- Appends basic goal info (`title`, `type`, `targetValue`).

**Enhanced Prompt Logic:**

- Detect if an "A-Priority" Event Goal exists.
- If yes, calculate **Phasing** (Base, Build, Peak, Taper) based on `weeksToEvent`.
- Inject specific **Workout Focus** instructions based on `eventType` and `aiContext`.
  - _Example (Gran Fondo):_ "Focus on muscular endurance and sweet spot intervals to prepare for 4000m of climbing."
  - _Example (Crit):_ "Focus on high-intensity VO2max repeats and anaerobic capacity for repeated surges."

### 3.3. Linking Planned Workouts/Events to Goals

We need to handle events synced from external platforms (Intervals.icu).

- **PlannedWorkout** model already has `category="EVENT"`.
- We can link a `Goal` to a `PlannedWorkout` (Event) via a new relation or just implicitly by `eventDate`.
- **Strategy:** When creating a Goal, search `PlannedWorkout`s where `category='EVENT'` and offer to link them.
  - If user selects an Intervals.icu event, we auto-fill the Goal details (Date, Title, maybe Distance/Vert if in description).

## 4. System Architecture (Mermaid)

```mermaid
graph TD
    User[User] -->|Starts Wizard| UI[Plan Wizard (Vue)]

    subgraph "Event Selection"
        UI -->|Fetch Events| Intervals[Intervals.icu / DB Events]
        Intervals -->|Select Existing| EventDetails
        UI -->|Create New| EventDetails[Event Details & Profile]
    end

    EventDetails -->|Suggest Phase| PhaseLogic[Phase Calculation]
    PhaseLogic -->|User Confirms/Edits| PhaseDef[Training Phase]

    EventDetails & PhaseDef -->|Submit| API[API Endpoint]

    API -->|Save| DB_Goal[(DB: Goal Table)]
    API -->|Save| DB_Avail[(DB: TrainingAvailability Table)]

    DB_Goal -->|Trigger| Job[Background Job: Generate Plan]

    Job -->|Fetch| Context[AI Context Builder]
    Context -->|Read Goal & Profile| Prompt[Prompt Engineering]
    Context -->|Read Phase Preference| PhasePrompt[Phase Logic]

    Prompt & PhasePrompt -->|Send Request| LLM[Gemini Pro]

    LLM -->|Generate Workouts| JSON[Structured Plan JSON]
    JSON -->|Save| DB_Plan[(DB: WeeklyTrainingPlan)]

    DB_Plan -->|Display| User
```

## 5. Implementation Plan

### Phase 1: Enhanced Goal Wizard

- Create `components/goals/EventGoalWizard.vue`.
- Implement steps for Event Details and Course Profile.
- **New:** Add "Select from Calendar" step to pick existing `PlannedWorkout` (Event).
- **New:** Add "Training Phase" step with auto-suggestion and manual override.
- Save rich context to `Goal.aiContext`.

### Phase 2: Intelligent Prompting

- Modify `trigger/generate-weekly-plan.ts`.
- Add a helper `calculateTrainingPhase(eventDate)` to determine if the user should be in Base, Build, or Specialty.
- **New:** Respect the user's manual phase override if stored in the Goal or Plan settings.
- Add a helper `getEventDemands(eventType, profile)` to generate specific prompt instructions.

### Phase 3: Plan Visualization

- Update `app/pages/plan.vue` to show the "Active Goal" prominently at the top.
- Show the current "Training Phase" (e.g., "Build Phase - 8 Weeks to Race").

## 6. Key Considerations

- **Flexibility:** The user can still edit the generated plan.
- **Dynamic Updates:** If the user misses workouts, the next week's generation will adapt (existing functionality via `recentWorkouts` analysis).
- **Multi-Sport:** The schema supports `workoutType`, so we can generate "Run" or "Swim" workouts if the Event Type is Triathlon (future proofing).
