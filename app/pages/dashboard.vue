<template>
  <UDashboardPanel id="dashboard">
    <template #header>
      <UDashboardNavbar title="Dashboard">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            v-if="intervalsConnected"
            @click="syncAllData"
            :loading="syncingData"
            :disabled="syncingData"
            size="sm"
          >
            <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 mr-2" />
            {{ syncingData ? 'Syncing...' : 'Sync Data' }}
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-6 space-y-6">
        <div>
          <h2 class="text-2xl font-bold">Welcome to Coach Watts!</h2>
          <p class="mt-2 text-muted">Your AI-powered cycling coach is ready to help you optimize your training.</p>
        </div>
      
        <!-- Row 1: Athlete Profile / Today's Training / Performance Overview -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
          <!-- Athlete Profile Card - shown when connected -->
          <UCard v-if="intervalsConnected" class="flex flex-col">
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-user-circle" class="w-5 h-5" />
                <h3 class="font-semibold">Athlete Profile</h3>
              </div>
            </template>
            
            <!-- Loading skeleton -->
            <div v-if="!profile" class="space-y-3 text-sm animate-pulse flex-grow">
              <div>
                <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-2"></div>
                <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-48"></div>
              </div>
              <div class="pt-2 border-t space-y-2">
                <div class="flex justify-between">
                  <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
                  <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
                </div>
                <div class="flex justify-between">
                  <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
                  <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
                </div>
                <div class="flex justify-between">
                  <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
                  <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
                </div>
              </div>
            </div>
            
            <!-- Actual profile data -->
            <div v-else class="space-y-3 text-sm flex-grow">
              <div>
                <p class="font-medium text-base">{{ profile.name || 'Athlete' }}</p>
                <p v-if="profile.age" class="text-muted text-xs mt-1">
                  {{ profile.age }} years old
                </p>
              </div>
              
              <div class="grid grid-cols-2 gap-3 pt-2 border-t">
                <div>
                  <p class="text-xs text-muted">FTP</p>
                  <p class="font-semibold">{{ profile.ftp ? `${profile.ftp}W` : 'Not set' }}</p>
                </div>
                <div>
                  <p class="text-xs text-muted">Weight</p>
                  <p class="font-semibold">{{ profile.weight ? `${profile.weight}kg` : 'N/A' }}</p>
                </div>
                <div>
                  <p class="text-xs text-muted">W/kg</p>
                  <p class="font-semibold">{{ profile.ftp && profile.weight ? (profile.ftp / profile.weight).toFixed(2) : 'N/A' }}</p>
                </div>
                <div>
                  <p class="text-xs text-muted">Resting HR</p>
                  <p class="font-semibold">{{ profile.restingHR ? `${profile.restingHR} bpm` : 'N/A' }}</p>
                </div>
                <div>
                  <p class="text-xs text-muted">Recent HRV</p>
                  <p class="font-semibold">{{ profile.recentHRV ? `${Math.round(profile.recentHRV)} ms` : 'N/A' }}</p>
                </div>
                <div>
                  <p class="text-xs text-muted">7d HRV avg</p>
                  <p class="font-semibold">{{ profile.avgRecentHRV ? `${Math.round(profile.avgRecentHRV)} ms` : 'N/A' }}</p>
                </div>
              </div>
            </div>
            
            <template #footer>
              <div class="flex gap-2">
                <UButton to="/profile/athlete" block variant="outline">
                  View Details
                </UButton>
                <UButton
                  variant="outline"
                  @click="generateAthleteProfile"
                  :loading="generatingProfile"
                  :disabled="generatingProfile"
                  icon="i-heroicons-arrow-path"
                >
                  Regenerate
                </UButton>
              </div>
            </template>
          </UCard>
          
          <!-- Today's Recommendation Card -->
          <UCard v-if="intervalsConnected" class="flex flex-col">
            <template #header>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <UIcon name="i-heroicons-light-bulb" class="w-5 h-5" />
                  <h3 class="font-semibold">Today's Training</h3>
                </div>
                <UBadge v-if="todayRecommendation" :color="getRecommendationColor(todayRecommendation.recommendation)">
                  {{ getRecommendationLabel(todayRecommendation.recommendation) }}
                </UBadge>
              </div>
            </template>
            
            <div v-if="loadingRecommendation || generatingRecommendation" class="text-sm text-muted py-4 text-center flex-grow">
              <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin inline" />
              <p class="mt-2">{{ generatingRecommendation ? 'Generating recommendation...' : 'Loading...' }}</p>
              <p v-if="generatingRecommendation" class="text-xs mt-1">This may take up to 60 seconds</p>
            </div>
            
            <div v-else-if="!todayRecommendation" class="flex-grow">
              <p class="text-sm text-muted">
                Get AI-powered guidance for today's training based on your recovery and planned workout.
              </p>
            </div>
            
            <div v-else class="flex-grow">
              <p class="text-sm">{{ todayRecommendation.reasoning }}</p>
              
              <div v-if="todayRecommendation.analysisJson?.suggested_modifications" class="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg mt-3">
                <p class="text-sm font-medium mb-2">Suggested Modification:</p>
                <p class="text-sm">{{ todayRecommendation.analysisJson.suggested_modifications.description }}</p>
              </div>
            </div>
            
            <template #footer>
              <div class="flex gap-2">
                <UButton
                  v-if="todayRecommendation && !generatingRecommendation"
                  variant="outline"
                  @click="openRecommendationModal"
                  block
                >
                  View Details
                </UButton>
                <UButton
                  variant="outline"
                  @click="generateTodayRecommendation"
                  :loading="generatingRecommendation"
                  :disabled="generatingRecommendation"
                  :block="!todayRecommendation || generatingRecommendation"
                  icon="i-heroicons-arrow-path"
                >
                  {{ generatingRecommendation ? 'Running...' : (todayRecommendation ? 'Refresh' : 'Get Recommendation') }}
                </UButton>
              </div>
            </template>
          </UCard>
          
          <!-- Performance Overview Card -->
          <UCard v-if="intervalsConnected" class="flex flex-col">
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-chart-bar" class="w-5 h-5" />
                <h3 class="font-semibold">Performance Overview</h3>
              </div>
            </template>
            
            <!-- Loading skeleton -->
            <div v-if="loadingScores" class="space-y-3 animate-pulse flex-grow">
              <div v-for="i in 4" :key="i" class="flex justify-between items-center">
                <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
                <div class="h-6 bg-gray-200 dark:bg-gray-700 rounded w-12"></div>
              </div>
            </div>
            
            <!-- Actual scores data -->
            <div v-else-if="profileScores" class="space-y-3 flex-grow">
              <div class="flex justify-between items-center">
                <span class="text-sm text-muted">Current Fitness</span>
                <UBadge :color="getScoreColor(profileScores.currentFitness)" size="lg">
                  {{ profileScores.currentFitness || 'N/A' }}
                </UBadge>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm text-muted">Recovery Capacity</span>
                <UBadge :color="getScoreColor(profileScores.recoveryCapacity)" size="lg">
                  {{ profileScores.recoveryCapacity || 'N/A' }}
                </UBadge>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm text-muted">Nutrition Compliance</span>
                <UBadge :color="getScoreColor(profileScores.nutritionCompliance)" size="lg">
                  {{ profileScores.nutritionCompliance || 'N/A' }}
                </UBadge>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm text-muted">Training Consistency</span>
                <UBadge :color="getScoreColor(profileScores.trainingConsistency)" size="lg">
                  {{ profileScores.trainingConsistency || 'N/A' }}
                </UBadge>
              </div>
              
              <div v-if="profileScores.lastUpdated" class="pt-2 border-t">
                <p class="text-xs text-muted text-center">
                  Updated {{ formatScoreDate(profileScores.lastUpdated) }}
                </p>
              </div>
            </div>
            
            <!-- No scores yet -->
            <div v-else class="text-center py-4 flex-grow">
              <p class="text-sm text-muted">
                Generate your athlete profile to see performance scores.
              </p>
            </div>
            
            <template #footer>
              <UButton to="/performance" block variant="outline">
                View Details
              </UButton>
            </template>
          </UCard>
          
          <!-- Getting Started Card - shown when not connected -->
          <UCard v-if="!intervalsConnected" class="flex flex-col">
            <template #header>
              <h3 class="font-semibold">Getting Started</h3>
            </template>
            <p class="text-sm text-muted flex-grow">
              Connect your Intervals.icu account to start analyzing your training data.
            </p>
            <template #footer>
              <UButton to="/settings" block>
                Connect Intervals.icu
              </UButton>
            </template>
          </UCard>
        </div>
        
        <!-- Row 2: Recent Activity / Next Steps / Connection Status -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <!-- Recent Activity Card -->
          <UCard class="lg:col-span-2">
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="font-semibold">Recent Activity</h3>
                <UBadge v-if="recentActivity && recentActivity.items.length > 0" color="neutral" variant="subtle">
                  Past 5 days
                </UBadge>
              </div>
            </template>
            
            <!-- Loading state -->
            <div v-if="loadingActivity" class="text-center py-8">
              <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin inline text-primary" />
              <p class="text-sm text-muted mt-2">Loading activity...</p>
            </div>
            
            <!-- No connection -->
            <div v-else-if="!intervalsConnected" class="text-center py-8">
              <UIcon name="i-heroicons-exclamation-circle" class="w-12 h-12 mx-auto text-muted mb-3" />
              <p class="text-sm text-muted">
                Connect your Intervals.icu account to see your recent activity.
              </p>
              <UButton to="/settings" color="primary" class="mt-4">
                Connect Now
              </UButton>
            </div>
            
            <!-- No activity -->
            <div v-else-if="!recentActivity || recentActivity.items.length === 0" class="text-center py-8">
              <UIcon name="i-heroicons-calendar" class="w-12 h-12 mx-auto text-muted mb-3" />
              <p class="text-sm text-muted">
                No recent activity found. Your data is syncing...
              </p>
            </div>
            
            <!-- Timeline -->
            <UTimeline v-else :items="recentActivity.items" class="max-h-96 overflow-y-auto">
              <template #default="{ item }">
                <div class="flex items-start justify-between gap-3">
                  <div class="flex-1 min-w-0">
                    <NuxtLink
                      v-if="item.link"
                      :to="item.link"
                      class="font-medium text-sm hover:text-primary transition-colors"
                    >
                      {{ item.title }}
                    </NuxtLink>
                    <p v-else class="font-medium text-sm">{{ item.title }}</p>
                    
                    <p v-if="item.description" class="text-xs text-muted mt-0.5">
                      {{ item.description }}
                    </p>
                  </div>
                  <time class="text-xs text-muted whitespace-nowrap">
                    {{ formatActivityDate(item.date) }}
                  </time>
                </div>
              </template>
            </UTimeline>
          </UCard>
          
          <!-- Next Steps Card - hidden when reports exist -->
          <UCard v-if="!hasReports">
            <template #header>
              <h3 class="font-semibold">Next Steps</h3>
            </template>
            <ul class="space-y-2 text-sm text-muted">
              <li class="flex items-center gap-2">
                <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-success" />
                Account created successfully
              </li>
              <li class="flex items-center gap-2">
                <UIcon
                  :name="intervalsConnected ? 'i-heroicons-check-circle' : 'i-heroicons-arrow-path'"
                  :class="intervalsConnected ? 'w-5 h-5 text-success' : 'w-5 h-5'"
                />
                Connect Intervals.icu
              </li>
              <li class="flex items-center gap-2">
                <UIcon
                  :name="intervalsConnected ? 'i-heroicons-check-circle' : 'i-heroicons-arrow-path'"
                  :class="intervalsConnected ? 'w-5 h-5 text-success' : 'w-5 h-5'"
                />
                Sync your training data
              </li>
              <li class="flex items-center gap-2">
                <UIcon name="i-heroicons-arrow-path" class="w-5 h-5" />
                Get your first AI coaching report
              </li>
            </ul>
          </UCard>
          
          <!-- Connection Status Card - shown when connected -->
          <UCard v-if="intervalsConnected">
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="font-semibold">Data Sync</h3>
                <UBadge color="success" variant="subtle">
                  <UIcon name="i-heroicons-check-circle" class="w-3 h-3" />
                  Connected
                </UBadge>
              </div>
            </template>
            
            <div class="space-y-3">
              <!-- Workouts -->
              <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-heroicons-bolt" class="w-4 h-4 text-primary" />
                    <span class="text-sm font-medium">Workouts</span>
                  </div>
                  <UBadge
                    :color="dataSyncStatus.workouts ? 'success' : 'neutral'"
                    variant="subtle"
                    size="sm"
                  >
                    {{ dataSyncStatus.workoutCount || 0 }} synced
                  </UBadge>
                </div>
                <p v-if="dataSyncStatus.workoutProviders?.length" class="text-xs text-muted mt-1 ml-6">
                  via {{ dataSyncStatus.workoutProviders.join(', ') }}
                </p>
              </div>
              
              <!-- Nutrition -->
              <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-heroicons-cake" class="w-4 h-4 text-primary" />
                    <span class="text-sm font-medium">Nutrition</span>
                  </div>
                  <UBadge
                    :color="dataSyncStatus.nutrition ? 'success' : 'neutral'"
                    variant="subtle"
                    size="sm"
                  >
                    {{ dataSyncStatus.nutritionCount || 0 }} days
                  </UBadge>
                </div>
                <p v-if="dataSyncStatus.nutritionProviders?.length" class="text-xs text-muted mt-1 ml-6">
                  via {{ dataSyncStatus.nutritionProviders.join(', ') }}
                </p>
              </div>
              
              <!-- Wellness -->
              <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-heroicons-heart" class="w-4 h-4 text-primary" />
                    <span class="text-sm font-medium">Wellness</span>
                  </div>
                  <UBadge
                    :color="dataSyncStatus.wellness ? 'success' : 'neutral'"
                    variant="subtle"
                    size="sm"
                  >
                    {{ dataSyncStatus.wellnessCount || 0 }} days
                  </UBadge>
                </div>
                <p v-if="dataSyncStatus.wellnessProviders?.length" class="text-xs text-muted mt-1 ml-6">
                  via {{ dataSyncStatus.wellnessProviders.join(', ') }}
                </p>
              </div>
              
              <!-- Last Sync Info -->
              <div v-if="lastSyncTime" class="text-xs text-muted text-center pt-2 border-t">
                Last synced {{ lastSyncTime }}
              </div>
            </div>
            
            <template #footer>
              <UButton to="/settings" block variant="outline" size="sm">
                Manage Connections
              </UButton>
            </template>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
  
  <!-- Recommendation Modal -->
  <UModal v-model:open="showRecommendationModal" title="Today's Training Recommendation">
    <template #body>
      <div v-if="todayRecommendation" class="space-y-4">
        <!-- Recommendation Badge -->
        <div class="text-center">
          <UBadge
            :color="getRecommendationColor(todayRecommendation.recommendation)"
            size="lg"
            class="text-lg px-4 py-2"
          >
            {{ getRecommendationLabel(todayRecommendation.recommendation) }}
          </UBadge>
          <p class="text-sm text-muted mt-2">Confidence: {{ (todayRecommendation.confidence * 100).toFixed(0) }}%</p>
        </div>
        
        <!-- Reasoning -->
        <div>
          <h4 class="font-medium mb-2">Why?</h4>
          <p class="text-sm text-muted">{{ todayRecommendation.reasoning }}</p>
        </div>
        
        <!-- Key Factors -->
        <div v-if="todayRecommendation.analysisJson?.key_factors">
          <h4 class="font-medium mb-2">Key Factors:</h4>
          <ul class="space-y-1">
            <li v-for="(factor, idx) in todayRecommendation.analysisJson.key_factors" :key="idx" class="text-sm flex gap-2">
              <UIcon name="i-heroicons-chevron-right" class="w-4 h-4 mt-0.5" />
              <span>{{ factor }}</span>
            </li>
          </ul>
        </div>
        
        <!-- Planned Workout -->
        <div v-if="todayRecommendation.analysisJson?.planned_workout">
          <h4 class="font-medium mb-2">Original Plan:</h4>
          <div class="bg-gray-50 dark:bg-gray-800 p-3 rounded">
            <p class="font-medium">{{ todayRecommendation.analysisJson.planned_workout.original_title }}</p>
            <p class="text-sm text-muted">
              {{ todayRecommendation.analysisJson.planned_workout.original_duration_min }} min •
              {{ todayRecommendation.analysisJson.planned_workout.original_tss }} TSS
            </p>
          </div>
        </div>
        
        <!-- Suggested Modifications -->
        <div v-if="todayRecommendation.analysisJson?.suggested_modifications">
          <h4 class="font-medium mb-2">Suggested Changes:</h4>
          <div class="bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
            <p class="font-medium">{{ todayRecommendation.analysisJson.suggested_modifications.new_title }}</p>
            <p class="text-sm text-muted mb-2">
              {{ todayRecommendation.analysisJson.suggested_modifications.new_duration_min }} min •
              {{ todayRecommendation.analysisJson.suggested_modifications.new_tss }} TSS
            </p>
            <p class="text-sm">{{ todayRecommendation.analysisJson.suggested_modifications.description }}</p>
          </div>
        </div>
      </div>
    </template>
    
    <template #footer>
      <div class="flex gap-2 justify-end">
        <UButton color="neutral" variant="outline" @click="showRecommendationModal = false">
          Close
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

