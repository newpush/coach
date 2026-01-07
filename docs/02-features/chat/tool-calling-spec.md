# Chat Tool/Function Calling Implementation Guide

## Overview

This document outlines how to add tool/function calling capabilities to the Coach Watts chat feature, allowing the AI to dynamically fetch workout data, nutrition logs, and other information from the database.

## Feasibility: ✅ Highly Feasible

Google Gemini 2.0 has native function calling support. Implementation complexity: **Medium** (3-4 hours).

## Architecture

```
User Message → Gemini (with tools) → Tool Call Request → Execute Query →
Send Results to Gemini → Final Response → Save & Return
```

### Tool Calling Flow

1. User asks: "How did my last 3 rides compare?"
2. Gemini recognizes it needs data and calls: `get_recent_workouts(type: "Ride", limit: 3)`
3. Backend executes the query and returns workout data
4. Gemini analyzes the data and provides a comprehensive answer
5. Response is saved and sent to user

## Proposed Tools

### 1. `get_recent_workouts`

Fetch recent workout summaries.

**Parameters:**

- `limit` (number, optional): Number of workouts (default: 5, max: 20)
- `type` (string, optional): Workout type filter ("Ride", "Run", etc.)
- `days` (number, optional): Only workouts from last N days

**Returns:** Array of workout summaries with key metrics

### 2. `get_workout_details`

Get comprehensive details for a specific workout.

**Parameters:**

- `workout_id` (string, required): The workout ID

**Returns:** Full workout data including all metrics, analysis, and stream data if available

### 3. `get_workout_analysis`

Fetch AI analysis for a workout.

**Parameters:**

- `workout_id` (string, required): The workout ID

**Returns:** AI-generated analysis JSON

### 4. `get_nutrition_log`

Get nutrition data for specific dates.

**Parameters:**

- `start_date` (string, required): ISO date string
- `end_date` (string, optional): ISO date string (defaults to start_date)

**Returns:** Nutrition entries with macros and AI analysis

### 5. `get_wellness_metrics`

Fetch wellness/recovery metrics.

**Parameters:**

- `start_date` (string, required): ISO date string
- `end_date` (string, optional): ISO date string
- `metrics` (array, optional): Specific metrics to fetch ["hrv", "recovery", "sleep"]

**Returns:** Daily wellness metrics

### 6. `get_training_plan`

Get current training plan.

**Parameters:** None

**Returns:** Current week's training plan with scheduled workouts

### 7. `search_workouts`

Search workouts by criteria.

**Parameters:**

- `query` (string, optional): Text search in title/description
- `min_duration` (number, optional): Minimum duration in minutes
- `max_duration` (number, optional): Maximum duration in minutes
- `min_tss` (number, optional): Minimum TSS
- `date_from` (string, optional): Start date
- `date_to` (string, optional): End date

**Returns:** Matching workouts

## Implementation Example

### Tool Schema Definition

```typescript
const tools = [
  {
    functionDeclarations: [
      {
        name: 'get_recent_workouts',
        description: 'Fetch recent workout summaries for the athlete',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Number of workouts to fetch (max 20)',
              default: 5
            },
            type: {
              type: 'string',
              description: 'Filter by workout type (Ride, Run, etc.)',
              enum: ['Ride', 'Run', 'Swim', 'WeightTraining']
            },
            days: {
              type: 'number',
              description: 'Only include workouts from last N days'
            }
          }
        }
      },
      {
        name: 'get_workout_details',
        description: 'Get comprehensive details for a specific workout',
        parameters: {
          type: 'object',
          properties: {
            workout_id: {
              type: 'string',
              description: 'The workout ID to fetch details for'
            }
          },
          required: ['workout_id']
        }
      }
    ]
  }
]
```

### Modified Chat Endpoint Logic

```typescript
export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const body = await readBody(event)
  const { roomId, content, files, replyMessage } = body

  if (!roomId || !content) {
    throw createError({ statusCode: 400, message: 'Room ID and content required' })
  }

  const userMessage = await prisma.chatMessage.create({
    data: {
      content,
      roomId,
      senderId: session.user.id,
      files: files || undefined,
      replyToId: replyMessage?._id || undefined,
      seen: { [session.user.id]: new Date() }
    }
  })

  const userProfile = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      ftp: true,
      maxHr: true,
      weight: true,
      dob: true,
      currentFitnessScore: true,
      recoveryCapacityScore: true,
      nutritionComplianceScore: true,
      trainingConsistencyScore: true,
      currentFitnessExplanation: true,
      recoveryCapacityExplanation: true,
      nutritionComplianceExplanation: true,
      trainingConsistencyExplanation: true,
      profileLastUpdated: true
    }
  })

  const history = await prisma.chatMessage.findMany({
    where: { roomId },
    orderBy: { createdAt: 'desc' },
    take: 10
  })

  const chronologicalHistory = history.reverse()
  const athleteContext = buildAthleteContext(userProfile)
  const systemPrompt = buildSystemPrompt(athleteContext)

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-exp',
    tools: chatTools
  })

  const chat = model.startChat({
    history: buildChatHistory(chronologicalHistory),
    systemInstruction: systemPrompt,
    generationConfig: { maxOutputTokens: 2048 }
  })

  let response = await chat.sendMessage(content)
  let finalText = ''

  while (response.functionCalls && response.functionCalls.length > 0) {
    const functionCall = response.functionCalls[0]

    const toolResult = await executeToolCall(functionCall.name, functionCall.args, session.user.id)

    response = await chat.sendMessage([
      {
        functionResponse: {
          name: functionCall.name,
          response: toolResult
        }
      }
    ])
  }

  finalText = response.text()

  const aiMessage = await prisma.chatMessage.create({
    data: {
      content: finalText,
      roomId,
      senderId: 'ai_agent',
      seen: {}
    }
  })

  return {
    _id: aiMessage.id,
    content: aiMessage.content,
    senderId: aiMessage.senderId,
    username: 'Coach Watts',
    avatar: '/media/logo.webp',
    date: new Date(aiMessage.createdAt).toLocaleDateString(),
    timestamp: new Date(aiMessage.createdAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    }),
    system: false,
    saved: true,
    distributed: true,
    seen: false,
    disableActions: false,
    disableReactions: false
  }
})
```

