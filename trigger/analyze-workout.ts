import { logger, task } from "@trigger.dev/sdk/v3";
import { generateCoachAnalysis, generateStructuredAnalysis } from "../server/utils/gemini";
import { prisma } from "../server/utils/db";

// Flexible analysis schema that works for workouts, reports, planning, etc.
const analysisSchema = {
  type: "object",
  properties: {
    type: {
      type: "string",
      description: "Type of analysis: workout, weekly_report, planning, etc.",
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
            description: "Section title (e.g., Pacing Strategy, Power Application)"
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
            description: "Detailed analysis points for this section",
            items: {
              type: "string"
            }
          }
        },
        required: ["title", "status", "analysis_points"]
      }
    },
    recommendations: {
      type: "array",
      description: "Actionable recommendations",
      items: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Recommendation title"
          },
          description: {
            type: "string",
            description: "Detailed recommendation"
          },
          priority: {
            type: "string",
            description: "Priority level",
            enum: ["high", "medium", "low"]
          }
        },
        required: ["title", "description"]
      }
    },
    strengths: {
      type: "array",
      description: "Key strengths identified",
      items: {
        type: "string"
      }
    },
    weaknesses: {
      type: "array",
      description: "Areas needing improvement",
      items: {
        type: "string"
      }
    },
    metrics_summary: {
      type: "object",
      description: "Key metrics at a glance",
      properties: {
        avg_power: { type: "number" },
        ftp: { type: "number" },
        intensity: { type: "number" },
        duration_minutes: { type: "number" },
        tss: { type: "number" }
      }
    }
  },
  required: ["type", "title", "executive_summary", "sections"]
}

export const analyzeWorkoutTask = task({
  id: "analyze-workout",
  maxDuration: 300, // 5 minutes for AI processing
  run: async (payload: { workoutId: string }) => {
    const { workoutId } = payload;
    
    logger.log("Starting workout analysis", { workoutId });
    
    // Update workout status to PROCESSING
    await prisma.workout.update({
      where: { id: workoutId },
      data: { aiAnalysisStatus: 'PROCESSING' }
    });
    
    try {
      // Fetch the workout
      const workout = await prisma.workout.findUnique({
        where: { id: workoutId }
      });
      
      if (!workout) {
        throw new Error('Workout not found');
      }
      
      logger.log("Workout data fetched", { 
        workoutId,
        title: workout.title,
        date: workout.date
      });
      
      // Build comprehensive workout data for analysis
      const workoutData = buildWorkoutAnalysisData(workout);
      
      // Generate the prompt
      const prompt = buildWorkoutAnalysisPrompt(workoutData);
      
      logger.log("Generating structured analysis with Gemini Flash");
      
      // Generate structured JSON analysis
      const structuredAnalysis = await generateStructuredAnalysis(prompt, analysisSchema, 'flash');
      
      // Also generate markdown for fallback/export
      const markdownAnalysis = convertStructuredToMarkdown(structuredAnalysis);
      
      logger.log("Analysis generated successfully", {
        sections: structuredAnalysis.sections?.length || 0,
        recommendations: structuredAnalysis.recommendations?.length || 0
      });
      
      // Save both formats to the database
      await prisma.workout.update({
        where: { id: workoutId },
        data: {
          aiAnalysis: markdownAnalysis,
          aiAnalysisJson: structuredAnalysis as any,
          aiAnalysisStatus: 'COMPLETED',
          aiAnalyzedAt: new Date()
        }
      });
      
      logger.log("Analysis saved to database");
      
      return {
        success: true,
        workoutId,
        analysisLength: markdownAnalysis.length,
        sectionsCount: structuredAnalysis.sections?.length || 0
      };
    } catch (error) {
      logger.error("Error generating workout analysis", { error });
      
      await prisma.workout.update({
        where: { id: workoutId },
        data: {
          aiAnalysisStatus: 'FAILED'
        }
      });
      
      throw error;
    }
  }
});

