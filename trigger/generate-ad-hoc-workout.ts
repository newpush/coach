import { logger, task, tasks } from "@trigger.dev/sdk/v3";
import { generateStructuredAnalysis, buildWorkoutSummary } from "../server/utils/gemini";
import { prisma } from "../server/utils/db";
import { workoutRepository } from "../server/utils/repositories/workoutRepository";
import { wellnessRepository } from "../server/utils/repositories/wellnessRepository";

const adHocWorkoutSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    type: { type: "string", enum: ["Ride", "Run"] }, // Simplified for now
    durationMinutes: { type: "integer" },
    targetTss: { type: "integer" },
    intensity: { type: "string", enum: ["Recovery", "Endurance", "Tempo", "Threshold", "VO2Max", "Anaerobic"] },
    reasoning: { type: "string" }
  },
  required: ["title", "type", "durationMinutes", "targetTss", "intensity", "reasoning"]
};

export const generateAdHocWorkoutTask = task({
  id: "generate-ad-hoc-workout",
  maxDuration: 300,
  run: async (payload: { userId: string; date: Date; preferences?: any }) => {
    const { userId, date, preferences } = payload;
    const today = new Date(date);
    today.setHours(0, 0, 0, 0);
    
    logger.log("Generating ad-hoc workout", { userId, date: today, preferences });
    
    // Fetch Data
    const [todayMetric, recentWorkouts, user, athleteProfile] = await Promise.all([
      wellnessRepository.getByDate(userId, today),
      workoutRepository.getForUser(userId, {
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        orderBy: { date: 'desc' }
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { ftp: true, weight: true, maxHr: true, aiPersona: true }
      }),
      prisma.report.findFirst({
        where: { userId, type: 'ATHLETE_PROFILE', status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
        select: { analysisJson: true }
      })
    ]);

    // Build Context
    let context = `Athlete: FTP ${user?.ftp || 250}W. Persona: ${user?.aiPersona || 'Supportive'}.`;
    if (todayMetric) {
      context += `\nRecovery: ${todayMetric.recoveryScore || 'Unknown'}%. Sleep: ${todayMetric.sleepHours || 0}h.`;
    }
    context += `\nRecent Workouts: ${recentWorkouts.length > 0 ? buildWorkoutSummary(recentWorkouts) : 'None'}.`;
    
    if (athleteProfile?.analysisJson) {
      const p = athleteProfile.analysisJson as any;
      context += `\nFocus: ${p.planning_context?.current_focus || 'General Fitness'}.`;
    }

    // Incorporate User Preferences
    let goalPrompt = "Based on recovery and recent history, create the optimal workout.";
    if (preferences) {
      goalPrompt = `The user has requested a specific workout:
      - Type: ${preferences.type || 'Any'}
      - Duration: ${preferences.durationMinutes || 'Auto'} minutes
      - Intensity: ${preferences.intensity || 'Auto'}
      - Instructions: "${preferences.notes || 'None'}"
      
      Create a workout matching these constraints while optimizing for the athlete's context.`;
    } else {
       goalPrompt += `
      - If recovery is low (<33%), prescribe Active Recovery or Rest (but since the user ASKED for a workout, give a very easy Recovery spin/jog).
      - If recovery is good, prescribe a workout that fits the current focus or maintains fitness.`;
    }

    const prompt = `Design a specific single workout for this athlete for TODAY.
    
    CONTEXT:
    ${context}
    
    GOAL:
    ${goalPrompt}
    
    OUTPUT:
    JSON with title, description, type (Ride/Run), durationMinutes, targetTss, intensity, and reasoning.`;

    const suggestion = await generateStructuredAnalysis(
      prompt,
      adHocWorkoutSchema,
      'flash',
      { userId, operation: 'generate_ad_hoc_workout', entityType: 'PlannedWorkout' }
    );

    // Create Planned Workout
    const plannedWorkout = await prisma.plannedWorkout.create({
      data: {
        userId,
        date: today,
        title: suggestion.title,
        description: `${suggestion.description}\n\nReasoning: ${suggestion.reasoning}`,
        type: suggestion.type,
        durationSec: suggestion.durationMinutes * 60,
        tss: suggestion.targetTss,
        source: 'AI_ADHOC',
        status: 'SYNCED', // Assuming local is synced
        externalId: `adhoc-${Date.now()}` // Temporary external ID
      }
    });

    logger.log("Created planned workout", { id: plannedWorkout.id });

    // Trigger Structure Generation
    await tasks.trigger("generate-structured-workout", {
      plannedWorkoutId: plannedWorkout.id
    });

    return { success: true, plannedWorkoutId: plannedWorkout.id };
  }
});
