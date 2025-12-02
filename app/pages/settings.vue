<template>
  <UDashboardPanel id="settings">
    <template #header>
      <UDashboardNavbar title="Settings">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-6 max-w-4xl mx-auto space-y-6">
        <UCard>
          <template #header>
            <h2 class="text-xl font-semibold">Profile</h2>
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
              <UButton color="neutral" variant="outline">
                Connect
              </UButton>
            </div>
            
            <div class="flex items-center justify-between p-4 border rounded-lg">
              <div class="flex items-center gap-4">
                <div class="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <UIcon name="i-heroicons-heart" class="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <h3 class="font-semibold">Whoop</h3>
                  <p class="text-sm text-muted">Recovery, HRV, and sleep tracking</p>
                </div>
              </div>
              <UButton color="neutral" variant="outline">
                Connect
              </UButton>
            </div>
          </div>
        </UCard>
        
        <UCard>
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

definePageMeta({
  middleware: 'auth'
})
</script>