const toast = useToast()

// Integration status - use lazy to avoid SSR issues
const { data: integrationStatus } = useFetch('/api/integrations/status', {
  lazy: true,
  server: false
})

const intervalsConnected = computed(() =>
  integrationStatus.value?.integrations?.some((i: any) => i.provider === 'intervals') ?? false
)

// Sync state
const syncingData = ref(false)

// Fetch athlete profile when connected (using fast cached endpoint)
const { data: profileData } = useFetch('/api/profile/dashboard', {
  lazy: true,
  server: false,
  watch: [intervalsConnected]
})


// Recommendation state
const showRecommendationModal = ref(false)
const todayRecommendation = ref<any>(null)
const loadingRecommendation = ref(false)
const generatingRecommendation = ref(false)
const generatingProfile = ref(false)
const currentRecommendationId = ref<string | null>(null) // Track the recommendation being generated

const profile = computed(() => profileData.value?.profile as any || null)
const hasReports = computed(() => profileData.value?.hasReports ?? false)
const dataSyncStatus = computed(() => profileData.value?.dataSyncStatus ?? {
  workouts: false,
  nutrition: false,
  wellness: false,
  workoutCount: 0,
  nutritionCount: 0,
  wellnessCount: 0,
  workoutProviders: [],
  nutritionProviders: [],
  wellnessProviders: []
})