### Tool Execution Handler

```typescript
export async function executeToolCall(toolName: string, args: any, userId: string) {
  switch (toolName) {
    case 'get_recent_workouts':
      return await getRecentWorkouts(userId, args.limit, args.type, args.days)

    case 'get_workout_details':
      return await getWorkoutDetails(userId, args.workout_id)

    case 'get_nutrition_log':
      return await getNutritionLog(userId, args.start_date, args.end_date)

    case 'get_wellness_metrics':
      return await getWellnessMetrics(userId, args.start_date, args.end_date, args.metrics)

    case 'get_training_plan':
      return await getTrainingPlan(userId)

    case 'search_workouts':
      return await searchWorkouts(userId, args)

    default:
      return { error: `Unknown tool: ${toolName}` }
  }
}

async function getRecentWorkouts(userId: string, limit = 5, type?: string, days?: number) {
  const where: any = { userId }

  if (type) where.type = type
  if (days) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    where.date = { gte: cutoff }
  }

  const workouts = await prisma.workout.findMany({
    where,
    orderBy: { date: 'desc' },
    take: Math.min(limit, 20),
    select: {
      id: true,
      date: true,
      title: true,
      type: true,
      durationSec: true,
      distanceMeters: true,
      averageWatts: true,
      averageHr: true,
      tss: true,
      intensity: true,
      rpe: true,
      feel: true
    }
  })

  return buildWorkoutSummary(workouts)
}

async function getWorkoutDetails(userId: string, workoutId: string) {
  const workout = await prisma.workout.findFirst({
    where: {
      id: workoutId,
      userId
    },
    include: {
      aiAnalysis: true
    }
  })

  if (!workout) {
    return { error: 'Workout not found' }
  }

  return buildComprehensiveWorkoutSummary([workout], false)
}
```

## Benefits

1. **Dynamic Data Access**: AI can fetch exactly what it needs
2. **Contextual Responses**: Answers based on actual athlete data
3. **Better UX**: No need to manually provide workout IDs
4. **Deeper Analysis**: AI can pull multiple data points for comprehensive insights
5. **Conversational**: Natural questions like "How did my FTP test compare to last month?"

## Example Conversations

**User:** "How did my last 3 rides compare?"

**Behind the scenes:**

1. Gemini calls: `get_recent_workouts(type: "Ride", limit: 3)`
2. Returns: 3 ride summaries with power, HR, TSS
3. Gemini analyzes and responds with comparison

**User:** "Show me details on that 2-hour ride from last week"

**Behind the scenes:**

1. Gemini calls: `get_recent_workouts(type: "Ride", days: 7)`
2. Finds workouts, identifies the 2-hour one
3. Calls: `get_workout_details(workout_id: "xxx")`
4. Returns comprehensive analysis

## Performance Considerations

- **Caching**: Cache recent workouts for 5 minutes to reduce DB queries
- **Pagination**: Limit results to prevent overwhelming the context window
- **Selective Data**: Only return fields needed for analysis
- **Timeouts**: Set reasonable timeouts for tool execution (5s max)

## Next Steps

1. Implement tool schemas in `server/utils/chat-tools.ts`
2. Create tool execution handlers
3. Modify chat endpoint to handle iterative tool calling
4. Add error handling and validation
5. Test with various queries
6. Monitor token usage and performance
7. Expand with more specialized tools as needed

## Estimated Effort

- Tool schema definition: 1 hour
- Tool execution handlers: 1-2 hours
- Chat endpoint modifications: 1 hour
- Testing and refinement: 1 hour

**Total: 3-4 hours** for initial implementation with 5-7 core tools

## Comparison to Current Approach

### Current (Static Context)

- Athlete profile included in every message
- No access to historical data
- Cannot look up specific workouts
- Generic responses based on profile scores only

### With Tool Calling

- Dynamic access to any historical data
- Can compare workouts, analyze trends
- Fetch specific workout details on demand
- Context-aware responses based on actual activity data
- Natural conversation: "compare this week to last week"

## Conclusion

Adding tool calling is **moderately complex but highly valuable**. Gemini 2.0's native function calling makes this straightforward. The main work is defining tool schemas and implementing the query handlers, which are essentially API calls we already have but packaged for the AI to use autonomously.

**Recommendation**: Start with 3-5 core tools (recent workouts, workout details, nutrition log) as a proof of concept, then expand based on user needs.
