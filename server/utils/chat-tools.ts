import { SchemaType, type FunctionDeclaration } from '@google/generative-ai'
import { prisma } from './db'
import {
  getUserTimezone,
  getStartOfDaysAgoUTC,
  formatUserDate,
  getStartOfDayUTC,
  getEndOfDayUTC
} from './date'
import {
  getPlannedWorkouts,
  createPlannedWorkout,
  updatePlannedWorkout,
  deletePlannedWorkout,
  getTrainingAvailability,
  updateTrainingAvailability,
  generateTrainingPlan,
  getCurrentPlan,
  getPlannedWorkoutDetails
} from './chat-tools/training-plan-tools'

/**
 * Format a Date object as YYYY-MM-DD string in local timezone
 * This ensures dates displayed to the AI match what the user sees in the UI
 */
function formatDateLocal(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Tool schemas for Gemini function calling
 * These define what tools the AI can use to fetch data from the database
 */
export const chatToolDeclarations: FunctionDeclaration[] = [
  {
    name: 'get_recent_workouts',
    description:
      'Fetch recent workout summaries for the athlete. Use this when the user asks about their recent activities, training, or wants to compare workouts.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        limit: {
          type: SchemaType.NUMBER,
          description: 'Number of workouts to fetch (default: 5, max: 20)'
        },
        type: {
          type: SchemaType.STRING,
          description: 'Filter by workout type (e.g., Ride, Run, Swim)'
        },
        days: {
          type: SchemaType.NUMBER,
          description: 'Only include workouts from the last N days'
        }
      }
    }
  },
  {
    name: 'get_workout_details',
    description:
      'Get comprehensive details for a specific workout. Can search by ID or by description (title, date, type). Use this when the user refers to a workout by name like "the morning elliptical" or "my latest ride" or "yesterday\'s longest walk".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        workout_id: {
          type: SchemaType.STRING,
          description: 'The exact workout ID if known from previous tool calls'
        },
        title_search: {
          type: SchemaType.STRING,
          description: 'Search by workout title (e.g., "Morning Elliptical", "Lunch Run")'
        },
        type: {
          type: SchemaType.STRING,
          description: 'Filter by workout type (Ride, Run, Walk, etc.)'
        },
        date: {
          type: SchemaType.STRING,
          description: 'Specific date in ISO format (YYYY-MM-DD)'
        },
        relative_position: {
          type: SchemaType.STRING,
          description: 'Relative position like "latest", "most recent", "longest", "hardest"'
        }
      }
    }
  },
  {
    name: 'get_nutrition_log',
    description:
      'Get nutrition data for specific dates. Use this when the user asks about their eating, meals, macros, or calories.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        start_date: {
          type: SchemaType.STRING,
          description: 'Start date in ISO format (YYYY-MM-DD)'
        },
        end_date: {
          type: SchemaType.STRING,
          description:
            'End date in ISO format (YYYY-MM-DD). If not provided, defaults to start_date'
        }
      },
      required: ['start_date']
    }
  },
  {
    name: 'get_wellness_metrics',
    description:
      'Fetch wellness and recovery metrics (HRV, sleep, recovery score, etc.). Use this when user asks about recovery, sleep, or how they are feeling.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        start_date: {
          type: SchemaType.STRING,
          description: 'Start date in ISO format (YYYY-MM-DD)'
        },
        end_date: {
          type: SchemaType.STRING,
          description:
            'End date in ISO format (YYYY-MM-DD). If not provided, defaults to start_date'
        }
      },
      required: ['start_date']
    }
  },
  {
    name: 'search_workouts',
    description:
      'Search workouts by various criteria. Use this for more complex queries like finding workouts within a specific duration range or TSS range.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: {
          type: SchemaType.STRING,
          description: 'Text search in title or description'
        },
        min_duration_minutes: {
          type: SchemaType.NUMBER,
          description: 'Minimum workout duration in minutes'
        },
        max_duration_minutes: {
          type: SchemaType.NUMBER,
          description: 'Maximum workout duration in minutes'
        },
        min_tss: {
          type: SchemaType.NUMBER,
          description: 'Minimum Training Stress Score'
        },
        date_from: {
          type: SchemaType.STRING,
          description: 'Start date in ISO format (YYYY-MM-DD)'
        },
        date_to: {
          type: SchemaType.STRING,
          description: 'End date in ISO format (YYYY-MM-DD)'
        },
        limit: {
          type: SchemaType.NUMBER,
          description: 'Maximum number of results (default: 10, max: 20)'
        }
      }
    }
  },
  {
    name: 'get_performance_metrics',
    description:
      'Get comprehensive performance analytics including activity distribution, training load trends, weekly hours, and fitness metrics. Use this when user asks about their performance, progress, training patterns, or trends over time.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        period_days: {
          type: SchemaType.NUMBER,
          description: 'Number of days to analyze (default: 30, options: 7, 14, 30, 60, 90)'
        },
        include_activity_distribution: {
          type: SchemaType.BOOLEAN,
          description: 'Include breakdown by workout type'
        },
        include_training_load: {
          type: SchemaType.BOOLEAN,
          description: 'Include training load trends'
        },
        include_weekly_hours: {
          type: SchemaType.BOOLEAN,
          description: 'Include weekly training hours breakdown'
        },
        include_intensity_analysis: {
          type: SchemaType.BOOLEAN,
          description: 'Include intensity and effort analysis'
        }
      }
    }
  },
  {
    name: 'get_planned_workouts',
    description:
      'Fetch upcoming planned workouts for the athlete. Use this when the user asks about their training schedule, upcoming workouts, or what they have planned.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        start_date: {
          type: SchemaType.STRING,
          description: 'Start date in ISO format (YYYY-MM-DD, default: today)'
        },
        end_date: {
          type: SchemaType.STRING,
          description: 'End date in ISO format (YYYY-MM-DD, default: start_date + 14 days)'
        },
        include_completed: {
          type: SchemaType.BOOLEAN,
          description: 'Include completed workouts (default: false)'
        }
      }
    }
  },
  {
    name: 'get_planned_workout_details',
    description:
      'Get comprehensive details for a specific planned workout. Use this when the user refers to a specific upcoming workout or when analyzing a planned session.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        workout_id: {
          type: SchemaType.STRING,
          description: 'The exact planned workout ID'
        }
      },
      required: ['workout_id']
    }
  },
  {
    name: 'create_planned_workout',
    description:
      'Create a new planned workout. Use when user wants to add a workout to their schedule.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        date: {
          type: SchemaType.STRING,
          description: 'Date for the workout in ISO format (YYYY-MM-DD)'
        },
        time_of_day: {
          type: SchemaType.STRING,
          description:
            'Time of day for workout: "morning" (8am), "afternoon" (2pm), "evening" (6pm). If user says "6am", "8am", "2pm", etc., extract the hour. Default to "morning" if not specified.'
        },
        title: {
          type: SchemaType.STRING,
          description: 'Workout title'
        },
        description: {
          type: SchemaType.STRING,
          description: 'Detailed workout description'
        },
        type: {
          type: SchemaType.STRING,
          description:
            'Workout type: Ride, Run, Swim, Walk, Hike, Ski, Gym, Yoga, Row, or Other. Note: For recovery activities, use "Walk" or "Yoga" with low intensity.'
        },
        duration_minutes: {
          type: SchemaType.NUMBER,
          description: 'Planned duration in minutes'
        },
        tss: {
          type: SchemaType.NUMBER,
          description: 'Target Training Stress Score'
        },
        intensity: {
          type: SchemaType.STRING,
          description: 'Intensity level: recovery, easy, moderate, hard, very_hard'
        }
      },
      required: ['date', 'title']
    }
  },
  {
    name: 'update_planned_workout',
    description:
      'Modify an existing planned workout. Can change any aspect of the workout including date, title, description, type, duration, TSS, or intensity.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        workout_id: {
          type: SchemaType.STRING,
          description: 'ID of the workout to update'
        },
        date: {
          type: SchemaType.STRING,
          description: 'New date in ISO format (YYYY-MM-DD)'
        },
        title: {
          type: SchemaType.STRING,
          description: 'New title'
        },
        description: {
          type: SchemaType.STRING,
          description: 'New description'
        },
        type: {
          type: SchemaType.STRING,
          description:
            'New workout type: Ride, Run, Swim, Walk, Hike, Ski, Gym, Yoga, Row, or Other'
        },
        duration_minutes: {
          type: SchemaType.NUMBER,
          description: 'New duration in minutes'
        },
        tss: {
          type: SchemaType.NUMBER,
          description: 'New TSS target'
        }
      },
      required: ['workout_id']
    }
  },
  {
    name: 'delete_planned_workout',
    description: 'Remove a planned workout from the schedule.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        workout_id: {
          type: SchemaType.STRING,
          description: 'ID of the workout to delete'
        },
        reason: {
          type: SchemaType.STRING,
          description: 'Optional reason for deletion (for context)'
        }
      },
      required: ['workout_id']
    }
  },
  {
    name: 'get_training_availability',
    description:
      "Get user's training availability schedule showing when they can train each day of the week.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {}
    }
  },
  {
    name: 'update_training_availability',
    description:
      'Update when the user can train during the week. Use this when user wants to change their availability.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        day_of_week: {
          type: SchemaType.NUMBER,
          description:
            'Day to update (0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday)'
        },
        morning: {
          type: SchemaType.BOOLEAN,
          description: 'Available in morning (5am-12pm)'
        },
        afternoon: {
          type: SchemaType.BOOLEAN,
          description: 'Available in afternoon (12pm-6pm)'
        },
        evening: {
          type: SchemaType.BOOLEAN,
          description: 'Available in evening (6pm-11pm)'
        },
        bike_access: {
          type: SchemaType.BOOLEAN,
          description: 'Has bike or trainer access'
        },
        gym_access: {
          type: SchemaType.BOOLEAN,
          description: 'Has gym access'
        },
        indoor_only: {
          type: SchemaType.BOOLEAN,
          description: 'Indoor only constraint'
        },
        notes: {
          type: SchemaType.STRING,
          description: 'Additional notes or constraints'
        }
      },
      required: ['day_of_week']
    }
  },
  {
    name: 'generate_training_plan',
    description:
      'Generate a new AI-powered training plan. ALWAYS confirm with user before calling this tool. Ask for explicit confirmation.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        days: {
          type: SchemaType.NUMBER,
          description: 'Number of days to plan (1-14, default: 7)'
        },
        start_date: {
          type: SchemaType.STRING,
          description: 'Plan start date in ISO format (YYYY-MM-DD, default: tomorrow)'
        },
        user_confirmed: {
          type: SchemaType.BOOLEAN,
          description: 'User has explicitly confirmed they want to generate a new plan'
        }
      },
      required: ['user_confirmed']
    }
  },
  {
    name: 'get_current_plan',
    description:
      'Get the current active training plan with all details including daily workouts and weekly summary.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {}
    }
  },
  {
    name: 'get_workout_stream',
    description:
      'Get second-by-second time-series data for a specific workout. Use this when you need detailed analysis of pacing, power, heart rate variability, or other metrics that change during the workout. Returns arrays of time-stamped data points.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        workout_id: {
          type: SchemaType.STRING,
          description: 'The exact workout ID to fetch stream data for'
        },
        include_streams: {
          type: SchemaType.ARRAY,
          description:
            'Which data streams to include: "time", "heartrate", "watts", "cadence", "velocity", "distance", "altitude", "grade". If not specified, returns all available streams.',
          items: {
            type: SchemaType.STRING
          }
        },
        sample_rate: {
          type: SchemaType.NUMBER,
          description:
            'Sample every Nth data point to reduce data size (default: 1 = all points, 10 = every 10th point). Use higher values for long workouts to avoid overwhelming the AI.'
        }
      },
      required: ['workout_id']
    }
  },
  {
    name: 'create_chart',
    description:
      'Create an inline chart visualization in the conversation. Use when data would be better understood visually (trends, comparisons, distributions). This will render a chart directly in the chat.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        type: {
          type: SchemaType.STRING,
          description:
            'Chart type: "line" for trends/time series, "bar" for comparisons, "doughnut" for proportions/distributions, "radar" for multi-metric analysis'
        },
        title: {
          type: SchemaType.STRING,
          description:
            'Descriptive chart title (e.g., "TSS Trend - Last 2 Weeks", "Workout Type Distribution")'
        },
        labels: {
          type: SchemaType.ARRAY,
          description:
            'X-axis labels or categories (dates, workout names, etc.). Must match the length of data arrays.',
          items: {
            type: SchemaType.STRING
          }
        },
        datasets: {
          type: SchemaType.ARRAY,
          description: 'One or more data series to plot. Each dataset is a line/bar/segment.',
          items: {
            type: SchemaType.OBJECT,
            properties: {
              label: {
                type: SchemaType.STRING,
                description: 'Series label (e.g., "TSS", "Average Power", "Duration")'
              },
              data: {
                type: SchemaType.ARRAY,
                description: 'Numeric data points. Must match labels length exactly.',
                items: {
                  type: SchemaType.NUMBER
                }
              },
              color: {
                type: SchemaType.STRING,
                description:
                  'Optional RGB color (e.g., "rgb(59, 130, 246)"). If not provided, auto-assigned.'
              }
            },
            required: ['label', 'data']
          }
        }
      },
      required: ['type', 'title', 'labels', 'datasets']
    }
  },
  {
    name: 'get_recommendation_details',
    description:
      'Get detailed information about a specific recommendation, including its full description, priority, history, and implementation guide (action plan). Use this when the user asks about a specific recommendation or wants to discuss it.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        recommendation_id: {
          type: SchemaType.STRING,
          description: 'The exact recommendation ID.'
        }
      },
      required: ['recommendation_id']
    }
  },
  {
    name: 'list_recommendations',
    description:
      'List active recommendations for the athlete. Use this to see what the AI coach has currently suggested.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        status: {
          type: SchemaType.STRING,
          description: 'Filter by status: ACTIVE (default), COMPLETED, DISMISSED, or ALL.'
        },
        priority: {
          type: SchemaType.STRING,
          description: 'Filter by priority: high, medium, low.'
        },
        limit: {
          type: SchemaType.NUMBER,
          description: 'Maximum number of recommendations to return (default: 5).'
        }
      }
    }
  }
]

