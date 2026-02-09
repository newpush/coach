import { prisma } from '../db'
import type { Prisma } from '@prisma/client'

export const nutritionSettingsRepository = {
  /**
   * Get nutrition settings for a user
   */
  async getByUserId(userId: string) {
    return prisma.userNutritionSettings.findUnique({
      where: { userId }
    })
  },

  /**
   * Upsert nutrition settings for a user
   */
  async upsert(
    userId: string,
    data: Omit<Prisma.UserNutritionSettingsUncheckedCreateInput, 'userId'>
  ) {
    return prisma.userNutritionSettings.upsert({
      where: { userId },
      create: {
        ...data,
        userId
      },
      update: data
    })
  }
}
