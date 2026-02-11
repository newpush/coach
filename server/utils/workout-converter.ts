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

    workout.steps.forEach((step, index) => {
      // Safely access power
      const power = step.power || { value: 0 }

      // Add header if type changes
      if (index === 0 && step.type === 'Warmup') {
        lines.push('Warmup')
      } else if (step.type === 'Cooldown' && currentType !== 'Cooldown') {
        lines.push('\nCooldown')
      } else if (step.type === 'Active' && currentType === 'Warmup') {
        lines.push('\nMain Set')
      }

      currentType = step.type

      // Format distance
      let distanceStr = ''
      if (step.distance) {
        // Use 'mtr' for swimming to avoid 'm' being interpreted as minutes by Intervals.icu
        distanceStr = isSwim ? `${step.distance}mtr` : `${step.distance}m`
      }

      // Format duration
      let durationStr = ''
      const duration = step.durationSeconds || step.duration || 0

      // For swimming, if we have distance, we usually don't want to send duration
      const shouldIncludeDuration = !isSwim || !step.distance || step.type === 'Rest'

      if (duration > 0 && shouldIncludeDuration) {
        if (duration % 60 === 0) {
          durationStr = `${duration / 60}m`
        } else {
          durationStr = `${duration}s`
        }
      }

      // Format power, heart rate, or pace
      let intensityStr = ''

      const hasPower = !!(power.value || power.range)
      const hasHr = !!(step.heartRate && (step.heartRate.value || step.heartRate.range))
      const hasPace = !!(step.pace && (step.pace.value || step.pace.range))

      if (hasPower || hasHr || hasPace) {
        const intensities: string[] = []

        // Power
        if (hasPower) {
          if (power.range) {
            const start = Math.round((power.range.start ?? 0) * 100)
            const end = Math.round((power.range.end ?? 0) * 100)
            intensities.push(`ramp ${start}-${end}%`)
          } else {
            const val = Math.round((power.value || 0) * 100)
            intensities.push(`${val}%`)
          }
        }

        // Pace
        if (hasPace) {
          if (step.pace!.range) {
            const start = Math.round((step.pace!.range.start ?? 0) * 100)
            const end = Math.round((step.pace!.range.end ?? 0) * 100)
            intensities.push(`${start}-${end}% pace`)
          } else {
            const val = Math.round((step.pace!.value || 0) * 100)
            intensities.push(`${val}% pace`)
          }
        }

        // Heart Rate
        if (hasHr) {
          if (step.heartRate!.range) {
            const start = Math.round((step.heartRate!.range.start ?? 0) * 100)
            const end = Math.round((step.heartRate!.range.end ?? 0) * 100)
            intensities.push(`${start}-${end}% LTHR`)
          } else {
            const val = Math.round((step.heartRate!.value || 0) * 100)
            intensities.push(`${val}% LTHR`)
          }
        }

        if (intensities.length > 0) {
          intensityStr = intensities.join(' ')
        }
      }

      // Default fallback for Active steps without targets
      if (!intensityStr && step.type !== 'Rest') {
        intensityStr = prioritizeHr ? '50% LTHR' : '50%'
      }

      // Cadence (optional)
      let cadenceStr = ''
      if (step.cadence) {
        cadenceStr = ` ${step.cadence}rpm`
      }

      // Text/Name construction
      let line = '-'

      if (step.type === 'Rest') {
        line += ' Rest'
      } else if (step.name) {
        // Clean the name
        const cleanName = step.name.replace(/["\n\r]/g, '').trim()

        // Check if name is redundant with distance/duration info
        const isRedundant =
          isSwim &&
          step.distance &&
          (cleanName.toLowerCase().includes(`${step.distance}m`) ||
            (cleanName.toLowerCase().includes('steady') && step.distance > 0))

        if (cleanName && !isRedundant) {
          line += ` ${cleanName}`
        }
      }

      if (distanceStr) line += ` ${distanceStr}`
      if (durationStr) line += ` ${durationStr}`

      // Add intensity and cadence if available (even for Rest if targets exist)
      if (intensityStr) line += ` ${intensityStr}`
      if (cadenceStr) line += ` ${cadenceStr}`

      lines.push(line.trim().replace(/\s+/g, ' '))
    })

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
