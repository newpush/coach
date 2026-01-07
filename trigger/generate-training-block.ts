import { logger, task } from "@trigger.dev/sdk/v3";
import { generateStructuredAnalysis } from "../server/utils/gemini";
import { prisma } from "../server/utils/db";
import { userReportsQueue } from "./queues";
import { getUserTimezone, getStartOfDaysAgoUTC, getStartOfDayUTC, formatUserDate } from "../server/utils/date";

const trainingBlockSchema = {
  type: "object",
  properties: {
    weeks: {
      type: "array",
      description: "List of training weeks in this block",
      items: {
        type: "object",
        properties: {
          weekNumber: { type: "integer", description: "1-based index within the block" },
          focus: { type: "string", description: "Primary focus of this week (e.g. Loading, Recovery)" },
          volumeTargetMinutes: { type: "integer" },
          workouts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                dayOfWeek: { type: "integer", description: "0=Sunday, 1=Monday, ..., 6=Saturday" },
                title: { type: "string", description: "Workout title (e.g. '3x10m Sweet Spot')" },
                description: { type: "string", description: "Brief description of the workout goal" },
                type: { type: "string", enum: ["Ride", "Run", "Swim", "Gym", "Rest", "Active Recovery"] },
                durationMinutes: { type: "integer" },
                tssEstimate: { type: "integer" },
                intensity: {
                  type: "string",
                  enum: ["recovery", "easy", "moderate", "hard", "very_hard"],
                  description: "Overall intensity level"
                }
              },
              required: ["dayOfWeek", "title", "type", "durationMinutes", "intensity"]
            }
          }
        },
        required: ["weekNumber", "workouts"]
      }
    }
  },
  required: ["weeks"]
};

