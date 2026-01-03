<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div v-if="pending" class="flex items-center justify-center py-12">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
        <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">Loading profile...</p>
      </div>
    </div>

    <div v-else-if="error" class="text-center py-12">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8 max-w-md mx-auto">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Unavailable</h3>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          This share link may have expired or the profile report is no longer available.
        </p>
        <UButton to="/" color="primary" variant="solid">Go Home</UButton>
      </div>
    </div>

    <div v-else-if="profile" class="space-y-6">
      <!-- Header Section: Profile Info (2/3) + Status Cards (1/3) -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        <!-- Main Content Column -->
        <div class="lg:col-span-2 space-y-6">
          
          <!-- Profile Info Card -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
            <div class="flex items-start justify-between mb-4">
              <div class="flex-1">
                <div class="flex items-center gap-3 mb-2">
                  <UAvatar
                    v-if="sharedData?.user?.image"
                    :src="sharedData.user.image"
                    :alt="sharedData.user.name || 'User'"
                    size="xs"
                  />
                  <span class="text-sm text-gray-500 dark:text-gray-400">
                    {{ sharedData?.user?.name || 'Coach Wattz User' }}'s Profile
                  </span>
                </div>
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  {{ profile.analysisJson?.title || 'Athlete Profile' }}
                </h1>
                <div class="flex flex-wrap gap-3 text-sm text-gray-600 dark:text-gray-400">
                  <div class="flex items-center gap-1">
                    <span class="i-heroicons-calendar w-4 h-4"></span>
                    Generated: {{ formatDate(profile.createdAt) }}
                  </div>
                </div>
              </div>
              <div>
                  <UBadge color="success" size="md" variant="subtle">
                  Public View
                </UBadge>
              </div>
            </div>

            <!-- Executive Summary (Quick Take style) -->
            <div v-if="profile.analysisJson?.executive_summary" class="mt-6 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
              <h3 class="text-base font-semibold text-blue-900 dark:text-blue-100 mb-4 flex items-center gap-2">
                <span class="i-heroicons-light-bulb w-5 h-5"></span>
                Executive Summary
              </h3>
              <p class="text-base text-gray-800 dark:text-gray-200 leading-relaxed">
                {{ profile.analysisJson.executive_summary }}
              </p>
            </div>
          </div>

          <!-- Training Characteristics -->
          <div v-if="profile.analysisJson?.training_characteristics" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
              <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <UIcon name="i-heroicons-academic-cap" class="w-5 h-5 text-primary-500" />
              Training Characteristics
            </h2>
            <p class="text-gray-700 dark:text-gray-300 leading-relaxed mb-6">
              {{ profile.analysisJson.training_characteristics.training_style }}
            </p>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- Strengths -->
              <div class="bg-green-50 dark:bg-green-900/20 rounded-lg p-5 border border-green-200 dark:border-green-800">
                <h3 class="text-base font-semibold text-green-900 dark:text-green-100 mb-3 flex items-center gap-2">
                  <span class="i-heroicons-check-circle w-5 h-5"></span>
                  Strengths
                </h3>
                <ul class="space-y-2">
                  <li v-for="strength in profile.analysisJson.training_characteristics.strengths" :key="strength" class="flex items-start gap-2 text-sm text-green-800 dark:text-green-200">
                    <span class="i-heroicons-plus-circle w-4 h-4 mt-0.5 flex-shrink-0"></span>
                    <span>{{ strength }}</span>
                  </li>
                </ul>
              </div>

              <!-- Areas for Development -->
              <div class="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-5 border border-orange-200 dark:border-orange-800">
                <h3 class="text-base font-semibold text-orange-900 dark:text-orange-100 mb-3 flex items-center gap-2">
                  <span class="i-heroicons-arrow-trending-up w-5 h-5"></span>
                  Areas for Development
                </h3>
                <ul class="space-y-2">
                  <li v-for="area in profile.analysisJson.training_characteristics.areas_for_development" :key="area" class="flex items-start gap-2 text-sm text-orange-800 dark:text-orange-200">
                      <span class="i-heroicons-exclamation-circle w-4 h-4 mt-0.5 flex-shrink-0"></span>
                    <span>{{ area }}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <!-- Recovery & Nutrition Grid -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <!-- Recovery Profile -->
              <div v-if="profile.analysisJson?.recovery_profile" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700 h-full">
                <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <UIcon name="i-heroicons-heart" class="w-5 h-5 text-pink-500" />
                  Recovery Profile
                </h2>
                <div class="space-y-4">
                  <div v-if="profile.analysisJson.recovery_profile.recovery_pattern">
                    <h4 class="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-1">Recovery Pattern</h4>
                    <p class="text-sm text-gray-900 dark:text-gray-100">{{ profile.analysisJson.recovery_profile.recovery_pattern }}</p>
                  </div>
                    <div v-if="profile.analysisJson.recovery_profile.hrv_trend">
                    <h4 class="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-1">HRV Trend</h4>
                    <p class="text-sm text-gray-900 dark:text-gray-100">{{ profile.analysisJson.recovery_profile.hrv_trend }}</p>
                  </div>
                  <div v-if="profile.analysisJson.recovery_profile.key_observations?.length" class="pt-3 border-t border-gray-100 dark:border-gray-700">
                      <ul class="space-y-2">
                      <li v-for="(obs, idx) in profile.analysisJson.recovery_profile.key_observations" :key="idx" class="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                        <span class="i-heroicons-chevron-right w-4 h-4 mt-0.5 text-pink-500 flex-shrink-0"></span>
                        <span>{{ obs }}</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <!-- Nutrition Profile -->
              <div v-if="profile.analysisJson?.nutrition_profile" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700 h-full">
                <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <UIcon name="i-heroicons-cake" class="w-5 h-5 text-green-500" />
                  Nutrition Profile
                </h2>
                <div class="space-y-4">
                  <div v-if="profile.analysisJson.nutrition_profile.nutrition_pattern">
                    <h4 class="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-1">Pattern</h4>
                    <p class="text-sm text-gray-900 dark:text-gray-100">{{ profile.analysisJson.nutrition_profile.nutrition_pattern }}</p>
                  </div>
                    <div v-if="profile.analysisJson.nutrition_profile.caloric_balance">
                    <h4 class="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-1">Caloric Balance</h4>
                    <p class="text-sm text-gray-900 dark:text-gray-100">{{ profile.analysisJson.nutrition_profile.caloric_balance }}</p>
                  </div>
                  <div v-if="profile.analysisJson.nutrition_profile.macro_distribution">
                    <h4 class="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-1">Macro Distribution</h4>
                    <p class="text-sm text-gray-900 dark:text-gray-100">{{ profile.analysisJson.nutrition_profile.macro_distribution }}</p>
                  </div>
                </div>
              </div>
          </div>

            <!-- Planning Context -->
          <div v-if="profile.analysisJson?.planning_context" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
              <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <UIcon name="i-heroicons-calendar" class="w-5 h-5 text-indigo-500" />
              Planning Context
            </h2>
            <div class="mb-4 bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg border border-indigo-100 dark:border-indigo-800">
              <h4 class="text-sm font-semibold text-indigo-900 dark:text-indigo-200 mb-1">Current Focus</h4>
              <p class="text-indigo-800 dark:text-indigo-300">{{ profile.analysisJson.planning_context.current_focus }}</p>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div v-if="profile.analysisJson.planning_context.limitations?.length">
                <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-2">Limitations</h4>
                <ul class="space-y-1">
                  <li v-for="limit in profile.analysisJson.planning_context.limitations" :key="limit" class="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <span class="w-1.5 h-1.5 rounded-full bg-orange-400 mt-1.5 flex-shrink-0"></span>
                    <span>{{ limit }}</span>
                  </li>
                </ul>
              </div>
                <div v-if="profile.analysisJson.planning_context.opportunities?.length">
                <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-2">Opportunities</h4>
                <ul class="space-y-1">
                  <li v-for="opp in profile.analysisJson.planning_context.opportunities" :key="opp" class="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <span class="w-1.5 h-1.5 rounded-full bg-green-400 mt-1.5 flex-shrink-0"></span>
                    <span>{{ opp }}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

        </div>

        <!-- Sidebar Column -->
        <div class="lg:col-span-1 space-y-6">
          
          <!-- Current Fitness Card -->
          <div v-if="profile.analysisJson?.current_fitness" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
              <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <UIcon name="i-heroicons-bolt" class="w-5 h-5 text-yellow-500" />
              Current Fitness
            </h2>
            
            <div class="flex items-center justify-between mb-4">
                <span class="text-sm text-gray-500">Status</span>
                <UBadge :color="getStatusBadgeColor(profile.analysisJson.current_fitness.status) as any" size="md">
                  {{ profile.analysisJson.current_fitness.status_label }}
                </UBadge>
            </div>

            <div class="space-y-3">
                <div v-for="(point, idx) in profile.analysisJson.current_fitness.key_points" :key="idx" class="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <UIcon name="i-heroicons-check" class="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />
                  <p class="text-sm text-gray-700 dark:text-gray-300">{{ point }}</p>
                </div>
            </div>
          </div>

          <!-- Recent Performance Card -->
          <div v-if="profile.analysisJson?.recent_performance" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
            <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <UIcon name="i-heroicons-chart-bar" class="w-5 h-5 text-blue-500" />
              Recent Performance
            </h2>

            <div class="flex items-center justify-between mb-4">
                <span class="text-sm text-gray-500">Trend</span>
                <UBadge :color="getTrendBadgeColor(profile.analysisJson.recent_performance.trend) as any" size="md">
                  {{ formatTrend(profile.analysisJson.recent_performance.trend) }}
                </UBadge>
            </div>

              <div v-if="profile.analysisJson.recent_performance.notable_workouts?.length" class="space-y-3">
                <h4 class="text-xs font-semibold uppercase text-gray-500 mt-4 mb-2">Notable Workouts</h4>
                <div v-for="workout in profile.analysisJson.recent_performance.notable_workouts" :key="workout.date" class="border-l-2 border-blue-500 pl-3 py-1">
                  <div class="flex justify-between items-start">
                    <span class="font-medium text-sm text-gray-900 dark:text-white">{{ workout.title }}</span>
                    <span class="text-xs text-gray-500">{{ formatShortDate(workout.date) }}</span>
                  </div>
                  <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">{{ workout.key_insight }}</p>
                </div>
              </div>
          </div>

          <!-- Coaching Insights (Recommendations) -->
          <div v-if="profile.analysisJson?.recommendations_summary" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
              <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-purple-500" />
              Coaching Insights
            </h2>
            
              <div v-if="profile.analysisJson.recommendations_summary.action_items?.length" class="space-y-3">
                <div
                  v-for="(item, idx) in profile.analysisJson.recommendations_summary.action_items"
                  :key="idx"
                  class="p-3 rounded-lg border text-sm"
                  :class="getActionItemClass(item.priority)"
                >
                  <div class="flex items-center gap-2 mb-1">
                    <UBadge :color="getPriorityBadgeColor(item.priority) as any" size="xs" variant="subtle">
                      {{ item.priority }}
                    </UBadge>
                  </div>
                  <p class="text-gray-800 dark:text-gray-200">{{ item.action }}</p>
                </div>
              </div>
          </div>

        </div>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const token = route.params.token as string