/**
 * Main tool execution handler
 * Routes tool calls to the appropriate handler function
 */
export async function executeToolCall(toolName: string, args: any, userId: string): Promise<any> {
  try {
    const timezone = await getUserTimezone(userId)

    switch (toolName) {
      case 'get_recent_workouts':
        return await getRecentWorkouts(userId, timezone, args.limit, args.type, args.days)

      case 'get_workout_details':
        return await getWorkoutDetails(userId, timezone, args)

      case 'get_nutrition_log':
        return await getNutritionLog(userId, timezone, args.start_date, args.end_date)

      case 'get_wellness_metrics':
        return await getWellnessMetrics(userId, timezone, args.start_date, args.end_date)

      case 'search_workouts':
        return await searchWorkouts(userId, timezone, args)

      case 'get_performance_metrics':
        return await getPerformanceMetrics(userId, timezone, args)

      case 'get_planned_workouts':
        return await getPlannedWorkouts(userId, timezone, args) // This one might need timezone too, let's check imports later

      case 'get_planned_workout_details':
        return await getPlannedWorkoutDetails(userId, timezone, args)

      case 'create_planned_workout':
        return await createPlannedWorkout(userId, timezone, args)

      case 'update_planned_workout':
        return await updatePlannedWorkout(userId, timezone, args)

      case 'delete_planned_workout':
        return await deletePlannedWorkout(userId, timezone, args)

      case 'get_training_availability':
        return await getTrainingAvailability(userId)

      case 'update_training_availability':
        return await updateTrainingAvailability(userId, args)

      case 'generate_training_plan':
        return await generateTrainingPlan(userId, timezone, args)

      case 'get_current_plan':
        return await getCurrentPlan(userId, timezone)

      case 'get_workout_stream':
        return await getWorkoutStream(userId, args)

      case 'create_chart':
        return await createChart(args)

      case 'get_recommendation_details':
        return await getRecommendationDetails(userId, timezone, args)

      case 'list_recommendations':
        return await listRecommendations(userId, timezone, args)

      default:
        return { error: `Unknown tool: ${toolName}` }
    }
  } catch (error: any) {
    console.error(`Error executing tool ${toolName}:`, error)
    return { error: `Failed to execute ${toolName}: ${error?.message || 'Unknown error'}` }
  }
}

