<template>
  <UDashboardPanel id="workout-detail">
    <template #header>
      <UDashboardNavbar :title="workout ? `Workout: ${workout.title}` : 'Workout Details'">
        <template #leading>
          <UButton
            icon="i-heroicons-arrow-left"
            color="neutral"
            variant="ghost"
            to="/data"
          >
            Back to Data
          </UButton>
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <div class="flex gap-2 overflow-x-auto">
          <UButton
            variant="ghost"
            color="neutral"
            @click="scrollToSection('header')"
          >
            <UIcon name="i-lucide-file-text" class="w-4 h-4 mr-2" />
            Overview
          </UButton>
          <UButton
            v-if="workout?.overallScore || workout?.technicalScore"
            variant="ghost"
            color="neutral"
            @click="scrollToSection('scores')"
          >
            <UIcon name="i-lucide-award" class="w-4 h-4 mr-2" />
            Scores
          </UButton>
          <UButton
            variant="ghost"
            color="neutral"
            @click="scrollToSection('analysis')"
          >
            <UIcon name="i-lucide-sparkles" class="w-4 h-4 mr-2" />
            AI Analysis
          </UButton>
          <UButton
            v-if="shouldShowPacing(workout)"
            variant="ghost"
            color="neutral"
            @click="scrollToSection('pacing')"
          >
            <UIcon name="i-lucide-activity" class="w-4 h-4 mr-2" />
            Pacing
          </UButton>
          <UButton
            v-if="shouldShowPacing(workout)"
            variant="ghost"
            color="neutral"
            @click="scrollToSection('timeline')"
          >
            <UIcon name="i-lucide-chart-line" class="w-4 h-4 mr-2" />
            Timeline
          </UButton>
          <UButton
            variant="ghost"
            color="neutral"
            @click="scrollToSection('metrics')"
          >
            <UIcon name="i-lucide-bar-chart-3" class="w-4 h-4 mr-2" />
            Metrics
          </UButton>
        </div>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="p-6">
        <div v-if="loading" class="flex items-center justify-center py-12">
          <div class="text-center">
            <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
            <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">Loading workout...</p>
          </div>
        </div>

        <div v-else-if="error" class="text-center py-12">
          <div class="text-red-600 dark:text-red-400">
            <p class="text-lg font-semibold">{{ error }}</p>
          </div>
        </div>

        <div v-else-if="workout" class="space-y-6">
          <!-- Header Card -->
          <div id="header" class="scroll-mt-20"></div>
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div class="flex items-start justify-between mb-4">
              <div class="flex-1">
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
                  <div v-if="workout.distanceMeters" class="flex items-center gap-1">
                    <span class="i-heroicons-map-pin w-4 h-4"></span>
                    {{ formatDistance(workout.distanceMeters) }}
                  </div>
                </div>
              </div>
              <div>
                <span :class="getSourceBadgeClass(workout.source)">
                  {{ workout.source }}
                </span>
              </div>
            </div>

            <!-- Key Stats Grid -->
            <div class="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div v-if="workout.trainingLoad" class="rounded-lg p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <div class="text-xs text-blue-600 dark:text-blue-400 mb-1">Training Load</div>
                <div class="text-xl font-bold text-blue-900 dark:text-blue-100">{{ Math.round(workout.trainingLoad) }}</div>
              </div>
              <div v-if="workout.tss" class="rounded-lg p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                <div class="text-xs text-purple-600 dark:text-purple-400 mb-1">TSS</div>
                <div class="text-xl font-bold text-purple-900 dark:text-purple-100">{{ Math.round(workout.tss) }}</div>
              </div>
              <div v-if="workout.intensity" class="rounded-lg p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <div class="text-xs text-red-600 dark:text-red-400 mb-1">Intensity</div>
                <div class="text-xl font-bold text-red-900 dark:text-red-100">{{ workout.intensity.toFixed(2) }}</div>
              </div>
              <div v-if="workout.averageHr" class="rounded-lg p-3 bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800">
                <div class="text-xs text-pink-600 dark:text-pink-400 mb-1">Avg HR</div>
                <div class="text-xl font-bold text-pink-900 dark:text-pink-100">{{ workout.averageHr }} <span class="text-sm">bpm</span></div>
              </div>
              <div v-if="workout.averageWatts" class="rounded-lg p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
                <div class="text-xs text-yellow-600 dark:text-yellow-400 mb-1">Avg Power</div>
                <div class="text-xl font-bold text-yellow-900 dark:text-yellow-100">{{ workout.averageWatts }} <span class="text-sm">W</span></div>
              </div>
              <div v-if="workout.averageSpeed" class="rounded-lg p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <div class="text-xs text-green-600 dark:text-green-400 mb-1">Avg Speed</div>
                <div class="text-xl font-bold text-green-900 dark:text-green-100">{{ workout.averageSpeed.toFixed(1) }} <span class="text-sm">km/h</span></div>
              </div>
              <div v-if="workout.elevationGain" class="rounded-lg p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                <div class="text-xs text-indigo-600 dark:text-indigo-400 mb-1">Elevation</div>
                <div class="text-xl font-bold text-indigo-900 dark:text-indigo-100">{{ workout.elevationGain }} <span class="text-sm">m</span></div>
              </div>
              <div v-if="workout.kilojoules" class="rounded-lg p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
                <div class="text-xs text-orange-600 dark:text-orange-400 mb-1">Energy</div>
                <div class="text-xl font-bold text-orange-900 dark:text-orange-100">{{ Math.round(workout.kilojoules / 1000) }}k <span class="text-sm">kJ</span></div>
              </div>
            </div>

            <div v-if="workout.description" class="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{{ workout.description }}</p>
            </div>
          </div>

          <!-- Performance Scores Section -->
          <div id="scores" class="scroll-mt-20"></div>
          <div v-if="workout.overallScore || workout.technicalScore || workout.effortScore || workout.pacingScore || workout.executionScore" class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Performance Scores</h2>
            <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div v-if="workout.overallScore" class="text-center">
                <div :class="getScoreCircleClass(workout.overallScore)" class="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-2">
                  <span class="text-2xl font-bold">{{ workout.overallScore }}</span>
                </div>
                <div class="text-xs font-medium text-gray-600 dark:text-gray-400">Overall</div>
              </div>
              <div v-if="workout.technicalScore" class="text-center">
                <div :class="getScoreCircleClass(workout.technicalScore)" class="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-2">
                  <span class="text-2xl font-bold">{{ workout.technicalScore }}</span>
                </div>
                <div class="text-xs font-medium text-gray-600 dark:text-gray-400">Technical</div>
              </div>
              <div v-if="workout.effortScore" class="text-center">
                <div :class="getScoreCircleClass(workout.effortScore)" class="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-2">
                  <span class="text-2xl font-bold">{{ workout.effortScore }}</span>
                </div>
                <div class="text-xs font-medium text-gray-600 dark:text-gray-400">Effort</div>
              </div>
              <div v-if="workout.pacingScore" class="text-center">
                <div :class="getScoreCircleClass(workout.pacingScore)" class="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-2">
                  <span class="text-2xl font-bold">{{ workout.pacingScore }}</span>
                </div>
                <div class="text-xs font-medium text-gray-600 dark:text-gray-400">Pacing</div>
              </div>
              <div v-if="workout.executionScore" class="text-center">
                <div :class="getScoreCircleClass(workout.executionScore)" class="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-2">
                  <span class="text-2xl font-bold">{{ workout.executionScore }}</span>
                </div>
                <div class="text-xs font-medium text-gray-600 dark:text-gray-400">Execution</div>
              </div>
            </div>
          </div>

          <!-- Personal Notes Section -->
          <NotesEditor
            v-model="workout.notes"
            :notes-updated-at="workout.notesUpdatedAt"
            :api-endpoint="`/api/workouts/${workout.id}/notes`"
            @update:notesUpdatedAt="workout.notesUpdatedAt = $event"
          />

          <!-- AI Analysis Section -->
          <div id="analysis" class="scroll-mt-20"></div>
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-xl font-bold text-gray-900 dark:text-white">AI Workout Analysis</h2>
              <UButton
                v-if="!workout.aiAnalysis"
                icon="i-heroicons-sparkles"
                color="primary"
                :loading="analyzingWorkout"
                :disabled="analyzingWorkout"
                @click="analyzeWorkout"
              >
                {{ analyzingWorkout ? 'Analyzing...' : 'Analyze Workout' }}
              </UButton>
              <UButton
                v-else
                icon="i-heroicons-arrow-path"
                color="neutral"
                variant="ghost"
                :loading="analyzingWorkout"
                :disabled="analyzingWorkout"
                @click="analyzeWorkout"
                size="sm"
              >
                Re-analyze
              </UButton>
            </div>
            
            <!-- Structured Analysis Display -->
            <div v-if="workout.aiAnalysisJson" class="space-y-6">
              <!-- Executive Summary -->
              <div class="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
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

              <!-- Recommendations -->
              <div v-if="workout.aiAnalysisJson.recommendations && workout.aiAnalysisJson.recommendations.length > 0" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                  <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <span class="i-heroicons-clipboard-document-list w-5 h-5"></span>
                    Recommendations
                  </h3>
                </div>
                <div class="px-6 py-4 space-y-4">
                  <div
                    v-for="(rec, index) in workout.aiAnalysisJson.recommendations"
                    :key="index"
                    class="border-l-4 pl-4 py-2"
                    :class="getPriorityBorderClass(rec.priority)"
                  >
                    <div class="flex items-center gap-2 mb-1">
                      <h4 class="font-semibold text-gray-900 dark:text-white">{{ rec.title }}</h4>
                      <span v-if="rec.priority" :class="getPriorityBadgeClass(rec.priority)">
                        {{ rec.priority }}
                      </span>
                    </div>
                    <p class="text-sm text-gray-700 dark:text-gray-300">{{ rec.description }}</p>
                  </div>
                </div>
              </div>

              <!-- Strengths & Weaknesses -->
              <div v-if="workout.aiAnalysisJson.strengths || workout.aiAnalysisJson.weaknesses" class="grid grid-cols-1 md:grid-cols-2 gap-4">
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

              <!-- Timestamp -->
              <div v-if="workout.aiAnalyzedAt" class="text-xs text-gray-500 dark:text-gray-400 text-center pt-4 border-t border-gray-200 dark:border-gray-700">
                Analyzed on {{ formatDate(workout.aiAnalyzedAt) }}
              </div>
            </div>
            
            <!-- Fallback to Markdown if JSON not available -->
            <div v-else-if="workout.aiAnalysis" class="space-y-4">
              <div class="prose prose-sm dark:prose-invert max-w-none">
                <div v-html="renderedAnalysis" class="text-gray-700 dark:text-gray-300"></div>
              </div>
              <div v-if="workout.aiAnalyzedAt" class="text-xs text-gray-500 dark:text-gray-400 pt-4 border-t border-gray-200 dark:border-gray-700">
                Analyzed on {{ formatDate(workout.aiAnalyzedAt) }}
              </div>
            </div>
            
            <div v-else-if="!analyzingWorkout" class="text-center py-8">
              <div class="text-gray-500 dark:text-gray-400">
                <span class="i-heroicons-light-bulb w-12 h-12 mx-auto mb-4 opacity-50"></span>
                <p class="text-sm">Click "Analyze Workout" to get AI-powered insights on your performance, pacing, and technique.</p>
              </div>
            </div>

            <div v-else class="text-center py-8">
              <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mb-4"></div>
              <p class="text-sm text-gray-600 dark:text-gray-400">Generating analysis with AI...</p>
            </div>
          </div>

          <!-- Pacing Analysis Section (for Run/Ride/Walk/Hike activities) -->
          <div id="pacing" class="scroll-mt-20"></div>
          <div v-if="shouldShowPacing(workout)" class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Pacing Analysis</h2>
            <PacingAnalysis :workout-id="workout.id" />
          </div>

          <!-- Timeline Visualization (for Run/Ride/Walk/Hike activities) -->
          <div id="timeline" class="scroll-mt-20"></div>
          <div v-if="shouldShowPacing(workout)" class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Workout Timeline</h2>
            <WorkoutTimeline :workout-id="workout.id" />
          </div>

          <!-- Tabs for different data sections -->
          <div id="metrics" class="scroll-mt-20"></div>
          <UTabs :items="tabs" v-model="selectedTab" />
          
          <!-- Tab Content -->
          <div v-show="selectedTab === 0" class="py-4">
                <!-- All Metrics in Compact Grid -->
                <div v-if="availableMetrics.length > 0" class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
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
                
                <div v-else class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center text-gray-500 dark:text-gray-400">
                  <p class="text-sm">No additional metrics available for this workout</p>
                </div>
          </div>

         <!-- JSON Data Tab Content -->
          <div v-show="selectedTab === 1" class="py-4">
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                  <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Complete Workout Data (JSON)</h3>
                    <UButton
                      icon="i-heroicons-clipboard-document"
                      color="neutral"
                      variant="ghost"
                      @click="copyJsonToClipboard"
                    >
                      Copy JSON
                    </UButton>
                  </div>
                  <div class="p-6">
                    <pre class="text-sm text-gray-800 dark:text-gray-200 overflow-x-auto bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">{{ formattedJson }}</pre>
                  </div>
                </div>

                <div v-if="workout.rawJson" class="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                  <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Original Source Data (Raw JSON)</h3>
                    <UButton
                      icon="i-heroicons-clipboard-document"
                      color="neutral"
                      variant="ghost"
                      @click="copyRawJsonToClipboard"
                    >
                      Copy Raw JSON
                    </UButton>
                  </div>
                  <div class="p-6">
                    <pre class="text-sm text-gray-800 dark:text-gray-200 overflow-x-auto bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">{{ formattedRawJson }}</pre>
                  </div>
                </div>
         </div>
       </div>
     </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { marked } from 'marked'

