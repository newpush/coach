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
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                    <span :class="getAnalysisStatusBadgeClass((nutrition as any).aiAnalysisStatus)">
                      {{ getAnalysisStatusLabel((nutrition as any).aiAnalysisStatus) }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
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

// Fetch integration status
async function fetchStatus() {
  try {
    const response: any = await $fetch('/api/integrations/status')
    const integrations = response.integrations || []
    
    intervalsStatus.value = integrations.find((i: any) => i.provider === 'intervals')
    whoopStatus.value = integrations.find((i: any) => i.provider === 'whoop')
    yazioStatus.value = integrations.find((i: any) => i.provider === 'yazio')
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
    recentWorkouts.value = workouts.slice(0, 10)
  } catch (error) {
    console.error('Error fetching workouts:', error)
  } finally {
    loading.value = false
  }
}

// Fetch planned workouts
async function fetchPlannedWorkouts() {
  try {
    const planned = await $fetch('/api/planned-workouts', {
      query: { limit: 10 }
    })
    plannedWorkouts.value = planned
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
    
    // Sort by date descending and take last 14 days
    fitnessData.value = withData
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 14)
      
    console.log(`Fetched ${wellness.length} total wellness records, ${withData.length} with data, showing ${fitnessData.value.length}`)
  } catch (error) {
    console.error('Error fetching fitness data:', error)
  }
}

// Fetch nutrition data
async function fetchNutritionData() {
  try {
    console.log('Fetching nutrition data...')
    const response: any = await $fetch('/api/nutrition', {
      query: { limit: 14 }
    })
    console.log('Nutrition API response:', response)
    nutritionData.value = response.nutrition || []
    console.log(`Loaded ${nutritionData.value.length} nutrition entries`)
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