/**
 * Get workout stream data (second-by-second time-series)
 */
async function getWorkoutStream(userId: string, args: any): Promise<any> {
  const { workout_id, include_streams, sample_rate = 1 } = args

  // Verify workout belongs to user
  const workout = await prisma.workout.findFirst({
    where: {
      id: workout_id,
      userId
    },
    select: {
      id: true,
      title: true,
      type: true,
      date: true,
      durationSec: true
    }
  })

  if (!workout) {
    return { error: 'Workout not found or access denied' }
  }

  // Fetch stream data
  const stream = await prisma.workoutStream.findUnique({
    where: { workoutId: workout_id },
    select: {
      time: true,
      heartrate: true,
      watts: true,
      cadence: true,
      velocity: true,
      distance: true,
      altitude: true,
      grade: true,
      moving: true,
      avgPacePerKm: true,
      paceVariability: true,
      lapSplits: true,
      paceZones: true,
      pacingStrategy: true,
      surges: true
    }
  })

  if (!stream) {
    return {
      error: 'No stream data available for this workout',
      suggestion:
        'Stream data is only available for workouts from Strava with detailed GPS/power/HR data'
    }
  }

  // Helper to sample an array
  const sampleArray = (arr: any[] | null, rate: number) => {
    if (!arr || !Array.isArray(arr)) return null
    if (rate === 1) return arr
    return arr.filter((_, i) => i % rate === 0)
  }

  // Determine which streams to include
  const requestedStreams = include_streams || [
    'time',
    'heartrate',
    'watts',
    'cadence',
    'velocity',
    'distance'
  ]
  const includeAll = !include_streams

  const response: any = {
    workout_info: {
      id: workout.id,
      title: workout.title,
      type: workout.type,
      date: workout.date.toISOString(),
      duration_seconds: workout.durationSec
    },
    sample_rate: sample_rate,
    data_points: stream.time ? Math.floor((stream.time as any[]).length / sample_rate) : 0,
    streams: {}
  }

  // Add requested streams
  if (includeAll || requestedStreams.includes('time')) {
    response.streams.time = sampleArray(stream.time as any[], sample_rate)
  }
  if (includeAll || requestedStreams.includes('heartrate')) {
    response.streams.heartrate = sampleArray(stream.heartrate as any[], sample_rate)
  }
  if (includeAll || requestedStreams.includes('watts')) {
    response.streams.watts = sampleArray(stream.watts as any[], sample_rate)
  }
  if (includeAll || requestedStreams.includes('cadence')) {
    response.streams.cadence = sampleArray(stream.cadence as any[], sample_rate)
  }
  if (includeAll || requestedStreams.includes('velocity')) {
    response.streams.velocity = sampleArray(stream.velocity as any[], sample_rate)
  }
  if (includeAll || requestedStreams.includes('distance')) {
    response.streams.distance = sampleArray(stream.distance as any[], sample_rate)
  }
  if (includeAll || requestedStreams.includes('altitude')) {
    response.streams.altitude = sampleArray(stream.altitude as any[], sample_rate)
  }
  if (includeAll || requestedStreams.includes('grade')) {
    response.streams.grade = sampleArray(stream.grade as any[], sample_rate)
  }

  // Add computed metrics
  response.computed_metrics = {
    avg_pace_per_km: stream.avgPacePerKm,
    pace_variability: stream.paceVariability,
    lap_splits: stream.lapSplits,
    pace_zones: stream.paceZones,
    pacing_strategy: stream.pacingStrategy,
    detected_surges: stream.surges
  }

  return response
}