function buildWorkoutAnalysisData(workout: any) {
  const data: any = {
    id: workout.id,
    date: workout.date,
    title: workout.title,
    description: workout.description,
    type: workout.type,
    duration_m: Math.round(workout.durationSec / 60),
    duration_s: workout.durationSec,
    distance_m: workout.distanceMeters,
    elevation_gain: workout.elevationGain
  }
  
  // Power metrics
  if (workout.averageWatts) data.avg_power = workout.averageWatts
  if (workout.maxWatts) data.max_power = workout.maxWatts
  if (workout.normalizedPower) data.normalized_power = workout.normalizedPower
  if (workout.weightedAvgWatts) data.weighted_avg_power = workout.weightedAvgWatts
  if (workout.ftp) data.ftp = workout.ftp
  
  // Heart rate
  if (workout.averageHr) data.avg_hr = workout.averageHr
  if (workout.maxHr) data.max_hr = workout.maxHr
  
  // Cadence
  if (workout.averageCadence) data.avg_cadence = workout.averageCadence
  if (workout.maxCadence) data.max_cadence = workout.maxCadence
  
  // Speed
  if (workout.averageSpeed) data.avg_speed_ms = workout.averageSpeed / 3.6 // km/h to m/s
  
  // Training metrics
  if (workout.tss) data.tss = workout.tss
  if (workout.trainingLoad) data.training_load = workout.trainingLoad
  if (workout.intensity) data.intensity = workout.intensity
  if (workout.kilojoules) data.kilojoules = workout.kilojoules
  
  // Performance metrics
  if (workout.variabilityIndex) data.variability_index = workout.variabilityIndex
  if (workout.powerHrRatio) data.power_hr_ratio = workout.powerHrRatio
  if (workout.efficiencyFactor) data.efficiency_factor = workout.efficiencyFactor
  if (workout.decoupling) data.decoupling = workout.decoupling
  if (workout.polarizationIndex) data.polarization_index = workout.polarizationIndex
  
  // Training status
  if (workout.ctl) data.ctl = workout.ctl
  if (workout.atl) data.atl = workout.atl
  
  // Subjective
  if (workout.rpe) data.rpe = workout.rpe
  if (workout.sessionRpe) data.session_rpe = workout.sessionRpe
  if (workout.feel) data.feel = workout.feel
  
  // Environment
  if (workout.avgTemp !== null && workout.avgTemp !== undefined) data.avg_temp = workout.avgTemp
  if (workout.trainer !== null && workout.trainer !== undefined) data.trainer = workout.trainer
  
  // L/R Balance
  if (workout.lrBalance) data.lr_balance = workout.lrBalance
  
  // Extract intervals from rawJson if available
  if (workout.rawJson && typeof workout.rawJson === 'object') {
    const raw = workout.rawJson as any
    if (raw.icu_intervals && Array.isArray(raw.icu_intervals)) {
      data.intervals = raw.icu_intervals.slice(0, 10).map((interval: any) => ({
        type: interval.type,
        label: interval.label,
        duration_s: interval.elapsed_time,
        distance_m: interval.distance,
        avg_power: interval.average_watts,
        max_power: interval.max_watts,
        weighted_avg_power: interval.weighted_average_watts,
        intensity: interval.intensity,
        avg_hr: interval.average_heartrate,
        max_hr: interval.max_heartrate,
        avg_cadence: interval.average_cadence,
        max_cadence: interval.max_cadence,
        avg_speed_ms: interval.average_speed,
        decoupling: interval.decoupling,
        variability: interval.w5s_variability,
        elevation_gain: interval.total_elevation_gain,
        avg_gradient: interval.average_gradient
      }))
    }
  }
  
  return data
}

