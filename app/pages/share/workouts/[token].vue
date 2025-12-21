<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Simple Header -->
    <header class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-zap" class="w-6 h-6 text-primary-500" />
            <span class="font-bold text-lg text-gray-900 dark:text-white">Coach Wattz</span>
          </div>
          <div class="flex items-center gap-4">
            <UButton
              to="/"
              color="primary"
              variant="soft"
              size="sm"
            >
              Try Coach Wattz
            </UButton>
            <ColorModeButton />
          </div>
        </div>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div v-if="loading" class="flex items-center justify-center py-12">
        <div class="text-center">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
          <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">Loading shared workout...</p>
        </div>
      </div>

      <div v-else-if="error" class="text-center py-12">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8 max-w-md mx-auto">
          <UIcon name="i-heroicons-exclamation-triangle" class="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Unavailable</h3>
          <p class="text-gray-600 dark:text-gray-400 mb-6">{{ error }}</p>
          <UButton to="/" color="primary" variant="solid">Go Home</UButton>
        </div>
      </div>

      <div v-else-if="workout" class="space-y-6">
        <!-- Header Card -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
          <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <div class="flex items-center gap-3 mb-2">
                <UAvatar
                  v-if="workout.user?.image"
                  :src="workout.user.image"
                  :alt="workout.user.name || 'User'"
                  size="xs"
                />
                <span class="text-sm text-gray-500 dark:text-gray-400">
                  {{ workout.user?.name || 'Coach Wattz User' }} shared a workout
                </span>
              </div>
              <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                {{ workout.title }}
              </h1>
              <div class="flex flex-wrap gap-3 text-sm text-gray-600 dark:text-gray-400">
                <div class="flex items-center gap-1">
                  <UIcon name="i-heroicons-calendar" class="w-4 h-4" />
                  {{ formatDate(workout.date) }}
                </div>
                <div v-if="workout.type" class="flex items-center gap-1">
                  <UIcon name="i-heroicons-tag" class="w-4 h-4" />
                  {{ workout.type }}
                </div>
                <div class="flex items-center gap-1">
                  <UIcon name="i-heroicons-clock" class="w-4 h-4" />
                  {{ formatDuration(workout.durationSec) }}
                </div>
              </div>
            </div>
            
            <div class="flex flex-wrap gap-3">
              <div v-if="workout.trainingLoad" class="text-center px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div class="text-xs text-blue-600 dark:text-blue-400 uppercase font-semibold">Load</div>
                <div class="text-xl font-bold text-blue-900 dark:text-blue-100">{{ Math.round(workout.trainingLoad) }}</div>
              </div>
              <div v-if="workout.averageHr" class="text-center px-4 py-2 bg-pink-50 dark:bg-pink-900/20 rounded-lg">
                <div class="text-xs text-pink-600 dark:text-pink-400 uppercase font-semibold">Avg HR</div>
                <div class="text-xl font-bold text-pink-900 dark:text-pink-100">{{ workout.averageHr }}</div>
              </div>
              <div v-if="workout.averageWatts" class="text-center px-4 py-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                <div class="text-xs text-purple-600 dark:text-purple-400 uppercase font-semibold">Power</div>
                <div class="text-xl font-bold text-purple-900 dark:text-purple-100">{{ workout.averageWatts }}W</div>
              </div>
            </div>
          </div>
        </div>

        <!-- AI Analysis Section -->
        <div v-if="workout.aiAnalysisJson" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
          <div class="flex items-center gap-2 mb-4">
            <UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-primary-500" />
            <h2 class="text-lg font-bold text-gray-900 dark:text-white">AI Analysis</h2>
          </div>
          
          <div class="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800 mb-6">
            <h3 class="text-base font-semibold text-blue-900 dark:text-blue-100 mb-2">Quick Take</h3>
            <p class="text-gray-800 dark:text-gray-200 leading-relaxed">{{ workout.aiAnalysisJson.executive_summary }}</p>
          </div>

          <div v-if="workout.aiAnalysisJson.sections" class="space-y-4">
            <div
              v-for="(section, index) in workout.aiAnalysisJson.sections"
              :key="index"
              class="border-b border-gray-100 dark:border-gray-700 last:border-0 pb-4 last:pb-0"
            >
              <h3 class="font-semibold text-gray-900 dark:text-white mb-2">{{ section.title }}</h3>
              <ul class="space-y-2">
                <li
                  v-for="(point, pIndex) in section.analysis_points"
                  :key="pIndex"
                  class="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300"
                >
                  <UIcon name="i-heroicons-check-circle" class="w-4 h-4 mt-0.5 text-green-500 flex-shrink-0" />
                  <span>{{ point }}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Visualizations Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Power Curve -->
          <div v-if="shouldShowPowerCurve(workout)" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
            <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4">Power Duration Curve</h3>
            <PowerCurveChart :workout-id="workout.id" />
          </div>

          <!-- Zone Distribution -->
          <div v-if="shouldShowPacing(workout)" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
            <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4">Training Zones</h3>
            <ZoneChart :workout-id="workout.id" />
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
// Use guest middleware to allow access without auth
definePageMeta({
  layout: false,
  middleware: 'guest'
})

const route = useRoute()
const token = route.params.token as string

const workout = ref<any>(null)
const loading = ref(true)
const error = ref<string | null>(null)

// Formatters
function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m ${secs}s`
}

function shouldShowPowerCurve(w: any) {
  if (!w) return false
  const supportedSources = ['strava', 'intervals']
  return supportedSources.includes(w.source) && w.streams && (w.averageWatts || w.maxWatts)
}

function shouldShowPacing(w: any) {
  if (!w) return false
  const supportedSources = ['strava', 'intervals']
  return supportedSources.includes(w.source) && w.streams
}

// Fetch Data
async function fetchSharedWorkout() {
  loading.value = true
  error.value = null
  try {
    const data = await $fetch(`/api/share/workouts/${token}`)
    workout.value = data
    
    // Set meta tags for social sharing
    useHead({
      title: `${data.title} - Shared Workout | Coach Wattz`,
      meta: [
        { name: 'description', content: `Check out my workout on Coach Wattz: ${data.title} - ${formatDate(data.date)}` },
        { property: 'og:title', content: `${data.title} | Coach Wattz` },
        { property: 'og:description', content: `Check out my workout analysis on Coach Wattz` },
        { property: 'og:type', content: 'article' },
      ]
    })
  } catch (e: any) {
    error.value = e.data?.message || 'Failed to load workout. The link may be invalid or expired.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchSharedWorkout()
})
</script>
