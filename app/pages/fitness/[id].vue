<template>
  <UDashboardPanel id="fitness-detail">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UButton icon="i-heroicons-arrow-left" color="neutral" variant="ghost" to="/fitness">
            <span class="hidden sm:inline">Back to Fitness</span>
            <span class="sm:hidden">Fitness</span>
          </UButton>
        </template>

        <template #right>
          <div class="flex gap-2">
            <ClientOnly>
              <DashboardTriggerMonitorButton />
            </ClientOnly>
            <UButton
              icon="i-heroicons-share"
              color="neutral"
              variant="outline"
              size="sm"
              class="font-bold"
              @click="isShareModalOpen = true"
            >
              <span class="hidden sm:inline">Share</span>
            </UButton>
            <UButton
              icon="i-heroicons-chat-bubble-left-right"
              color="primary"
              variant="solid"
              size="sm"
              class="font-bold"
              @click="chatAboutWellness"
            >
              <span class="hidden sm:inline">Chat about this day</span>
              <span class="sm:hidden">Chat</span>
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-6">
        <div v-if="loading" class="flex items-center justify-center py-12">
          <div class="text-center">
            <div
              class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"
            />
            <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">Loading wellness data...</p>
          </div>
        </div>

        <div v-else-if="error" class="text-center py-12">
          <div class="text-red-600 dark:text-red-400">
            <p class="text-lg font-semibold">{{ error }}</p>
          </div>
        </div>

        <div v-else-if="wellness" class="space-y-6">
          <!-- Header Card -->
          <div
            class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4"
          >
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
                  <UIcon name="i-heroicons-calendar" class="w-4 h-4" />
                  {{ formatDate(wellness.date) }}
                </div>
                <h1 class="text-xl font-bold text-gray-900 dark:text-white">Daily Wellness</h1>
              </div>

              <!-- Quick Stats Summary -->
              <div class="flex items-center gap-4 sm:gap-8 overflow-x-auto pb-1 sm:pb-0">
                <div v-if="wellness.recoveryScore" class="flex flex-col items-end">
                  <span class="text-[10px] font-bold text-gray-500 uppercase tracking-widest"
                    >Recovery</span
                  >
                  <span class="text-xl font-bold" :class="getScoreColor(wellness.recoveryScore)"
                    >{{ wellness.recoveryScore }}%</span
                  >
                </div>
                <div v-if="wellness.readiness" class="flex flex-col items-end">
                  <span class="text-[10px] font-bold text-gray-500 uppercase tracking-widest"
                    >Readiness</span
                  >
                  <span class="text-xl font-bold text-blue-600 dark:text-blue-400">{{
                    wellness.readiness
                  }}</span>
                </div>
                <div v-if="wellness.sleepHours" class="flex flex-col items-end">
                  <span class="text-[10px] font-bold text-gray-500 uppercase tracking-widest"
                    >Sleep</span
                  >
                  <span class="text-xl font-bold text-indigo-600 dark:text-indigo-400"
                    >{{ wellness.sleepHours.toFixed(1) }}h</span
                  >
                </div>
                <div v-if="wellness.hrv" class="flex flex-col items-end">
                  <span class="text-[10px] font-bold text-gray-500 uppercase tracking-widest"
                    >HRV (rMSSD)</span
                  >
                  <span class="text-xl font-bold text-purple-600 dark:text-purple-400">{{
                    Math.round(wellness.hrv)
                  }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Key Metrics Grid -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div
              v-if="wellness.recoveryScore"
              class="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/30 rounded-lg p-6 shadow relative overflow-hidden group"
            >
              <div class="flex items-center justify-between mb-2">
                <span class="i-heroicons-heart w-6 h-6 text-green-600 dark:text-green-400" />
                <span
                  v-if="getTrend('recoveryScore')"
                  :class="getTrend('recoveryScore')?.class"
                  class="text-xs font-medium flex items-center px-2 py-1 rounded-full"
                >
                  <UIcon :name="getTrend('recoveryScore')!.icon" class="w-3 h-3 mr-1" />
                  {{ getTrend('recoveryScore')?.text }}
                </span>
              </div>
              <div class="text-3xl font-bold text-green-900 dark:text-green-100">
                {{ wellness.recoveryScore }}%
              </div>
              <div class="text-sm text-green-700 dark:text-green-300 mt-1">Recovery Score</div>
              <!-- Mini Chart -->
              <div
                v-if="wellness.trends?.recoveryScore?.history"
                class="absolute bottom-0 left-0 right-0 h-8 flex items-end justify-between px-1 gap-0.5 opacity-30 group-hover:opacity-60 transition-opacity"
              >
                <div
                  v-for="(day, idx) in wellness.trends.recoveryScore.history"
                  :key="idx"
                  class="flex-1 bg-green-500 rounded-t-sm"
                  :style="{ height: day.value ? `${day.value}%` : '2px' }"
                />
              </div>
            </div>

            <div
              v-if="wellness.readiness"
              class="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/30 rounded-lg p-6 shadow relative overflow-hidden group"
            >
              <div class="flex items-center justify-between mb-2">
                <span class="i-heroicons-bolt w-6 h-6 text-blue-600 dark:text-blue-400" />
                <span
                  v-if="getTrend('readiness')"
                  :class="getTrend('readiness')?.class"
                  class="text-xs font-medium flex items-center px-2 py-1 rounded-full"
                >
                  <UIcon :name="getTrend('readiness')!.icon" class="w-3 h-3 mr-1" />
                  {{ getTrend('readiness')?.text }}
                </span>
              </div>
              <div class="text-3xl font-bold text-blue-900 dark:text-blue-100">
                {{ wellness.readiness }}{{ wellness.readiness > 10 ? '%' : '/10' }}
              </div>
              <div class="text-sm text-blue-700 dark:text-blue-300 mt-1">Readiness</div>
              <!-- Mini Chart -->
              <div
                v-if="wellness.trends?.readiness?.history"
                class="absolute bottom-0 left-0 right-0 h-8 flex items-end justify-between px-1 gap-0.5 opacity-30 group-hover:opacity-60 transition-opacity"
              >
                <div
                  v-for="(day, idx) in wellness.trends.readiness.history"
                  :key="idx"
                  class="flex-1 bg-blue-500 rounded-t-sm"
                  :style="{
                    height: day.value ? `${day.value > 10 ? day.value : day.value * 10}%` : '2px'
                  }"
                />
              </div>
            </div>

            <div
              v-if="wellness.sleepHours"
              class="bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/20 dark:to-indigo-800/30 rounded-lg p-6 shadow relative overflow-hidden group"
            >
              <div class="flex items-center justify-between mb-2">
                <span class="i-heroicons-moon w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                <span
                  v-if="getTrend('sleepHours')"
                  :class="getTrend('sleepHours')?.class"
                  class="text-xs font-medium flex items-center px-2 py-1 rounded-full"
                >
                  <UIcon :name="getTrend('sleepHours')!.icon" class="w-3 h-3 mr-1" />
                  {{ getTrend('sleepHours')?.text }}
                </span>
              </div>
              <div class="text-3xl font-bold text-indigo-900 dark:text-indigo-100">
                {{ wellness.sleepHours.toFixed(1) }}h
              </div>
              <div class="text-sm text-indigo-700 dark:text-indigo-300 mt-1">Sleep Duration</div>
              <!-- Mini Chart -->
              <div
                v-if="wellness.trends?.sleepHours?.history"
                class="absolute bottom-0 left-0 right-0 h-8 flex items-end justify-between px-1 gap-0.5 opacity-30 group-hover:opacity-60 transition-opacity"
              >
                <div
                  v-for="(day, idx) in wellness.trends.sleepHours.history"
                  :key="idx"
                  class="flex-1 bg-indigo-500 rounded-t-sm"
                  :style="{ height: day.value ? `${(day.value / 12) * 100}%` : '2px' }"
                />
              </div>
            </div>

            <div
              v-if="wellness.hrv"
              class="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/30 rounded-lg p-6 shadow relative overflow-hidden group"
            >
              <div class="flex items-center justify-between mb-2">
                <span
                  class="i-heroicons-heart-pulse w-6 h-6 text-purple-600 dark:text-purple-400"
                />
                <span
                  v-if="getTrend('hrv')"
                  :class="getTrend('hrv')?.class"
                  class="text-xs font-medium flex items-center px-2 py-1 rounded-full"
                >
                  <UIcon :name="getTrend('hrv')!.icon" class="w-3 h-3 mr-1" />
                  {{ getTrend('hrv')?.text }}
                </span>
              </div>
              <div class="text-3xl font-bold text-purple-900 dark:text-purple-100">
                {{ Math.round(wellness.hrv) }}
              </div>
              <div class="text-sm text-purple-700 dark:text-purple-300 mt-1">HRV (rMSSD)</div>
              <!-- Mini Chart -->
              <div
                v-if="wellness.trends?.hrv?.history"
                class="absolute bottom-0 left-0 right-0 h-8 flex items-end justify-between px-1 gap-0.5 opacity-30 group-hover:opacity-60 transition-opacity"
              >
                <div
                  v-for="(day, idx) in wellness.trends.hrv.history"
                  :key="idx"
                  class="flex-1 bg-purple-500 rounded-t-sm"
                  :style="{
                    height: day.value ? `${Math.min((day.value / 150) * 100, 100)}%` : '2px'
                  }"
                />
              </div>
            </div>
          </div>

          <!-- AI Analysis Section -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-xl font-bold text-gray-900 dark:text-white">AI Wellness Analysis</h2>
              <UButton
                v-if="!wellness.aiAnalysisJson && wellness.aiAnalysisStatus !== 'PROCESSING'"
                icon="i-heroicons-sparkles"
                color="primary"
                variant="solid"
                size="sm"
                class="font-bold"
                :loading="analyzingWellness"
                :disabled="analyzingWellness"
                @click="analyzeWellness"
              >
                Analyze
              </UButton>
              <UButton
                v-else-if="wellness.aiAnalysisStatus !== 'PROCESSING'"
                icon="i-heroicons-arrow-path"
                color="neutral"
                variant="ghost"
                size="sm"
                class="font-bold"
                :loading="analyzingWellness"
                :disabled="analyzingWellness"
                @click="analyzeWellness"
              >
                Re-analyze
              </UButton>
            </div>

            <!-- Structured Analysis Display -->
            <div v-if="wellness.aiAnalysisJson" class="space-y-6">
              <!-- Executive Summary -->
              <div
                class="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800"
              >
                <div class="flex items-start justify-between mb-2">
                  <h3
                    class="text-base font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-2"
                  >
                    <span class="i-heroicons-light-bulb w-5 h-5" />
                    Quick Take
                  </h3>
                  <span
                    v-if="wellness.aiAnalysisJson.status"
                    :class="getStatusBadgeClass(wellness.aiAnalysisJson.status)"
                  >
                    {{ formatStatus(wellness.aiAnalysisJson.status) }}
                  </span>
                </div>
                <p class="text-base text-gray-800 dark:text-gray-200 leading-relaxed">
                  {{ wellness.aiAnalysisJson.executive_summary }}
                </p>
              </div>

              <!-- Recommendations -->
              <div
                v-if="
                  wellness.aiAnalysisJson.recommendations &&
                  wellness.aiAnalysisJson.recommendations.length > 0
                "
                class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
              >
                <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                  <h3
                    class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2"
                  >
                    <span class="i-heroicons-clipboard-document-list w-5 h-5" />
                    Recommendations
                  </h3>
                </div>
                <div class="px-6 py-4 space-y-4">
                  <div
                    v-for="(rec, index) in wellness.aiAnalysisJson.recommendations"
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

              <!-- Detailed Sections -->
              <div
                v-if="wellness.aiAnalysisJson.sections"
                class="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                <div
                  v-for="(section, index) in wellness.aiAnalysisJson.sections"
                  :key="index"
                  class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
                >
                  <div
                    class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between"
                  >
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                      {{ section.title }}
                    </h3>
                    <span :class="getStatusBadgeClass(section.status)">
                      {{ formatStatus(section.status) }}
                    </span>
                  </div>
                  <div class="px-6 py-4">
                    <ul class="space-y-2">
                      <li
                        v-for="(point, pIndex) in section.analysis_points"
                        :key="pIndex"
                        class="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
                      >
                        <span
                          class="i-heroicons-chevron-right w-4 h-4 mt-0.5 text-primary-500 flex-shrink-0"
                        />
                        <span>{{ point }}</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <!-- Timestamp -->
              <div
                v-if="wellness.aiAnalyzedAt"
                class="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700"
              >
                <div class="text-xs text-gray-500 dark:text-gray-400">
                  Analyzed on {{ formatDate(wellness.aiAnalyzedAt) }}
                </div>
                <AiFeedback
                  v-if="wellness.llmUsageId"
                  :llm-usage-id="wellness.llmUsageId"
                  :initial-feedback="wellness.feedback"
                  :initial-feedback-text="wellness.feedbackText"
                />
              </div>
            </div>

            <div
              v-else-if="!analyzingWellness && wellness.aiAnalysisStatus !== 'PROCESSING'"
              class="text-center py-8"
            >
              <div class="text-gray-500 dark:text-gray-400">
                <span class="i-heroicons-light-bulb w-12 h-12 mx-auto mb-4 opacity-50" />
                <p class="text-sm">
                  Click "Analyze" to get AI-powered insights on your recovery and readiness.
                </p>
              </div>
            </div>

            <div v-else class="text-center py-8">
              <div
                class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mb-4"
              />
              <p class="text-sm text-gray-600 dark:text-gray-400">Generating analysis with AI...</p>
            </div>
          </div>

          <!-- Heart Rate Metrics -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Heart Rate Metrics</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                v-if="wellness.restingHr"
                class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700 relative group/row"
              >
                <span class="text-sm text-gray-600 dark:text-gray-400">Resting Heart Rate</span>
                <div class="flex flex-col items-end gap-1">
                  <div class="flex items-center gap-2">
                    <span
                      v-if="getTrend('restingHr', true)"
                      :class="getTrend('restingHr', true)?.class"
                      class="text-xs font-medium flex items-center px-1.5 py-0.5 rounded"
                    >
                      <UIcon :name="getTrend('restingHr', true)!.icon" class="w-3 h-3 mr-1" />
                      {{ getTrend('restingHr', true)?.text }}
                    </span>
                    <span class="text-sm font-medium text-gray-900 dark:text-white"
                      >{{ wellness.restingHr }} bpm</span
                    >
                  </div>
                  <!-- Mini Sparkline for Row -->
                  <div
                    v-if="wellness.trends?.restingHr?.history"
                    class="h-4 flex items-end gap-0.5 opacity-20 group-hover/row:opacity-50 transition-opacity"
                  >
                    <div
                      v-for="(day, idx) in wellness.trends.restingHr.history.slice(-7)"
                      :key="idx"
                      class="w-1 bg-rose-500 rounded-t-[1px]"
                      :style="{
                        height: day.value ? `${Math.min((day.value / 100) * 100, 100)}%` : '2px'
                      }"
                    />
                  </div>
                </div>
              </div>
              <div
                v-if="wellness.avgSleepingHr"
                class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
              >
                <span class="text-sm text-gray-600 dark:text-gray-400">Avg Sleeping HR</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white"
                  >{{ wellness.avgSleepingHr }} bpm</span
                >
              </div>
              <div
                v-if="wellness.hrv"
                class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
              >
                <span class="text-sm text-gray-600 dark:text-gray-400">HRV (rMSSD)</span>
                <div class="flex items-center gap-2">
                  <span
                    v-if="getTrend('hrv')"
                    :class="getTrend('hrv')?.class"
                    class="text-xs font-medium flex items-center px-1.5 py-0.5 rounded"
                  >
                    <UIcon :name="getTrend('hrv')!.icon" class="w-3 h-3 mr-1" />
                    {{ getTrend('hrv')?.text }}
                  </span>
                  <span class="text-sm font-medium text-gray-900 dark:text-white"
                    >{{ Math.round(wellness.hrv) }} ms</span
                  >
                </div>
              </div>
              <div
                v-if="wellness.hrvSdnn"
                class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
              >
                <span class="text-sm text-gray-600 dark:text-gray-400">HRV SDNN</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white"
                  >{{ Math.round(wellness.hrvSdnn) }} ms</span
                >
              </div>
            </div>
          </div>

          <!-- Sleep Metrics -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Sleep Quality</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                v-if="wellness.sleepHours"
                class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
              >
                <span class="text-sm text-gray-600 dark:text-gray-400">Sleep Duration</span>
                <div class="flex items-center gap-2">
                  <span
                    v-if="getTrend('sleepHours')"
                    :class="getTrend('sleepHours')?.class"
                    class="text-xs font-medium flex items-center px-1.5 py-0.5 rounded"
                  >
                    <UIcon :name="getTrend('sleepHours')!.icon" class="w-3 h-3 mr-1" />
                    {{ getTrend('sleepHours')?.text }}
                  </span>
                  <span class="text-sm font-medium text-gray-900 dark:text-white"
                    >{{ wellness.sleepHours.toFixed(1) }} hours</span
                  >
                </div>
              </div>
              <div
                v-if="wellness.sleepScore"
                class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
              >
                <span class="text-sm text-gray-600 dark:text-gray-400">Sleep Score</span>
                <div class="flex items-center gap-2">
                  <span
                    v-if="getTrend('sleepScore')"
                    :class="getTrend('sleepScore')?.class"
                    class="text-xs font-medium flex items-center px-1.5 py-0.5 rounded"
                  >
                    <UIcon :name="getTrend('sleepScore')!.icon" class="w-3 h-3 mr-1" />
                    {{ getTrend('sleepScore')?.text }}
                  </span>
                  <span class="text-sm font-medium text-gray-900 dark:text-white"
                    >{{ wellness.sleepScore }}%</span
                  >
                </div>
              </div>
              <div
                v-if="wellness.sleepQuality"
                class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
              >
                <span class="text-sm text-gray-600 dark:text-gray-400">Sleep Quality</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white"
                  >{{ wellness.sleepQuality }}/10</span
                >
              </div>
            </div>
          </div>

          <!-- Deep Sleep Analysis -->
          <div v-if="sleepData" class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <SleepAnalysis :sleep="sleepData" />
          </div>

          <!-- Subjective Wellness -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Subjective Wellness
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                v-if="wellness.soreness"
                class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
              >
                <span class="text-sm text-gray-600 dark:text-gray-400">Muscle Soreness</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white"
                  >{{ wellness.soreness }}/10</span
                >
              </div>
              <div
                v-if="wellness.fatigue"
                class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
              >
                <span class="text-sm text-gray-600 dark:text-gray-400">Fatigue</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white"
                  >{{ wellness.fatigue }}/10</span
                >
              </div>
              <div
                v-if="wellness.stress"
                class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
              >
                <span class="text-sm text-gray-600 dark:text-gray-400">Stress</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white"
                  >{{ wellness.stress }}/10</span
                >
              </div>
              <div
                v-if="wellness.mood"
                class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
              >
                <span class="text-sm text-gray-600 dark:text-gray-400">Mood</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white"
                  >{{ wellness.mood }}/10</span
                >
              </div>
              <div
                v-if="wellness.motivation"
                class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
              >
                <span class="text-sm text-gray-600 dark:text-gray-400">Motivation</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white"
                  >{{ wellness.motivation }}/10</span
                >
              </div>
            </div>
          </div>

          <!-- Training Load -->
          <div
            v-if="wellness.ctl || wellness.atl"
            class="bg-white dark:bg-gray-800 rounded-lg shadow p-6"
          >
            <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Training Load</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                v-if="wellness.ctl"
                class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
              >
                <span class="text-sm text-gray-600 dark:text-gray-400">CTL (Fitness)</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white">{{
                  wellness.ctl.toFixed(1)
                }}</span>
              </div>
              <div
                v-if="wellness.atl"
                class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
              >
                <span class="text-sm text-gray-600 dark:text-gray-400">ATL (Fatigue)</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white">{{
                  wellness.atl.toFixed(1)
                }}</span>
              </div>
            </div>
          </div>

          <!-- Physical Metrics -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Physical Metrics</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                v-if="wellness.weight"
                class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
              >
                <span class="text-sm text-gray-600 dark:text-gray-400">Weight</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white"
                  >{{ wellness.weight.toFixed(2) }} kg</span
                >
              </div>
              <div
                v-if="wellness.bodyFat"
                class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
              >
                <span class="text-sm text-gray-600 dark:text-gray-400">Body Fat</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white"
                  >{{ wellness.bodyFat.toFixed(1) }}%</span
                >
              </div>
              <div
                v-if="wellness.abdomen"
                class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
              >
                <span class="text-sm text-gray-600 dark:text-gray-400"
                  >Abdominal Circumference</span
                >
                <span class="text-sm font-medium text-gray-900 dark:text-white"
                  >{{ wellness.abdomen }} cm</span
                >
              </div>
              <div
                v-if="wellness.vo2max"
                class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
              >
                <span class="text-sm text-gray-600 dark:text-gray-400">VO2 Max</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white"
                  >{{ wellness.vo2max.toFixed(1) }} ml/kg/min</span
                >
              </div>
            </div>
          </div>

          <!-- Vitals & Health -->
          <div
            v-if="
              wellness.spO2 ||
              wellness.restingHr ||
              wellness.bloodGlucose ||
              wellness.hydration ||
              wellness.respiration ||
              wellness.systolic ||
              wellness.lactate
            "
            class="bg-white dark:bg-gray-800 rounded-lg shadow p-6"
          >
            <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Vitals & Health</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                v-if="wellness.spO2"
                class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
              >
                <span class="text-sm text-gray-600 dark:text-gray-400">Blood Oxygen (SpO2)</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white"
                  >{{ wellness.spO2.toFixed(1) }}%</span
                >
              </div>
              <div
                v-if="wellness.respiration"
                class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
              >
                <span class="text-sm text-gray-600 dark:text-gray-400">Respiration Rate</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white"
                  >{{ wellness.respiration.toFixed(1) }} br/min</span
                >
              </div>
              <div
                v-if="wellness.bloodGlucose"
                class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
              >
                <span class="text-sm text-gray-600 dark:text-gray-400">Blood Glucose</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white"
                  >{{ wellness.bloodGlucose }} mmol/L</span
                >
              </div>
              <div
                v-if="wellness.lactate"
                class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
              >
                <span class="text-sm text-gray-600 dark:text-gray-400">Blood Lactate</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white"
                  >{{ wellness.lactate }} mmol/L</span
                >
              </div>
              <div
                v-if="wellness.systolic && wellness.diastolic"
                class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
              >
                <span class="text-sm text-gray-600 dark:text-gray-400">Blood Pressure</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white"
                  >{{ wellness.systolic }}/{{ wellness.diastolic }} mmHg</span
                >
              </div>
              <div
                v-if="wellness.hydration"
                class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
              >
                <span class="text-sm text-gray-600 dark:text-gray-400">Hydration Status</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white">{{
                  wellness.hydration
                }}</span>
              </div>
              <div
                v-if="wellness.hydrationVolume"
                class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
              >
                <span class="text-sm text-gray-600 dark:text-gray-400">Water Intake</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white"
                  >{{ wellness.hydrationVolume }} L</span
                >
              </div>
              <div
                v-if="wellness.skinTemp"
                class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
              >
                <span class="text-sm text-gray-600 dark:text-gray-400">Skin Temperature</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white"
                  >{{ wellness.skinTemp.toFixed(1) }}°C</span
                >
              </div>
              <div
                v-if="wellness.injury"
                class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
              >
                <span class="text-sm text-gray-600 dark:text-gray-400">Injury Status</span>
                <span class="text-sm font-medium text-red-600 dark:text-red-400">{{
                  wellness.injury
                }}</span>
              </div>
              <div
                v-if="wellness.menstrualPhase"
                class="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"
              >
                <span class="text-sm text-gray-600 dark:text-gray-400">Cycle Phase</span>
                <span class="text-sm font-medium text-purple-600 dark:text-purple-400">{{
                  wellness.menstrualPhase
                }}</span>
              </div>
            </div>
          </div>

          <!-- Notes -->
          <div v-if="wellness.comments" class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Notes</h2>
            <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {{ wellness.comments }}
              </p>
            </div>
          </div>

          <!-- JSON Data -->
          <div
            v-if="wellness.rawJson"
            class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden"
          >
            <button
              class="w-full px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              @click="showRawJson = !showRawJson"
            >
              <h3
                class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2"
              >
                <span
                  :class="showRawJson ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                  class="w-5 h-5"
                />
                Raw Data (JSON)
              </h3>
              <div class="flex items-center gap-2" @click.stop>
                <UButton
                  icon="i-heroicons-clipboard-document"
                  color="neutral"
                  variant="ghost"
                  @click="copyJsonToClipboard"
                >
                  Copy JSON
                </UButton>
              </div>
            </button>
            <div v-if="showRawJson" class="p-6">
              <pre
                class="text-sm text-gray-800 dark:text-gray-200 overflow-x-auto bg-gray-50 dark:bg-gray-900 p-4 rounded-lg"
                >{{ formattedRawJson }}</pre
              >
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Share Modal -->
  <UModal
    v-model:open="isShareModalOpen"
    title="Share Wellness Data"
    description="Anyone with this link can view this wellness data. The link will expire in 30 days."
  >
    <template #body>
      <div class="space-y-4">
        <div v-if="generatingShareLink" class="flex items-center justify-center py-8">
          <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary" />
        </div>
        <div v-else-if="shareLink" class="space-y-4">
          <div class="flex gap-2">
            <UInput v-model="shareLink" readonly class="flex-1" />
            <UButton
              icon="i-heroicons-clipboard"
              color="neutral"
              variant="outline"
              @click="copyToClipboard"
            >
              Copy
            </UButton>
          </div>
          <p class="text-xs text-gray-500">
            This link provides read-only access to this specific wellness record.
          </p>
        </div>
        <div v-else class="flex flex-col items-center justify-center py-8 text-center">
          <UIcon name="i-heroicons-link" class="w-8 h-8 text-gray-400 mb-2" />
          <p class="text-gray-600 mb-4">Click below to generate a shareable link.</p>
          <UButton color="primary" :loading="generatingShareLink" @click="generateShareLink">
            Generate Link
          </UButton>
        </div>
      </div>
    </template>
    <template #footer>
      <UButton label="Close" color="neutral" variant="ghost" @click="isShareModalOpen = false" />
    </template>
  </UModal>
