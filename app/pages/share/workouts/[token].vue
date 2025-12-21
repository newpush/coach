<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Simple Header -->
    <header class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-zap" class="w-6 h-6 text-primary-500" />
            <span class="font-bold text-lg text-gray-900 dark:text-white">Coach Wattz</span>
          </div>
          <div class="flex items-center gap-4">
            <UButton
              to="/"
              color="primary"
              variant="soft"
              size="sm"
            >
              Try Coach Wattz
            </UButton>
            <ColorModeButton />
          </div>
        </div>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div v-if="loading" class="flex items-center justify-center py-12">
        <div class="text-center">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
          <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">Loading shared workout...</p>
        </div>
      </div>

      <div v-else-if="error" class="text-center py-12">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8 max-w-md mx-auto">
          <UIcon name="i-heroicons-exclamation-triangle" class="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Unavailable</h3>
          <p class="text-gray-600 dark:text-gray-400 mb-6">{{ error }}</p>
          <UButton to="/" color="primary" variant="solid">Go Home</UButton>
        </div>
      </div>

      <div v-else-if="workout" class="space-y-6">
        <!-- Header Section: Workout Info (2/3) + Performance Scores (1/3) -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Workout Info Card - 2/3 -->
          <div class="lg:col-span-2">
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 h-full border border-gray-200 dark:border-gray-700">
              <div class="flex items-start justify-between mb-4">
                <div class="flex-1">
                  <div class="flex items-center gap-3 mb-2">
                    <UAvatar
                      v-if="workout.user?.image"
                      :src="workout.user.image"
                      :alt="workout.user.name || 'User'"
                      size="xs"
                    />
                    <span class="text-sm text-gray-500 dark:text-gray-400">
                      {{ workout.user?.name || 'Coach Wattz User' }} shared a workout
                    </span>
                  </div>
                  <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    {{ workout.title }}
                  </h1>
                  <div class="flex flex-wrap gap-3 text-sm text-gray-600 dark:text-gray-400">
                    <div class="flex items-center gap-1">
                      <span class="i-heroicons-calendar w-4 h-4"></span>
                      {{ formatDate(workout.date) }}
                    </div>
                    <div v-if="workout.type" class="flex items-center gap-1">
                      <span class="i-heroicons-tag w-4 h-4"></span>
                      {{ workout.type }}
                    </div>
                    <div class="flex items-center gap-1">
                      <span class="i-heroicons-clock w-4 h-4"></span>
                      {{ formatDuration(workout.durationSec) }}
                    </div>
                  </div>
                </div>
                <div class="flex gap-2">
                  <span v-if="workout.deviceName" class="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                    {{ workout.deviceName }}
                  </span>
                  <span :class="getSourceBadgeClass(workout.source)">
                    {{ workout.source }}
                  </span>
                </div>
              </div>

              <!-- Key Stats Grid -->
              <div class="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div v-if="workout.trainingLoad" class="rounded-lg p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <div class="text-xs text-blue-600 dark:text-blue-400 mb-1">Training Load</div>
                  <div class="text-xl font-bold text-blue-900 dark:text-blue-100">{{ Math.round(workout.trainingLoad) }}</div>
                </div>
                <div v-if="workout.averageHr" class="rounded-lg p-3 bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800">
                  <div class="text-xs text-pink-600 dark:text-pink-400 mb-1">Avg HR</div>
                  <div class="text-xl font-bold text-pink-900 dark:text-pink-100">{{ workout.averageHr }} <span class="text-sm">bpm</span></div>
                </div>
                <div v-if="workout.averageWatts" class="rounded-lg p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                  <div class="text-xs text-purple-600 dark:text-purple-400 mb-1">Avg Power</div>
                  <div class="text-xl font-bold text-purple-900 dark:text-purple-100">{{ workout.averageWatts }}<span class="text-sm">W</span></div>
                </div>
                <div v-if="workout.normalizedPower" class="rounded-lg p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                  <div class="text-xs text-indigo-600 dark:text-indigo-400 mb-1">Norm Power</div>
                  <div class="text-xl font-bold text-indigo-900 dark:text-indigo-100">{{ workout.normalizedPower }}<span class="text-sm">W</span></div>
                </div>
              </div>

              <div v-if="workout.description" class="mt-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{{ workout.description }}</p>
              </div>
            </div>
          </div>

          <!-- Performance Scores Card - 1/3 -->
          <div class="lg:col-span-1">
            <div v-if="workout.overallScore || workout.technicalScore || workout.effortScore || workout.pacingScore || workout.executionScore" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700 h-full">
              <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-4">Performance Scores</h2>
              <div style="height: 200px;">
                <PerformanceScoreChart
                  :scores="{
                    overall: workout.overallScore,
                    technical: workout.technicalScore,
                    effort: workout.effortScore,
                    pacing: workout.pacingScore,
                    execution: workout.executionScore
                  }"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Training Impact Section (TSS, CTL, ATL, TSB) -->
        <div v-if="hasTrainingMetrics(workout)" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
          <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-6">Training Impact & Load</h2>
          
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <!-- TSS -->
            <div class="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium text-blue-700 dark:text-blue-300">TSS (Load)</span>
              </div>
              <div class="text-2xl font-bold text-blue-900 dark:text-blue-100">
                {{ Math.round(workout.tss || workout.trainingLoad || 0) }}
              </div>
            </div>

            <!-- CTL (Fitness) -->
            <div class="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium text-green-700 dark:text-green-300">Fitness (CTL)</span>
              </div>
              <div class="text-2xl font-bold text-green-900 dark:text-green-100">
                {{ workout.ctl ? Math.round(workout.ctl) : '-' }}
              </div>
            </div>

            <!-- ATL (Fatigue) -->
            <div class="p-4 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium text-orange-700 dark:text-orange-300">Fatigue (ATL)</span>
              </div>
              <div class="text-2xl font-bold text-orange-900 dark:text-orange-100">
                {{ workout.atl ? Math.round(workout.atl) : '-' }}
              </div>
            </div>

            <!-- TSB (Form) -->
            <div class="p-4 rounded-lg" :class="getFormClass(calculateForm(workout))">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium opacity-80">Form (TSB)</span>
              </div>
              <div class="text-2xl font-bold">
                {{ calculateForm(workout) !== null ? calculateForm(workout) : '-' }}
              </div>
            </div>
          </div>
        </div>

        <!-- AI Analysis Section -->
        <div v-if="workout.aiAnalysisJson" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
          <div class="flex items-center gap-2 mb-4">
            <span class="i-heroicons-sparkles w-5 h-5 text-primary-500"></span>
            <h2 class="text-lg font-bold text-gray-900 dark:text-white">AI Analysis</h2>
          </div>
          
          <!-- Executive Summary -->
          <div class="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800 mb-6">
            <h3 class="text-base font-semibold text-blue-900 dark:text-blue-100 mb-4 flex items-center gap-2">
              <span class="i-heroicons-light-bulb w-5 h-5"></span>
              Quick Take
            </h3>
            <p class="text-base text-gray-800 dark:text-gray-200 leading-relaxed">{{ workout.aiAnalysisJson.executive_summary }}</p>
          </div>

          <!-- Analysis Sections -->
          <div v-if="workout.aiAnalysisJson.sections" class="grid grid-cols-1 gap-4">
            <div
              v-for="(section, index) in workout.aiAnalysisJson.sections"
              :key="index"
              class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{{ section.title }}</h3>
                <span :class="getStatusBadgeClass(section.status)">
                  {{ section.status_label || section.status }}
                </span>
              </div>
              <div class="px-6 py-4">
                <ul class="space-y-2">
                  <li
                    v-for="(point, pIndex) in section.analysis_points"
                    :key="pIndex"
                    class="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
                  >
                    <span class="i-heroicons-chevron-right w-4 h-4 mt-0.5 text-primary-500 flex-shrink-0"></span>
                    <span>{{ point }}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <!-- Strengths & Weaknesses -->
          <div v-if="workout.aiAnalysisJson.strengths || workout.aiAnalysisJson.weaknesses" class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <!-- Strengths -->
            <div v-if="workout.aiAnalysisJson.strengths && workout.aiAnalysisJson.strengths.length > 0" class="bg-green-50 dark:bg-green-900/20 rounded-lg p-6 border border-green-200 dark:border-green-800">
              <h3 class="text-lg font-semibold text-green-900 dark:text-green-100 mb-3 flex items-center gap-2">
                <span class="i-heroicons-check-circle w-5 h-5"></span>
                Strengths
              </h3>
              <ul class="space-y-2">
                <li
                  v-for="(strength, index) in workout.aiAnalysisJson.strengths"
                  :key="index"
                  class="flex items-start gap-2 text-sm text-green-800 dark:text-green-200"
                >
                  <span class="i-heroicons-plus-circle w-4 h-4 mt-0.5 flex-shrink-0"></span>
                  <span>{{ strength }}</span>
                </li>
              </ul>
            </div>

            <!-- Weaknesses -->
            <div v-if="workout.aiAnalysisJson.weaknesses && workout.aiAnalysisJson.weaknesses.length > 0" class="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-6 border border-orange-200 dark:border-orange-800">
              <h3 class="text-lg font-semibold text-orange-900 dark:text-orange-100 mb-3 flex items-center gap-2">
                <span class="i-heroicons-exclamation-triangle w-5 h-5"></span>
                Areas for Improvement
              </h3>
              <ul class="space-y-2">
                <li
                  v-for="(weakness, index) in workout.aiAnalysisJson.weaknesses"
                  :key="index"
                  class="flex items-start gap-2 text-sm text-orange-800 dark:text-orange-200"
                >
                  <span class="i-heroicons-arrow-trending-up w-4 h-4 mt-0.5 flex-shrink-0"></span>
                  <span>{{ weakness }}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Power Curve Section (for activities with power data) -->
        <div v-if="shouldShowPowerCurve(workout)" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
          <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Power Duration Curve</h2>
          <PowerCurveChart :workout-id="workout.id" :public-token="token" />
        </div>

        <!-- Interval Analysis Section -->
        <div v-if="shouldShowPacing(workout)" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
          <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Intervals & Peak Efforts</h2>
          <IntervalsAnalysis :workout-id="workout.id" :public-token="token" />
        </div>

        <!-- Advanced Analytics Section -->
        <div v-if="shouldShowPacing(workout)" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
          <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Advanced Analytics</h2>
          <AdvancedWorkoutMetrics :workout-id="workout.id" :public-token="token" />
        </div>

        <!-- Pacing Analysis Section -->
        <div v-if="shouldShowPacing(workout)" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
          <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Pacing Analysis</h2>
          <PacingAnalysis :workout-id="workout.id" :public-token="token" />
        </div>

        <!-- Timeline Visualization -->
        <div v-if="shouldShowPacing(workout)" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
          <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Workout Timeline</h2>
          <WorkoutTimeline :workout-id="workout.id" :public-token="token" />
        </div>

        <!-- Zone Distribution Visualization -->
        <div v-if="shouldShowPacing(workout)" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
          <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Training Zones</h2>
          <ZoneChart :workout-id="workout.id" :public-token="token" />
        </div>

        <!-- Efficiency Metrics Section -->
        <EfficiencyMetricsCard
          v-if="hasEfficiencyMetrics(workout)"
          :metrics="{
            variabilityIndex: workout.variabilityIndex,
            efficiencyFactor: workout.efficiencyFactor,
            decoupling: workout.decoupling,
            powerHrRatio: workout.powerHrRatio,
            polarizationIndex: workout.polarizationIndex,
            lrBalance: workout.lrBalance
          }"
        />

        <!-- Detailed Metrics Section -->
        <div v-if="availableMetrics.length > 0" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Detailed Metrics</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
            <div
              v-for="metric in availableMetrics"
              :key="metric.key"
              class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
            >
              <span class="text-sm text-gray-600 dark:text-gray-400">{{ metric.label }}</span>
              <span class="text-sm font-medium text-gray-900 dark:text-white">{{ metric.value }}</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
