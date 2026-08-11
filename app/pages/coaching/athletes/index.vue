<template>
  <UDashboardPanel id="coaching-athletes">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #title>
          <CoachingNavbarLinks />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <ClientOnly>
              <DashboardTriggerMonitorButton />
            </ClientOnly>
            <UButton
              color="primary"
              variant="solid"
              icon="i-heroicons-user-plus"
              size="sm"
              class="font-bold"
              @click="
                () => {
                  void openInviteModal('email')
                }
              "
            >
              {{ tr('athletes_invite', 'Invite Athlete') }}
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-0 sm:p-6 space-y-6">
        <div class="px-4 sm:px-0">
          <h1 class="text-4xl font-black text-gray-900 dark:text-white uppercase tracking-tight">
            {{ tr('athletes_title', 'My Athletes') }}
          </h1>
          <p
            class="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-[0.2em] mt-1 italic"
          >
            {{ tr('athletes_subtitle', 'Managing Your Performance Roster') }}
          </p>
        </div>

        <CoachingGroupManager
          v-if="athletes.length > 0 || groups.length > 0"
          v-model:active-group-id="activeGroupId"
          :groups="groups"
          :athletes="athletes"
          :teams="teams"
          @refresh="fetchGroups"
        />

        <div v-if="requestsError" class="px-4 sm:px-0">
          <UAlert
            color="error"
            variant="soft"
            icon="i-heroicons-exclamation-triangle"
            :title="tr('athletes_requests_error_title', 'Could not load coaching requests')"
            :description="
              tr(
                'athletes_requests_error_desc',
                'We could not reach the server, so pending requests from your start page are not shown. This is a loading error — you may still have requests waiting.'
              )
            "
          >
            <template #actions>
              <UButton
                color="error"
                variant="outline"
                size="xs"
                icon="i-heroicons-arrow-path"
                class="font-bold"
                :loading="retryingRequests"
                :label="tr('athletes_requests_error_retry', 'Retry')"
                @click="
                  () => {
                    void retryPendingRequests()
                  }
                "
              />
            </template>
          </UAlert>
        </div>

        <UCard v-if="pendingRequests.length > 0" :ui="{ ...mobileListCardUi, body: 'p-4 sm:p-6' }">
          <div class="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 class="text-lg font-bold text-gray-900 dark:text-white">
                {{ tr('athletes_pending_requests_title', 'Pending Coaching Requests') }}
              </h2>
              <p class="text-sm text-neutral-500">
                {{
                  tr(
                    'athletes_pending_requests_desc',
                    'Athletes from your public start page are waiting for your review.'
                  )
                }}
              </p>
            </div>
            <UBadge color="warning" variant="soft" size="sm" class="uppercase font-bold">
              {{
                tr('athletes_pending_count', '{count} pending', { count: pendingRequests.length })
              }}
            </UBadge>
          </div>

          <div class="space-y-3">
            <div
              v-for="request in pendingRequests"
              :key="request.id"
              class="rounded-xl border border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-900/50 p-4"
            >
              <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div class="space-y-3 min-w-0 flex-1">
                  <div class="flex items-center gap-3">
                    <UAvatar
                      :src="request.athlete?.image || undefined"
                      :alt="request.athlete?.name || request.athlete?.email || 'Athlete'"
                    />
                    <div class="min-w-0">
                      <div class="text-sm font-bold text-gray-900 dark:text-white">
                        {{
                          request.athlete?.name ||
                          request.athlete?.email ||
                          request.athleteSnapshot?.email ||
                          'Athlete request'
                        }}
                      </div>
                      <div class="text-xs text-neutral-500">
                        Submitted {{ formatRelative(request.createdAt) }}
                      </div>
                    </div>
                  </div>

                  <div
                    v-if="request.athleteSnapshot?.activeCoaches?.length"
                    class="rounded-xl border border-amber-200/60 dark:border-amber-500/20 bg-amber-50/80 dark:bg-amber-950/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-200"
                  >
                    {{ tr('athletes_already_coaching', 'Already coaching with:') }}
                    {{
                      request.athleteSnapshot.activeCoaches
                        .map((coach: any) => coach.name || coach.email)
                        .join(', ')
                    }}
                  </div>

                  <div
                    v-if="request.answers?.length"
                    class="space-y-2 rounded-xl border border-gray-100 dark:border-gray-800 bg-neutral-50/80 dark:bg-neutral-950/30 p-3"
                  >
                    <div
                      v-for="answer in request.answers"
                      :key="answer.fieldId"
                      class="grid gap-1 md:grid-cols-[220px_minmax(0,1fr)]"
                    >
                      <div class="text-xs font-black uppercase tracking-[0.14em] text-neutral-400">
                        {{ answer.label }}
                      </div>
                      <div class="text-sm text-gray-700 dark:text-gray-200 break-words">
                        {{ formatRequestAnswer(answer.answer) }}
                      </div>
                    </div>
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <UButton
                    color="primary"
                    size="sm"
                    :loading="reviewingRequestId === request.id && reviewingAction === 'approve'"
                    @click="
                      () => {
                        void approveRequest(request.id)
                      }
                    "
                  >
                    {{ tr('athletes_approve', 'Approve') }}
                  </UButton>
                  <UButton
                    color="error"
                    variant="outline"
                    size="sm"
                    :loading="reviewingRequestId === request.id && reviewingAction === 'decline'"
                    @click="
                      () => {
                        void declineRequest(request.id)
                      }
                    "
                  >
                    {{ tr('athletes_decline', 'Decline') }}
                  </UButton>
                </div>
              </div>
            </div>
          </div>
        </UCard>

        <div v-if="loading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 md:gap-6">
          <UCard v-for="i in 3" :key="i" :ui="mobileListCardUi">
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
          <h3 class="font-bold text-lg">{{ tr('athletes_empty_title', 'No Athletes Yet') }}</h3>
          <p class="text-neutral-500 mb-6 max-w-xs">
            {{
              tr(
                'athletes_empty_desc',
                "Send a direct email invite, create one share link for your community, or use an athlete's personal invite code."
              )
            }}
          </p>
          <div class="flex flex-col sm:flex-row items-center gap-3">
            <UButton
              color="primary"
              :label="tr('athletes_create_share_link', 'Create Share Link')"
              icon="i-heroicons-link"
              @click="
                () => {
                  void openInviteModal('share')
                }
              "
            />
            <UButton
              color="neutral"
              variant="outline"
              :label="tr('athletes_invite_email', 'Invite by Email')"
              icon="i-heroicons-envelope"
              @click="
                () => {
                  void openInviteModal('email')
                }
              "
            />
            <UButton
              color="neutral"
              variant="outline"
              :label="tr('athletes_connect_code', 'Connect by Code')"
              icon="i-heroicons-ticket"
              @click="
                () => {
                  void openInviteModal('code')
                }
              "
            />
          </div>
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 md:gap-6">
          <CoachingAthleteCard
            v-for="rel in filteredAthletes"
            :key="rel.id"
            :athlete="rel.athlete"
            @view="viewAthlete"
            @message="messageAthlete"
            @act-as="actAsAthlete"
          />
        </div>

        <div
          v-if="activeGroupId !== 'all' && filteredAthletes.length === 0"
          class="py-12 text-center flex flex-col items-center justify-center bg-neutral-50 dark:bg-neutral-800/20 rounded-none sm:rounded-lg border-y sm:border border-gray-100 dark:border-gray-800"
        >
          <p class="text-neutral-500 text-sm italic font-medium">
            {{ tr('athletes_no_group', 'No athletes assigned to this group yet.') }}
          </p>
        </div>

        <UCard
          class="overflow-hidden border-2 border-primary-500/20 bg-primary-50/30 dark:bg-primary-950/10"
          :ui="{
            ...mobileListCardUi,
            body: 'p-4 sm:p-6'
          }"
        >
          <div class="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
            <div class="space-y-2 max-w-2xl">
              <p
                class="text-[10px] font-black uppercase tracking-[0.2em] text-primary-700 dark:text-primary-300"
              >
                {{ tr('athletes_onboarding_label', 'Coach Onboarding') }}
              </p>
              <h2
                class="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight"
              >
                {{ tr('athletes_onboarding_title', 'Invite athletes by email or connect by code') }}
              </h2>
              <p class="text-sm text-neutral-600 dark:text-neutral-400">
                {{
                  tr(
                    'athletes_onboarding_desc',
                    'Send a direct join link to a new athlete, or keep using their existing personal invite code if they already shared one with you. You can also create a public share link for Facebook groups or community posts.'
                  )
                }}
              </p>
            </div>

            <div class="flex flex-col sm:flex-row gap-3">
              <UButton
                color="primary"
                variant="solid"
                icon="i-heroicons-link"
                :label="tr('athletes_create_share_link', 'Create Share Link')"
                @click="
                  () => {
                    void openInviteModal('share')
                  }
                "
              />
              <UButton
                color="neutral"
                variant="outline"
                icon="i-heroicons-envelope"
                :label="tr('athletes_invite_email', 'Invite by Email')"
                @click="
                  () => {
                    void openInviteModal('email')
                  }
                "
              />
              <UButton
                color="neutral"
                variant="outline"
                icon="i-heroicons-ticket"
                :label="tr('athletes_connect_code', 'Connect by Code')"
                @click="
                  () => {
                    void openInviteModal('code')
                  }
                "
              />
            </div>
          </div>
        </UCard>

        <div v-if="invitesError" class="px-4 sm:px-0">
          <UAlert
            color="error"
            variant="soft"
            icon="i-heroicons-exclamation-triangle"
            :title="tr('athletes_invites_error_title', 'Could not load pending invitations')"
            :description="
              tr(
                'athletes_invites_error_desc',
                'We could not reach the server, so your pending invites and share links are not shown. This is a loading error — any existing invites are still active.'
              )
            "
          >
            <template #actions>
              <UButton
                color="error"
                variant="outline"
                size="xs"
                icon="i-heroicons-arrow-path"
                class="font-bold"
                :loading="retryingInvites"
                :label="tr('athletes_invites_error_retry', 'Retry')"
                @click="
                  () => {
                    void retryPendingInvites()
                  }
                "
              />
            </template>
          </UAlert>
        </div>

        <UCard v-if="pendingInvites.length > 0" :ui="{ ...mobileListCardUi, body: 'p-4 sm:p-6' }">
          <div class="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 class="text-lg font-bold text-gray-900 dark:text-white">
                {{ tr('athletes_pending_invites_title', 'Pending Invitations') }}
              </h2>
              <p class="text-sm text-neutral-500">
                {{
                  tr(
                    'athletes_pending_invites_desc',
                    'Manage private email invites and public share links from one place.'
                  )
                }}
              </p>
            </div>
            <UButton
              color="neutral"
              variant="outline"
              icon="i-heroicons-plus"
              label="New Invite"
              size="xs"
              class="font-bold"
              @click="
                () => {
                  void openInviteModal('share')
                }
              "
            />
          </div>

          <div class="space-y-3">
            <div
              v-for="invite in pendingInvites"
              :key="invite.id"
              class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-900/50 p-4"
            >
              <div class="space-y-2">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-sm font-bold text-gray-900 dark:text-white">
                    {{ invite.email || 'Public Share Link' }}
                  </span>
                  <UBadge
                    :color="invite.email ? 'primary' : 'neutral'"
                    variant="subtle"
                    size="xs"
                    class="uppercase font-bold"
                  >
                    {{ invite.email ? 'Email Invite' : 'Share Link' }}
                  </UBadge>
                </div>
                <p class="text-[10px] font-bold uppercase tracking-[0.15em] text-neutral-400">
                  Expires {{ formatRelative(invite.expiresAt) }}
                </p>
                <CoachingInviteLink
                  :code="invite.code"
                  :coach-slug="!invite.email ? invite.coachProfileSlug : undefined"
                />
              </div>

              <div class="flex items-center gap-2">
                <UButton
                  color="neutral"
                  variant="outline"
                  size="xs"
                  :icon="invite.email ? 'i-heroicons-envelope' : 'i-heroicons-link'"
                  :label="invite.email ? 'Invite Another' : 'New Share Link'"
                  @click="
                    () => {
                      invite.email ? prefillInviteEmail(invite.email) : openInviteModal('share')
                    }
                  "
                />
                <UButton
                  color="error"
                  variant="ghost"
                  size="xs"
                  icon="i-heroicons-trash"
                  :loading="revokingInviteId === invite.id"
                  @click="
                    () => {
                      void revokeInvite(invite.id)
                    }
                  "
                />
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Connect Athlete Modal -->
  <UModal
    v-model:open="isConnectModalOpen"
    title="Add Athlete"
    description="Send a private email invite, create a public share link, or connect instantly with an athlete-generated invite code."
  >
    <template #body>
      <div class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <UButton
            label="Share Link"
            icon="i-heroicons-link"
            :color="inviteTab === 'share' ? 'primary' : 'neutral'"
            :variant="inviteTab === 'share' ? 'solid' : 'outline'"
            @click="
              () => {
                inviteTab = 'share'
              }
            "
          />
          <UButton
            label="Invite by Email"
            icon="i-heroicons-envelope"
            :color="inviteTab === 'email' ? 'primary' : 'neutral'"
            :variant="inviteTab === 'email' ? 'solid' : 'outline'"
            @click="
              () => {
                inviteTab = 'email'
              }
            "
          />
          <UButton
            label="Connect by Code"
            icon="i-heroicons-ticket"
            :color="inviteTab === 'code' ? 'primary' : 'neutral'"
            :variant="inviteTab === 'code' ? 'solid' : 'outline'"
            @click="
              () => {
                inviteTab = 'code'
              }
            "
          />
        </div>

        <div v-if="inviteTab === 'share'" class="space-y-4 pt-2">
          <p class="text-sm text-neutral-500">
            Create one open join link you can post in a Facebook group, newsletter, or community
            chat. Anyone with an account can join under you from this link.
          </p>
          <div
            class="rounded-xl border border-dashed border-gray-200 dark:border-gray-800 bg-neutral-50 dark:bg-neutral-900/50 p-4"
          >
            <p class="text-[10px] font-bold uppercase tracking-[0.15em] text-neutral-400">
              Best For
            </p>
            <p class="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Facebook groups, WhatsApp communities, website CTAs, and onboarding posts for athletes
              who already use Coach Watts.
            </p>
          </div>
        </div>

        <div v-else-if="inviteTab === 'email'" class="space-y-4 pt-2">
          <p class="text-sm text-neutral-500">
            We’ll send a secure join link to your athlete so they can connect their account to you
            directly.
          </p>
          <UFormField
            label="Athlete Email"
            help="The athlete must accept the invite with the same email address."
          >
            <UInput
              v-model="inviteEmail"
              type="email"
              placeholder="athlete@example.com"
              class="w-full"
            />
          </UFormField>
        </div>

        <div v-else class="space-y-4 pt-2">
          <p class="text-sm text-neutral-500">
            Use this when an athlete already shared their personal coach code from their My Team
            page.
          </p>
          <UFormField
            label="Athlete Invite Code"
            help="Codes are 10 characters (e.g. AB12CD34EF) and are generated by the athlete. You can paste a full /join/… link."
          >
            <UInput
              v-model="connectCode"
              placeholder="ENTER-CODE"
              class="font-mono uppercase text-center text-xl w-full"
              maxlength="64"
              @update:model-value="normalizeConnectCode"
            />
          </UFormField>
        </div>
      </div>
    </template>
    <template #footer>
      <UButton
        label="Cancel"
        color="neutral"
        variant="ghost"
        @click="
          () => {
            isConnectModalOpen = false
          }
        "
      />
      <UButton
        v-if="inviteTab === 'share'"
        label="Create Share Link"
        color="primary"
        icon="i-heroicons-link"
        :loading="creatingInvite"
        @click="
          () => {
            void createShareInvite()
          }
        "
      />
      <UButton
        v-else-if="inviteTab === 'email'"
        label="Send Invitation"
        color="primary"
        icon="i-heroicons-envelope"
        :loading="creatingInvite"
        :disabled="!inviteEmail"
        @click="
          () => {
            void createInvite()
          }
        "
      />
      <UButton
        v-else
        label="Connect Athlete"
        color="primary"
        icon="i-heroicons-ticket"
        :loading="connecting"
        :disabled="!normalizedConnectCode || normalizedConnectCode.length < 8"
        @click="
          () => {
            void connectAthlete()
          }
        "
      />
    </template>
  </UModal>
