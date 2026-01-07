# AI Chat Feature Documentation

## Overview

The Chat with Coach Watts feature allows users to have an interactive conversation with an AI-powered coaching assistant. It leverages Google Gemini for generating responses based on the user's context and conversation history.

## Architecture

The chat system is built using the following components:

- **Frontend**: `vue-advanced-chat` component for the UI (client-side only).
- **Backend**: Nuxt server API endpoints (`/api/chat/...`).
- **Database**: PostgreSQL with Prisma ORM for storing chat history.
- **AI**: Google Gemini (via `@google/generative-ai` SDK) for response generation.

## Database Schema

Three main models support the chat system:

1.  **ChatRoom**: Represents a conversation thread.
    - `id`: UUID
    - `name`: Room name (e.g., "Coach Watts")
    - `avatar`: Room avatar URL
    - `users`: Relation to participants
    - `messages`: Relation to messages

2.  **ChatParticipant**: Links users to rooms.
    - `userId`: Foreign key to User
    - `roomId`: Foreign key to ChatRoom
    - `lastSeen`: Timestamp for read status

3.  **ChatMessage**: Individual messages.
    - `content`: Text content
    - `senderId`: User ID or 'ai_agent' for the bot
    - `roomId`: Foreign key to ChatRoom
    - `seen`: JSON map of user IDs to timestamps
    - `createdAt`: Timestamp

## API Endpoints

### 1. Fetch Rooms

- **Endpoint**: `GET /api/chat/rooms`
- **Purpose**: Retrieves all chat rooms for the current user.
- **Response**: Array of room objects formatted for `vue-advanced-chat`.
- **Logic**: If no rooms exist, it automatically creates a default "Coach Watts" room.

### 2. Create Room

- **Endpoint**: `POST /api/chat/rooms`
- **Purpose**: Creates a new chat room.
- **Response**: The new room object formatted for `vue-advanced-chat`.

### 3. Fetch Messages

- **Endpoint**: `GET /api/chat/messages`
- **Query Params**: `roomId` (required)
- **Purpose**: Retrieves message history for a specific room.
- **Response**: Array of message objects formatted for `vue-advanced-chat`.

### 4. Send Message

- **Endpoint**: `POST /api/chat/messages`
- **Body**: `{ roomId, content, files, replyMessage }`
- **Purpose**:
  1.  Saves the user's message to the database.
  2.  Fetches the user's athlete profile for context (physical metrics, scores, insights).
  3.  Fetches recent conversation history (last 10 messages).
  4.  Initializes Gemini 2.0 model with function calling tools.
  5.  Sends message to AI with full context.
  6.  **Handles tool calls iteratively** (up to 5 iterations):
      - If AI requests data, executes the tool function
      - Returns results to AI
      - AI processes and may request more data or provide final response
  7.  Saves the AI's final response to the database.
  8.  Returns the AI's response to the frontend.

## Frontend Integration (`vue-advanced-chat`)

The `vue-advanced-chat` component is a Web Component wrapper. To make it work with Nuxt 3:

1.  **Client-Only Loading**: The component is strictly loaded on the client side using `onMounted` and dynamic import (`await import('vue-advanced-chat')`). It is wrapped in `<ClientOnly>` and a `v-if="isClient"` guard.
2.  **Vite Config**: We updated `nuxt.config.ts` to treat `vue-advanced-chat` and `emoji-picker` as custom elements via `vue.template.compilerOptions.isCustomElement`. This prevents Vue from throwing "failed to resolve component" warnings.
3.  **Theme**: The `theme` prop is bound to a computed property that switches between 'light' and 'dark' based on the Nuxt Color Mode.
4.  **Layout**: The component is wrapped in a `div` with `h-full` and passed `height="100%"` to ensure it fills the available dashboard panel space.

## AI Integration

The system uses Google Gemini 2.0 with advanced function calling capabilities to provide dynamic, data-driven coaching.

- **Model**: `gemini-2.0-flash-exp` with function calling support
- **Context**: Athlete profile + conversation history + dynamic data access via tools
- **Tools**: 5 specialized functions for fetching workout, nutrition, and wellness data

### Athlete Profile Integration

When a user sends a message, the system automatically fetches their profile data including:

- **Physical Metrics**: FTP (Functional Threshold Power), Max Heart Rate, Weight, Age
- **Performance Scores** (1-10 scale):
  - Current Fitness Score
  - Recovery Capacity Score
  - Nutrition Compliance Score
  - Training Consistency Score
- **AI-Generated Insights**: Detailed explanations for each score, including current status and improvement recommendations

This context is embedded into the system prompt so that Coach Watts is aware of the athlete's current state, capabilities, and areas for improvement in every conversation.

### Function Calling / Tool Use

Coach Watts can dynamically fetch data from the database using 6 specialized tools. All tools provide comprehensive data including raw JSON from source platforms.

#### 1. `get_recent_workouts`

Fetches recent workout summaries with key metrics.

- **Parameters**: `limit` (number, max 20), `type` (workout type), `days` (time window)
- **Returns**: ID, date, title, type, duration, distance, power, HR, cadence, TSS, intensity, training load, kilojoules, elevation, speed, RPE, feel, description
- **Use Case**: "How did my last 3 rides go?"

