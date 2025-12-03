import { logger, task } from "@trigger.dev/sdk/v3";
import { generateStructuredAnalysis } from "../server/utils/gemini";
import { prisma } from "../server/utils/db";

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
          date: { type: 'string', description: 'Date in ISO format' },
          dayOfWeek: { type: 'number', description: 'Day of week (0-6)' },
          workoutType: { 
            type: 'string',
            description: 'Type of workout: Ride, Run, Gym, Swim, Rest, or Active Recovery'
          },
          timeOfDay: {
            type: 'string',
            enum: ['morning', 'afternoon', 'evening'],
            description: 'Recommended time of day'
          },
          title: { type: 'string', description: 'Workout title' },
          description: { type: 'string', description: 'Detailed workout description' },
          durationMinutes: { type: 'number', description: 'Duration in minutes' },
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
  run: async (payload: { userId: string; startDate: Date; daysToPlann: number }) => {
    const { userId, startDate, daysToPlann } = payload;
    
    logger.log("Starting weekly plan generation", { userId, startDate, daysToPlann });
    
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    // Calculate week boundaries
    const weekStart = new Date(start);
    const day = weekStart.getDay();
    const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
    weekStart.setDate(diff);
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + (daysToPlann - 1));
    
    // Fetch user data
    const [user, availability, recentWorkouts, recentWellness, currentPlan, athleteProfile] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { ftp: true, weight: true, maxHr: true }
      }),
      prisma.trainingAvailability.findMany({
        where: { userId },
        orderBy: { dayOfWeek: 'asc' }
      }),
      prisma.workout.findMany({
        where: {
          userId,
          date: {
            gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // Last 14 days
            lt: start
          }
        },
        orderBy: { date: 'desc' },
        take: 10
      }),
      prisma.wellness.findMany({
        where: {
          userId,
          date: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
            lt: start
          }
        },
        orderBy: { date: 'desc' },
        take: 7
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
      })
    ]);
    
    logger.log("Data fetched", {
      hasUser: !!user,
      availabilityDays: availability.length,
      recentWorkoutsCount: recentWorkouts.length,
      recentWellnessCount: recentWellness.length,
      hasExistingPlan: !!currentPlan,
      hasAthleteProfile: !!athleteProfile
    });
    
    // Build availability summary
    const availabilitySummary = availability.map(a => {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const slots = [];
      if (a.morning) slots.push('morning');
      if (a.afternoon) slots.push('afternoon');
      if (a.evening) slots.push('evening');
      
      const constraints = [];
      if (a.indoorOnly) constraints.push('indoor only');
      if (a.outdoorOnly) constraints.push('outdoor only');
      if (a.gymAccess) constraints.push('gym available');
      
      return `${dayNames[a.dayOfWeek]}: ${slots.length > 0 ? slots.join(', ') : 'rest day'}${constraints.length > 0 ? ` (${constraints.join(', ')})` : ''}`;
    }).join('\n');
    
    // Calculate recent training load
    const recentTSS = recentWorkouts.reduce((sum, w) => sum + (w.tss || 0), 0);
    const avgRecovery = recentWellness.length > 0
      ? recentWellness.reduce((sum, w) => sum + (w.recoveryScore || 50), 0) / recentWellness.length
      : 50;
    
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
    
    // Build prompt
    const prompt = `You are an expert cycling coach creating a personalized ${daysToPlann}-day training plan.

${athleteContext}

TRAINING AVAILABILITY (when user can train):
${availabilitySummary || 'No availability set - assume flexible schedule'}

RECENT TRAINING (Last 14 days):
- Total TSS: ${recentTSS.toFixed(0)}
- Workouts completed: ${recentWorkouts.length}
- Recent workouts: ${recentWorkouts.slice(0, 3).map(w => 
    `${new Date(w.date).toLocaleDateString()}: ${w.title} (TSS: ${w.tss || 'N/A'}, ${Math.round(w.durationSec / 60)}min)`
  ).join(', ') || 'No recent workouts'}

RECENT RECOVERY (Last 7 days):
- Average recovery score: ${avgRecovery.toFixed(0)}%
- Latest HRV: ${recentWellness[0]?.hrv || 'N/A'} ms
- Latest resting HR: ${recentWellness[0]?.restingHr || 'N/A'} bpm

PLANNING PERIOD:
- Start: ${weekStart.toLocaleDateString()}
- End: ${weekEnd.toLocaleDateString()}
- Days to plan: ${daysToPlann}

INSTRUCTIONS:
1. Create a progressive training plan that respects user's availability
2. Balance intensity across the week (easy days, hard days, rest days)
3. Consider recent training load and recovery status
4. For days with multiple time slots, choose the best one based on workout type
5. If no availability is set for a day, suggest rest or active recovery
6. Include variety: endurance rides, intervals, recovery rides, strength work
7. Ensure adequate recovery between hard efforts
8. Target weekly TSS should be appropriate for fitness level (aim for 200-600 based on recent load)
9. Each workout should have clear objectives and be actionable
10. Consider location constraints (indoor vs outdoor vs gym)

WORKOUT TYPES:
- Ride: Outdoor or indoor cycling
- Run: Running workout
- Gym: Strength training
- Swim: Swimming workout
- Rest: Complete rest day
- Active Recovery: Very easy activity (walk, easy spin)

Create a structured, progressive plan for the next ${daysToPlann} days.`;

    logger.log("Generating plan with Gemini Flash");
    
    const plan = await generateStructuredAnalysis(
      prompt,
      weeklyPlanSchema,
      'flash'
    );
    
    logger.log("Plan generated", { 
      daysPlanned: (plan as any).days?.length,
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