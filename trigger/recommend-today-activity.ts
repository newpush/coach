import { logger, task } from "@trigger.dev/sdk/v3";
import { generateStructuredAnalysis, buildWorkoutSummary } from "../server/utils/gemini";
import { prisma } from "../server/utils/db";
import { workoutRepository } from "../server/utils/repositories/workoutRepository";
import { wellnessRepository } from "../server/utils/repositories/wellnessRepository";

const recommendationSchema = {
  type: "object",
  properties: {
    recommendation: {
      type: "string",
      enum: ["proceed", "modify", "reduce_intensity", "rest"]
    },
    confidence: { type: "number" },
    reasoning: { type: "string" },
    planned_workout: {
      type: "object",
      properties: {
        original_title: { type: "string" },
        original_tss: { type: "number" },
        original_duration_min: { type: "number" }
      }
    },
    suggested_modifications: {
      type: "object",
      properties: {
        action: { type: "string" },
        new_title: { type: "string" },
        new_tss: { type: "number" },
        new_duration_min: { type: "number" },
        zone_adjustments: { type: "string" },
        description: { type: "string" }
      }
    },
    recovery_analysis: {
      type: "object",
      properties: {
        hrv_status: { type: "string" },
        sleep_quality: { type: "string" },
        fatigue_level: { type: "string" },
        readiness_score: { type: "number" }
      }
    },
    key_factors: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: ["recommendation", "confidence", "reasoning"]
};

export const recommendTodayActivityTask = task({
  id: "recommend-today-activity",
  maxDuration: 300,
  run: async (payload: { userId: string; date: Date; recommendationId?: string; userFeedback?: string }) => {
    const { userId, date, recommendationId, userFeedback } = payload;
    
    // Set date to start of day
    const today = new Date(date);
    today.setHours(0, 0, 0, 0);
    
    logger.log("Starting today's activity recommendation", { userId, date: today });
    
    // Fetch all required data
    const [plannedWorkout, todayMetric, recentWorkouts, user, athleteProfile] = await Promise.all([
      // Today's planned workout
      prisma.plannedWorkout.findFirst({
        where: { userId, date: today },
        orderBy: { createdAt: 'desc' }
      }),
      
      // Today's recovery metrics from Wellness table (WHOOP, Intervals.icu, etc.)
      wellnessRepository.getByDate(userId, today),
      
      // Last 7 days of workouts for context
      workoutRepository.getForUser(userId, {
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        orderBy: { date: 'desc' }
      }),
      
      // User profile
      prisma.user.findUnique({
        where: { id: userId },
        select: { ftp: true, weight: true, maxHr: true }
      }),
      
      // Latest athlete profile
      prisma.report.findFirst({
        where: {
          userId,
          type: 'ATHLETE_PROFILE',
          status: 'COMPLETED'
        },
        orderBy: { createdAt: 'desc' },
        select: { analysisJson: true, createdAt: true }
      })
    ]);
    
    logger.log("Data fetched", {
      hasPlannedWorkout: !!plannedWorkout,
      hasTodayMetric: !!todayMetric,
      recentWorkoutsCount: recentWorkouts.length,
      hasAthleteProfile: !!athleteProfile
    });
    
    // Build athlete profile context
    let athleteContext = '';
    if (athleteProfile?.analysisJson) {
      const profile = athleteProfile.analysisJson as any;
      athleteContext = `
ATHLETE PROFILE (Generated ${new Date(athleteProfile.createdAt).toLocaleDateString()}):
${profile.executive_summary ? `Summary: ${profile.executive_summary}` : ''}

Current Fitness: ${profile.current_fitness?.status_label || 'Unknown'}
${profile.current_fitness?.key_points ? profile.current_fitness.key_points.map((p: string) => `- ${p}`).join('\n') : ''}

Training Characteristics:
${profile.training_characteristics?.training_style || 'No data'}
Strengths: ${profile.training_characteristics?.strengths?.join(', ') || 'None listed'}
Areas for Development: ${profile.training_characteristics?.areas_for_development?.join(', ') || 'None listed'}

Recovery Profile: ${profile.recovery_profile?.recovery_pattern || 'Unknown'}
${profile.recovery_profile?.key_observations ? profile.recovery_profile.key_observations.map((o: string) => `- ${o}`).join('\n') : ''}

Recent Performance Trend: ${profile.recent_performance?.trend || 'Unknown'}

Planning Context:
${profile.planning_context?.current_focus ? `Current Focus: ${profile.planning_context.current_focus}` : ''}
${profile.planning_context?.limitations?.length ? `Limitations: ${profile.planning_context.limitations.join(', ')}` : ''}
${profile.planning_context?.opportunities?.length ? `Opportunities: ${profile.planning_context.opportunities.join(', ')}` : ''}
`;
    } else {
      athleteContext = `
ATHLETE BASIC INFO:
- FTP: ${user?.ftp || 'Unknown'} watts
- Weight: ${user?.weight || 'Unknown'} kg
- Max HR: ${user?.maxHr || 'Unknown'} bpm
Note: No structured athlete profile available yet. Generate one for better recommendations.
`;
    }
    
    // Build comprehensive prompt
    const prompt = `You are an expert cycling coach analyzing today's training for your athlete.

${athleteContext}

TODAY'S PLANNED WORKOUT:
${plannedWorkout ? `
- Title: ${plannedWorkout.title}
- Duration: ${plannedWorkout.durationSec ? Math.round(plannedWorkout.durationSec / 60) : 'Unknown'} minutes
- TSS: ${plannedWorkout.tss || 'Unknown'}
- Type: ${plannedWorkout.type || 'Unknown'}
- Description: ${plannedWorkout.description || 'None'}
` : 'No workout planned for today'}

TODAY'S RECOVERY METRICS:
${todayMetric ? `
- Recovery Score: ${todayMetric.recoveryScore}%
- HRV: ${todayMetric.hrv} ms
- Resting HR: ${todayMetric.restingHr} bpm
- Sleep: ${todayMetric.sleepHours?.toFixed(1)} hours (Score: ${todayMetric.sleepScore}%)
${todayMetric.spO2 ? `- SpO2: ${todayMetric.spO2}%` : ''}
` : 'No recovery data available'}

RECENT TRAINING (Last 7 days):
${recentWorkouts.length > 0 ? buildWorkoutSummary(recentWorkouts) : 'No recent workouts'}

${userFeedback ? `USER FEEDBACK / OBJECTION:
"${userFeedback}"
IMPORTANT: The user has explicitly provided this feedback. You MUST take it into account and adjust your recommendation accordingly. If they say they are tired, recommend rest or easy. If they want to push, allow it if safety permits.` : ''}

TASK:
Analyze whether the athlete should proceed with today's planned workout or modify it based on their current recovery state and recent training load.

DECISION CRITERIA:
- Recovery < 33%: Strong recommendation for rest
- Recovery 33-50%: Reduce intensity significantly
- Recovery 50-67%: Modify if workout is hard
- Recovery 67-80%: Proceed as planned
- Recovery > 80%: Good day for intensity

- Low HRV (< -15% from baseline): Caution on intensity
- Poor sleep (< 6 hours): Reduce volume/intensity
- High recent TSS (> 400 in 3 days): Consider recovery

Provide specific, actionable recommendations with clear reasoning.`;

    logger.log("Generating recommendation with Gemini Flash");
    
    // Generate recommendation
    const analysis = await generateStructuredAnalysis(
      prompt,
      recommendationSchema,
      'flash', // Use flash model for faster recommendations
      {
        userId,
        operation: 'activity_recommendation',
        entityType: 'ActivityRecommendation',
        entityId: undefined
      }
    );
    
    logger.log("Analysis generated", { recommendation: analysis.recommendation });
    
    // Update or create the recommendation
    let recommendation;
    if (recommendationId) {
      // Update the existing pending recommendation
      recommendation = await prisma.activityRecommendation.update({
        where: { id: recommendationId },
        data: {
          recommendation: analysis.recommendation,
          confidence: analysis.confidence,
          reasoning: analysis.reasoning,
          analysisJson: analysis as any,
          plannedWorkoutId: plannedWorkout?.id,
          status: 'COMPLETED',
          modelVersion: 'gemini-2.0-flash-exp'
        }
      });
    } else {
      // Fallback: create new recommendation if no ID provided
      recommendation = await prisma.activityRecommendation.create({
        data: {
          userId,
          date: today,
          recommendation: analysis.recommendation,
          confidence: analysis.confidence,
          reasoning: analysis.reasoning,
          analysisJson: analysis as any,
          plannedWorkoutId: plannedWorkout?.id,
          status: 'COMPLETED',
          modelVersion: 'gemini-2.0-flash-exp'
        }
      });
    }
    
    logger.log("Recommendation saved", {
      recommendationId: recommendation.id,
      decision: analysis.recommendation
    });
    
    return {
      success: true,
      recommendationId: recommendation.id,
      recommendation: analysis.recommendation
    };
  }
});