const { formatDate, formatShortDate } = useFormat()

const { data: sharedData, pending, error } = await useFetch<any>(`/api/share/${token}`)

const profile = computed(() => {
  if (sharedData.value?.resourceType === 'REPORT' || sharedData.value?.resourceType === 'ATHLETE_PROFILE') {
    return sharedData.value.data
  }
  return null
})

const pageTitle = computed(() => profile.value ? `${sharedData.value?.user?.name || 'Athlete'}'s Profile | Coach Wattz` : 'Shared Athlete Profile | Coach Wattz')
const pageDescription = computed(() => {
  if (profile.value?.analysisJson?.executive_summary) {
    return profile.value.analysisJson.executive_summary.substring(0, 160)
  }
  return 'View personalized AI endurance coaching analysis and athlete profile on Coach Wattz.'
})

useHead({
  title: pageTitle,
  meta: [
    { name: 'description', content: pageDescription },
    { property: 'og:title', content: pageTitle },
    { property: 'og:description', content: pageDescription },
    { property: 'og:type', content: 'profile' },
    { name: 'twitter:title', content: pageTitle },
    { name: 'twitter:description', content: pageDescription }
  ],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: computed(() => JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        'mainEntity': {
          '@type': 'Person',
          'name': sharedData.value?.user?.name || 'Athlete',
          'image': sharedData.value?.user?.image,
          'description': pageDescription.value
        }
      }))
    }
  ]
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

const getActionItemClass = (priority: string) => {
  const classes: Record<string, string> = {
    'high': 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800',
    'medium': 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800',
    'low': 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
  }
  return classes[priority] || 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
}

const formatTrend = (trend: string) => {
  if (!trend) return ''
  return trend.charAt(0).toUpperCase() + trend.slice(1)
}

definePageMeta({
  layout: 'share'
})
</script>