function buildWorkoutAnalysisPrompt(workoutData: any): string {
  const formatMetric = (value: any, decimals = 1) => {
    return value !== undefined && value !== null ? Number(value).toFixed(decimals) : 'N/A'
  }
  
  let prompt = `You are an expert cycling coach analyzing a workout. Provide a comprehensive technique-focused analysis.

## Workout Details
- **Date**: ${new Date(workoutData.date).toLocaleDateString()}
- **Title**: ${workoutData.title}
- **Type**: ${workoutData.type || 'N/A'}
- **Duration**: ${workoutData.duration_m} minutes (${workoutData.duration_s}s)
`

  if (workoutData.distance_m) {
    prompt += `- **Distance**: ${(workoutData.distance_m / 1000).toFixed(2)} km\n`
  }
  
  if (workoutData.elevation_gain) {
    prompt += `- **Elevation Gain**: ${workoutData.elevation_gain}m\n`
  }

  prompt += '\n## Power Metrics\n'
  if (workoutData.avg_power) prompt += `- Average Power: ${workoutData.avg_power}W\n`
  if (workoutData.max_power) prompt += `- Max Power: ${workoutData.max_power}W\n`
  if (workoutData.normalized_power) prompt += `- Normalized Power: ${workoutData.normalized_power}W\n`
  if (workoutData.weighted_avg_power) prompt += `- Weighted Avg Power: ${workoutData.weighted_avg_power}W\n`
  if (workoutData.ftp) prompt += `- FTP at time: ${workoutData.ftp}W\n`
  if (workoutData.intensity) prompt += `- Intensity Factor: ${formatMetric(workoutData.intensity, 3)}\n`

  prompt += '\n## Heart Rate & Cadence\n'
  if (workoutData.avg_hr) prompt += `- Average HR: ${workoutData.avg_hr} bpm\n`
  if (workoutData.max_hr) prompt += `- Max HR: ${workoutData.max_hr} bpm\n`
  if (workoutData.avg_cadence) prompt += `- Average Cadence: ${workoutData.avg_cadence} rpm\n`
  if (workoutData.max_cadence) prompt += `- Max Cadence: ${workoutData.max_cadence} rpm\n`

  prompt += '\n## Performance Indicators\n'
  if (workoutData.variability_index) {
    prompt += `- Variability Index (VI): ${formatMetric(workoutData.variability_index, 3)}\n`
    prompt += `  - 1.00-1.05 = Excellent pacing, 1.05-1.10 = Good, >1.10 = Poor pacing\n`
  }
  if (workoutData.efficiency_factor) {
    prompt += `- Efficiency Factor (EF): ${formatMetric(workoutData.efficiency_factor, 2)} (Watts/HR - higher is better)\n`
  }
  if (workoutData.decoupling !== undefined) {
    const decouplingPct = workoutData.decoupling * 100
    prompt += `- Decoupling: ${formatMetric(decouplingPct, 1)}%\n`
    prompt += `  - <5% = Excellent aerobic efficiency, 5-10% = Good, >10% = Needs aerobic work\n`
  }
  if (workoutData.power_hr_ratio) {
    prompt += `- Power/HR Ratio: ${formatMetric(workoutData.power_hr_ratio, 2)}\n`
  }
  if (workoutData.lr_balance) {
    prompt += `- L/R Balance: ${formatMetric(workoutData.lr_balance, 1)}%\n`
    prompt += `  - 48-52% = Acceptable, 50/50 = Ideal, >53% = Significant imbalance\n`
  }

  prompt += '\n## Training Load\n'
  if (workoutData.tss) prompt += `- TSS: ${formatMetric(workoutData.tss, 0)}\n`
  if (workoutData.training_load) prompt += `- Training Load: ${formatMetric(workoutData.training_load, 1)}\n`
  if (workoutData.kilojoules) prompt += `- Kilojoules: ${formatMetric(workoutData.kilojoules / 1000, 1)}k\n`

  if (workoutData.ctl || workoutData.atl) {
    prompt += '\n## Fitness Status\n'
    if (workoutData.ctl) prompt += `- CTL (Fitness): ${formatMetric(workoutData.ctl, 1)}\n`
    if (workoutData.atl) prompt += `- ATL (Fatigue): ${formatMetric(workoutData.atl, 1)}\n`
    if (workoutData.ctl && workoutData.atl) {
      const tsb = workoutData.ctl - workoutData.atl
      prompt += `- TSB (Form): ${formatMetric(tsb, 1)}\n`
    }
  }

  if (workoutData.rpe || workoutData.feel) {
    prompt += '\n## Subjective Metrics\n'
    if (workoutData.rpe) prompt += `- RPE: ${workoutData.rpe}/10\n`
    if (workoutData.feel) prompt += `- Feel: ${workoutData.feel}/10\n`
  }

  if (workoutData.trainer !== undefined || workoutData.avg_temp !== undefined) {
    prompt += '\n## Environment\n'
    if (workoutData.trainer !== undefined) prompt += `- Indoor Trainer: ${workoutData.trainer ? 'Yes' : 'No'}\n`
    if (workoutData.avg_temp !== undefined) prompt += `- Avg Temperature: ${formatMetric(workoutData.avg_temp, 1)}°C\n`
  }

  // Add interval analysis if available
  if (workoutData.intervals && workoutData.intervals.length > 0) {
    prompt += '\n## Interval Breakdown\n'
    workoutData.intervals.forEach((interval: any, index: number) => {
      prompt += `\n### Interval ${index + 1}: ${interval.label || interval.type || 'Unnamed'}\n`
      if (interval.duration_s) prompt += `- Duration: ${Math.round(interval.duration_s / 60)}m ${interval.duration_s % 60}s\n`
      if (interval.avg_power) prompt += `- Avg Power: ${interval.avg_power}W\n`
      if (interval.intensity) prompt += `- Intensity: ${formatMetric(interval.intensity, 2)}\n`
      if (interval.avg_hr) prompt += `- Avg HR: ${interval.avg_hr} bpm\n`
      if (interval.avg_cadence) prompt += `- Avg Cadence: ${interval.avg_cadence} rpm\n`
      if (interval.variability) prompt += `- Power Variability: ${formatMetric(interval.variability, 2)}\n`
    })
  }

  if (workoutData.description) {
    prompt += `\n## Workout Description\n${workoutData.description}\n`
  }

  prompt += `

## Analysis Request

You are a friendly, supportive cycling coach analyzing this workout. Use an encouraging, conversational tone.

Provide a structured analysis with these sections:

1. **Executive Summary**: Write 2-3 friendly, encouraging sentences highlighting the most important findings. Keep it conversational and positive.

2. **Pacing Strategy**: Analyze power variability (VI), surging behavior, and pacing discipline
   - Assign status: excellent/good/moderate/needs_improvement/poor
   - Provide 3-5 separate, concise bullet points (each as a separate array item, not paragraphs)
   - Each point should be 1-2 sentences maximum

3. **Pedaling Efficiency**: Evaluate cadence patterns, L/R balance, and technique
   - Assign status: excellent/good/moderate/needs_improvement/poor
   - Provide 3-5 separate, concise bullet points (each as a separate array item)
   - Each point should be 1-2 sentences maximum

4. **Power Application**: Assess consistency, fade patterns, and zone adherence
   - Assign status: excellent/good/moderate/needs_improvement/poor
   - Provide 3-5 separate, concise bullet points (each as a separate array item)
   - Each point should be 1-2 sentences maximum

5. **Workout Execution**: Evaluate target achievement and interval quality
   - Assign status: excellent/good/moderate/needs_improvement/poor
   - Provide 3-5 separate, concise bullet points (each as a separate array item)
   - Each point should be 1-2 sentences maximum

6. **Recommendations**: Provide 2-4 specific, actionable recommendations with:
   - Clear, friendly title
   - Supportive, encouraging description (2-3 sentences)
   - Priority level (high/medium/low)

7. **Strengths & Weaknesses**:
   - List 2-4 key strengths (short phrases or single sentences)
   - List 2-4 areas for improvement (short phrases or single sentences, framed positively)

IMPORTANT:
- Each analysis_point must be a separate, concise item in the array
- Use a friendly, supportive coaching tone throughout
- Be specific with numbers but keep language conversational
- Focus on encouragement and actionable advice`

  return prompt
}