// Use guest middleware to allow access without auth
definePageMeta({
  layout: false,
  middleware: 'guest'
})

const route = useRoute()
const token = route.params.token as string

const workout = ref<any>(null)
const loading = ref(true)
const error = ref<string | null>(null)

// Formatters
function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`
  if (minutes > 0) return `${minutes}m ${secs}s`
  return `${secs}s`
}

function getSourceBadgeClass(source: string) {
  const baseClass = 'px-3 py-1 rounded-full text-xs font-semibold'
  if (source === 'intervals') return `${baseClass} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`
  if (source === 'whoop') return `${baseClass} bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200`
  if (source === 'strava') return `${baseClass} bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200`
  return `${baseClass} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200`
}

function getStatusBadgeClass(status: string) {
  const baseClass = 'px-3 py-1 rounded-full text-xs font-semibold'
  if (status === 'excellent') return `${baseClass} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`
  if (status === 'good') return `${baseClass} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`
  if (status === 'moderate') return `${baseClass} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`
  if (status === 'needs_improvement') return `${baseClass} bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200`
  if (status === 'poor') return `${baseClass} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`
  return `${baseClass} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200`
}

function shouldShowPowerCurve(w: any) {
  if (!w) return false
  const supportedSources = ['strava', 'intervals']
  return supportedSources.includes(w.source) && w.streams && (w.averageWatts || w.maxWatts)
}

function shouldShowPacing(w: any) {
  if (!w) return false
  const supportedSources = ['strava', 'intervals']
  return supportedSources.includes(w.source) && w.streams
}

function hasEfficiencyMetrics(w: any) {
  if (!w) return false
  return w.variabilityIndex !== null ||
         w.efficiencyFactor !== null ||
         w.decoupling !== null ||
         w.powerHrRatio !== null ||
         w.polarizationIndex !== null ||
         w.lrBalance !== null
}

function hasTrainingMetrics(w: any) {
  if (!w) return false
  return (w.tss !== null || w.trainingLoad !== null) &&
         (w.ctl !== null || w.atl !== null)
}

function calculateForm(w: any) {
  if (!w || w.ctl === null || w.atl === null) return null
  return Math.round(w.ctl - w.atl)
}

function getFormClass(form: number | null) {
  if (form === null) return 'bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500'
  
  if (form >= 25) return 'bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 text-blue-900 dark:text-blue-100'
  if (form >= 5) return 'bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 text-green-900 dark:text-green-100'
  if (form >= -10) return 'bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white'
  if (form >= -30) return 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-800 text-yellow-900 dark:text-yellow-100'
  return 'bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-900 dark:text-red-100'
}

// Available metrics computed property - only shows non-null values
const availableMetrics = computed(() => {
  if (!workout.value) return []
  
  const metrics: Array<{ key: string; label: string; value: string }> = []
  const w = workout.value
  
  // Power metrics
  if (w.averageWatts) metrics.push({ key: 'avgPower', label: 'Average Power', value: `${w.averageWatts}W` })
  if (w.maxWatts) metrics.push({ key: 'maxPower', label: 'Max Power', value: `${w.maxWatts}W` })
  if (w.normalizedPower) metrics.push({ key: 'np', label: 'Normalized Power', value: `${w.normalizedPower}W` })
  if (w.weightedAvgWatts) metrics.push({ key: 'wap', label: 'Weighted Avg Power', value: `${w.weightedAvgWatts}W` })
  
  // Heart rate metrics
  if (w.maxHr) metrics.push({ key: 'maxHr', label: 'Max HR', value: `${w.maxHr} bpm` })
  
  // Cadence metrics
  if (w.averageCadence) metrics.push({ key: 'avgCad', label: 'Average Cadence', value: `${w.averageCadence} rpm` })
  if (w.maxCadence) metrics.push({ key: 'maxCad', label: 'Max Cadence', value: `${w.maxCadence} rpm` })
  
  // Advanced metrics
  if (w.variabilityIndex) metrics.push({ key: 'vi', label: 'Variability Index', value: w.variabilityIndex.toFixed(3) })
  if (w.powerHrRatio) metrics.push({ key: 'phr', label: 'Power/HR Ratio', value: w.powerHrRatio.toFixed(2) })
  if (w.efficiencyFactor) metrics.push({ key: 'ef', label: 'Efficiency Factor', value: w.efficiencyFactor.toFixed(2) })
  if (w.decoupling) metrics.push({ key: 'dec', label: 'Decoupling', value: `${(w.decoupling * 100).toFixed(1)}%` })
  if (w.polarizationIndex) metrics.push({ key: 'pi', label: 'Polarization Index', value: w.polarizationIndex.toFixed(2) })
  if (w.lrBalance) metrics.push({ key: 'lr', label: 'L/R Balance', value: `${w.lrBalance.toFixed(1)}%` })
  
  // Training status
  if (w.ctl) metrics.push({ key: 'ctl', label: 'CTL (Fitness)', value: w.ctl.toFixed(1) })
  if (w.atl) metrics.push({ key: 'atl', label: 'ATL (Fatigue)', value: w.atl.toFixed(1) })
  if (w.ftp) metrics.push({ key: 'ftp', label: 'FTP at Time', value: `${w.ftp}W` })
  
  // Subjective metrics
  if (w.rpe) metrics.push({ key: 'rpe', label: 'RPE', value: `${w.rpe}/10` })
  if (w.sessionRpe) metrics.push({ key: 'srpe', label: 'Session RPE', value: `${w.sessionRpe}/10` })
  if (w.feel) metrics.push({ key: 'feel', label: 'Feel', value: `${w.feel}/10` })
  if (w.trimp) metrics.push({ key: 'trimp', label: 'TRIMP', value: `${w.trimp}` })
  
  // Environment
  if (w.avgTemp !== null && w.avgTemp !== undefined) metrics.push({ key: 'temp', label: 'Avg Temperature', value: `${w.avgTemp.toFixed(1)}°C` })
  if (w.trainer !== null && w.trainer !== undefined) metrics.push({ key: 'trainer', label: 'Indoor Trainer', value: w.trainer ? 'Yes' : 'No' })
  
  return metrics
})

// Fetch Data
async function fetchSharedWorkout() {
  loading.value = true
  error.value = null
  try {
    const data = await $fetch(`/api/share/workouts/${token}`)
    workout.value = data
    
    // Set meta tags for social sharing
    useHead({
      title: `${data.title} - Shared Workout | Coach Wattz`,
      meta: [
        { name: 'description', content: `Check out my workout on Coach Wattz: ${data.title} - ${formatDate(data.date)}` },
        { property: 'og:title', content: `${data.title} | Coach Wattz` },
        { property: 'og:description', content: `Check out my workout analysis on Coach Wattz` },
        { property: 'og:type', content: 'article' },
      ]
    })
  } catch (e: any) {
    error.value = e.data?.message || 'Failed to load workout. The link may be invalid or expired.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchSharedWorkout()
})
</script>
