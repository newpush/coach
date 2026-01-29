import { prisma } from '../db'
import { generateStructuredAnalysis } from '../gemini'
import { wellnessRepository } from '../repositories/wellnessRepository'
import { getUserAiSettings } from '../ai-settings'
import { getUserLocalDate, getUserTimezone } from '../date'
import { recommendTodayActivityTask } from '../../../trigger/recommend-today-activity'
import {
  getMoodLabel,
  getStressLabel,
  getFatigueLabel,
  getSorenessLabel,
  getMotivationLabel,
  getHydrationLabel,
  getInjuryLabel
} from '../wellness'

// Define the schema for the AI analysis
const wellnessAnalysisSchema = {
  // ... existing code ...
  required: ['executive_summary', 'status', 'sections', 'recommendations']
}

/**
 * Triggers a readiness check (recommend-today-activity) if enabled and not already done.
 * Useful for webhooks (Whoop, Oura, Intervals) to react to new wellness data.
 */
export async function triggerReadinessCheckIfNeeded(userId: string) {
  try {
    const aiSettings = await getUserAiSettings(userId)

    if (!aiSettings.aiAutoAnalyzeReadiness) {
      return { triggered: false, reason: 'Auto-analyze readiness disabled' }
    }

    const timezone = await getUserTimezone(userId)
    const today = getUserLocalDate(timezone)

    // Check if a recommendation already exists for today
    const existing = await prisma.activityRecommendation.findFirst({
      where: {
        userId,
        date: today
      }
    })

    if (existing) {
      return { triggered: false, reason: 'Recommendation already exists for today' }
    }

    console.log(
      `[ReadinessCheck] Triggering recommendation for user ${userId} on ${today.toISOString()}`
    )

    await recommendTodayActivityTask.trigger(
      {
        userId,
        date: today
      },
      {
        concurrencyKey: userId,
        tags: [`user:${userId}`]
      }
    )

    return { triggered: true }
  } catch (error) {
    console.error(`[ReadinessCheck] Failed to trigger check for user ${userId}:`, error)
    return { triggered: false, error }
  }
}

