function hasNonEmptySteps(steps: unknown): boolean {
  return Array.isArray(steps) && steps.length > 0
}

function hasRenderableStrengthBlocks(blocks: unknown): boolean {
  if (!Array.isArray(blocks) || blocks.length === 0) return false
  return blocks.some(
    (block) =>
      block &&
      typeof block === 'object' &&
      Array.isArray((block as any).steps) &&
      (block as any).steps.length > 0
  )
}

const RECOVERY_TYPES = new Set(['rest', 'cooldown'])
const RECOVERY_INTENTS = new Set(['recovery', 'rest', 'easy'])
const NON_WORK_TYPES = new Set(['rest', 'cooldown', 'warmup'])

function isRecoveryStep(step: any): boolean {
  if (!step || typeof step !== 'object') return false
  const type = String(step.type || '').toLowerCase()
  const intent = String(step.intent || '').toLowerCase()
  if (RECOVERY_TYPES.has(type) || RECOVERY_INTENTS.has(intent)) return true
  return (Number(step.restSeconds) || 0) > 0
}

/**
 * A leaf work step: an effort the athlete actually performs, not a rest,
 * cooldown, warmup, or a repeat/container block.
 */
function isLeafWorkStep(step: any): boolean {
  if (!step || typeof step !== 'object') return false
  if (Array.isArray(step.steps) && step.steps.length > 0) return false
  if (Number(step.reps ?? step.repeat ?? step.intervals ?? 1) > 1) return false
  if (isRecoveryStep(step)) return false
  return !NON_WORK_TYPES.has(String(step.type || '').toLowerCase())
}

/**
 * Canonical description of a work step's prescription. Two steps sharing this
 * key are the same effort repeated, not a progression or an over-under.
 */
function workStepSignature(step: any): string {
  const duration = Number(step.durationSeconds) || Number(step.duration) || 0
  const distance = Number(step.distanceMeters) || Number(step.distance) || 0
  const power = step.power
  let powerKey = 'none'
  if (power && typeof power === 'object') {
    powerKey = power.range ? `r:${power.range.start}-${power.range.end}` : `v:${power.value ?? ''}`
  } else if (power != null) {
    powerKey = `v:${power}`
  }
  return `${duration}|${distance}|${powerKey}`
}

/**
 * Catches repeat sets the model emitted *flattened* — e.g. "3 x 8min at
 * threshold" written as three consecutive identical Active steps with no
 * recovery between them, and no repeat wrapper.
 *
 * `hasValidRepeatBlockRecovery` only inspects steps with `reps > 1`, so a
 * flattened set has no step it examines and passes untouched. The athlete then
 * receives what is effectively one continuous 24-minute threshold block.
 *
 * Only *identical* consecutive efforts are rejected: differing power or
 * duration means a progression, ramp, or over-under, which is legitimately
 * continuous.
 */
function findFlattenedRepeatWithoutRecovery(steps: any[]): string | null {
  let runSignature: string | null = null
  let runLength = 0
  let runName = 'Interval'

  const violation = () =>
    `${runLength} consecutive "${runName}" work steps appear with no recovery between them (flattened repeat set)`

  for (const step of steps) {
    const signature = isLeafWorkStep(step) ? workStepSignature(step) : null

    // A step with neither duration nor distance carries no prescription to
    // compare, so it breaks the run rather than matching everything.
    if (!signature || signature.startsWith('0|0|')) {
      if (runLength > 1) return violation()
      runSignature = null
      runLength = 0
      continue
    }

    if (signature === runSignature) {
      runLength += 1
    } else {
      if (runLength > 1) return violation()
      runSignature = signature
      runLength = 1
      runName = step.name || step.text || 'Interval'
    }
  }

  return runLength > 1 ? violation() : null
}

export function hasValidRepeatBlockRecovery(steps: unknown): {
  valid: boolean
  reason: string | null
} {
  if (!Array.isArray(steps)) return { valid: true, reason: null }

  const flattened = findFlattenedRepeatWithoutRecovery(steps)
  if (flattened) return { valid: false, reason: flattened }

  for (const step of steps) {
    if (!step || typeof step !== 'object') continue

    const reps = Number((step as any).reps ?? (step as any).repeat ?? (step as any).intervals ?? 1)
    const hasSubSteps = Array.isArray((step as any).steps) && (step as any).steps.length > 0

    if (reps > 1) {
      if (!hasSubSteps) {
        const restSec = Number((step as any).restSeconds) || 0
        if (restSec <= 0) {
          const stepName = (step as any).name || 'Interval'
          return {
            valid: false,
            reason: `repeat block "${stepName}" with ${reps} reps lacks recovery/rest steps`
          }
        }
      } else {
        const childSteps = (step as any).steps as any[]
        const hasNonZeroRecovery = childSteps.some((child: any) => {
          if (!child || typeof child !== 'object') return false
          const childType = String(child.type || '').toLowerCase()
          const childIntent = String(child.intent || '').toLowerCase()
          const durationSec = Number(child.durationSeconds) || Number(child.duration) || 0
          const distM = Number(child.distanceMeters) || Number(child.distance) || 0
          const restSec = Number(child.restSeconds) || 0

          const isRecoveryTypeOrIntent =
            childType === 'rest' ||
            childType === 'cooldown' ||
            childIntent === 'recovery' ||
            childIntent === 'rest' ||
            childIntent === 'easy'

          const hasDurationOrDistanceOrRest = durationSec > 0 || distM > 0 || restSec > 0

          if (isRecoveryTypeOrIntent && hasDurationOrDistanceOrRest) return true
          if (restSec > 0) return true

          if (Array.isArray(child.steps) && child.steps.length > 0) {
            const childReps = Number(child.reps ?? child.repeat ?? child.intervals ?? 1)
            if (childReps > 1) {
              const nestedRes = hasValidRepeatBlockRecovery([child])
              return nestedRes.valid
            }
          }

          return false
        })

        if (!hasNonZeroRecovery) {
          const stepName = (step as any).name || 'Interval'
          return {
            valid: false,
            reason: `repeat block "${stepName}" with ${reps} reps lacks recovery/rest steps`
          }
        }
      }
    }

    if (hasSubSteps) {
      const childCheck = hasValidRepeatBlockRecovery((step as any).steps)
      if (!childCheck.valid) return childCheck
    }
  }

  return { valid: true, reason: null }
}

export function assertRenderableStructure(
  structure: unknown,
  workoutType?: string | null
): { valid: boolean; reason: string | null } {
  if (!structure || typeof structure !== 'object' || Array.isArray(structure)) {
    return { valid: false, reason: 'structure payload is missing or invalid' }
  }

  const payload = structure as Record<string, unknown>
  const hasSteps = hasNonEmptySteps(payload.steps)
  const hasExercises = hasNonEmptySteps(payload.exercises)
  const hasBlocks = hasRenderableStrengthBlocks(payload.blocks)

  if (hasSteps || hasExercises || hasBlocks) {
    return { valid: true, reason: null }
  }

  const normalizedType = String(workoutType || '').toLowerCase()
  if (normalizedType.includes('gym') || normalizedType.includes('weight')) {
    return {
      valid: false,
      reason: 'strength structure has no blocks with exercise steps'
    }
  }

  return {
    valid: false,
    reason: 'structure has no steps, exercises, or blocks'
  }
}
