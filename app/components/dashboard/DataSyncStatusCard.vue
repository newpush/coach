<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="font-semibold">Data Sync</h3>
        <UBadge color="success" variant="subtle">
          <UIcon name="i-heroicons-check-circle" class="w-3 h-3" />
          Connected
        </UBadge>
      </div>
    </template>

    <div v-if="integrationStore.dataSyncStatus" class="space-y-3">
      <!-- Workouts -->
      <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-bolt" class="w-4 h-4 text-primary" />
            <span class="text-sm font-medium">Workouts</span>
          </div>
          <UBadge
            :color="integrationStore.dataSyncStatus.workouts ? 'success' : 'neutral'"
            variant="subtle"
            size="sm"
          >
            {{ integrationStore.dataSyncStatus.workoutCount || 0 }} synced
          </UBadge>
        </div>
        <p
          v-if="integrationStore.dataSyncStatus.workoutProviders?.length"
          class="text-xs text-muted mt-1 ml-6"
        >
          via {{ integrationStore.dataSyncStatus.workoutProviders.join(', ') }}
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
            :color="integrationStore.dataSyncStatus.nutrition ? 'success' : 'neutral'"
            variant="subtle"
            size="sm"
          >
            {{ integrationStore.dataSyncStatus.nutritionCount || 0 }} days
          </UBadge>
        </div>
        <p
          v-if="integrationStore.dataSyncStatus.nutritionProviders?.length"
          class="text-xs text-muted mt-1 ml-6"
        >
          via {{ integrationStore.dataSyncStatus.nutritionProviders.join(', ') }}
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
            :color="integrationStore.dataSyncStatus.wellness ? 'success' : 'neutral'"
            variant="subtle"
            size="sm"
          >
            {{ integrationStore.dataSyncStatus.wellnessCount || 0 }} days
          </UBadge>
        </div>
        <p
          v-if="integrationStore.dataSyncStatus.wellnessProviders?.length"
          class="text-xs text-muted mt-1 ml-6"
        >
          via {{ integrationStore.dataSyncStatus.wellnessProviders.join(', ') }}
        </p>
      </div>

      <!-- Last Sync Info -->
      <div
        v-if="integrationStore.lastSyncTime"
        class="text-xs text-muted text-center pt-2 border-t"
      >
        Last synced {{ formatRelativeTime(integrationStore.lastSyncTime) }}
      </div>
    </div>

    <template #footer>
      <UButton to="/settings" block variant="outline" size="sm"> Manage Connections </UButton>
    </template>
  </UCard>
</template>

<script setup lang="ts">
  const integrationStore = useIntegrationStore()
  const { formatRelativeTime } = useFormat()
</script>
