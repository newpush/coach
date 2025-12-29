import { logger, task } from "@trigger.dev/sdk/v3";
import { generateStructuredAnalysis } from "../server/utils/gemini";
import { prisma } from "../server/utils/db";
import { workoutRepository } from "../server/utils/repositories/workoutRepository";
import { wellnessRepository } from "../server/utils/repositories/wellnessRepository";
import { generateTrainingContext } from "../server/utils/training-metrics";
import { userBackgroundQueue } from "./queues";

    const weeklyPlanSchema = {
  type: 'object',
  properties: {
    weekSummary: {
      type: 'string',
      description: 'Brief overview of the weekly plan strategy'
    },
    totalTSS: {
      type: 'number',
      description: 'Total weekly Training Stress Score'
    },
    days: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date in YYYY-MM-DD format (must be within the planned week range)' },
          dayOfWeek: { type: 'number', description: 'Day of week (0-6)' },
          workoutType: { 
            type: 'string',
            description: 'Type of workout: Ride, Run, Gym, Swim, or Rest. DO NOT use generic terms like "Workout" or "Active Recovery". For recovery days, use "Rest" or a light "Ride"/"Run".',
            enum: ['Ride', 'Run', 'Gym', 'Swim', 'Rest']
          },
          timeOfDay: {
            type: 'string',
            enum: ['morning', 'afternoon', 'evening'],
            description: 'Recommended time of day'
          },
          title: { type: 'string', description: 'Workout title' },
          description: { type: 'string', description: 'Detailed workout description' },
          durationMinutes: { type: 'number', description: 'Duration in minutes' },
          distanceMeters: { type: 'number', description: 'Estimated distance in meters (for Run/Swim)' },
          targetArea: { type: 'string', description: 'Focus area for Gym workouts (e.g. Legs, Upper Body, Core)' },
          targetTSS: { type: 'number', description: 'Target Training Stress Score' },
          intensity: {
            type: 'string',
            enum: ['recovery', 'easy', 'moderate', 'hard', 'very_hard'],
            description: 'Workout intensity level'
          },
          location: {
            type: 'string',
            enum: ['indoor', 'outdoor', 'gym'],
            description: 'Location for the workout'
          },
          reasoning: {
            type: 'string',
            description: 'Why this workout on this day'
          }
        },
        required: ['date', 'dayOfWeek', 'workoutType', 'title', 'description', 'durationMinutes', 'reasoning']
      }
    }
  },
  required: ['weekSummary', 'totalTSS', 'days']
};

