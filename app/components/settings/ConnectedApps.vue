<template>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <!-- Intervals.icu -->
    <UCard :ui="{ body: 'flex flex-col h-full justify-between gap-4' }">
      <div class="flex items-start gap-4">
        <div
          class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
        >
          <img
            src="/images/logos/intervals.png"
            alt="Intervals.icu Logo"
            class="w-8 h-8 object-contain"
          />
        </div>
        <div>
          <h3 class="font-semibold">Intervals.icu</h3>
          <p class="text-sm text-muted">Power data and training calendar</p>
        </div>
      </div>

      <div
        class="flex items-center justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-800 mt-auto"
      >
        <div v-if="!intervalsConnected" class="flex flex-col items-end gap-2">
          <UButton color="neutral" variant="outline" @click="signIn('intervals')">
            Connect
          </UButton>
          <UButton
            color="neutral"
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
            color="success"
            variant="solid"
            size="sm"
            class="font-bold"
            icon="i-heroicons-arrow-path"
            :loading="syncingProviders.has('intervals')"
            @click="$emit('sync', 'intervals')"
          >
            Sync Now
          </UButton>

          <UDropdownMenu :items="intervalsActions">
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              icon="i-heroicons-ellipsis-vertical"
            />
          </UDropdownMenu>
        </div>
      </div>
    </UCard>

    <!-- WHOOP -->
    <UCard :ui="{ body: 'flex flex-col h-full justify-between gap-4' }">
      <div class="flex items-start gap-4">
        <div
          class="w-12 h-12 bg-white rounded-lg flex items-center justify-center shrink-0 overflow-hidden ring-1 ring-gray-200 dark:ring-gray-700"
        >
          <img
            src="/images/logos/whoop_square.svg"
            alt="WHOOP Logo"
            class="w-8 h-8 object-contain"
          />
        </div>
        <div>
          <h3 class="font-semibold">WHOOP</h3>
          <p class="text-sm text-muted">Recovery, sleep, and strain data</p>
        </div>
      </div>

      <div class="flex flex-col gap-2 pt-4 border-t border-gray-100 dark:border-gray-800 mt-auto">
        <div class="flex items-center justify-end gap-2">
          <div v-if="!whoopConnected">
            <UButton color="neutral" variant="outline" @click="navigateTo('/connect-whoop')">
              Connect
            </UButton>
          </div>
          <div v-else class="flex items-center gap-2">
            <UButton
              color="success"
              variant="solid"
              size="sm"
              class="font-bold"
              icon="i-heroicons-arrow-path"
              :loading="syncingProviders.has('whoop')"
              @click="$emit('sync', 'whoop')"
            >
              Sync Now
            </UButton>
            <UDropdownMenu :items="whoopActions">
              <UButton
                color="neutral"
                variant="outline"
                size="sm"
                icon="i-heroicons-ellipsis-vertical"
              />
            </UDropdownMenu>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Oura -->
    <UCard :ui="{ body: 'flex flex-col h-full justify-between gap-4' }">
      <div class="flex items-start gap-4">
        <div
          class="w-12 h-12 bg-white rounded-lg flex items-center justify-center shrink-0 overflow-hidden ring-1 ring-gray-200 dark:ring-gray-700"
        >
          <img src="/images/logos/oura.svg" alt="Oura Logo" class="w-8 h-8 object-contain" />
        </div>
        <div>
          <h3 class="font-semibold">Oura</h3>
          <p class="text-sm text-muted">Readiness, sleep, and activity data</p>
        </div>
      </div>

      <div class="flex flex-col gap-2 pt-4 border-t border-gray-100 dark:border-gray-800 mt-auto">
        <div class="flex items-center justify-end gap-2">
          <div v-if="!ouraConnected">
            <UButton color="neutral" variant="outline" @click="navigateTo('/connect-oura')">
              Connect
            </UButton>
          </div>
          <div v-else class="flex items-center gap-2">
            <UButton
              color="success"
              variant="solid"
              size="sm"
              class="font-bold"
              icon="i-heroicons-arrow-path"
              :loading="syncingProviders.has('oura')"
              @click="$emit('sync', 'oura')"
            >
              Sync Now
            </UButton>
            <UDropdownMenu :items="ouraActions">
              <UButton
                color="neutral"
                variant="outline"
                size="sm"
                icon="i-heroicons-ellipsis-vertical"
              />
            </UDropdownMenu>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Withings -->
    <UCard :ui="{ body: 'flex flex-col h-full justify-between gap-4' }">
      <div class="flex items-start gap-4">
        <div
          class="w-12 h-12 bg-white rounded-lg flex items-center justify-center shrink-0 overflow-hidden ring-1 ring-gray-200 dark:ring-gray-700"
        >
          <img
            src="/images/logos/withings.png"
            alt="Withings Logo"
            class="w-8 h-8 object-contain"
          />
        </div>
        <div>
          <h3 class="font-semibold">Withings</h3>
          <p class="text-sm text-muted">Weight, body composition, and health metrics</p>
        </div>
      </div>

      <div
        class="flex items-center justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-800 mt-auto"
      >
        <div v-if="!withingsConnected">
          <UButton color="neutral" variant="outline" @click="navigateTo('/connect-withings')">
            Connect
          </UButton>
        </div>
        <div v-else class="flex items-center gap-2">
          <UButton
            color="success"
            variant="solid"
            size="sm"
            class="font-bold"
            icon="i-heroicons-arrow-path"
            :loading="syncingProviders.has('withings')"
            @click="$emit('sync', 'withings')"
          >
            Sync Now
          </UButton>
          <UDropdownMenu :items="withingsActions">
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              icon="i-heroicons-ellipsis-vertical"
            />
          </UDropdownMenu>
        </div>
      </div>
    </UCard>

    <!-- Yazio -->
    <UCard :ui="{ body: 'flex flex-col h-full justify-between gap-4' }">
      <div class="flex items-start gap-4">
        <div
          class="w-12 h-12 bg-white rounded-lg flex items-center justify-center shrink-0 overflow-hidden ring-1 ring-gray-200 dark:ring-gray-700"
        >
          <img
            src="/images/logos/yazio_square.webp"
            alt="Yazio Logo"
            class="w-8 h-8 object-contain"
          />
        </div>
        <div>
          <h3 class="font-semibold">Yazio</h3>
          <p class="text-sm text-muted">Nutrition tracking and meal planning</p>
        </div>
      </div>

      <div
        class="flex items-center justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-800 mt-auto"
      >
        <div v-if="!yazioConnected">
          <UButton color="neutral" variant="outline" @click="navigateTo('/connect-yazio')">
            Connect
          </UButton>
        </div>
        <div v-else class="flex items-center gap-2">
          <UButton
            color="success"
            variant="solid"
            size="sm"
            class="font-bold"
            icon="i-heroicons-arrow-path"
            :loading="syncingProviders.has('yazio')"
            @click="$emit('sync', 'yazio')"
          >
            Sync Now
          </UButton>
          <UDropdownMenu :items="yazioActions">
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              icon="i-heroicons-ellipsis-vertical"
            />
          </UDropdownMenu>
        </div>
      </div>
    </UCard>

    <!-- Fitbit -->
    <UCard :ui="{ body: 'flex flex-col h-full justify-between gap-4' }">
      <div class="flex items-start gap-4">
        <div
          class="w-12 h-12 bg-white rounded-lg flex items-center justify-center shrink-0 overflow-hidden ring-1 ring-gray-200 dark:ring-gray-700"
        >
          <img
            src="/images/logos/fitbit_square.png"
            alt="Fitbit Logo"
            class="w-8 h-8 object-contain"
          />
        </div>
        <div>
          <h3 class="font-semibold">Fitbit</h3>
          <p class="text-sm text-muted">Nutrition history and food logs</p>
        </div>
      </div>

      <div
        class="flex items-center justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-800 mt-auto"
      >
        <div v-if="!fitbitConnected">
          <UButton color="neutral" variant="outline" @click="navigateTo('/connect-fitbit')">
            Connect
          </UButton>
        </div>
        <div v-else class="flex items-center gap-2">
          <UButton
            color="success"
            variant="solid"
            size="sm"
            class="font-bold"
            icon="i-heroicons-arrow-path"
            :loading="syncingProviders.has('fitbit')"
            @click="$emit('sync', 'fitbit')"
          >
            Sync Now
          </UButton>
          <UDropdownMenu :items="fitbitActions">
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              icon="i-heroicons-ellipsis-vertical"
            />
          </UDropdownMenu>
        </div>
      </div>
    </UCard>

    <!-- Hevy -->
    <UCard :ui="{ body: 'flex flex-col h-full justify-between gap-4' }">
      <div class="flex items-start gap-4">
        <div
          class="w-12 h-12 bg-white rounded-lg flex items-center justify-center shrink-0 overflow-hidden ring-1 ring-gray-200 dark:ring-gray-700"
        >
          <img src="/images/logos/hevy-icon.png" alt="Hevy Logo" class="w-8 h-8 object-contain" />
        </div>
        <div>
          <h3 class="font-semibold">Hevy</h3>
          <p class="text-sm text-muted">Strength training and workout logging</p>
        </div>
      </div>

      <div
        class="flex items-center justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-800 mt-auto"
      >
        <div v-if="!hevyConnected">
          <UButton color="neutral" variant="outline" @click="navigateTo('/connect-hevy')">
            Connect
          </UButton>
        </div>
        <div v-else class="flex items-center gap-2">
          <UButton
            color="success"
            variant="solid"
            size="sm"
            class="font-bold"
            icon="i-heroicons-arrow-path"
            :loading="syncingProviders.has('hevy')"
            @click="$emit('sync', 'hevy')"
          >
            Sync Now
          </UButton>
          <UDropdownMenu :items="hevyActions">
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              icon="i-heroicons-ellipsis-vertical"
            />
          </UDropdownMenu>
        </div>
      </div>
    </UCard>

    <!-- Garmin -->
    <UCard :ui="{ body: 'flex flex-col h-full justify-between gap-4' }">
      <div class="flex items-start gap-4">
        <div
          class="w-12 h-12 bg-white rounded-lg flex items-center justify-center shrink-0 overflow-hidden ring-1 ring-gray-200 dark:ring-gray-700"
        >
          <img
            src="/images/logos/Garmin-Tag-black-high-res.png"
            alt="Garmin Logo"
            class="w-8 h-8 object-contain dark:hidden"
          />
          <img
            src="/images/logos/Garmin-Tag-white-high-res.png"
            alt="Garmin Logo"
            class="w-8 h-8 object-contain hidden dark:block"
          />
        </div>
        <div>
          <h3 class="font-semibold">Garmin</h3>
          <p class="text-sm text-muted">Activities and health metrics via Intervals.icu</p>
        </div>
      </div>

      <div
        class="flex items-center justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-800 mt-auto"
      >
        <UButton
          v-if="!intervalsConnected"
          color="primary"
          variant="soft"
          size="xs"
          @click="signIn('intervals')"
        >
          Connect Intervals
        </UButton>
      </div>
    </UCard>

    <!-- Polar -->
    <UCard :ui="{ body: 'flex flex-col h-full justify-between gap-4' }">
      <div class="flex items-start gap-4">
        <div
          class="w-12 h-12 bg-white rounded-lg flex items-center justify-center shrink-0 overflow-hidden ring-1 ring-gray-200 dark:ring-gray-700"
        >
          <img
            src="/images/logos/polar_logo_square.png"
            alt="Polar Logo"
            class="w-8 h-8 object-contain"
          />
        </div>
        <div>
          <h3 class="font-semibold">Polar</h3>
          <p class="text-sm text-muted">Activities, sleep, and nightly recharge</p>
        </div>
      </div>

      <div
        class="flex items-center justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-800 mt-auto"
      >
        <div v-if="!polarConnected">
          <UButton
            color="neutral"
            variant="outline"
            @click="navigateTo('/api/integrations/polar/authorize', { external: true })"
          >
            Connect
          </UButton>
        </div>
        <div v-else class="flex items-center gap-2">
          <UButton
            color="success"
            variant="solid"
            size="sm"
            class="font-bold"
            icon="i-heroicons-arrow-path"
            :loading="syncingProviders.has('polar')"
            @click="$emit('sync', 'polar')"
          >
            Sync Now
          </UButton>
          <UDropdownMenu :items="polarActions">
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              icon="i-heroicons-ellipsis-vertical"
            />
          </UDropdownMenu>
        </div>
      </div>
    </UCard>

    <!-- Strava -->
    <UCard :ui="{ body: 'flex flex-col h-full justify-between gap-4' }">
      <div class="flex items-start gap-4">
        <div
          class="w-12 h-12 bg-white rounded-lg flex items-center justify-center shrink-0 overflow-hidden ring-1 ring-gray-200 dark:ring-gray-700"
        >
          <img src="/images/logos/strava.svg" alt="Strava Logo" class="w-8 h-8 object-contain" />
        </div>
        <div>
          <h3 class="font-semibold">Strava</h3>
          <p class="text-sm text-muted">Activities and performance tracking</p>
        </div>
      </div>

      <div
        class="flex items-center justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-800 mt-auto"
      >
        <div v-if="!stravaConnected">
          <UTooltip
            :text="
              isStravaDisabled
                ? 'Strava integration is temporarily unavailable on coachwatts.com'
                : ''
            "
            :popper="{ placement: 'top' }"
          >
            <UButton
              color="neutral"
              variant="outline"
              :disabled="isStravaDisabled"
              @click="navigateTo('/connect-strava')"
            >
              Connect
            </UButton>
          </UTooltip>
        </div>
        <div v-else class="flex items-center gap-2">
          <UButton
            color="success"
            variant="solid"
            size="sm"
            class="font-bold"
            icon="i-heroicons-arrow-path"
            :loading="syncingProviders.has('strava')"
            @click="$emit('sync', 'strava')"
          >
            Sync Now
          </UButton>
          <UDropdownMenu :items="stravaActions">
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              icon="i-heroicons-ellipsis-vertical"
            />
          </UDropdownMenu>
        </div>
      </div>
    </UCard>

    <!-- Telegram -->
    <UCard :ui="{ body: 'flex flex-col h-full justify-between gap-4' }">
      <div class="flex items-start gap-4">
        <div
          class="w-12 h-12 bg-white rounded-lg flex items-center justify-center shrink-0 overflow-hidden ring-1 ring-gray-200 dark:ring-gray-700"
        >
          <UIcon name="i-simple-icons-telegram" class="w-8 h-8 text-[#26A5E4]" />
        </div>
        <div>
          <h3 class="font-semibold">Telegram</h3>
          <p class="text-sm text-muted">Chat with your AI Coach on the go</p>
        </div>
      </div>

      <div
        class="flex items-center justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-800 mt-auto"
      >
        <div v-if="!telegramConnected">
          <UButton
            color="neutral"
            variant="outline"
            icon="i-heroicons-paper-airplane"
            @click="$emit('connect-telegram')"
          >
            Connect Bot
          </UButton>
        </div>
        <div v-else class="flex items-center gap-2">
          <UButton
            color="success"
            variant="solid"
            size="sm"
            class="font-bold"
            icon="i-heroicons-check-circle"
          >
            Connected
          </UButton>

          <UDropdownMenu :items="telegramActions">
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              icon="i-heroicons-ellipsis-vertical"
            />
          </UDropdownMenu>
        </div>
      </div>
    </UCard>

    <UModal v-model:open="advancedSyncModalOpen" title="Advanced Sync">
      <template #body>
        <div class="space-y-4">
          <p>Select how many days of historical data you would like to sync from Intervals.icu.</p>
          <USelectMenu
            v-model="selectedDays"
            :items="[30, 90, 180, 365]"
            placeholder="Select days"
          />
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="outline" @click="advancedSyncModalOpen = false">
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
    </UModal>

    <UModal v-model:open="intervalsSettingsModalOpen" title="Intervals.icu Settings">
      <template #body>
        <div class="space-y-6 sm:min-w-[400px]">
          <UFormField
            label="Readiness Score Scale"
            description="How should we interpret the 'readiness' value from Intervals.icu?"
          >
            <USelectMenu
              :model-value="intervalsSettings?.readinessScale || 'STANDARD'"
              :items="[
                { label: 'Standard (0-100)', value: 'STANDARD' },
                { label: '10-Point Scale (1-10)', value: 'TEN_POINT' },
                { label: 'Polar Scale (1-6)', value: 'POLAR' }
              ]"
              class="w-full"
              @update:model-value="
                (item: any) =>
                  $emit('updateSetting', 'intervals', 'settings', {
                    ...intervalsSettings,
                    readinessScale: item.value
                  })
              "
            />
          </UFormField>

          <UFormField
            label="Planned Workouts Sync"
            description="Enable bidirectional synchronization of planned workouts with Intervals.icu."
          >
            <UCheckbox
              :model-value="intervalsSettings?.importPlannedWorkouts !== false"
              label="Enable Sync"
              @update:model-value="
                (checked: any) =>
                  $emit('updateSetting', 'intervals', 'settings', {
                    ...intervalsSettings,
                    importPlannedWorkouts: !!checked
                  })
              "
            />
          </UFormField>

          <UFormField
            label="Activities"
            description="Import completed activities from Intervals.icu."
          >
            <UCheckbox
              :model-value="intervalsIngestWorkouts"
              label="Ingest Activities"
              @update:model-value="
                (checked: any) => $emit('updateSetting', 'intervals', 'ingestWorkouts', !!checked)
              "
            />
          </UFormField>

          <p class="text-xs text-muted">
            Note: Changing these settings only affects future data syncs. Existing records in the
            database will not be updated automatically.
          </p>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end">
          <UButton color="neutral" variant="soft" @click="intervalsSettingsModalOpen = false">
            Close
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
  const props = defineProps<{
    intervalsConnected: boolean
    intervalsIngestWorkouts: boolean
    whoopConnected: boolean
    whoopIngestWorkouts: boolean
    ouraConnected: boolean
    ouraIngestWorkouts: boolean
    withingsConnected: boolean
    yazioConnected: boolean
    fitbitConnected: boolean
    stravaConnected: boolean
    hevyConnected: boolean
    polarConnected: boolean
    polarIngestWorkouts: boolean
    telegramConnected: boolean
    syncingProviders: Set<string>
    intervalsSettings: any
  }>()

  const { signIn } = useAuth()
  const advancedSyncModalOpen = ref(false)
  const intervalsSettingsModalOpen = ref(false)
  const selectedDays = ref<number | undefined>()
  const emit = defineEmits<{
    disconnect: [provider: string]
    sync: [provider: string, days?: number]
    'sync-profile': [provider: string]
    'connect-telegram': []
    updateSetting: [provider: string, setting: string, value: any]
  }>()

  const intervalsActions = computed(() => [
    [
      {
        label: 'Sync Profile',
        icon: 'i-heroicons-user',
        onSelect: () => emit('sync-profile', 'intervals')
      },
      {
        label: 'Advanced Sync',
        icon: 'i-heroicons-arrow-path-rounded-square',
        onSelect: () => {
          advancedSyncModalOpen.value = true
        }
      },
      {
        label: 'Settings',
        icon: 'i-heroicons-cog-6-tooth',
        onSelect: () => {
          intervalsSettingsModalOpen.value = true
        }
      }
    ],
    [
      {
        label: 'Disconnect',
        icon: 'i-heroicons-trash',
        color: 'error' as const,
        onSelect: () => emit('disconnect', 'intervals')
      }
    ]
  ])

  const whoopActions = computed(() => [
    [
      {
        label: 'Ingest Workouts',
        type: 'checkbox' as const,
        checked: props.whoopIngestWorkouts,
        onUpdateChecked: (checked: boolean) =>
          emit('updateSetting', 'whoop', 'ingestWorkouts', checked)
      }
    ],
    [
      {
        label: 'Disconnect',
        icon: 'i-heroicons-trash',
        color: 'error' as const,
        onSelect: () => emit('disconnect', 'whoop')
      }
    ]
  ])

  const ouraActions = computed(() => [
    [
      {
        label: 'Ingest Workouts',
        type: 'checkbox' as const,
        checked: props.ouraIngestWorkouts,
        onUpdateChecked: (checked: boolean) =>
          emit('updateSetting', 'oura', 'ingestWorkouts', checked)
      }
    ],
    [
      {
        label: 'Disconnect',
        icon: 'i-heroicons-trash',
        color: 'error' as const,
        onSelect: () => emit('disconnect', 'oura')
      }
    ]
  ])

  const withingsActions = computed(() => [
    [
      {
        label: 'Disconnect',
        icon: 'i-heroicons-trash',
        color: 'error' as const,
        onSelect: () => emit('disconnect', 'withings')
      }
    ]
  ])

  const yazioActions = computed(() => [
    [
      {
        label: 'Disconnect',
        icon: 'i-heroicons-trash',
        color: 'error' as const,
        onSelect: () => emit('disconnect', 'yazio')
      }
    ]
  ])

  const fitbitActions = computed(() => [
    [
      {
        label: 'Disconnect',
        icon: 'i-heroicons-trash',
        color: 'error' as const,
        onSelect: () => emit('disconnect', 'fitbit')
      }
    ]
  ])

  const hevyActions = computed(() => [
    [
      {
        label: 'Disconnect',
        icon: 'i-heroicons-trash',
        color: 'error' as const,
        onSelect: () => emit('disconnect', 'hevy')
      }
    ]
  ])

  const stravaActions = computed(() => [
    [
      {
        label: 'Disconnect',
        icon: 'i-heroicons-trash',
        color: 'error' as const,
        onSelect: () => emit('disconnect', 'strava')
      }
    ]
  ])

  const polarActions = computed(() => [
    [
      {
        label: 'Ingest Workouts',
        type: 'checkbox' as const,
        checked: props.polarIngestWorkouts,
        onUpdateChecked: (checked: boolean) =>
          emit('updateSetting', 'polar', 'ingestWorkouts', checked)
      }
    ],
    [
      {
        label: 'Disconnect',
        icon: 'i-heroicons-trash',
        color: 'error' as const,
        onSelect: () => emit('disconnect', 'polar')
      }
    ]
  ])

  const telegramActions = computed(() => [
    [
      {
        label: 'Disconnect',
        icon: 'i-heroicons-trash',
        color: 'error' as const,
        onSelect: () => emit('disconnect', 'telegram')
      }
    ]
  ])

  const isStravaDisabled = computed(() => {
    if (import.meta.server) return false
    return window.location.hostname === 'coachwatts.com'
  })
</script>