// Convert structured analysis to markdown for fallback/export
function convertStructuredToMarkdown(analysis: any): string {
  let markdown = `# ${analysis.title}\n\n`
  
  if (analysis.date) {
    markdown += `Date: ${analysis.date}\n\n`
  }
  
  markdown += `## Executive Summary\n${analysis.executive_summary}\n\n`
  
  // Sections
  if (analysis.sections) {
    for (const section of analysis.sections) {
      markdown += `## ${section.title}\n`
      markdown += `**Status**: ${section.status_label || section.status}\n`
      if (section.analysis_points && section.analysis_points.length > 0) {
        for (const point of section.analysis_points) {
          markdown += `- ${point}\n`
        }
      }
      markdown += '\n'
    }
  }
  
  // Recommendations
  if (analysis.recommendations && analysis.recommendations.length > 0) {
    markdown += `## Recommendations\n`
    for (const rec of analysis.recommendations) {
      markdown += `### ${rec.title}\n`
      markdown += `${rec.description}\n\n`
    }
  }
  
  // Strengths & Weaknesses
  if (analysis.strengths || analysis.weaknesses) {
    markdown += `## Strengths & Weaknesses\n`
    
    if (analysis.strengths && analysis.strengths.length > 0) {
      markdown += `### Strengths\n`
      for (const strength of analysis.strengths) {
        markdown += `- ${strength}\n`
      }
      markdown += '\n'
    }
    
    if (analysis.weaknesses && analysis.weaknesses.length > 0) {
      markdown += `### Weaknesses\n`
      for (const weakness of analysis.weaknesses) {
        markdown += `- ${weakness}\n`
      }
    }
  }
  
  return markdown
}