// Calculate last sync time display
const lastSyncTime = computed(() => {
  if (!integrationStatus.value?.integrations) return null
  
  const intervalsIntegration = integrationStatus.value.integrations.find((i: any) => i.provider === 'intervals')
  if (!intervalsIntegration?.lastSyncAt) return null
  
  const lastSync = new Date(intervalsIntegration.lastSyncAt)
  const now = new Date()
  const diffMs = now.getTime() - lastSync.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins} min ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return lastSync.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
})

// Fetch athlete profile scores
const { data: scoresData, pending: loadingScores } = useFetch('/api/scores/athlete-profile', {
  lazy: true,
  server: false,
  watch: [intervalsConnected]
})

const profileScores = computed(() => scoresData.value?.scores || null)

// Recent activity state
const recentActivity = ref<any>(null)
const loadingActivity = ref(false)

// Fetch today's recommendation
async function fetchTodayRecommendation() {
  if (!intervalsConnected.value) {
    console.log('Intervals not connected, skipping recommendation fetch')
    return
  }
  
  try {
    console.log('Fetching today\'s recommendation...')
    loadingRecommendation.value = true
    const data = await $fetch('/api/recommendations/today')
    console.log('Recommendation fetched:', data)
    todayRecommendation.value = data
  } catch (error: any) {
    console.error('Error fetching recommendation:', error)
    // Don't show error if it's just 404 (no recommendation exists yet)
    if (error?.statusCode !== 404) {
      console.error('Unexpected error:', error)
    }
  } finally {
    loadingRecommendation.value = false
  }
}

