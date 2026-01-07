import { defineConfig } from '@trigger.dev/sdk/v3'
import { prismaExtension } from '@trigger.dev/build/extensions/prisma'

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF!,
  runtime: 'node-22',
  logLevel: 'log',
  maxDuration: 300, // 5 minutes default
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true
    }
  },
  dirs: ['./trigger'],
  build: {
    extensions: [
      prismaExtension({
        mode: 'legacy',
        schema: 'prisma/schema.prisma'
      })
    ]
  }
})
