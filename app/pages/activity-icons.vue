<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Activity Icons Reference" />
    </template>

    <template #body>
      <div class="p-6">
        <UCard>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
            <div
              v-for="type in activityTypes"
              :key="type"
              class="flex flex-col items-center justify-center p-4 rounded-xl border-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              :class="getWorkoutBorderColorClass(type)"
            >
              <div class="p-3 rounded-full bg-gray-100 dark:bg-gray-800 mb-3">
                <UIcon
                  :name="getWorkoutIcon(type)"
                  class="w-8 h-8"
                  :class="getWorkoutColorClass(type)"
                />
              </div>
              <span class="font-bold text-sm text-center">{{ type }}</span>
              <span class="text-xs text-gray-500 mt-1">{{ getWorkoutIcon(type) }}</span>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
  import {
    WORKOUT_ICONS,
    getWorkoutIcon,
    getWorkoutColorClass,
    getWorkoutBorderColorClass
  } from '~/utils/activity-types'

  const activityTypes = Object.keys(WORKOUT_ICONS)

  useHead({
    title: 'Activity Icons'
  })
</script>