export const generateTrainingBlockTask = task({
  id: "generate-training-block",
  queue: userReportsQueue,
  maxDuration: 300, // 5 minutes
  run: async (payload: { userId: string; blockId: string }) => {
    const { userId, blockId } = payload;
    
    logger.log("Starting training block generation", { userId, blockId });
    
    const timezone = await getUserTimezone(userId);

    // 1. Fetch Context
    const block = await prisma.trainingBlock.findUnique({
      where: { id: blockId },
      include: {
        plan: {
          include: {
            goal: {
              include: { events: true }
            }
          }
        }
      }
    });
    
    if (!block) throw new Error("Block not found");
    
    const [user, availability] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { ftp: true, weight: true, maxHr: true, aiPersona: true }
      }),
      prisma.trainingAvailability.findMany({
        where: { userId }
      })
    ]);
    
    // 2. Format Availability Context
    const scheduleContext = availability.map(day => {
      const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day.dayOfWeek];
      const slots = [];
      if (day.morning) slots.push("Morning");
      if (day.afternoon) slots.push("Afternoon");
      if (day.evening) slots.push("Evening");
      
      if (slots.length === 0) return `${dayName}: REST DAY (No availability)`;
      return `${dayName}: Available (${slots.join(", ")}) - Preferred: ${day.preferredTypes ? JSON.stringify(day.preferredTypes) : "Any"}`;
    }).join("\n");
    
    // 3. Build Prompt
    const eventsList = block.plan.goal.events && block.plan.goal.events.length > 0 
      ? block.plan.goal.events.map((e: any) => `- ${e.title}: ${formatUserDate(e.date, timezone)} (${e.type || 'Race'})`).join('\n')
      : `- Primary Event Date: ${formatUserDate(block.plan.goal.eventDate || block.plan.targetDate || new Date(), timezone)}`;

    // NEW: Get activity types from plan
    const allowedTypes = (block.plan as any).activityTypes || ["Ride"]; // Default to Ride if missing
    const allowedTypesString = Array.isArray(allowedTypes) ? allowedTypes.join(", ") : "Ride";

    const prompt = `You are an expert endurance coach designing a specific mesocycle (training block) for an athlete.

ATHLETE PROFILE:
- FTP: ${user?.ftp || 'Unknown'} W
- Weight: ${user?.weight || 'Unknown'} kg
- Coach Persona: ${user?.aiPersona || 'Supportive'}
- Allowed Workout Types: ${allowedTypesString} (ONLY schedule these types + Rest/Recovery)

TRAINING GOAL:
- Goal Title: ${block.plan.goal.title}
- Events:
${eventsList}
- Strategy: ${block.plan.strategy}

BLOCK CONTEXT:
- Block Name: "${block.name}"
- Phase Type: ${block.type} (e.g. Base, Build, Peak)
- Primary Focus: ${block.primaryFocus}
- Duration: ${block.durationWeeks} weeks
- Start Date: ${formatUserDate(block.startDate, timezone)}
- Progression Logic: ${block.progressionLogic || "Standard linear progression"}
- Recovery Week: Week ${block.recoveryWeekIndex || 4} is a recovery week.

WEEKLY SCHEDULE CONSTRAINTS:
${scheduleContext || "No specific constraints, assume standard training week (Mon rest, Tue/Thu intensity, Sat/Sun long)."}

INSTRUCTIONS:
Generate a detailed daily training plan for each week in this block (${block.durationWeeks} weeks).
- Adhere strictly to the Schedule Constraints (do not schedule workouts on unavailable days).
- ONLY use the "Allowed Workout Types" listed above. Do not schedule a Swim if only "Ride" is allowed.
- Ensure progressive overload from week 1 to ${block.durationWeeks - 1}.
- Ensure the recovery week (if applicable) has significantly reduced volume and intensity.
- For "Ride" workouts, provide realistic TSS estimates based on duration and intensity.
- Workout types: ${allowedTypesString}, Rest, Active Recovery.

OUTPUT FORMAT:
Return valid JSON matching the schema provided.`;

    // 4. Generate with Gemini
    logger.log("Prompting Gemini...");
    const result = await generateStructuredAnalysis<any>(
      prompt,
      trainingBlockSchema,
      'flash', // Flash is usually sufficient for planning, switch to Pro if logic is complex
      {
        userId,
        operation: 'generate_training_block',
        entityType: 'TrainingBlock',
        entityId: blockId
      }
    );
    
    // 5. Persist Results
    logger.log("Persisting generated plan...", { weeksCount: result.weeks.length });
    
    await prisma.$transaction(async (tx) => {
      // Clear existing generated weeks for this block to avoid duplicates if re-running
      // First, find existing weeks to delete their workouts
      const existingWeeks = await tx.trainingWeek.findMany({
        where: { blockId },
        select: { id: true }
      });
      
      const weekIds = existingWeeks.map(w => w.id);
      
      if (weekIds.length > 0) {
        // Delete workouts attached to these weeks to prevent orphans
        await tx.plannedWorkout.deleteMany({
          where: { trainingWeekId: { in: weekIds } }
        });
        
        // Delete the weeks themselves
        await tx.trainingWeek.deleteMany({
          where: { blockId }
        });
      }

      for (const weekData of result.weeks) {
        // Calculate dates
        const weekStartDate = new Date(block.startDate);
        weekStartDate.setDate(weekStartDate.getDate() + (weekData.weekNumber - 1) * 7);
        const weekEndDate = new Date(weekStartDate);
        weekEndDate.setDate(weekEndDate.getDate() + 6);
        
        // Create Week
        const createdWeek = await tx.trainingWeek.create({
          data: {
            blockId,
            weekNumber: weekData.weekNumber,
            startDate: weekStartDate,
            endDate: weekEndDate,
            focus: weekData.focus,
            volumeTargetMinutes: weekData.volumeTargetMinutes || 0,
            tssTarget: weekData.workouts.reduce((acc: number, w: any) => acc + (w.tssEstimate || 0), 0),
            isRecovery: weekData.focus?.toLowerCase().includes('recovery') || false
          }
        });
        
        // Create Workouts
        const workoutsData = weekData.workouts.map((workout: any, index: number) => {
          // Logic assuming Block Start is ALWAYS aligned to start of week (e.g. Monday)
          // Mon=1 -> offset 0
          // Sun=0 -> offset 6
          
          // Validate dayOfWeek (0-6)
          let dayOfWeek = workout.dayOfWeek;
          if (dayOfWeek < 0 || dayOfWeek > 6) {
             logger.warn("Invalid dayOfWeek from AI, clamping", { dayOfWeek, weekNumber: weekData.weekNumber });
             dayOfWeek = Math.max(0, Math.min(6, dayOfWeek));
          }

          const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
          const workoutDate = new Date(weekStartDate);
          workoutDate.setDate(workoutDate.getDate() + offset);

          return {
            userId,
            trainingWeekId: createdWeek.id,
            date: workoutDate,
            title: workout.title,
            description: workout.description,
            type: workout.type,
            durationSec: (workout.durationMinutes || 0) * 60,
            tss: workout.tssEstimate,
            workIntensity: getIntensityScore(workout.intensity),
            externalId: `ai-gen-${createdWeek.id}-${dayOfWeek}-${index}-${Date.now()}`,
            category: 'WORKOUT'
          };
        });

        if (workoutsData.length > 0) {
          await tx.plannedWorkout.createMany({
            data: workoutsData
          });
        }
      }
    }, {
      timeout: 20000 // Increase timeout to 20s to handle larger blocks/slower db
    });
    
    return { success: true, blockId };
  }
});

function getIntensityScore(intensity: string): number {
  switch (intensity) {
    case 'recovery': return 0.3;
    case 'easy': return 0.5;
    case 'moderate': return 0.7;
    case 'hard': return 0.85;
    case 'very_hard': return 0.95;
    default: return 0.5;
  }
}
