import type { Integration } from '@prisma/client'
import { prisma } from './db'
import { normalizePolarSport } from './activity-mapping'

export interface PolarTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  x_user_id: number // Polar User ID
}

export interface PolarUser {
  'polar-user-id': number
  'member-id': string
  'registration-date': string
  'first-name': string
  'last-name': string
  birthdate: string
  gender: string
  weight: number
  height: number
  'extra-info'?: Array<{
    value: string
    index: number
    name: string
  }>
}

export interface PolarExercise {
  id: string
  upload_time: string
  polar_user: string
  device: string
  device_id: string
  start_time: string
  start_time_utc_offset: number
  duration: string // ISO 8601 duration "PT2H44M"
  calories: number
  distance: number
  heart_rate: {
    average: number
    maximum: number
  }
  training_load: number
  sport: string
  has_route: boolean
  club_id?: number
  club_name?: string
  detailed_sport_info?: string
  fat_percentage?: number
  carbohydrate_percentage?: number
  protein_percentage?: number
  'running-index'?: number
  heart_rate_zones?: Array<{
    index: number
    'lower-limit': number
    'upper-limit': number
    'in-zone': string // Duration
  }>
  samples?: Array<any>
  route?: Array<any>
  training_load_pro?: any
}

export interface PolarSleepListEntry {
  polar_user: string
  date: string
  sleep_start_time: string
  sleep_end_time: string
  device_id: string
  url: string // Link to full sleep data
}

export interface PolarSleep {
  polar_user: string
  date: string
  sleep_start_time: string
  sleep_end_time: string
  device_id: string
  continuity: number
  continuity_class: number
  light_sleep: number
  deep_sleep: number
  rem_sleep: number
  unrecognized_sleep_stage: number
  sleep_score: number
  total_interruption_duration: number
  sleep_charge: number
  sleep_rating: number
  short_interruption_duration: number
  long_interruption_duration: number
  sleep_cycles: number
  group_duration: number
  group_duration_score: number
  score_state: string
  sleep_result_date: string
  hypnogram: any
  heart_rate_samples: any
}

export interface PolarNightlyRecharge {
  polar_user: string
  date: string
  heart_rate_variability_avg: number
  beat_to_beat_interval_avg: number
  heart_rate_avg: number
  breathing_rate_avg: number
  ans_charge: number
  ans_charge_status: string
  nightly_recharge_status: string
  sleep_charge: number
  sleep_charge_status: string
  score_state: string
}

/**
 * Refreshes an expired Polar access token (Not supported by Polar v3?)
 * Polar v3 docs say: "Access tokens will not expire unless explicitly revoked by partners or users."
 */
export async function ensureValidToken(integration: Integration): Promise<Integration> {
  if (isTokenExpired(integration)) {
    console.warn(`Polar token for user ${integration.userId} is expired or expiring soon.`)
  }
  return integration
}

function isTokenExpired(integration: Integration): boolean {
  if (!integration.expiresAt) return false
  const now = new Date()
  return now >= integration.expiresAt
}

export async function fetchPolarUser(token: string): Promise<PolarUser> {
  throw new Error('Use fetchPolarUserById with the known user ID')
}

export async function fetchPolarUserById(
  token: string,
  polarUserId: string | number
): Promise<PolarUser> {
  const response = await fetch(`https://www.polaraccesslink.com/v3/users/${polarUserId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(`Polar API error: ${response.status} ${response.statusText}`)
  }

  return await response.json()
}

export async function registerPolarUser(token: string, memberId: string): Promise<PolarUser> {
  const response = await fetch('https://www.polaraccesslink.com/v3/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    },
    body: JSON.stringify({
      'member-id': memberId
    })
  })

  if (response.status === 409) {
    console.log(`Polar user with member-id ${memberId} already registered.`)
    throw new Error('User already registered')
  }

  if (!response.ok) {
    throw new Error(`Polar registration failed: ${response.status} ${response.statusText}`)
  }

  return await response.json()
}

export async function deRegisterPolarUser(token: string, polarUserId: string): Promise<void> {
  const response = await fetch(`https://www.polaraccesslink.com/v3/users/${polarUserId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  if (!response.ok && response.status !== 204) {
    if (response.status === 404) return
    throw new Error(`Polar de-registration failed: ${response.status} ${response.statusText}`)
  }
}

export async function listPolarExercises(integration: Integration): Promise<PolarExercise[]> {
  const response = await fetch('https://www.polaraccesslink.com/v3/exercises', {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${integration.accessToken}`
    }
  })

  if (!response.ok) {
    console.error(`Failed to list Polar exercises: ${response.status}`)
    return []
  }

  return await response.json()
}

export async function getPolarExercise(
  integration: Integration,
  exerciseId: string
): Promise<PolarExercise | null> {
  const response = await fetch(`https://www.polaraccesslink.com/v3/exercises/${exerciseId}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${integration.accessToken}`
    }
  })

  if (!response.ok) {
    return null
  }

  return await response.json()
}

