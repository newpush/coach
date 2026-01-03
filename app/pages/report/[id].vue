<template>
  <UDashboardPanel id="report-detail">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse />
          <UButton
            icon="i-heroicons-arrow-left"
            color="neutral"
            variant="ghost"
            to="/reports"
            size="sm"
          />
          <USeparator orientation="vertical" class="h-4" />
          <span class="text-sm sm:text-base font-semibold truncate max-w-[120px] sm:max-w-none">{{ reportTitle || 'Report' }}</span>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 sm:p-6 max-w-4xl mx-auto">
        <div v-if="pending" class="flex justify-center py-20">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary" />
      </div>
      
      <div v-else-if="report">
        <!-- Header -->
        <div class="mb-6">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <h2 class="text-xl sm:text-3xl font-bold">{{ reportTitle }}</h2>
              <p class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 sm:mt-2">
                {{ formatDateRange(report.dateRangeStart, report.dateRangeEnd) }}
              </p>
            </div>
            <div class="flex">
              <UBadge :color="statusColor as any" size="md" class="sm:size-lg">
                {{ report.status }}
              </UBadge>
            </div>
          </div>
        </div>
        
        <!-- Status Alert -->
        <UAlert
          v-if="report.status === 'PROCESSING'"
          color="info"
          icon="i-heroicons-arrow-path"
          title="Generating Report"
          description="Your AI coach is analyzing your training data. This may take a few moments..."
          class="mb-6"
        />
        
        <UAlert
          v-else-if="report.status === 'FAILED'"
          color="error"
          icon="i-heroicons-exclamation-triangle"
          title="Report Generation Failed"
          description="Unable to generate report. Please try again."
          class="mb-6"
        />
        
        <!-- Content - Structured JSON Display -->
        <div v-if="report.status === 'COMPLETED' && report.analysisJson" class="space-y-6">
          <!-- Quick Take / Executive Summary -->
          <UCard>
            <template #header>
              <h3 class="text-xl font-semibold">Quick Take</h3>
            </template>
            <p class="text-gray-700 dark:text-gray-300 leading-relaxed">{{ report.analysisJson.executive_summary }}</p>
          </UCard>

          <!-- Athlete Profile Sections -->
          <template v-if="report.analysisJson.type === 'athlete_profile'">
            <!-- Current Fitness -->
            <UCard v-if="report.analysisJson.current_fitness">
              <template #header>
                <div class="flex items-center justify-between">
                  <h3 class="text-xl font-semibold">Current Fitness</h3>
                  <UBadge :color="getStatusBadgeColor(report.analysisJson.current_fitness.status) as any" size="lg">
                    {{ report.analysisJson.current_fitness.status_label }}
                  </UBadge>
                </div>
              </template>
              
              <div class="space-y-3">
                <div v-for="(point, idx) in report.analysisJson.current_fitness.key_points" :key="idx" class="flex gap-3">
                  <UIcon name="i-heroicons-chevron-right" class="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <p class="text-gray-700 dark:text-gray-300">{{ point }}</p>
                </div>
              </div>
            </UCard>

            <!-- Training Characteristics -->
            <UCard v-if="report.analysisJson.training_characteristics">
              <template #header>
                <h3 class="text-xl font-semibold">Training Characteristics</h3>
              </template>
              
              <div class="space-y-4">
                <div v-if="report.analysisJson.training_characteristics.training_style">
                  <h4 class="font-semibold text-gray-900 dark:text-white mb-2">Training Style</h4>
                  <p class="text-gray-700 dark:text-gray-300">{{ report.analysisJson.training_characteristics.training_style }}</p>
                </div>
                
                <div v-if="report.analysisJson.training_characteristics.strengths?.length">
                  <h4 class="font-semibold text-gray-900 dark:text-white mb-2">Strengths</h4>
                  <div class="space-y-2">
                    <div v-for="(strength, idx) in report.analysisJson.training_characteristics.strengths" :key="idx" class="flex gap-3">
                      <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                      <p class="text-gray-700 dark:text-gray-300">{{ strength }}</p>
                    </div>
                  </div>
                </div>
                
                <div v-if="report.analysisJson.training_characteristics.areas_for_development?.length">
                  <h4 class="font-semibold text-gray-900 dark:text-white mb-2">Areas for Development</h4>
                  <div class="space-y-2">
                    <div v-for="(area, idx) in report.analysisJson.training_characteristics.areas_for_development" :key="idx" class="flex gap-3">
                      <UIcon name="i-heroicons-arrow-trending-up" class="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                      <p class="text-gray-700 dark:text-gray-300">{{ area }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </UCard>

            <!-- Recovery Profile -->
            <UCard v-if="report.analysisJson.recovery_profile">
              <template #header>
                <h3 class="text-xl font-semibold">Recovery Profile</h3>
              </template>
              
              <div class="space-y-4">
                <div v-if="report.analysisJson.recovery_profile.recovery_pattern">
                  <h4 class="font-semibold text-gray-900 dark:text-white mb-2">Recovery Pattern</h4>
                  <p class="text-gray-700 dark:text-gray-300">{{ report.analysisJson.recovery_profile.recovery_pattern }}</p>
                </div>
                
                <div v-if="report.analysisJson.recovery_profile.hrv_trend">
                  <h4 class="font-semibold text-gray-900 dark:text-white mb-2">HRV Trend</h4>
                  <p class="text-gray-700 dark:text-gray-300">{{ report.analysisJson.recovery_profile.hrv_trend }}</p>
                </div>
                
                <div v-if="report.analysisJson.recovery_profile.sleep_quality">
                  <h4 class="font-semibold text-gray-900 dark:text-white mb-2">Sleep Quality</h4>
                  <p class="text-gray-700 dark:text-gray-300">{{ report.analysisJson.recovery_profile.sleep_quality }}</p>
                </div>
                
                <div v-if="report.analysisJson.recovery_profile.key_observations?.length">
                  <h4 class="font-semibold text-gray-900 dark:text-white mb-2">Key Observations</h4>
                  <div class="space-y-2">
                    <div v-for="(obs, idx) in report.analysisJson.recovery_profile.key_observations" :key="idx" class="flex gap-3">
                      <UIcon name="i-heroicons-chevron-right" class="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                      <p class="text-gray-700 dark:text-gray-300">{{ obs }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </UCard>

            <!-- Nutrition Profile -->
            <UCard v-if="report.analysisJson.nutrition_profile">
              <template #header>
                <h3 class="text-xl font-semibold">Nutrition Profile</h3>
              </template>
              
              <div class="space-y-4">
                <div v-if="report.analysisJson.nutrition_profile.nutrition_pattern">
                  <h4 class="font-semibold text-gray-900 dark:text-white mb-2">Nutrition Pattern</h4>
                  <p class="text-gray-700 dark:text-gray-300">{{ report.analysisJson.nutrition_profile.nutrition_pattern }}</p>
                </div>
                
                <div v-if="report.analysisJson.nutrition_profile.caloric_balance">
                  <h4 class="font-semibold text-gray-900 dark:text-white mb-2">Caloric Balance</h4>
                  <p class="text-gray-700 dark:text-gray-300">{{ report.analysisJson.nutrition_profile.caloric_balance }}</p>
                </div>
                
                <div v-if="report.analysisJson.nutrition_profile.macro_distribution">
                  <h4 class="font-semibold text-gray-900 dark:text-white mb-2">Macro Distribution</h4>
                  <p class="text-gray-700 dark:text-gray-300">{{ report.analysisJson.nutrition_profile.macro_distribution }}</p>
                </div>
                
                <div v-if="report.analysisJson.nutrition_profile.key_observations?.length">
                  <h4 class="font-semibold text-gray-900 dark:text-white mb-2">Key Observations</h4>
                  <div class="space-y-2">
                    <div v-for="(obs, idx) in report.analysisJson.nutrition_profile.key_observations" :key="idx" class="flex gap-3">
                      <UIcon name="i-heroicons-chevron-right" class="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                      <p class="text-gray-700 dark:text-gray-300">{{ obs }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </UCard>

            <!-- Recent Performance -->
            <UCard v-if="report.analysisJson.recent_performance">
              <template #header>
                <div class="flex items-center justify-between">
                  <h3 class="text-xl font-semibold">Recent Performance</h3>
                  <UBadge :color="getTrendBadgeColor(report.analysisJson.recent_performance.trend) as any" size="lg">
                    {{ report.analysisJson.recent_performance.trend }}
                  </UBadge>
                </div>
              </template>
              
              <div class="space-y-4">
                <div v-if="report.analysisJson.recent_performance.patterns?.length">
                  <h4 class="font-semibold text-gray-900 dark:text-white mb-2">Patterns</h4>
                  <div class="space-y-2">
                    <div v-for="(pattern, idx) in report.analysisJson.recent_performance.patterns" :key="idx" class="flex gap-3">
                      <UIcon name="i-heroicons-chevron-right" class="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                      <p class="text-gray-700 dark:text-gray-300">{{ pattern }}</p>
                    </div>
                  </div>
                </div>
                
                <div v-if="report.analysisJson.recent_performance.notable_workouts?.length">
                  <h4 class="font-semibold text-gray-900 dark:text-white mb-2">Notable Workouts</h4>
                  <div class="space-y-3">
                    <div v-for="(workout, idx) in report.analysisJson.recent_performance.notable_workouts" :key="idx"
                         class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div class="flex items-center justify-between mb-1">
                        <span class="font-medium text-gray-900 dark:text-white">{{ workout.title }}</span>
                        <span class="text-sm text-gray-600 dark:text-gray-400">{{ formatDate(workout.date) }}</span>
                      </div>
                      <p class="text-sm text-gray-700 dark:text-gray-300">{{ workout.key_insight }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </UCard>

            <!-- Planning Context -->
            <UCard v-if="report.analysisJson.planning_context">
              <template #header>
                <h3 class="text-xl font-semibold">Planning Context</h3>
              </template>
              
              <div class="space-y-4">
                <div v-if="report.analysisJson.planning_context.current_focus">
                  <h4 class="font-semibold text-gray-900 dark:text-white mb-2">Current Focus</h4>
                  <p class="text-gray-700 dark:text-gray-300">{{ report.analysisJson.planning_context.current_focus }}</p>
                </div>
                
                <div v-if="report.analysisJson.planning_context.limitations?.length">
                  <h4 class="font-semibold text-gray-900 dark:text-white mb-2">Limitations</h4>
                  <div class="space-y-2">
                    <div v-for="(limitation, idx) in report.analysisJson.planning_context.limitations" :key="idx" class="flex gap-3">
                      <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                      <p class="text-gray-700 dark:text-gray-300">{{ limitation }}</p>
                    </div>
                  </div>
                </div>
                
                <div v-if="report.analysisJson.planning_context.opportunities?.length">
                  <h4 class="font-semibold text-gray-900 dark:text-white mb-2">Opportunities</h4>
                  <div class="space-y-2">
                    <div v-for="(opp, idx) in report.analysisJson.planning_context.opportunities" :key="idx" class="flex gap-3">
                      <UIcon name="i-heroicons-light-bulb" class="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                      <p class="text-gray-700 dark:text-gray-300">{{ opp }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </UCard>

            <!-- Recommendations Summary (for athlete profile) -->
            <UCard v-if="report.analysisJson.recommendations_summary">
              <template #header>
                <h3 class="text-xl font-semibold flex items-center gap-2">
                  <UIcon name="i-heroicons-light-bulb" class="w-6 h-6" />
                  Recommendations Summary
                </h3>
              </template>
              
              <div class="space-y-4">
                <div v-if="report.analysisJson.recommendations_summary.action_items?.length">
                  <h4 class="font-semibold text-gray-900 dark:text-white mb-3">Action Items</h4>
                  <div class="space-y-3">
                    <div
                      v-for="(item, idx) in report.analysisJson.recommendations_summary.action_items"
                      :key="idx"
                      class="border-l-4 pl-4"
                      :class="getPriorityBorderClass(item.priority)"
                    >
                      <div class="flex items-start justify-between gap-4 mb-1">
                        <p class="text-gray-900 dark:text-white">{{ item.action }}</p>
                        <UBadge :color="getPriorityBadgeColor(item.priority) as any">
                          {{ item.priority }}
                        </UBadge>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div v-if="report.analysisJson.recommendations_summary.recurring_themes?.length">
                  <h4 class="font-semibold text-gray-900 dark:text-white mb-2">Recurring Themes</h4>
                  <div class="space-y-2">
                    <div v-for="(theme, idx) in report.analysisJson.recommendations_summary.recurring_themes" :key="idx" class="flex gap-3">
                      <UIcon name="i-heroicons-chevron-right" class="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                      <p class="text-gray-700 dark:text-gray-300">{{ theme }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </UCard>
          </template>

          <!-- Standard Report Sections (for non-athlete-profile reports) -->
          <template v-else>
            <UCard v-for="section in report.analysisJson.sections" :key="section.title">
              <template #header>
                <div class="flex items-center justify-between">
                  <h3 class="text-xl font-semibold">{{ section.title }}</h3>
                  <UBadge :color="getStatusBadgeColor(section.status) as any" size="lg">
                    {{ section.status_label }}
                  </UBadge>
                </div>
              </template>
              
              <div class="space-y-3">
                <div v-for="(point, idx) in section.analysis_points" :key="idx" class="flex gap-3">
                  <UIcon name="i-heroicons-chevron-right" class="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <p class="text-gray-700 dark:text-gray-300">{{ point }}</p>
                </div>
              </div>
            </UCard>
          </template>

          <!-- Recommendations -->
          <UCard v-if="report.analysisJson.recommendations?.length">
            <template #header>
              <h3 class="text-xl font-semibold flex items-center gap-2">
                <UIcon name="i-heroicons-light-bulb" class="w-6 h-6" />
                Recommendations
              </h3>
            </template>
            
            <div class="space-y-4">
              <div
                v-for="rec in report.analysisJson.recommendations"
                :key="rec.title"
                class="border-l-4 pl-4"
                :class="getPriorityBorderClass(rec.priority)"
              >
                <div class="flex items-start justify-between gap-4 mb-2">
                  <h4 class="font-semibold text-lg">{{ rec.title }}</h4>
                  <UBadge :color="getPriorityBadgeColor(rec.priority) as any">
                    {{ rec.priority }} priority
                  </UBadge>
                </div>
                <p class="text-gray-700 dark:text-gray-300">{{ rec.description }}</p>
              </div>
            </div>
          </UCard>

          <!-- Metrics Summary -->
          <UCard v-if="report.analysisJson.metrics_summary">
            <template #header>
              <h3 class="text-xl font-semibold">Metrics Summary</h3>
            </template>
            
            <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div v-if="report.analysisJson.metrics_summary.total_duration_minutes" class="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div class="text-2xl font-bold text-primary">
                  {{ Math.round(report.analysisJson.metrics_summary.total_duration_minutes) }}
                </div>
                <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">Minutes</div>
              </div>
              
              <div v-if="report.analysisJson.metrics_summary.total_tss" class="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div class="text-2xl font-bold text-primary">
                  {{ Math.round(report.analysisJson.metrics_summary.total_tss) }}
                </div>
                <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">Total TSS</div>
              </div>
              
              <div v-if="report.analysisJson.metrics_summary.avg_power" class="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div class="text-2xl font-bold text-primary">
                  {{ Math.round(report.analysisJson.metrics_summary.avg_power) }}W
                </div>
                <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">Avg Power</div>
              </div>
              
              <div v-if="report.analysisJson.metrics_summary.avg_heart_rate" class="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div class="text-2xl font-bold text-primary">
                  {{ Math.round(report.analysisJson.metrics_summary.avg_heart_rate) }}
                </div>
                <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">Avg HR</div>
              </div>
              
              <div v-if="report.analysisJson.metrics_summary.total_distance_km" class="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div class="text-2xl font-bold text-primary">
                  {{ report.analysisJson.metrics_summary.total_distance_km.toFixed(1) }}km
                </div>
                <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">Distance</div>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Content - Markdown Fallback -->
        <UCard v-else-if="report.status === 'COMPLETED' && report.markdown" class="prose prose-lg max-w-none">
          <MDC :value="report.markdown" />
        </UCard>
        
        <!-- Nutrition Analyzed -->
        <UCard v-if="report.nutrition && report.nutrition.length > 0" class="mt-6">
          <template #header>
            <h3 class="text-xl font-semibold flex items-center gap-2">
              <UIcon name="i-heroicons-cake" class="w-6 h-6" />
              Nutrition Days Analyzed ({{ report.nutrition.length }})
            </h3>
          </template>
          
          <div class="space-y-3">
            <div
              v-for="rn in report.nutrition"
              :key="rn.id"
              class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
              @click="navigateTo(`/nutrition/${rn.nutrition.id}`)"
            >
              <div class="flex-1">
                <div class="flex items-center gap-3 mb-2">
                  <span class="px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs font-medium rounded">
                    Nutrition
                  </span>
                  <span class="text-sm text-gray-600 dark:text-gray-400">
                    {{ formatDate(rn.nutrition.date) }}
                  </span>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
                  <span v-if="rn.nutrition.calories">
                    {{ rn.nutrition.calories }} cal
                    <span v-if="rn.nutrition.caloriesGoal" class="text-xs">
                      ({{ Math.round((rn.nutrition.calories / rn.nutrition.caloriesGoal) * 100) }}%)
                    </span>
                  </span>
                  <span v-if="rn.nutrition.protein">
                    {{ rn.nutrition.protein }}g protein
                    <span v-if="rn.nutrition.proteinGoal" class="text-xs">
                      ({{ Math.round((rn.nutrition.protein / rn.nutrition.proteinGoal) * 100) }}%)
                    </span>
                  </span>
                  <span v-if="rn.nutrition.carbs">
                    {{ rn.nutrition.carbs }}g carbs
                  </span>
                  <span v-if="rn.nutrition.fat">
                    {{ rn.nutrition.fat }}g fat
                  </span>
                </div>
              </div>
              <UIcon name="i-heroicons-chevron-right" class="w-5 h-5 text-gray-400" />
            </div>
          </div>
        </UCard>
        
        <!-- Workouts Analyzed -->
        <UCard v-if="report.workouts && report.workouts.length > 0" class="mt-6">
          <template #header>
            <h3 class="text-xl font-semibold flex items-center gap-2">
              <UIcon name="i-heroicons-list-bullet" class="w-6 h-6" />
              Workouts Analyzed ({{ report.workouts.length }})
            </h3>
          </template>
          
          <div class="space-y-3">
            <div
              v-for="rw in report.workouts"
              :key="rw.id"
              class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
              @click="navigateTo(`/workouts/${rw.workout.id}`)"
            >
              <div class="flex-1">
                <div class="flex items-center gap-3 mb-2">
                  <span class="px-2 py-1 bg-primary/10 text-primary text-xs font-medium rounded">
                    {{ rw.workout.type }}
                  </span>
                  <span class="text-sm text-gray-600 dark:text-gray-400">
                    {{ formatDate(rw.workout.date) }}
                  </span>
                </div>
                <h4 class="font-medium text-gray-900 dark:text-white">{{ rw.workout.title }}</h4>
                <div class="flex gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
                  <span v-if="rw.workout.durationSec">
                    {{ Math.round(rw.workout.durationSec / 60) }} min
                  </span>
                  <span v-if="rw.workout.averageWatts">
                    {{ rw.workout.averageWatts }}W avg
                  </span>
                  <span v-if="rw.workout.tss">
                    {{ Math.round(rw.workout.tss) }} TSS
                  </span>
                  <span v-if="rw.workout.distanceMeters">
                    {{ (rw.workout.distanceMeters / 1000).toFixed(1) }} km
                  </span>
                </div>
              </div>
              <UIcon name="i-heroicons-chevron-right" class="w-5 h-5 text-gray-400" />
            </div>
          </div>
        </UCard>
        
        <!-- Suggestions (for daily coach) -->
        <UCard v-if="report.suggestions" class="mt-6">
          <template #header>
            <h3 class="text-xl font-semibold flex items-center gap-2">
              <UIcon name="i-heroicons-light-bulb" class="w-6 h-6" />
              Today's Coaching Suggestion
            </h3>
          </template>
          
          <div class="space-y-4">
            <div>
              <p class="text-lg font-semibold mb-2">{{ getActionText(report.suggestions.action) }}</p>
              <p class="text-gray-700 dark:text-gray-300">{{ report.suggestions.reason }}</p>
            </div>
            
            <div v-if="report.suggestions.modification" class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <p class="text-sm font-medium text-blue-900 dark:text-blue-200 mb-1">Recommended Modification:</p>
              <p class="text-blue-800 dark:text-blue-300">{{ report.suggestions.modification }}</p>
            </div>
            
            <div class="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
              <span>Confidence: {{ (report.suggestions.confidence * 100).toFixed(0) }}%</span>
              <span>Model: {{ report.modelVersion }}</span>
            </div>
          </div>
        </UCard>
        
        <!-- Actions -->
        <div class="mt-6 flex gap-4">
          <UButton
            color="neutral"
            variant="outline"
            @click="handlePrint"
          >
            <UIcon name="i-heroicons-printer" class="w-4 h-4 mr-2" />
            Print / Save as PDF
          </UButton>
          
          <UButton
            v-if="report.status === 'COMPLETED'"
            color="neutral"
            variant="outline"
            disabled
          >
            <UIcon name="i-heroicons-share" class="w-4 h-4 mr-2" />
            Share (Coming Soon)
          </UButton>
        </div>
      </div>
      
      <div v-else class="text-center py-20">
        <p class="text-gray-600 dark:text-gray-400">Report not found</p>
        <UButton to="/reports" class="mt-4">
          Back to Reports
        </UButton>
      </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
const route = useRoute()
const { signOut } = useAuth()
const reportId = route.params.id as string

interface Report {
  id: string
  type: string
  status: string
  dateRangeStart: string
  dateRangeEnd: string
  analysisJson?: any
  markdown?: string
  nutrition?: any[]
  workouts?: any[]
  suggestions?: any
  modelVersion?: string
}

const { data: report, pending, refresh: refreshReport } = await useFetch<Report>(`/api/reports/${reportId}`, {
  watch: false,
})

// Poll for updates if report is processing or pending
let pollInterval: NodeJS.Timeout | null = null

onMounted(() => {
  if (report.value?.status === 'PROCESSING' || report.value?.status === 'PENDING') {
    pollInterval = setInterval(async () => {
      await refreshReport()
      if (report.value && report.value.status !== 'PROCESSING' && report.value.status !== 'PENDING') {
        if (pollInterval) {
          clearInterval(pollInterval)
          pollInterval = null
        }
      }
    }, 3000) // Poll every 3 seconds
  }
})

onUnmounted(() => {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
})

definePageMeta({
  middleware: 'auth'
})

const reportTitle = computed(() => {
  if (!report.value) return ''
  const titles: Record<string, string> = {
    'WEEKLY_ANALYSIS': 'Weekly Training Analysis',
    'LAST_3_WORKOUTS': 'Last 3 Workouts Analysis',
    'LAST_3_NUTRITION': 'Last 3 Days Nutrition Analysis',
    'LAST_7_NUTRITION': 'Weekly Nutrition Analysis',
    'RACE_PREP': 'Race Preparation Report',
    'DAILY_SUGGESTION': 'Daily Coaching Brief',
    'CUSTOM': 'Custom Report'
  }
  return titles[report.value.type] || 'Report'
})

const statusColor = computed(() => {
  if (!report.value) return 'neutral'
  const colors: Record<string, string> = {
    'PENDING': 'warning',
    'PROCESSING': 'info',
    'COMPLETED': 'success',
    'FAILED': 'error'
  }
  return colors[report.value.status] || 'neutral'
})

const getStatusBadgeColor = (status: string) => {
  const colors: Record<string, string> = {
    'excellent': 'success',
    'good': 'info',
    'moderate': 'warning',
    'needs_improvement': 'warning',
    'poor': 'error'
  }
  return colors[status] || 'neutral'
}

const getPriorityBadgeColor = (priority: string) => {
  const colors: Record<string, string> = {
    'high': 'error',
    'medium': 'warning',
    'low': 'success'
  }
  return colors[priority] || 'neutral'
}

const getPriorityBorderClass = (priority: string) => {
  const classes: Record<string, string> = {
    'high': 'border-red-500',
    'medium': 'border-yellow-500',
    'low': 'border-green-500'
  }
  return classes[priority] || 'border-gray-300'
}
const getTrendBadgeColor = (trend: string) => {
  const colors: Record<string, string> = {
    'improving': 'success',
    'stable': 'info',
    'declining': 'error',
    'variable': 'warning'
  }
  return colors[trend] || 'neutral'
}


const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

const formatDateRange = (start: string, end: string) => {
  const startDate = new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endDate = new Date(end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${startDate} - ${endDate}`
}

const getActionText = (action: string) => {
  const texts: Record<string, string> = {
    'proceed': '✅ Proceed as Planned',
    'modify': '🔄 Modify Workout',
    'reduce_intensity': '📉 Reduce Intensity',
    'rest': '🛌 Rest Day Recommended'
  }
  return texts[action] || action
}

const handlePrint = () => {
  window.print()
}

useHead(() => {
  return {
    title: reportTitle.value || 'Report',
    meta: [
      { name: 'description', content: `Detailed training analysis and coaching insights for ${reportTitle.value}.` }
    ]
  }
})
</script>

<style scoped>
/* Print styles */
@media print {
  nav, .actions {
    display: none;
  }
}
</style>