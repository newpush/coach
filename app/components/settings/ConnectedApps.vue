<template>
  <UCard>
    <template #header>
      <h2 class="text-xl font-semibold">Connected Apps</h2>
    </template>
    
    <div class="space-y-4">
      <div class="flex items-center justify-between p-4 border rounded-lg">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
            <UIcon name="i-heroicons-chart-bar" class="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h3 class="font-semibold">Intervals.icu</h3>
            <p class="text-sm text-muted">Power data and training calendar</p>
          </div>
        </div>
        <div v-if="!intervalsConnected">
          <UButton
            color="neutral"
            variant="outline"
            @click="navigateTo('/connect-intervals')"
          >
            Connect
          </UButton>
        </div>
        <div v-else class="flex items-center gap-2">
          <UBadge color="success">Connected</UBadge>
          <UButton
            color="error"
            variant="ghost"
            size="xs"
            @click="$emit('disconnect', 'intervals')"
          >
            Disconnect
          </UButton>
        </div>
      </div>
      
      <div class="flex items-center justify-between p-4 border rounded-lg">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
            <UIcon name="i-heroicons-heart" class="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h3 class="font-semibold">WHOOP</h3>
            <p class="text-sm text-muted">Recovery, sleep, and strain data</p>
          </div>
        </div>
        <div v-if="!whoopConnected">
          <UButton
            color="neutral"
            variant="outline"
            @click="navigateTo('/connect-whoop')"
          >
            Connect
          </UButton>
        </div>
        <div v-else class="flex items-center gap-2">
          <UBadge color="success">Connected</UBadge>
          <UButton
            color="error"
            variant="ghost"
            size="xs"
            @click="$emit('disconnect', 'whoop')"
          >
            Disconnect
          </UButton>
        </div>
      </div>
      
      <div class="flex items-center justify-between p-4 border rounded-lg">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
            <UIcon name="i-heroicons-cake" class="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h3 class="font-semibold">Yazio</h3>
            <p class="text-sm text-muted">Nutrition tracking and meal planning</p>
          </div>
        </div>
        <div v-if="!yazioConnected">
          <UButton
            color="neutral"
            variant="outline"
            @click="navigateTo('/connect-yazio')"
          >
            Connect
          </UButton>
        </div>
        <div v-else class="flex items-center gap-2">
          <UBadge color="success">Connected</UBadge>
          <UButton
            color="error"
            variant="ghost"
            size="xs"
            @click="$emit('disconnect', 'yazio')"
          >
            Disconnect
          </UButton>
        </div>
      </div>
      
      <div class="flex items-center justify-between p-4 border rounded-lg">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
            <UIcon name="i-heroicons-bolt" class="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <h3 class="font-semibold">Strava</h3>
            <p class="text-sm text-muted">Activities and performance tracking</p>
          </div>
        </div>
        <div v-if="!stravaConnected">
          <UButton
            color="neutral"
            variant="outline"
            @click="navigateTo('/connect-strava')"
          >
            Connect
          </UButton>
        </div>
        <div v-else class="flex items-center gap-2">
          <UBadge color="success">Connected</UBadge>
          <UButton
            color="error"
            variant="ghost"
            size="xs"
            @click="$emit('disconnect', 'strava')"
          >
            Disconnect
          </UButton>
        </div>
      </div>
      
      <div v-if="yazioConnected || stravaConnected" class="mt-4 flex items-center gap-4">
        <UButton
          v-if="yazioConnected"
          color="neutral"
          variant="outline"
          size="sm"
          @click="$emit('sync', 'yazio')"
          :disabled="syncingYazio"
        >
          {{ syncingYazio ? 'Syncing Yazio...' : 'Sync Yazio' }}
        </UButton>
        <UButton
          v-if="stravaConnected"
          color="neutral"
          variant="outline"
          size="sm"
          @click="$emit('sync', 'strava')"
          :disabled="syncingStrava"
        >
          {{ syncingStrava ? 'Syncing Strava...' : 'Sync Strava' }}
        </UButton>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
defineProps<{
  intervalsConnected: boolean
  whoopConnected: boolean
  yazioConnected: boolean
  stravaConnected: boolean
  syncingYazio: boolean
  syncingStrava: boolean
}>()

defineEmits<{
  disconnect: [provider: string]
  sync: [provider: string]
}>()
</script>