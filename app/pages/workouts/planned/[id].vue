<template>
  <UDashboardPanel id="planned-workout-details">
    <template #header>
      <UDashboardNavbar :title="workout?.title || 'Workout Details'">
        <template #leading>
          <UButton
            color="gray"
            variant="ghost"
            icon="i-heroicons-arrow-left"
            @click="goBack"
          >
            Back
          </UButton>
        </template>
        <template #right>
          <UButton
            v-if="workout && !workout.completed"
            size="xs"
            color="primary"
            icon="i-heroicons-check"
            @click="markComplete"
          >
            Mark Complete
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-6 max-w-6xl mx-auto space-y-6">
        <!-- Loading State -->
        <div v-if="loading" class="flex justify-center py-20">
          <UIcon name="i-heroicons-arrow-path" class="w-10 h-10 animate-spin text-primary" />
        </div>

        <!-- Workout Content -->
        <div v-else-if="workout" class="space-y-6">
          <!-- Header Card -->
          <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div class="flex items-start justify-between mb-4">
              <div class="flex-1">
                <h1 class="text-3xl font-bold mb-2">{{ workout.title }}</h1>
                <div class="flex flex-wrap items-center gap-3 text-sm text-muted">
                  <div class="flex items-center gap-1">
                    <UIcon name="i-heroicons-calendar" class="w-4 h-4" />
                    <span>{{ formatDate(workout.date) }}</span>
                  </div>
                  <span>•</span>
                  <div class="flex items-center gap-1">
                    <UIcon name="i-heroicons-clock" class="w-4 h-4" />
                    <span>{{ formatDuration(workout.durationSec) }}</span>
                  </div>
                  <span>•</span>
                  <div class="flex items-center gap-1">
                    <UIcon name="i-heroicons-bolt" class="w-4 h-4" />
                    <span>{{ Math.round(workout.tss) }} TSS</span>
                  </div>
                  <span>•</span>
                  <UBadge :color="workout.completed ? 'green' : 'amber'" size="sm">
                    {{ workout.completed ? 'Completed' : 'Planned' }}
                  </UBadge>
                </div>
              </div>
              <div class="flex-shrink-0">
                <div class="text-right">
                  <div class="text-xs text-muted">Type</div>
                  <div class="text-lg font-bold text-primary">{{ workout.type }}</div>
                </div>
              </div>
            </div>

            <!-- Description -->
            <div v-if="workout.description" class="mt-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div class="text-sm text-muted mb-1">Description</div>
              <p class="text-sm">{{ workout.description }}</p>
            </div>

            <!-- Training Context -->
            <div v-if="workout.trainingWeek" class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div class="text-xs text-muted mb-2">Training Context</div>
              <div class="flex flex-wrap gap-2 text-sm">
                <UBadge color="gray" variant="soft">
                  Goal: {{ workout.trainingWeek.block.plan.goal.title }}
                </UBadge>
                <UBadge color="gray" variant="soft">
                  {{ workout.trainingWeek.block.name }}
                </UBadge>
                <UBadge color="gray" variant="soft">
                  Week {{ workout.trainingWeek.weekNumber }}
                </UBadge>
                <UBadge color="gray" variant="soft">
                  Focus: {{ workout.trainingWeek.focus || workout.trainingWeek.block.primaryFocus }}
                </UBadge>
              </div>
            </div>
          </div>

          <!-- Workout Visualization -->
          <div v-if="workout.structuredWorkout" class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h3 class="text-lg font-semibold mb-4">Power Profile</h3>
            <WorkoutChart :workout="workout.structuredWorkout" :user-ftp="userFtp" />
          </div>

          <!-- No Structured Data -->
          <div v-else class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div class="text-center py-8">
              <UIcon name="i-heroicons-chart-bar" class="w-12 h-12 text-muted mx-auto mb-3" />
              <h3 class="text-lg font-semibold mb-2">No Structured Workout Data</h3>
              <p class="text-sm text-muted mb-4">This workout doesn't have detailed interval structure yet.</p>
              <UButton
                size="sm"
                color="primary"
                variant="soft"
                :loading="generating"
                :disabled="generating"
                @click="generateStructure"
              >
                {{ generating ? 'Generating Structure...' : 'Generate Workout Structure' }}
              </UButton>
            </div>
          </div>

          <!-- Completed Workout Link -->
          <div v-if="workout.completedWorkouts && workout.completedWorkouts.length > 0" class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h3 class="text-lg font-semibold mb-4">Linked Completed Activities</h3>
            <div class="space-y-3">
              <NuxtLink
                v-for="completed in workout.completedWorkouts"
                :key="completed.id"
                :to="`/activities/${completed.id}`"
                class="block p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary transition-colors"
              >
                <div class="flex items-center justify-between">
                  <div class="flex-1">
                    <div class="font-semibold">{{ completed.title }}</div>
                    <div class="text-xs text-muted mt-1">
                      {{ formatDate(completed.date) }}
                    </div>
                  </div>
                  <div class="flex gap-4 text-sm">
                    <div class="text-right">
                      <div class="text-xs text-muted">Duration</div>
                      <div class="font-semibold">{{ formatDuration(completed.durationSec) }}</div>
                    </div>
                    <div class="text-right">
                      <div class="text-xs text-muted">TSS</div>
                      <div class="font-semibold">{{ Math.round(completed.tss || 0) }}</div>
                    </div>
                    <div v-if="completed.normalizedPower" class="text-right">
                      <div class="text-xs text-muted">NP</div>
                      <div class="font-semibold">{{ completed.normalizedPower }}W</div>
                    </div>
                  </div>
                </div>
              </NuxtLink>
            </div>
          </div>

          <!-- Stats Grid -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <UIcon name="i-heroicons-clock" class="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div class="text-xs text-muted">Planned Duration</div>
                  <div class="text-2xl font-bold">{{ formatDuration(workout.durationSec) }}</div>
                </div>
              </div>
            </div>

            <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center">
                  <UIcon name="i-heroicons-bolt" class="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <div class="text-xs text-muted">Training Stress</div>
                  <div class="text-2xl font-bold">{{ Math.round(workout.tss) }}</div>
                </div>
              </div>
            </div>

            <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
                  <UIcon name="i-heroicons-fire" class="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <div class="text-xs text-muted">Intensity</div>
                  <div class="text-2xl font-bold">{{ Math.round((workout.workIntensity || 0) * 100) }}%</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Error State -->
        <div v-else class="text-center py-20">
          <UIcon name="i-heroicons-exclamation-circle" class="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h3 class="text-xl font-semibold mb-2">Workout Not Found</h3>
          <p class="text-muted mb-4">The planned workout you're looking for doesn't exist.</p>
          <UButton color="primary" @click="goBack">Go Back</UButton>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import WorkoutChart from '~/components/workouts/WorkoutChart.vue'

