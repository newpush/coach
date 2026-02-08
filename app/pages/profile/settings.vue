<template>
  <UDashboardPanel id="profile-settings">
    <template #header>
      <UDashboardNavbar title="Profile Settings">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex-1 flex flex-col overflow-hidden">
        <!-- Tabs -->
        <div class="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 z-10">
          <div class="px-6 flex gap-6">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              class="relative py-4 text-sm font-medium transition-colors"
              :class="
                activeTab === tab.id
                  ? 'text-primary'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              "
              @click="activeTab = tab.id"
            >
              <div class="flex items-center gap-2">
                <UIcon :name="tab.icon" class="w-4 h-4" />
                {{ tab.label }}
              </div>
              <div
                v-if="activeTab === tab.id"
                class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full"
              />
            </button>
          </div>
        </div>

        <!-- Scrollable Content -->
        <div class="flex-1 overflow-y-auto p-6">
          <div class="max-w-4xl mx-auto space-y-8">
            <ProfileBasicSettings
              v-if="activeTab === 'basic'"
              :model-value="profile"
              :email="user?.email || ''"
              @update:model-value="handleProfileUpdate"
              @autodetect="handleAutodetect"
            />

            <ProfileSportSettings
              v-if="activeTab === 'sports'"
              :settings="sportSettings"
              :profile="profile"
              @update:settings="updateSportSettings"
              @autodetect="handleAutodetect"
            />

            <ProfileNutritionSettings
              v-if="activeTab === 'nutrition'"
              :settings="nutritionSettings"
              @update:settings="(val) => (nutritionSettings = val)"
            />
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
  import ProfileBasicSettings from '~/components/profile/BasicSettings.vue'
  import ProfileSportSettings from '~/components/profile/SportSettings.vue'
  import ProfileNutritionSettings from '~/components/profile/NutritionSettings.vue'

  const { data } = useAuth()
  const user = computed(() => data.value?.user)
  const toast = useToast()

  definePageMeta({
    middleware: 'auth'
  })

  const tabs = [
    { id: 'basic', label: 'Basic Settings', icon: 'i-heroicons-user-circle' },
    { id: 'sports', label: 'Sport Settings', icon: 'i-heroicons-trophy' },
    { id: 'nutrition', label: 'Nutrition', icon: 'i-heroicons-fire' }
  ]

  const activeTab = ref('basic')

  // Profile Data
  const profile = ref<any>({
    name: user.value?.name || 'Athlete',
    nickname: '',
    language: 'English',
    weight: 0,
    weightUnits: 'Kilograms',
    height: 0,
    heightUnits: 'cm',
    distanceUnits: 'Kilometers',
    temperatureUnits: 'Celsius',
    visibility: 'Private',
    sex: 'Male',
    dob: '',
    city: '',
    state: '',
    country: '',
    timezone: '',
    currencyPreference: null
  })

  const sportSettings = ref<any[]>([])
  const nutritionSettings = ref<any>(null)

  // Fetch profile data
  const { data: profileData, refresh: refreshProfile } = await useFetch('/api/profile', {
    key: 'user-profile'
  })

  // Fetch nutrition settings separately for now (or could merge into /api/profile later)
  const { data: nutritionData } = await useFetch('/api/profile/nutrition', {
    key: 'user-nutrition-settings'
  })

  async function handleProfileUpdate(newProfile: any) {
    // Use Object.assign to update the existing reactive object
    Object.assign(profile.value, newProfile)

    try {
      await $fetch('/api/profile', {
        method: 'PATCH',
        body: newProfile
      })

      toast.add({
        title: 'Profile Updated',
        description: 'Your settings have been saved.',
        color: 'success'
      })
    } catch (error: any) {
      console.error('Profile update failed:', {
        status: error.statusCode,
        statusText: error.statusMessage,
        data: error.data,
        payload: newProfile
      })

      const errorMessage =
        error.data?.statusMessage || error.message || 'Failed to save profile settings.'
      const validationErrors = error.data?.data
        ?.map((e: any) => `${e.path.join('.')}: ${e.message}`)
        .join(', ')

      toast.add({
        title: 'Update Failed',
        description: validationErrors ? `Invalid input: ${validationErrors}` : errorMessage,
        color: 'error'
      })
    }
  }

  async function handleAutodetect(updatedProfile: any) {
    if (updatedProfile) {
      // 1. Update local reactive state
      if (updatedProfile.sportSettings) {
        sportSettings.value = updatedProfile.sportSettings
      }

      // 2. Prepare payload for backend update
      const updatePayload = { ...updatedProfile }

      // Merge into local profile ref
      Object.assign(profile.value, updatePayload)

      try {
        await $fetch('/api/profile', {
          method: 'PATCH',
          body: updatePayload
        })

        toast.add({
          title: 'Profile Updated',
          description: 'Your settings and sport-specific zones have been synced.',
          color: 'success'
        })
      } catch (error: any) {
        console.error('Autodetect sync failed:', {
          status: error.statusCode,
          statusText: error.statusMessage,
          data: error.data,
          payload: updatePayload
        })
        toast.add({
          title: 'Update Failed',
          description: 'Failed to save synced settings.',
          color: 'error'
        })
      }

      // Refresh full profile to ensure all derived state is correct
      await refreshProfile()
    }
  }

  watchEffect(() => {
    const pData = profileData.value as any
    if (pData?.profile) {
      profile.value = { ...profile.value, ...pData.profile }

      if (pData.profile.sportSettings) {
        sportSettings.value = pData.profile.sportSettings as any[]
      }
    }

    // Sync nutrition settings
    if (nutritionData.value && (nutritionData.value as any).settings) {
      nutritionSettings.value = (nutritionData.value as any).settings
    }
  })

  // Save updated sport settings manually
  async function updateSportSettings(updatedSettings: any[]) {
    sportSettings.value = updatedSettings
    try {
      await $fetch('/api/profile', {
        method: 'PATCH',
        body: { sportSettings: updatedSettings }
      })
      toast.add({
        title: 'Settings Saved',
        description: 'Sport settings updated successfully.',
        color: 'success'
      })
    } catch (error: any) {
      console.error('Sport settings update failed:', {
        status: error.statusCode,
        statusText: error.statusMessage,
        data: error.data,
        payload: { sportSettings: updatedSettings }
      })
      toast.add({
        title: 'Update Failed',
        description: 'Failed to save sport settings.',
        color: 'error'
      })
    }
  }

  useHead({
    title: 'Profile Settings',
    meta: [
      {
        name: 'description',
        content: 'Manage your personal details, physical metrics, and custom training zones.'
      }
    ]
  })
</script>