</template>

<script setup lang="ts">
  import { marked } from 'marked'
  import SleepAnalysis from '~/components/fitness/SleepAnalysis.vue'

  definePageMeta({
    middleware: 'auth'
  })

  const route = useRoute()
  const toast = useToast()
  const wellness = ref<any>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)
  const showRawJson = ref(false)

  // Feature states
  const analyzingWellness = ref(false)
  const isShareModalOpen = ref(false)
  const shareLink = ref('')
  const generatingShareLink = ref(false)

  // Polling reference
  const pollingInterval: NodeJS.Timeout | null = null

  const { refresh: refreshRuns } = useUserRuns()

  // Computed
  const sleepData = computed(() => {
    return wellness.value?.rawJson?.sleep || null
  })

  // Fetch wellness data
  async function fetchWellness() {
    loading.value = true
    error.value = null

    try {
      const id = route.params.id as string
      wellness.value = await $fetch(`/api/wellness/${id}`)
    } catch (e: any) {
      console.error('Error fetching wellness:', e)
      error.value = e.data?.message || e.message || 'Failed to load wellness data'
    } finally {
      loading.value = false
    }
  }

  // Share functionality
  const generateShareLink = async () => {
    if (!wellness.value?.id) return

    generatingShareLink.value = true
    try {
      const response = await $fetch('/api/share/generate', {
        method: 'POST',
        body: {
          resourceType: 'WELLNESS',
          resourceId: wellness.value.id
        }
      })
      shareLink.value = response.url
    } catch (error) {
      console.error('Failed to generate share link:', error)
      toast.add({
        title: 'Error',
        description: 'Failed to generate share link. Please try again.',
        color: 'error'
      })
    } finally {
      generatingShareLink.value = false
    }
  }

  const copyToClipboard = () => {
    if (!shareLink.value) return

    navigator.clipboard.writeText(shareLink.value)
    toast.add({
      title: 'Copied',
      description: 'Share link copied to clipboard.',
      color: 'success'
    })
  }

  // Chat functionality
  function chatAboutWellness() {
    if (!wellness.value) return
    navigateTo({
      path: '/chat',
      query: { wellnessId: wellness.value.id }
    })
  }

  // AI Analysis functionality
  async function analyzeWellness() {
    if (!wellness.value) return

    analyzingWellness.value = true
    try {
      const result = (await $fetch(`/api/wellness/${wellness.value.id}/analyze`, {
        method: 'POST'
      })) as any

      // If already completed, update immediately
      if (result.status === 'COMPLETED' && result.analysis) {
        wellness.value.aiAnalysisJson = result.analysis
        wellness.value.aiAnalyzedAt = result.analyzedAt
        wellness.value.aiAnalysisStatus = 'COMPLETED'
        wellness.value.llmUsageId = result.llmUsageId
        wellness.value.feedback = result.feedback
        wellness.value.feedbackText = result.feedbackText
        analyzingWellness.value = false

        toast.add({
          title: 'Analysis Ready',
          description: 'Wellness analysis is ready',
          color: 'success',
          icon: 'i-heroicons-check-circle'
        })
        return
      }

      // Update status and start polling
      wellness.value.aiAnalysisStatus = result.status || 'PROCESSING'
      refreshRuns()

      toast.add({
        title: 'Analysis Started',
        description: 'AI is analyzing your wellness data...',
        color: 'info',
        icon: 'i-heroicons-sparkles'
      })
    } catch (e: any) {
      console.error('Error triggering wellness analysis:', e)
      analyzingWellness.value = false
      toast.add({
        title: 'Analysis Failed',
        description: e.data?.message || 'Failed to start analysis',
        color: 'error',
        icon: 'i-heroicons-exclamation-circle'
      })
    }
  }

  // Utility functions
  function formatDate(date: string | Date) {
    // Parse date in UTC to avoid timezone conversion issues
    // Database stores dates as YYYY-MM-DD (date-only, no time component)
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC' // Force UTC to prevent timezone shifts
    })
  }

  function formatStatus(status: string) {
    if (!status) return ''
    return status.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
  }

  function getStatusBadgeClass(status: string) {
    const baseClass = 'px-2 py-0.5 rounded text-xs font-medium'
    if (status === 'optimal')
      return `${baseClass} bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200`
    if (status === 'good')
      return `${baseClass} bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200`
    if (status === 'caution')
      return `${baseClass} bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200`
    if (status === 'attention' || status === 'rest_required')
      return `${baseClass} bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200`
    return `${baseClass} bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200`
  }

  function getPriorityBorderClass(priority: string) {
    if (priority === 'high') return 'border-red-500'
    if (priority === 'medium') return 'border-yellow-500'
    if (priority === 'low') return 'border-blue-500'
    return 'border-gray-300'
  }

  function getPriorityBadgeClass(priority: string) {
    const baseClass = 'px-2 py-0.5 rounded text-xs font-medium'
    if (priority === 'high')
      return `${baseClass} bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200`
    if (priority === 'medium')
      return `${baseClass} bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200`
    if (priority === 'low')
      return `${baseClass} bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200`
    return `${baseClass} bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200`
  }

  const formattedRawJson = computed(() => {
    if (!wellness.value?.rawJson) return ''
    return JSON.stringify(wellness.value.rawJson, null, 2)
  })

  async function copyJsonToClipboard() {
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

  useHead(() => {
    const dateStr = wellness.value ? formatDate(wellness.value.date) : ''
    return {
      title: wellness.value ? `Wellness: ${dateStr}` : 'Wellness Details',
      meta: [
        {
          name: 'description',
          content: wellness.value
            ? `Daily wellness metrics including recovery, sleep, and HRV for ${dateStr}.`
            : 'View daily wellness metrics including recovery, sleep, and HRV.'
        }
      ]
    }
  })

  // Load data on mount
  onMounted(() => {
    fetchWellness()
  })

  function getScoreColor(score: number) {
    if (score >= 67) return 'text-green-600 dark:text-green-400'
    if (score >= 34) return 'text-amber-600 dark:text-amber-400'
    return 'text-red-600 dark:text-red-400'
  }

  function getTrend(metric: string, inverse: boolean = false) {
    if (!wellness.value?.trends?.[metric]) return null

    const current = wellness.value[metric]
    const avg = wellness.value.trends[metric].avg7

    if (current === null || avg === null || avg === 0) return null

    const diff = current - avg
    const pct = (diff / avg) * 100
    const absPct = Math.abs(pct)

    // Don't show negligible trends
    if (absPct < 1) return null

    const isUp = diff > 0
    const isGood = inverse ? !isUp : isUp

    return {
      text: `${Math.round(absPct)}%`,
      icon: isUp ? 'i-heroicons-arrow-up-right' : 'i-heroicons-arrow-down-right',
      class: isGood
        ? 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30'
        : 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30'
    }
  }
</script>
