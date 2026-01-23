<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-2xl font-bold">Connected Apps</h2>
      <p class="text-neutral-500">Manage your connected apps and integrations.</p>
    </div>
    <UAlert
      v-if="intervalsConnected && !intervalsStravaWarningDismissed"
      title="Strava Activity Sync"
      icon="i-heroicons-exclamation-triangle"
      color="warning"
      variant="soft"
      :actions="[{ label: 'Dismiss', color: 'warning', variant: 'link' }]"
      description="Activities synced from Strava to Intervals.icu cannot be automatically imported. Please connect Strava directly or upload FIT files manually."
      @dismiss="intervalsStravaWarningDismissed = true"
    />
    <SettingsConnectedApps
      :intervals-connected="intervalsConnected"
      :whoop-connected="whoopConnected"
      :whoop-ingest-workouts="whoopIngestWorkouts"
      :withings-connected="withingsConnected"
      :yazio-connected="yazioConnected"
      :strava-connected="stravaConnected"
      :hevy-connected="hevyConnected"
      :syncing-providers="syncingProviders"
      @disconnect="disconnectIntegration"
      @sync="syncIntegration"
      @sync-profile="syncProfile"
      @update-setting="updateIntegrationSetting"
    />
  </div>
</template>

<script setup lang="ts">
  const toast = useToast()
  const router = useRouter()
  const route = useRoute()

  const intervalsStravaWarningDismissed = useCookie('intervals-strava-warning-dismissed', {
    maxAge: 60 * 60 * 24 * 365
  })

  definePageMeta({
    middleware: 'auth'
  })

  useHead({
    title: 'Connected Apps',
    meta: [
      {
        name: 'description',
        content:
          'Manage your connected apps and integrations (Intervals.icu, WHOOP, Withings, Strava, Yazio).'
      }
    ]
  })

  // Integration status
  const { data: integrationStatus, refresh: refreshIntegrations } = useFetch(
    '/api/integrations/status',
    {
      lazy: true,
      server: false
    }
  )

  const intervalsConnected = computed(
    () =>
      integrationStatus.value?.integrations?.some((i: any) => i.provider === 'intervals') ?? false
  )

  const whoopConnected = computed(
    () => integrationStatus.value?.integrations?.some((i: any) => i.provider === 'whoop') ?? false
  )

  const whoopIngestWorkouts = computed(
    () =>
      integrationStatus.value?.integrations?.find((i: any) => i.provider === 'whoop')
        ?.ingestWorkouts ?? false
  )

  const withingsConnected = computed(
    () =>
      integrationStatus.value?.integrations?.some((i: any) => i.provider === 'withings') ?? false
  )

  const yazioConnected = computed(
    () => integrationStatus.value?.integrations?.some((i: any) => i.provider === 'yazio') ?? false
  )

  const stravaConnected = computed(
    () => integrationStatus.value?.integrations?.some((i: any) => i.provider === 'strava') ?? false
  )

  const hevyConnected = computed(
    () => integrationStatus.value?.integrations?.some((i: any) => i.provider === 'hevy') ?? false
  )

  const syncingProviders = ref(new Set<string>())

  const syncProfile = async (provider: string) => {
    try {
      if (provider !== 'intervals') return

      await $fetch('/api/integrations/intervals/sync-profile', {
        method: 'POST'
      })

      toast.add({
        title: 'Profile Sync Started',
        description: 'Auto-detection task has been triggered in the background.',
        color: 'success'
      })
    } catch (error: any) {
      toast.add({
        title: 'Sync Failed',
        description: error.data?.message || 'Failed to trigger profile sync',
        color: 'error'
      })
    }
  }

  const syncIntegration = async (provider: string, days?: number) => {
    syncingProviders.value.add(provider)

    try {
      await $fetch('/api/integrations/sync', {
        method: 'POST',
        body: { provider, days }
      })

      const providerName =
        provider === 'intervals'
          ? 'Intervals.icu'
          : provider === 'whoop'
            ? 'WHOOP'
            : provider === 'withings'
              ? 'Withings'
              : provider === 'yazio'
                ? 'Yazio'
                : provider === 'hevy'
                  ? 'Hevy'
                  : 'Strava'

      toast.add({
        title: 'Sync Started',
        description: `Started syncing ${providerName} data`,
        color: 'success'
      })

      setTimeout(() => {
        refreshIntegrations()
      }, 2000)
    } catch (error: any) {
      toast.add({
        title: 'Sync Failed',
        description: error.data?.message || `Failed to sync ${provider}`,
        color: 'error'
      })
    } finally {
      syncingProviders.value.delete(provider)
    }
  }

  const disconnectIntegration = async (provider: string) => {
    try {
      const endpoint =
        provider === 'whoop'
          ? '/api/integrations/whoop/disconnect'
          : provider === 'withings'
            ? '/api/integrations/withings/disconnect'
            : `/api/integrations/${provider}/disconnect`

      await $fetch(endpoint, {
        method: 'DELETE'
      })

      const providerName =
        provider === 'intervals'
          ? 'Intervals.icu'
          : provider === 'whoop'
            ? 'WHOOP'
            : provider === 'withings'
              ? 'Withings'
              : provider === 'yazio'
                ? 'Yazio'
                : 'Strava'

      toast.add({
        title: 'Disconnected',
        description: `Successfully disconnected from ${providerName}`,
        color: 'success'
      })

      refreshIntegrations()
    } catch (error: any) {
      toast.add({
        title: 'Disconnect Failed',
        description: error.data?.message || `Failed to disconnect from ${provider}`,
        color: 'error'
      })
    }
  }

  const updateIntegrationSetting = async (provider: string, setting: string, value: any) => {
    try {
      await $fetch('/api/integrations/update', {
        method: 'POST',
        body: {
          provider,
          [setting]: value
        }
      })

      toast.add({
        title: 'Settings Updated',
        description: `Successfully updated ${provider} settings`,
        color: 'success'
      })

      refreshIntegrations()
    } catch (error: any) {
      toast.add({
        title: 'Update Failed',
        description: error.data?.message || `Failed to update ${provider} settings`,
        color: 'error'
      })
    }
  }

  // Handle OAuth callback messages
  onMounted(() => {
    if (
      route.query.whoop_success ||
      route.query.withings_success ||
      route.query.strava_success ||
      route.query.connected === 'yazio'
    ) {
      if (route.query.whoop_success) {
        toast.add({
          title: 'Connected!',
          description: 'Successfully connected to WHOOP',
          color: 'success'
        })
        refreshIntegrations()
      } else if (route.query.withings_success) {
        toast.add({
          title: 'Connected!',
          description: 'Successfully connected to Withings',
          color: 'success'
        })
        refreshIntegrations()
      } else if (route.query.strava_success) {
        toast.add({
          title: 'Connected!',
          description: 'Successfully connected to Strava',
          color: 'success'
        })
        refreshIntegrations()
      } else if (route.query.connected === 'yazio') {
        toast.add({
          title: 'Connected!',
          description: 'Successfully connected to Yazio',
          color: 'success'
        })
        refreshIntegrations()
      }
      router.replace({ query: {} })
    } else if (route.query.whoop_error || route.query.withings_error || route.query.strava_error) {
      const errorMsg = (route.query.whoop_error ||
        route.query.withings_error ||
        route.query.strava_error) as string
      const provider = route.query.whoop_error
        ? 'WHOOP'
        : route.query.withings_error
          ? 'Withings'
          : 'Strava'
      const description =
        errorMsg === 'no_code'
          ? 'Authorization was cancelled or no code was received'
          : `Failed to connect to ${provider}: ${errorMsg}`

      toast.add({
        title: 'Connection Failed',
        description,
        color: 'error'
      })
      router.replace({ query: {} })
    }
  })
</script>
