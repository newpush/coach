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
      profileLastUpdated: true
    }
  })

  // 3. Fetch Chat History (last 10 messages)
  const history = await prisma.chatMessage.findMany({
    where: { roomId },
    orderBy: { createdAt: 'desc' },
    take: 10
  })
  
  const chronologicalHistory = history.reverse()

  // 4. Build Athlete Context
  let athleteContext = ''
  if (userProfile) {
    athleteContext = '\n\n## Athlete Profile\n'
    
    if (userProfile.name) athleteContext += `- **Name**: ${userProfile.name}\n`
    
    const metrics: string[] = []
    if (userProfile.ftp) metrics.push(`FTP: ${userProfile.ftp}W`)
    if (userProfile.maxHr) metrics.push(`Max HR: ${userProfile.maxHr} bpm`)
    if (userProfile.weight) metrics.push(`Weight: ${userProfile.weight}kg`)
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
    
    if (userProfile.currentFitnessExplanation) {
      athleteContext += `\n### Fitness Insights\n${userProfile.currentFitnessExplanation}\n`
    }
    if (userProfile.recoveryCapacityExplanation) {
      athleteContext += `\n### Recovery Insights\n${userProfile.recoveryCapacityExplanation}\n`
    }
    if (userProfile.nutritionComplianceExplanation) {
      athleteContext += `\n### Nutrition Insights\n${userProfile.nutritionComplianceExplanation}\n`
    }
    if (userProfile.trainingConsistencyExplanation) {
      athleteContext += `\n### Training Consistency Insights\n${userProfile.trainingConsistencyExplanation}\n`
    }
    
    if (userProfile.profileLastUpdated) {
      athleteContext += `\n*Profile last updated: ${new Date(userProfile.profileLastUpdated).toLocaleDateString()}*\n`
    }
  }

  // 5. Build System Instruction
  const systemInstruction = `You are Coach Watts, an AI-powered cycling coach.
You are helpful, encouraging, and knowledgeable about cycling training, nutrition, and recovery.

You have access to tools that let you fetch the athlete's workout data, nutrition logs, and wellness metrics.
When the athlete asks about their activities, performance, or progress, use the appropriate tools to fetch the actual data before responding.

${athleteContext}

Always provide specific, data-driven insights when possible. Use the tools to access real data rather than making assumptions.`

  // 6. Build Chat History for Model
  const historyForModel = chronologicalHistory.map((msg: any) => ({
    role: msg.senderId === 'ai_agent' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }))

  // 7. Initialize Model with Tools
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-exp',
    systemInstruction,
    tools: [{ functionDeclarations: chatToolDeclarations }],
  })

  // 8. Start Chat with History
  const chat = model.startChat({
    history: historyForModel,
  })

  // 9. Send Message and Handle Tool Calls Iteratively
  let result = await chat.sendMessage(content)
  let response = result.response
  
  // Maximum 5 tool calls to prevent infinite loops
  let toolCallCount = 0
  const MAX_TOOL_CALLS = 5
  const toolCallsUsed: Array<{ name: string; args: any }> = []

  while (toolCallCount < MAX_TOOL_CALLS) {
    const functionCalls = response.functionCalls?.()
    
    if (!functionCalls || functionCalls.length === 0) {
      break
    }
    
    toolCallCount++
    const functionCall = functionCalls[0]
    toolCallsUsed.push({ name: functionCall.name, args: functionCall.args })
    
    console.log(`[Tool Call ${toolCallCount}/${MAX_TOOL_CALLS}] ${functionCall.name}`, functionCall.args)
    
    try {
      const toolResult = await executeToolCall(
        functionCall.name,
        functionCall.args,
        userId
      )
      
      console.log(`[Tool Result ${toolCallCount}] ${functionCall.name}:`,
        typeof toolResult === 'object' ? JSON.stringify(toolResult).substring(0, 200) + '...' : toolResult
      )
      
      result = await chat.sendMessage([{
        functionResponse: {
          name: functionCall.name,
          response: toolResult
        }
      }])
      
      response = result.response
    } catch (error: any) {
      console.error(`[Tool Error ${toolCallCount}] ${functionCall.name}:`, error?.message || error)
      
      result = await chat.sendMessage([{
        functionResponse: {
          name: functionCall.name,
          response: { error: `Failed to execute tool: ${error?.message || 'Unknown error'}` }
        }
      }])
      
      response = result.response
    }
  }
  
  if (toolCallCount >= MAX_TOOL_CALLS) {
    console.warn(`Reached maximum tool calls (${MAX_TOOL_CALLS}). Tools used:`, toolCallsUsed)
  }

  const aiResponseText = response.text()

  // 10. Save AI Response with metadata about tool usage
  const aiMessage = await prisma.chatMessage.create({
    data: {
      content: aiResponseText,
      roomId,
      senderId: 'ai_agent',
      seen: {},
      metadata: toolCallsUsed.length > 0 ? {
        toolsUsed: toolCallsUsed,
        toolCallCount: toolCallsUsed.length
      } : undefined
    }
  })

  // 11. Return AI Message in vue-advanced-chat format
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