/**
 * Create a chart visualization
 * This validates the chart data and returns success so the AI knows it will be displayed
 */
async function createChart(args: any): Promise<any> {
  const { type, title, labels, datasets } = args

  // Validate chart type
  const validTypes = ['line', 'bar', 'doughnut', 'radar']
  if (!validTypes.includes(type)) {
    return { error: `Invalid chart type '${type}'. Must be one of: ${validTypes.join(', ')}` }
  }

  // Validate labels
  if (!labels || labels.length === 0) {
    return { error: 'Chart must have at least one label' }
  }

  // Validate datasets
  if (!datasets || datasets.length === 0) {
    return { error: 'Chart must have at least one dataset' }
  }

  // Validate each dataset
  for (const dataset of datasets) {
    if (!dataset.label) {
      return { error: 'Each dataset must have a label' }
    }
    if (!dataset.data || !Array.isArray(dataset.data)) {
      return { error: `Dataset '${dataset.label}' must have a data array` }
    }
    if (dataset.data.length !== labels.length) {
      return {
        error: `Dataset '${dataset.label}' has ${dataset.data.length} data points but there are ${labels.length} labels. They must match.`
      }
    }
    // Validate all data points are numbers
    for (let i = 0; i < dataset.data.length; i++) {
      if (typeof dataset.data[i] !== 'number') {
        return {
          error: `Dataset '${dataset.label}' has non-numeric value at position ${i}: ${dataset.data[i]}`
        }
      }
    }
  }

  return {
    success: true,
    chartId: `chart-${Date.now()}`,
    message: `Chart '${title}' will be displayed inline in the conversation with ${datasets.length} dataset(s) and ${labels.length} data points.`
  }
}

/**
 * Fetch recent workout summaries
 */
