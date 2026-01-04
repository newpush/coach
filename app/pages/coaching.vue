<template>
  <UDashboardPanel id="coaching">
    <template #header>
      <UDashboardNavbar title="Coach Dashboard">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            color="primary"
            variant="solid"
            icon="i-heroicons-user-plus"
            size="sm"
            class="font-bold"
            @click="isConnectModalOpen = true"
          >
            <span class="hidden sm:inline">Add Athlete</span>
            <span class="sm:hidden">Add</span>
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <ClientOnly>
        <div class="p-4 sm:p-6 space-y-4 sm:space-y-6">
          <CoachingBanner class="mb-6" />

        <!-- Page Header -->
        <div>
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white">My Athletes</h2>
          <p class="text-neutral-500 text-sm mt-1">Manage your athletes and their training plans.</p>
        </div>

        <div v-if="loading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <UCard v-for="i in 3" :key="i" class="flex flex-col h-full">
            <template #header>
              <div class="flex items-center gap-3">
                <USkeleton class="h-12 w-12 rounded-full" />
                <div class="space-y-2">
                  <USkeleton class="h-4 w-32" />
                  <USkeleton class="h-3 w-48" />
                </div>
              </div>
            </template>
            <div class="grid grid-cols-2 gap-4 my-2">
              <USkeleton class="h-16 w-full rounded-lg" />
              <USkeleton class="h-16 w-full rounded-lg" />
            </div>
            <template #footer>
              <div class="flex gap-2">
                <USkeleton class="h-10 flex-1 rounded" />
                <USkeleton class="h-10 w-10 rounded" />
              </div>
            </template>
          </UCard>
        </div>

        <div v-else-if="error" class="py-12 text-center">
          <UIcon name="i-heroicons-exclamation-circle" class="w-8 h-8 mx-auto text-red-500" />
          <p class="mt-4 text-red-500">{{ error }}</p>
          <UButton label="Retry" variant="ghost" class="mt-2" @click="fetchAthletes" />
        </div>

        <div v-else-if="athletes.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <UCard v-for="rel in athletes" :key="rel.id" class="flex flex-col h-full hover:ring-2 hover:ring-primary-500 transition-all cursor-pointer" @click="viewAthlete(rel.athlete)">
            <template #header>
              <div class="flex items-start justify-between">
                <div class="flex items-center gap-3">
                  <UAvatar :src="rel.athlete.image" :alt="rel.athlete.name" size="lg" />
                  <div>
                    <h4 class="font-bold text-lg text-gray-900 dark:text-white">{{ rel.athlete.name }}</h4>
                    <p class="text-sm text-neutral-500">{{ rel.athlete.email }}</p>
                  </div>
                </div>
                
                <UBadge v-if="rel.athlete.currentRecommendation" :color="getRecommendationColor(rel.athlete.currentRecommendation.recommendation)" size="xs">
                  {{ getRecommendationLabel(rel.athlete.currentRecommendation.recommendation) }}
                </UBadge>
              </div>
            </template>

            <div class="grid grid-cols-2 gap-4 my-2">
              <div class="bg-neutral-50 dark:bg-neutral-800/50 p-3 rounded-lg text-center">
                <p class="text-xs text-neutral-500 uppercase font-bold mb-1">Fitness Score</p>
                <p class="text-xl font-bold text-primary-600 dark:text-primary-400">{{ rel.athlete.currentFitnessScore || 'N/A' }}</p>
              </div>
              <div class="bg-neutral-50 dark:bg-neutral-800/50 p-3 rounded-lg text-center">
                <p class="text-xs text-neutral-500 uppercase font-bold mb-1">Last Updated</p>
                <p class="text-xs font-medium text-gray-700 dark:text-gray-300">{{ rel.athlete.profileLastUpdated ? formatDate(rel.athlete.profileLastUpdated) : 'Never' }}</p>
              </div>
            </div>

            <template #footer>
              <div class="flex gap-2">
                <UButton
                  class="flex-1"
                  label="View Account"
                  icon="i-heroicons-eye"
                  variant="soft"
                  @click.stop="viewAthlete(rel.athlete)"
                />
                <UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-heroicons-chat-bubble-left-right"
                  @click.stop="messageAthlete(rel.athlete)"
                />
              </div>
            </template>
          </UCard>
        </div>

        <div v-else class="py-12 text-center flex flex-col items-center justify-center border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-lg">
          <div class="bg-neutral-100 dark:bg-neutral-800 p-4 rounded-full mb-4">
            <UIcon name="i-heroicons-users" class="w-8 h-8 text-neutral-400" />
          </div>
          <h3 class="font-bold text-lg text-gray-900 dark:text-white">No Athletes Connected</h3>
          <p class="text-neutral-500 mb-6 max-w-xs">Connect with athletes using their invite codes to start coaching.</p>
          <UButton color="primary" label="Add Your First Athlete" @click="isConnectModalOpen = true" />
        </div>
        </div>
      </ClientOnly>
    </template>
  </UDashboardPanel>

  <!-- Connect Athlete Modal -->
  <UModal
    v-model:open="isConnectModalOpen"
    title="Add New Athlete"
    description="Enter the invite code provided by your athlete to connect their account."
  >
    <template #body>
      <UFormField label="Invite Code" help="Codes are 6 characters long (e.g. AB12XY)">
        <UInput v-model="connectCode" placeholder="ENTER-CODE" class="font-mono uppercase text-center text-xl w-full" />
      </UFormField>
    </template>
    <template #footer>
      <UButton label="Cancel" color="neutral" variant="ghost" @click="isConnectModalOpen = false" />
      <UButton label="Connect Athlete" color="primary" @click="connectAthlete" :loading="connecting" :disabled="!connectCode" />
    </template>
  </UModal>
