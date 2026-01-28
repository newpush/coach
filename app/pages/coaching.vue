<template>
  <UDashboardPanel id="coaching">
    <template #header>
      <UDashboardNavbar title="Coaching">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <ClientOnly>
              <DashboardTriggerMonitorButton />
            </ClientOnly>
            <UButton
              v-if="selectedTab === 'athletes'"
              color="primary"
              variant="solid"
              icon="i-heroicons-user-plus"
              size="sm"
              class="font-bold"
              @click="isConnectModalOpen = true"
            >
              Add Athlete
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 sm:p-6 space-y-6">
        <CoachingBanner />

        <UTabs v-model="selectedTab" :items="tabItems" class="w-full">
          <template #content="{ item }">
            <div v-if="item.value === 'athletes'" class="space-y-6 pt-4">
              <div class="flex items-center justify-between">
                <div>
                  <h2 class="text-xl font-bold text-gray-900 dark:text-white">My Athletes</h2>
                  <p class="text-neutral-500 text-sm">Athletes you are currently coaching.</p>
                </div>
              </div>

              <div v-if="loading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <UCard v-for="i in 3" :key="i">
                  <template #header>
                    <div class="flex items-center gap-3">
                      <USkeleton class="h-12 w-12 rounded-full" />
                      <div class="space-y-2">
                        <USkeleton class="h-4 w-32" />
                        <USkeleton class="h-3 w-48" />
                      </div>
                    </div>
                  </template>
                  <USkeleton class="h-20 w-full rounded-lg" />
                </UCard>
              </div>

              <div
                v-else-if="athletes.length === 0"
                class="py-12 text-center flex flex-col items-center justify-center border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-lg"
              >
                <div class="bg-neutral-100 dark:bg-neutral-800 p-4 rounded-full mb-4">
                  <UIcon name="i-heroicons-users" class="w-8 h-8 text-neutral-400" />
                </div>
                <h3 class="font-bold text-lg">No Athletes Yet</h3>
                <p class="text-neutral-500 mb-6 max-w-xs">
                  Ask your athlete for their invite code to start coaching them.
                </p>
                <UButton
                  color="primary"
                  label="Connect Athlete"
                  icon="i-heroicons-user-plus"
                  @click="isConnectModalOpen = true"
                />
              </div>

              <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <CoachingAthleteCard
                  v-for="rel in athletes"
                  :key="rel.id"
                  :athlete="rel.athlete"
                  @view="viewAthlete"
                  @message="messageAthlete"
                />
              </div>
            </div>

            <div v-else-if="item.value === 'coaches'" class="space-y-8 pt-4">
              <!-- Invite Section -->
              <UCard
                :ui="{
                  body: 'p-6',
                  root: 'overflow-hidden border-2 border-primary-500/20 bg-primary-50/30 dark:bg-primary-950/10'
                }"
              >
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div class="space-y-1">
                    <h3 class="text-lg font-bold text-gray-900 dark:text-white">Invite a Coach</h3>
                    <p class="text-sm text-neutral-600 dark:text-neutral-400 max-w-md">
                      Give this code to your coach so they can connect to your account and manage
                      your training.
                    </p>
                  </div>

                  <div class="flex flex-col items-center gap-3">
                    <div v-if="invite.code" class="flex items-center gap-2">
                      <div
                        class="px-6 py-3 bg-white dark:bg-gray-900 border-2 border-primary-500 rounded-lg font-mono text-2xl font-bold tracking-widest shadow-inner text-primary-600 dark:text-primary-400"
                      >
                        {{ invite.code }}
                      </div>
                      <UButton
                        color="neutral"
                        variant="ghost"
                        icon="i-heroicons-clipboard"
                        @click="copyInvite"
                      />
                    </div>
                    <div
                      v-else-if="loadingInvite"
                      class="h-14 w-48 bg-gray-200 animate-pulse rounded-lg"
                    />

                    <UButton
                      v-if="!invite.code"
                      color="primary"
                      label="Generate Invite Code"
                      icon="i-heroicons-plus"
                      :loading="generatingInvite"
                      @click="createInvite"
                    />
                    <p v-else class="text-[10px] text-neutral-500 uppercase font-bold">
                      Expires {{ formatFullDate(invite.expiresAt) }}
                    </p>
                  </div>
                </div>
              </UCard>

              <!-- My Coaches List -->
              <div>
                <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">My Coaches</h2>

                <div v-if="loading" class="space-y-4">
                  <UCard v-for="i in 2" :key="i">
                    <div class="flex items-center gap-3">
                      <USkeleton class="h-10 w-10 rounded-full" />
                      <USkeleton class="h-4 w-48" />
                    </div>
                  </UCard>
                </div>

                <div
                  v-else-if="coaches.length === 0"
                  class="text-center py-8 bg-neutral-50 dark:bg-neutral-800/30 rounded-lg border border-gray-100 dark:border-gray-800"
                >
                  <p class="text-neutral-500 text-sm">
                    You haven't connected with any coaches yet.
                  </p>
                </div>

                <div v-else class="space-y-3">
                  <UCard v-for="rel in coaches" :key="rel.id" :ui="{ body: 'p-3 sm:p-4' }">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-3">
                        <UAvatar :src="rel.coach.image" :alt="rel.coach.name" />
                        <div>
                          <p class="font-bold text-sm">{{ rel.coach.name }}</p>
                          <p class="text-xs text-neutral-500">{{ rel.coach.email }}</p>
                        </div>
                      </div>
                      <UButton
                        color="error"
                        variant="ghost"
                        size="xs"
                        icon="i-heroicons-trash"
                        label="Remove"
                        @click="confirmRemoveCoach(rel.coach)"
                      />
                    </div>
                  </UCard>
                </div>
              </div>
            </div>
          </template>
        </UTabs>
      </div>
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
        <UInput
          v-model="connectCode"
          placeholder="ENTER-CODE"
          class="font-mono uppercase text-center text-xl w-full"
          maxlength="6"
        />
      </UFormField>
    </template>
    <template #footer>
      <UButton label="Cancel" color="neutral" variant="ghost" @click="isConnectModalOpen = false" />
      <UButton
        label="Connect Athlete"
        color="primary"
        :loading="connecting"
        :disabled="!connectCode || connectCode.length < 6"
        @click="connectAthlete"
      />
    </template>
  </UModal>

  <!-- Remove Coach Confirmation -->
  <UModal
    v-model:open="isRemoveModalOpen"
    title="Remove Coach"
    :description="`Are you sure you want to remove ${coachToRemove?.name} as your coach? They will no longer have access to your data.`"
  >
    <template #footer>
      <UButton label="Cancel" color="neutral" variant="ghost" @click="isRemoveModalOpen = false" />
      <UButton label="Remove Coach" color="error" :loading="removingCoach" @click="removeCoach" />
    </template>
  </UModal>