async function getRecentWorkouts(
  userId: string,
  timezone: string,
  limit = 5,
  type?: string,
  days?: number
): Promise<any> {
  const where: any = { userId }

  if (type) {
    where.type = type
  }

  if (days) {
    const cutoff = getStartOfDaysAgoUTC(timezone, days)
    where.date = { gte: cutoff }
  }

  const workouts = await prisma.workout.findMany({
    where,
    orderBy: { date: 'desc' },
    take: Math.min(limit || 5, 20),
    select: {
      id: true,
      date: true,
      title: true,
      type: true,
      durationSec: true,
      distanceMeters: true,
      averageWatts: true,
      normalizedPower: true,
      averageHr: true,
      maxHr: true,
      averageCadence: true,
      tss: true,
      intensity: true,
      trainingLoad: true,
      kilojoules: true,
      elevationGain: true,
      averageSpeed: true,
      rpe: true,
      feel: true,
      description: true
    }
  })

  if (workouts.length === 0) {
    return { message: 'No workouts found matching the criteria' }
  }

  return {
    count: workouts.length,
    workouts: workouts.map((w) => ({
      id: w.id,
      date: formatUserDate(w.date, timezone, 'yyyy-MM-dd HH:mm'), // Keep ISO format for full timestamp
      title: w.title,
      type: w.type,
      duration_minutes: Math.round(w.durationSec / 60),
      distance_km: w.distanceMeters ? (w.distanceMeters / 1000).toFixed(1) : null,
      avg_power: w.averageWatts,
      normalized_power: w.normalizedPower,
      avg_hr: w.averageHr,
      max_hr: w.maxHr,
      avg_cadence: w.averageCadence,
      tss: w.tss ? Math.round(w.tss) : null,
      intensity_factor: w.intensity ? w.intensity.toFixed(2) : null,
      training_load: w.trainingLoad ? Math.round(w.trainingLoad) : null,
      kilojoules: w.kilojoules,
      elevation_gain: w.elevationGain,
      avg_speed_kmh: w.averageSpeed ? (w.averageSpeed * 3.6).toFixed(1) : null,
      rpe: w.rpe,
      feel: w.feel ? w.feel * 2 : null, // Scale 1-5 to 1-10 for AI
      description: w.description
    }))
  }
}

/**
 * Get comprehensive details for a specific workout
 * Can search by ID or by description/criteria
 */
async function getWorkoutDetails(userId: string, timezone: string, args: any): Promise<any> {
  let workout = null

  // If workout_id is provided, use it directly
  if (args.workout_id) {
    workout = await prisma.workout.findFirst({
      where: {
        id: args.workout_id,
        userId
      }
    })
  } else {
    // Search by criteria
    const where: any = { userId }

    if (args.title_search) {
      where.title = { contains: args.title_search, mode: 'insensitive' }
    }

    if (args.type) {
      where.type = args.type
    }

    if (args.date) {
      // args.date is expected to be YYYY-MM-DD in local time
      const dateParts = args.date.split('-')
      if (dateParts.length === 3) {
        const localDate = new Date(
          parseInt(dateParts[0]!),
          parseInt(dateParts[1]!) - 1,
          parseInt(dateParts[2]!)
        )
        const startOfDay = getStartOfDayUTC(timezone, localDate)
        const endOfDay = getEndOfDayUTC(timezone, localDate)
        where.date = { gte: startOfDay, lte: endOfDay }
      }
    }

    // Determine ordering based on relative_position
    let orderBy: any = { date: 'desc' } // Default to most recent

    if (args.relative_position) {
      const position = args.relative_position.toLowerCase()
      if (position.includes('longest')) {
        orderBy = { durationSec: 'desc' }
      } else if (position.includes('hardest') || position.includes('toughest')) {
        orderBy = { tss: 'desc' }
      } else if (position.includes('fastest')) {
        orderBy = { averageSpeed: 'desc' }
      }
    }

    // Find the workout
    const workouts = await prisma.workout.findMany({
      where,
      orderBy,
      take: 1
    })

    workout = workouts[0]
  }

  if (!workout) {
    return {
      error: 'Workout not found',
      suggestion:
        'Try using get_recent_workouts first to see available workouts, then reference them by ID'
    }
  }

  return {
    id: workout.id,
    date: formatUserDate(workout.date, timezone, 'yyyy-MM-dd HH:mm'),
    title: workout.title,
    description: workout.description,
    type: workout.type,
    source: workout.source,
    duration_minutes: Math.round(workout.durationSec / 60),
    distance_km: workout.distanceMeters ? (workout.distanceMeters / 1000).toFixed(1) : null,
    metrics: {
      power: {
        average: workout.averageWatts,
        normalized: workout.normalizedPower,
        max: workout.maxWatts,
        weighted_avg: workout.weightedAvgWatts
      },
      heart_rate: {
        average: workout.averageHr,
        max: workout.maxHr
      },
      cadence: {
        average: workout.averageCadence,
        max: workout.maxCadence
      },
      training: {
        tss: workout.tss ? Math.round(workout.tss) : null,
        training_load: workout.trainingLoad ? Math.round(workout.trainingLoad) : null,
        intensity_factor: workout.intensity ? workout.intensity.toFixed(2) : null,
        kilojoules: workout.kilojoules,
        trimp: workout.trimp
      },
      performance: {
        variability_index: workout.variabilityIndex ? workout.variabilityIndex.toFixed(2) : null,
        power_hr_ratio: workout.powerHrRatio ? workout.powerHrRatio.toFixed(2) : null,
        efficiency_factor: workout.efficiencyFactor ? workout.efficiencyFactor.toFixed(2) : null,
        decoupling: workout.decoupling ? workout.decoupling.toFixed(1) : null,
        polarization_index: workout.polarizationIndex ? workout.polarizationIndex.toFixed(2) : null
      },
      fitness: {
        ctl: workout.ctl ? Math.round(workout.ctl) : null,
        atl: workout.atl ? Math.round(workout.atl) : null,
        ftp_at_time: workout.ftp
      }
    },
    scores: {
      overall: workout.overallScore,
      technical: workout.technicalScore,
      effort: workout.effortScore,
      pacing: workout.pacingScore,
      execution: workout.executionScore
    },
    score_explanations: {
      overall_quality: workout.overallQualityExplanation,
      technical_execution: workout.technicalExecutionExplanation,
      effort_management: workout.effortManagementExplanation,
      pacing_strategy: workout.pacingStrategyExplanation,
      execution_consistency: workout.executionConsistencyExplanation
    },
    elevation_gain: workout.elevationGain,
    avg_speed_kmh: workout.averageSpeed ? (workout.averageSpeed * 3.6).toFixed(1) : null,
    subjective: {
      rpe: workout.rpe,
      session_rpe: workout.sessionRpe,
      feel: workout.feel ? workout.feel * 2 : null // Scale 1-5 to 1-10 for AI
    },
    environmental: {
      avg_temp: workout.avgTemp,
      indoor_trainer: workout.trainer
    },
    balance: {
      lr_balance: workout.lrBalance ? workout.lrBalance.toFixed(1) : null
    },
    ai_analysis: workout.aiAnalysis || null,
    ai_analysis_json: workout.aiAnalysisJson || null,
    duplicate_info: {
      is_duplicate: workout.isDuplicate,
      duplicate_of_id: workout.duplicateOf || null,
      completeness_score: workout.completenessScore
    },
    metadata: {
      external_id: workout.externalId,
      created_at: workout.createdAt.toISOString(),
      updated_at: workout.updatedAt.toISOString(),
      ai_analyzed_at: workout.aiAnalyzedAt?.toISOString() || null,
      ai_analysis_status: workout.aiAnalysisStatus
    },
    raw_data: workout.rawJson || null
  }
}

