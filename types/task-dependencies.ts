// Task Dependency System Types
// Defines the hierarchy and relationships between trigger tasks

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export type TaskCategory =
  | 'ingestion' // Data sync from integrations
  | 'cleanup' // Data cleanup and deduplication
  | 'analysis' // AI analysis of individual items
  | 'profile' // Athlete profile generation
  | 'reports' // Report generation
  | 'planning' // Training plan generation
  | 'insights' // Performance insights

export interface TaskDefinition {
  id: string
  name: string
  description: string
  category: TaskCategory

  // Dependencies - tasks that must complete before this one
  dependsOn: string[]

  // Estimated duration in seconds
  estimatedDuration: number

  // Whether this task is required for the full sync
  required: boolean

  // API endpoint to trigger this task
  endpoint?: string

  // Trigger.dev task ID
  triggerId?: string
}

export interface TaskExecutionState {
  taskId: string
  status: TaskStatus
  startTime?: Date
  endTime?: Date
  error?: string
  result?: any
  progress?: number // 0-100
  message?: string
}

export interface DependencyGraphState {
  tasks: Record<string, TaskExecutionState>
  currentPhase: string
  overallProgress: number
  startTime: Date
  endTime?: Date
  error?: string
}

/**
 * Complete task dependency configuration
 * Defines the order and relationships of all system tasks
 */
export const TASK_DEPENDENCIES: Record<string, TaskDefinition> = {
  // ========================================
  // LEVEL 1: DATA INGESTION
  // ========================================
  'ingest-intervals': {
    id: 'ingest-intervals',
    name: 'Sync Intervals.icu',
    description: 'Import workouts, wellness data, and planned workouts from Intervals.icu',
    category: 'ingestion',
    dependsOn: [],
    estimatedDuration: 30,
    required: true,
    endpoint: '/api/integrations/sync',
    triggerId: 'ingest-intervals'
  },

  'ingest-whoop': {
    id: 'ingest-whoop',
    name: 'Sync Whoop',
    description: 'Import recovery metrics, sleep data, and strain from Whoop',
    category: 'ingestion',
    dependsOn: [],
    estimatedDuration: 20,
    required: false,
    endpoint: '/api/integrations/sync',
    triggerId: 'ingest-whoop'
  },

  'ingest-yazio': {
    id: 'ingest-yazio',
    name: 'Sync Yazio',
    description: 'Import nutrition data and meal logs from Yazio',
    category: 'ingestion',
    dependsOn: [],
    estimatedDuration: 25,
    required: false,
    endpoint: '/api/integrations/sync',
    triggerId: 'ingest-yazio'
  },

  'ingest-strava': {
    id: 'ingest-strava',
    name: 'Sync Strava',
    description: 'Import activities from Strava',
    category: 'ingestion',
    dependsOn: [],
    estimatedDuration: 20,
    required: false,
    endpoint: '/api/integrations/sync',
    triggerId: 'ingest-strava'
  },

  // ========================================
  // LEVEL 1.5: DATA CLEANUP
  // ========================================
  'deduplicate-workouts': {
    id: 'deduplicate-workouts',
    name: 'Deduplicate Workouts',
    description: 'Identify and mark duplicate workouts, keeping the most complete version',
    category: 'cleanup',
    dependsOn: ['ingest-intervals', 'ingest-strava'],
    estimatedDuration: 30,
    required: true,
    endpoint: '/api/workouts/deduplicate',
    triggerId: 'deduplicate-workouts'
  },

  // ========================================
  // LEVEL 2: AI ANALYSIS
  // ========================================
  'analyze-workouts': {
    id: 'analyze-workouts',
    name: 'Analyze Workouts',
    description: 'AI analysis of recent workouts for insights and recommendations',
    category: 'analysis',
    dependsOn: ['deduplicate-workouts'],
    estimatedDuration: 60,
    required: true,
    endpoint: '/api/workouts/analyze-all',
    triggerId: 'analyze-last-3-workouts'
  },

  'analyze-nutrition': {
    id: 'analyze-nutrition',
    name: 'Analyze Nutrition',
    description: 'AI analysis of recent nutrition entries for quality and adherence',
    category: 'analysis',
    dependsOn: ['ingest-yazio'],
    estimatedDuration: 40,
    required: false,
    endpoint: '/api/nutrition/analyze-all',
    triggerId: 'analyze-last-7-nutrition'
  },

  // ========================================
  // LEVEL 3: ATHLETE PROFILE
  // ========================================
  'generate-athlete-profile': {
    id: 'generate-athlete-profile',
    name: 'Generate Athlete Profile',
    description: 'Create comprehensive athlete profile from all analyzed data',
    category: 'profile',
    dependsOn: ['analyze-workouts', 'analyze-nutrition', 'ingest-whoop'],
    estimatedDuration: 120,
    required: true,
    endpoint: '/api/profile/generate',
    triggerId: 'generate-athlete-profile'
  },

  // ========================================
  // LEVEL 4: REPORTS & PLANNING
  // ========================================
  'generate-weekly-workout-report': {
    id: 'generate-weekly-workout-report',
    name: 'Weekly Workout Report',
    description: 'Create weekly workout performance analysis and insights',
    category: 'reports',
    dependsOn: ['analyze-workouts', 'ingest-whoop'],
    estimatedDuration: 90,
    required: false,
    endpoint: '/api/reports/generate',
    triggerId: 'generate-weekly-report'
  },

  'generate-weekly-nutrition-report': {
    id: 'generate-weekly-nutrition-report',
    name: 'Weekly Nutrition Report',
    description: 'Create weekly nutrition analysis and insights',
    category: 'reports',
    dependsOn: ['analyze-nutrition'],
    estimatedDuration: 80,
    required: false,
    endpoint: '/api/reports/generate',
    triggerId: 'generate-weekly-report'
  },

  'generate-weekly-plan': {
    id: 'generate-weekly-plan',
    name: 'Generate Training Plan',
    description: "Create next week's training plan based on athlete profile",
    category: 'planning',
    dependsOn: ['generate-athlete-profile'],
    estimatedDuration: 100,
    required: false,
    endpoint: '/api/plans/generate',
    triggerId: 'generate-weekly-plan'
  },

  'generate-daily-recommendations': {
    id: 'generate-daily-recommendations',
    name: "Today's Training",
    description: "Generate today's workout recommendations",
    category: 'planning',
    dependsOn: ['generate-athlete-profile'],
    estimatedDuration: 45,
    required: false,
    endpoint: '/api/recommendations/today',
    triggerId: 'daily-coach'
  },

  // ========================================
  // LEVEL 5: PERFORMANCE INSIGHTS
  // ========================================
  'generate-score-explanations': {
    id: 'generate-score-explanations',
    name: 'Performance Insights',
    description: 'Generate detailed explanations for performance scores and trends',
    category: 'insights',
    dependsOn: [
      'generate-athlete-profile',
      'generate-weekly-workout-report',
      'generate-weekly-nutrition-report'
    ],
    estimatedDuration: 80,
    required: false,
    endpoint: '/api/scores/generate-explanations',
    triggerId: 'generate-score-explanations'
  }
}

