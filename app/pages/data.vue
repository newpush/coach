<template>
  <UDashboardPanel id="data">
    <template #header>
      <UDashboardNavbar title="Data Management">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-6 space-y-6">
        <div>
          <p class="text-sm text-muted">
            View and sync your training data from connected integrations
          </p>
        </div>

        <!-- Integration Status Cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <!-- Intervals.icu Card -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div class="flex items-center justify-between mb-4">
              <div>
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Intervals.icu</h2>
                <p class="text-sm text-gray-600 dark:text-gray-400">Training activities & wellness</p>
              </div>
              <div v-if="intervalsStatus" :class="getStatusClass(intervalsStatus.syncStatus)">
                {{ intervalsStatus.syncStatus || 'Not Connected' }}
              </div>
            </div>
            
            <div v-if="intervalsStatus" class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-600 dark:text-gray-400">Last Sync:</span>
                <span class="text-gray-900 dark:text-white">
                  {{ intervalsStatus.lastSyncAt ? formatDate(intervalsStatus.lastSyncAt) : 'Never' }}
                </span>
              </div>
              <div v-if="intervalsStatus.errorMessage" class="text-red-600 text-xs mt-2">
                {{ intervalsStatus.errorMessage }}
              </div>
            </div>

            <button
              @click="syncIntegration('intervals')"
              :disabled="syncing === 'intervals'"
              class="mt-4 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              <span v-if="syncing === 'intervals'">Syncing...</span>
              <span v-else>Sync Now</span>
            </button>
          </div>

          <!-- Whoop Card -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div class="flex items-center justify-between mb-4">
              <div>
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Whoop</h2>
                <p class="text-sm text-gray-600 dark:text-gray-400">Recovery & strain data</p>
              </div>
              <div v-if="whoopStatus" :class="getStatusClass(whoopStatus.syncStatus)">
                {{ whoopStatus.syncStatus || 'Not Connected' }}
              </div>
            </div>
            
            <div v-if="whoopStatus" class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-600 dark:text-gray-400">Last Sync:</span>
                <span class="text-gray-900 dark:text-white">
                  {{ whoopStatus.lastSyncAt ? formatDate(whoopStatus.lastSyncAt) : 'Never' }}
                </span>
              </div>
              <div v-if="whoopStatus.errorMessage" class="text-red-600 text-xs mt-2">
                {{ whoopStatus.errorMessage }}
              </div>
            </div>

            <button
              @click="syncIntegration('whoop')"
              :disabled="syncing === 'whoop'"
              class="mt-4 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              <span v-if="syncing === 'whoop'">Syncing...</span>
              <span v-else>Sync Now</span>
            </button>
          </div>

          <!-- Yazio Card -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div class="flex items-center justify-between mb-4">
              <div>
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Yazio</h2>
                <p class="text-sm text-gray-600 dark:text-gray-400">Nutrition tracking</p>
              </div>
              <div v-if="yazioStatus" :class="getStatusClass(yazioStatus.syncStatus)">
                {{ yazioStatus.syncStatus || 'Not Connected' }}
              </div>
            </div>
            
            <div v-if="yazioStatus" class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-600 dark:text-gray-400">Last Sync:</span>
                <span class="text-gray-900 dark:text-white">
                  {{ yazioStatus.lastSyncAt ? formatDate(yazioStatus.lastSyncAt) : 'Never' }}
                </span>
              </div>
              <div v-if="yazioStatus.errorMessage" class="text-red-600 text-xs mt-2">
                {{ yazioStatus.errorMessage }}
              </div>
            </div>

            <button
              @click="syncIntegration('yazio')"
              :disabled="syncing === 'yazio'"
              class="mt-4 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              <span v-if="syncing === 'yazio'">Syncing...</span>
              <span v-else>Sync Now</span>
            </button>
          </div>

          <!-- Strava Card -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div class="flex items-center justify-between mb-4">
              <div>
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Strava</h2>
                <p class="text-sm text-gray-600 dark:text-gray-400">Activity tracking</p>
              </div>
              <div v-if="stravaStatus" :class="getStatusClass(stravaStatus.syncStatus)">
                {{ stravaStatus.syncStatus || 'Not Connected' }}
              </div>
            </div>
            
            <div v-if="stravaStatus" class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-600 dark:text-gray-400">Last Sync:</span>
                <span class="text-gray-900 dark:text-white">
                  {{ stravaStatus.lastSyncAt ? formatDate(stravaStatus.lastSyncAt) : 'Never' }}
                </span>
              </div>
              <div v-if="stravaStatus.errorMessage" class="text-red-600 text-xs mt-2">
                {{ stravaStatus.errorMessage }}
              </div>
            </div>

            <button
              @click="syncIntegration('strava')"
              :disabled="syncing === 'strava'"
              class="mt-4 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              <span v-if="syncing === 'strava'">Syncing...</span>
              <span v-else>Sync Now</span>
            </button>
          </div>
        </div>

        <!-- Data Summary -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Data Summary</h2>
      
          <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div class="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div class="text-3xl font-bold text-blue-600 dark:text-blue-400">
                {{ dataSummary.workouts }}
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">Workouts</div>
            </div>
        
            <div class="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div class="text-3xl font-bold text-green-600 dark:text-green-400">
                {{ dataSummary.wellness }}
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">Wellness Entries</div>
            </div>
        
            <div class="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div class="text-3xl font-bold text-purple-600 dark:text-purple-400">
                {{ dataSummary.plannedWorkouts }}
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">Planned Workouts</div>
            </div>

            <div class="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div class="text-3xl font-bold text-orange-600 dark:text-orange-400">
                {{ dataSummary.nutrition }}
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">Nutrition Entries</div>
            </div>
          </div>
        </div>
        
        <!-- Fitness Data Table (WHOOP & Wellness) -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Fitness & Recovery Data</h2>
            <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">HRV, sleep, and recovery metrics from WHOOP and Intervals.icu</p>
          </div>
          
          <div v-if="loading" class="p-8 text-center text-gray-600 dark:text-gray-400">
            Loading...
          </div>
          
          <div v-else-if="fitnessData.length === 0" class="p-8 text-center text-gray-600 dark:text-gray-400">
            No fitness data found. Connect WHOOP and sync data to get started.
          </div>
          
          <div v-else class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Date
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Recovery
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    HRV
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Resting HR
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Sleep
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Sleep Score
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    SpO2
                  </th>
                </tr>
              </thead>
              <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-for="data in fitnessData" :key="data.id">
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {{ formatDate(data.date) }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm">
                    <span v-if="data.recoveryScore" :class="getRecoveryScoreClass(data.recoveryScore)">
                      {{ data.recoveryScore }}%
                    </span>
                    <span v-else class="text-gray-400">-</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ data.hrv ? Math.round(data.hrv) + ' ms' : '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ data.restingHr ? data.restingHr + ' bpm' : '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ data.sleepHours ? data.sleepHours + ' hrs' : '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm">
                    <span v-if="data.sleepScore" :class="getSleepScoreClass(data.sleepScore)">
                      {{ data.sleepScore }}%
                    </span>
                    <span v-else class="text-gray-400">-</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ data.spO2 ? data.spO2 + '%' : '-' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <!-- Fitness Pagination -->
          <div v-if="fitnessTotalPages > 1" class="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <div class="flex items-center justify-between">
              <div class="text-sm text-gray-600 dark:text-gray-400">
                Showing {{ (fitnessPage - 1) * fitnessItemsPerPage + 1 }} to {{ Math.min(fitnessPage * fitnessItemsPerPage, fitnessTotalItems) }} of {{ fitnessTotalItems }} entries
              </div>
              <div class="flex gap-2">
                <button
                  @click="changeFitnessPage(fitnessPage - 1)"
                  :disabled="fitnessPage === 1"
                  class="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Previous
                </button>
                <div class="flex gap-1">
                  <button
                    v-for="page in fitnessTotalPages"
                    :key="page"
                    @click="changeFitnessPage(page)"
                    :class="[
                      'px-3 py-1 rounded text-sm',
                      page === fitnessPage
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
                    ]"
                  >
                    {{ page }}
                  </button>
                </div>
                <button
                  @click="changeFitnessPage(fitnessPage + 1)"
                  :disabled="fitnessPage === fitnessTotalPages"
                  class="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Planned Workouts Section -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Upcoming Planned Workouts</h2>
          </div>
          
          <div v-if="loading" class="p-8 text-center text-gray-600 dark:text-gray-400">
            Loading...
          </div>
          
          <div v-else-if="plannedWorkouts.length === 0" class="p-8 text-center text-gray-600 dark:text-gray-400">
            No planned workouts found. Create workouts in Intervals.icu to see them here.
          </div>
          
          <div v-else class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Date
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Workout
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Type
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Duration
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    TSS
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-for="workout in plannedWorkouts" :key="workout.id">
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {{ formatDate(workout.date) }}
                  </td>
                  <td class="px-6 py-4 text-sm text-gray-900 dark:text-white">
                    {{ workout.title }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ workout.type || '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ workout.durationSec ? formatDuration(workout.durationSec) : '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ workout.tss ? Math.round(workout.tss) : '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm">
                    <span :class="workout.completed ? 'px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800' : 'px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800'">
                      {{ workout.completed ? 'Completed' : 'Planned' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <!-- Planned Workouts Pagination -->
          <div v-if="plannedWorkoutsTotalPages > 1" class="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <div class="flex items-center justify-between">
              <div class="text-sm text-gray-600 dark:text-gray-400">
                Showing {{ (plannedWorkoutsPage - 1) * plannedWorkoutsItemsPerPage + 1 }} to {{ Math.min(plannedWorkoutsPage * plannedWorkoutsItemsPerPage, plannedWorkoutsTotalItems) }} of {{ plannedWorkoutsTotalItems }} entries
              </div>
              <div class="flex gap-2">
                <button
                  @click="changePlannedWorkoutsPage(plannedWorkoutsPage - 1)"
                  :disabled="plannedWorkoutsPage === 1"
                  class="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Previous
                </button>
                <div class="flex gap-1">
                  <button
                    v-for="page in plannedWorkoutsTotalPages"
                    :key="page"
                    @click="changePlannedWorkoutsPage(page)"
                    :class="[
                      'px-3 py-1 rounded text-sm',
                      page === plannedWorkoutsPage
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
                    ]"
                  >
                    {{ page }}
                  </button>
                </div>
                <button
                  @click="changePlannedWorkoutsPage(plannedWorkoutsPage + 1)"
                  :disabled="plannedWorkoutsPage === plannedWorkoutsTotalPages"
                  class="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Recent Workouts Table -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Recent Workouts</h2>
            <button
              @click="analyzeAllWorkouts"
              :disabled="analyzingWorkouts"
              class="bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white font-medium py-2 px-3 rounded transition-colors text-sm"
            >
              <span v-if="analyzingWorkouts">Analyzing...</span>
              <span v-else>Analyze All</span>
            </button>
          </div>
      
          <div v-if="loading" class="p-8 text-center text-gray-600 dark:text-gray-400">
            Loading...
          </div>
      
          <div v-else-if="recentWorkouts.length === 0" class="p-8 text-center text-gray-600 dark:text-gray-400">
            No workouts found. Sync your data to get started.
          </div>
      
          <div v-else class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Date
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Activity
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Type
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Duration
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Load
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Score
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    AI Analysis
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Source
                  </th>
                </tr>
              </thead>
              <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                <tr
                  v-for="workout in recentWorkouts"
                  :key="workout.id"
                  @click="navigateToWorkout(workout.id)"
                  class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {{ formatDate(workout.date) }}
                  </td>
                  <td class="px-6 py-4 text-sm text-gray-900 dark:text-white">
                    {{ workout.title }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ workout.type }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ formatDuration(workout.durationSec) }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ workout.trainingLoad ? Math.round(workout.trainingLoad) : '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm">
                    <span v-if="workout.overallScore" :class="getScoreBadgeClass(workout.overallScore)">
                      {{ workout.overallScore }}/10
                    </span>
                    <span v-else class="text-gray-400">-</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm">
                    <span :class="getAnalysisStatusBadgeClass(workout.aiAnalysisStatus)">
                      {{ getAnalysisStatusLabel(workout.aiAnalysisStatus) }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm">
                    <span :class="getSourceBadgeClass(workout.source)">
                      {{ workout.source }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <!-- Workouts Pagination -->
          <div v-if="workoutsTotalItems > 0" class="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <div class="flex items-center justify-between">
              <div class="text-sm text-gray-600 dark:text-gray-400">
                Showing {{ (workoutsPage - 1) * workoutsItemsPerPage + 1 }} to {{ Math.min(workoutsPage * workoutsItemsPerPage, workoutsTotalItems) }} of {{ workoutsTotalItems }} entries
              </div>
              <div class="flex gap-2">
                <button
                  @click="changeWorkoutsPage(workoutsPage - 1)"
                  :disabled="workoutsPage === 1"
                  class="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Previous
                </button>
                <div class="flex gap-1">
                  <button
                    v-for="page in workoutsTotalPages"
                    :key="page"
                    @click="changeWorkoutsPage(page)"
                    :class="[
                      'px-3 py-1 rounded text-sm',
                      page === workoutsPage
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
                    ]"
                  >
                    {{ page }}
                  </button>
                </div>
                <button
                  @click="changeWorkoutsPage(workoutsPage + 1)"
                  :disabled="workoutsPage === workoutsTotalPages"
                  class="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Nutrition Data Table -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div class="flex justify-between items-center">
              <div>
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Nutrition Data</h2>
                <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">Daily calorie and macro tracking from Yazio</p>
              </div>
              <button
                @click="analyzeAllNutrition"
                :disabled="analyzingNutrition"
                class="bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white font-medium py-2 px-3 rounded transition-colors text-sm"
              >
                <span v-if="analyzingNutrition">Analyzing...</span>
                <span v-else>Analyze All</span>
              </button>
            </div>
          </div>
          
          <div v-if="loading" class="p-8 text-center text-gray-600 dark:text-gray-400">
            Loading...
          </div>
          
          <div v-else-if="nutritionData.length === 0" class="p-8 text-center text-gray-600 dark:text-gray-400">
            No nutrition data found. Connect Yazio and sync data to get started.
          </div>
          
          <div v-else class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Date
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Calories
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Protein
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Carbs
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Fat
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Water
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Score
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    AI Analysis
                  </th>
                </tr>
              </thead>
              <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                <tr
                  v-for="nutrition in nutritionData"
                  :key="nutrition.id"
                  @click="navigateToNutrition(nutrition.id)"
                  class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {{ formatDate(nutrition.date) }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    <span v-if="nutrition.calories">
                      {{ nutrition.calories }}
                      <span v-if="nutrition.caloriesGoal" class="text-xs text-gray-500">
                        / {{ nutrition.caloriesGoal }} kcal
                      </span>
                    </span>
                    <span v-else class="text-gray-400">-</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ nutrition.protein ? Math.round(nutrition.protein) + 'g' : '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ nutrition.carbs ? Math.round(nutrition.carbs) + 'g' : '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ nutrition.fat ? Math.round(nutrition.fat) + 'g' : '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ nutrition.waterMl ? (nutrition.waterMl / 1000).toFixed(1) + 'L' : '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm">
                    <span v-if="(nutrition as any).overallScore" :class="getScoreBadgeClass((nutrition as any).overallScore)">
                      {{ (nutrition as any).overallScore }}/10
                    </span>
                    <span v-else class="text-gray-400">-</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm">
                    <span :class="getAnalysisStatusBadgeClass((nutrition as any).aiAnalysisStatus)">
                      {{ getAnalysisStatusLabel((nutrition as any).aiAnalysisStatus) }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <!-- Nutrition Pagination -->
          <div v-if="nutritionTotalPages > 1" class="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <div class="flex items-center justify-between">
              <div class="text-sm text-gray-600 dark:text-gray-400">
                Showing {{ (nutritionPage - 1) * nutritionItemsPerPage + 1 }} to {{ Math.min(nutritionPage * nutritionItemsPerPage, nutritionTotalItems) }} of {{ nutritionTotalItems }} entries
              </div>
              <div class="flex gap-2">
                <button
                  @click="changeNutritionPage(nutritionPage - 1)"
                  :disabled="nutritionPage === 1"
                  class="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Previous
                </button>
                <div class="flex gap-1">
                  <button
                    v-for="page in nutritionTotalPages"
                    :key="page"
                    @click="changeNutritionPage(page)"
                    :class="[
                      'px-3 py-1 rounded text-sm',
                      page === nutritionPage
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
                    ]"
                  >
                    {{ page }}
                  </button>
                </div>
                <button
                  @click="changeNutritionPage(nutritionPage + 1)"
                  :disabled="nutritionPage === nutritionTotalPages"
                  class="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Next
                </button>
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

const toast = useToast()
const syncing = ref<string | null>(null)
const loading = ref(true)
const analyzingWorkouts = ref(false)
const analyzingNutrition = ref(false)
const intervalsStatus = ref<any>(null)
const whoopStatus = ref<any>(null)
const yazioStatus = ref<any>(null)
const stravaStatus = ref<any>(null)
const dataSummary = ref({
  workouts: 0,
  wellness: 0,
  dailyMetrics: 0,
  plannedWorkouts: 0,
  nutrition: 0
})
const recentWorkouts = ref<any[]>([])
const plannedWorkouts = ref<any[]>([])
const fitnessData = ref<any[]>([])
const nutritionData = ref<any[]>([])

// Pagination state
const fitnessPage = ref(1)
const fitnessItemsPerPage = 14
const fitnessTotalItems = ref(0)

const plannedWorkoutsPage = ref(1)
const plannedWorkoutsItemsPerPage = 10
const plannedWorkoutsTotalItems = ref(0)

const workoutsPage = ref(1)
const workoutsItemsPerPage = 15
const workoutsTotalItems = ref(0)

const nutritionPage = ref(1)
const nutritionItemsPerPage = 14
const nutritionTotalItems = ref(0)

// Fetch integration status
async function fetchStatus() {
  try {
    const response: any = await $fetch('/api/integrations/status')
    const integrations = response.integrations || []
    
    intervalsStatus.value = integrations.find((i: any) => i.provider === 'intervals')
    whoopStatus.value = integrations.find((i: any) => i.provider === 'whoop')
    yazioStatus.value = integrations.find((i: any) => i.provider === 'yazio')
    stravaStatus.value = integrations.find((i: any) => i.provider === 'strava')
  } catch (error) {
    console.error('Error fetching integration status:', error)
  }
}

// Fetch data summary
async function fetchDataSummary() {
  try {
    const [workouts, wellness, planned, nutrition] = await Promise.all([
      $fetch('/api/workouts').catch(e => { console.error('Workouts error:', e); return [] }),
      $fetch('/api/wellness').catch(e => { console.error('Wellness error:', e); return [] }),
      $fetch('/api/planned-workouts').catch(e => { console.error('Planned workouts error:', e); return [] }),
      $fetch('/api/nutrition').catch(e => { console.error('Nutrition error:', e); return { count: 0, nutrition: [] } })
    ])
    
    dataSummary.value.workouts = Array.isArray(workouts) ? workouts.length : 0
    dataSummary.value.wellness = Array.isArray(wellness) ? wellness.length : 0
    dataSummary.value.plannedWorkouts = Array.isArray(planned) ? planned.length : 0
    dataSummary.value.nutrition = (nutrition as any)?.count || 0
  } catch (error) {
    console.error('Error fetching data summary:', error)
  }
}

// Fetch recent workouts
async function fetchRecentWorkouts() {
  loading.value = true
  try {
    const workouts = await $fetch('/api/workouts')
    workoutsTotalItems.value = workouts.length
    const start = (workoutsPage.value - 1) * workoutsItemsPerPage
    const end = start + workoutsItemsPerPage
    recentWorkouts.value = workouts.slice(start, end)
  } catch (error) {
    console.error('Error fetching workouts:', error)
  } finally {
    loading.value = false
  }
}

// Fetch planned workouts
async function fetchPlannedWorkouts() {
  try {
    const planned = await $fetch('/api/planned-workouts')
    plannedWorkoutsTotalItems.value = planned.length
    const start = (plannedWorkoutsPage.value - 1) * plannedWorkoutsItemsPerPage
    const end = start + plannedWorkoutsItemsPerPage
    plannedWorkouts.value = planned.slice(start, end)
  } catch (error) {
    console.error('Error fetching planned workouts:', error)
  }
}

// Fetch fitness data
async function fetchFitnessData() {
  try {
    const wellness = await $fetch('/api/wellness', {
      query: { limit: 90 }
    })
    
    // Filter records that have at least some data (not all nulls)
    const withData = wellness.filter((w: any) =>
      w.hrv !== null || w.restingHr !== null || w.recoveryScore !== null ||
      w.sleepScore !== null || w.sleepHours !== null
    )
    
    // Sort by date descending
    const sorted = withData.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
    
    fitnessTotalItems.value = sorted.length
    const start = (fitnessPage.value - 1) * fitnessItemsPerPage
    const end = start + fitnessItemsPerPage
    fitnessData.value = sorted.slice(start, end)
      
    console.log(`Fetched ${wellness.length} total wellness records, ${withData.length} with data, showing ${fitnessData.value.length} on page ${fitnessPage.value}`)
  } catch (error) {
    console.error('Error fetching fitness data:', error)
  }
}

// Fetch nutrition data
async function fetchNutritionData() {
  try {
    console.log('Fetching nutrition data...')
    const response: any = await $fetch('/api/nutrition')
    console.log('Nutrition API response:', response)
    const allNutrition = response.nutrition || []
    nutritionTotalItems.value = allNutrition.length
    const start = (nutritionPage.value - 1) * nutritionItemsPerPage
    const end = start + nutritionItemsPerPage
    nutritionData.value = allNutrition.slice(start, end)
    console.log(`Loaded ${nutritionData.value.length} nutrition entries on page ${nutritionPage.value}`)
  } catch (error) {
    console.error('Error fetching nutrition data:', error)
    nutritionData.value = []
  }
}

// Sync integration
async function syncIntegration(provider: string) {
  syncing.value = provider
  try {
    const response: any = await $fetch('/api/integrations/sync', {
      method: 'POST',
      body: { provider }
    })
    
    // Show success message with job details
    toast.add({
      title: 'Sync Started Successfully',
      description: `${provider.charAt(0).toUpperCase() + provider.slice(1)} data sync is now running. Job ID: ${response.jobId?.slice(0, 8)}...`,
      color: 'success',
      icon: 'i-heroicons-check-circle'
    })
    
    // Update status immediately to show SYNCING state
    await fetchStatus()
    
    // Refresh data after a delay to show results
    setTimeout(async () => {
      await fetchStatus()
      await fetchDataSummary()
      await fetchRecentWorkouts()
      await fetchFitnessData()
      await fetchPlannedWorkouts()
      await fetchNutritionData()
      
      // Show completion notification if successful
      if (provider === 'intervals' && intervalsStatus.value?.syncStatus === 'SUCCESS') {
        toast.add({
          title: 'Sync Completed',
          description: `${provider.charAt(0).toUpperCase() + provider.slice(1)} data has been successfully synced`,
          color: 'success',
          icon: 'i-heroicons-check-badge'
        })
      } else if (provider === 'whoop' && whoopStatus.value?.syncStatus === 'SUCCESS') {
        toast.add({
          title: 'Sync Completed',
          description: `${provider.charAt(0).toUpperCase() + provider.slice(1)} data has been successfully synced`,
          color: 'success',
          icon: 'i-heroicons-check-badge'
        })
      } else if (provider === 'yazio' && yazioStatus.value?.syncStatus === 'SUCCESS') {
        toast.add({
          title: 'Sync Completed',
          description: `${provider.charAt(0).toUpperCase() + provider.slice(1)} data has been successfully synced`,
          color: 'success',
          icon: 'i-heroicons-check-badge'
        })
      } else if (provider === 'strava' && stravaStatus.value?.syncStatus === 'SUCCESS') {
        toast.add({
          title: 'Sync Completed',
          description: 'Strava data has been successfully synced',
          color: 'success',
          icon: 'i-heroicons-check-badge'
        })
      }
    }, 5000)
  } catch (error: any) {
    const errorMessage = error.data?.message || error.message
    const isTriggerError = errorMessage.includes('Trigger.dev')
    
    toast.add({
      title: 'Sync Failed',
      description: isTriggerError
        ? `${errorMessage}`
        : `Error syncing ${provider}: ${errorMessage}`,
      color: 'error',
      icon: 'i-heroicons-exclamation-circle'
    })
    
    console.error(`Sync error for ${provider}:`, error)
  } finally {
    syncing.value = null
  }
}

// Utility functions
function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

function getStatusClass(status: string | undefined) {
  const baseClass = 'px-3 py-1 rounded-full text-xs font-semibold'
  if (status === 'SUCCESS') return `${baseClass} bg-green-100 text-green-800`
  if (status === 'SYNCING') return `${baseClass} bg-blue-100 text-blue-800`
  if (status === 'FAILED') return `${baseClass} bg-red-100 text-red-800`
  return `${baseClass} bg-gray-100 text-gray-800`
}

function getSourceBadgeClass(source: string) {
  const baseClass = 'px-2 py-1 rounded text-xs font-medium'
  if (source === 'intervals') return `${baseClass} bg-blue-100 text-blue-800`
  if (source === 'whoop') return `${baseClass} bg-purple-100 text-purple-800`
  if (source === 'strava') return `${baseClass} bg-orange-100 text-orange-800`
  return `${baseClass} bg-gray-100 text-gray-800`
}

function getAnalysisStatusBadgeClass(status: string | null | undefined) {
  const baseClass = 'px-2 py-1 rounded text-xs font-medium'
  if (status === 'COMPLETED') return `${baseClass} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`
  if (status === 'PROCESSING') return `${baseClass} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`
  if (status === 'PENDING') return `${baseClass} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`
  if (status === 'FAILED') return `${baseClass} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`
  return `${baseClass} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300`
}

function getAnalysisStatusLabel(status: string | null | undefined) {
  if (status === 'COMPLETED') return '✓ Complete'
  if (status === 'PROCESSING') return '⟳ Processing'
  if (status === 'PENDING') return '⋯ Pending'
  if (status === 'FAILED') return '✗ Failed'
  return '− Not Started'
}

// Navigate to workout detail page
function navigateToWorkout(id: string) {
  navigateTo(`/workouts/${id}`)
}

// Navigate to nutrition detail page
function navigateToNutrition(id: string) {
  navigateTo(`/nutrition/${id}`)
}

function getRecoveryScoreClass(score: number) {
  const baseClass = 'px-2 py-1 rounded text-xs font-semibold'
  if (score >= 67) return `${baseClass} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`
  if (score >= 34) return `${baseClass} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`
  return `${baseClass} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`
}

function getSleepScoreClass(score: number) {
  const baseClass = 'px-2 py-1 rounded text-xs font-semibold'
  if (score >= 75) return `${baseClass} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`
  if (score >= 50) return `${baseClass} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`
  return `${baseClass} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`
}

function getScoreBadgeClass(score: number) {
  const baseClass = 'px-2 py-1 rounded text-xs font-semibold'
  if (score >= 8) return `${baseClass} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`
  if (score >= 6) return `${baseClass} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`
  if (score >= 4) return `${baseClass} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`
  return `${baseClass} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`
}

// Analyze all workouts
async function analyzeAllWorkouts() {
  analyzingWorkouts.value = true
  try {
    const response: any = await $fetch('/api/workouts/analyze-all', {
      method: 'POST'
    })
    
    toast.add({
      title: 'Analysis Started',
      description: response.message,
      color: 'success',
      icon: 'i-heroicons-check-circle'
    })
    
    // Refresh the workouts list after a short delay
    setTimeout(async () => {
      await fetchRecentWorkouts()
    }, 2000)
  } catch (error: any) {
    toast.add({
      title: 'Analysis Failed',
      description: error.data?.message || error.message || 'Failed to start analysis',
      color: 'error',
      icon: 'i-heroicons-exclamation-circle'
    })
  } finally {
    analyzingWorkouts.value = false
  }
}

// Analyze all nutrition records
async function analyzeAllNutrition() {
  analyzingNutrition.value = true
  try {
    const response: any = await $fetch('/api/nutrition/analyze-all', {
      method: 'POST'
    })
    
    toast.add({
      title: 'Analysis Started',
      description: response.message,
      color: 'success',
      icon: 'i-heroicons-check-circle'
    })
    
    // Refresh the nutrition list after a short delay
    setTimeout(async () => {
      await fetchNutritionData()
    }, 2000)
  } catch (error: any) {
    toast.add({
      title: 'Analysis Failed',
      description: error.data?.message || error.message || 'Failed to start analysis',
      color: 'error',
      icon: 'i-heroicons-exclamation-circle'
    })
  } finally {
    analyzingNutrition.value = false
  }
}

// Computed properties for pagination
const fitnessTotalPages = computed(() => Math.ceil(fitnessTotalItems.value / fitnessItemsPerPage))
const plannedWorkoutsTotalPages = computed(() => Math.ceil(plannedWorkoutsTotalItems.value / plannedWorkoutsItemsPerPage))
const workoutsTotalPages = computed(() => Math.ceil(workoutsTotalItems.value / workoutsItemsPerPage))
const nutritionTotalPages = computed(() => Math.ceil(nutritionTotalItems.value / nutritionItemsPerPage))

// Pagination handlers
function changeFitnessPage(page: number) {
  fitnessPage.value = page
  fetchFitnessData()
}

function changePlannedWorkoutsPage(page: number) {
  plannedWorkoutsPage.value = page
  fetchPlannedWorkouts()
}

function changeWorkoutsPage(page: number) {
  workoutsPage.value = page
  fetchRecentWorkouts()
}

function changeNutritionPage(page: number) {
  nutritionPage.value = page
  fetchNutritionData()
}

// Load data on mount
onMounted(async () => {
  await fetchStatus()
  await fetchDataSummary()
  await fetchRecentWorkouts()
  await fetchFitnessData()
  await fetchPlannedWorkouts()
  await fetchNutritionData()
})
</script>