// Generate new recommendation with improved polling
async function generateTodayRecommendation() {
  if (generatingRecommendation.value) {
    console.log('Already generating, skipping...')
    return
  }
  
  generatingRecommendation.value = true
  
  try {
    console.log('Triggering recommendation generation...')
    const result: any = await $fetch('/api/recommendations/today', { method: 'POST' })
    console.log('Generation triggered:', result)
    
    // Store the recommendation ID to track this specific generation
    currentRecommendationId.value = result.recommendationId
    
    // Immediately fetch and show the PROCESSING status
    await fetchTodayRecommendation()
    
    toast.add({
      title: 'Analysis Started',
      description: 'Analyzing your recovery and planned workout...',
      color: 'success',
      icon: 'i-heroicons-arrow-path'
    })
    
    // Poll for result
    let attempts = 0
    const maxAttempts = 15 // Poll for up to 75 seconds
    
    const pollForResult = async () => {
      attempts++
      console.log(`Polling attempt ${attempts}/${maxAttempts} for recommendation ${currentRecommendationId.value}`)
      
      try {
        await fetchTodayRecommendation()
        console.log('Current recommendation after fetch:', todayRecommendation.value)
        
        // Check if the current recommendation matches the one we're tracking
        if (todayRecommendation.value &&
            todayRecommendation.value.id === currentRecommendationId.value &&
            todayRecommendation.value.status === 'COMPLETED') {
          console.log('Recommendation completed!')
          generatingRecommendation.value = false
          currentRecommendationId.value = null
          
          toast.add({
            title: 'Analysis Complete',
            description: 'Your training recommendation is ready!',
            color: 'success',
            icon: 'i-heroicons-check-circle'
          })
          return
        }
      } catch (error) {
        console.error('Error during polling:', error)
      }
      
      if (attempts < maxAttempts) {
        // Continue polling with 5 second intervals
        console.log('Scheduling next poll in 5 seconds...')
        setTimeout(pollForResult, 5000)
      } else {
        console.log('Max polling attempts reached, stopping')
        generatingRecommendation.value = false
        currentRecommendationId.value = null
        
        toast.add({
          title: 'Analysis Taking Longer',
          description: 'The analysis is still running. Please check back in a moment.',
          color: 'warning',
          icon: 'i-heroicons-clock'
        })
      }
    }
    
    // Start polling after initial delay
    console.log('Starting polling in 3 seconds...')
    setTimeout(pollForResult, 3000)
    
  } catch (error: any) {
    console.error('Error generating recommendation:', error)
    generatingRecommendation.value = false
    currentRecommendationId.value = null
    
    toast.add({
      title: 'Generation Failed',
      description: error.data?.message || 'Failed to generate recommendation',
      color: 'error',
      icon: 'i-heroicons-exclamation-circle'
    })
  }
}

