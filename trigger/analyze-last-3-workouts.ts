import { logger, task } from "@trigger.dev/sdk/v3";
import { generateStructuredAnalysis } from "../server/utils/gemini";
import { prisma } from "../server/utils/db";

// Reuse the flexible analysis schema (same as workout analysis)
const analysisSchema = {
  type: "object",
  properties: {
    type: {
      type: "string",
      description: "Type of analysis: workout, weekly_report, planning, comparison",
      enum: ["workout", "weekly_report", "planning", "comparison"]
    },
    title: {
      type: "string",
      description: "Title of the analysis"
    },
    date: {
      type: "string",
      description: "Date or date range of the analysis"
    },
    executive_summary: {
      type: "string",
      description: "2-3 sentence high-level summary of key findings"
    },
    sections: {
      type: "array",
      description: "Analysis sections with status and points",
      items: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Section title (e.g., Training Progression, Recovery Patterns)"
          },
          status: {
            type: "string",
            description: "Overall assessment",
            enum: ["excellent", "good", "moderate", "needs_improvement", "poor"]
          },
          status_label: {
            type: "string",
            description: "Display label for status"
          },
          analysis_points: {
            type: "array",
            description: "Detailed analysis points for this section. Each point should be 1-2 sentences maximum as a separate array item. Do NOT combine multiple points into paragraph blocks.",
            items: {
              type: "string"
            }
          }
        },
        required: ["title", "status", "status_label", "analysis_points"]
      }
    },
    recommendations: {
      type: "array",
      description: "Actionable coaching recommendations",
      items: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Recommendation title"
          },
          priority: {
            type: "string",
            description: "Priority level",
            enum: ["high", "medium", "low"]
          },
          description: {
            type: "string",
            description: "Detailed recommendation"
          }
        },
        required: ["title", "priority", "description"]
      }
    },
    metrics_summary: {
      type: "object",
      description: "Key metrics across the workouts",
      properties: {
        total_duration_minutes: { type: "number" },
        total_tss: { type: "number" },
        avg_power: { type: "number" },
        avg_heart_rate: { type: "number" },
        total_distance_km: { type: "number" }
      }
    }
  },
  required: ["type", "title", "executive_summary", "sections"]
}

function buildWorkoutSummary(workouts: any[]) {
  return workouts.map((w, idx) => `
### Workout ${idx + 1}: ${w.title}
- **Date**: ${new Date(w.date).toLocaleDateString()}
- **Duration**: ${Math.round(w.durationSec / 60)} minutes
- **Type**: ${w.type || 'Unknown'}
${w.averageWatts ? `- **Average Power**: ${w.averageWatts}W` : ''}
${w.normalizedPower ? `- **Normalized Power**: ${w.normalizedPower}W` : ''}
${w.averageHr ? `- **Average HR**: ${w.averageHr} bpm` : ''}
${w.maxHr ? `- **Max HR**: ${w.maxHr} bpm` : ''}
${w.tss ? `- **TSS**: ${Math.round(w.tss)}` : ''}
${w.trainingLoad ? `- **Training Load**: ${Math.round(w.trainingLoad)}` : ''}
${w.intensity ? `- **Intensity Factor**: ${w.intensity.toFixed(2)}` : ''}
${w.kilojoules ? `- **Energy**: ${w.kilojoules} kJ` : ''}
${w.distanceMeters ? `- **Distance**: ${(w.distanceMeters / 1000).toFixed(1)} km` : ''}
${w.elevationGain ? `- **Elevation**: ${w.elevationGain}m` : ''}
${w.variabilityIndex ? `- **Variability Index**: ${w.variabilityIndex.toFixed(2)}` : ''}
${w.rpe ? `- **RPE**: ${w.rpe}/10` : ''}
${w.feel ? `- **Feel**: ${w.feel}/10` : ''}
${w.description ? `\n**Description**: ${w.description}` : ''}
  `).join('\n');
}

function buildAnalysisPrompt(workouts: any[], user: any) {
  const dateRange = workouts.length > 0 
    ? `${new Date(workouts[workouts.length - 1].date).toLocaleDateString()} - ${new Date(workouts[0].date).toLocaleDateString()}`
    : 'Unknown';

  return `You are a friendly, supportive cycling coach analyzing your athlete's recent training progression.

USER PROFILE:
- FTP: ${user?.ftp || 'Unknown'} watts
- Weight: ${user?.weight || 'Unknown'} kg
- Max HR: ${user?.maxHr || 'Unknown'} bpm
- W/kg: ${user?.ftp && user?.weight ? (user.ftp / user.weight).toFixed(2) : 'Unknown'}

RECENT WORKOUTS (Last 3 Cycling Sessions):
${buildWorkoutSummary(workouts)}

ANALYSIS FOCUS:
1. **Training Progression**: Are they building fitness effectively? Getting stronger or showing fatigue?
2. **Power Consistency**: How does power output compare across workouts? Improving or declining?
3. **Recovery Patterns**: What does RPE, feel, and HR tell us about recovery between sessions?
4. **Intensity Distribution**: Are they balancing hard efforts with recovery appropriately?
5. **Performance Trends**: Any positive adaptations or warning signs of overreaching?

IMPORTANT FORMATTING RULES:
- Keep each analysis_point to 1-2 sentences maximum as a separate array item
- Do NOT combine multiple insights into one paragraph block
- Each point should be concise and specific
- Use a friendly, conversational coaching tone
- Be encouraging and supportive while providing honest feedback

OUTPUT: Generate a structured JSON analysis with:
- Type: "comparison"
- Title describing the analysis period
- Executive summary (2-3 sentences with key insights)
- Sections analyzing different aspects (4-6 sections)
- Specific, actionable recommendations (3-5 items)
- Metrics summary with aggregate data

Be specific with numbers and trends. Highlight both strengths and areas for improvement.`;
}