</template>

<script setup lang="ts">
  definePageMeta({
    middleware: 'auth'
  })

  useHead({
    title: 'Coaching Dashboard',
    meta: [
      {
        name: 'description',
        content: 'Manage your coaching relationships, both as a coach and as an athlete.'
      }
    ]
  })

  const selectedTab = ref('coaches')
  const tabItems = [
    { value: 'athletes', label: 'My Athletes', icon: 'i-heroicons-users' },
    { value: 'coaches', label: 'My Coaches', icon: 'i-heroicons-academic-cap' }
  ]

  const athletes = ref<any[]>([])
  const coaches = ref<any[]>([])
  const invite = ref<any>({ status: 'NONE' })

  const loading = ref(true)
  const loadingInvite = ref(false)
  const generatingInvite = ref(false)
  const connecting = ref(false)
  const removingCoach = ref(false)

  const isConnectModalOpen = ref(false)
  const isRemoveModalOpen = ref(false)
  const connectCode = ref('')
  const coachToRemove = ref<any>(null)

  const coachingStore = useCoachingStore()
  const toast = useToast()
  const router = useRouter()

  async function fetchData() {
    loading.value = true
    try {
      const [athletesData, coachesData, inviteData] = await Promise.all([
        $fetch('/api/coaching/athletes'),
        $fetch('/api/coaching/coaches'),
        $fetch('/api/coaching/invite')
      ])
      athletes.value = athletesData as any[]
      coaches.value = coachesData as any[]
      invite.value = inviteData

      // Default to athletes tab if we have athletes, otherwise keep it on coaches
      if (athletes.value.length > 0) {
        selectedTab.value = 'athletes'
      } else {
        selectedTab.value = 'coaches'
      }
    } catch (e) {
      console.error(e)
      toast.add({ title: 'Failed to load coaching data', color: 'error' })
    } finally {
      loading.value = false
    }
  }

  async function createInvite() {
    generatingInvite.value = true
    try {
      invite.value = await $fetch('/api/coaching/invite', { method: 'POST' })
      toast.add({ title: 'Invite code generated!', color: 'success' })
    } catch (e) {
      toast.add({ title: 'Failed to generate code', color: 'error' })
    } finally {
      generatingInvite.value = false
    }
  }

  async function connectAthlete() {
    connecting.value = true
    try {
      await $fetch('/api/coaching/athletes/connect', {
        method: 'POST',
        body: { code: connectCode.value.toUpperCase() }
      })
      toast.add({ title: 'Athlete connected successfully!', color: 'success' })
      await fetchData()
      isConnectModalOpen.value = false
      connectCode.value = ''
    } catch (err: any) {
      toast.add({
        title: 'Failed to connect: ' + (err.data?.message || 'Invalid code'),
        color: 'error'
      })
    } finally {
      connecting.value = false
    }
  }

  function confirmRemoveCoach(coach: any) {
    coachToRemove.value = coach
    isRemoveModalOpen.value = true
  }

  async function removeCoach() {
    if (!coachToRemove.value) return
    removingCoach.value = true
    try {
      await $fetch(`/api/coaching/coaches/${coachToRemove.value.id}`, { method: 'DELETE' })
      toast.add({ title: 'Coach removed', color: 'success' })
      await fetchData()
      isRemoveModalOpen.value = false
    } catch (e) {
      toast.add({ title: 'Failed to remove coach', color: 'error' })
    } finally {
      removingCoach.value = false
    }
  }

  function copyInvite() {
    if (!invite.value.code) return
    navigator.clipboard.writeText(invite.value.code)
    toast.add({ title: 'Code copied to clipboard', color: 'primary' })
  }

  function onTabChange() {
    // Optional: add analytics or specific refresh logic
  }

  function viewAthlete(athlete: any) {
    coachingStore.startActingAs(athlete.id, athlete.name)
    toast.add({ title: `Now acting as ${athlete.name}`, color: 'primary' })
    router.push('/dashboard')
  }

  function messageAthlete(athlete: any) {
    router.push('/chat')
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    })
  }

  function formatFullDate(date: string) {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  function getRecommendationColor(rec: string) {
    const colors: Record<string, any> = {
      proceed: 'success',
      modify: 'warning',
      reduce_intensity: 'warning',
      rest: 'error'
    }
    return colors[rec] || 'neutral'
  }

  function getRecommendationLabel(rec: string) {
    const labels: Record<string, string> = {
      proceed: 'Proceed',
      modify: 'Modify',
      reduce_intensity: 'Reduce Intensity',
      rest: 'Rest Day'
    }
    return labels[rec] || rec
  }

  onMounted(fetchData)
</script>