function openRecommendationModal() {
  console.log('Opening recommendation modal, current value:', todayRecommendation.value)
  showRecommendationModal.value = true
  console.log('Modal state set to:', showRecommendationModal.value)
}

function getRecommendationColor(rec: string): 'success' | 'warning' | 'error' | 'neutral' {
  const colors: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
    'proceed': 'success',
    'modify': 'warning',
    'reduce_intensity': 'warning',
    'rest': 'error'
  }
  return colors[rec] || 'neutral'
}

function getRecommendationLabel(rec: string) {
  const labels: Record<string, string> = {
    'proceed': '✓ Proceed as Planned',
    'modify': '⟳ Modify Workout',
    'reduce_intensity': '↓ Reduce Intensity',
    'rest': '⏸ Rest Day'
  }
  return labels[rec] || rec
}

// Generate athlete profile
async function generateAthleteProfile() {
  generatingProfile.value = true
  try {
    const result: any = await $fetch('/api/profile/generate', { method: 'POST' })
    
    toast.add({
      title: 'Profile Generation Started',
      description: 'Creating your comprehensive athlete profile. This may take a minute...',
      color: 'success',
      icon: 'i-heroicons-check-circle'
    })
    
    // Redirect to profile page after a delay
    setTimeout(() => {
      navigateTo('/profile/athlete')
    }, 2000)
    
  } catch (error: any) {
    toast.add({
      title: 'Generation Failed',
      description: error.data?.message || 'Failed to generate profile',
      color: 'error',
      icon: 'i-heroicons-exclamation-circle'
    })
  } finally {
    generatingProfile.value = false
  }
}

