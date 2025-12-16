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
            v-if="shouldShowPowerCurve(workout)"
            variant="ghost"
            color="neutral"
            @click="scrollToSection('power-curve')"
          >
            <UIcon name="i-lucide-zap" class="w-4 h-4 mr-2" />
            Power Curve
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
            v-if="shouldShowPacing(workout)"
            variant="ghost"
            color="neutral"
            @click="scrollToSection('zones')"
          >
            <UIcon name="i-lucide-layers" class="w-4 h-4 mr-2" />
            Zones
          </UButton>
          <UButton
            v-if="hasEfficiencyMetrics(workout)"
            variant="ghost"
            color="neutral"
            @click="scrollToSection('efficiency')"
          >
            <UIcon name="i-lucide-gauge" class="w-4 h-4 mr-2" />
            Efficiency
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
          <!-- Header Section: Workout Info (2/3) + Performance Scores (1/3) -->
          <div id="header" class="scroll-mt-20"></div>
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Workout Info Card - 2/3 -->
            <div class="lg:col-span-2">
              <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 h-full">
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
                    </div>
                  </div>
                  <div>
                    <span :class="getSourceBadgeClass(workout.source)">
                      {{ workout.source }}
                    </span>
                  </div>
                </div>

                <!-- Key Stats Grid -->
                <div class="mt-4 grid grid-cols-2 gap-3">
                  <div v-if="workout.trainingLoad" class="rounded-lg p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <div class="text-xs text-blue-600 dark:text-blue-400 mb-1">Training Load</div>
                    <div class="text-xl font-bold text-blue-900 dark:text-blue-100">{{ Math.round(workout.trainingLoad) }}</div>
                  </div>
                  <div v-if="workout.averageHr" class="rounded-lg p-3 bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800">
                    <div class="text-xs text-pink-600 dark:text-pink-400 mb-1">Avg HR</div>
                    <div class="text-xl font-bold text-pink-900 dark:text-pink-100">{{ workout.averageHr }} <span class="text-sm">bpm</span></div>
                  </div>
                </div>

                <div v-if="workout.description" class="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{{ workout.description }}</p>
                </div>
              </div>
            </div>

            <!-- Performance Scores Card - 1/3 -->
            <div id="scores" class="scroll-mt-20 lg:col-span-1">
              <div v-if="workout.overallScore || workout.technicalScore || workout.effortScore || workout.pacingScore || workout.executionScore" class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
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

          <!-- Power Curve Section (for activities with power data) -->
          <div id="power-curve" class="scroll-mt-20"></div>
          <div v-if="shouldShowPowerCurve(workout)" class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Power Duration Curve</h2>
            <PowerCurveChart :workout-id="workout.id" />
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

          <!-- Zone Distribution Visualization -->
          <div id="zones" class="scroll-mt-20"></div>
          <div v-if="shouldShowPacing(workout)" class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Training Zones</h2>
            <ZoneChart :workout-id="workout.id" />
          </div>

          <!-- Efficiency Metrics Section -->
          <div id="efficiency" class="scroll-mt-20"></div>
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

          <!-- Personal Notes Section -->
          <NotesEditor
            v-model="workout.notes"
            :notes-updated-at="workout.notesUpdatedAt"
            :api-endpoint="`/api/workouts/${workout.id}/notes`"
            @update:notesUpdatedAt="workout.notesUpdatedAt = $event"
          />

          <!-- Detailed Metrics Section -->
          <div id="metrics" class="scroll-mt-20"></div>
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

          <!-- Duplicate Workout Section -->
          <div id="duplicates" class="scroll-mt-20"></div>
          <div v-if="workout.isDuplicate || (workout.duplicates && workout.duplicates.length > 0)" class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Duplicate Management</h2>
            
            <!-- Case 1: This is a duplicate -->
            <div v-if="workout.isDuplicate" class="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <div class="flex items-start gap-3">
                <UIcon name="i-heroicons-information-circle" class="w-6 h-6 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
                <div>
                  <h3 class="font-semibold text-yellow-900 dark:text-yellow-100">This workout is a duplicate</h3>
                  <p class="text-sm text-yellow-800 dark:text-yellow-200 mt-1">
                    This workout has been identified as a duplicate of another activity.
                    The primary version is likely from a more preferred source.
                  </p>
                  
                  <div v-if="workout.canonicalWorkout" class="mt-4">
                    <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Original Workout:</p>
                    <NuxtLink
                      :to="`/workouts/${workout.canonicalWorkout.id}`"
                      class="block p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 hover:border-primary-500 dark:hover:border-primary-500 transition-colors"
                    >
                      <div class="flex items-center justify-between">
                        <div>
                          <div class="font-medium text-gray-900 dark:text-white">{{ workout.canonicalWorkout.title }}</div>
                          <div class="text-xs text-gray-500 mt-0.5">
                            {{ formatDate(workout.canonicalWorkout.date) }} • {{ workout.canonicalWorkout.source }}
                          </div>
                        </div>
                        <UIcon name="i-heroicons-arrow-right" class="w-4 h-4 text-gray-400" />
                      </div>
                    </NuxtLink>
                  </div>
                </div>
              </div>
            </div>

            <!-- Case 2: This is the original, but has duplicates -->
            <div v-else-if="workout.duplicates && workout.duplicates.length > 0">
               <div class="flex items-start gap-3 mb-4">
                <UIcon name="i-heroicons-document-duplicate" class="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <div>
                  <h3 class="font-semibold text-gray-900 dark:text-white">Linked Duplicates</h3>
                  <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    The following workouts have been merged into this one or identified as duplicates of this activity.
                  </p>
                </div>
              </div>
              
              <div class="space-y-2">
                <NuxtLink
                  v-for="dup in workout.duplicates"
                  :key="dup.id"
                  :to="`/workouts/${dup.id}`"
                  class="block p-3 bg-gray-50 dark:bg-gray-800/50 rounded border border-gray-200 dark:border-gray-700 hover:border-primary-500 dark:hover:border-primary-500 transition-colors"
                >
                  <div class="flex items-center justify-between">
                    <div>
                      <div class="font-medium text-gray-900 dark:text-white">{{ dup.title }}</div>
                      <div class="text-xs text-gray-500 mt-0.5">
                        {{ formatDate(dup.date) }} • {{ dup.source }}
                      </div>
                    </div>
                    <div class="flex items-center gap-2">
                      <UBadge color="yellow" variant="subtle" size="xs">Duplicate</UBadge>
                      <UIcon name="i-heroicons-arrow-right" class="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                </NuxtLink>
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
  } catch (e: any) {
    error.value = e.data?.message || e.message || 'Failed to load workout'
    console.error('Error fetching workout:', e)
  } finally {
    loading.value = false
  }
}

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

function shouldShowPowerCurve(workout: any) {
  if (!workout) return false
  // Show power curve if workout has power data (watts stream)
  const supportedSources = ['strava', 'intervals']
  return supportedSources.includes(workout.source) && workout.streams && (workout.averageWatts || workout.maxWatts)
}

function shouldShowPacing(workout: any) {
  if (!workout) return false
  // Show timeline if workout has stream data (time-series HR, power, velocity, etc.)
  // This includes any activity type with streams, not just runs/rides
  const supportedSources = ['strava', 'intervals']
  return supportedSources.includes(workout.source) && workout.streams
}

function hasEfficiencyMetrics(workout: any) {
  if (!workout) return false
  return workout.variabilityIndex !== null ||
         workout.efficiencyFactor !== null ||
         workout.decoupling !== null ||
         workout.powerHrRatio !== null ||
         workout.polarizationIndex !== null ||
         workout.lrBalance !== null
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