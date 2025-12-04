<template>
  <UDashboardPanel id="settings">
    <template #header>
      <UDashboardNavbar title="Settings">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <div class="flex gap-2">
          <UButton
            :variant="activeTab === 'profile' ? 'solid' : 'ghost'"
            :color="activeTab === 'profile' ? 'primary' : 'neutral'"
            @click="navigateTo('/settings?tab=profile')"
          >
            <UIcon name="i-lucide-user" class="w-4 h-4 mr-2" />
            Profile
          </UButton>
          <UButton
            :variant="activeTab === 'connected-apps' ? 'solid' : 'ghost'"
            :color="activeTab === 'connected-apps' ? 'primary' : 'neutral'"
            @click="navigateTo('/settings?tab=connected-apps')"
          >
            <UIcon name="i-lucide-plug" class="w-4 h-4 mr-2" />
            Connected Apps
          </UButton>
          <UButton
            :variant="activeTab === 'danger-zone' ? 'solid' : 'ghost'"
            :color="activeTab === 'danger-zone' ? 'primary' : 'neutral'"
            @click="navigateTo('/settings?tab=danger-zone')"
          >
            <UIcon name="i-lucide-alert-triangle" class="w-4 h-4 mr-2" />
            Danger Zone
          </UButton>
        </div>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="p-6 max-w-4xl mx-auto space-y-6">
        <!-- Profile Tab -->
        <UCard v-if="activeTab === 'profile'">
          <template #header>
            <h2 class="text-xl font-semibold">Profile Settings</h2>
          </template>
          
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium mb-1">Email</label>
              <p>{{ user?.email }}</p>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium mb-1">FTP (Watts)</label>
                <UInput type="number" placeholder="250" />
              </div>
              
              <div>
                <label class="block text-sm font-medium mb-1">Max HR</label>
                <UInput type="number" placeholder="185" />
              </div>
              
              <div>
                <label class="block text-sm font-medium mb-1">Weight (kg)</label>
                <UInput type="number" step="0.1" placeholder="70.0" />
              </div>
              
              <div>
                <label class="block text-sm font-medium mb-1">Date of Birth</label>
                <UInput type="date" />
              </div>
            </div>
            
            <UButton color="primary">
              Save Profile
            </UButton>
          </div>
        </UCard>

        <!-- Connected Apps Tab -->
        <UCard v-if="activeTab === 'connected-apps'">
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
                  @click="goToConnectIntervals"
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
                  @click="disconnectIntegration('intervals')"
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
                  @click="goToConnectWhoop"
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
                  @click="disconnectIntegration('whoop')"
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
                  @click="goToConnectYazio"
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
                  @click="disconnectIntegration('yazio')"
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
                  @click="goToConnectStrava"
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
                  @click="disconnectIntegration('strava')"
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
                @click="syncIntegration('yazio')"
                :disabled="syncingYazio"
              >
                {{ syncingYazio ? 'Syncing Yazio...' : 'Sync Yazio' }}
              </UButton>
              <UButton
                v-if="stravaConnected"
                color="neutral"
                variant="outline"
                size="sm"
                @click="syncIntegration('strava')"
                :disabled="syncingStrava"
              >
                {{ syncingStrava ? 'Syncing Strava...' : 'Sync Strava' }}
              </UButton>
            </div>
          </div>
        </UCard>

        <!-- Danger Zone Tab -->
        <UCard v-if="activeTab === 'danger-zone'">
          <template #header>
            <h2 class="text-xl font-semibold text-error">Danger Zone</h2>
          </template>
          
          <div class="space-y-4">
            <p class="text-sm text-muted">
              Once you delete your account, there is no going back. Please be certain.
            </p>
            <UButton color="error" variant="outline">
              Delete Account
            </UButton>
          </div>
        </UCard>
      </div>
    </template>

  </UDashboardPanel>
</template>

<script setup lang="ts">
const { data } = useAuth()
const user = computed(() => data.value?.user)
const toast = useToast()
const router = useRouter()
const route = useRoute()

definePageMeta({
  middleware: 'auth'
})

// Tab navigation - initialize from URL query parameter or default to 'profile'
const activeTab = ref<string>(route.query.tab as string || 'profile')

// Watch for route query changes to update active tab
watch(() => route.query.tab, (newTab) => {
  if (newTab && typeof newTab === 'string') {
    activeTab.value = newTab
  }
})

// Integration status - use lazy to avoid SSR issues
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

const goToConnectIntervals = () => {
  navigateTo('/connect-intervals')
}

const goToConnectWhoop = () => {
  navigateTo('/connect-whoop')
}

const goToConnectYazio = () => {
  navigateTo('/connect-yazio')
}

const goToConnectStrava = () => {
  navigateTo('/connect-strava')
}

const syncIntegration = async (provider: string) => {
  if (provider === 'yazio') {
    syncingYazio.value = true
  } else if (provider === 'strava') {
    syncingStrava.value = true
  }
  
  try {
    const response = await $fetch('/api/integrations/sync', {
      method: 'POST',
      body: { provider }
    })
    
    const providerName = provider === 'intervals'
      ? 'Intervals.icu'
      : provider === 'whoop'
      ? 'WHOOP'
      : provider === 'yazio'
      ? 'Yazio'
      : 'Strava'
    
    const message = provider === 'intervals'
      ? `Started syncing ${providerName} data. Note: Strava activities are excluded due to API limitations.`
      : `Started syncing ${providerName} data`
    
    toast.add({
      title: 'Sync Started',
      description: message,
      color: 'success'
    })
    
    // Refresh integrations after a delay to show updated sync status
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
    // Use provider-specific endpoint if it exists, otherwise use generic
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
    
    // Refresh integration status
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
  // Switch to Connected Apps tab if coming from OAuth
  if (route.query.whoop_success || route.query.strava_success || route.query.connected === 'yazio') {
    navigateTo('/settings?tab=connected-apps', { replace: true })
  }
  
  if (route.query.whoop_success) {
    toast.add({
      title: 'Connected!',
      description: 'Successfully connected to WHOOP',
      color: 'success'
    })
    refreshIntegrations()
    router.replace({ query: {} })
  } else if (route.query.whoop_error) {
    const errorMsg = route.query.whoop_error as string
    toast.add({
      title: 'Connection Failed',
      description: errorMsg === 'no_code'
        ? 'Authorization was cancelled or no code was received'
        : `Failed to connect to WHOOP: ${errorMsg}`,
      color: 'error'
    })
    router.replace({ query: {} })
  } else if (route.query.strava_success) {
    toast.add({
      title: 'Connected!',
      description: 'Successfully connected to Strava',
      color: 'success'
    })
    refreshIntegrations()
    router.replace({ query: {} })
  } else if (route.query.strava_error) {
    const errorMsg = route.query.strava_error as string
    toast.add({
      title: 'Connection Failed',
      description: errorMsg === 'no_code'
        ? 'Authorization was cancelled or no code was received'
        : `Failed to connect to Strava: ${errorMsg}`,
      color: 'error'
    })
    router.replace({ query: {} })
  } else if (route.query.connected === 'yazio') {
    toast.add({
      title: 'Connected!',
      description: 'Successfully connected to Yazio',
      color: 'success'
    })
    refreshIntegrations()
    router.replace({ query: {} })
  }
})
</script>