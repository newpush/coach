<template>
  <UDashboardPanel id="dashboard">
    <template #header>
      <UDashboardNavbar title="Dashboard">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <UButton
              to="/workouts/upload"
              icon="i-heroicons-cloud-arrow-up"
              color="neutral"
              variant="outline"
              size="sm"
              class="font-bold"
            >
              Upload
            </UButton>
            <UButton
              v-if="integrationStore?.intervalsConnected"
              @click="integrationStore.syncAllData"
              :loading="integrationStore.syncingData"
              :disabled="integrationStore.syncingData"
              color="neutral"
              variant="outline"
              icon="i-heroicons-arrow-path"
              size="sm"
              class="font-bold"
            >
              Sync Data
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <ClientOnly>
        <!-- Onboarding View (New User) -->
        <div v-if="!integrationStore?.intervalsConnected" class="p-6 max-w-6xl mx-auto">
          <DashboardOnboardingView />
        </div>

        <!-- Dashboard Grid (Connected User) -->
        <div v-else class="p-6 space-y-8">
          <DashboardMissingDataBanner v-if="missingFields.length > 0" :missing-fields="missingFields" />

          <div>
            <h1 class="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Welcome back</h1>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400 font-medium">Your AI-powered endurance coach is analyzing your latest data.</p>
          </div>
        
          <!-- Row 1: Athlete Profile / Today's Training / Performance Overview -->
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
            <!-- Athlete Profile Card - shown when connected -->
            <DashboardAthleteProfileCard @open-wellness="openWellnessModal" />
            
            <!-- Today's Recommendation Card -->
            <DashboardTrainingRecommendationCard @open-details="openRecommendationModal" />
            
            <!-- Performance Overview Card -->
            <DashboardPerformanceScoresCard @open-score-modal="openScoreModal" />
            
          </div>
          
          <!-- Row 2: Recent Activity / Next Steps / Connection Status -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <!-- Recent Activity Card -->
            <DashboardRecentActivityCard />
            
            <!-- Connection Status Card - only shown if syncing is in progress or issues -->
            <DashboardDataSyncStatusCard v-if="integrationStore.syncingData" />
          </div>
          
          <!-- App Info Footer -->
          <div class="flex justify-center pt-8 pb-4">
             <UButton
              to="/settings/changelog"
              variant="ghost"
              color="neutral"
              size="xs"
              class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              v{{ config.public.version }}
            </UButton>
          </div>
        </div>
      </ClientOnly>
    </template>

  </UDashboardPanel>
  
  <!-- Wellness Modal -->
  <WellnessModal
    v-model:open="showWellnessModal"
    :date="wellnessModalDate"
  />

  <!-- Recommendation Modal -->
  <DashboardRecommendationDetailModal 
    v-model:open="showRecommendationModal"
    :recommendation="recommendationStore.todayRecommendation"
  />

  <!-- Score Detail Modal -->
  <ScoreDetailModal
    v-if="showScoreModal"
    v-model="showScoreModal"
    :title="scoreModalData.title"
    :score="scoreModalData.score"
    :explanation="scoreModalData.explanation"
    :analysis-data="scoreModalData.analysisData"
    :color="scoreModalData.color"
  />
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

useHead({
  title: 'Dashboard',
  meta: [
    { name: 'description', content: 'Your daily athlete dashboard. Monitor your recovery, check today\'s training recommendation, and review your performance trends.' }
  ]
})

const config = useRuntimeConfig()

const integrationStore = useIntegrationStore()
const userStore = useUserStore()
const recommendationStore = useRecommendationStore()
const activityStore = useActivityStore()

const missingFields = computed(() => userStore.profile?.missingFields || [])

// Initial data fetch
onMounted(async () => {
    await integrationStore.fetchStatus()
    if (integrationStore.intervalsConnected) {
        await Promise.all([
            userStore.fetchProfile(),
            recommendationStore.fetchTodayRecommendation(),
            activityStore.fetchRecentActivity()
        ])
    }
})

// Watch for connection changes
watch(() => integrationStore.intervalsConnected, async (connected) => {
    if (connected) {
        await Promise.all([
            userStore.fetchProfile(),
            recommendationStore.fetchTodayRecommendation(),
            activityStore.fetchRecentActivity()
        ])
    }
})

// Recommendation state
const showRecommendationModal = ref(false)

// Wellness modal state
const showWellnessModal = ref(false)
const wellnessModalDate = ref<Date | null>(null)

// Score detail modal state
const showScoreModal = ref(false)
const scoreModalData = ref<{
  title: string
  score: number | null
  explanation: string | null
  analysisData?: any
  color?: 'gray' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'cyan'
}>({
  title: '',
  score: null,
  explanation: null,
  analysisData: undefined,
  color: undefined
})


function openRecommendationModal() {
  showRecommendationModal.value = true
}

// Wellness modal handlers
function openWellnessModal() {
  // Use today's date or the latest wellness date
  wellnessModalDate.value = userStore.profile?.latestWellnessDate
    ? new Date(userStore.profile.latestWellnessDate)
    : new Date()
  showWellnessModal.value = true
}


// Function to open score detail modal
function openScoreModal(data: any) {
  scoreModalData.value = data
  showScoreModal.value = true
}
</script>
