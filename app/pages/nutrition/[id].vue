<template>
  <UDashboardPanel id="nutrition-detail">
    <template #header>
      <UDashboardNavbar :title="nutrition ? `Nutrition: ${formatDate(nutrition.date)}` : 'Nutrition Details'">
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
    </template>

    <template #body>
      <div class="p-6">
        <div v-if="loading" class="flex items-center justify-center py-12">
          <div class="text-center">
            <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
            <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">Loading nutrition data...</p>
          </div>
        </div>

        <div v-else-if="error" class="text-center py-12">
          <div class="text-red-600 dark:text-red-400">
            <p class="text-lg font-semibold">{{ error }}</p>
          </div>
        </div>

        <div v-else-if="nutrition" class="space-y-6">
          <!-- Header Card -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div class="flex items-start justify-between mb-4">
              <div class="flex-1">
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Daily Nutrition
                </h1>
                <div class="flex flex-wrap gap-3 text-sm text-gray-600 dark:text-gray-400">
                  <div class="flex items-center gap-1">
                    <span class="i-heroicons-calendar w-4 h-4"></span>
                    {{ formatDate(nutrition.date) }}
                  </div>
                  <div class="flex items-center gap-1">
                    <span class="i-heroicons-fire w-4 h-4"></span>
                    {{ nutrition.calories }} / {{ nutrition.caloriesGoal }} kcal
                  </div>
                </div>
              </div>
              <div>
                <span class="px-3 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                  Yazio
                </span>
              </div>
            </div>
          </div>

          <!-- Macros Summary -->
          <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
            <!-- Calories -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div class="flex items-center justify-between mb-2">
                <h3 class="text-sm font-medium text-gray-600 dark:text-gray-400">Calories</h3>
                <span class="i-heroicons-fire w-5 h-5 text-orange-500"></span>
              </div>
              <div class="text-3xl font-bold text-gray-900 dark:text-white">
                {{ nutrition.calories }}
              </div>
              <div class="mt-1 text-xs text-gray-500">
                Goal: {{ nutrition.caloriesGoal }} kcal
              </div>
              <div class="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  class="bg-orange-500 h-2 rounded-full transition-all"
                  :style="{ width: getPercentage(nutrition.calories, nutrition.caloriesGoal) + '%' }"
                ></div>
              </div>
            </div>

            <!-- Protein -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div class="flex items-center justify-between mb-2">
                <h3 class="text-sm font-medium text-gray-600 dark:text-gray-400">Protein</h3>
                <span class="i-heroicons-bolt w-5 h-5 text-blue-500"></span>
              </div>
              <div class="text-3xl font-bold text-gray-900 dark:text-white">
                {{ Math.round(nutrition.protein) }}g
              </div>
              <div class="mt-1 text-xs text-gray-500">
                Goal: {{ Math.round(nutrition.proteinGoal) }}g
              </div>
              <div class="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  class="bg-blue-500 h-2 rounded-full transition-all"
                  :style="{ width: getPercentage(nutrition.protein, nutrition.proteinGoal) + '%' }"
                ></div>
              </div>
            </div>

            <!-- Carbs -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div class="flex items-center justify-between mb-2">
                <h3 class="text-sm font-medium text-gray-600 dark:text-gray-400">Carbs</h3>
                <span class="i-heroicons-cube w-5 h-5 text-yellow-500"></span>
              </div>
              <div class="text-3xl font-bold text-gray-900 dark:text-white">
                {{ Math.round(nutrition.carbs) }}g
              </div>
              <div class="mt-1 text-xs text-gray-500">
                Goal: {{ Math.round(nutrition.carbsGoal) }}g
              </div>
              <div class="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  class="bg-yellow-500 h-2 rounded-full transition-all"
                  :style="{ width: getPercentage(nutrition.carbs, nutrition.carbsGoal) + '%' }"
                ></div>
              </div>
            </div>

            <!-- Fat -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div class="flex items-center justify-between mb-2">
                <h3 class="text-sm font-medium text-gray-600 dark:text-gray-400">Fat</h3>
                <span class="i-heroicons-beaker w-5 h-5 text-green-500"></span>
              </div>
              <div class="text-3xl font-bold text-gray-900 dark:text-white">
                {{ Math.round(nutrition.fat) }}g
              </div>
              <div class="mt-1 text-xs text-gray-500">
                Goal: {{ Math.round(nutrition.fatGoal) }}g
              </div>
              <div class="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  class="bg-green-500 h-2 rounded-full transition-all"
                  :style="{ width: getPercentage(nutrition.fat, nutrition.fatGoal) + '%' }"
                ></div>
              </div>
            </div>
          </div>

          <!-- Nutrition Quality Scores Section -->
          <div v-if="nutrition.overallScore || nutrition.macroBalanceScore || nutrition.qualityScore || nutrition.adherenceScore || nutrition.hydrationScore" class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Nutrition Quality Scores</h2>
            <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div v-if="nutrition.overallScore" class="text-center">
                <div :class="getScoreCircleClass(nutrition.overallScore)" class="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-2">
                  <span class="text-2xl font-bold">{{ nutrition.overallScore }}</span>
                </div>
                <div class="text-xs font-medium text-gray-600 dark:text-gray-400">Overall</div>
              </div>
              <div v-if="nutrition.macroBalanceScore" class="text-center">
                <div :class="getScoreCircleClass(nutrition.macroBalanceScore)" class="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-2">
                  <span class="text-2xl font-bold">{{ nutrition.macroBalanceScore }}</span>
                </div>
                <div class="text-xs font-medium text-gray-600 dark:text-gray-400">Macro Balance</div>
              </div>
              <div v-if="nutrition.qualityScore" class="text-center">
                <div :class="getScoreCircleClass(nutrition.qualityScore)" class="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-2">
                  <span class="text-2xl font-bold">{{ nutrition.qualityScore }}</span>
                </div>
                <div class="text-xs font-medium text-gray-600 dark:text-gray-400">Quality</div>
              </div>
              <div v-if="nutrition.adherenceScore" class="text-center">
                <div :class="getScoreCircleClass(nutrition.adherenceScore)" class="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-2">
                  <span class="text-2xl font-bold">{{ nutrition.adherenceScore }}</span>
                </div>
                <div class="text-xs font-medium text-gray-600 dark:text-gray-400">Adherence</div>
              </div>
              <div v-if="nutrition.hydrationScore" class="text-center">
                <div :class="getScoreCircleClass(nutrition.hydrationScore)" class="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-2">
                  <span class="text-2xl font-bold">{{ nutrition.hydrationScore }}</span>
                </div>
                <div class="text-xs font-medium text-gray-600 dark:text-gray-400">Hydration</div>
              </div>
            </div>
          </div>

          <!-- Water Intake -->
          <div v-if="nutrition.waterMl" class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div class="flex items-center gap-2 mb-4">
              <span class="i-heroicons-beaker w-6 h-6 text-blue-400"></span>
              <h2 class="text-xl font-bold text-gray-900 dark:text-white">Water Intake</h2>
            </div>
            <div class="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {{ (nutrition.waterMl / 1000).toFixed(1) }}L
            </div>
            <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {{ nutrition.waterMl }}ml consumed
            </div>
          </div>

          <!-- Personal Notes Section -->
          <NotesEditor
            v-model="nutrition.notes"
            :notes-updated-at="nutrition.notesUpdatedAt"
            :api-endpoint="`/api/nutrition/${nutrition.id}/notes`"
            @update:notesUpdatedAt="nutrition.notesUpdatedAt = $event"
          />

          <!-- AI Analysis Section -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-xl font-bold text-gray-900 dark:text-white">AI Nutrition Analysis</h2>
              <UButton
                v-if="!nutrition.aiAnalysis"
                icon="i-heroicons-sparkles"
                color="primary"
                :loading="analyzingNutrition"
                :disabled="analyzingNutrition"
                @click="analyzeNutrition"
              >
                {{ analyzingNutrition ? 'Analyzing...' : 'Analyze Nutrition' }}
              </UButton>
              <UButton
                v-else
                icon="i-heroicons-arrow-path"
                color="neutral"
                variant="ghost"
                :loading="analyzingNutrition"
                :disabled="analyzingNutrition"
                @click="analyzeNutrition"
                size="sm"
              >
                Re-analyze
              </UButton>
            </div>
            
            <!-- Structured Analysis Display -->
            <div v-if="nutrition.aiAnalysisJson" class="space-y-6">
              <!-- Data Completeness Assessment -->
              <div v-if="nutrition.aiAnalysisJson.data_completeness" class="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg p-6 border border-purple-200 dark:border-purple-800">
                <h3 class="text-base font-semibold text-purple-900 dark:text-purple-100 mb-3 flex items-center gap-2">
                  <span class="i-heroicons-clipboard-document-check w-5 h-5"></span>
                  Data Completeness: {{ nutrition.aiAnalysisJson.data_completeness.status }}
                </h3>
                <div class="mb-3">
                  <div class="flex items-center gap-2 mb-2">
                    <span class="text-sm text-gray-700 dark:text-gray-300">Confidence:</span>
                    <div class="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        class="bg-purple-500 h-2 rounded-full transition-all"
                        :style="{ width: (nutrition.aiAnalysisJson.data_completeness.confidence * 100) + '%' }"
                      ></div>
                    </div>
                    <span class="text-sm font-semibold text-gray-900 dark:text-white">
                      {{ Math.round(nutrition.aiAnalysisJson.data_completeness.confidence * 100) }}%
                    </span>
                  </div>
                </div>
                <p class="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
                  {{ nutrition.aiAnalysisJson.data_completeness.reasoning }}
                </p>
                <div v-if="nutrition.aiAnalysisJson.data_completeness.missing_meals && nutrition.aiAnalysisJson.data_completeness.missing_meals.length > 0" class="mt-3">
                  <span class="text-xs font-medium text-purple-700 dark:text-purple-300">Potentially missing: </span>
                  <span class="text-xs text-gray-700 dark:text-gray-300">
                    {{ nutrition.aiAnalysisJson.data_completeness.missing_meals.join(', ') }}
                  </span>
                </div>
              </div>

              <!-- Executive Summary -->
              <div class="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
                <h3 class="text-base font-semibold text-blue-900 dark:text-blue-100 mb-4 flex items-center gap-2">
                  <span class="i-heroicons-light-bulb w-5 h-5"></span>
                  Quick Take
                </h3>
                <p class="text-base text-gray-800 dark:text-gray-200 leading-relaxed">{{ nutrition.aiAnalysisJson.executive_summary }}</p>
              </div>

              <!-- Analysis Sections -->
              <div v-if="nutrition.aiAnalysisJson.sections" class="grid grid-cols-1 gap-4">
                <div
                  v-for="(section, index) in nutrition.aiAnalysisJson.sections"
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
              <div v-if="nutrition.aiAnalysisJson.recommendations && nutrition.aiAnalysisJson.recommendations.length > 0" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                  <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <span class="i-heroicons-clipboard-document-list w-5 h-5"></span>
                    Recommendations
                  </h3>
                </div>
                <div class="px-6 py-4 space-y-4">
                  <div
                    v-for="(rec, index) in nutrition.aiAnalysisJson.recommendations"
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

              <!-- Strengths & Areas for Improvement -->
              <div v-if="nutrition.aiAnalysisJson.strengths || nutrition.aiAnalysisJson.areas_for_improvement" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Strengths -->
                <div v-if="nutrition.aiAnalysisJson.strengths && nutrition.aiAnalysisJson.strengths.length > 0" class="bg-green-50 dark:bg-green-900/20 rounded-lg p-6 border border-green-200 dark:border-green-800">
                  <h3 class="text-lg font-semibold text-green-900 dark:text-green-100 mb-3 flex items-center gap-2">
                    <span class="i-heroicons-check-circle w-5 h-5"></span>
                    Strengths
                  </h3>
                  <ul class="space-y-2">
                    <li
                      v-for="(strength, index) in nutrition.aiAnalysisJson.strengths"
                      :key="index"
                      class="flex items-start gap-2 text-sm text-green-800 dark:text-green-200"
                    >
                      <span class="i-heroicons-plus-circle w-4 h-4 mt-0.5 flex-shrink-0"></span>
                      <span>{{ strength }}</span>
                    </li>
                  </ul>
                </div>

                <!-- Areas for Improvement -->
                <div v-if="nutrition.aiAnalysisJson.areas_for_improvement && nutrition.aiAnalysisJson.areas_for_improvement.length > 0" class="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-6 border border-orange-200 dark:border-orange-800">
                  <h3 class="text-lg font-semibold text-orange-900 dark:text-orange-100 mb-3 flex items-center gap-2">
                    <span class="i-heroicons-exclamation-triangle w-5 h-5"></span>
                    Areas for Improvement
                  </h3>
                  <ul class="space-y-2">
                    <li
                      v-for="(area, index) in nutrition.aiAnalysisJson.areas_for_improvement"
                      :key="index"
                      class="flex items-start gap-2 text-sm text-orange-800 dark:text-orange-200"
                    >
                      <span class="i-heroicons-arrow-trending-up w-4 h-4 mt-0.5 flex-shrink-0"></span>
                      <span>{{ area }}</span>
                    </li>
                  </ul>
                </div>
              </div>

              <!-- Timestamp -->
              <div v-if="nutrition.aiAnalyzedAt" class="text-xs text-gray-500 dark:text-gray-400 text-center pt-4 border-t border-gray-200 dark:border-gray-700">
                Analyzed on {{ formatDate(nutrition.aiAnalyzedAt) }}
              </div>
            </div>
            
            <div v-else-if="!analyzingNutrition" class="text-center py-8">
              <div class="text-gray-500 dark:text-gray-400">
                <span class="i-heroicons-light-bulb w-12 h-12 mx-auto mb-4 opacity-50"></span>
                <p class="text-sm">Click "Analyze Nutrition" to get AI-powered insights on your daily intake, macro balance, and nutrition quality.</p>
              </div>
            </div>

            <div v-else class="text-center py-8">
              <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mb-4"></div>
              <p class="text-sm text-gray-600 dark:text-gray-400">Generating analysis with AI...</p>
            </div>
          </div>

          <!-- Meals Breakdown -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Meals Breakdown</h2>
            
            <div class="space-y-6">
              <!-- Breakfast -->
              <div v-if="nutrition.breakfast && nutrition.breakfast.length > 0">
                <div class="flex items-center gap-2 mb-3">
                  <span class="i-heroicons-sun w-5 h-5 text-yellow-500"></span>
                  <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Breakfast</h3>
                  <span class="text-sm text-gray-500">({{ nutrition.breakfast.length }} items)</span>
                </div>
                <div class="space-y-2">
                  <div
                    v-for="item in nutrition.breakfast"
                    :key="item.id"
                    class="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <div class="flex items-start justify-between">
                      <div class="flex-1">
                        <div class="text-sm font-medium text-gray-900 dark:text-white">
                          {{ item.product_name || 'Unknown Product' }}
                        </div>
                        <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          <span v-if="item.product_brand" class="text-gray-500">{{ item.product_brand }} • </span>
                          {{ item.amount }}{{ item.serving ? ` ${item.serving}` : 'g' }}
                          <span v-if="item.serving_quantity"> × {{ item.serving_quantity }}</span>
                        </div>
                      </div>
                      <div class="text-xs text-gray-500">
                        {{ formatTime(item.date) }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Lunch -->
              <div v-if="nutrition.lunch && nutrition.lunch.length > 0">
                <div class="flex items-center gap-2 mb-3">
                  <span class="i-heroicons-sun w-5 h-5 text-orange-500"></span>
                  <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Lunch</h3>
                  <span class="text-sm text-gray-500">({{ nutrition.lunch.length }} items)</span>
                </div>
                <div class="space-y-2">
                  <div
                    v-for="item in nutrition.lunch"
                    :key="item.id"
                    class="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <div class="flex items-start justify-between">
                      <div class="flex-1">
                        <div class="text-sm font-medium text-gray-900 dark:text-white">
                          {{ item.product_name || 'Unknown Product' }}
                        </div>
                        <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          <span v-if="item.product_brand" class="text-gray-500">{{ item.product_brand }} • </span>
                          {{ item.amount }}{{ item.serving ? ` ${item.serving}` : 'g' }}
                          <span v-if="item.serving_quantity"> × {{ item.serving_quantity }}</span>
                        </div>
                      </div>
                      <div class="text-xs text-gray-500">
                        {{ formatTime(item.date) }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Dinner -->
              <div v-if="nutrition.dinner && nutrition.dinner.length > 0">
                <div class="flex items-center gap-2 mb-3">
                  <span class="i-heroicons-moon w-5 h-5 text-indigo-500"></span>
                  <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Dinner</h3>
                  <span class="text-sm text-gray-500">({{ nutrition.dinner.length }} items)</span>
                </div>
                <div class="space-y-2">
                  <div
                    v-for="item in nutrition.dinner"
                    :key="item.id"
                    class="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <div class="flex items-start justify-between">
                      <div class="flex-1">
                        <div class="text-sm font-medium text-gray-900 dark:text-white">
                          {{ item.product_name || 'Unknown Product' }}
                        </div>
                        <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          <span v-if="item.product_brand" class="text-gray-500">{{ item.product_brand }} • </span>
                          {{ item.amount }}{{ item.serving ? ` ${item.serving}` : 'g' }}
                          <span v-if="item.serving_quantity"> × {{ item.serving_quantity }}</span>
                        </div>
                      </div>
                      <div class="text-xs text-gray-500">
                        {{ formatTime(item.date) }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Snacks -->
              <div v-if="nutrition.snacks && nutrition.snacks.length > 0">
                <div class="flex items-center gap-2 mb-3">
                  <span class="i-heroicons-cake w-5 h-5 text-pink-500"></span>
                  <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Snacks</h3>
                  <span class="text-sm text-gray-500">({{ nutrition.snacks.length }} items)</span>
                </div>
                <div class="space-y-2">
                  <div
                    v-for="item in nutrition.snacks"
                    :key="item.id"
                    class="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <div class="flex items-start justify-between">
                      <div class="flex-1">
                        <div class="text-sm font-medium text-gray-900 dark:text-white">
                          {{ item.product_name || 'Unknown Product' }}
                        </div>
                        <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          <span v-if="item.product_brand" class="text-gray-500">{{ item.product_brand }} • </span>
                          {{ item.amount }}{{ item.serving ? ` ${item.serving}` : 'g' }}
                          <span v-if="item.serving_quantity"> × {{ item.serving_quantity }}</span>
                        </div>
                      </div>
                      <div class="text-xs text-gray-500">
                        {{ formatTime(item.date) }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- No meals logged -->
              <div v-if="!hasAnyMeals" class="text-center py-8 text-gray-500 dark:text-gray-400">
                No meals logged for this day
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

const route = useRoute()
const toast = useToast()
const nutrition = ref<any>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const analyzingNutrition = ref(false)

const hasAnyMeals = computed(() => {
  if (!nutrition.value) return false
  return (
    (nutrition.value.breakfast && nutrition.value.breakfast.length > 0) ||
    (nutrition.value.lunch && nutrition.value.lunch.length > 0) ||
    (nutrition.value.dinner && nutrition.value.dinner.length > 0) ||
    (nutrition.value.snacks && nutrition.value.snacks.length > 0)
  )
})

// Fetch nutrition data
async function fetchNutrition() {
  loading.value = true
  error.value = null
  
  try {
    const id = route.params.id as string
    nutrition.value = await $fetch(`/api/nutrition/${id}`)
  } catch (e: any) {
    console.error('Error fetching nutrition:', e)
    error.value = e.data?.message || e.message || 'Failed to load nutrition data'
  } finally {
    loading.value = false
  }
}

// Utility functions
function formatDate(date: string | Date) {
  // Handle date string properly to avoid timezone shifts
  // If it's a string in YYYY-MM-DD format, parse it as local date
  if (typeof date === 'string' && date.includes('-')) {
    const parts = date.split('-').map(Number)
    if (parts.length === 3 && parts.every(p => !isNaN(p))) {
      const [year, month, day] = parts
      return new Date(year, month - 1, day).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    }
  }
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

function formatTime(dateTime: string) {
  return new Date(dateTime).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getPercentage(value: number, goal: number) {
  if (!goal) return 0
  return Math.min(Math.round((value / goal) * 100), 100)
}

// Polling interval reference
let pollingInterval: NodeJS.Timeout | null = null

// Analyze nutrition function
async function analyzeNutrition() {
  if (!nutrition.value) return
  
  analyzingNutrition.value = true
  try {
    const result = await $fetch(`/api/nutrition/${nutrition.value.id}/analyze`, {
      method: 'POST'
    })
    
    // If already completed, update immediately
    if (result.status === 'COMPLETED' && 'analysis' in result && result.analysis) {
      nutrition.value.aiAnalysis = result.analysis
      nutrition.value.aiAnalyzedAt = result.analyzedAt
      nutrition.value.aiAnalysisStatus = 'COMPLETED'
      analyzingNutrition.value = false
      
      toast.add({
        title: 'Analysis Ready',
        description: 'Nutrition analysis already exists',
        color: 'success',
        icon: 'i-heroicons-check-circle'
      })
      return
    }
    
    // Update status
    nutrition.value.aiAnalysisStatus = result.status
    
    // Show processing message
    toast.add({
      title: 'Analysis Started',
      description: 'Your nutrition is being analyzed by AI. This may take a minute...',
      color: 'info',
      icon: 'i-heroicons-sparkles'
    })
    
    // Start polling for completion
    startPolling()
  } catch (e: any) {
    console.error('Error triggering nutrition analysis:', e)
    analyzingNutrition.value = false
    toast.add({
      title: 'Analysis Failed',
      description: e.data?.message || e.message || 'Failed to start nutrition analysis',
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
    if (!nutrition.value) return
    
    try {
      const updated = await $fetch(`/api/nutrition/${nutrition.value.id}`)
      
      // Update nutrition data
      nutrition.value.aiAnalysis = updated.aiAnalysis
      nutrition.value.aiAnalysisJson = (updated as any).aiAnalysisJson
      nutrition.value.aiAnalysisStatus = (updated as any).aiAnalysisStatus
      nutrition.value.aiAnalyzedAt = updated.aiAnalyzedAt
      
      // If completed or failed, stop polling
      if ((updated as any).aiAnalysisStatus === 'COMPLETED') {
        stopPolling()
        analyzingNutrition.value = false
        
        toast.add({
          title: 'Analysis Complete',
          description: 'AI nutrition analysis has been generated successfully',
          color: 'success',
          icon: 'i-heroicons-check-circle'
        })
      } else if ((updated as any).aiAnalysisStatus === 'FAILED') {
        stopPolling()
        analyzingNutrition.value = false
        
        toast.add({
          title: 'Analysis Failed',
          description: 'Failed to generate nutrition analysis. Please try again.',
          color: 'error',
          icon: 'i-heroicons-exclamation-circle'
        })
      }
    } catch (e) {
      console.error('Error polling nutrition status:', e)
    }
  }, 3000) // Poll every 3 seconds
}

function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval)
    pollingInterval = null
  }
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

// Load data on mount
onMounted(() => {
  fetchNutrition()
})

// Cleanup on unmount
onUnmounted(() => {
  stopPolling()
})
</script>