export async function analyzeWellness(wellnessId: string, userId: string) {
  // ... existing code ...

  // Fetch the wellness record
  const wellness = await prisma.wellness.findUnique({
    where: { id: wellnessId }
  })

  if (!wellness) {
    throw new Error('Wellness record not found')
  }

  try {
    const aiSettings = await getUserAiSettings(userId)

    // Fetch 30-day history for context
    const endDate = wellness.date
    const startDate = new Date(wellness.date)
    startDate.setDate(startDate.getDate() - 30)

    const history = await wellnessRepository.getForUser(userId, {
      startDate,
      endDate,
      select: {
        date: true,
        hrv: true,
        hrvSdnn: true,
        restingHr: true,
        sleepHours: true,
        sleepScore: true,
        recoveryScore: true,
        readiness: true,
        stress: true,
        fatigue: true,
        soreness: true
      },
      orderBy: { date: 'asc' }
    })

    // Format recent history (last 5 days) for trend context
    const recentHistory = history
      .slice(-5)
      .map((h) => {
        const date = h.date.toISOString().split('T')[0]
        const parts = [`- ${date}:`]
        if (h.hrv) parts.push(`HRV(rMSSD):${Math.round(h.hrv)}`)
        if (h.hrvSdnn) parts.push(`HRV(SDNN):${Math.round(h.hrvSdnn)}`)
        if (h.restingHr) parts.push(`RHR:${h.restingHr}`)
        if (h.sleepHours) parts.push(`Sleep:${h.sleepHours.toFixed(1)}h`)
        if (h.recoveryScore) parts.push(`Rec:${h.recoveryScore}%`)
        if (h.readiness) parts.push(`Ready:${h.readiness}`)
        return parts.join(' ')
      })
      .join('\n')

    // Construct the prompt
    const readinessLabel =
      (wellness.readiness || 0) > 10 ? `${wellness.readiness}%` : `${wellness.readiness}/10`

    // Extract detailed metrics from raw JSON (Whoop/Intervals source)
    const rawData = wellness.rawJson as any

    // 1. Sleep Metrics (Handle root level or nested structure)
    let sleepDetails = ''
    const sleepObj = rawData?.sleep?.score ? rawData.sleep : rawData?.sleep ? rawData.sleep : null

    if (sleepObj?.score) {
      const s = sleepObj.score
      const stages = s.stage_summary
      const toHours = (ms: number) => (ms / (1000 * 60 * 60)).toFixed(1)

      sleepDetails = `
    DETAILED SLEEP METRICS (Whoop):
    - Performance: ${s.sleep_performance_percentage}%
    - Efficiency: ${s.sleep_efficiency_percentage?.toFixed(1)}%
    - Consistency: ${s.sleep_consistency_percentage}%
    - Respiratory Rate: ${s.respiratory_rate?.toFixed(1)} rpm
    - Sleep Needed: ${toHours(s.sleep_needed?.baseline_milli)}h (Strain Demand: ${toHours(s.sleep_needed?.need_from_recent_strain_milli)}h, Sleep Debt: ${toHours(s.sleep_needed?.need_from_sleep_debt_milli)}h)
    - Stages:
      * Deep (SWS): ${toHours(stages.total_slow_wave_sleep_time_milli)}h
      * REM: ${toHours(stages.total_rem_sleep_time_milli)}h
      * Light: ${toHours(stages.total_light_sleep_time_milli)}h
      * Awake: ${toHours(stages.total_awake_time_milli)}h
      * Disturbances: ${stages.disturbance_count}`
    }

    // 2. Advanced Context (eFTP, Skin Temp, Ramp Rate)
    let advancedContext = ''
    if (rawData?.sportInfo?.[0]) {
      const sport = rawData.sportInfo[0]
      if (sport.eftp) advancedContext += `- Estimated FTP (eFTP): ${sport.eftp.toFixed(0)} W\n`
      if (sport.pMax) advancedContext += `- Max Power (pMax): ${sport.pMax.toFixed(0)} W\n`
      if (sport.wPrime)
        advancedContext += `- W' (Anaerobic Capacity): ${sport.wPrime.toFixed(0)} J\n`
    }
    if (rawData?.rampRate !== undefined && rawData?.rampRate !== null) {
      advancedContext += `- Ramp Rate: ${rawData.rampRate.toFixed(1)} (Training Load Trend)\n`
    }
    // Check both recovery.score and nested structure just in case
    const skinTemp = rawData?.recovery?.score?.skin_temp_celsius ?? rawData?.skinTemp
    if (skinTemp) {
      advancedContext += `- Skin Temp: ${skinTemp.toFixed(1)}°C\n`
    }

    const prompt = `

        Analyze this athlete's daily wellness data as an expert **${aiSettings.aiPersona}** coach.

        Adapt your tone and recommendations to match your **${aiSettings.aiPersona}** persona.

    

        CURRENT DAY (${wellness.date.toISOString().split('T')[0]}):

        - Recovery Score: ${wellness.recoveryScore}%

        - Resting HR: ${wellness.restingHr} bpm

        - HRV (rMSSD): ${wellness.hrv ? wellness.hrv + ' ms' : 'N/A'}

        - HRV (SDNN): ${wellness.hrvSdnn ? wellness.hrvSdnn + ' ms' : 'N/A'}

        - Sleep: ${wellness.sleepHours} hours (Score: ${wellness.sleepScore})

        - Readiness: ${readinessLabel}

        - Subjective:

          * Stress: ${wellness.stress}/10 (${getStressLabel(wellness.stress || 0)})

          * Fatigue: ${wellness.fatigue}/10 (${getFatigueLabel(wellness.fatigue || 0)})

                * Soreness: ${wellness.soreness}/10 (${getSorenessLabel(wellness.soreness || 0)})

                * Mood: ${wellness.mood}/10 (${getMoodLabel(wellness.mood || 0)})

                * Motivation: ${wellness.motivation}/10 (${getMotivationLabel(wellness.motivation || 0)})

                * Hydration: ${wellness.hydration || 'N/A'} (${getHydrationLabel(wellness.hydration)})

                * Injury: ${wellness.injury || 'None'} (${getInjuryLabel(wellness.injury)})

              - Vitals: SpO2 ${wellness.spO2}%, Weight ${wellness.weight}kg

        ${sleepDetails}
    
    ADVANCED CONTEXT:
    ${advancedContext}
    
    RECENT DAILY HISTORY (Last 5 Days):
    ${recentHistory}

    30-DAY AVERAGES:
    - Average HRV (rMSSD): ${Math.round(history.reduce((acc, curr) => acc + (curr.hrv || 0), 0) / (history.filter((h) => h.hrv).length || 1))} ms
    - Average RHR: ${Math.round(history.reduce((acc, curr) => acc + (curr.restingHr || 0), 0) / (history.filter((h) => h.restingHr).length || 1))} bpm
    - Average Sleep: ${(history.reduce((acc, curr) => acc + (curr.sleepHours || 0), 0) / (history.filter((h) => h.sleepHours).length || 1)).toFixed(1)} hours

    TASK:
    Provide a comprehensive analysis of the athlete's recovery status and readiness to train.
    1. Evaluate key metrics (HRV, Sleep, Recovery) against the 30-day context AND the recent 5-day trend.
    2. Identify any warning signs (e.g., high fatigue, low HRV trend, sudden drop in readiness).
    3. Provide actionable recommendations for today's training (e.g., push hard, active recovery, rest).
    4. Note any subjective factors (stress, soreness) that might impact performance.

    Output JSON format matching the schema.
  `

    // Generate analysis using Gemini
    const analysis = await generateStructuredAnalysis(
      prompt,
      wellnessAnalysisSchema,
      aiSettings.aiModelPreference,
      {
        userId,
        operation: 'wellness_analysis',
        entityType: 'Wellness',
        entityId: wellnessId
      }
    )

    // Save the result
    await prisma.wellness.update({
      where: { id: wellnessId },
      data: {
        aiAnalysisJson: analysis as any, // Cast to any for Prisma JSON compatibility
        aiAnalysisStatus: 'COMPLETED',
        aiAnalyzedAt: new Date()
      }
    })

    return {
      success: true,
      wellnessId,
      analysis
    }
  } catch (error: any) {
    console.error('Wellness analysis failed:', error)

    await prisma.wellness.update({
      where: { id: wellnessId },
      data: { aiAnalysisStatus: 'FAILED' }
    })

    throw error
  }
}
