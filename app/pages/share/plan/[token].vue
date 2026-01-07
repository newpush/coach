<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <!-- Loading State -->
    <div v-if="pending" class="flex items-center justify-center py-12">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"/>
        <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">Loading shared training plan...</p>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="text-center py-12">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8 max-w-md mx-auto">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Unavailable</h3>
        <p class="text-gray-600 dark:text-gray-400 mb-6">{{ error.message || 'This shared plan link is invalid or expired.' }}</p>
        <UButton to="/" color="primary" variant="solid">Go Home</UButton>
      </div>
    </div>

    <!-- Plan Content -->
    <div v-else-if="plan" class="space-y-8">
      <!-- Header Section -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
        <div class="flex items-start justify-between mb-4">
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-2">
              <UAvatar
                v-if="user?.image"
                :src="user.image"
                :alt="user.name || 'User'"
                size="xs"
              />
              <span class="text-sm text-gray-500 dark:text-gray-400">
                {{ user?.name || 'Coach Wattz User' }} shared a training plan
              </span>
            </div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {{ plan.name || 'Training Plan' }}
            </h1>
            <div class="flex flex-wrap gap-3 text-sm text-gray-600 dark:text-gray-400">
               <div v-if="plan.goal?.title" class="flex items-center gap-1">
                <span class="i-heroicons-trophy w-4 h-4 text-amber-500"/>
                Goal: {{ plan.goal.title }}
              </div>
              <div v-if="plan.startDate" class="flex items-center gap-1">
                <span class="i-heroicons-calendar w-4 h-4"/>
                Starts {{ formatDate(plan.startDate) }}
              </div>
              <div v-if="plan.blocks?.length" class="flex items-center gap-1">
                <span class="i-heroicons-squares-2x2 w-4 h-4"/>
                {{ plan.blocks.length }} Blocks
              </div>
            </div>
          </div>
           <div class="flex gap-2">
            <span class="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">
              Training Plan
            </span>
          </div>
        </div>

        <div v-if="plan.description" class="mt-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{{ plan.description }}</p>
        </div>
      </div>

      <!-- Blocks and Weeks -->
      <div v-for="block in plan.blocks" :key="block.id" class="space-y-4">
        <div class="flex items-center justify-between">
           <h2 class="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
             <span class="i-heroicons-cube-transparent w-6 h-6 text-primary-500"/>
             {{ block.name }}
           </h2>
           <UBadge color="neutral" variant="soft">{{ block.weeks?.length || 0 }} Weeks</UBadge>
        </div>

        <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <div v-for="week in block.weeks" :key="week.id" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
            <div class="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h3 class="font-semibold text-gray-900 dark:text-white">Week {{ week.weekNumber }}</h3>
              <span class="text-xs text-gray-500 dark:text-gray-400">
                {{ formatDateRange(week.startDate, week.endDate) }}
              </span>
            </div>
            
            <div class="p-4 flex-1 space-y-3">
              <div v-if="week.focus" class="text-sm text-gray-600 dark:text-gray-400 italic mb-2">
                Focus: {{ week.focus }}
              </div>

               <div v-if="week.workouts?.length === 0" class="text-sm text-gray-500 text-center py-4">
                  No workouts planned
               </div>

               <NuxtLink 
                  v-for="workout in week.workouts" 
                  :key="workout.id"
                  :to="workout.shareToken?.token ? `/share/planned-workout/${workout.shareToken.token}` : '#'"
                  :class="[
                    'block p-3 rounded-md border transition-colors relative group',
                    workout.shareToken?.token 
                      ? 'border-gray-200 dark:border-gray-700 hover:border-primary-500 dark:hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/10 cursor-pointer' 
                      : 'border-transparent bg-gray-50 dark:bg-gray-800 opacity-75 cursor-default'
                  ]"
               >
                  <div class="flex items-center justify-between gap-4">
                    <div class="flex-1 min-w-0">
                      <div class="flex justify-between items-start mb-1 pr-6">
                        <span class="text-sm font-medium text-gray-900 dark:text-white line-clamp-1">{{ workout.title }}</span>
                      </div>
                      <div class="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                        <span class="flex items-center gap-1">
                          <UIcon name="i-heroicons-calendar" class="w-3 h-3" />
                          {{ formatDay(workout.date) }}
                        </span>
                        <span v-if="workout.durationSec" class="flex items-center gap-1">
                          <UIcon name="i-heroicons-clock" class="w-3 h-3" />
                          {{ formatDuration(workout.durationSec) }}
                        </span>
                        <span v-if="workout.tss" class="flex items-center gap-1 text-amber-600 dark:text-amber-500">
                          <UIcon name="i-heroicons-bolt" class="w-3 h-3" />
                          {{ Math.round(workout.tss) }} TSS
                        </span>
                      </div>
                    </div>

                    <div v-if="workout.structuredWorkout" class="shrink-0">
                       <MiniWorkoutChart
                          :workout="workout.structuredWorkout"
                          class="w-20 h-10 opacity-75"
                       />
                    </div>
                  </div>

                  <UIcon v-if="workout.shareToken?.token" name="i-heroicons-arrow-top-right-on-square" class="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity absolute top-3 right-3" />
               </NuxtLink>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import MiniWorkoutChart from '~/components/workouts/MiniWorkoutChart.vue'

const { formatDate: baseFormatDate, formatShortDate } = useFormat()

definePageMeta({
  layout: 'share'
})

const route = useRoute()
const token = route.params.token as string

const { data, pending, error } = await useFetch<any>(`/api/share/${token}`)

const plan = computed(() => data.value?.data)
const user = computed(() => data.value?.user)

// Meta tags
const pageTitle = computed(() => {
  if (plan.value?.name) {
    return `${plan.value.name} - Shared Training Plan | Coach Wattz`
  }
  return 'Shared Training Plan | Coach Wattz'
})
const pageDescription = computed(() => {
  if (plan.value) {
    return `Check out this training plan: ${plan.value.name}. ${plan.value.description || ''}`.substring(0, 160)
  }
  return 'View shared training plan details on Coach Wattz.'
})

useHead({
  title: pageTitle,
  meta: [
    { name: 'description', content: pageDescription },
    { property: 'og:title', content: pageTitle },
    { property: 'og:description', content: pageDescription },
    { property: 'og:type', content: 'article' },
  ]
})

function formatDate(d: string | Date) {
  if (!d) return ''
  return baseFormatDate(d)
}

function formatDay(d: string | Date) {
    if (!d) return ''
    return baseFormatDate(d, 'EEE')
}

function formatDateRange(start: string | Date, end: string | Date) {
    if (!start || !end) return ''
    return `${baseFormatDate(start, 'MMM d')} - ${baseFormatDate(end, 'MMM d')}`
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