// Fetch recent activity
async function fetchRecentActivity() {
  if (!intervalsConnected.value) {
    console.log('Intervals not connected, skipping activity fetch')
    return
  }
  
  try {
    console.log('Fetching recent activity...')
    loadingActivity.value = true
    const data = await $fetch('/api/activity/recent')
    console.log('Recent activity fetched:', data)
    recentActivity.value = data
  } catch (error: any) {
    console.error('Error fetching recent activity:', error)
    // Don't show error toast for initial load
  } finally {
    loadingActivity.value = false
  }
}

// Format date for timeline display
function formatActivityDate(date: string | Date): string {
  const activityDate = new Date(date)
  const now = new Date()
  const diffMs = now.getTime() - activityDate.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) {
    return 'Today'
  } else if (diffDays === 1) {
    return 'Yesterday'
  } else if (diffDays < 7) {
    return `${diffDays} days ago`
  } else {
    return activityDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
}

// Helper to get score color
function getScoreColor(score: number | null): 'error' | 'warning' | 'success' | 'neutral' {
  if (!score) return 'neutral'
  if (score >= 8) return 'success'
  if (score >= 6) return 'warning'
  return 'error'
}

// Helper to format score date
function formatScoreDate(date: string | Date): string {
  const scoreDate = new Date(date)
  const now = new Date()
  const diffMs = now.getTime() - scoreDate.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) {
    return 'today'
  } else if (diffDays === 1) {
    return 'yesterday'
  } else if (diffDays < 7) {
    return `${diffDays} days ago`
  } else {
    return scoreDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
}