/**
 * Get tasks grouped by execution level for sequential processing
 */
export function getTasksByLevel(): TaskDefinition[][] {
  const levels: TaskDefinition[][] = []
  const processed = new Set<string>()
  const tasks = Object.values(TASK_DEPENDENCIES)

  while (processed.size < tasks.length) {
    const currentLevel: TaskDefinition[] = []

    for (const task of tasks) {
      if (processed.has(task.id)) continue

      // Check if all dependencies are processed
      const allDepsProcessed = task.dependsOn.every((dep) => processed.has(dep))

      if (allDepsProcessed) {
        currentLevel.push(task)
        processed.add(task.id)
      }
    }

    if (currentLevel.length === 0) {
      // Circular dependency or error
      break
    }

    levels.push(currentLevel)
  }

  return levels
}

/**
 * Get all tasks that depend on a given task
 */
export function getDependentTasks(taskId: string): TaskDefinition[] {
  return Object.values(TASK_DEPENDENCIES).filter((task) => task.dependsOn.includes(taskId))
}

/**
 * Check if a task can be executed given current states
 */
export function canExecuteTask(
  taskId: string,
  states: Record<string, TaskExecutionState>
): boolean {
  const task = TASK_DEPENDENCIES[taskId]
  if (!task) return false

  // Check if all dependencies are completed
  return task.dependsOn.every((depId) => {
    const depState = states[depId]
    return depState && depState.status === 'completed'
  })
}

/**
 * Calculate overall progress based on task states
 */
export function calculateOverallProgress(states: Record<string, TaskExecutionState>): number {
  const tasks = Object.values(TASK_DEPENDENCIES)
  const totalDuration = tasks.reduce((sum, t) => sum + t.estimatedDuration, 0)

  let completedDuration = 0
  for (const task of tasks) {
    const state = states[task.id]
    if (!state) continue

    if (state.status === 'completed') {
      completedDuration += task.estimatedDuration
    } else if (state.status === 'running' && state.progress) {
      completedDuration += task.estimatedDuration * (state.progress / 100)
    }
  }

  return Math.round((completedDuration / totalDuration) * 100)
}
