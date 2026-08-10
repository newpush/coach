import { beforeEach, describe, expect, it, vi } from 'vitest'

import { requireAuth } from '../../../../../server/utils/auth-guard'
import { prisma } from '../../../../../server/utils/db'
import { tasks } from '@trigger.dev/sdk/v3'
import {
  autoUploadPlannedWorkoutToIntervalsIfEnabled,
  syncPlannedWorkoutToIntervals
} from '../../../../../server/utils/intervals-sync'

vi.stubGlobal('defineEventHandler', (fn: any) => fn)
vi.stubGlobal('defineRouteMeta', () => {})
vi.stubGlobal('getRouterParam', (_event: any, key: string) => _event.context.params[key])
vi.stubGlobal('createError', (err: any) => {
  const error = new Error(err.message)
  ;(error as any).statusCode = err.statusCode
  return error
})

vi.mock('../../../../../server/utils/auth-guard', () => ({
  requireAuth: vi.fn()
}))

vi.mock('../../../../../server/utils/db', () => ({
  prisma: {
    activityRecommendation: {
      findUnique: vi.fn(),
      update: vi.fn()
    },
    plannedWorkout: {
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn()
    }
  }
}))

vi.mock('@trigger.dev/sdk/v3', () => ({
  tasks: {
    trigger: vi.fn(),
    onFailure: vi.fn()
  }
}))

vi.mock('../../../../../trigger/init', () => ({}))

vi.mock('../../../../../server/utils/planned-workout-structure-trigger', () => ({
  enqueuePlannedWorkoutStructureGeneration: vi.fn()
}))

vi.mock('../../../../../server/utils/intervals-sync', () => ({
  autoUploadPlannedWorkoutToIntervalsIfEnabled: vi.fn(),
  syncPlannedWorkoutToIntervals: vi.fn()
}))

vi.mock('../../../../../server/utils/intervals', () => ({
  isIntervalsEventId: vi.fn(() => false)
}))

const getHandler = async () => {
  const mod = await import('../../../../../server/api/recommendations/[id]/accept.post')
  return mod.default
}