</template>

<script setup lang="ts">
  import { mobileListCardUi } from '~/utils/mobile-surface-ui'

  const { formatRelativeTime } = useFormat()
  const { tr } = useCoachingI18n()

  definePageMeta({
    middleware: 'auth'
  })

  useHead({
    title: () => tr('athletes_meta_title', 'My Athletes | Coaching'),
    meta: [
      {
        name: 'description',
        content: () =>
          tr(
            'athletes_meta_description',
            'Manage your athlete roster, invitations, and coaching requests.'
          )
      }
    ]
  })

  const athletes = ref<any[]>([])
  const groups = ref<any[]>([])
  const teams = ref<any[]>([])
  const activeGroupId = ref('all')
  const loading = ref(true)
  const connecting = ref(false)
  const creatingInvite = ref(false)
  const isConnectModalOpen = ref(false)
  const connectCode = ref('')
  const inviteEmail = ref('')
  const pendingInvites = ref<any[]>([])
  const pendingRequests = ref<any[]>([])
  const invitesError = ref(false)
  const requestsError = ref(false)
  const retryingInvites = ref(false)
  const retryingRequests = ref(false)
  const revokingInviteId = ref<string | null>(null)
  const reviewingRequestId = ref<string | null>(null)
  const reviewingAction = ref<'approve' | 'decline' | null>(null)
  const inviteTab = ref('share')
  const router = useRouter()
  const toast = useToast()
  const { messageAthlete } = useCoachingMessageAthlete()
  const coachingStore = useCoachingStore()

  function actAsAthlete(athlete: any) {
    if (!athlete?.id) return
    const name = athlete.name || athlete.email || 'Athlete'
    coachingStore.startActingAs(athlete.id, name)
  }

  function extractInviteCode(raw: string) {
    const trimmed = (raw || '').trim()
    const joinMatch = trimmed.match(/\/join\/([A-Za-z0-9]+)(?:[/?#]|$)/i)
    const code = (joinMatch?.[1] || trimmed).toUpperCase().replace(/[^A-Z0-9]/g, '')
    return code.slice(0, 10)
  }

  const normalizedConnectCode = computed(() => extractInviteCode(connectCode.value))

  function normalizeConnectCode(value: string | number | null | undefined) {
    connectCode.value = extractInviteCode(String(value ?? ''))
  }

  const filteredAthletes = computed(() => {
    if (activeGroupId.value === 'all') return athletes.value
    const group = groups.value.find((g) => g.id === activeGroupId.value)
    if (!group) return athletes.value
    const memberIds = group.members?.map((m: any) => m.athleteId) || []
    return athletes.value.filter((rel) => memberIds.includes(rel.athlete.id))
  })

  // Loads pending invites on its own so a transient failure does not take the whole page
  // down — but it never masquerades as an empty list: `invitesError` drives an explicit
  // error state with a retry, while a successful empty response clears it.
  async function loadPendingInvites() {
    try {
      const data = await $fetch<any, string & {}>('/api/coaching/athletes/invites')
      pendingInvites.value = (data as any[]) || []
      invitesError.value = false
      return true
    } catch (e) {
      console.error(e)
      pendingInvites.value = []
      invitesError.value = true
      return false
    }
  }

  async function loadPendingRequests() {
    try {
      const data = await $fetch<any, string & {}>('/api/coaching/athletes/requests')
      pendingRequests.value = (data as any[]) || []
      requestsError.value = false
      return true
    } catch (e) {
      console.error(e)
      pendingRequests.value = []
      requestsError.value = true
      return false
    }
  }

  async function retryPendingInvites() {
    retryingInvites.value = true
    try {
      const ok = await loadPendingInvites()
      if (!ok) {
        toast.add({
          title: tr('athletes_invites_error_toast', 'Still unable to load pending invitations'),
          color: 'error'
        })
      }
    } finally {
      retryingInvites.value = false
    }
  }

  async function retryPendingRequests() {
    retryingRequests.value = true
    try {
      const ok = await loadPendingRequests()
      if (!ok) {
        toast.add({
          title: tr('athletes_requests_error_toast', 'Still unable to load coaching requests'),
          color: 'error'
        })
      }
    } finally {
      retryingRequests.value = false
    }
  }

  async function fetchData() {
    loading.value = true
    try {
      const [athletesData, groupsData, teamsData] = await Promise.all([
        $fetch<any, string & {}>('/api/coaching/athletes'),
        $fetch<any, string & {}>('/api/coaching/groups'),
        $fetch<any, string & {}>('/api/coaching/teams'),
        loadPendingInvites(),
        loadPendingRequests()
      ])
      athletes.value = athletesData as any[]
      groups.value = groupsData as any[]
      teams.value = teamsData as any[]
    } catch (e) {
      console.error(e)
      toast.add({ title: 'Failed to load coaching data', color: 'error' })
    } finally {
      loading.value = false
    }
  }

  async function fetchGroups() {
    try {
      groups.value = (await ($fetch as any)('/api/coaching/groups')) as any[]
    } catch (e) {
      console.error(e)
      toast.add({ title: 'Failed to refresh groups', color: 'error' })
    }
  }

  async function connectAthlete() {
    const code = normalizedConnectCode.value
    if (!code || code.length < 8) return

    connecting.value = true
    try {
      await $fetch<any, string & {}>('/api/coaching/athletes/connect', {
        method: 'POST',
        body: { code }
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

  async function createInvite() {
    creatingInvite.value = true
    try {
      await $fetch<any, string & {}>('/api/coaching/athletes/invites', {
        method: 'POST',
        body: { email: inviteEmail.value.trim() }
      })
      toast.add({ title: 'Invitation email sent!', color: 'success' })
      inviteEmail.value = ''
      isConnectModalOpen.value = false
      await fetchData()
    } catch (err: any) {
      toast.add({
        title: err.data?.message || 'Failed to send invitation email',
        color: 'error'
      })
    } finally {
      creatingInvite.value = false
    }
  }

  async function revokeInvite(inviteId: string) {
    revokingInviteId.value = inviteId
    try {
      await $fetch<any, string & {}>(`/api/coaching/athletes/invites/${inviteId}`, {
        method: 'DELETE'
      })
      toast.add({ title: 'Invite revoked', color: 'success' })
      pendingInvites.value = pendingInvites.value.filter((invite) => invite.id !== inviteId)
    } catch (err: any) {
      toast.add({
        title: err.data?.message || 'Failed to revoke invite',
        color: 'error'
      })
    } finally {
      revokingInviteId.value = null
    }
  }

  async function createShareInvite() {
    creatingInvite.value = true
    try {
      await $fetch<any, string & {}>('/api/coaching/athletes/invites', {
        method: 'POST',
        body: {}
      })
      toast.add({ title: 'Share link created!', color: 'success' })
      isConnectModalOpen.value = false
      await fetchData()
    } catch (err: any) {
      toast.add({
        title: err.data?.message || 'Failed to create share link',
        color: 'error'
      })
    } finally {
      creatingInvite.value = false
    }
  }

  function formatRequestAnswer(value: unknown) {
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No'
    }
    if (typeof value === 'string' && value.trim()) {
      return value
    }
    return 'No answer provided'
  }

  async function approveRequest(requestId: string) {
    reviewingRequestId.value = requestId
    reviewingAction.value = 'approve'
    try {
      await $fetch<any, string & {}>(`/api/coaching/athletes/requests/${requestId}/approve`, {
        method: 'POST'
      })
      toast.add({ title: 'Coaching request approved', color: 'success' })
      await fetchData()
    } catch (err: any) {
      toast.add({
        title: err.data?.message || 'Failed to approve request',
        color: 'error'
      })
    } finally {
      reviewingRequestId.value = null
      reviewingAction.value = null
    }
  }

  async function declineRequest(requestId: string) {
    reviewingRequestId.value = requestId
    reviewingAction.value = 'decline'
    try {
      await $fetch<any, string & {}>(`/api/coaching/athletes/requests/${requestId}/decline`, {
        method: 'POST'
      })
      toast.add({ title: 'Coaching request declined', color: 'success' })
      pendingRequests.value = pendingRequests.value.filter((request) => request.id !== requestId)
    } catch (err: any) {
      toast.add({
        title: err.data?.message || 'Failed to decline request',
        color: 'error'
      })
    } finally {
      reviewingRequestId.value = null
      reviewingAction.value = null
    }
  }

  function openInviteModal(tab: 'share' | 'email' | 'code') {
    inviteTab.value = tab
    isConnectModalOpen.value = true
    if (tab !== 'email') inviteEmail.value = ''
    if (tab !== 'code') connectCode.value = ''
  }

  function prefillInviteEmail(email: string) {
    inviteEmail.value = email
    openInviteModal('email')
  }

  function formatRelative(date: string) {
    return formatRelativeTime(date)
  }

  function viewAthlete(athlete: any) {
    router.push(`/coaching/athletes/${athlete.id}`)
  }

  onMounted(fetchData)
</script>
