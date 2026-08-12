import { MPS_TO_KPH } from '#shared/units'

export const KG_TO_LBS = 2.20462262185
export const LBS_TO_KG = 0.45359237
const MPS_TO_MPH = 2.2369362921
const KM_TO_MILE_PACE_FACTOR = 1.609344
const METERS_TO_FEET = 3.28084

export interface MetricDefinition {
  label: string
  description: string
  coachingTip?: string
}

export const metricDefinitions: Record<string, MetricDefinition> = {
  'Training Load': {
    label: 'Training Load (TSS)',
    description:
      'Training Stress Score (TSS) is a composite number that takes into account the duration and intensity of a workout to arrive at a single estimate of the total physiological stress.',
    coachingTip:
      '100 TSS is equivalent to 1 hour at your threshold. If you feel exceptionally tired but TSS is low, check your wellness scores—you might be under-recovering.'
  },
  'Avg HR': {
    label: 'Average Heart Rate',
    description:
      'The average number of heart beats per minute during the entire session. This is a primary indicator of internal physiological strain.',
    coachingTip:
      'Higher than normal HR for a given power output often indicates fatigue, dehydration, or incoming illness.'
  },
  'Avg Power': {
    label: 'Average Power Output',
    description:
      'The mathematical average of your power output (measured in Watts) for the duration of the workout.',
    coachingTip:
      'Focus on "Normalized Power" for variable rides, but keep an eye on Average Power for steady-state intervals to ensure consistent execution.'
  },
  'Variability Index': {
    label: 'Variability Index (VI)',
    description:
      'Calculated by dividing Normalized Power by Average Power. It measures how "steady" your power delivery was during the ride.',
    coachingTip:
      'A VI of 1.0 to 1.05 is ideal for steady-state triathlon or time trial efforts. High VI (>1.1) indicates a "surgy" ride which is metabolically more expensive.'
  },
  'Efficiency Factor': {
    label: 'Efficiency Factor (EF)',
    description:
      'Normalizes your power output against your heart rate (NP / Avg HR). It tracks how much "work" you get for every beat of your heart.',
    coachingTip:
      'As your aerobic fitness improves, your EF will gradually trend upward. Compare EF across similar workout types to see real progress.'
  },
  'Aerobic Decoupling': {
    label: 'Aerobic Decoupling (Pa:Hr)',
    description:
      'The percentage difference in the Power:HR ratio between the first and second halves of a workout. It measures aerobic stability.',
    coachingTip:
      'Decoupling under 5% indicates good aerobic endurance. If you see >10%, it means your cardiovascular system is struggling to maintain output, often due to heat or lack of base fitness.'
  },
  'Power/HR Ratio': {
    label: 'Power/HR Ratio',
    description:
      'A raw snapshot of your efficiency: how many Watts you generate per heart beat (bpm).',
    coachingTip:
      'This is your "Gross Efficiency". While it varies by intensity, tracking it over time at a specific heart rate (like Zone 2) is a pure measure of aerobic engine growth.'
  },
  'Polarization Index': {
    label: 'Polarization Index',
    description:
      'A score describing how your effort is distributed across intensity bands, with higher values indicating a more polarized profile (more easy and hard work, less in-between).',
    coachingTip:
      'Use this in context with the session goal. Endurance days should trend lower intensity concentration, while race-specific blocks may intentionally increase polarization.'
  },
  'Norm Power': {
    label: 'Normalized Power (NP)',
    description:
      'An estimate of the power you could have maintained for the same physiological "cost" if your output had been perfectly steady.',
    coachingTip:
      'NP accounts for the exponential cost of hard surges. If NP is significantly higher than Average Power, your session was very punchy.'
  },
  'TSS (Load)': {
    label: 'Training Stress Score (TSS)',
    description:
      'A way of measuring how much physical stress a workout has put on your body. It considers both duration and intensity.',
    coachingTip:
      'This is the specific stress of this activity. Aim for your "Target TSS" in planned workouts to stay on track with your long-term plan.'
  },
  'Fitness (CTL)': {
    label: 'Chronic Training Load (Fitness)',
    description:
      'A rolling 42-day average of your daily TSS. It represents your long-term training load and aerobic base.',
    coachingTip:
      "Higher isn't always better. Focus on a sustainable rate of increase (ramp rate) to avoid injury."
  },
  'Fatigue (ATL)': {
    label: 'Acute Training Load (Fatigue)',
    description:
      'A rolling 7-day average of your daily TSS. It represents the short-term stress of your recent training.',
    coachingTip:
      'High fatigue is normal after a big block, but it must be followed by recovery to allow for adaptation.'
  },
  'Form (TSB)': {
    label: 'Training Stress Balance (Form)',
    description:
      'Calculated as CTL minus ATL. It represents how "fresh" or "tired" you are relative to your long-term base.',
    coachingTip:
      'Optimal "Race Form" is usually between +5 and +25. Deep training blocks often see values down to -30.'
  },
  'Average Pace': {
    label: 'Average Session Pace',
    description:
      'The average time taken to cover a specific distance unit (e.g., minutes per kilometer).',
    coachingTip:
      'Pace is a "result" metric. Always consider it alongside heart rate to determine if your speed is coming from efficiency or raw effort.'
  },
  'Average Speed': {
    label: 'Average Session Speed',
    description:
      'The average speed sustained across the session, shown in your preferred cycling units.',
    coachingTip:
      'Compare average speed across similar terrain and conditions. Wind, elevation, and drafting can move this number more than fitness alone.'
  },
  'Consistency Variance': {
    label: 'Pace Variability (Consistency)',
    description:
      'Measures how much your pace fluctuated during the session. Low variance means steady execution.',
    coachingTip:
      'For steady-state runs or rides, aim for minimal variance. High variance is expected in interval sessions or hilly terrain.'
  },
  'Execution Strategy': {
    label: 'Pacing Strategy Audit',
    description:
      'Analyzes the distribution of effort between the first and second halves of your session.',
    coachingTip:
      'Negative splits (faster second half) are usually the most efficient way to race and indicate disciplined energy management.'
  },
  'Intensity Factor': {
    label: 'Intensity Factor (IF)',
    description:
      'The ratio of your Normalized Power to your current Functional Threshold Power (FTP).',
    coachingTip:
      'An IF of 1.0 means you rode at exactly your threshold for the duration. Recovery rides should be below 0.60.'
  },
  'Work > FTP': {
    label: 'Anaerobic Work Capacity',
    description:
      'The total amount of energy (in kilojoules) expended while riding above your threshold power.',
    coachingTip:
      'This represents your "matches" burnt. High work above FTP indicates a very hard anaerobic session.'
  },
  "W' Bal Depletion": {
    label: "W' Balance Depletion",
    description:
      "Tracks the remaining capacity of your anaerobic energy tank. It shows how 'deep' you dug during hard efforts.",
    coachingTip:
      'If this drops near zero, you are likely at your limit. Improving your threshold will allow you to maintain higher power with less depletion.'
  },
  'Durability (Late Fade)': {
    label: 'Durability (Metabolic Late Fade)',
    description:
      'Measures the loss of efficiency by comparing your Power:HR ratio from the beginning of the workout to the end.',
    coachingTip:
      'Excellent durability is < 5% fade. If you consistently fade > 10%, focus on long Zone 2 rides to build your aerobic base.'
  },
  'Force / Velocity Profile': {
    label: 'Force / Velocity Profile',
    description:
      'Categorizes your pedaling style into quadrants: high/low force and high/low velocity (cadence).',
    coachingTip:
      'Use this to see if you are a "grinder" (high force, low cadence) or a "spinner" (low force, high cadence) and if that matches your target race intensity.'
  },
  'Coasting Efficiency': {
    label: 'Coasting Efficiency',
    description:
      'The amount of time you spent moving without pedaling. In group rides or races, higher coasting time often indicates better tactical discipline.',
    coachingTip:
      'In a draft, you should coast as much as possible. High coasting percentages on solo rides usually mean a very hilly course.'
  },
  'Sustained Surges': {
    label: 'Matches Burnt (Surges)',
    description:
      'Counts the number of times you pushed significantly above your threshold (>120% FTP) for a sustained duration.',
    coachingTip:
      'Every "match" burnt takes a toll. If you burn too many early in a race, you\'ll have nothing left for the final sprint.'
  }
}

