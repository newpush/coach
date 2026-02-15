import { create } from 'xmlbuilder2'
import { FitWriter } from '@markw65/fit-file-writer'

interface WorkoutStep {
  type: 'Warmup' | 'Active' | 'Rest' | 'Cooldown'
  durationSeconds?: number
  duration?: number
  distance?: number
  power?: {
    value?: number
    range?: { start: number; end: number }
  }
  heartRate?: {
    value?: number
    range?: { start: number; end: number }
  }
  pace?: {
    value?: number
    range?: { start: number; end: number }
  }
  cadence?: number
  name?: string
  steps?: WorkoutStep[]
  reps?: number
}

interface WorkoutMessage {
  timestamp: number
  text: string
  duration?: number
}

interface WorkoutData {
  title: string
  description: string
  type?: string
  author?: string
  steps: WorkoutStep[]
  exercises?: any[]
  messages?: WorkoutMessage[]
  ftp?: number // Optional, for calculating absolute watts if needed
  sportSettings?: {
    loadPreference?: string | null
    intervalsHrRangeTolerancePct?: number | null
  }
}

export const WorkoutConverter = {
  toZWO(workout: WorkoutData): string {
    const root = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('workout_file')
      .ele('author')
      .txt(workout.author || 'Coach Wattz')
      .up()
      .ele('name')
      .txt(workout.title)
      .up()
      .ele('description')
      .txt(workout.description)
      .up()
      .ele('sportType')
      .txt('bike')
      .up()
      .ele('tags')
      .up()
      .ele('workout')

    workout.steps.forEach((step) => {
      // Safely access power
      const power = step.power || { value: 0 }
      const duration = step.durationSeconds || step.duration || 0

      // If we only have Heart Rate, ZWO is not the best format but we can try to approximate or just use 0 power
      // Zwift is primarily power-based.

      // ZWO uses percentage of FTP (0.0 - 1.0+)
      if (power.range) {
        // Ramp
        // Zwift uses <Ramp> or <Warmup>/<Cooldown> with PowerLow/PowerHigh
        const isWarmup = step.type === 'Warmup'
        const isCooldown = step.type === 'Cooldown'

        let tagName = 'Ramp'
        if (isWarmup) tagName = 'Warmup'
        else if (isCooldown) tagName = 'Cooldown'

        const el = root
          .ele(tagName)
          .att('Duration', String(duration))
          .att('PowerLow', String(power.range.start ?? 0))
          .att('PowerHigh', String(power.range.end ?? 0))

        if (step.cadence) el.att('Cadence', String(step.cadence))
        if (step.name) el.att('Text', step.name)
        el.up()
      } else {
        // Steady State
        const el = root
          .ele('SteadyState')
          .att('Duration', String(duration))
          .att('Power', String(power.value || 0))

        if (step.cadence) el.att('Cadence', String(step.cadence))
        if (step.name) el.att('Text', step.name) // Zwift displays this on screen
        el.up()
      }
    })

    if (workout.messages) {
      workout.messages.forEach((msg) => {
        root
          .ele('textEvent')
          .att('timeoffset', String(msg.timestamp))
          .att('message', msg.text)
          .att('duration', String(msg.duration || 10))
          .up()
      })
    }

    return root.end({ prettyPrint: true })
  },

  toFIT(workout: WorkoutData): Uint8Array {
    const fitWriter = new FitWriter()

    // FIT Epoch: Dec 31, 1989 00:00:00 UTC
    const toFitTimestamp = (date: Date) => Math.round(date.getTime() / 1000) - 631065600

    // 1. File ID
    fitWriter.writeMessage('file_id', {
      type: 'workout',
      manufacturer: 'garmin',
      product: 0,
      serial_number: 0,
      time_created: toFitTimestamp(new Date()),
      number: 0,
      product_name: 'Coach Wattz'
    })

    // 2. Workout Message
    fitWriter.writeMessage('workout', {
      wkt_name: workout.title.substring(0, 15), // Max chars often limited
      sport: 'cycling',
      sub_sport: 'generic',
      num_valid_steps: workout.steps.length
    })

    // 3. Workout Steps
    workout.steps.forEach((step, index) => {
      // Safely access power
      const power = step.power || { value: 0 }
      const isRamp = !!power.range

      // Target Value: Power
      // 1000 = 100% FTP?
      // According to FIT SDK, 'power' steps typically use:
      // target_type: 'power_3s' or 'power_10s' or 'power_30s' or 'power_lap'
      // BUT for workout steps, we define intensity target.
      // target_type: 0 (speed), 1 (heart_rate), 2 (open), 3 (cadence), 4 (power)

      let targetType: 'power' | 'heart_rate' | 'open' = 'power' // 4
      let customTargetValueLow = 0
      let customTargetValueHigh = 0

      // Check if HR based
      if (!power.value && !power.range && step.heartRate) {
        // targetType = 'heart_rate'; // 1

        // HR values are typically BPM in FIT files, or % max HR?
        // FIT SDK usually expects BPM for absolute values.
        // But we store % LTHR.
        // We'd need the user's LTHR to convert to BPM.
        // Or we use zone numbers (1-5).

        // For now, let's assume we can't easily export HR targets without knowing absolute BPM zones reliably here.
        // We'll skip complex HR export logic for FIT for now or use open targets.
        targetType = 'open' // 2
      } else {
        // Let's calculate ABSOLUTE WATTS if FTP is provided, otherwise fallback to a default 250W.
        const ftp = workout.ftp || 250

        if (isRamp && power.range) {
          customTargetValueLow = Math.round((power.range.start ?? 0) * ftp)
          customTargetValueHigh = Math.round((power.range.end ?? 0) * ftp)
        } else {
          // Steady: Low and High define the zone window.
          // Usually target - 5% to target + 5%
          const val = (power.value || 0) * ftp
          customTargetValueLow = Math.round(val - 10)
          customTargetValueHigh = Math.round(val + 10)
        }
      }

      fitWriter.writeMessage('workout_step', {
        message_index: { value: index },
        wkt_step_name: step.name ? step.name.substring(0, 15) : undefined,
        duration_type: 'time', // 0
        duration_value: (step.durationSeconds || step.duration || 0) * 1000, // ms
        target_type: targetType,
        // Let's use raw Watts.
        custom_target_value_low: customTargetValueLow,
        custom_target_value_high: customTargetValueHigh,

        intensity:
          step.type === 'Active'
            ? 'active'
            : step.type === 'Rest'
              ? 'rest'
              : step.type === 'Warmup'
                ? 'warmup'
                : 'cooldown'
      })
    })

    const result = fitWriter.finish()
    // Convert DataView to Uint8Array to satisfy response requirements
    return new Uint8Array(result.buffer, result.byteOffset, result.byteLength)
  },

  toMRC(workout: WorkoutData): string {
    const lines: string[] = []
    lines.push('[COURSE HEADER]')
    lines.push('VERSION = 2')
    lines.push('UNITS = ENGLISH')
    lines.push(`DESCRIPTION = ${workout.description.replace(/[\r\n]+/g, ' ')}`)
    lines.push(`FILE NAME = ${workout.title}`)
    lines.push('MINUTES PERCENT')
    lines.push('[END COURSE HEADER]')
    lines.push('[COURSE DATA]')

    let currentTime = 0

    workout.steps.forEach((step) => {
      const durationMins = (step.durationSeconds || step.duration || 0) / 60
      const endTime = currentTime + durationMins

      // Safely access power
      const power = step.power || { value: 0 }

      // Calculate start and end power as percentage (0-100)
      let startPercent = 0
      let endPercent = 0

      if (power.range) {
        startPercent = (power.range.start ?? 0) * 100
        endPercent = (power.range.end ?? 0) * 100
      } else {
        startPercent = (power.value || 0) * 100
        endPercent = startPercent
      }

      // Add points
      // Format: Time(min) Value(%)
      lines.push(`${currentTime.toFixed(2)}	${startPercent.toFixed(0)}`)
      lines.push(`${endTime.toFixed(2)}	${endPercent.toFixed(0)}`)

      currentTime = endTime
    })

    lines.push('[END COURSE DATA]')
    return lines.join('\r\n')
  },

  toERG(workout: WorkoutData): string {
    const lines: string[] = []
    const ftp = workout.ftp || 250 // Fallback FTP

    lines.push('[COURSE HEADER]')
    lines.push('VERSION = 2')
    lines.push('UNITS = ENGLISH') // ERG standard often uses ENGLISH even for metric users, refers to formatting
    lines.push(`DESCRIPTION = ${workout.description.replace(/[\r\n]+/g, ' ')}`)
    lines.push(`FILE NAME = ${workout.title}`)
    lines.push(`FTP = ${ftp}`)
    lines.push('MINUTES WATTS')
    lines.push('[END COURSE HEADER]')
    lines.push('[COURSE DATA]')

    let currentTime = 0

    workout.steps.forEach((step) => {
      const durationMins = (step.durationSeconds || step.duration || 0) / 60
      const endTime = currentTime + durationMins

      // Safely access power
      const power = step.power || { value: 0 }

      // Calculate start and end power in Watts
      let startWatts = 0
      let endWatts = 0

      if (power.range) {
        startWatts = (power.range.start ?? 0) * ftp
        endWatts = (power.range.end ?? 0) * ftp
      } else {
        startWatts = (power.value || 0) * ftp
        endWatts = startWatts
      }

      // Add points
      lines.push(`${currentTime.toFixed(2)}	${Math.round(startWatts)}`)
      lines.push(`${endTime.toFixed(2)}	${Math.round(endWatts)}`)

      currentTime = endTime
    })

    lines.push('[END COURSE DATA]')
    return lines.join('\r\n')
  },

  toIntervalsICU(workout: WorkoutData): string {
    const lines: string[] = []
    const normalizeTarget = (
      target: any
    ): { value?: number; range?: { start: number; end: number } } | null => {
      if (target === null || target === undefined) return null

      if (Array.isArray(target)) {
        if (target.length >= 2) {
          return { range: { start: Number(target[0]) || 0, end: Number(target[1]) || 0 } }
        }
        if (target.length === 1) {
          return { value: Number(target[0]) || 0 }
        }
        return null
      }

      if (typeof target === 'number') {
        return { value: target }
      }

      if (typeof target === 'object') {
        if (target.range && typeof target.range === 'object') {
          return {
            range: {
              start: Number(target.range.start) || 0,
              end: Number(target.range.end) || 0
            }
          }
        }
        if (target.start !== undefined && target.end !== undefined) {
          return {
            range: {
              start: Number(target.start) || 0,
              end: Number(target.end) || 0
            }
          }
        }
        if (target.value !== undefined) {
          return { value: Number(target.value) || 0 }
        }
      }

      return null
    }

    // Handle Strength Exercises
    if (workout.exercises && workout.exercises.length > 0) {
      // Add description as a preamble if available
      if (workout.description) {
        lines.push(workout.description.trim())
        lines.push('') // Add empty line to separate description from steps
      }

      workout.exercises.forEach((ex) => {
        // Line 1: Name (Bold)
        lines.push(`- **${ex.name}**`)

        // Line 2: Details (Sets x Reps @ Weight)
        let details = ''
        if (ex.sets) details += `${ex.sets} sets`
        if (ex.reps) details += ` x ${ex.reps} reps`
        if (ex.weight) details += ` @ ${ex.weight}`
        if (details) lines.push(`  - ${details}`)

        // Line 3: Rest
        if (ex.rest) {
          lines.push(`  - Rest: ${ex.rest}`)
        }

        // Line 4: Note
        if (ex.notes) {
          lines.push(`  - Note: ${ex.notes}`)
        }

        // Spacer
        lines.push('')
      })

      return lines.join('\n').trim()
    }

    // Determine preference (e.g. 'hr_power_pace' -> prioritize HR)
    const loadPref = workout.sportSettings?.loadPreference?.toLowerCase() || ''
    const prioritizeHr = loadPref.startsWith('hr')
    const isSwim = workout.type?.toLowerCase().includes('swim')
    const rawHrTolerancePct = Number(workout.sportSettings?.intervalsHrRangeTolerancePct || 0)
    const hrTolerancePct =
      rawHrTolerancePct > 1 ? rawHrTolerancePct / 100 : Math.max(0, rawHrTolerancePct)
    const normalizeHrTargetForExport = (
      target: { value?: number; range?: { start: number; end: number } } | null
    ) => {
      if (!target) return null
      if (target.range) return target
      if (typeof target.value !== 'number') return target
      if (hrTolerancePct <= 0) return target

      const start = Math.max(0, target.value - hrTolerancePct)
      const end = target.value + hrTolerancePct
      return { range: { start, end } }
    }

    // Add description as a preamble if available
    // We filter out lines starting with "-" to avoid Intervals.icu misinterpreting
    // summary bullet points as actual workout steps.
    if (workout.description) {
      const cleanPreamble = workout.description
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('-'))
        .join('\n')

      if (cleanPreamble) {
        lines.push(cleanPreamble)
        lines.push('')
      }
    }

    let currentType = ''
    const preamble = workout.description?.toLowerCase() || ''

    const formatSteps = (
      steps: WorkoutStep[],
      indent = '',
      parentStep: WorkoutStep | null = null
    ) => {
      steps.forEach((step, index) => {
        // 1. Add header if type changes (only at root level)
        if (indent === '') {
          let header = ''
          if (index === 0 && step.type === 'Warmup') {
            header = 'Warmup'
          } else if (step.type === 'Cooldown' && currentType !== 'Cooldown') {
            header = '\nCooldown'
          } else if (step.type === 'Active' && currentType === 'Warmup') {
            header = '\nMain Set'
          }

          if (header) {
            const cleanHeader = header.trim().toLowerCase()
            const lastLineRaw = lines.length > 0 ? lines[lines.length - 1] : ''
            const lastLine = lastLineRaw ? lastLineRaw.trim().toLowerCase() : ''

            // Avoid adding header if it's already redundant with preamble or previous line
            const isRedundant =
              preamble.startsWith(cleanHeader) ||
              preamble.includes(`\n${cleanHeader}`) ||
              lastLine === cleanHeader

            if (!isRedundant) {
              lines.push(header)
            }
          }
          currentType = step.type
        }

        // 2. Handle nested loops
        if (step.steps && step.steps.length > 0) {
          const reps = step.reps || 1
          if (reps > 1) {
            const lastLine = lines.length > 0 ? lines[lines.length - 1] : null
            if (lastLine && typeof lastLine === 'string' && !lastLine.endsWith('\n')) {
              lines.push('')
            }
            lines.push(`${indent}${reps}x`)
            formatSteps(step.steps, indent + ' ', step)
          } else {
            formatSteps(step.steps, indent, step)
          }
          return
        }

        // 3. Safely access targets (inherit from parent if missing)
        const power = normalizeTarget(step.power) || normalizeTarget(parentStep?.power)
        const heartRate = normalizeHrTargetForExport(
          normalizeTarget(step.heartRate) || normalizeTarget(parentStep?.heartRate)
        )
        const pace = normalizeTarget(step.pace) || normalizeTarget(parentStep?.pace)

        // Format distance
        let distanceStr = ''
        if (step.distance) {
          distanceStr = `${step.distance}mtrs`
        }

        // Format duration
        let durationStr = ''
        const duration = step.durationSeconds || step.duration || 0
        const isRun = !isSwim && workout.type?.toLowerCase().includes('run')
        const shouldIncludeDuration = !isSwim || !step.distance || step.type === 'Rest'

        if (duration > 0 && shouldIncludeDuration) {
          if (duration % 60 === 0) durationStr = `${duration / 60}m`
          else durationStr = `${duration}s`
        }

        // Format intensity string - For RUNS, we only want ONE target
        const intensities: string[] = []

        const getPowerStr = () => {
          if (!power) return ''
          if (power.range) {
            const start = Math.round((power.range.start ?? 0) * 100)
            const end = Math.round((power.range.end ?? 0) * 100)
            if (start > 0 && end > 0) return `ramp ${start}-${end}%`
            if (start > 0 || end > 0) return `${start || end}%`
          } else if (power.value && power.value > 0.01) {
            return `${Math.round(power.value * 100)}%`
          }
          return ''
        }

        const getHrStr = () => {
          if (!heartRate) return ''
          if (heartRate.range) {
            const start = Math.round((heartRate.range.start ?? 0) * 100)
            const end = Math.round((heartRate.range.end ?? 0) * 100)
            if (start > 0 && end > 0) return `${start}-${end}% LTHR`
            if (start > 0 || end > 0) return `${start || end}% LTHR`
          } else if (heartRate.value && heartRate.value > 0.01) {
            return `${Math.round(heartRate.value * 100)}% LTHR`
          }
          return ''
        }

        const getPaceStr = () => {
          if (!pace) return ''
          if (pace.range) {
            const start = Math.round((pace.range.start ?? 0) * 100)
            const end = Math.round((pace.range.end ?? 0) * 100)
            if (start > 0 && end > 0) return `${start}-${end}% pace`
            if (start > 0 || end > 0) return `${start || end}% pace`
          } else if (pace.value && pace.value > 0.01) {
            return `${Math.round(pace.value * 100)}% pace`
          }
          return ''
        }

        if (isRun) {
          const hr = getHrStr()
          if (hr) intensities.push(hr)
          else {
            const pc = getPaceStr()
            if (pc) intensities.push(pc)
            else {
              const pw = getPowerStr()
              if (pw) intensities.push(pw)
            }
          }
        } else {
          if (prioritizeHr) {
            const hr = getHrStr()
            if (hr) intensities.push(hr)
            const pw = getPowerStr()
            if (pw) intensities.push(pw)
          } else {
            const pw = getPowerStr()
            if (pw) intensities.push(pw)
            const hr = getHrStr()
            if (hr) intensities.push(hr)
          }
          const pc = getPaceStr()
          if (pc) intensities.push(pc)
        }

        if (intensities.length === 0 && isRun && step.type !== 'Rest') {
          intensities.push('60% LTHR')
        }

        const intensityStr = intensities.join(' ')

        // 4. Construct Step Line
        let line = `${indent}-`
        let name = (step.name || (step.type === 'Rest' ? 'Rest' : '')).trim()

        // Clean names for conciseness (e.g. "5 minutes" -> "5m")
        if (name) {
          name = name
            .replace(/(\d+)\s*(minutes?|min)/gi, '$1m')
            .replace(/(\d+)\s*(seconds?|sec)/gi, '$1s')
        }

        if (isRun && name) {
          name = name
            .replace(/\s*\(\s*\d+(-\d+)?\s*w\s*\)/gi, '')
            .replace(/\s+/g, ' ')
            .trim()
        }

        if (name) {
          line += ` ${name}`
        }

        if (distanceStr && !name.toLowerCase().includes(`${step.distance}m`)) {
          line += ` ${distanceStr}`
        }

        if (durationStr) {
          const durNum = duration % 60 === 0 ? duration / 60 : duration
          if (
            !name.toLowerCase().includes(`${durNum}m`) &&
            !name.toLowerCase().includes(`${durNum} min`)
          ) {
            line += ` ${durationStr}`
          }
        }

        if (intensityStr) line += ` ${intensityStr}`
        if (step.cadence) line += ` ${step.cadence}rpm`

        lines.push(line.trimEnd())
      })
    }

    formatSteps(workout.steps)

    return lines.join('\n')
  },

  parseIntervalsGymDescription(description: string): any[] {
    const exercises: any[] = []
    if (!description) return exercises

    const lines = description.split('\n')
    let currentExercise: any = null

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      // Exercise Name: "- **Name**"
      const nameMatch = trimmed.match(/^-\s+\*\*(.+)\*\*$/)
      if (nameMatch) {
        if (currentExercise) {
          exercises.push(currentExercise)
        }
        currentExercise = { name: nameMatch[1] }
        continue
      }

      if (!currentExercise) continue

      // Details line (Sets/Reps/Weight)
      // Matches: "  - 3 sets", "  - 3 sets x 10 reps", "  - 3 sets x 10 reps @ 50kg"
      // But avoid matching "  - Rest:" or "  - Note:"
      // Note: We check for '- ' or '  - ' prefix generically
      if (
        (trimmed.startsWith('- ') || trimmed.startsWith('  - ')) &&
        !trimmed.includes('Rest:') &&
        !trimmed.includes('Note:') &&
        !trimmed.includes('**')
      ) {
        // Remove bullet
        const text = trimmed.replace(/^[-\s]+/, '')

        const setsMatch = text.match(/^(\d+)\s+sets/)
        if (setsMatch) currentExercise.sets = parseInt(setsMatch[1]!, 10)

        const repsMatch = text.match(/x\s+(.+?)\s+reps/)
        if (repsMatch) currentExercise.reps = repsMatch[1]!

        const weightMatch = text.match(/@\s+(.+)$/)
        if (weightMatch) currentExercise.weight = weightMatch[1]!

        continue
      }

      // Rest
      // Matches: "  - Rest: 60s"
      if (trimmed.includes('Rest:')) {
        const restMatch = trimmed.match(/Rest:\s+(.+)$/)
        if (restMatch) {
          currentExercise.rest = restMatch[1]
        }
        continue
      }

      // Note
      // Matches: "  - Note: ..."
      if (trimmed.includes('Note:')) {
        const noteMatch = trimmed.match(/Note:\s+(.+)$/)
        if (noteMatch) {
          currentExercise.notes = noteMatch[1]
        }
        continue
      }
    }

    if (currentExercise) {
      exercises.push(currentExercise)
    }

    return exercises
  }
}
