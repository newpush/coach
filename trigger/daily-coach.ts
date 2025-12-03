import { logger, task } from "@trigger.dev/sdk/v3";
import { generateStructuredAnalysis } from "../server/utils/gemini";
import { prisma } from "../server/utils/db";

const suggestionSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['proceed', 'modify', 'rest', 'reduce_intensity'],
      description: 'The recommended action'
    },
    reason: { 
      type: 'string',
      description: 'Explanation for the recommendation'
    },
    confidence: { 
      type: 'number',
      description: 'Confidence level from 0 to 1'
    },
    modification: { 
      type: 'string',
      description: 'Specific workout modification if applicable'
    }
  },
  required: ['action', 'reason', 'confidence']
};

export const dailyCoachTask = task({
  id: "daily-coach",
  run: async (payload: { userId: string }) => {
    const { userId } = payload;
    
    logger.log("Starting daily coach analysis", { userId });
    
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const today = new Date();
    const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    // Fetch data
    const [yesterdayWorkout, todayMetric, user, athleteProfile] = await Promise.all([
      prisma.workout.findFirst({
        where: {
          userId,
          date: { gte: yesterday, lt: today },
          durationSec: { gt: 0 }  // Filter out workouts without duration
        },
        orderBy: { date: 'desc' }
      }),
      prisma.wellness.findUnique({
        where: {
          userId_date: {
            userId,
            date: todayDateOnly
          }
        }
      }),
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
      hasYesterdayWorkout: !!yesterdayWorkout,
      hasTodayMetric: !!todayMetric,
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
Recovery Profile: ${profile.recovery_profile?.recovery_pattern || 'Unknown'}
Recent Performance: ${profile.recent_performance?.trend || 'Unknown'}
Current Focus: ${profile.planning_context?.current_focus || 'General training'}
`;
    } else {
      athleteContext = `
USER INFO:
- FTP: ${user?.ftp || 'Unknown'} watts
- Weight: ${user?.weight || 'Unknown'} kg
- Max HR: ${user?.maxHr || 'Unknown'} bpm
`;
    }
    
    // Build prompt
    const prompt = `You are a cycling coach providing daily workout guidance.

${athleteContext}

YESTERDAY'S TRAINING:
${yesterdayWorkout 
  ? `${yesterdayWorkout.title} - TSS: ${yesterdayWorkout.tss || 'N/A'}, Duration: ${Math.round(yesterdayWorkout.durationSec / 60)} min, Avg Power: ${yesterdayWorkout.averageWatts || 'N/A'}W` 
  : 'Rest day or no data'}

TODAY'S RECOVERY:
${todayMetric
  ? `- Recovery Score: ${todayMetric.recoveryScore}%
- HRV: ${todayMetric.hrv} ms
- Resting HR: ${todayMetric.restingHr} bpm
- Sleep: ${todayMetric.sleepHours?.toFixed(1)} hours (Score: ${todayMetric.sleepScore}%)
${todayMetric.spO2 ? `- SpO2: ${todayMetric.spO2}%` : ''}`
  : 'No recovery data available'}

DECISION LOGIC:
- Recovery < 33%: Recommend rest or very easy activity
- Recovery 33-50%: Reduce intensity significantly
- Recovery 50-67%: Proceed with caution, modify as needed
- Recovery 67-80%: Proceed as planned
- Recovery > 80%: Good day for high intensity

CONTEXT:
- Yesterday's TSS was ${yesterdayWorkout?.tss || 0}
- Multiple high-load days increase fatigue risk
- Low HRV combined with high HR indicates stress
- Poor sleep (<7h) reduces training capacity

Provide a structured recommendation for today's training.`;

    logger.log("Generating suggestion with Gemini Flash");
    
    const suggestion = await generateStructuredAnalysis(
      prompt,
      suggestionSchema,
      'flash'
    );
    
    logger.log("Suggestion generated", { suggestion });
    
    // Save suggestion as report
    const report = await prisma.report.create({
      data: {
        userId,
        type: 'DAILY_SUGGESTION',
        status: 'COMPLETED',
        dateRangeStart: today,
        dateRangeEnd: today,
        modelVersion: 'gemini-2.0-flash-exp',
        suggestions: suggestion as any
      }
    });
    
    logger.log("Suggestion saved", { reportId: report.id });
    
    return {
      success: true,
      reportId: report.id,
      userId,
      suggestion
    };
  }
});