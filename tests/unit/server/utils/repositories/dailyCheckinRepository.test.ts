import { describe, it, expect, vi, beforeEach } from 'vitest'
import { dailyCheckinRepository } from '../../../../../server/utils/repositories/dailyCheckinRepository'
import { prisma } from '../../../../../server/utils/db'

vi.mock('../../../../../server/utils/db', () => ({
  prisma: {
    dailyCheckin: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    }
  }
}))

describe('dailyCheckinRepository', () => {
  const userId = 'user-123'
  const checkinId = 'checkin-1'
  const mockCheckin = {
    id: checkinId,
    userId,
    date: new Date(),
    questions: [],
    openingRemark: 'Good morning!',
    status: 'COMPLETED'
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('update', () => {
    it('should update openingRemark', async () => {
      vi.mocked(prisma.dailyCheckin.update).mockResolvedValue(mockCheckin as any)

      await dailyCheckinRepository.update(checkinId, {
        openingRemark: 'New remark'
      })

      expect(prisma.dailyCheckin.update).toHaveBeenCalledWith({
        where: { id: checkinId },
        data: { openingRemark: 'New remark' }
      })
    })
  })
})