#### 2. `get_workout_details`

Gets comprehensive details for a specific workout. Can search by ID OR by natural language description.

**Search Parameters**:

- `workout_id` - Exact ID if known
- `title_search` - Search by workout title (e.g., "Morning Elliptical")
- `type` - Filter by workout type (Ride, Run, Walk, etc.)
- `date` - Specific date (YYYY-MM-DD)
- `relative_position` - "latest", "longest", "hardest", "fastest"

**Returns ALL Available Data** (58+ fields):

- **Basic Info**: ID, date, title, description, type, source, duration, distance
- **Power Metrics**: Average, normalized, max, weighted average watts
- **Heart Rate**: Average and max HR
- **Cadence & Speed**: Average/max cadence, average speed
- **Training Load**: TSS, training load, intensity factor, kilojoules, TRIMP
- **Performance Analysis**: FTP at time, variability index, power/HR ratio, efficiency factor, decoupling, polarization index
- **Fitness Tracking**: CTL (fitness), ATL (fatigue)
- **Scores** (1-10 scale): Overall, technical, effort, pacing, execution
- **Score Explanations**: AI-generated detailed insights for each score
- **Subjective**: RPE, session RPE, feel rating
- **Environmental**: Temperature, indoor trainer flag
- **Balance**: Left/Right power balance
- **Duplicate Info**: Is duplicate, duplicate of ID, completeness score
- **Metadata**: External platform ID, timestamps, AI analysis status
- **AI Analysis**: Text version AND structured JSON
- **Raw Data**: Complete original JSON from source platform (Strava, Intervals.icu, etc.)

**Use Cases**:

- "Tell me about the morning elliptical" → Searches by title
- "Show me my latest ride" → Finds most recent Ride
- "What about yesterday's longest walk?" → Finds longest Walk from yesterday
- "My hardest workout this week" → Finds workout with highest TSS
- "Give me all the details on that 2-hour ride" → Returns complete data including raw JSON

#### 3. `get_nutrition_log`

Retrieves nutrition data for date ranges.

- **Parameters**: `start_date`, `end_date` (optional)
- **Use Case**: "What did I eat yesterday?"

#### 4. `get_wellness_metrics`

Fetches recovery and wellness data.

- **Parameters**: `start_date`, `end_date` (optional)
- **Use Case**: "How's my recovery been this week?"

#### 5. `search_workouts`

Advanced workout search with filters.

- **Parameters**: `query`, `min_duration_minutes`, `max_duration_minutes`, `min_tss`, `date_from`, `date_to`, `limit`
- **Use Case**: "Find my hardest workouts from last month"

#### 6. `get_performance_metrics`

Get comprehensive performance analytics and trends.

- **Parameters**:
  - `period_days` - Analysis period (default: 30, options: 7, 14, 30, 60, 90)
  - `include_activity_distribution` - Breakdown by workout type
  - `include_training_load` - Daily training load trends
  - `include_weekly_hours` - Weekly training hours (last 8 weeks)
  - `include_intensity_analysis` - Intensity distribution analysis
- **Returns**:
  - Activity distribution (count, %, hours, TSS by type)
  - Training load trends (daily TSS, training load, duration)
  - Weekly training hours (last 8 weeks breakdown)
  - Intensity analysis (high/moderate/low intensity counts)
  - Fitness metrics (CTL, ATL, TSB if available)
  - Summary stats (total hours, distance, TSS, workouts/week)
- **Use Cases**:
  - "How's my training been going this month?"
  - "Show me my activity distribution"
  - "What are my training load trends?"
  - "How many hours am I training per week?"
  - "Analyze my performance over the last 30 days"

### How It Works

1. **User Message**: Athlete asks a question
2. **AI Analysis**: Gemini determines if it needs data
3. **Tool Call**: AI requests specific data via function call
4. **Data Fetch**: Backend queries database and returns results
5. **AI Response**: Gemini analyzes the data and provides insights
6. **Iterative**: AI can make multiple tool calls (up to 5) if needed

### Example Conversation Flow

**User**: "How did my last 3 rides compare?"

**Behind the scenes**:

1. AI calls: `get_recent_workouts(type: "Ride", limit: 3)`
2. System returns 3 ride summaries with power, HR, TSS
3. AI analyzes the data
4. AI responds: "Your last three rides show great progression..."

**User**: "Tell me more about the morning elliptical"

**Behind the scenes**:

1. AI recognizes title reference
2. AI calls: `get_workout_details(title_search: "Morning Elliptical")`
3. System searches by title and returns workout data
4. AI responds with detailed analysis

**User**: "What about my latest ride?"

**Behind the scenes**:

1. AI understands "latest ride" means most recent Ride
2. AI calls: `get_workout_details(type: "Ride", relative_position: "latest")`
3. System finds most recent Ride workout
4. AI provides insights

This creates a natural, conversational experience where the AI can reference actual training data rather than making assumptions.

## Troubleshooting

- **Room list spinning forever**: Check the console for backend errors. Ensure `loadingRooms` is set to `false` after the API call completes (success or fail).
- **"getServerSession is not defined"**: Ensure `#auth` is imported in server API files.
- **Styling issues**: The component relies on its own CSS. Dark mode issues are usually resolved by correctly passing the `theme` prop.
