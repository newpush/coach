import { logger, task } from '@trigger.dev/sdk/v3'
import { prisma } from '../server/utils/db'
import { userBackgroundQueue } from './queues'

export const deleteUserAccountTask = task({
  id: 'delete-user-account',
  queue: userBackgroundQueue,
  run: async (payload: { userId: string }) => {
    const { userId } = payload

    logger.log('Starting user account deletion', { userId })

    // 1. (Optional) Cleanup external resources (S3, external APIs)
    // TODO: Implement S3 cleanup if files are stored there (pdfUrl, profile images)
    // TODO: Revoke external integration tokens if possible/necessary (Intervals, Whoop, etc.)
    // For now, we rely on the DB deletion to remove the tokens from our side.

    // 2. Delete User from Database
    // This will cascade delete almost everything due to the schema relations.
    // LlmUsage records will have userId set to null.
    // ChatMessages might remain but without valid sender link (senderId is string).

    try {
      const user = await prisma.user.delete({
        where: { id: userId }
      })

      logger.log('User deleted successfully', { userId, email: user.email })

      // 3. (Optional) Send Goodbye Email
      // logger.log("Sending goodbye email...");

      return {
        success: true,
        userId
      }
    } catch (error) {
      logger.error('Failed to delete user', { userId, error })
      throw error
    }
  }
})