// Sync all data from integrations
async function syncAllData() {
  if (syncingData.value) return
  
  syncingData.value = true
  
  try {
    console.log('Triggering batch sync...')
    const result: any = await $fetch('/api/integrations/sync', {
      method: 'POST',
      body: { provider: 'all' }
    })
    
    console.log('Batch sync triggered:', result)
    
    toast.add({
      title: 'Data Sync Started',
      description: 'Syncing data from all connected integrations. This may take a minute...',
      color: 'success',
      icon: 'i-heroicons-arrow-path'
    })
    
    // Poll for completion and refresh data
    setTimeout(async () => {
      await fetchTodayRecommendation()
      await fetchRecentActivity()
      
      toast.add({
        title: 'Sync Complete',
        description: 'Your data has been updated successfully!',
        color: 'success',
        icon: 'i-heroicons-check-circle'
      })
    }, 10000)
    
  } catch (error: any) {
    console.error('Error syncing data:', error)
    
    toast.add({
      title: 'Sync Failed',
      description: error.data?.message || 'Failed to sync data. Please try again.',
      color: 'error',
      icon: 'i-heroicons-exclamation-circle'
    })
  } finally {
    syncingData.value = false
  }
}

// Watch for intervals connection and fetch data
watch(intervalsConnected, async (connected) => {
  console.log('Intervals connection changed:', connected)
  if (connected) {
    await fetchTodayRecommendation()
    await fetchRecentActivity()
  }
}, { immediate: true })
</script>