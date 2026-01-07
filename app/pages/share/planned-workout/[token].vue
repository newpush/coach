<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <!-- Loading State -->
    <div v-if="pending" class="flex items-center justify-center py-12">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
        <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">Loading shared workout...</p>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="text-center py-12">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8 max-w-md mx-auto">
        <UIcon
          name="i-heroicons-exclamation-triangle"
          class="w-12 h-12 text-red-500 mx-auto mb-4"
        />
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Unavailable</h3>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          {{ error.message || 'This shared workout link is invalid or expired.' }}
        </p>
        <UButton to="/" color="primary" variant="solid">Go Home</UButton>
      </div>
    </div>

    <!-- Workout Content -->
    <div v-else-if="workout" class="space-y-6">
      <!-- Header Section -->
      <div
        class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700"
      >
        <div class="flex items-start justify-between mb-4">
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-2">
              <UAvatar v-if="user?.image" :src="user.image" :alt="user.name || 'User'" size="xs" />
              <span class="text-sm text-gray-500 dark:text-gray-400">
                {{ user?.name || 'Coach Wattz User' }} shared a planned workout
              </span>
            </div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {{ workout.title }}
            </h1>
            <div class="flex flex-wrap gap-3 text-sm text-gray-600 dark:text-gray-400">
              <div class="flex items-center gap-1">
                <span class="i-heroicons-calendar w-4 h-4" />
                {{ formatDate(workout.date) }}
              </div>
              <div v-if="workout.type" class="flex items-center gap-1">
                <span class="i-heroicons-tag w-4 h-4" />
                {{ workout.type }}
              </div>
              <div class="flex items-center gap-1">
                <span class="i-heroicons-clock w-4 h-4" />
                {{ formatDuration(workout.durationSec) }}
              </div>
            </div>
          </div>
          <div class="flex gap-2">
            <span
              class="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
            >
              Planned
            </span>
          </div>
        </div>

        <!-- Key Stats Grid -->
        <div class="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div
            class="rounded-lg p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
          >
            <div class="text-xs text-blue-600 dark:text-blue-400 mb-1">Planned Duration</div>
            <div class="text-xl font-bold text-blue-900 dark:text-blue-100">
              {{ formatDuration(workout.durationSec) }}
            </div>
          </div>
          <div
            v-if="workout.tss"
            class="rounded-lg p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
          >
            <div class="text-xs text-amber-600 dark:text-amber-400 mb-1">Training Stress</div>
            <div class="text-xl font-bold text-amber-900 dark:text-amber-100">
              {{ Math.round(workout.tss) }}
            </div>
          </div>
          <div
            v-if="workout.workIntensity"
            class="rounded-lg p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
          >
            <div class="text-xs text-green-600 dark:text-green-400 mb-1">Intensity</div>
            <div class="text-xl font-bold text-green-900 dark:text-green-100">
              {{ Math.round((workout.workIntensity || 0) * 100) }}%
            </div>
          </div>
        </div>

        <div v-if="workout.description" class="mt-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {{ workout.description }}
          </p>
        </div>

        <!-- Training Context -->
        <div
          v-if="workout.trainingWeek"
          class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700"
        >
          <div class="text-xs text-gray-500 dark:text-gray-400 mb-2">Training Context</div>
          <div class="flex flex-wrap gap-2 text-sm">
            <UBadge
              v-if="workout.trainingWeek.block?.plan?.goal?.title"
              color="neutral"
              variant="soft"
            >
              Goal: {{ workout.trainingWeek.block.plan.goal.title }}
            </UBadge>
            <UBadge v-if="workout.trainingWeek.block?.name" color="neutral" variant="soft">
              {{ workout.trainingWeek.block.name }}
            </UBadge>
            <UBadge v-if="workout.trainingWeek.weekNumber" color="neutral" variant="soft">
              Week {{ workout.trainingWeek.weekNumber }}
            </UBadge>
            <UBadge
              v-if="workout.trainingWeek.focus || workout.trainingWeek.block?.primaryFocus"
              color="neutral"
              variant="soft"
            >
              Focus: {{ workout.trainingWeek.focus || workout.trainingWeek.block.primaryFocus }}
            </UBadge>
          </div>
        </div>
      </div>

      <!-- Coach Instructions -->
      <div
        v-if="workout.structuredWorkout?.coachInstructions"
        class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6 border border-blue-100 dark:border-blue-800"
      >
        <div class="flex items-start gap-4">
          <div class="p-2 bg-blue-100 dark:bg-blue-800 rounded-full">
            <UIcon
              name="i-heroicons-chat-bubble-bottom-center-text"
              class="w-6 h-6 text-blue-600 dark:text-blue-300"
            />
          </div>
          <div>
            <h3 class="font-semibold text-lg text-blue-900 dark:text-blue-100">Coach's Advice</h3>
            <p class="text-blue-800 dark:text-blue-200 mt-2 italic">
              "{{ workout.structuredWorkout.coachInstructions }}"
            </p>
          </div>
        </div>
      </div>

      <!-- Workout Visualization -->
      <div
        v-if="workout.structuredWorkout"
        class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6"
      >
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Power Profile</h3>
        </div>
        <!-- Passing userFtp as undefined for generic % view on public share -->
        <WorkoutChart :workout="workout.structuredWorkout" />
      </div>

      <!-- Coaching Messages Timeline -->
      <div
        v-if="workout.structuredWorkout?.messages?.length"
        class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6"
      >
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Timeline & Instructions
        </h3>
        <WorkoutMessagesTimeline :workout="workout.structuredWorkout" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import WorkoutChart from '~/components/workouts/WorkoutChart.vue'
  import WorkoutMessagesTimeline from '~/components/workouts/WorkoutMessagesTimeline.vue'

  definePageMeta({
    layout: 'share'
  })

  const route = useRoute()
  const token = route.params.token as string

  const { data, pending, error } = await useFetch<any>(`/api/share/${token}`)

  const workout = computed(() => data.value?.data)
  const user = computed(() => data.value?.user)

  // Meta tags for social sharing
  const pageTitle = computed(() =>
    workout.value
      ? `${workout.value.title} - Shared Workout | Coach Wattz`
      : 'Shared Workout | Coach Wattz'
  )
  const pageDescription = computed(() => {
    if (workout.value) {
      const dateStr = formatDate(workout.value.date)
      return `Check out this planned ${workout.value.type || ''} workout: ${workout.value.title} (${dateStr}).`.substring(
        0,
        160
      )
    }
    return 'View shared workout details on Coach Wattz.'
  })

  useHead({
    title: pageTitle,
    meta: [
      { name: 'description', content: pageDescription },
      { property: 'og:title', content: pageTitle },
      { property: 'og:description', content: pageDescription },
      { property: 'og:type', content: 'article' },
      { name: 'twitter:title', content: pageTitle },
      { name: 'twitter:description', content: pageDescription }
    ]
  })

  function formatDate(d: string | Date) {
    if (!d) return ''
    return new Date(d).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  }

  function formatDuration(seconds: number) {
    if (!seconds) return '-'
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)

    if (hours > 0) {
      return `${hours}h ${mins}m`
    }
    return `${mins}m`
  }
</script>
