import { prisma } from '../../server/utils/db'

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('Please provide an LlmUsage ID.')
    process.exit(1)
  }

  const id = args[0]

  try {
    const record = await prisma.llmUsage.findUnique({
      where: { id }
    })

    if (!record) {
      console.error(`LlmUsage record with ID ${id} not found.`)
      process.exit(1)
    }

    console.log('--- LlmUsage Record ---')
    console.log(`ID: ${record.id}`)
    console.log(`Operation: ${record.operation}`)
    console.log(`Model: ${record.model}`)
    console.log(`Success: ${record.success}`)
    console.log('-----------------------')
    console.log('--- Prompt Full ---')
    console.log(record.promptFull)
    console.log('-----------------------')
    console.log('--- Response Full ---')
    console.log(record.responseFull)
    console.log('-----------------------')
  } catch (error) {
    console.error('Error fetching LlmUsage record:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