function convertStructuredToMarkdown(analysis: any): string {
  let markdown = `# ${analysis.title}\n\n`;
  markdown += `**Period**: ${analysis.date}\n\n`;
  markdown += `## Quick Take\n\n${analysis.executive_summary}\n\n`;
  
  if (analysis.sections && analysis.sections.length > 0) {
    markdown += `## Detailed Analysis\n\n`;
    for (const section of analysis.sections) {
      markdown += `### ${section.title}\n\n`;
      markdown += `**Status**: ${section.status_label}\n\n`;
      if (section.analysis_points && section.analysis_points.length > 0) {
        for (const point of section.analysis_points) {
          markdown += `- ${point}\n`;
        }
        markdown += '\n';
      }
    }
  }
  
  if (analysis.recommendations && analysis.recommendations.length > 0) {
    markdown += `## Recommendations\n\n`;
    for (const rec of analysis.recommendations) {
      markdown += `### ${rec.title} (${rec.priority} priority)\n\n`;
      markdown += `${rec.description}\n\n`;
    }
  }
  
  if (analysis.metrics_summary) {
    markdown += `## Metrics Summary\n\n`;
    const metrics = analysis.metrics_summary;
    if (metrics.total_duration_minutes) markdown += `- **Total Duration**: ${Math.round(metrics.total_duration_minutes)} minutes\n`;
    if (metrics.total_tss) markdown += `- **Total TSS**: ${Math.round(metrics.total_tss)}\n`;
    if (metrics.avg_power) markdown += `- **Average Power**: ${Math.round(metrics.avg_power)}W\n`;
    if (metrics.avg_heart_rate) markdown += `- **Average HR**: ${Math.round(metrics.avg_heart_rate)} bpm\n`;
    if (metrics.total_distance_km) markdown += `- **Total Distance**: ${metrics.total_distance_km.toFixed(1)} km\n`;
  }
  
  return markdown;
}

export const analyzeLast3WorkoutsTask = task({
  id: "analyze-last-3-workouts",
  maxDuration: 300, // 5 minutes for AI processing
  run: async (payload: { userId: string; reportId: string }) => {
    const { userId, reportId } = payload;
    
    logger.log("Starting Last 3 Workouts analysis", { userId, reportId });
    
    // Update report status to PROCESSING
    await prisma.report.update({
      where: { id: reportId },
      data: { status: 'PROCESSING' }
    });
    
    try {
      // Fetch last 3 cycling workouts
      const workouts = await prisma.workout.findMany({
        where: {
          userId,
          type: { in: ['Ride', 'VirtualRide', 'Cycling'] }, // Filter for cycling workouts
          durationSec: { gt: 0 }  // Filter out workouts without duration
        },
        orderBy: { date: 'desc' },
        take: 3
      });
      
      if (workouts.length === 0) {
        throw new Error('No cycling workouts found for analysis');
      }
      
      logger.log("Workouts fetched", { 
        count: workouts.length,
        titles: workouts.map(w => w.title)
      });
      
      // Fetch user profile for context
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { ftp: true, weight: true, maxHr: true }
      });
      
      // Build the analysis prompt
      const prompt = buildAnalysisPrompt(workouts, user);
      
      logger.log("Generating structured analysis with Gemini Flash");
      
      // Generate structured JSON analysis
      const structuredAnalysis = await generateStructuredAnalysis(prompt, analysisSchema, 'flash');
      
      // Also generate markdown for fallback/export
      const markdownAnalysis = convertStructuredToMarkdown(structuredAnalysis);
      
      logger.log("Analysis generated successfully", {
        sections: structuredAnalysis.sections?.length || 0,
        recommendations: structuredAnalysis.recommendations?.length || 0
      });
      
      // Calculate date range from workouts
      const dateRangeStart = new Date(workouts[workouts.length - 1].date);
      const dateRangeEnd = new Date(workouts[0].date);
      
      // Save both formats to the database and link workouts
      await prisma.$transaction(async (tx) => {
        // Update the report
        await tx.report.update({
          where: { id: reportId },
          data: {
            status: 'COMPLETED',
            markdown: markdownAnalysis,
            analysisJson: structuredAnalysis as any,
            modelVersion: 'gemini-2.0-flash-exp',
            dateRangeStart,
            dateRangeEnd
          }
        });
        
        // Link the workouts to the report
        await tx.reportWorkout.createMany({
          data: workouts.map(workout => ({
            reportId,
            workoutId: workout.id
          }))
        });
      });
      
      logger.log("Report saved to database with workout links", {
        workoutsLinked: workouts.length
      });
      
      return {
        success: true,
        reportId,
        userId,
        workoutsAnalyzed: workouts.length,
        analysisLength: markdownAnalysis.length,
        sectionsCount: structuredAnalysis.sections?.length || 0
      };
    } catch (error) {
      logger.error("Error generating Last 3 Workouts analysis", { error });
      
      await prisma.report.update({
        where: { id: reportId },
        data: { status: 'FAILED' }
      });
      
      throw error;
    }
  }
});