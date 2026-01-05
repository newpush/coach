<template>
  <div>
    <UCard>
      <template #header>
        <h2 class="text-xl font-semibold">Connected Apps</h2>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Intervals.icu -->
        <UCard :ui="{ body: 'flex flex-col h-full justify-between gap-4' }">
          <div class="flex items-start gap-4">
            <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
              <UIcon name="i-heroicons-chart-bar" class="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 class="font-semibold">Intervals.icu</h3>
              <p class="text-sm text-muted">Power data and training calendar</p>
            </div>
          </div>
          
          <div class="flex items-center justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-800 mt-auto">
            <div v-if="!intervalsConnected" class="flex flex-col items-end gap-2">
              <UButton
                color="neutral"
                variant="outline"
                @click="signIn('intervals')"
              >
                Connect
              </UButton>
              <UButton
                color="gray"
                variant="link"
                size="xs"
                :padded="false"
                @click="navigateTo('/connect-intervals')"
              >
                Connect manually (API Key)
              </UButton>
            </div>
            <div v-else class="flex items-center gap-2">
              <UButton
                color="error"
                variant="ghost"
                size="xs"
                @click="$emit('disconnect', 'intervals')"
              >
                Disconnect
              </UButton>
              <UButton
                color="neutral"
                variant="outline"
                size="xs"
                class="font-bold"
                icon="i-heroicons-arrow-path-rounded-square"
                @click="advancedSyncModalOpen = true"
              >
                Advanced Sync
              </UButton>
              <UButton
                color="success"
                variant="solid"
                size="xs"
                class="font-bold"
                icon="i-heroicons-arrow-path"
                :loading="syncingProviders.has('intervals')"
                @click="$emit('sync', 'intervals')"
              >
                Sync Now
              </UButton>
            </div>
          </div>
        </UCard>

        <!-- WHOOP -->
        <UCard :ui="{ body: 'flex flex-col h-full justify-between gap-4' }">
          <div class="flex items-start gap-4">
            <div class="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
              <UIcon name="i-heroicons-heart" class="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h3 class="font-semibold">WHOOP</h3>
              <p class="text-sm text-muted">Recovery, sleep, and strain data</p>
            </div>
          </div>

          <div class="flex flex-col gap-2 pt-4 border-t border-gray-100 dark:border-gray-800 mt-auto">
            <div v-if="whoopConnected" class="flex justify-end mb-2">
               <div class="flex items-center gap-2">
                <span class="text-xs text-muted">Ingest Workouts</span>
                <USwitch
                  :model-value="whoopIngestWorkouts"
                  size="xs"
                  @update:model-value="$emit('updateSetting', 'whoop', 'ingestWorkouts', $event)"
                />
              </div>
            </div>
            <div class="flex items-center justify-end gap-2">
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
                <UButton
                  color="error"
                  variant="ghost"
                  size="xs"
                  @click="$emit('disconnect', 'whoop')"
                >
                  Disconnect
                </UButton>
                <UButton
                  color="success"
                  variant="solid"
                  size="xs"
                  class="font-bold"
                  icon="i-heroicons-arrow-path"
                  :loading="syncingProviders.has('whoop')"
                  @click="$emit('sync', 'whoop')"
                >
                  Sync Now
                </UButton>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Withings -->
        <UCard :ui="{ body: 'flex flex-col h-full justify-between gap-4' }">
          <div class="flex items-start gap-4">
            <div class="w-12 h-12 bg-cyan-100 rounded-lg flex items-center justify-center shrink-0">
              <UIcon name="i-heroicons-scale" class="w-6 h-6 text-cyan-600" />
            </div>
            <div>
              <h3 class="font-semibold">Withings</h3>
              <p class="text-sm text-muted">Weight, body composition, and health metrics</p>
            </div>
          </div>

          <div class="flex items-center justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-800 mt-auto">
            <div v-if="!withingsConnected">
              <UButton
                color="neutral"
                variant="outline"
                @click="navigateTo('/connect-withings')"
              >
                Connect
              </UButton>
            </div>
            <div v-else class="flex items-center gap-2">
              <UButton
                color="error"
                variant="ghost"
                size="xs"
                @click="$emit('disconnect', 'withings')"
              >
                Disconnect
              </UButton>
              <UButton
                color="success"
                variant="solid"
                size="xs"
                class="font-bold"
                icon="i-heroicons-arrow-path"
                :loading="syncingProviders.has('withings')"
                @click="$emit('sync', 'withings')"
              >
                Sync Now
              </UButton>
            </div>
          </div>
        </UCard>

        <!-- Yazio -->
        <UCard :ui="{ body: 'flex flex-col h-full justify-between gap-4' }">
          <div class="flex items-start gap-4">
            <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
              <UIcon name="i-heroicons-cake" class="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 class="font-semibold">Yazio</h3>
              <p class="text-sm text-muted">Nutrition tracking and meal planning</p>
            </div>
          </div>

          <div class="flex items-center justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-800 mt-auto">
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
              <UButton
                color="error"
                variant="ghost"
                size="xs"
                @click="$emit('disconnect', 'yazio')"
              >
                Disconnect
              </UButton>
              <UButton
                color="success"
                variant="solid"
                size="xs"
                class="font-bold"
                icon="i-heroicons-arrow-path"
                :loading="syncingProviders.has('yazio')"
                @click="$emit('sync', 'yazio')"
              >
                Sync Now
              </UButton>
            </div>
          </div>
        </UCard>

        <!-- Hevy -->
        <UCard :ui="{ body: 'flex flex-col h-full justify-between gap-4' }">
          <div class="flex items-start gap-4">
            <div class="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center shrink-0">
              <UIcon name="i-heroicons-trophy" class="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h3 class="font-semibold">Hevy</h3>
              <p class="text-sm text-muted">Strength training and workout logging</p>
            </div>
          </div>

          <div class="flex items-center justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-800 mt-auto">
            <div v-if="!hevyConnected">
              <UButton
                color="neutral"
                variant="outline"
                @click="navigateTo('/connect-hevy')"
              >
                Connect
              </UButton>
            </div>
            <div v-else class="flex items-center gap-2">
              <UButton
                color="error"
                variant="ghost"
                size="xs"
                @click="$emit('disconnect', 'hevy')"
              >
                Disconnect
              </UButton>
              <UButton
                color="success"
                variant="solid"
                size="xs"
                class="font-bold"
                icon="i-heroicons-arrow-path"
                :loading="syncingProviders.has('hevy')"
                @click="$emit('sync', 'hevy')"
              >
                Sync Now
              </UButton>
            </div>
          </div>
        </UCard>

        <!-- Strava -->
        <UCard :ui="{ body: 'flex flex-col h-full justify-between gap-4' }">
          <div class="flex items-start gap-4">
            <div class="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
              <UIcon name="i-heroicons-bolt" class="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <h3 class="font-semibold">Strava</h3>
              <p class="text-sm text-muted">Activities and performance tracking</p>
            </div>
          </div>

          <div class="flex items-center justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-800 mt-auto">
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
              <UButton
                color="error"
                variant="ghost"
                size="xs"
                @click="$emit('disconnect', 'strava')"
              >
                Disconnect
              </UButton>
              <UButton
                color="success"
                variant="solid"
                size="xs"
                class="font-bold"
                icon="i-heroicons-arrow-path"
                :loading="syncingProviders.has('strava')"
                @click="$emit('sync', 'strava')"
              >
                Sync Now
              </UButton>
            </div>
          </div>
        </UCard>
      </div>
    </UCard>
    <UModal v-model:open="advancedSyncModalOpen">
      <template #content>
        <UCard>
          <template #header>
            <h3 class="text-lg font-semibold">Advanced Sync</h3>
          </template>

          <div class="space-y-4">
            <p>
              Select how many days of historical data you would like to sync from
              Intervals.icu.
            </p>
            <USelectMenu
              v-model="selectedDays"
              :items="[30, 90, 180, 365]"
              placeholder="Select days"
            />
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="outline"
                @click="advancedSyncModalOpen = false"
              >
                Cancel
              </UButton>
              <UButton
                color="primary"
                :disabled="!selectedDays"
                @click="
                  () => {
                    $emit('sync', 'intervals', selectedDays)
                    advancedSyncModalOpen = false
                  }
                "
              >
                Sync
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
const { signIn } = useAuth()
const advancedSyncModalOpen = ref(false)
const selectedDays = ref<number | undefined>()

defineProps<{
  intervalsConnected: boolean
  whoopConnected: boolean
  whoopIngestWorkouts: boolean
  withingsConnected: boolean
  yazioConnected: boolean
  stravaConnected: boolean
  hevyConnected: boolean
  syncingProviders: Set<string>
}>()

defineEmits<{
  disconnect: [provider: string]
  sync: [provider: string, days?: number]
  updateSetting: [provider: string, setting: string, value: any]
}>()
</script>