export const generateWeeklyPlanTask = task({
  id: "generate-weekly-plan",
  queue: userBackgroundQueue,
  run: async (payload: { userId: string; startDate: Date; daysToPlann: number; userInstructions?: string; trainingWeekId?: string }) => {
    const { userId, startDate, daysToPlann, userInstructions, trainingWeekId } = payload;
    
    logger.log("Starting weekly plan generation", { userId, startDate, daysToPlann, userInstructions, trainingWeekId });
    
    const start = new Date(startDate);
    logger.log("Parsed startDate", { original: startDate, parsed: start.toISOString(), localString: start.toString() });

    start.setHours(0, 0, 0, 0); // Start of day 00:00:00 local time
    
    // Calculate week boundaries
    const weekStart = new Date(start);
    const day = weekStart.getDay();
    const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
    weekStart.setDate(diff);
    weekStart.setHours(0, 0, 0, 0); // Ensure 00:00:00
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + (daysToPlann - 1));
    weekEnd.setHours(23, 59, 59, 999); // Ensure end of day

    logger.log("Week boundaries calculated", { 
        weekStart: weekStart.toISOString(), 
        weekEnd: weekEnd.toISOString(),
        weekStartLocal: weekStart.toString(),
        weekEndLocal: weekEnd.toString()
    });
    
    // Fetch user data
    const [user, availability, recentWorkouts, recentWellness, currentPlan, athleteProfile, activeGoals, existingPlannedWorkouts] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { ftp: true, weight: true, maxHr: true }
      }),
      prisma.trainingAvailability.findMany({
        where: { userId },
        orderBy: { dayOfWeek: 'asc' }
      }),
      workoutRepository.getForUser(userId, {
        startDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // Last 14 days
        endDate: start, // strictly less than start handled by lte in repo? Repo uses lte.
        // We need 'lt' strictly speaking, but for daily granularity, using day before as endDate is safer or just accept overlaps?
        // Let's use the date range as is, repo uses lte.
        // Actually, start is set to 00:00:00 of the planning start date.
        // So we want everything BEFORE that.
        // Repo getForUser uses 'lte'. So if we pass 'start' it will include workouts on 'start' day at 00:00:00.
        // We should pass 'new Date(start.getTime() - 1)' as endDate.
        limit: 10,
        orderBy: { date: 'desc' }
      }),
      wellnessRepository.getForUser(userId, {
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        endDate: start,
        limit: 7,
        orderBy: { date: 'desc' }
      }),
      prisma.weeklyTrainingPlan.findFirst({
        where: {
          userId,
          weekStartDate: weekStart
        }
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
      }),
      
      // Active goals
      prisma.goal.findMany({
        where: {
          userId,
          status: 'ACTIVE'
        },
        orderBy: { priority: 'desc' },
        select: {
          id: true,
          type: true,
          title: true,
          description: true,
          metric: true,
          currentValue: true,
          targetValue: true,
          targetDate: true,
          eventDate: true,
          eventType: true,
          priority: true,
          aiContext: true
        }
      }),
      
      // Existing planned workouts for this week
      prisma.plannedWorkout.findMany({
        where: {
          userId,
          date: {
            gte: weekStart,
            lte: weekEnd
          }
        },
        orderBy: { date: 'asc' },
        select: {
          id: true,
          date: true,
          title: true,
          description: true,
          type: true,
          durationSec: true,
          distanceMeters: true,
          tss: true,
          targetArea: true
        }
      })
    ]);

    logger.log("Existing workouts fetched details", { 
        count: existingPlannedWorkouts.length,
        workouts: existingPlannedWorkouts.map(w => ({ date: w.date.toISOString(), title: w.title, id: w.id }))
    });
    
    logger.log("Data fetched", {
      hasUser: !!user,
      availabilityDays: availability.length,
      recentWorkoutsCount: recentWorkouts.length,
      recentWellnessCount: recentWellness.length,
      hasExistingPlan: !!currentPlan,
      hasAthleteProfile: !!athleteProfile,
      activeGoals: activeGoals.length
    });
    
    // Build availability summary
    const availabilitySummary = availability.map(a => {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const slots = [];
      if (a.morning) slots.push('morning');
      if (a.afternoon) slots.push('afternoon');
      if (a.evening) slots.push('evening');
      
      const constraints = [];
      if (a.bikeAccess) constraints.push('bike/trainer available');
      if (a.gymAccess) constraints.push('gym available');
      if (a.indoorOnly) constraints.push('indoor only');
      if (a.outdoorOnly) constraints.push('outdoor only');
      
      // Build the line
      let line = `${dayNames[a.dayOfWeek]}: ${slots.length > 0 ? slots.join(', ') : 'rest day'}`;
      if (constraints.length > 0) {
        line += ` (${constraints.join(', ')})`;
      }
      
      // Add explicit warnings for equipment limitations
      if (slots.length > 0 && !a.bikeAccess && !a.gymAccess) {
        line += ' [NO EQUIPMENT - only bodyweight activities]';
      } else if (slots.length > 0 && !a.bikeAccess && a.gymAccess) {
        line += ' [NO BIKE - gym strength training only]';
      } else if (slots.length > 0 && a.bikeAccess && !a.gymAccess) {
        line += ' [cycling only, no gym]';
      }
      
      return line;
    }).join('\n');
    
    // Calculate recent training load
    const recentTSS = recentWorkouts.reduce((sum, w) => sum + (w.tss || 0), 0);
    const avgRecovery = recentWellness.length > 0
      ? recentWellness.reduce((sum, w) => sum + (w.recoveryScore || 50), 0) / recentWellness.length
      : 50;
    
    // Generate training context for load management
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const trainingContext = await generateTrainingContext(userId, thirtyDaysAgo, now, {
      includeZones: false,
      includeBreakdown: true
    });

    // Determine current training phase if a goal exists
    let phaseInstruction = "";
    const primaryGoal = activeGoals.find(g => g.type === 'EVENT' && g.priority === 'HIGH') || activeGoals[0];
    
    // Fetch full Plan context if available (via trainingWeekId)
    let planContext = "";
    if (trainingWeekId) {
        const fullContext = await prisma.trainingWeek.findUnique({
            where: { id: trainingWeekId },
            include: {
                block: {
                    include: {
                        plan: {
                            include: { goal: true }
                        }
                    }
                }
            }
        });

        if (fullContext) {
            planContext = `
CONTEXT FROM MASTER PLAN:
- Plan Name: ${fullContext.block.plan.name || fullContext.block.plan.goal?.title || 'Custom Plan'}
- Current Block: "${fullContext.block.name}" (${fullContext.block.type} Phase)
- Block Focus: ${fullContext.block.primaryFocus}
- Current Week: Week ${fullContext.weekNumber} of ${fullContext.block.durationWeeks} in this block.
- Week Focus: ${fullContext.focus || 'Standard Progression'}
- Target Weekly Volume: ${Math.round(fullContext.volumeTargetMinutes / 60)} hours
- Target Weekly TSS: ${fullContext.tssTarget}
`;
            // Override phase instruction with strict block context
            phaseInstruction = `\nCURRENT PHASE: ${fullContext.block.type}. Focus strictly on ${fullContext.block.primaryFocus}. This is Week ${fullContext.weekNumber} of the block.`;
        }
    }
    
    if (!phaseInstruction && primaryGoal) {
      const today = new Date();
      const goalDate = primaryGoal.eventDate || primaryGoal.targetDate;
      
      if (goalDate) {
        const weeksToGoal = Math.ceil((new Date(goalDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 7));
        
        // Extract phase preference from aiContext if available
        let preferredPhase = "";
        if (primaryGoal.aiContext?.includes("Phase Preference:")) {
          preferredPhase = primaryGoal.aiContext.split("Phase Preference:")[1].split(".")[0].trim();
        }

        if (preferredPhase) {
          phaseInstruction = `\nUSER SPECIFIED PHASE: ${preferredPhase}. Focus the training plan strictly on this phase's objectives.`;
        } else if (weeksToGoal > 12) {
          phaseInstruction = `\nRECOMMENDED PHASE: BASE. Focus on building aerobic foundation and muscular endurance.`;
        } else if (weeksToGoal > 4) {
          phaseInstruction = `\nRECOMMENDED PHASE: BUILD. Focus on specificity, threshold, and race-intensity workouts.`;
        } else if (weeksToGoal > 0) {
          phaseInstruction = `\nRECOMMENDED PHASE: SPECIALTY/PEAK. Focus on maximum specificity, race simulation, and tapering.`;
        }
      }
    }
    
    // Calculate current and target TSS values
    const currentWeeklyTSS = trainingContext.loadTrend.weeklyTSSAvg;
    const targetMinTSS = Math.round(currentWeeklyTSS * 1.05); // 5% increase
    const targetMaxTSS = Math.round(currentWeeklyTSS * 1.10); // 10% increase
    
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
${profile.recent_performance?.patterns ? profile.recent_performance.patterns.map((p: string) => `- ${p}`).join('\n') : ''}

Planning Context:
${profile.planning_context?.current_focus ? `Current Focus: ${profile.planning_context.current_focus}` : ''}
${profile.planning_context?.limitations?.length ? `Limitations: ${profile.planning_context.limitations.join(', ')}` : ''}
${profile.planning_context?.opportunities?.length ? `Opportunities: ${profile.planning_context.opportunities.join(', ')}` : ''}

Recommendations Summary:
${profile.recommendations_summary?.recurring_themes?.length ? `Themes: ${profile.recommendations_summary.recurring_themes.join('; ')}` : ''}
${profile.recommendations_summary?.action_items?.length ? `Priority Actions:\n${profile.recommendations_summary.action_items.map((a: any) => `- [${a.priority}] ${a.action}`).join('\n')}` : ''}
`;
    } else {
      athleteContext = `
USER BASIC INFO:
- FTP: ${user?.ftp || 'Unknown'} watts
- Weight: ${user?.weight || 'Unknown'} kg
- Max HR: ${user?.maxHr || 'Unknown'} bpm
Note: No structured athlete profile available yet. Consider generating one for better personalized planning.
`;
    }
    
    // Add goals context
    if (activeGoals.length > 0) {
      athleteContext += `

CURRENT GOALS:
${activeGoals.map(g => {
  const daysToTarget = g.targetDate ? Math.ceil((new Date(g.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
  const daysToEvent = g.eventDate ? Math.ceil((new Date(g.eventDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
  
  let goalInfo = `- [${g.priority}] ${g.title} (${g.type})`;
  if (g.description) goalInfo += `\n  ${g.description}`;
  if (g.metric && g.targetValue) {
    goalInfo += `\n  Target: ${g.metric} = ${g.targetValue}`;
    if (g.currentValue) goalInfo += ` (Current: ${g.currentValue})`;
  }
  if (daysToTarget) goalInfo += `\n  Timeline: ${daysToTarget} days remaining`;
  if (daysToEvent) goalInfo += `\n  Event: ${g.eventType || 'race'} on ${new Date(g.eventDate!).toLocaleDateString()} (${daysToEvent} days)`;
  if (g.aiContext) goalInfo += `\n  Context: ${g.aiContext}`;
  
  return goalInfo;
}).join('\n\n')}
`;
    } else {
      athleteContext += `

CURRENT GOALS:
No active goals set. Plan for general fitness maintenance and improvement.
`;
    }
    
    // Build prompt
    const prompt = `You are an expert cycling coach creating a personalized ${daysToPlann}-day training plan.
${phaseInstruction}
${planContext}

${athleteContext}

TRAINING AVAILABILITY (when user can train):
${availabilitySummary || 'No availability set - assume flexible schedule'}

USER INSTRUCTIONS (HIGHEST PRIORITY):
${userInstructions ? `"${userInstructions}"\n\nFollow these instructions above everything else. They override standard progression and availability constraints.` : 'No special instructions.'}

CURRENT PLANNED WORKOUTS FOR THIS WEEK (For Context):
${existingPlannedWorkouts.length > 0 
  ? existingPlannedWorkouts.map(w => 
      `- ${new Date(w.date).toLocaleDateString()}: ${w.title} (${w.type}, ${Math.round((w.durationSec || 0) / 60)}min)`
    ).join('\n')
  : 'None currently planned'
}

RECENT TRAINING (Last 14 days):
${recentWorkouts.slice(0, 3).map(w => 
    `${new Date(w.date).toLocaleDateString()}: ${w.title} (TSS: ${w.tss || 'N/A'}, ${Math.round(w.durationSec / 60)}min)`
  ).join(', ') || 'No recent workouts'}

RECENT RECOVERY (Last 7 days):
- Average recovery score: ${avgRecovery.toFixed(0)}%
- Latest HRV: ${recentWellness[0]?.hrv || 'N/A'} ms
- Latest resting HR: ${recentWellness[0]?.restingHr || 'N/A'} bpm

PLANNING PERIOD:
- Start: ${weekStart.toISOString().split('T')[0]} (YYYY-MM-DD)
- End: ${weekEnd.toISOString().split('T')[0]} (YYYY-MM-DD)
- Days to plan: ${daysToPlann}

INSTRUCTIONS:
1. **PRIORITIZE USER INSTRUCTIONS**: If the user asks for specific changes (e.g., "no rides this week"), STRICTLY follow them, even if it contradicts standard training principles.
2. **RESPECT AVAILABILITY**: Do not schedule workouts on days marked as "rest day" or conflicting with time slots unless the User Instructions explicitly override this.
3. **WORKOUT TYPES**:
   - USE ONLY: Ride, Run, Gym, Swim, Rest.
   - **DO NOT USE**: "Workout", "Active Recovery", or other generic types. Map recovery sessions to a light "Ride" or "Run" or "Rest".
   - "Gym" means strength training.
4. **PROGRESSION**:
   - If User Instructions are absent/minimal, aim for progressive overload based on the current phase.
   - Weekly TSS target: ${Math.round(currentWeeklyTSS)} - ${targetMaxTSS} (unless overridden by instructions).
5. **CONTEXT**: Consider the "Current Planned Workouts" to understand what the user is replacing or modifying.

Create a structured, progressive plan for the next ${daysToPlann} days.`;

    logger.log("Generating plan with Gemini Flash");
    
    // Log prompt instructions for debugging
    const instructionStart = prompt.indexOf("INSTRUCTIONS:");
    logger.log("Prompt Instructions sent to AI", { 
        instructions: instructionStart > -1 ? prompt.substring(instructionStart) : "Instructions not found in prompt",
        userInstructions: userInstructions || "None"
    });

    const plan = await generateStructuredAnalysis(
      prompt,
      weeklyPlanSchema,
      'flash',
      {
        userId,
        operation: 'weekly_plan_generation',
        entityType: 'WeeklyTrainingPlan',
        entityId: undefined
      }
    );
    
    logger.log("Plan generated from AI", { 
      daysPlanned: (plan as any).days?.length,
      days: (plan as any).days?.map((d: any) => ({ date: d.date, type: d.workoutType })),
      totalTSS: (plan as any).totalTSS
    });
    
    // Save or update the plan
    const planData = {
      userId,
      weekStartDate: weekStart,
      weekEndDate: weekEnd,
      daysPlanned: daysToPlann,
      status: 'ACTIVE',
      generatedBy: 'AI',
      modelVersion: 'gemini-2.0-flash-exp',
      planJson: plan as any,
      totalTSS: (plan as any).totalTSS,
      totalDuration: (plan as any).days?.reduce((sum: number, d: any) => sum + (d.durationMinutes || 0) * 60, 0),
      workoutCount: (plan as any).days?.filter((d: any) => d.workoutType !== 'Rest').length
    };
    
    const savedPlan = currentPlan
      ? await prisma.weeklyTrainingPlan.update({
          where: { id: currentPlan.id },
          data: {
            ...planData,
            updatedAt: new Date()
          }
        })
      : await prisma.weeklyTrainingPlan.create({
          data: planData
        });
    
    // Also update the individual planned workouts if this is an active plan
    if (savedPlan.status === 'ACTIVE') {
      // First, clear existing future planned workouts for this period to avoid duplicates
      // We only clear workouts that haven't been completed
      const deleted = await prisma.plannedWorkout.deleteMany({
        where: {
          userId,
          date: {
            gte: weekStart,
            lte: weekEnd
          },
          completed: false
        }
      });
      logger.log("Deleted existing planned workouts", { count: deleted.count, weekStart: weekStart.toISOString(), weekEnd: weekEnd.toISOString() });

      // Insert new workouts from the generated plan
      const workoutsToCreate = (plan as any).days
        // REMOVED filter: .filter((d: any) => d.workoutType !== 'Rest') 
        // We want to create Rest days too if the UI expects them, or at least not filter them out if they have structure
        // But usually Rest days are just gaps. 
        // However, the issue might be that the AI generated "Rest" days for everything if it failed?
        // Or date parsing issues.
        .filter((d: any) => d.workoutType !== 'Rest')
        .map((d: any) => {
          // Parse date strictly from the AI response
          // AI returns 'YYYY-MM-DD'
          // We need to treat this as the local date for the user, not UTC.
          // weekStart and weekEnd are set to local 00:00:00 and 23:59:59 timestamps.
          // If we parse 'YYYY-MM-DD' as UTC, it might be the previous day in local time.
          
          const rawDate = d.date;
          // Construct date object using local parts to avoid UTC shift
          const [y, m, day] = rawDate.split('-').map(Number);
          const workoutDate = new Date(y, m - 1, day, 12, 0, 0); // Set to noon to be safe from DST shifts
          
          logger.log("Processing generated workout day", {
             rawDate: d.date,
             parsedDate: workoutDate.toISOString(),
             isValid: !isNaN(workoutDate.getTime()),
             title: d.title
          });

          // Ensure the date is valid
          if (isNaN(workoutDate.getTime())) {
             logger.error("Invalid date in generated plan", { date: d.date });
             console.log("DEBUG: Invalid date", d.date);
             return null;
          }

          // Strict validation: Date MUST be within the planned week
          // We compare timestamps to avoid timezone confusion, but add a buffer of 12 hours
          // to handle potential "noon" vs "midnight" discrepancies
          const buffer = 12 * 60 * 60 * 1000;
          if (workoutDate.getTime() < (weekStart.getTime() - buffer) || workoutDate.getTime() > (weekEnd.getTime() + buffer)) {
             logger.error("Generated date out of range", { 
               date: d.date, 
               parsed: workoutDate.toISOString(),
               weekStart: weekStart.toISOString(), 
               weekEnd: weekEnd.toISOString() 
             });
             console.log("DEBUG: Date out of range", { 
               date: d.date, 
               parsed: workoutDate.toISOString(),
               weekStart: weekStart.toISOString(), 
               weekEnd: weekEnd.toISOString() 
             });
             // Try to fix it? Or skip?
             // Skipping is safer to avoid pollution
             return null;
          }

          return {
          userId,
          date: workoutDate,
          title: d.title,
          description: d.description + (d.reasoning ? `\n\nReasoning: ${d.reasoning}` : ''),
          // Map AI "Gym" type to "WeightTraining" which is standard in Intervals/our DB
          // "Rest" is preserved. Everything else is passed through.
          // AI has been instructed NOT to use "Workout" or "Active Recovery".
          // If it still does, we map Active Recovery to a light Ride or Run based on user profile would be better,
          // but for now let's map to "Workout" as a fallback so it doesn't crash, but log it.
          type: d.workoutType === 'Gym' ? 'WeightTraining' : d.workoutType,
          durationSec: (d.durationMinutes || 0) * 60,
          distanceMeters: d.distanceMeters,
          tss: d.targetTSS,
          targetArea: d.targetArea,
          workIntensity: d.intensity === 'recovery' ? 0.5 : d.intensity === 'easy' ? 0.6 : d.intensity === 'moderate' ? 0.75 : d.intensity === 'hard' ? 0.9 : 1.0,
          category: 'WORKOUT',
          externalId: `ai_gen_${userId}_${d.date}_${Date.now()}_${Math.random().toString(36).substring(7)}`, // Generate unique external ID
          syncStatus: 'LOCAL_ONLY', // Mark as local initially
          trainingWeekId: undefined // We'll link this if we have a TrainingWeek record
        }}).filter(Boolean); // Remove nulls

      logger.log("Workouts prepared for creation", { count: workoutsToCreate.length, data: workoutsToCreate });

      if (workoutsToCreate.length > 0) {
        
        let targetTrainingWeekId: string | undefined = trainingWeekId;

        // If explicitly passed, verify it exists and use it
        if (targetTrainingWeekId) {
             const verifiedWeek = await prisma.trainingWeek.findUnique({
                 where: { id: targetTrainingWeekId }
             });
             if (!verifiedWeek) {
                 logger.warn("Explicitly passed trainingWeekId not found in DB", { trainingWeekId });
                 targetTrainingWeekId = undefined; // Fallback to search logic
             } else {
                 logger.log("Using explicitly passed TrainingWeek ID", { trainingWeekId });
                 console.log(`Using explicitly passed TrainingWeek ID: ${trainingWeekId}`);
             }
        }

        // If not found or not passed, search for it
        if (!targetTrainingWeekId) {
            // Find the TrainingWeek ID to link these workouts to, if possible
            const trainingWeek = await prisma.trainingWeek.findFirst({
                where: {
                    block: {
                        plan: {
                            userId: userId,
                            status: 'ACTIVE'
                        }
                    },
                    startDate: {
                        lte: weekStart
                    },
                    endDate: {
                        gte: weekEnd
                    }
                }
            });
            if (trainingWeek) targetTrainingWeekId = trainingWeek.id;
        }

        if (targetTrainingWeekId) {
            logger.log("Linking generated workouts to TrainingWeek", { trainingWeekId: targetTrainingWeekId });
            console.log(`Linking generated workouts to TrainingWeek ID: ${targetTrainingWeekId}`);
            workoutsToCreate.forEach(w => {
                if (w) (w as any).trainingWeekId = targetTrainingWeekId;
            });
        } else {
             // FALLBACK: Try to find ANY training week for this user that overlaps with this week
             // This handles cases where the plan might not be strictly 'ACTIVE' or dates are slightly off
             const fallbackWeek = await prisma.trainingWeek.findFirst({
                where: {
                    block: {
                        plan: {
                           userId: userId
                        }
                    },
                    startDate: {
                        lte: weekEnd
                    },
                    endDate: {
                        gte: weekStart
                    }
                }
             });

             if (fallbackWeek) {
                 logger.log("Found fallback TrainingWeek", { trainingWeekId: fallbackWeek.id });
                 console.log(`Linking to fallback TrainingWeek ID: ${fallbackWeek.id}`);
                 workoutsToCreate.forEach(w => {
                    if (w) (w as any).trainingWeekId = fallbackWeek.id;
                 });
             } else {
                 logger.warn("No matching TrainingWeek found for these workouts - they will be unlinked from the structured plan", {
                    weekStart: weekStart.toISOString(),
                    weekEnd: weekEnd.toISOString()
                 });
                 console.log("WARNING: No matching TrainingWeek found. Workouts will be unlinked.");
             }
        }

        // Use createMany but we need to match the type exactly.
        // Prisma createMany is strict.
        const result = await prisma.plannedWorkout.createMany({
          data: workoutsToCreate as any
        });
        logger.log("Created workouts in DB", { count: result.count });
      } else {
        logger.warn("No workouts to create found in plan");
      }
    }

    logger.log("Plan saved", { planId: savedPlan.id });
    
    return {
      success: true,
      planId: savedPlan.id,
      userId,
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      daysPlanned: daysToPlann,
      totalTSS: savedPlan.totalTSS,
      workoutCount: savedPlan.workoutCount
    };
  }
});