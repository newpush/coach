<template>
  <SettingsConnectedApps
    :intervals-connected="intervalsConnected"
    :whoop-connected="whoopConnected"
    :yazio-connected="yazioConnected"
    :strava-connected="stravaConnected"
    :syncing-yazio="syncingYazio"
    :syncing-strava="syncingStrava"
    @disconnect="disconnectIntegration"
    @sync="syncIntegration"
  />
</template>

<script setup lang="ts">
const toast = useToast()
const router = useRouter()
const route = useRoute()

definePageMeta({
  middleware: 'auth'
})

// Integration status
const { data: integrationStatus, refresh: refreshIntegrations } = useFetch('/api/integrations/status', {
  lazy: true,
  server: false
})

const intervalsConnected = computed(() =>
  integrationStatus.value?.integrations?.some((i: any) => i.provider === 'intervals') ?? false
)

const whoopConnected = computed(() =>
  integrationStatus.value?.integrations?.some((i: any) => i.provider === 'whoop') ?? false
)

const yazioConnected = computed(() =>
  integrationStatus.value?.integrations?.some((i: any) => i.provider === 'yazio') ?? false
)

const stravaConnected = computed(() =>
  integrationStatus.value?.integrations?.some((i: any) => i.provider === 'strava') ?? false
)

const syncingYazio = ref(false)
const syncingStrava = ref(false)

const syncIntegration = async (provider: string) => {
  if (provider === 'yazio') {
    syncingYazio.value = true
  } else if (provider === 'strava') {
    syncingStrava.value = true
  }
  
  try {
    await $fetch('/api/integrations/sync', {
      method: 'POST',
      body: { provider }
    })
    
    const providerName = provider === 'yazio' ? 'Yazio' : 'Strava'
    
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
    if (provider === 'yazio') {
      syncingYazio.value = false
    } else if (provider === 'strava') {
      syncingStrava.value = false
    }
  }
}

const disconnectIntegration = async (provider: string) => {
  try {
    const endpoint = provider === 'whoop'
      ? '/api/integrations/whoop/disconnect'
      : `/api/integrations/${provider}/disconnect`
    
    await $fetch(endpoint, {
      method: 'DELETE'
    })
    
    const providerName = provider === 'intervals'
      ? 'Intervals.icu'
      : provider === 'whoop'
      ? 'WHOOP'
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

// Handle OAuth callback messages
onMounted(() => {
  if (route.query.whoop_success || route.query.strava_success || route.query.connected === 'yazio') {
    if (route.query.whoop_success) {
      toast.add({
        title: 'Connected!',
        description: 'Successfully connected to WHOOP',
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
  } else if (route.query.whoop_error || route.query.strava_error) {
    const errorMsg = (route.query.whoop_error || route.query.strava_error) as string
    const provider = route.query.whoop_error ? 'WHOOP' : 'Strava'
    const description = errorMsg === 'no_code'
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