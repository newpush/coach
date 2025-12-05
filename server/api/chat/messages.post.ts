import { getServerSession } from '#auth'

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

  // 1. Save User Message
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

  // 2. Fetch Chat History (last 10 messages)
  const history = await prisma.chatMessage.findMany({
    where: { roomId },
    orderBy: { createdAt: 'desc' },
    take: 10
  })
  
  // Reverse to chronological order
  const chronologicalHistory = history.reverse()

  // 3. Construct Prompt
  const systemPrompt = `You are Coach Watts, an AI-powered cycling coach. 
  You are helpful, encouraging, and knowledgeable about cycling training, nutrition, and recovery.
  Answer the user's questions based on the context provided.
  `

  const conversation = chronologicalHistory.map(msg => 
    `${msg.senderId === 'ai_agent' ? 'Coach Watts' : 'Athlete'}: ${msg.content}`
  ).join('\n')

  const prompt = `${systemPrompt}\n\nConversation History:\n${conversation}\n\nAthlete: ${content}\nCoach Watts:`

  // 4. Call Gemini
  let aiResponseText = ''
  try {
    aiResponseText = await generateCoachAnalysis(prompt, 'flash')
  } catch (error) {
    console.error('Gemini API Error:', error)
    aiResponseText = "I'm having trouble analyzing that right now. Please try again later."
  }

  // 5. Save AI Response
  const aiMessage = await prisma.chatMessage.create({
    data: {
      content: aiResponseText,
      roomId,
      senderId: 'ai_agent',
      seen: {}
    }
  })

  // 6. Return AI Message in vue-advanced-chat format
  return {
    _id: aiMessage.id,
    content: aiMessage.content,
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
    disableReactions: false
  }
}) 