/**
 * Convert CM to feet and inches
 */
export function cmToFtIn(cm: number): { ft: number; in: number } {
  const totalInches = cm / 2.54
  const ft = Math.floor(totalInches / 12)
  const inches = Math.round(totalInches % 12)
  return { ft, in: inches }
}

/**
 * Convert feet and inches to CM
 */
export function ftInToCm(ft: number, inches: number): number {
  const totalInches = ft * 12 + inches
  return Math.round(totalInches * 2.54)
}

/**
 * Format height for display based on units
 */
export function formatHeight(heightCm: number | null | undefined, units: string): string {
  if (!heightCm) return 'N/A'

  if (units === 'ft/in') {
    const { ft, in: inches } = cmToFtIn(heightCm)
    return `${ft}'${inches}"`
  }

  return `${heightCm} cm`
}

/**
 * Convert meters to Kilometers or Miles
 */
export function formatDistance(meters: number | null | undefined, units: string): string {
  if (meters === null || meters === undefined) return 'N/A'
  if (units === 'Miles') {
    const miles = meters / 1609.344
    return `${miles.toFixed(2)} mi`
  }
  const km = meters / 1000
  return `${km.toFixed(2)} km`
}

/**
 * Convert Celsius to Fahrenheit
 */
export function formatTemperature(celsius: number | null | undefined, units: string): string {
  if (celsius === null || celsius === undefined) return 'N/A'
  if (units === 'Fahrenheit') {
    const fahrenheit = (celsius * 9) / 5 + 32
    return `${fahrenheit.toFixed(1)}°F`
  }
  return `${celsius.toFixed(1)}°C`
}

