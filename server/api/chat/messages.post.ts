import { getServerSession } from '#auth'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { chatToolDeclarations, executeToolCall } from '../../utils/chat-tools'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const userId = (session.user as any).id
  if (!userId) {
    throw createError({ statusCode: 401, message: 'User ID not found' })
  }

  const body = await readBody(event)
  const { roomId, content, files, replyMessage } = body

  if (!roomId || !content) {
    throw createError({ statusCode: 400, message: 'Room ID and content required' })
  }

  // 1. Save User Message
  const userMessage = await prisma.chatMessage.create({
    data: {
      content,
      roomId,
      senderId: userId,
      files: files || undefined,
      replyToId: replyMessage?._id || undefined,
      seen: { [userId]: new Date() }
    }
  })

  // 2. Fetch User Profile for Context
  const userProfile = await prisma.user.findUnique({
    where: { id: userId },
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
      currentFitnessExplanationJson: true,
      recoveryCapacityExplanationJson: true,
      nutritionComplianceExplanationJson: true,
      trainingConsistencyExplanationJson: true,
      profileLastUpdated: true
    }
  })

  // 3. Fetch Chat History (last 50 messages)
  const history = await prisma.chatMessage.findMany({
    where: { roomId },
    orderBy: { createdAt: 'desc' },
    take: 50
  })
  
  const chronologicalHistory = history.reverse()

  // 4. Fetch Recent Activity Data (Last 7 Days)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  // Fetch recent workouts
  const recentWorkouts = await prisma.workout.findMany({
    where: {
      userId,
      date: { gte: sevenDaysAgo }
    },
    orderBy: { date: 'desc' },
    select: {
      id: true,
      date: true,
      title: true,
      type: true,
      durationSec: true,
      distanceMeters: true,
      averageWatts: true,
      normalizedPower: true,
      averageHr: true,
      tss: true,
      intensity: true,
      trainingLoad: true,
      rpe: true,
      feel: true,
      description: true,
      overallScore: true,
      aiAnalysisJson: true
    }
  })

  // Fetch recent nutrition
  const recentNutrition = await prisma.nutrition.findMany({
    where: {
      userId,
      date: { gte: sevenDaysAgo }
    },
    orderBy: { date: 'desc' },
    select: {
      id: true,
      date: true,
      calories: true,
      protein: true,
      carbs: true,
      fat: true,
      fiber: true,
      sugar: true,
      aiAnalysisJson: true
    }
  })

  // Fetch recent wellness
  const recentWellness = await prisma.wellness.findMany({
    where: {
      userId,
      date: { gte: sevenDaysAgo }
    },
    orderBy: { date: 'desc' },
    select: {
      id: true,
      date: true,
      recoveryScore: true,
      hrv: true,
      restingHr: true,
      sleepHours: true,
      sleepScore: true,
      readiness: true,
      fatigue: true,
      soreness: true,
      stress: true,
      mood: true
    }
  })

  // 5. Build Comprehensive Athlete Context
  let athleteContext = '\n\n## Athlete Profile\n'
  
  if (userProfile) {
    if (userProfile.name) athleteContext += `- **Name**: ${userProfile.name}\n`
    
    const metrics: string[] = []
    if (userProfile.ftp) metrics.push(`FTP: ${userProfile.ftp}W`)
    if (userProfile.maxHr) metrics.push(`Max HR: ${userProfile.maxHr} bpm`)
    if (userProfile.weight) {
      metrics.push(`Weight: ${userProfile.weight}kg`)
      if (userProfile.ftp) {
        metrics.push(`W/kg: ${(userProfile.ftp / userProfile.weight).toFixed(2)}`)
      }
    }
    if (userProfile.dob) {
      const age = Math.floor((Date.now() - new Date(userProfile.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      metrics.push(`Age: ${age}`)
    }
    if (metrics.length > 0) {
      athleteContext += `- **Physical Metrics**: ${metrics.join(', ')}\n`
    }
    
    const scores: string[] = []
    if (userProfile.currentFitnessScore) scores.push(`Fitness: ${userProfile.currentFitnessScore}/10`)
    if (userProfile.recoveryCapacityScore) scores.push(`Recovery: ${userProfile.recoveryCapacityScore}/10`)
    if (userProfile.nutritionComplianceScore) scores.push(`Nutrition: ${userProfile.nutritionComplianceScore}/10`)
    if (userProfile.trainingConsistencyScore) scores.push(`Consistency: ${userProfile.trainingConsistencyScore}/10`)
    if (scores.length > 0) {
      athleteContext += `- **Current Scores**: ${scores.join(', ')}\n`
    }
    
    // Add detailed explanations with JSON insights
    if (userProfile.currentFitnessExplanation) {
      athleteContext += `\n### Fitness Insights\n${userProfile.currentFitnessExplanation}\n`
      if (userProfile.currentFitnessExplanationJson) {
        athleteContext += `\n**Structured Insights**: ${JSON.stringify(userProfile.currentFitnessExplanationJson)}\n`
      }
    }
    if (userProfile.recoveryCapacityExplanation) {
      athleteContext += `\n### Recovery Insights\n${userProfile.recoveryCapacityExplanation}\n`
      if (userProfile.recoveryCapacityExplanationJson) {
        athleteContext += `\n**Structured Insights**: ${JSON.stringify(userProfile.recoveryCapacityExplanationJson)}\n`
      }
    }
    if (userProfile.nutritionComplianceExplanation) {
      athleteContext += `\n### Nutrition Insights\n${userProfile.nutritionComplianceExplanation}\n`
      if (userProfile.nutritionComplianceExplanationJson) {
        athleteContext += `\n**Structured Insights**: ${JSON.stringify(userProfile.nutritionComplianceExplanationJson)}\n`
      }
    }
    if (userProfile.trainingConsistencyExplanation) {
      athleteContext += `\n### Training Consistency Insights\n${userProfile.trainingConsistencyExplanation}\n`
      if (userProfile.trainingConsistencyExplanationJson) {
        athleteContext += `\n**Structured Insights**: ${JSON.stringify(userProfile.trainingConsistencyExplanationJson)}\n`
      }
    }
    
    if (userProfile.profileLastUpdated) {
      athleteContext += `\n*Profile last updated: ${new Date(userProfile.profileLastUpdated).toLocaleDateString()}*\n`
    }
  }

  // Add Recent Activity Summary (Last 7 Days)
  athleteContext += '\n\n## Recent Activity (Last 7 Days)\n'
  
  // Recent Workouts Summary
  if (recentWorkouts.length > 0) {
    athleteContext += `\n### Workouts (${recentWorkouts.length} activities)\n`
    for (const workout of recentWorkouts) {
      athleteContext += `- **${workout.date.toLocaleDateString()}**: ${workout.title || workout.type}\n`
      athleteContext += `  - Duration: ${Math.round(workout.durationSec / 60)} min`
      if (workout.distanceMeters) athleteContext += ` | Distance: ${(workout.distanceMeters / 1000).toFixed(1)} km`
      if (workout.averageWatts) athleteContext += ` | Avg Power: ${workout.averageWatts}W`
      if (workout.tss) athleteContext += ` | TSS: ${Math.round(workout.tss)}`
      if (workout.overallScore) athleteContext += ` | Score: ${workout.overallScore}/10`
      athleteContext += '\n'
      
      if (workout.aiAnalysisJson) {
        athleteContext += `  - AI Analysis: ${JSON.stringify(workout.aiAnalysisJson)}\n`
      }
    }
  } else {
    athleteContext += '\n### Workouts\nNo workouts in the last 7 days\n'
  }
  
  // Recent Nutrition Summary
  if (recentNutrition.length > 0) {
    athleteContext += `\n### Nutrition (${recentNutrition.length} days logged)\n`
    for (const nutrition of recentNutrition) {
      athleteContext += `- **${nutrition.date.toLocaleDateString()}**: `
      athleteContext += `${nutrition.calories || 0} kcal`
      if (nutrition.protein) athleteContext += ` | Protein: ${Math.round(nutrition.protein)}g`
      if (nutrition.carbs) athleteContext += ` | Carbs: ${Math.round(nutrition.carbs)}g`
      if (nutrition.fat) athleteContext += ` | Fat: ${Math.round(nutrition.fat)}g`
      athleteContext += '\n'
      
      if (nutrition.aiAnalysisJson) {
        athleteContext += `  - AI Analysis: ${JSON.stringify(nutrition.aiAnalysisJson)}\n`
      }
    }
  } else {
    athleteContext += '\n### Nutrition\nNo nutrition data in the last 7 days\n'
  }
  
  // Recent Wellness Summary
  if (recentWellness.length > 0) {
    athleteContext += `\n### Wellness & Recovery (${recentWellness.length} days)\n`
    for (const wellness of recentWellness) {
      athleteContext += `- **${wellness.date.toLocaleDateString()}**: `
      const metrics: string[] = []
      if (wellness.recoveryScore) metrics.push(`Recovery: ${wellness.recoveryScore}%`)
      if (wellness.hrv) metrics.push(`HRV: ${wellness.hrv}ms`)
      if (wellness.sleepHours) metrics.push(`Sleep: ${wellness.sleepHours}h`)
      if (wellness.sleepScore) metrics.push(`Sleep Score: ${wellness.sleepScore}%`)
      if (wellness.readiness) metrics.push(`Readiness: ${wellness.readiness}%`)
      athleteContext += metrics.join(' | ') + '\n'
    }
  } else {
    athleteContext += '\n### Wellness & Recovery\nNo wellness data in the last 7 days\n'
  }

  // 5. Build System Instruction with Current Time Context
  const now = new Date()
  const userTimeZone = 'America/New_York' // TODO: Get from user preferences
  const userTime = now.toLocaleString('en-US', {
    timeZone: userTimeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
  const hourOfDay = parseInt(now.toLocaleString('en-US', { timeZone: userTimeZone, hour: 'numeric', hour12: false }))
  
  let timeOfDay = 'morning'
  if (hourOfDay >= 12 && hourOfDay < 17) timeOfDay = 'afternoon'
  else if (hourOfDay >= 17 && hourOfDay < 21) timeOfDay = 'evening'
  else if (hourOfDay >= 21 || hourOfDay < 5) timeOfDay = 'late night'
  
  const systemInstruction = `You are Coach Watts, a spirited, cool/edgy cycling coach with a gritty, high-energy personality.
You are the ultimate riding buddy who happens to be an expert in physiology. You believe in "Ride Hard, Recover Harder."

## Current Context
**Current Time**: ${userTime} (${timeOfDay})

**IMPORTANT**: You are aware of the current time. Use this context when analyzing data:
- **Morning (5am-12pm)**: It's normal to only have breakfast logged, no lunch/dinner yet
- **Afternoon (12pm-5pm)**: Breakfast and lunch should be logged, dinner is pending
- **Evening (5pm-9pm)**: Most meals should be logged by now
- **Late Night (9pm-5am)**: All meals should be complete, athlete may be preparing for rest

Don't criticize missing data that's simply not available yet due to the time of day. Instead, acknowledge what time it is and set appropriate expectations.

## Your Personality & Vibe

**Who You Are:**
- A cycling fanatic who lives for the ride—whether it's gravel, tarmac, or the pain cave.
- You are **data-obsessed but street-smart**. You use numbers (Watts, HR, HRV) to justify the swagger.
- You are that friend who pushes the user to dig deeper ("Shut up legs!") but is the first to high-five them at the coffee stop.
- You possess a "tough love" encouragement style. You celebrate the suffering because you know it makes the athlete stronger.

**Your Communication Style ("The Cyclist's Voice"):**
- **Language Matching:** ALWAYS respond in the same language the user is speaking. If they write in Hungarian, respond in Hungarian. If English, respond in English. If they switch languages, you switch too. This is NON-NEGOTIABLE.
- **Speak the Language:** Use cycling slang naturally. Terms like "bonking," "dropping the hammer," "chamois time," "spinning out," "full gas," and "KOM hunting" are part of your vocabulary.
- **High Energy Openers:** Start with energy. Instead of "Hello," try "Yo! Ready to crush it?" or "Legs feeling fresh?"
- **Actionable Swagger:** When giving advice, keep it punchy.
    - *Boring:* "Your heart rate was high."
    - *You:* "You were revving the engine in the red zone today! 🔥"
- **Emojis:** Use them to emphasize speed and power (⚡, 🚴, 🧱, 🤘, ☕).
- **Direct & Witty:** If the user skips a workout, roast them gently: "Bike looking a bit lonely today, isn't it?" Then, help them get back on track.

## Your Coaching Philosophy (The "Rules")

1.  **Respect the Rest Day:** You can't fire a cannon from a canoe. If the user is tired (low HRV, bad sleep), force them to chill. "Park the bike, eat a pizza. That's an order."
2.  **No Junk Miles:** Every ride has a purpose. We don't just pedal; we train.
3.  **Suffer with a Smile:** Acknowledge when a workout is brutal. Validate the pain, then praise the effort. "That looked absolutely disgusting. Good job."
4.  **Consistency is King:** You prefer a rider who shows up every day over a weekend warrior who burns out.

## How You Interact (The Workflow)

**Step 1: Check the Telemetry**
- **ALWAYS** use your tools to fetch the athlete's activity, nutrition, and wellness data first. Don't guess.
- Look for the story in the numbers. Did they hit a new Peak Power? Did they bonk?

**Step 2: The Assessment**
- Lead with the vibe. If they crushed it, hype them up. "Absolute boss move on that climb."
- If the data is bad, be real. "Numbers don't lie, you're running on fumes."

**Step 3: The Call to Action**
- Never leave them hanging. Give a specific next step.
- End with a fist bump or a challenge. "Rest up. Tomorrow we ride at dawn. 👊"

## What Makes You Different
You aren't a robot reciting a manual. You are a coach who knows that the best ride is the one where you push your limits and earn your post-ride espresso. You bring the hype, the knowledge, and the attitude.

## Your Tools & Data Access

You have access to tools that let you fetch the athlete's workout data, nutrition logs, and wellness metrics.

**CRITICAL: BE PROACTIVE WITH TOOLS**
- DO NOT ask for permission to check data ("Would you like me to check your workouts?")
- DO NOT wait for explicit requests
- AUTOMATICALLY use tools when relevant to the conversation
- If someone mentions training, workouts, nutrition, or recovery - CHECK THE DATA FIRST, respond second
- You're a coach, not a waiter. Take initiative!

Examples of when to AUTOMATICALLY use tools:
- User says "How am I doing?" → Fetch recent workouts, nutrition, wellness IMMEDIATELY
- User mentions feeling tired → Check wellness data and recent training load IMMEDIATELY
- User asks about nutrition → Pull today's nutrition data IMMEDIATELY
- General greeting ("Hey", "What's up") → Quick check of today's data to give relevant response
- ANY question about performance, progress, or training → FETCH DATA FIRST

Remember: You're the coach analyzing real data, not guessing or making assumptions. Use your tools liberally!

${athleteContext}

Remember: You're not just analyzing data—you're hyping up an athlete to become a stronger rider. Make every interaction count. 🚴⚡

## Follow-Up Suggestions

At the end of EVERY response, you must suggest 2-3 relevant follow-up questions or actions the user might want to explore next.
Format these suggestions at the very end of your response using this EXACT format:

---SUGGESTIONS---
1. [Short suggestion text here]
2. [Another suggestion here]
3. [Third suggestion here]

Examples:
- "Check my recovery metrics"
- "Show me this week's training load"
- "How should I adjust tomorrow's workout?"
- "Compare my nutrition to my goals"
- "What's my TSS trend?"

Keep suggestions short (5-8 words), actionable, and directly related to what you just discussed.`

  // 6. Build Chat History for Model
  // Gemini requires the first message to be from user, so filter out any leading AI messages
  let historyForModel = chronologicalHistory.map((msg: any) => ({
    role: msg.senderId === 'ai_agent' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }))

  // Remove any leading 'model' messages to ensure first message is 'user'
  while (historyForModel.length > 0 && historyForModel[0].role === 'model') {
    historyForModel = historyForModel.slice(1)
  }

  // 7. Initialize Model with Tools and JSON Response Format
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-exp',
    systemInstruction,
    tools: [{ functionDeclarations: chatToolDeclarations }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT" as any,
        properties: {
          response: {
            type: "STRING" as any,
            description: "The main response content to display to the user"
          },
          suggestions: {
            type: "ARRAY" as any,
            description: "2-3 follow-up questions or actions the user might want to explore next",
            items: {
              type: "STRING" as any
            }
          }
        },
        required: ["response", "suggestions"]
      }
    }
  })

  // 8. Start Chat with History
  const chat = model.startChat({
    history: historyForModel,
  })

  // 9. Send Message and Handle Tool Calls Iteratively
  let result = await chat.sendMessage(content)
  let response = result.response
  
  // Maximum 5 rounds of tool calls to prevent infinite loops
  let roundCount = 0
  const MAX_ROUNDS = 5
  const toolCallsUsed: Array<{ name: string; args: any }> = []

  while (roundCount < MAX_ROUNDS) {
    const functionCalls = response.functionCalls?.()
    
    if (!functionCalls || functionCalls.length === 0) {
      break
    }
    
    roundCount++
    console.log(`[Tool Call Round ${roundCount}/${MAX_ROUNDS}] Processing ${functionCalls.length} function call(s)`)
    
    // Process ALL function calls and build responses array
    const functionResponses = await Promise.all(
      functionCalls.map(async (functionCall, index) => {
        toolCallsUsed.push({ name: functionCall.name, args: functionCall.args })
        
        console.log(`[Tool Call ${roundCount}.${index + 1}] ${functionCall.name}`, functionCall.args)
        
        try {
          const toolResult = await executeToolCall(
            functionCall.name,
            functionCall.args,
            userId
          )
          
          console.log(`[Tool Result ${roundCount}.${index + 1}] ${functionCall.name}:`,
            typeof toolResult === 'object' ? JSON.stringify(toolResult).substring(0, 200) + '...' : toolResult
          )
          
          return {
            functionResponse: {
              name: functionCall.name,
              response: toolResult
            }
          }
        } catch (error: any) {
          console.error(`[Tool Error ${roundCount}.${index + 1}] ${functionCall.name}:`, error?.message || error)
          
          return {
            functionResponse: {
              name: functionCall.name,
              response: { error: `Failed to execute tool: ${error?.message || 'Unknown error'}` }
            }
          }
        }
      })
    )
    
    // Send all function responses back together
    result = await chat.sendMessage(functionResponses)
    response = result.response
  }
  
  if (roundCount >= MAX_ROUNDS) {
    console.warn(`Reached maximum tool call rounds (${MAX_ROUNDS}). Tools used:`, toolCallsUsed)
  }

  const aiResponseText = response.text()

  // 10. Save AI Response
  const aiMessage = await prisma.chatMessage.create({
    data: {
      content: aiResponseText,
      roomId,
      senderId: 'ai_agent',
      seen: {}
    }
  })

  // 11. Auto-rename room after first AI response
  // Check if this is the first AI response (meaning there are only 2 messages now: user's first + this AI response)
  const messageCount = await prisma.chatMessage.count({
    where: { roomId }
  })

  if (messageCount === 2) {
    // This is the first AI response - generate a concise title
    try {
      const titleModel = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash-exp',
      })
      
      const titlePrompt = `Based on this conversation, generate a very concise, descriptive title (max 6 words). Just return the title, nothing else.

User: ${content}
AI: ${aiResponseText.substring(0, 500)}

Title:`

      const titleResult = await titleModel.generateContent(titlePrompt)
      let roomTitle = titleResult.response.text().trim()
      
      // Clean up the title - remove quotes, limit length
      roomTitle = roomTitle.replace(/^["']|["']$/g, '').substring(0, 60)
      
      // Update the room name
      await prisma.chatRoom.update({
        where: { id: roomId },
        data: { name: roomTitle }
      })
      
      console.log(`[Chat] Auto-renamed room ${roomId} to: "${roomTitle}"`)
    } catch (error) {
      console.error('[Chat] Failed to auto-rename room:', error)
      // Don't fail the whole request if renaming fails
    }
  }

  // 12. Return AI Message in vue-advanced-chat format
  return {
    _id: aiMessage.id,
    content: aiResponseText,
    senderId: aiMessage.senderId,
    username: 'Coach Watts',
    avatar: '/images/logo.svg',
    date: new Date(aiMessage.createdAt).toLocaleDateString(),
    timestamp: new Date(aiMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    system: false,
    saved: true,
    distributed: true,
    seen: false,
    disableActions: false,
    disableReactions: false,
    metadata: toolCallsUsed.length > 0 ? {
      toolsUsed: toolCallsUsed.map(t => t.name),
      toolCallCount: toolCallsUsed.length
    } : undefined
  }
})
