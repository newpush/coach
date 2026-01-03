<template>
  <UDashboardPanel id="athlete-profile">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse />
          <UButton
            icon="i-heroicons-arrow-left"
            color="neutral"
            variant="ghost"
            to="/dashboard"
            size="sm"
          />
          <USeparator orientation="vertical" class="h-4" />
          <span class="text-sm sm:text-base font-semibold truncate max-w-[100px] sm:max-w-none">Athlete Profile</span>
        </template>
        <template #right>
          <div class="flex items-center gap-1 sm:gap-2">
            <UButton
              v-if="profile && profile.status === 'COMPLETED'"
              color="neutral"
              variant="outline"
              icon="i-heroicons-share"
              size="sm"
              class="font-bold"
              @click="isShareModalOpen = true"
            >
              <span class="hidden sm:inline">Share</span>
            </UButton>

            <UPopover>
              <UButton color="neutral" variant="subtle" icon="i-heroicons-calendar" size="sm" class="font-bold">
                <span class="hidden sm:inline">{{ selectedDateLabel }}</span>
              </UButton>

              <template #content>
                <div class="p-2">
                  <UCalendar
                    :model-value="selectedDate as any"
                    :max-value="today"
                    @update:model-value="(val) => handleDateChange(val as any)"
                  />
                  <div class="mt-2 pt-2 border-t flex justify-end">
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      @click="resetToLatest"
                    >
                      View Latest
                    </UButton>
                  </div>
                </div>
              </template>
            </UPopover>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-6 max-w-4xl mx-auto">
        <div v-if="pending" class="flex justify-center py-20">
          <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary" />
        </div>
        
        <div v-else-if="profile">
          <!-- Header -->
          <div class="mb-6">
            <div class="flex items-center justify-between mb-4">
              <div>
                <h2 class="text-3xl font-bold">{{ profile.analysisJson?.title || 'Athlete Profile' }}</h2>
                <p class="text-gray-600 dark:text-gray-400 mt-2">
                  Generated: {{ formatDate(profile.createdAt) }}
                </p>
              </div>
              <div class="flex items-center gap-2">
                <UBadge v-if="isViewingHistorical" color="info" size="lg">
                  <UIcon name="i-heroicons-clock" class="w-4 h-4 mr-1" />
                  Historical View
                </UBadge>
                <UBadge :color="statusColor as any" size="lg">
                  {{ profile.status }}
                </UBadge>
              </div>
            </div>
          </div>
          
          <!-- Historical View Alert -->
          <UAlert
            v-if="isViewingHistorical"
            color="info"
            icon="i-heroicons-information-circle"
            title="Viewing Historical Profile"
            :description="`You are viewing the athlete profile as it was generated on ${formatDate(profile.createdAt)}. This profile cannot be regenerated as it reflects past data.`"
            class="mb-6"
          />
          
          <!-- Status Alert -->
          <UAlert
            v-if="profile.status === 'PROCESSING'"
            color="info"
            icon="i-heroicons-arrow-path"
            title="Generating Profile"
            description="Analyzing your training data to create a comprehensive athlete profile. This may take a few moments..."
            class="mb-6"
          />
          
          <UAlert
            v-else-if="profile.status === 'FAILED'"
            color="error"
            icon="i-heroicons-exclamation-triangle"
            title="Profile Generation Failed"
            description="Unable to generate profile. Please try again."
            class="mb-6"
          />
          
          <!-- Content - Structured Profile Display -->
          <div v-if="profile.status === 'COMPLETED' && profile.analysisJson" class="space-y-6">
            <!-- Executive Summary -->
            <UCard>
              <template #header>
                <h3 class="text-xl font-semibold flex items-center gap-2">
                  <UIcon name="i-heroicons-user-circle" class="w-6 h-6" />
                  Profile Overview
                </h3>
              </template>
              <p class="text-gray-700 dark:text-gray-300 leading-relaxed text-lg">
                {{ profile.analysisJson.executive_summary }}
              </p>
            </UCard>

            <!-- Current Fitness -->
            <UCard v-if="profile.analysisJson.current_fitness">
              <template #header>
                <div class="flex items-center justify-between">
                  <h3 class="text-xl font-semibold flex items-center gap-2">
                    <UIcon name="i-heroicons-bolt" class="w-6 h-6" />
                    Current Fitness
                  </h3>
                  <UBadge :color="getStatusBadgeColor(profile.analysisJson.current_fitness.status) as any" size="lg">
                    {{ profile.analysisJson.current_fitness.status_label }}
                  </UBadge>
                </div>
              </template>
              
              <div class="space-y-3">
                <div v-for="(point, idx) in profile.analysisJson.current_fitness.key_points" :key="idx" class="flex gap-3">
                  <UIcon name="i-heroicons-chevron-right" class="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <p class="text-gray-700 dark:text-gray-300">{{ point }}</p>
                </div>
              </div>
            </UCard>

            <!-- Training Characteristics -->
            <UCard v-if="profile.analysisJson.training_characteristics">
              <template #header>
                <h3 class="text-xl font-semibold flex items-center gap-2">
                  <UIcon name="i-heroicons-academic-cap" class="w-6 h-6" />
                  Training Characteristics
                </h3>
              </template>
              
              <div class="space-y-4">
                <div>
                  <p class="text-gray-700 dark:text-gray-300 leading-relaxed">
                    {{ profile.analysisJson.training_characteristics.training_style }}
                  </p>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                  <div class="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                    <h4 class="font-semibold text-green-900 dark:text-green-200 mb-2 flex items-center gap-2">
                      <UIcon name="i-heroicons-check-circle" class="w-5 h-5" />
                      Strengths
                    </h4>
                    <ul class="space-y-1">
                      <li v-for="strength in profile.analysisJson.training_characteristics.strengths" :key="strength" class="text-sm text-green-800 dark:text-green-300">
                        • {{ strength }}
                      </li>
                    </ul>
                  </div>
                  
                  <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                    <h4 class="font-semibold text-blue-900 dark:text-blue-200 mb-2 flex items-center gap-2">
                      <UIcon name="i-heroicons-arrow-trending-up" class="w-5 h-5" />
                      Areas for Development
                    </h4>
                    <ul class="space-y-1">
                      <li v-for="area in profile.analysisJson.training_characteristics.areas_for_development" :key="area" class="text-sm text-blue-800 dark:text-blue-300">
                        • {{ area }}
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </UCard>

            <!-- Recovery Profile -->
            <UCard v-if="profile.analysisJson.recovery_profile">
              <template #header>
                <h3 class="text-xl font-semibold flex items-center gap-2">
                  <UIcon name="i-heroicons-heart" class="w-6 h-6" />
                  Recovery Profile
                </h3>
              </template>
              
              <div class="space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div v-if="profile.analysisJson.recovery_profile.recovery_pattern">
                    <h4 class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Recovery Pattern</h4>
                    <p class="text-gray-800 dark:text-gray-200">{{ profile.analysisJson.recovery_profile.recovery_pattern }}</p>
                  </div>
                  
                  <div v-if="profile.analysisJson.recovery_profile.hrv_trend">
                    <h4 class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">HRV Trend</h4>
                    <p class="text-gray-800 dark:text-gray-200">{{ profile.analysisJson.recovery_profile.hrv_trend }}</p>
                  </div>
                  
                  <div v-if="profile.analysisJson.recovery_profile.sleep_quality" class="md:col-span-2">
                    <h4 class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Sleep Quality</h4>
                    <p class="text-gray-800 dark:text-gray-200">{{ profile.analysisJson.recovery_profile.sleep_quality }}</p>
                  </div>
                </div>
                
                <div class="pt-3 border-t">
                  <h4 class="font-medium mb-2">Key Observations:</h4>
                  <div class="space-y-2">
                    <div v-for="(obs, idx) in profile.analysisJson.recovery_profile.key_observations" :key="idx" class="flex gap-3">
                      <UIcon name="i-heroicons-chevron-right" class="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                      <p class="text-gray-700 dark:text-gray-300">{{ obs }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </UCard>

            <!-- Nutrition Profile -->
            <UCard v-if="profile.analysisJson.nutrition_profile">
              <template #header>
                <h3 class="text-xl font-semibold flex items-center gap-2">
                  <UIcon name="i-heroicons-cake" class="w-6 h-6" />
                  Nutrition Profile
                </h3>
              </template>
              
              <div class="space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div v-if="profile.analysisJson.nutrition_profile.nutrition_pattern">
                    <h4 class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Nutrition Pattern</h4>
                    <p class="text-gray-800 dark:text-gray-200">{{ profile.analysisJson.nutrition_profile.nutrition_pattern }}</p>
                  </div>
                  
                  <div v-if="profile.analysisJson.nutrition_profile.caloric_balance">
                    <h4 class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Caloric Balance</h4>
                    <p class="text-gray-800 dark:text-gray-200">{{ profile.analysisJson.nutrition_profile.caloric_balance }}</p>
                  </div>
                  
                  <div v-if="profile.analysisJson.nutrition_profile.macro_distribution" class="md:col-span-2">
                    <h4 class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Macro Distribution</h4>
                    <p class="text-gray-800 dark:text-gray-200">{{ profile.analysisJson.nutrition_profile.macro_distribution }}</p>
                  </div>
                </div>
                
                <div v-if="profile.analysisJson.nutrition_profile.key_observations?.length" class="pt-3 border-t">
                  <h4 class="font-medium mb-2">Key Observations:</h4>
                  <div class="space-y-2">
                    <div v-for="(obs, idx) in profile.analysisJson.nutrition_profile.key_observations" :key="idx" class="flex gap-3">
                      <UIcon name="i-heroicons-chevron-right" class="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                      <p class="text-gray-700 dark:text-gray-300">{{ obs }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </UCard>

            <!-- Recent Performance -->
            <UCard v-if="profile.analysisJson.recent_performance">
              <template #header>
                <div class="flex items-center justify-between">
                  <h3 class="text-xl font-semibold flex items-center gap-2">
                    <UIcon name="i-heroicons-chart-bar" class="w-6 h-6" />
                    Recent Performance
                  </h3>
                  <UBadge :color="getTrendBadgeColor(profile.analysisJson.recent_performance.trend) as any" size="lg">
                    {{ formatTrend(profile.analysisJson.recent_performance.trend) }}
                  </UBadge>
                </div>
              </template>
              
              <div class="space-y-4">
                <div v-if="profile.analysisJson.recent_performance.notable_workouts?.length" class="space-y-3">
                  <h4 class="font-medium">Notable Workouts:</h4>
                  <div v-for="workout in profile.analysisJson.recent_performance.notable_workouts" :key="workout.date" class="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                    <div class="flex justify-between items-start mb-1">
                      <span class="font-medium">{{ workout.title }}</span>
                      <span class="text-sm text-gray-600 dark:text-gray-400">{{ formatShortDate(workout.date) }}</span>
                    </div>
                    <p class="text-sm text-gray-700 dark:text-gray-300">{{ workout.key_insight }}</p>
                  </div>
                </div>
                
                <div v-if="profile.analysisJson.recent_performance.patterns?.length" class="pt-3 border-t">
                  <h4 class="font-medium mb-2">Performance Patterns:</h4>
                  <div class="space-y-2">
                    <div v-for="(pattern, idx) in profile.analysisJson.recent_performance.patterns" :key="idx" class="flex gap-3">
                      <UIcon name="i-heroicons-chevron-right" class="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                      <p class="text-gray-700 dark:text-gray-300">{{ pattern }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </UCard>

            <!-- Recommendations Summary -->
            <UCard v-if="profile.analysisJson.recommendations_summary">
              <template #header>
                <h3 class="text-xl font-semibold flex items-center gap-2">
                  <UIcon name="i-heroicons-light-bulb" class="w-6 h-6" />
                  Coaching Insights
                </h3>
              </template>
              
              <div class="space-y-4">
                <div v-if="profile.analysisJson.recommendations_summary.recurring_themes?.length">
                  <h4 class="font-medium mb-2">Recurring Themes:</h4>
                  <div class="space-y-2">
                    <div v-for="(theme, idx) in profile.analysisJson.recommendations_summary.recurring_themes" :key="idx" class="flex gap-3">
                      <UIcon name="i-heroicons-chevron-right" class="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                      <p class="text-gray-700 dark:text-gray-300">{{ theme }}</p>
                    </div>
                  </div>
                </div>
                
                <div v-if="profile.analysisJson.recommendations_summary.action_items?.length" class="pt-3 border-t">
                  <h4 class="font-medium mb-3">Action Items:</h4>
                  <div class="space-y-3">
                    <div
                      v-for="(item, idx) in profile.analysisJson.recommendations_summary.action_items"
                      :key="idx"
                      class="flex items-start gap-3 p-3 rounded-lg"
                      :class="getPriorityBackgroundClass(item.priority)"
                    >
                      <UBadge :color="getPriorityBadgeColor(item.priority) as any" size="sm">
                        {{ item.priority }}
                      </UBadge>
                      <p class="flex-1 text-gray-700 dark:text-gray-300">{{ item.action }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </UCard>

            <!-- Planning Context -->
            <UCard v-if="profile.analysisJson.planning_context">
              <template #header>
                <h3 class="text-xl font-semibold flex items-center gap-2">
                  <UIcon name="i-heroicons-calendar" class="w-6 h-6" />
                  Planning Context
                </h3>
              </template>
              
              <div class="space-y-4">
                <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <h4 class="font-semibold text-blue-900 dark:text-blue-200 mb-2">Current Focus:</h4>
                  <p class="text-blue-800 dark:text-blue-300">{{ profile.analysisJson.planning_context.current_focus }}</p>
                </div>
                
                <div v-if="profile.analysisJson.planning_context.limitations?.length || profile.analysisJson.planning_context.opportunities?.length" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div v-if="profile.analysisJson.planning_context.limitations?.length">
                    <h4 class="font-medium mb-2 text-orange-900 dark:text-orange-200">⚠️ Limitations:</h4>
                    <ul class="space-y-1">
                      <li v-for="limit in profile.analysisJson.planning_context.limitations" :key="limit" class="text-sm text-gray-700 dark:text-gray-300">
                        • {{ limit }}
                      </li>
                    </ul>
                  </div>
                  
                  <div v-if="profile.analysisJson.planning_context.opportunities?.length">
                    <h4 class="font-medium mb-2 text-green-900 dark:text-green-200">✨ Opportunities:</h4>
                    <ul class="space-y-1">
                      <li v-for="opp in profile.analysisJson.planning_context.opportunities" :key="opp" class="text-sm text-gray-700 dark:text-gray-300">
                        • {{ opp }}
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </UCard>
          </div>
          
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
              v-if="isViewingHistorical"
              color="primary"
              @click="resetToLatest"
            >
              <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 mr-2" />
              View Latest Profile
            </UButton>
            
            <UButton
              v-else
              color="primary"
              @click="generateNewProfile"
              :loading="userStore.generating"
              :disabled="userStore.generating"
            >
              <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 mr-2" />
              {{ userStore.generating ? 'Generating...' : 'Regenerate Profile' }}
            </UButton>
          </div>
        </div>
        
        <div v-else class="text-center py-20">
          <p class="text-gray-600 dark:text-gray-400">
            {{ isViewingHistorical ? 'No athlete profile found for this date' : 'No athlete profile found' }}
          </p>
          <div v-if="isViewingHistorical" class="mt-4">
            <UButton @click="resetToLatest" color="primary">
              View Latest Profile
            </UButton>
          </div>
          <div v-else class="mt-4">
            <UButton @click="generateNewProfile" :loading="userStore.generating">
              Generate Profile
            </UButton>
          </div>
        </div>
      </div>
    </template>
    
    <template #footer>
    </template>
  </UDashboardPanel>
  
  <UModal
    v-model:open="isShareModalOpen"
    title="Share Athlete Profile"
    description="Anyone with this link can view your athlete profile. The link will expire in 30 days."
  >
    <template #body>
      <div class="space-y-4">
        <div v-if="generatingShareLink" class="flex items-center justify-center py-8">
          <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary" />
        </div>
        <div v-else-if="shareLink" class="space-y-4">
          <UFormField label="Share Link">
            <div class="flex gap-2">
              <UInput
                v-model="shareLink"
                readonly
                class="flex-1"
              />
              <UButton
                icon="i-heroicons-clipboard"
                color="neutral"
                variant="outline"
                @click="copyToClipboard"
              >
                Copy
              </UButton>
            </div>
          </UFormField>
          <p class="text-xs text-gray-500">
            This link provides read-only access to this specific version of your profile.
          </p>
        </div>
        <div v-else class="flex flex-col items-center justify-center py-8 text-center">
          <UIcon name="i-heroicons-link" class="w-8 h-8 text-gray-400 mb-2" />
          <p class="text-gray-600 mb-4">Click below to generate a shareable link.</p>
          <UButton
            color="primary"
            @click="generateShareLink"
            :loading="generatingShareLink"
          >
            Generate Link
          </UButton>
        </div>
      </div>
    </template>
    <template #footer>
      <UButton
        label="Close"
        color="neutral"
        variant="ghost"
        @click="isShareModalOpen = false"
      />
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { type DateValue, getLocalTimeZone, today as getTodayDate } from '@internationalized/date'

const toast = useToast()
const { formatDate, formatShortDate } = useFormat()
const { getTrendLabel } = useScoreColor()
const { poll } = usePolling()

const userStore = useUserStore()

// Date selection state
const today = getTodayDate(getLocalTimeZone())
const selectedDate = ref<DateValue | null>(null)

// Computed label for the date picker button
const selectedDateLabel = computed(() => {
  if (!selectedDate.value) {
    return 'Latest Profile'
  }
  const date = (selectedDate.value as any).toDate(getLocalTimeZone())
  return formatDate(date)
})

// Build query parameters based on selected date
const queryParams = computed(() => {
  const params: any = {
    type: 'ATHLETE_PROFILE',
    limit: 1
  }
  
  if (selectedDate.value) {
    // Find profile on or before the selected date
    const date = (selectedDate.value as any).toDate(getLocalTimeZone())
    params.beforeDate = date.toISOString()
  }
  
  return params
})

// Fetch athlete profile based on selected date
const { data: profile, pending, refresh } = await useFetch('/api/reports', {
  query: queryParams,
  transform: (data: any) => data && data.length > 0 ? data[0] : null,
  watch: [queryParams]
})

// Share state
const isShareModalOpen = ref(false)
const shareLink = ref('')
const generatingShareLink = ref(false)

const generateShareLink = async () => {
  if (!profile.value?.id) return
  
  generatingShareLink.value = true
  try {
    const response = await $fetch('/api/share/generate', {
      method: 'POST',
      body: {
        resourceType: 'REPORT',
        resourceId: profile.value.id
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

// Watch for share modal opening to generate link if it doesn't exist
watch(isShareModalOpen, (newValue) => {
  if (newValue && !shareLink.value) {
    generateShareLink()
  }
})

// Watch for profile changes to reset share link
watch(() => profile.value?.id, () => {
  shareLink.value = ''
})

// Check if viewing a historical profile (not the latest)
const isViewingHistorical = computed(() => {
  return selectedDate.value !== null
})

// Date change handler
const handleDateChange = async (date: DateValue | null | undefined) => {
  if (date) {
    selectedDate.value = date
  } else {
    selectedDate.value = null
  }
  // refresh will be triggered automatically by watch
}

// Reset to latest profile
const resetToLatest = () => {
  selectedDate.value = null
  // refresh will be triggered automatically by watch
}

// Poll for updates if profile is processing
const startPolling = () => {
  if (profile.value?.status === 'PROCESSING') {
    poll(
      async () => {
          await refresh()
          return profile.value
      },
      (data: any) => data?.status !== 'PROCESSING',
      {
          interval: 5000
      }
    )
  }
}

// Watch for profile status changes to trigger polling
watch(() => profile.value?.status, (newStatus) => {
  if (newStatus === 'PROCESSING') {
    startPolling()
  }
}, { immediate: true })

const statusColor = computed(() => {
  if (!profile.value) return 'neutral'
  const colors: Record<string, string> = {
    'PENDING': 'warning',
    'PROCESSING': 'info',
    'COMPLETED': 'success',
    'FAILED': 'error'
  }
  return colors[profile.value.status] || 'neutral'
})

const getStatusBadgeColor = (status: string) => {
  const colors: Record<string, string> = {
    'excellent': 'success',
    'good': 'info',
    'moderate': 'warning',
    'developing': 'info',
    'recovering': 'warning'
  }
  return colors[status] || 'neutral'
}

const getTrendBadgeColor = (trend: string) => {
  const colors: Record<string, string> = {
    'improving': 'success',
    'stable': 'info',
    'declining': 'warning',
    'variable': 'neutral'
  }
  return colors[trend] || 'neutral'
}

const getPriorityBadgeColor = (priority: string) => {
  const colors: Record<string, string> = {
    'high': 'error',
    'medium': 'warning',
    'low': 'success'
  }
  return colors[priority] || 'neutral'
}

const getPriorityBackgroundClass = (priority: string) => {
  const classes: Record<string, string> = {
    'high': 'bg-red-50 dark:bg-red-900/20',
    'medium': 'bg-yellow-50 dark:bg-yellow-900/20',
    'low': 'bg-green-50 dark:bg-green-900/20'
  }
  return classes[priority] || 'bg-gray-50 dark:bg-gray-800'
}

const formatTrend = (trend: string) => {
  return getTrendLabel(trend)
}

const handlePrint = () => {
  window.print()
}

async function generateNewProfile() {
  await userStore.generateProfile()
  // Refresh local data after store action completes/updates
  await refresh()
}

useHead({
  title: 'Athlete Profile',
  meta: [
    { name: 'description', content: 'Comprehensive analysis of your fitness, training style, recovery, and nutrition.' }
  ]
})
</script>

<style scoped>
@media print {
  nav, .actions {
    display: none;
  }
}
</style>