export function usesImperialDistance(units: string | null | undefined): boolean {
  return units === 'Miles'
}

/**
 * Elevation/climb/ascent units follow the athlete's distance-unit preference
 * (Kilometers -> meters, Miles -> feet), matching `getVelocityUnitLabel`.
 */
export function getElevationUnitLabel(units: string | null | undefined): string {
  return usesImperialDistance(units) ? 'ft' : 'm'
}

/**
 * Convert a raw elevation value (in meters) to the athlete's preferred unit,
 * without rounding. Useful for chart/stream data where rounding should happen
 * at render time rather than on the underlying values.
 */
export function convertElevation(meters: number, units: string | null | undefined): number {
  return usesImperialDistance(units) ? meters * METERS_TO_FEET : meters
}

/**
 * Format elevation/climb/ascent (given in meters) for display based on the
 * athlete's distance-unit preference. Mirrors the conversion math in
 * `server/utils/ai-prompt-format.ts`'s `formatPromptElevation`: elevation
 * units follow distance units (Kilometers -> meters, Miles -> feet), rounded
 * to the nearest whole unit.
 */
export function formatElevation(
  meters: number | null | undefined,
  units: string | null | undefined
): string {
  if (meters === null || meters === undefined) return 'N/A'
  return `${Math.round(convertElevation(meters, units))} ${getElevationUnitLabel(units)}`
}

export function isRideWorkoutType(type: string | null | undefined): boolean {
  const normalized = String(type || '').toLowerCase()
  return ['ride', 'virtualride', 'ebike', 'bike', 'cycling', 'cycle', 'gravel', 'mtb', 'road'].some(
    (token) => normalized.includes(token)
  )
}

export function getVelocityUnitLabel(units: string | null | undefined): string {
  return usesImperialDistance(units) ? 'mph' : 'km/h'
}

export function convertVelocity(metersPerSecond: number, units: string | null | undefined): number {
  return metersPerSecond * (usesImperialDistance(units) ? MPS_TO_MPH : MPS_TO_KPH)
}

export function formatVelocity(
  metersPerSecond: number | null | undefined,
  units: string | null | undefined,
  decimals = 1
): string {
  if (
    metersPerSecond === null ||
    metersPerSecond === undefined ||
    !Number.isFinite(metersPerSecond)
  ) {
    return 'N/A'
  }

  const converted = convertVelocity(metersPerSecond, units)
  return `${converted.toFixed(decimals)} ${getVelocityUnitLabel(units)}`
}

/**
 * Format a run/swim pace (given in seconds per kilometer) for display based on
 * the athlete's distance unit preference, converting to seconds-per-mile when
 * appropriate. Mirrors the conversion math in
 * `server/utils/ai-prompt-format.ts`'s `formatPromptPace`.
 *
 * @param secondsPerKm - Pace expressed in seconds per kilometer.
 * @param distanceUnits - 'Kilometers' | 'Miles' (defaults to Kilometers/'/km').
 * @param decimals - Optional fractional-second precision (default 0, i.e. "M:SS").
 */
export function formatPace(
  secondsPerKm: number | null | undefined,
  distanceUnits: string | null | undefined,
  decimals = 0
): string {
  if (
    secondsPerKm === null ||
    secondsPerKm === undefined ||
    !Number.isFinite(secondsPerKm) ||
    secondsPerKm <= 0
  ) {
    return 'N/A'
  }

  const imperial = usesImperialDistance(distanceUnits)
  const effectiveSeconds = imperial ? secondsPerKm * KM_TO_MILE_PACE_FACTOR : secondsPerKm
  const unitLabel = imperial ? '/mi' : '/km'

  const scale = 10 ** decimals
  const totalSeconds = Math.round(effectiveSeconds * scale) / scale
  const minutes = Math.floor(totalSeconds / 60)
  const remainingSeconds = totalSeconds - minutes * 60
  const secondsLabel =
    decimals > 0
      ? remainingSeconds.toFixed(decimals).padStart(3 + decimals, '0')
      : Math.round(remainingSeconds).toString().padStart(2, '0')

  return `${minutes}:${secondsLabel}${unitLabel}`
}
