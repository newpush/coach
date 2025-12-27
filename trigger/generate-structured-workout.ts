import { logger, task } from "@trigger.dev/sdk/v3";
import { generateStructuredAnalysis } from "../server/utils/gemini";
import { prisma } from "../server/utils/db";
import { userReportsQueue } from "./queues";

const workoutStructureSchema = {
  type: "object",
  properties: {
    description: { type: "string", description: "Overall workout strategy description" },
    coachInstructions: { type: "string", description: "Personalized coaching advice based on athlete profile" },
    steps: {
      type: "array",
      description: "Linear sequence of workout steps",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["Warmup", "Active", "Rest", "Cooldown"] },
          durationSeconds: { type: "integer" },
          power: {
            type: "object",
            properties: {
              value: { type: "number", description: "Target % of FTP (e.g. 0.95)" },
              range: { 
                type: "object", 
                properties: { start: { type: "number" }, end: { type: "number" } },
                description: "For ramps: start and end % of FTP"
              }
            }
          },
          cadence: { type: "integer" },
          name: { type: "string", description: "e.g. '5min @ 95%'" }
        },
        required: ["type", "durationSeconds", "name"]
      }
    }
  },
  required: ["steps", "coachInstructions"]
};

export const generateStructuredWorkoutTask = task({
  id: "generate-structured-workout",
  queue: userReportsQueue,
  run: async (payload: { plannedWorkoutId: string }) => {
    const { plannedWorkoutId } = payload;
    
    const workout = await (prisma as any).plannedWorkout.findUnique({
      where: { id: plannedWorkoutId },
      include: {
        user: { select: { ftp: true, aiPersona: true, name: true } },
        trainingWeek: {
          include: {
            block: {
              include: {
                plan: {
                  include: {
                    goal: true
                  }
                }
              }
            }
          }
        }
      }
    });
    
    if (!workout) throw new Error("Workout not found");
    
    // Build context
    const persona = workout.user.aiPersona || 'Supportive';
    const goal = workout.trainingWeek?.block.plan.goal?.title || workout.trainingWeek?.block.plan.name || 'General Fitness';
    const phase = workout.trainingWeek?.block.type || 'General';
    const focus = workout.trainingWeek?.block.primaryFocus || 'Fitness';
    
    const prompt = `Design a structured cycling workout for ${workout.user.name || 'Athlete'}.
    
    TITLE: ${workout.title}
    DURATION: ${Math.round((workout.durationSec || 3600) / 60)} minutes
    INTENSITY: ${workout.workIntensity || 'Moderate'}
    DESCRIPTION: ${workout.description || 'No specific description'}
    USER FTP: ${workout.user.ftp || 250}W
    
    CONTEXT:
    - Goal: ${goal}
    - Phase: ${phase}
    - Focus: ${focus}
    - Coach Persona: ${persona}
    
    INSTRUCTIONS:
    - Create a JSON structure defining the exact steps (Warmup, Intervals, Rest, Cooldown).
    - Ensure total duration matches the target duration exactly.
    - Use % of FTP for power targets (e.g. 0.95 = 95%).
    - For ramps (Warmup/Cooldown), use "range" with "start" and "end" values (e.g. start: 0.50, end: 0.75 for warmup).
    - Include target "cadence" (RPM) for each step (e.g. 85-95 for intervals, 60-80 for rest).
    - Add "coachInstructions": A personalized message (2-3 sentences) explaining WHY this workout matters for their goal (${goal}) and how to execute it (e.g. "Focus on smooth cadence during the efforts"). Use the '${persona}' persona tone.
    
    OUTPUT JSON format matching the schema.`;
    
    const structure = await generateStructuredAnalysis(
      prompt,
      workoutStructureSchema,
      'flash',
      {
        userId: workout.userId,
        operation: 'generate_structured_workout',
        entityType: 'PlannedWorkout',
        entityId: plannedWorkoutId
      }
    );
    
    await (prisma as any).plannedWorkout.update({
      where: { id: plannedWorkoutId },
      data: {
        structuredWorkout: structure as any
      }
    });
    
    return { success: true, plannedWorkoutId };
  }
});
