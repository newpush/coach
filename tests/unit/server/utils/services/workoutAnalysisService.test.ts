import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  convertWorkoutAnalysisToMarkdown,
  runWorkoutAnalysis
} from '../../../../../server/utils/services/workoutAnalysisService'
// CW-392: the payload builder now lives in the shared prompt module, which both the
// service and the Trigger.dev task consume. CW-403 moved the response schema, the
// StructuredAnalysis type and the score clamp there too; the service imports them
// without re-exporting (server/utils is Nitro auto-imported).
import {
  buildWorkoutAnalysisData,
  type StructuredAnalysis
} from '../../../../../server/utils/services/workout-analysis-prompt'
import { prisma } from '../../../../../server/utils/db'
import { workoutRepository } from '../../../../../server/utils/repositories/workoutRepository'
import { hasTaskHandler, getTaskHandler } from '../../../../../server/utils/task-registry'

vi.mock('../../../../../server/utils/db', () => ({
  prisma: {
    workout: {
      findUnique: vi.fn()
    },
    user: {
      findUnique: vi.fn()
    },
    emailPreference: {
      findUnique: vi.fn()
    },
    athleteJourneyEvent: {
      findMany: vi.fn().mockResolvedValue([])
    }
  }
}))

vi.mock('../../../../../server/utils/repositories/workoutRepository', () => ({
  workoutRepository: {
    updateStatus: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({})
  }
}))

vi.mock('../../../../../server/utils/repositories/workoutStreamRepository', () => ({
  attachStreamToWorkout: vi.fn((workout) => Promise.resolve(workout))
}))

vi.mock('../../../../../server/utils/date', () => ({
  getUserTimezone: vi.fn().mockResolvedValue('UTC'),
  formatUserDate: vi.fn((date) =>
    date instanceof Date ? date.toISOString().split('T')[0] : '2026-03-15'
  ),
  calculateAge: vi.fn().mockReturnValue(30),
  getUserLocalDate: vi.fn().mockReturnValue('2026-03-15')
}))

describe('Workout Analysis Service', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('registers analyze-workout task handler automatically', () => {
    expect(hasTaskHandler('analyze-workout')).toBe(true)
    expect(getTaskHandler('analyze-workout')).toBe(runWorkoutAnalysis)
  })

  it('formats workout analysis data accurately', () => {
    const rawWorkout = {
      title: 'Tempo Ride',
      type: 'Ride',
      date: new Date('2026-03-15T10:00:00Z'),
      durationSec: 3600,
      distanceMeters: 30000,
      averageHr: 150,
      maxHr: 175,
      averageWatts: 220,
      normalizedPower: 235,
      tss: 75
    }

    const formatted = buildWorkoutAnalysisData(rawWorkout)

    expect(formatted.title).toBe('Tempo Ride')
    expect(formatted.duration_m).toBe(60)
    expect(formatted.avg_hr).toBe(150)
    expect(formatted.avg_power).toBe(220)
    expect(formatted.normalized_power).toBe(235)
  })

  it('converts structured JSON analysis to clean markdown output', () => {
    const structured: StructuredAnalysis = {
      type: 'workout',
      title: 'Endurance Run Analysis',
      executive_summary: 'Solid steady-state run with excellent pacing.',
      // CW-403: the unified schema is the 1-10 scale, matching the stored *Score columns.
      scores: {
        overall: 9,
        overall_explanation: 'Strong execution throughout.',
        technical: 9,
        technical_explanation: 'Cadence remained stable at 172 rpm.',
        effort: 8,
        effort_explanation: 'Heart rate stayed within Zone 2 targets.',
        pacing: 9,
        pacing_explanation: 'Negative split in final 5km.',
        execution: 9,
        execution_explanation: 'Followed prescribed workout steps.'
      },
      sections: [
        {
          title: 'Pacing & Cadence',
          status: 'excellent',
          status_label: 'Excellent Pacing',
          analysis_points: ['Maintained consistent split times across all intervals.']
        }
      ]
    }

    const md = convertWorkoutAnalysisToMarkdown(structured)

    expect(md).toContain('# Endurance Run Analysis')
    expect(md).toContain('Solid steady-state run with excellent pacing.')
    expect(md).toContain('## Pacing & Cadence')
    expect(md).toContain('**Status**: Excellent Pacing')
    expect(md).toContain('- Maintained consistent split times across all intervals.')
  })

  it('skips empty workouts missing telemetric or exercise data', async () => {
    vi.mocked(prisma.workout.findUnique).mockResolvedValueOnce({
      id: 'empty_w1',
      userId: 'u1',
      date: new Date('2026-03-15T10:00:00Z'),
      durationSec: 0,
      distanceMeters: 0,
      averageWatts: null,
      averageHr: null,
      streams: null,
      exercises: []
    } as any)

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ dob: null } as any)

    const result = await runWorkoutAnalysis({ workoutId: 'empty_w1', source: 'MANUAL' })

    expect(result).toEqual({ success: true, skipped: true, reason: 'EMPTY_SESSION' })
    expect(workoutRepository.updateStatus).toHaveBeenCalledWith('empty_w1', 'SKIPPED_EMPTY')
  })
})