/**
 * Get nutrition log for date range
 */
async function getNutritionLog(
  userId: string,
  timezone: string,
  startDate: string,
  endDate?: string
): Promise<any> {
  const startParts = startDate.split('-')
  const localStartDate = new Date(
    parseInt(startParts[0]!),
    parseInt(startParts[1]!) - 1,
    parseInt(startParts[2]!)
  )
  const start = getStartOfDayUTC(timezone, localStartDate)

  let end: Date
  if (endDate) {
    const endParts = endDate.split('-')
    const localEndDate = new Date(
      parseInt(endParts[0]!),
      parseInt(endParts[1]!) - 1,
      parseInt(endParts[2]!)
    )
    end = getEndOfDayUTC(timezone, localEndDate)
  } else {
    end = getEndOfDayUTC(timezone, localStartDate)
  }

  const nutritionEntries = await prisma.nutrition.findMany({
    where: {
      userId,
      date: {
        gte: start,
        lte: end
      }
    },
    orderBy: { date: 'desc' },
    select: {
      id: true,
      date: true,
      calories: true,
      protein: true,
      carbs: true,
      fat: true,
      fiber: true,
      sugar: true,
      aiAnalysis: true,
      aiAnalysisJson: true
    }
  })

  if (nutritionEntries.length === 0) {
    return { message: 'No nutrition data found for the specified date range' }
  }

  return {
    count: nutritionEntries.length,
    date_range: {
      start: startDate, // Return what was requested/formatted
      end: endDate || startDate
    },
    entries: nutritionEntries.map((entry) => ({
      id: entry.id,
      date: formatUserDate(entry.date, timezone),
      macros: {
        calories: entry.calories,
        protein: entry.protein ? Math.round(entry.protein) : null,
        carbs: entry.carbs ? Math.round(entry.carbs) : null,
        fat: entry.fat ? Math.round(entry.fat) : null,
        fiber: entry.fiber ? Math.round(entry.fiber) : null,
        sugar: entry.sugar ? Math.round(entry.sugar) : null
      },
      ai_analysis: entry.aiAnalysis || null,
      ai_analysis_json: entry.aiAnalysisJson || null
    })),
    totals: {
      calories: nutritionEntries.reduce((sum, e) => sum + (e.calories || 0), 0),
      protein: nutritionEntries.reduce((sum, e) => sum + (e.protein || 0), 0),
      carbs: nutritionEntries.reduce((sum, e) => sum + (e.carbs || 0), 0),
      fat: nutritionEntries.reduce((sum, e) => sum + (e.fat || 0), 0)
    }
  }
}

/**
 * Get wellness metrics for date range
 */
async function getWellnessMetrics(
  userId: string,
  timezone: string,
  startDate: string,
  endDate?: string
): Promise<any> {
  const startParts = startDate.split('-')
  const localStartDate = new Date(
    parseInt(startParts[0]!),
    parseInt(startParts[1]!) - 1,
    parseInt(startParts[2]!)
  )
  const start = getStartOfDayUTC(timezone, localStartDate)

  let end: Date
  if (endDate) {
    const endParts = endDate.split('-')
    const localEndDate = new Date(
      parseInt(endParts[0]!),
      parseInt(endParts[1]!) - 1,
      parseInt(endParts[2]!)
    )
    end = getEndOfDayUTC(timezone, localEndDate)
  } else {
    end = getEndOfDayUTC(timezone, localStartDate)
  }

  const wellness = await prisma.wellness.findMany({
    where: {
      userId,
      date: {
        gte: start,
        lte: end
      }
    },
    orderBy: { date: 'desc' },
    select: {
      id: true,
      date: true,
      recoveryScore: true,
      hrv: true,
      restingHr: true,
      sleepHours: true,
      sleepScore: true,
      spO2: true,
      readiness: true,
      fatigue: true,
      soreness: true,
      stress: true,
      mood: true
    }
  })

  if (wellness.length === 0) {
    return { message: 'No wellness data found for the specified date range' }
  }

  return {
    count: wellness.length,
    date_range: {
      start: startDate,
      end: endDate || startDate
    },
    metrics: wellness.map((w) => ({
      date: formatUserDate(w.date, timezone),
      recovery: {
        recovery_score: w.recoveryScore,
        hrv: w.hrv,
        resting_hr: w.restingHr,
        readiness: w.readiness
      },
      sleep: {
        hours: w.sleepHours,
        score: w.sleepScore,
        spo2: w.spO2
      },
      subjective: {
        fatigue: w.fatigue,
        soreness: w.soreness,
        stress: w.stress,
        mood: w.mood
      }
    }))
  }
}
/**
 * Get comprehensive performance metrics and analytics
 */
