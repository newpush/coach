<template>
  <UDashboardPanel id="dashboard">
    <template #header>
      <UDashboardNavbar title="Dashboard">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <div class="flex items-center gap-3">
            <DashboardReleaseNotification />
            <UButton
              to="/workouts/upload"
              icon="i-heroicons-cloud-arrow-up"
              color="neutral"
              variant="outline"
              size="sm"
              class="font-bold"
            >
              <span class="hidden sm:inline">Upload</span>
            </UButton>
            <UButton
              to="/chat"
              icon="i-heroicons-chat-bubble-left-right"
              color="primary"
              variant="solid"
              size="sm"
              class="font-bold"
            >
              <span class="hidden sm:inline">New Chat</span>
              <span class="sm:hidden">Chat</span>
            </UButton>
            <UButton
              v-if="integrationStore?.intervalsConnected"
              :loading="integrationStore.syncingData"
              :disabled="integrationStore.syncingData"
              color="neutral"
              variant="outline"
              icon="i-heroicons-arrow-path"
              size="sm"
              class="font-bold"
              @click="integrationStore.syncAllData"
            >
              <span class="hidden sm:inline">Sync Data</span>
              <span class="sm:hidden">Sync</span>
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <ClientOnly>
        <!-- Loading State -->
        <div v-if="isLoading" class="flex justify-center items-center py-24 min-h-[60vh]">
          <UIcon name="i-heroicons-arrow-path" class="w-10 h-10 animate-spin text-primary-500" />
        </div>

        <!-- Onboarding View (New User) -->
        <div v-else-if="!integrationStore?.intervalsConnected" class="p-4 sm:p-6 max-w-6xl mx-auto">
          <DashboardOnboardingView />
        </div>

        <!-- Dashboard Grid (Connected User) -->
        <div v-else class="p-3 sm:p-6 space-y-4 sm:space-y-8">
          <DashboardMissingDataBanner
            v-if="missingFields.length > 0"
            :missing-fields="missingFields"
          />

          <UCard v-if="showWelcome" class="mb-4">
            <div class="flex justify-between items-start">
              <div>
                <h1 class="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                  Welcome back
                </h1>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400 font-medium">
                  Your AI-powered endurance coach is analyzing your latest data.
                </p>
              </div>
              <UButton
                icon="i-heroicons-x-mark"
                color="neutral"
                variant="ghost"
                size="sm"
                @click="showWelcome = false"
              />
            </div>
          </UCard>

          <!-- Row 1: Athlete Profile / Today's Training / Performance Overview -->
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-6 items-stretch">
            <!-- Athlete Profile Card - shown when connected -->
            <DashboardAthleteProfileCard
              @open-wellness="openWellnessModal"
              @open-training-load="openTrainingLoadModal"
            />

            <!-- Today's Recommendation Card -->
            <DashboardTrainingRecommendationCard
              @open-details="openRecommendationModal"
              @open-checkin="openCheckinModal"
            />

            <!-- Performance Overview Card -->
            <DashboardPerformanceScoresCard
              @open-score-modal="openScoreModal"
              @open-training-load="openTrainingLoadModal"
            />
          </div>

          <!-- Row 2: Recent Activity / Next Steps / Connection Status -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
            <!-- Recent Activity Card -->
            <DashboardRecentActivityCard />

            <!-- Upcoming Workouts Card -->
            <UCard class="flex flex-col">
              <template #header>
                <div class="flex items-center justify-between">
                  <h3
                    class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest flex items-center gap-2"
                  >
                    <UIcon name="i-heroicons-calendar-days" class="w-4 h-4" />
                    Upcoming Workouts
                  </h3>
                  <UButton
                    to="/plan"
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    icon="i-heroicons-arrow-right"
                    trailing
                  />
                </div>
              </template>

              <div class="flex-1 space-y-4">
                <div v-if="loadingUpcoming" class="space-y-3">
                  <div v-for="i in 3" :key="i" class="flex items-center gap-3">
                    <USkeleton class="w-10 h-10 rounded-lg" />
                    <div class="flex-1 space-y-2">
                      <USkeleton class="h-3 w-3/4" />
                      <USkeleton class="h-2 w-1/2" />
                    </div>
                  </div>
                </div>

                <div v-else-if="upcomingWorkouts.length === 0" class="text-center py-8">
                  <UIcon
                    name="i-heroicons-calendar"
                    class="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2"
                  />
                  <p class="text-sm text-gray-500">No upcoming workouts scheduled.</p>
                  <UButton to="/plans" variant="link" color="primary" size="xs" class="mt-2"
                    >View Plans</UButton
                  >
                </div>

                <div v-else class="divide-y divide-gray-100 dark:divide-gray-800 -mx-4 px-4">
                  <div
                    v-for="workout in upcomingWorkouts"
                    :key="workout.id"
                    class="py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer -mx-4 px-4 rounded-lg transition-colors"
                    @click="navigateTo(`/workouts/planned/${workout.id}`)"
                  >
                    <div
                      class="flex flex-col items-center justify-center w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary shrink-0"
                    >
                      <span class="text-[10px] font-bold uppercase leading-none">{{
                        formatDayShort(workout.date)
                      }}</span>
                      <span class="text-sm font-bold">{{ formatDateDay(workout.date) }}</span>
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-sm font-bold text-gray-900 dark:text-white truncate">
                        {{ workout.title }}
                      </div>
                      <div class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                        <span>{{ workout.type }}</span>
                        <span v-if="workout.durationSec"
                          >• {{ Math.round(workout.durationSec / 60) }}m</span
                        >
                        <span v-if="workout.tss">• {{ Math.round(workout.tss) }} TSS</span>
                      </div>
                    </div>
                    <UIcon name="i-heroicons-chevron-right" class="w-4 h-4 text-gray-300" />
                  </div>
                </div>
              </div>
            </UCard>

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
              class="text-gray-500 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300"
            >
              v{{ config.public.version }}+{{ config.public.buildDate }}.{{
                config.public.commitHash
              }}
            </UButton>
          </div>
        </div>
      </ClientOnly>
    </template>
  </UDashboardPanel>

  <!-- Wellness Modal -->
  <WellnessModal v-model:open="showWellnessModal" :date="wellnessModalDate" />

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

  <!-- Training Load Modal -->
  <TrainingLoadModal v-model:open="showTrainingLoadModal" />

  <!-- Daily Check-in Modal -->
  <DashboardDailyCheckinModal v-model:open="showCheckinModal" />