definePageMeta({
  middleware: 'auth'
})

const route = useRoute()
const toast = useToast()

const workout = ref<any>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const analyzingWorkout = ref(false)
const tabs = [
  { label: 'Overview', slot: 'overview' },
  { label: 'JSON Data', slot: 'json' }
]

const selectedTab = ref(0)

// Rendered markdown analysis
const renderedAnalysis = computed(() => {
  if (!workout.value?.aiAnalysis) return ''
  return marked(workout.value.aiAnalysis)
})

// Available metrics computed property - only shows non-null values
const availableMetrics = computed(() => {
  if (!workout.value) return []
  
  const metrics: Array<{ key: string; label: string; value: string }> = []
  
  // Power metrics
  if (workout.value.averageWatts) metrics.push({ key: 'avgPower', label: 'Average Power', value: `${workout.value.averageWatts}W` })
  if (workout.value.maxWatts) metrics.push({ key: 'maxPower', label: 'Max Power', value: `${workout.value.maxWatts}W` })
  if (workout.value.normalizedPower) metrics.push({ key: 'np', label: 'Normalized Power', value: `${workout.value.normalizedPower}W` })
  if (workout.value.weightedAvgWatts) metrics.push({ key: 'wap', label: 'Weighted Avg Power', value: `${workout.value.weightedAvgWatts}W` })
  
  // Heart rate metrics
  if (workout.value.maxHr) metrics.push({ key: 'maxHr', label: 'Max HR', value: `${workout.value.maxHr} bpm` })
  
  // Cadence metrics
  if (workout.value.averageCadence) metrics.push({ key: 'avgCad', label: 'Average Cadence', value: `${workout.value.averageCadence} rpm` })
  if (workout.value.maxCadence) metrics.push({ key: 'maxCad', label: 'Max Cadence', value: `${workout.value.maxCadence} rpm` })
  
  // Advanced metrics
  if (workout.value.variabilityIndex) metrics.push({ key: 'vi', label: 'Variability Index', value: workout.value.variabilityIndex.toFixed(3) })
  if (workout.value.powerHrRatio) metrics.push({ key: 'phr', label: 'Power/HR Ratio', value: workout.value.powerHrRatio.toFixed(2) })
  if (workout.value.efficiencyFactor) metrics.push({ key: 'ef', label: 'Efficiency Factor', value: workout.value.efficiencyFactor.toFixed(2) })
  if (workout.value.decoupling) metrics.push({ key: 'dec', label: 'Decoupling', value: `${(workout.value.decoupling * 100).toFixed(1)}%` })
  if (workout.value.polarizationIndex) metrics.push({ key: 'pi', label: 'Polarization Index', value: workout.value.polarizationIndex.toFixed(2) })
  if (workout.value.lrBalance) metrics.push({ key: 'lr', label: 'L/R Balance', value: `${workout.value.lrBalance.toFixed(1)}%` })
  
  // Training status
  if (workout.value.ctl) metrics.push({ key: 'ctl', label: 'CTL (Fitness)', value: workout.value.ctl.toFixed(1) })
  if (workout.value.atl) metrics.push({ key: 'atl', label: 'ATL (Fatigue)', value: workout.value.atl.toFixed(1) })
  if (workout.value.ftp) metrics.push({ key: 'ftp', label: 'FTP at Time', value: `${workout.value.ftp}W` })
  
  // Subjective metrics
  if (workout.value.rpe) metrics.push({ key: 'rpe', label: 'RPE', value: `${workout.value.rpe}/10` })
  if (workout.value.sessionRpe) metrics.push({ key: 'srpe', label: 'Session RPE', value: `${workout.value.sessionRpe}/10` })
  if (workout.value.feel) metrics.push({ key: 'feel', label: 'Feel', value: `${workout.value.feel}/10` })
  if (workout.value.trimp) metrics.push({ key: 'trimp', label: 'TRIMP', value: `${workout.value.trimp}` })
  
  // Environment
  if (workout.value.avgTemp !== null && workout.value.avgTemp !== undefined) metrics.push({ key: 'temp', label: 'Avg Temperature', value: `${workout.value.avgTemp.toFixed(1)}°C` })
  if (workout.value.trainer !== null && workout.value.trainer !== undefined) metrics.push({ key: 'trainer', label: 'Indoor Trainer', value: workout.value.trainer ? 'Yes' : 'No' })
  
  return metrics
})