</template>

<script setup>
definePageMeta({
  middleware: 'auth'
})

useHead({
  title: 'Coach Dashboard',
  meta: [
    { name: 'description', content: 'Manage your athletes, monitor their progress, and send messages.' }
  ]
})

const athletes = ref([])
const loading = ref(true)
const error = ref(null)
const isConnectModalOpen = ref(false)
const connectCode = ref('')
const connecting = ref(false)

const coachingStore = useCoachingStore()
const toast = useToast()
const router = useRouter()

async function fetchAthletes() {
  loading.value = true
  error.value = null
  try {
    athletes.value = await $fetch('/api/coaching/athletes')
  } catch (e) {
    error.value = 'Failed to load athletes. Please try again.'
    console.error(e)
  } finally {
    loading.value = false
  }
}

async function connectAthlete() {
  connecting.value = true
  try {
    await $fetch('/api/coaching/athletes/connect', {
      method: 'POST',
      body: { code: connectCode.value.toUpperCase() }
    })
    toast.add({ title: 'Athlete connected successfully!', color: 'green' })
    await fetchAthletes()
    isConnectModalOpen.value = false
    connectCode.value = ''
  } catch (err) {
    toast.add({ title: 'Failed to connect: ' + (err.data?.message || 'Invalid code'), color: 'red' })
  } finally {
    connecting.value = false
  }
}

function viewAthlete(athlete) {
  coachingStore.startActingAs(athlete.id, athlete.name)
  toast.add({ title: `Now acting as ${athlete.name}`, color: 'primary' })
  router.push('/dashboard')
}

function messageAthlete(athlete) {
  router.push('/chat')
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  })
}

function getRecommendationColor(rec) {
  const colors = {
    'proceed': 'success',
    'modify': 'warning',
    'reduce_intensity': 'warning',
    'rest': 'error'
  }
  return colors[rec] || 'neutral'
}

function getRecommendationLabel(rec) {
  const labels = {
    'proceed': 'Proceed',
    'modify': 'Modify',
    'reduce_intensity': 'Reduce Intensity',
    'rest': 'Rest Day'
  }
  return labels[rec] || rec
}

onMounted(fetchAthletes)
</script>