export async function listPolarSleeps(integration: Integration): Promise<PolarSleepListEntry[]> {
  const response = await fetch('https://www.polaraccesslink.com/v3/users/sleep', {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${integration.accessToken}`
    }
  })

  if (!response.ok) {
    return []
  }

  const data = await response.json()
  return data.nights || []
}

export async function fetchPolarSleep(
  integration: Integration,
  url: string
): Promise<PolarSleep | null> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${integration.accessToken}`
    }
  })

  if (!response.ok) {
    return null
  }

  return await response.json()
}

export async function listPolarNightlyRecharges(
  integration: Integration
): Promise<PolarNightlyRecharge[]> {
  const response = await fetch('https://www.polaraccesslink.com/v3/users/nightly-recharge', {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${integration.accessToken}`
    }
  })

  if (!response.ok) {
    return []
  }

  const data = await response.json()
  return data.recharges || []
}

function parseDuration(duration: string): number {
  if (!duration) return 0
  // Simple ISO 8601 duration parser for PT#H#M#S
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/)
  if (!match) return 0

  const hours = parseInt(match[1] || '0', 10)
  const minutes = parseInt(match[2] || '0', 10)
  const seconds = parseFloat(match[3] || '0')

  return hours * 3600 + minutes * 60 + Math.round(seconds)
}

export function normalizePolarExercise(exercise: PolarExercise, userId: string) {
  const type = normalizePolarSport(exercise.sport, exercise.detailed_sport_info)

  const durationSec = parseDuration(exercise.duration)
  const date = new Date(exercise.start_time)

  return {
    userId,
    externalId: exercise.id,
    source: 'polar',
    date,
    title: type === 'Other' ? 'Polar Activity' : type,
    description: exercise.detailed_sport_info
      ? `Sport: ${exercise.detailed_sport_info}`
      : undefined,
    type,
    durationSec,
    distanceMeters: exercise.distance || null,
    elevationGain: null,
    averageHr: exercise.heart_rate?.average || null,
    maxHr: exercise.heart_rate?.maximum || null,
    calories: exercise.calories || null,
    averageSpeed: exercise.distance && durationSec > 0 ? exercise.distance / durationSec : null,
    rawJson: exercise as any
  }
}

export function normalizePolarSleep(sleep: PolarSleep, userId: string) {
  const date = new Date(sleep.date)

  const start = new Date(sleep.sleep_start_time)
  const end = new Date(sleep.sleep_end_time)
  const sleepSecs = Math.round((end.getTime() - start.getTime()) / 1000)
  const sleepHours = Math.round((sleepSecs / 3600) * 10) / 10

  return {
    userId,
    date,
    source: 'polar',
    sleepSecs,
    sleepHours,
    sleepScore: sleep.sleep_score,
    sleepQuality: sleep.sleep_rating,
    rawJson: sleep as any
  }
}

export function normalizePolarNightlyRecharge(recharge: PolarNightlyRecharge, userId: string) {
  const date = new Date(recharge.date)

  return {
    userId,
    date,
    source: 'polar',
    hrv: recharge.heart_rate_variability_avg,
    restingHr: recharge.heart_rate_avg ? Math.round(recharge.heart_rate_avg) : null,
    recoveryScore:
      recharge.nightly_recharge_status === 'VERY_GOOD'
        ? 95
        : recharge.nightly_recharge_status === 'GOOD'
          ? 85
          : recharge.nightly_recharge_status === 'OK'
            ? 75
            : recharge.nightly_recharge_status === 'COMPROMISED'
              ? 50
              : recharge.nightly_recharge_status === 'POOR'
                ? 30
                : recharge.nightly_recharge_status === 'VERY_POOR'
                  ? 10
                  : recharge.ans_charge !== undefined
                    ? Math.round((recharge.ans_charge + 10) * 5)
                    : null,

    sleepScore:
      recharge.sleep_charge_status === 'VERY_GOOD'
        ? 95
        : recharge.sleep_charge_status === 'GOOD'
          ? 85
          : recharge.sleep_charge_status === 'OK'
            ? 75
            : recharge.sleep_charge_status === 'COMPROMISED'
              ? 50
              : recharge.sleep_charge_status === 'POOR'
                ? 30
                : recharge.sleep_charge_status === 'VERY_POOR'
                  ? 10
                  : recharge.sleep_charge !== undefined
                    ? Math.round(recharge.sleep_charge)
                    : null,

    respiration: recharge.breathing_rate_avg,
    rawJson: recharge as any
  }
}