// Fetch workout data
async function fetchWorkout() {
  loading.value = true
  error.value = null
  try {
    const id = route.params.id
    workout.value = await $fetch(`/api/workouts/${id}`)
    // Ensure overview tab is selected after data loads
    await nextTick()
    selectedTab.value = 0
  } catch (e: any) {
    error.value = e.data?.message || e.message || 'Failed to load workout'
    console.error('Error fetching workout:', e)
  } finally {
    loading.value = false
  }
}

// Computed properties for JSON formatting
const formattedJson = computed(() => {
  if (!workout.value) return ''
  return JSON.stringify(workout.value, null, 2)
})

const formattedRawJson = computed(() => {
  if (!workout.value?.rawJson) return ''
  return JSON.stringify(workout.value.rawJson, null, 2)
})

// Polling interval reference
let pollingInterval: NodeJS.Timeout | null = null

// Analyze workout function
async function analyzeWorkout() {
  if (!workout.value) return
  
  analyzingWorkout.value = true
  try {
    const result = await $fetch(`/api/workouts/${workout.value.id}/analyze`, {
      method: 'POST'
    })
    
    // If already completed, update immediately
    if (result.status === 'COMPLETED' && 'analysis' in result && result.analysis) {
      workout.value.aiAnalysis = result.analysis
      workout.value.aiAnalyzedAt = result.analyzedAt
      workout.value.aiAnalysisStatus = 'COMPLETED'
      analyzingWorkout.value = false
      
      toast.add({
        title: 'Analysis Ready',
        description: 'Workout analysis already exists',
        color: 'success',
        icon: 'i-heroicons-check-circle'
      })
      return
    }
    
    // Update status
    workout.value.aiAnalysisStatus = result.status
    
    // Show processing message
    toast.add({
      title: 'Analysis Started',
      description: 'Your workout is being analyzed by AI. This may take a minute...',
      color: 'info',
      icon: 'i-heroicons-sparkles'
    })
    
    // Start polling for completion
    startPolling()
  } catch (e: any) {
    console.error('Error triggering workout analysis:', e)
    analyzingWorkout.value = false
    toast.add({
      title: 'Analysis Failed',
      description: e.data?.message || e.message || 'Failed to start workout analysis',
      color: 'error',
      icon: 'i-heroicons-exclamation-circle'
    })
  }
}

