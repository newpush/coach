import { prisma } from '../db'

export const coachingRepository = {
  // --- Relationship Management ---

  async getAthletesForCoach(coachId: string) {
    return (prisma as any).coachingRelationship.findMany({
      where: { coachId, status: 'ACTIVE' },
      include: {
        athlete: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            currentFitnessScore: true,
            profileLastUpdated: true
          }
        }
      }
    })
  },

  async getCoachesForAthlete(athleteId: string) {
    return (prisma as any).coachingRelationship.findMany({
      where: { athleteId, status: 'ACTIVE' },
      include: {
        coach: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
          }
        }
      }
    })
  },

  async checkRelationship(coachId: string, athleteId: string) {
    const relationship = await (prisma as any).coachingRelationship.findUnique({
      where: {
        coachId_athleteId: {
          coachId,
          athleteId
        }
      }
    })
    return relationship?.status === 'ACTIVE'
  },

  async removeRelationship(coachId: string, athleteId: string) {
    return (prisma as any).coachingRelationship.delete({
      where: {
        coachId_athleteId: {
          coachId,
          athleteId
        }
      }
    })
  },

  // --- Invitation Management ---

  async createInvite(athleteId: string) {
    // Expire any old pending invites for this athlete
    await (prisma as any).coachingInvite.updateMany({
      where: { athleteId, status: 'PENDING' },
      data: { status: 'EXPIRED' }
    })

    // Generate a simple 6-char code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase()

    return (prisma as any).coachingInvite.create({
      data: {
        athleteId,
        code,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        status: 'PENDING'
      }
    })
  },

  async getActiveInvite(athleteId: string) {
    return (prisma as any).coachingInvite.findFirst({
      where: {
        athleteId,
        status: 'PENDING',
        expiresAt: { gt: new Date() }
      }
    })
  },

  async connectAthleteWithCode(coachId: string, code: string) {
    const invite = await (prisma as any).coachingInvite.findUnique({
      where: { code }
    })

    if (!invite || invite.status !== 'PENDING' || invite.expiresAt < new Date()) {
      throw new Error('Invalid or expired invite code')
    }

    if (invite.athleteId === coachId) {
      throw new Error('You cannot coach yourself')
    }

    // Create the relationship and mark invite as used
    return await prisma.$transaction(async (tx) => {
      const relationship = await (tx as any).coachingRelationship.upsert({
        where: {
          coachId_athleteId: {
            coachId,
            athleteId: invite.athleteId
          }
        },
        update: { status: 'ACTIVE' },
        create: {
          coachId,
          athleteId: invite.athleteId,
          status: 'ACTIVE'
        }
      })

      await (tx as any).coachingInvite.update({
        where: { id: invite.id },
        data: { status: 'ACCEPTED', usedBy: coachId }
      })

      return relationship
    })
  }
}