async function getPerformanceMetrics(userId: string, timezone: string, args: any): Promise<any> {
  const periodDays = args.period_days || 30
  const cutoff = getStartOfDaysAgoUTC(timezone, periodDays)

  // Fetch all workouts in the period
  const workouts = await prisma.workout.findMany({
    where: {
      userId,
      date: { gte: cutoff }
    },
    orderBy: { date: 'asc' },
    select: {
      id: true,
      date: true,
      title: true,
      type: true,
      durationSec: true,
      distanceMeters: true,
      averageWatts: true,
      averageHr: true,
      tss: true,
      trainingLoad: true,
      intensity: true,
      kilojoules: true,
      ctl: true,
      atl: true
    }
  })

  if (workouts.length === 0) {
    return {
      message: `No workouts found in the last ${periodDays} days`,
      period_days: periodDays
    }
  }

  const response: any = {
    period: {
      days: periodDays,
      start_date: formatUserDate(cutoff, timezone),
      end_date: formatUserDate(new Date(), timezone),
      total_workouts: workouts.length
    },
    summary: {
      total_duration_hours: (workouts.reduce((sum, w) => sum + w.durationSec, 0) / 3600).toFixed(1),
      total_distance_km: workouts.reduce((sum, w) => sum + (w.distanceMeters || 0), 0) / 1000,
      total_tss: workouts.reduce((sum, w) => sum + (w.tss || 0), 0),
      total_training_load: workouts.reduce((sum, w) => sum + (w.trainingLoad || 0), 0),
      avg_workout_duration_minutes: Math.round(
        workouts.reduce((sum, w) => sum + w.durationSec, 0) / workouts.length / 60
      ),
      workouts_per_week: ((workouts.length / periodDays) * 7).toFixed(1)
    }
  }

  // Activity Distribution
  if (args.include_activity_distribution !== false) {
    const typeBreakdown = workouts.reduce((acc: any, w) => {
      const type = w.type || 'Other'
      if (!acc[type]) {
        acc[type] = { count: 0, total_duration_hours: 0, total_tss: 0 }
      }
      acc[type].count++
      acc[type].total_duration_hours += w.durationSec / 3600
      acc[type].total_tss += w.tss || 0
      return acc
    }, {})

    response.activity_distribution = Object.entries(typeBreakdown)
      .map(([type, stats]: [string, any]) => ({
        type,
        count: stats.count,
        percentage: ((stats.count / workouts.length) * 100).toFixed(1),
        total_hours: stats.total_duration_hours.toFixed(1),
        total_tss: Math.round(stats.total_tss)
      }))
      .sort((a, b) => b.count - a.count)
  }

  // Training Load Trends
  if (args.include_training_load !== false) {
    const dailyLoad: any = {}
    workouts.forEach((w) => {
      const date = formatUserDate(w.date, timezone)
      if (!dailyLoad[date]) {
        dailyLoad[date] = { tss: 0, training_load: 0, duration_hours: 0, count: 0 }
      }
      dailyLoad[date].tss += w.tss || 0
      dailyLoad[date].training_load += w.trainingLoad || 0
      dailyLoad[date].duration_hours += w.durationSec / 3600
      dailyLoad[date].count++
    })

    response.training_load_trend = Object.entries(dailyLoad)
      .map(([date, data]: [string, any]) => ({
        date,
        tss: Math.round(data.tss),
        training_load: Math.round(data.training_load),
        duration_hours: data.duration_hours.toFixed(1),
        workout_count: data.count
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  // Weekly Training Hours
  if (args.include_weekly_hours !== false) {
    const weeklyData: any = {}
    workouts.forEach((w) => {
      // Need to find start of week relative to user timezone
      // Assuming week starts on Monday
      const localDateStr = formatUserDate(w.date, timezone, 'yyyy-MM-dd')
      const parts = localDateStr.split('-')
      const d = new Date(
        Date.UTC(parseInt(parts[0]!), parseInt(parts[1]!) - 1, parseInt(parts[2]!))
      )
      const day = d.getUTCDay()
      const diff = d.getUTCDate() - day + (day == 0 ? -6 : 1) // adjust when day is sunday
      d.setUTCDate(diff)
      const weekKey = d.toISOString().split('T')[0] // Use local date YYYY-MM-DD as key

      if (weekKey) {
        if (!weeklyData[weekKey]) {
          weeklyData[weekKey] = { duration_hours: 0, tss: 0, count: 0 }
        }
        weeklyData[weekKey].duration_hours += w.durationSec / 3600
        weeklyData[weekKey].tss += w.tss || 0
        weeklyData[weekKey].count++
      }
    })

    response.weekly_training_hours = Object.entries(weeklyData)
      .map(([week_start, data]: [string, any]) => ({
        week_start,
        total_hours: data.duration_hours.toFixed(1),
        total_tss: Math.round(data.tss),
        workout_count: data.count,
        avg_hours_per_workout: (data.duration_hours / data.count).toFixed(1)
      }))
      .sort((a, b) => a.week_start.localeCompare(b.week_start))
      .slice(-8) // Last 8 weeks
  }

  // Intensity Analysis (no date changes needed here)
  if (args.include_intensity_analysis !== false) {
    const workoutsWithIntensity = workouts.filter((w) => w.intensity !== null)
    if (workoutsWithIntensity.length > 0) {
      // Normalize intensity values
      const normalizeIntensity = (intensity: number | null) => {
        if (!intensity) return 0
        // Valid IF range: 0.5-2.0 (rarely >2.0)
        if (intensity > 2.0) {
          if (intensity <= 200) {
            // Stored as percentage (need to divide by 100)
            return intensity / 100
          }
          // Invalid data (>200), treat as 0
          return 0
        }
        return intensity
      }

      const validWorkouts = workoutsWithIntensity.filter((w) => {
        const normalized = normalizeIntensity(w.intensity)
        return normalized > 0 && normalized <= 2.0
      })

      if (validWorkouts.length > 0) {
        const avgIntensity =
          validWorkouts.reduce((sum, w) => sum + normalizeIntensity(w.intensity), 0) /
          validWorkouts.length

        response.intensity_analysis = {
          avg_intensity_factor: avgIntensity.toFixed(2),
          high_intensity_workouts: workouts.filter((w) => normalizeIntensity(w.intensity) > 0.85)
            .length,
          moderate_intensity_workouts: workouts.filter((w) => {
            const normalized = normalizeIntensity(w.intensity)
            return normalized >= 0.65 && normalized <= 0.85
          }).length,
          low_intensity_workouts: workouts.filter((w) => {
            const normalized = normalizeIntensity(w.intensity)
            return normalized > 0 && normalized < 0.65
          }).length
        }
      }
    }
  }

  // Fitness Trends (CTL/ATL if available)
  const latestWorkout = workouts[workouts.length - 1]
  if (latestWorkout && (latestWorkout.ctl !== null || latestWorkout.atl !== null)) {
    response.fitness_metrics = {
      current_ctl_fitness: latestWorkout.ctl ? Math.round(latestWorkout.ctl) : null,
      current_atl_fatigue: latestWorkout.atl ? Math.round(latestWorkout.atl) : null,
      training_stress_balance:
        latestWorkout.ctl && latestWorkout.atl
          ? Math.round(latestWorkout.ctl - latestWorkout.atl)
          : null
    }
  }

  return response
}

/**
 * Search workouts with advanced filters
 */
async function searchWorkouts(userId: string, timezone: string, args: any): Promise<any> {
  const where: any = { userId }

  if (args.query) {
    where.OR = [
      { title: { contains: args.query, mode: 'insensitive' } },
      { description: { contains: args.query, mode: 'insensitive' } }
    ]
  }

  if (args.min_duration_minutes) {
    where.durationSec = { gte: args.min_duration_minutes * 60 }
  }

  if (args.max_duration_minutes) {
    where.durationSec = where.durationSec || {}
    where.durationSec.lte = args.max_duration_minutes * 60
  }

  if (args.min_tss) {
    where.tss = { gte: args.min_tss }
  }

  if (args.date_from) {
    const fromParts = args.date_from.split('-')
    const localFrom = new Date(
      parseInt(fromParts[0]!),
      parseInt(fromParts[1]!) - 1,
      parseInt(fromParts[2]!)
    )
    where.date = { gte: getStartOfDayUTC(timezone, localFrom) }
  }

  if (args.date_to) {
    where.date = where.date || {}
    const toParts = args.date_to.split('-')
    const localTo = new Date(
      parseInt(toParts[0]!),
      parseInt(toParts[1]!) - 1,
      parseInt(toParts[2]!)
    )
    where.date.lte = getEndOfDayUTC(timezone, localTo)
  }

  const workouts = await prisma.workout.findMany({
    where,
    orderBy: { date: 'desc' },
    take: Math.min(args.limit || 10, 20),
    select: {
      id: true,
      date: true,
      title: true,
      type: true,
      durationSec: true,
      distanceMeters: true,
      averageWatts: true,
      averageHr: true,
      tss: true,
      intensity: true,
      description: true
    }
  })

  if (workouts.length === 0) {
    return { message: 'No workouts found matching the search criteria' }
  }

  return {
    count: workouts.length,
    workouts: workouts.map((w) => ({
      id: w.id,
      date: formatUserDate(w.date, timezone, 'yyyy-MM-dd HH:mm'),
      title: w.title,
      type: w.type,
      duration_minutes: Math.round(w.durationSec / 60),
      distance_km: w.distanceMeters ? (w.distanceMeters / 1000).toFixed(1) : null,
      avg_power: w.averageWatts,
      avg_hr: w.averageHr,
      tss: w.tss ? Math.round(w.tss) : null,
      intensity_factor: w.intensity ? w.intensity.toFixed(2) : null,
      description: w.description
    }))
  }
}

/**
 * Get details for a specific recommendation
 */
async function getRecommendationDetails(userId: string, timezone: string, args: any): Promise<any> {
  const { recommendation_id } = args

  const rec = await prisma.recommendation.findFirst({
    where: {
      id: recommendation_id,
      userId
    }
  })

  if (!rec) {
    return { error: 'Recommendation not found' }
  }

  return {
    id: rec.id,
    title: rec.title,
    description: rec.description,
    priority: rec.priority,
    status: rec.status,
    type: rec.sourceType,
    metric: rec.metric,
    generated_at: formatUserDate(rec.generatedAt, timezone),
    is_pinned: rec.isPinned,
    implementation_guide: rec.implementationGuide || null,
    history: rec.history || []
  }
}

/**
 * List recommendations
 */
async function listRecommendations(userId: string, timezone: string, args: any): Promise<any> {
  const status = args.status || 'ACTIVE'
  const priority = args.priority
  const limit = args.limit || 5

  const where: any = { userId }

  if (status !== 'ALL') {
    where.status = status
  }

  if (priority) {
    where.priority = priority
  }

  const recs = await prisma.recommendation.findMany({
    where,
    orderBy: [{ isPinned: 'desc' }, { generatedAt: 'desc' }],
    take: limit
  })

  return {
    count: recs.length,
    recommendations: recs.map((rec) => ({
      id: rec.id,
      title: rec.title,
      priority: rec.priority,
      status: rec.status,
      type: rec.sourceType,
      metric: rec.metric,
      generated_at: formatUserDate(rec.generatedAt, timezone)
    }))
  }
}