definePageMeta({
  middleware: 'auth'
})

const route = useRoute()
const router = useRouter()
const toast = useToast()

const loading = ref(true)
const generating = ref(false)
const polling = ref(false)
const workout = ref<any>(null)
const userFtp = ref<number | undefined>(undefined)
let pollingInterval: NodeJS.Timeout | null = null

async function fetchWorkout() {
  loading.value = true
  try {
    const data: any = await $fetch(`/api/workouts/planned/${route.params.id}`)
    workout.value = data.workout
    userFtp.value = data.userFtp
  } catch (error) {
    console.error('Failed to fetch workout', error)
    workout.value = null
  } finally {
    loading.value = false
  }
}

async function generateStructure() {
  generating.value = true
  try {
    await $fetch(`/api/workouts/planned/${route.params.id}/generate-structure`, {
      method: 'POST'
    })

    toast.add({
      title: 'Generation Started',
      description: 'AI is generating the workout structure. This may take up to 30 seconds.',
      color: 'success'
    })

    // Start polling for the generated structure
    startPolling()
  } catch (error: any) {
    toast.add({
      title: 'Generation Failed',
      description: error.data?.message || 'Failed to generate structure',
      color: 'error'
    })
    generating.value = false
  }
}

function startPolling() {
  polling.value = true
  let attempts = 0
  const maxAttempts = 15 // Poll for up to 45 seconds (15 attempts * 3 seconds)

  pollingInterval = setInterval(async () => {
    attempts++

    try {
      const data: any = await $fetch(`/api/workouts/planned/${route.params.id}`)

      // Check if structured workout data is now available
      if (data.workout?.structuredWorkout) {
        workout.value = data.workout
        userFtp.value = data.userFtp

        stopPolling()
        generating.value = false

        toast.add({
          title: 'Structure Generated',
          description: 'Your workout structure is ready!',
          color: 'success'
        })
      } else if (attempts >= maxAttempts) {
        // Stop polling after max attempts
        stopPolling()
        generating.value = false

        toast.add({
          title: 'Generation Taking Longer',
          description: 'The workout is still being generated. Try refreshing the page in a moment.',
          color: 'info'
        })
      }
    } catch (error) {
      console.error('Polling error:', error)

      if (attempts >= maxAttempts) {
        stopPolling()
        generating.value = false
      }
    }
  }, 3000) // Poll every 3 seconds
}

function stopPolling() {
  polling.value = false
  if (pollingInterval) {
    clearInterval(pollingInterval)
    pollingInterval = null
  }
}

async function markComplete() {
  // TODO: Implement mark complete functionality
  toast.add({
    title: 'Feature Coming Soon',
    description: 'Manual workout completion is not yet implemented',
    color: 'info'
  })
}

function goBack() {
  router.back()
}

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}h ${mins}m`
  }
  return `${mins}m`
}

useHead(() => ({
  title: workout.value ? `${workout.value.title} - Planned Workout` : 'Planned Workout'
}))

onMounted(() => {
  fetchWorkout()
})

onUnmounted(() => {
  // Clean up polling interval if component is unmounted
  stopPolling()
})
</script>