</template>

<script setup lang="ts">
  import { useLocalStorage } from '@vueuse/core'

  const { formatDate, getUserLocalDate } = useFormat()

  definePageMeta({
    middleware: 'auth'
  })

  useHead({
    title: 'Dashboard',
    meta: [
      {
        name: 'description',
        content:
          "Your daily athlete dashboard. Monitor your recovery, check today's training recommendation, and review your performance trends."
      }
    ]
  })

  const config = useRuntimeConfig()

  const integrationStore = useIntegrationStore()
  const userStore = useUserStore()
  const recommendationStore = useRecommendationStore()
  const activityStore = useActivityStore()
  const checkinStore = useCheckinStore()

  const showWelcome = useLocalStorage('dashboard-welcome-banner', true)

  const upcomingWorkouts = ref<any[]>([])
  const loadingUpcoming = ref(false)
  const isLoading = ref(true)

  const missingFields = computed(() => userStore.profile?.missingFields || [])

  async function fetchUpcomingWorkouts() {
    loadingUpcoming.value = true
    try {
      const { plan } = await $fetch<{ plan: any }>('/api/plans/active')
      if (plan) {
        const today = getUserLocalDate()
        const todayTime = today.getTime()

        // Flatten all workouts from all blocks and weeks
        const allWorkouts = plan.blocks.flatMap((b: any) => b.weeks.flatMap((w: any) => w.workouts))

        // Filter for future workouts, sort by date, and take the next 5
        upcomingWorkouts.value = allWorkouts
          .filter((w: any) => new Date(w.date).getTime() >= todayTime && !w.completed)
          .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .slice(0, 5)
      }
    } catch (error) {
      console.error('Failed to fetch upcoming workouts:', error)
    } finally {
      loadingUpcoming.value = false
    }
  }

  function formatDayShort(d: string) {
    return formatDate(d, 'EEE')
  }

  function formatDateDay(d: string) {
    return formatDate(d, 'd')
  }

  // Initial data fetch
  onMounted(async () => {
    try {
      await integrationStore.fetchStatus()
      if (integrationStore.intervalsConnected) {
        await Promise.all([
          userStore.fetchProfile(),
          recommendationStore.fetchTodayRecommendation(),
          activityStore.fetchRecentActivity(),
          fetchUpcomingWorkouts(),
          checkinStore.fetchToday()
        ])
      }
    } finally {
      isLoading.value = false
    }
  })

  // Watch for connection changes
  watch(
    () => integrationStore.intervalsConnected,
    async (connected) => {
      if (connected) {
        await Promise.all([
          userStore.fetchProfile(),
          recommendationStore.fetchTodayRecommendation(),
          activityStore.fetchRecentActivity(),
          fetchUpcomingWorkouts(),
          checkinStore.fetchToday()
        ])
      }
    }
  )

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
      : getUserLocalDate()
    showWellnessModal.value = true
  }

  // Function to open score detail modal
  function openScoreModal(data: any) {
    scoreModalData.value = data
    showScoreModal.value = true
  }

  // Training Load modal
  const showTrainingLoadModal = ref(false)

  function openTrainingLoadModal() {
    showTrainingLoadModal.value = true
  }

  // Daily Check-in Modal
  const showCheckinModal = ref(false)
  function openCheckinModal() {
    showCheckinModal.value = true
  }

  useHead({
    title: 'Dashboard',
    meta: [
      {
        name: 'description',
        content:
          'Your training overview, recovery status, and personalized AI coaching recommendations.'
      },
      { property: 'og:title', content: 'Dashboard | Coach Watts' },
      {
        property: 'og:description',
        content:
          'Your training overview, recovery status, and personalized AI coaching recommendations.'
      }
    ]
  })
</script>
