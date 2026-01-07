import { logger, task } from '@trigger.dev/sdk/v3'

export const helloWorldTask = task({
  id: 'hello-world',
  run: async (payload: { message: string }) => {
    logger.log('Hello, world!', { payload })
    return {
      message: `Hello, ${payload.message}!`
    }
  }
})