// Poll for analysis completion
function startPolling() {
  // Clear any existing polling
  if (pollingInterval) {
    clearInterval(pollingInterval)
  }
  
  // Poll every 3 seconds
  pollingInterval = setInterval(async () => {
    if (!workout.value) return
    
    try {
      const updated = await $fetch(`/api/workouts/${workout.value.id}`)
      
      // Update workout data
      workout.value.aiAnalysis = updated.aiAnalysis
      workout.value.aiAnalysisJson = (updated as any).aiAnalysisJson
      workout.value.aiAnalysisStatus = (updated as any).aiAnalysisStatus
      workout.value.aiAnalyzedAt = updated.aiAnalyzedAt
      
      // If completed or failed, stop polling
      if ((updated as any).aiAnalysisStatus === 'COMPLETED') {
        stopPolling()
        analyzingWorkout.value = false
        
        toast.add({
          title: 'Analysis Complete',
          description: 'AI workout analysis has been generated successfully',
          color: 'success',
          icon: 'i-heroicons-check-circle'
        })
      } else if ((updated as any).aiAnalysisStatus === 'FAILED') {
        stopPolling()
        analyzingWorkout.value = false
        
        toast.add({
          title: 'Analysis Failed',
          description: 'Failed to generate workout analysis. Please try again.',
          color: 'error',
          icon: 'i-heroicons-exclamation-circle'
        })
      }
    } catch (e) {
      console.error('Error polling workout status:', e)
    }
  }, 3000) // Poll every 3 seconds
}