describe('POST /api/recommendations/[id]/accept', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(autoUploadPlannedWorkoutToIntervalsIfEnabled).mockResolvedValue({
      attempted: false,
      synced: false
    })
    vi.mocked(prisma.plannedWorkout.count).mockResolvedValue(1 as any)
    vi.mocked(syncPlannedWorkoutToIntervals).mockResolvedValue({
      success: true,
      synced: true
    } as any)
  })

  it('applies a recommendation to the linked active workout when the target is still safe', async () => {
    const handler = await getHandler()

    vi.mocked(prisma.activityRecommendation.findUnique).mockResolvedValue({
      id: 'rec-1',
      userId: 'user-1',
      date: new Date('2026-03-12T00:00:00Z'),
      userAccepted: false,
      plannedWorkoutId: 'planned-1',
      analysisJson: {
        guardrails: {
          targetPlannedWorkout: {
            id: 'planned-1',
            updatedAt: '2026-03-12T06:00:00.000Z'
          }
        },
        suggested_modifications: {
          description: 'Take the rest of the day off.',
          new_type: 'Rest',
          new_duration_min: 0,
          new_tss: 0
        }
      },
      plannedWorkout: {
        id: 'planned-1',
        title: 'Long Endurance Ride',
        completed: false,
        completionStatus: 'PENDING',
        completedWorkouts: [],
        updatedAt: new Date('2026-03-12T06:00:00.000Z'),
        syncStatus: 'LOCAL_ONLY'
      }
    } as any)

    vi.mocked(prisma.plannedWorkout.update).mockResolvedValue({
      id: 'planned-1',
      type: 'Rest',
      syncStatus: 'LOCAL_ONLY',
      externalId: 'ai_gen_user-1_2026-03-12_1',
      date: new Date('2026-03-12T00:00:00Z'),
      title: 'Rest Day',
      description: 'Take the rest of the day off.',
      durationSec: 0,
      tss: 0,
      managedBy: 'COACH_WATTS'
    } as any)

    const result = await handler({ context: { params: { id: 'rec-1' } } } as any)

    expect(prisma.plannedWorkout.update).toHaveBeenCalledWith({
      where: { id: 'planned-1' },
      data: expect.objectContaining({
        title: 'Rest Day',
        type: 'Rest',
        durationSec: 0,
        tss: 0
      })
    })
    expect(tasks.trigger).not.toHaveBeenCalled()
    expect(result).toEqual({
      success: true,
      message: 'Workout updated successfully'
    })
  })

  it('recovers the saved target for legacy recommendations missing the workout relation', async () => {
    const handler = await getHandler()

    vi.mocked(prisma.activityRecommendation.findUnique).mockResolvedValue({
      id: 'rec-legacy',
      userId: 'user-1',
      date: new Date('2026-03-12T00:00:00Z'),
      userAccepted: false,
      plannedWorkoutId: null,
      analysisJson: {
        guardrails: {
          targetPlannedWorkout: { id: 'planned-1', updatedAt: '2026-03-12T06:00:00.000Z' }
        },
        suggested_modifications: {
          description: 'Take the rest of the day off.',
          new_type: 'Rest',
          new_duration_min: 0,
          new_tss: 0
        }
      },
      plannedWorkout: null
    } as any)
    vi.mocked(prisma.plannedWorkout.findFirst).mockResolvedValue({
      id: 'planned-1',
      title: 'Long Endurance Ride',
      completed: false,
      completionStatus: 'PENDING',
      completedWorkouts: [],
      updatedAt: new Date('2026-03-12T06:00:00.000Z'),
      syncStatus: 'LOCAL_ONLY'
    } as any)
    vi.mocked(prisma.plannedWorkout.update).mockResolvedValue({
      id: 'planned-1',
      type: 'Rest',
      syncStatus: 'LOCAL_ONLY',
      externalId: 'ai_gen_user-1_2026-03-12_1',
      date: new Date('2026-03-12T00:00:00Z'),
      title: 'Rest Day',
      description: 'Take the rest of the day off.',
      durationSec: 0,
      tss: 0,
      managedBy: 'COACH_WATTS'
    } as any)

    await expect(handler({ context: { params: { id: 'rec-legacy' } } } as any)).resolves.toEqual({
      success: true,
      message: 'Workout updated successfully'
    })

    expect(prisma.plannedWorkout.findFirst).toHaveBeenCalledWith({
      where: { id: 'planned-1', userId: 'user-1' },
      include: { completedWorkouts: true }
    })
    expect(prisma.plannedWorkout.update).toHaveBeenCalledWith({
      where: { id: 'planned-1' },
      data: expect.objectContaining({ type: 'Rest' })
    })
    expect(prisma.activityRecommendation.update).toHaveBeenCalledWith({
      where: { id: 'rec-legacy' },
      data: { userAccepted: true, plannedWorkoutId: 'planned-1' }
    })
  })

  it('fails safely when the linked workout is already completed', async () => {
    const handler = await getHandler()

    vi.mocked(prisma.activityRecommendation.findUnique).mockResolvedValue({
      id: 'rec-1',
      userId: 'user-1',
      date: new Date('2026-03-12T00:00:00Z'),
      userAccepted: false,
      plannedWorkoutId: 'planned-1',
      analysisJson: {
        guardrails: {
          targetPlannedWorkout: {
            id: 'planned-1',
            updatedAt: '2026-03-12T06:00:00.000Z'
          }
        },
        suggested_modifications: {
          description: 'Take the rest of the day off.',
          new_type: 'Rest',
          new_duration_min: 0,
          new_tss: 0
        }
      },
      plannedWorkout: {
        id: 'planned-1',
        title: 'Long Endurance Ride',
        completed: true,
        completionStatus: 'COMPLETED',
        completedWorkouts: [{ id: 'done-1' }],
        updatedAt: new Date('2026-03-12T06:00:00.000Z'),
        syncStatus: 'LOCAL_ONLY'
      }
    } as any)

    await expect(handler({ context: { params: { id: 'rec-1' } } } as any)).rejects.toMatchObject({
      statusCode: 409,
      message:
        'This recommendation targets a workout that is already completed. Refresh today’s guidance before applying changes.'
    })

    expect(prisma.plannedWorkout.update).not.toHaveBeenCalled()
    expect(prisma.plannedWorkout.create).not.toHaveBeenCalled()
  })

  it('fails safely when the workout changed after recommendation generation', async () => {
    const handler = await getHandler()

    vi.mocked(prisma.activityRecommendation.findUnique).mockResolvedValue({
      id: 'rec-1',
      userId: 'user-1',
      date: new Date('2026-03-12T00:00:00Z'),
      userAccepted: false,
      plannedWorkoutId: 'planned-1',
      analysisJson: {
        guardrails: {
          targetPlannedWorkout: {
            id: 'planned-1',
            updatedAt: '2026-03-12T06:00:00.000Z'
          }
        },
        suggested_modifications: {
          description: 'Take the rest of the day off.',
          new_type: 'Rest',
          new_duration_min: 0,
          new_tss: 0
        }
      },
      plannedWorkout: {
        id: 'planned-1',
        title: 'Long Endurance Ride',
        completed: false,
        completionStatus: 'PENDING',
        completedWorkouts: [],
        updatedAt: new Date('2026-03-12T06:05:00.000Z'),
        syncStatus: 'LOCAL_ONLY'
      }
    } as any)

    await expect(handler({ context: { params: { id: 'rec-1' } } } as any)).rejects.toMatchObject({
      statusCode: 409,
      message:
        'That workout changed after this recommendation was generated. Refresh today’s guidance before applying changes.'
    })

    expect(prisma.plannedWorkout.update).not.toHaveBeenCalled()
  })

  it('fails safely when the day now has multiple active planned workouts', async () => {
    const handler = await getHandler()

    vi.mocked(prisma.plannedWorkout.count).mockResolvedValue(2 as any)
    vi.mocked(prisma.activityRecommendation.findUnique).mockResolvedValue({
      id: 'rec-1',
      userId: 'user-1',
      date: new Date('2026-03-12T00:00:00Z'),
      userAccepted: false,
      plannedWorkoutId: 'planned-1',
      analysisJson: {
        guardrails: {
          targetPlannedWorkout: {
            id: 'planned-1',
            updatedAt: '2026-03-12T06:00:00.000Z'
          }
        },
        suggested_modifications: {
          description: 'Take the rest of the day off.',
          new_type: 'Rest',
          new_duration_min: 0,
          new_tss: 0
        }
      },
      plannedWorkout: {
        id: 'planned-1',
        title: 'Long Endurance Ride',
        completed: false,
        completionStatus: 'PENDING',
        completedWorkouts: [],
        updatedAt: new Date('2026-03-12T06:00:00.000Z'),
        syncStatus: 'LOCAL_ONLY'
      }
    } as any)

    await expect(handler({ context: { params: { id: 'rec-1' } } } as any)).rejects.toMatchObject({
      statusCode: 409,
      message:
        'This day now has multiple planned workouts, so the recommendation target is ambiguous. Refresh today’s guidance before applying changes.'
    })

    expect(prisma.plannedWorkout.update).not.toHaveBeenCalled()
  })

  it('creates a planned workout when an untargeted recommendation is accepted on an empty day', async () => {
    const handler = await getHandler()

    vi.mocked(prisma.plannedWorkout.count).mockResolvedValue(0 as any)
    vi.mocked(prisma.activityRecommendation.findUnique).mockResolvedValue({
      id: 'rec-1',
      userId: 'user-1',
      date: new Date('2026-03-12T00:00:00Z'),
      userAccepted: false,
      plannedWorkoutId: null,
      analysisJson: {
        guardrails: {
          targetPlannedWorkout: null,
          plannedWorkoutCandidateCount: 0
        },
        suggested_modifications: {
          description: 'Take a complete rest day.',
          new_type: 'Rest',
          new_title: 'Rest Day',
          new_duration_min: 0,
          new_tss: 0
        }
      },
      plannedWorkout: null
    } as any)

    vi.mocked(prisma.plannedWorkout.create).mockResolvedValue({
      id: 'planned-1',
      userId: 'user-1',
      type: 'Rest',
      syncStatus: 'LOCAL_ONLY',
      externalId: 'recommendation-rec-1',
      date: new Date('2026-03-12T00:00:00Z'),
      title: 'Rest Day',
      description: 'Take a complete rest day.',
      durationSec: 0,
      tss: 0,
      managedBy: 'COACH_WATTS'
    } as any)

    const result = await handler({ context: { params: { id: 'rec-1' } } } as any)

    expect(prisma.plannedWorkout.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        externalId: 'recommendation-rec-1',
        date: new Date('2026-03-12T00:00:00Z'),
        title: 'Rest Day',
        type: 'Rest',
        durationSec: 0,
        tss: 0,
        managedBy: 'COACH_WATTS'
      })
    })
    expect(prisma.activityRecommendation.update).toHaveBeenCalledWith({
      where: { id: 'rec-1' },
      data: {
        userAccepted: true,
        plannedWorkoutId: 'planned-1'
      }
    })
    expect(tasks.trigger).not.toHaveBeenCalled()
    expect(result).toEqual({
      success: true,
      message: 'Workout updated successfully'
    })
  })
})
