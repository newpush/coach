import { prisma } from '../server/utils/db'

async function main() {
  // Search for specific missing message ID if needed, or just list recent
  const messages = await prisma.chatMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10
  })

  console.log('Found', messages.length, 'recent messages')

  for (const msg of messages) {
    console.log(
      `\nID: ${msg.id} | Sender: ${msg.senderId} | Role: ${msg.senderId === 'ai_agent' ? 'Assistant' : msg.senderId === 'system_tool' ? 'Tool' : 'User'}`
    )
    console.log('Content:', msg.content ? msg.content.substring(0, 50) : '[No Content]')
    console.log('Metadata:', JSON.stringify(msg.metadata, null, 2))
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