function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval)
    pollingInterval = null
  }
}

// Copy functions
async function copyJsonToClipboard() {
  try {
    await navigator.clipboard.writeText(formattedJson.value)
    toast.add({
      title: 'Copied to clipboard',
      description: 'Workout JSON data copied successfully',
      color: 'success',
      icon: 'i-heroicons-check-circle'
    })
  } catch (e) {
    toast.add({
      title: 'Copy failed',
      description: 'Failed to copy to clipboard',
      color: 'error',
      icon: 'i-heroicons-exclamation-circle'
    })
  }
}

async function copyRawJsonToClipboard() {
  try {
    await navigator.clipboard.writeText(formattedRawJson.value)
    toast.add({
      title: 'Copied to clipboard',
      description: 'Raw JSON data copied successfully',
      color: 'success',
      icon: 'i-heroicons-check-circle'
    })
  } catch (e) {
    toast.add({
      title: 'Copy failed',
      description: 'Failed to copy to clipboard',
      color: 'error',
      icon: 'i-heroicons-exclamation-circle'
    })
  }
}

// Utility functions
function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`
  }
  return `${secs}s`
}

function formatDistance(meters: number) {
  const km = meters / 1000
  return `${km.toFixed(2)} km`
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

function getPriorityBadgeClass(priority: string) {
  const baseClass = 'px-2 py-0.5 rounded text-xs font-medium'
  if (priority === 'high') return `${baseClass} bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200`
  if (priority === 'medium') return `${baseClass} bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200`
  if (priority === 'low') return `${baseClass} bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200`
  return `${baseClass} bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200`
}

function getPriorityBorderClass(priority: string) {
  if (priority === 'high') return 'border-red-500'
  if (priority === 'medium') return 'border-yellow-500'
  if (priority === 'low') return 'border-blue-500'
  return 'border-gray-300'
}

function getScoreCircleClass(score: number) {
  if (score >= 8) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
  if (score >= 6) return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
  if (score >= 4) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
  return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
}

function shouldShowPacing(workout: any) {
  if (!workout) return false
  // Show for Strava and Intervals.icu workouts with supported activity types
  const supportedTypes = ['Run', 'Ride', 'VirtualRide', 'Walk', 'Hike']
  const supportedSources = ['strava', 'intervals']
  return supportedSources.includes(workout.source) && workout.type && supportedTypes.includes(workout.type)
}

// Scroll to section
function scrollToSection(sectionId: string) {
  const element = document.getElementById(sectionId)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

// Load data on mount
onMounted(() => {
  fetchWorkout()
})

// Cleanup on unmount
onUnmounted(() => {
  stopPolling()
})
</script>