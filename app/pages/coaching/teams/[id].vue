<template>
  <UDashboardPanel id="team-dashboard">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <div class="flex items-center gap-1">
            <UDashboardSidebarCollapse />
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-heroicons-arrow-left"
              to="/coaching/team"
            />
          </div>
        </template>
        <template #title>
          <CoachingNavbarLinks />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <ClientOnly>
              <DashboardTriggerMonitorButton />
            </ClientOnly>
            <UBadge v-if="myRole" color="primary" variant="subtle" size="xs" class="font-bold">
              {{ myRole }}
            </UBadge>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="loading" class="p-0 sm:p-6 space-y-6">
        <USkeleton class="h-20 w-full rounded-none sm:rounded-xl" />
        <div class="grid grid-cols-1 md:grid-cols-3 gap-0 md:gap-6">
          <USkeleton v-for="i in 3" :key="i" class="h-40 w-full rounded-none sm:rounded-xl" />
        </div>
      </div>

      <div v-else-if="!team" class="p-12 text-center">
        <p class="text-neutral-500">Team not found or access denied.</p>
      </div>

      <div v-else class="p-0 sm:p-6 space-y-6">
        <!-- Team Header Card -->
        <div class="px-4 sm:px-0">
          <h1 class="text-4xl font-black text-gray-900 dark:text-white uppercase tracking-tight">
            {{ team.name }}
          </h1>
          <p class="text-sm text-neutral-500 max-w-2xl mt-1">
            {{ team.description || 'No description provided.' }}
          </p>
        </div>

        <!-- Load failures for the roster/invites sub-requests. These must never be rendered as
             an empty roster or an empty invite list — a coach has to be able to tell "nothing
             pending" apart from "we could not load it". -->
        <div v-if="rosterError || invitesError" class="px-4 sm:px-0 space-y-3">
          <UAlert
            v-if="rosterError"
            color="error"
            variant="soft"
            icon="i-heroicons-exclamation-triangle"
            title="Could not load the team roster"
            description="We could not reach the server, so this team's athletes are not shown. This is a loading error — the roster itself is unchanged."
          >
            <template #actions>
              <UButton
                color="error"
                variant="outline"
                size="xs"
                icon="i-heroicons-arrow-path"
                class="font-bold"
                label="Retry"
                :loading="retryingRoster"
                @click="
                  () => {
                    void retryRoster()
                  }
                "
              />
            </template>
          </UAlert>

          <UAlert
            v-if="invitesError"
            color="error"
            variant="soft"
            icon="i-heroicons-exclamation-triangle"
            title="Could not load pending invitations"
            description="We could not reach the server, so this team's invite codes and share links are not shown. This is a loading error — any existing invites are still active."
          >
            <template #actions>
              <UButton
                color="error"
                variant="outline"
                size="xs"
                icon="i-heroicons-arrow-path"
                class="font-bold"
                label="Retry"
                :loading="retryingInvites"
                @click="
                  () => {
                    void retryInvites()
                  }
                "
              />
            </template>
          </UAlert>
        </div>

        <!-- Dashboard Content -->
        <UTabs :items="tabs" class="w-full">
          <!-- Roster Tab -->
          <template #roster>
            <div class="space-y-6 pt-4">
              <div class="flex items-center justify-between px-4 sm:px-0">
                <h3 class="text-lg font-bold">Team Roster</h3>
                <UButton
                  v-if="['OWNER', 'ADMIN', 'COACH'].includes(myRole)"
                  color="neutral"
                  variant="outline"
                  label="Add Athlete"
                  icon="i-heroicons-user-plus"
                  size="xs"
                  class="font-bold"
                  @click="
                    () => {
                      void openQuickAddModal()
                    }
                  "
                />
              </div>

              <div
                v-if="rosterError"
                class="text-center py-12 bg-neutral-50 dark:bg-neutral-800/20 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-800"
              >
                <UIcon
                  name="i-heroicons-exclamation-triangle"
                  class="w-12 h-12 text-error-400 mb-2"
                />
                <p class="text-neutral-500">The roster could not be loaded.</p>
                <UButton
                  color="error"
                  variant="outline"
                  size="xs"
                  icon="i-heroicons-arrow-path"
                  class="font-bold mt-4"
                  label="Retry"
                  :loading="retryingRoster"
                  @click="
                    () => {
                      void retryRoster()
                    }
                  "
                />
              </div>
              <div
                v-else-if="roster.length === 0"
                class="text-center py-12 bg-neutral-50 dark:bg-neutral-800/20 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-800"
              >
                <UIcon name="i-heroicons-users" class="w-12 h-12 text-neutral-300 mb-2" />
                <p class="text-neutral-500">No athletes in this team roster yet.</p>
                <div
                  v-if="['OWNER', 'ADMIN', 'COACH'].includes(myRole)"
                  class="flex items-center justify-center gap-2 mt-4"
                >
                  <UButton
                    color="primary"
                    variant="link"
                    label="Invite with Code"
                    @click="
                      () => {
                        isInviteModalOpen = true
                      }
                    "
                  />
                  <span class="text-neutral-400 text-xs">or</span>
                  <UButton
                    color="primary"
                    variant="link"
                    label="Add Coached Athlete"
                    @click="
                      () => {
                        void openQuickAddModal()
                      }
                    "
                  />
                </div>
              </div>
              <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 md:gap-6">
                <div v-for="rel in roster" :key="rel.id" class="relative group/roster">
                  <CoachingAthleteCard
                    :athlete="rel.athlete"
                    @view="viewAthlete"
                    @message="messageAthlete"
                    @act-as="actAsAthlete"
                  />
                  <UButton
                    v-if="canManageMembers && rel.athlete?.id"
                    color="error"
                    variant="ghost"
                    icon="i-heroicons-trash"
                    size="xs"
                    class="absolute top-2 right-2 opacity-0 group-hover/roster:opacity-100 transition-opacity"
                    :loading="removingMemberId === rel.athlete.id"
                    @click="
                      () => {
                        void removeMember(rel.athlete.id, rel.athlete.name || rel.athlete.email)
                      }
                    "
                  />
                </div>
              </div>

              <UCard
                v-if="canShareAthleteInvite"
                class="overflow-hidden border-2 border-primary-500/20 bg-primary-50/30 dark:bg-primary-950/10"
                :ui="{ ...mobileListCardUi, body: 'p-4 sm:p-6' }"
              >
                <div class="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
                  <div class="space-y-3 max-w-2xl">
                    <div class="space-y-1">
                      <p
                        class="text-[10px] font-black uppercase tracking-[0.2em] text-primary-700 dark:text-primary-300"
                      >
                        Team Invite
                      </p>
                      <h3
                        class="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight"
                      >
                        Invite Athletes to {{ team.name }}
                      </h3>
                      <p class="text-sm text-neutral-600 dark:text-neutral-400">
                        Share one link or QR code so athletes can join the team directly. You can
                        still add an existing coached athlete or use their personal coach code in
                        the modal below.
                      </p>
                    </div>

                    <div class="flex flex-col sm:flex-row gap-3">
                      <UFormField
                        label="Auto-Assign Group"
                        help="Optional: New athletes joining from this link will be added to the selected group."
                        class="w-full sm:max-w-xs"
                      >
                        <USelect
                          v-model="shareInviteGroupId"
                          :items="shareInviteGroupOptions"
                          class="w-full"
                        />
                      </UFormField>

                      <div
                        v-if="shareableAthleteInvite?.group"
                        class="self-end text-[10px] font-bold uppercase tracking-[0.15em] text-primary-700 dark:text-primary-300"
                      >
                        Current link adds athletes to {{ shareableAthleteInvite.group.name }}
                      </div>
                    </div>
                  </div>

                  <div class="flex flex-col items-center gap-3 xl:min-w-[24rem]">
                    <div v-if="shareableAthleteInvite">
                      <CoachingInviteLink :code="shareableAthleteInvite.code" />
                    </div>
                    <div
                      v-else
                      class="h-14 w-full max-w-sm rounded-xl border-2 border-dashed border-primary-200 dark:border-primary-800 bg-white/80 dark:bg-gray-950/40 flex items-center justify-center px-4 text-center text-xs font-bold uppercase tracking-[0.15em] text-primary-700 dark:text-primary-300"
                    >
                      Generate a link to start inviting athletes
                    </div>

                    <UButton
                      :label="
                        shareableAthleteInvite ? 'Generate New Invite Link' : 'Generate Invite Link'
                      "
                      color="primary"
                      icon="i-heroicons-link"
                      :loading="creatingAthleteInvite"
                      @click="
                        () => {
                          void createAthleteShareInvite()
                        }
                      "
                    />
                    <p
                      v-if="shareableAthleteInvite"
                      class="text-[10px] text-neutral-500 uppercase font-bold text-center"
                    >
                      Expires {{ formatRelative(shareableAthleteInvite.expiresAt) }}
                    </p>
                  </div>
                </div>
              </UCard>
            </div>
          </template>

          <!-- Groups Tab -->
          <template #groups>
            <div class="pt-4">
              <CoachingGroupManager
                v-model:active-group-id="activeGroupId"
                :groups="team.groups"
                :athletes="roster"
                :teams="[{ team: team }]"
                @refresh="refreshTeam"
              />

              <!-- Filtered Roster View -->
              <div class="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <CoachingAthleteCard
                  v-for="rel in filteredRoster"
                  :key="rel.id"
                  :athlete="rel.athlete"
                  @view="viewAthlete"
                  @message="messageAthlete"
                  @act-as="actAsAthlete"
                />
              </div>
              <div
                v-if="activeGroupId !== 'all' && filteredRoster.length === 0"
                class="py-12 text-center bg-neutral-50 dark:bg-neutral-800/20 rounded-xl border border-gray-100 dark:border-gray-800"
              >
                <p class="text-neutral-500 text-sm italic font-medium">
                  No athletes assigned to this group yet.
                </p>
              </div>
            </div>
          </template>

          <!-- Staff Tab -->
          <template #staff>
            <div class="space-y-4 pt-4">
              <div class="flex items-center justify-between px-4 sm:px-0">
                <h3 class="text-lg font-bold">Team Staff</h3>
                <UButton
                  v-if="myRole && myRole !== 'OWNER'"
                  color="error"
                  variant="soft"
                  label="Leave Team"
                  icon="i-heroicons-arrow-right-start-on-rectangle"
                  size="xs"
                  class="font-bold"
                  :loading="leavingTeam"
                  @click="
                    () => {
                      void leaveTeam()
                    }
                  "
                />
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <UCard v-for="member in staffMembers" :key="member.id" :ui="mobileListCardUi">
                  <div class="flex items-center justify-between gap-3">
                    <div class="flex items-center gap-3 min-w-0">
                      <UAvatar :src="member.user.image" :alt="member.user.name" />
                      <div class="min-w-0">
                        <p class="font-bold text-sm truncate">{{ member.user.name }}</p>
                        <p class="text-xs text-neutral-500 truncate">{{ member.user.email }}</p>
                      </div>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                      <USelect
                        v-if="canManageMembers && member.userId !== currentUserId"
                        :model-value="member.role"
                        :items="staffRoleOptions"
                        size="xs"
                        class="w-28"
                        @update:model-value="
                          (role) => {
                            void updateMemberRole(member.userId, String(role))
                          }
                        "
                      />
                      <UBadge v-else color="neutral" variant="soft" size="xs">{{
                        member.role
                      }}</UBadge>
                      <UButton
                        v-if="canRemoveMember(member)"
                        color="error"
                        variant="ghost"
                        icon="i-heroicons-trash"
                        size="xs"
                        :loading="removingMemberId === member.userId"
                        @click="
                          () => {
                            void removeMember(member.userId, member.user.name || member.user.email)
                          }
                        "
                      />
                    </div>
                  </div>
                </UCard>
              </div>
            </div>
          </template>

          <!-- Settings & Management -->
          <template #settings>
            <div class="space-y-8 pt-4">
              <!-- Invites Section -->
              <div v-if="['OWNER', 'ADMIN'].includes(myRole)">
                <div class="flex items-center justify-between mb-4">
                  <h3 class="text-lg font-bold">Pending Invitations</h3>
                  <UButton
                    color="neutral"
                    variant="outline"
                    label="Create Invite"
                    icon="i-heroicons-plus"
                    size="xs"
                    class="font-bold"
                    @click="
                      () => {
                        isInviteModalOpen = true
                      }
                    "
                  />
                </div>

                <div
                  v-if="invitesError"
                  class="text-center py-8 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-lg"
                >
                  <p class="text-sm text-neutral-500">Pending invitations could not be loaded.</p>
                  <UButton
                    color="error"
                    variant="outline"
                    size="xs"
                    icon="i-heroicons-arrow-path"
                    class="font-bold mt-3"
                    label="Retry"
                    :loading="retryingInvites"
                    @click="
                      () => {
                        void retryInvites()
                      }
                    "
                  />
                </div>
                <div
                  v-else-if="invites.length === 0"
                  class="text-center py-8 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-lg"
                >
                  <p class="text-sm text-neutral-500">No active invites.</p>
                </div>
                <div v-else class="space-y-2">
                  <div
                    v-for="inv in invites"
                    :key="inv.id"
                    class="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-gray-100 dark:border-gray-800"
                  >
                    <div>
                      <div class="flex items-center gap-2">
                        <CoachingInviteLink :code="inv.code" />
                        <UBadge size="xs" color="neutral" class="uppercase font-bold">
                          {{ inv.role }}
                        </UBadge>
                        <UBadge
                          v-if="inv.group"
                          size="xs"
                          color="primary"
                          variant="subtle"
                          class="uppercase font-bold"
                        >
                          {{ inv.group.name }}
                        </UBadge>
                      </div>
                      <p v-if="inv.email" class="text-xs text-neutral-500 mt-1 pl-1">
                        Restricted to: {{ inv.email }}
                      </p>
                      <p class="text-[10px] text-neutral-400 mt-1 pl-1">
                        Expires {{ formatRelative(inv.expiresAt) }}
                      </p>
                    </div>
                    <UButton
                      color="error"
                      variant="ghost"
                      icon="i-heroicons-trash"
                      size="xs"
                      @click="
                        () => {
                          void revokeInvite(inv.id)
                        }
                      "
                    />
                  </div>
                </div>
              </div>

              <!-- Danger Zone / Leave -->
              <div
                v-if="myRole === 'OWNER'"
                class="pt-8 border-t border-gray-100 dark:border-gray-800"
              >
                <h3 class="text-lg font-bold text-error-600 mb-2">Danger Zone</h3>
                <UCard
                  class="border-error-500/20 bg-error-50/10"
                  :ui="{ ...mobileListCardUi, body: 'p-4' }"
                >
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="font-bold text-sm">Delete Team</p>
                      <p class="text-xs text-neutral-500">
                        Permanently delete this team and all its groups. This cannot be undone.
                      </p>
                    </div>
                    <UButton
                      color="error"
                      variant="soft"
                      label="Delete Team"
                      @click="
                        () => {
                          void confirmDeleteTeam()
                        }
                      "
                    />
                  </div>
                </UCard>
              </div>
              <div v-else-if="myRole" class="pt-8 border-t border-gray-100 dark:border-gray-800">
                <h3 class="text-lg font-bold mb-2">Membership</h3>
                <UCard :ui="{ ...mobileListCardUi, body: 'p-4' }">
                  <div class="flex items-center justify-between gap-4">
                    <div>
                      <p class="font-bold text-sm">Leave Team</p>
                      <p class="text-xs text-neutral-500">
                        Remove yourself from this team. You will lose access to the roster.
                      </p>
                    </div>
                    <UButton
                      color="error"
                      variant="soft"
                      label="Leave Team"
                      :loading="leavingTeam"
                      @click="
                        () => {
                          void leaveTeam()
                        }
                      "
                    />
                  </div>
                </UCard>
              </div>
            </div>
          </template>
        </UTabs>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Create Invite Modal -->
  <UModal
    v-model:open="isInviteModalOpen"
    title="Invite Member to Team"
    description="Generate a secure invitation code to add new staff or athletes to your team."
  >
    <template #body>
      <div class="space-y-4">
        <UFormField
          label="Restricted to Email"
          help="Optional: Restrict this invite to one email address. We'll email them the join link when provided."
        >
          <UInput
            v-model="newInvite.email"
            type="email"
            placeholder="athlete@example.com"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Assign Role" help="Determine the level of access for the new member.">
          <USelect
            v-model="newInvite.role"
            :items="[
              { label: 'Athlete', value: 'ATHLETE' },
              { label: 'Coach', value: 'COACH' },
              { label: 'Admin', value: 'ADMIN' }
            ]"
            class="w-full"
          />
        </UFormField>
        <UFormField
          v-if="newInvite.role === 'ATHLETE'"
          label="Auto-Assign to Group"
          help="Optional: The member will be automatically added to this group upon joining."
        >
          <USelect
            v-model="newInvite.groupId"
            :items="groupOptions"
            placeholder="None (Team Roster only)"
            class="w-full"
          />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <UButton
        label="Cancel"
        color="neutral"
        variant="ghost"
        @click="
          () => {
            isInviteModalOpen = false
          }
        "
      />
      <UButton
        label="Generate Invite"
        color="primary"
        :loading="creatingInvite"
        @click="
          () => {
            void createInvite()
          }
        "
      />
    </template>
  </UModal>

  <!-- Quick Add Athlete Modal -->
  <UModal
    v-model:open="isQuickAddModalOpen"
    title="Add Athlete"
    description="Onboard an athlete to your team workspace."
  >
    <template #body>
      <UTabs
        :items="[
          { label: 'Share Invite', slot: 'share', icon: 'i-heroicons-link' },
          { label: 'From My Athletes', slot: 'connected', icon: 'i-heroicons-user-group' },
          { label: 'By Invite Code', slot: 'by-code', icon: 'i-heroicons-ticket' }
        ]"
        class="w-full"
      >
        <template #share>
          <div class="space-y-4 pt-4">
            <p class="text-sm text-neutral-500 text-center">
              Send athletes a direct team join link, or let them scan the QR code from their phone.
            </p>

            <UFormField
              label="Auto-Assign Group"
              help="Optional: Anyone joining from this link will be added to this group automatically."
            >
              <USelect
                v-model="shareInviteGroupId"
                :items="shareInviteGroupOptions"
                class="w-full"
              />
            </UFormField>

            <div
              class="rounded-2xl border border-primary-200/60 dark:border-primary-900 bg-primary-50/50 dark:bg-primary-950/10 p-4 flex flex-col items-center gap-4"
            >
              <div v-if="shareableAthleteInvite">
                <CoachingInviteLink :code="shareableAthleteInvite.code" />
              </div>
              <div
                v-else
                class="w-full rounded-xl border-2 border-dashed border-primary-200 dark:border-primary-800 bg-white/80 dark:bg-gray-950/30 px-4 py-5 text-center text-xs font-bold uppercase tracking-[0.15em] text-primary-700 dark:text-primary-300"
              >
                Generate an athlete invite to unlock the share link and QR code
              </div>

              <p
                v-if="shareableAthleteInvite?.group"
                class="text-[10px] font-bold uppercase tracking-[0.15em] text-primary-700 dark:text-primary-300 text-center"
              >
                Current invite adds athletes to {{ shareableAthleteInvite.group.name }}
              </p>

              <UButton
                :label="
                  shareableAthleteInvite ? 'Generate New Invite Link' : 'Generate Invite Link'
                "
                color="primary"
                block
                :loading="creatingAthleteInvite"
                icon="i-heroicons-link"
                @click="
                  () => {
                    void createAthleteShareInvite()
                  }
                "
              />
            </div>
          </div>
        </template>

        <template #connected>
          <div class="space-y-4 pt-4">
            <UFormField
              label="Select Athlete"
              help="Only athletes you currently have a direct coaching relationship with are listed here."
            >
              <USelect
                v-model="selectedAthleteToQuickAdd"
                :items="availableCoachedAthletes"
                placeholder="Select from your coached athletes..."
                class="w-full"
              />
            </UFormField>
            <UButton
              label="Add to Team"
              color="primary"
              block
              :loading="quickAdding"
              :disabled="!selectedAthleteToQuickAdd"
              @click="
                () => {
                  void quickAddAthlete()
                }
              "
            />
          </div>
        </template>

        <template #by-code>
          <div class="space-y-4 pt-4 text-center">
            <p class="text-sm text-neutral-500">
              Enter the athlete's personal "Invite a Coach" code. They will be automatically
              connected to you AND added to this team.
            </p>
            <UFormField label="Athlete Code">
              <UInput
                v-model="athleteCodeToJoin"
                placeholder="INVITE-CODE"
                class="font-mono uppercase text-center text-xl w-full"
                maxlength="10"
              />
            </UFormField>
            <UButton
              label="Add via Code"
              color="primary"
              block
              :loading="quickAdding"
              :disabled="!athleteCodeToJoin"
              @click="
                () => {
                  void addAthleteByCode()
                }
              "
            />
          </div>
        </template>
      </UTabs>
    </template>
    <template #footer>
      <UButton
        label="Cancel"
        color="neutral"
        variant="ghost"
        block
        @click="
          () => {
            isQuickAddModalOpen = false
          }
        "
      />
    </template>
  </UModal>
</template>

<script setup lang="ts">
  import { formatDistanceToNow } from 'date-fns'
  import { mobileListCardUi } from '~/utils/mobile-surface-ui'

  definePageMeta({
    middleware: 'auth'
  })

  const route = useRoute()
  const router = useRouter()
  const toast = useToast()
  const coachingStore = useCoachingStore()
  const { messageAthlete } = useCoachingMessageAthlete()
  const currentUserId = computed(() => useUserStore().user?.id)

  const team = ref<any>(null)
  const roster = ref<any[]>([])
  const invites = ref<any[]>([])
  const rosterError = ref(false)
  const invitesError = ref(false)
  const retryingRoster = ref(false)
  const retryingInvites = ref(false)
  const myCoachedAthletes = ref<any[]>([])
  const loading = ref(true)
  const creatingInvite = ref(false)
  const creatingAthleteInvite = ref(false)
  const isInviteModalOpen = ref(false)
  const isQuickAddModalOpen = ref(false)
  const quickAdding = ref(false)
  const selectedAthleteToQuickAdd = ref('')
  const athleteCodeToJoin = ref('')
  const activeGroupId = ref('all')
  const shareInviteGroupId = ref<string | undefined>(undefined)
  const removingMemberId = ref<string | null>(null)
  const leavingTeam = ref(false)
  const updatingRoleId = ref<string | null>(null)

  const staffRoleOptions = [
    { label: 'Coach', value: 'COACH' },
    { label: 'Admin', value: 'ADMIN' },
    { label: 'Owner', value: 'OWNER' }
  ]

  const newInvite = ref({
    email: '',
    role: 'ATHLETE' as any,
    groupId: undefined as string | undefined
  })

  const groupOptions = computed(() => {
    if (!team.value?.groups) return []
    return team.value.groups.map((g: any) => ({
      label: g.name,
      value: g.id
    }))
  })

  const shareInviteGroupOptions = computed(() => [
    { label: 'No auto-assignment', value: undefined },
    ...groupOptions.value
  ])

  const canShareAthleteInvite = computed(() => ['OWNER', 'ADMIN', 'COACH'].includes(myRole.value))
  const canManageMembers = computed(() => ['OWNER', 'ADMIN'].includes(myRole.value || ''))

  const ownerCount = computed(
    () => team.value?.members?.filter((m: any) => m.role === 'OWNER').length || 0
  )

  function canRemoveMember(member: { userId: string; role: string }) {
    if (!canManageMembers.value) return false
    if (member.userId === currentUserId.value && member.role === 'OWNER' && ownerCount.value <= 1) {
      return false
    }
    return true
  }

  const shareableAthleteInvite = computed(() => {
    return (
      invites.value.find((invite) => invite.role === 'ATHLETE' && !invite.email) ||
      invites.value.find((invite) => invite.role === 'ATHLETE')
    )
  })

  const tabs = computed(() => {
    const isStaff = ['OWNER', 'ADMIN', 'COACH'].includes(myRole.value)

    const items = []
    // Roster is visible to all members, but content is masked for non-staff
    items.push({ label: 'Roster', slot: 'roster', icon: 'i-heroicons-users' })

    if (isStaff) {
      items.push({ label: 'Groups', slot: 'groups', icon: 'i-heroicons-rectangle-group' })
    }

    items.push({ label: 'Staff', slot: 'staff', icon: 'i-heroicons-academic-cap' })

    if (['OWNER', 'ADMIN'].includes(myRole.value)) {
      items.push({ label: 'Management', slot: 'settings', icon: 'i-heroicons-cog-6-tooth' })
    } else if (myRole.value) {
      items.push({ label: 'Settings', slot: 'settings', icon: 'i-heroicons-cog-6-tooth' })
    }

    return items
  })

  const myRole = computed(() => {
    if (!team.value) return null
    const member = team.value.members.find((m: any) => m.userId === useUserStore().user?.id)
    return member?.role || null
  })

  const staffMembers = computed(() => {
    if (!team.value) return []
    return team.value.members.filter((m: any) => ['OWNER', 'ADMIN', 'COACH'].includes(m.role))
  })

  const filteredRoster = computed(() => {
    if (activeGroupId.value === 'all') return roster.value || []
    const group = team.value?.groups?.find((g: any) => g.id === activeGroupId.value)
    if (!group) return roster.value || []
    const memberIds = group.members?.map((m: any) => m.athleteId) || []
    return (roster.value || []).filter((rel) => rel.athlete && memberIds.includes(rel.athlete.id))
  })

  const availableCoachedAthletes = computed(() => {
    if (!myCoachedAthletes.value) return []
    return myCoachedAthletes.value
      .filter((a) => a.athlete && !roster.value.some((r) => r.athlete?.id === a.athlete.id))
      .map((a) => ({
        label: a.athlete.name || a.athlete.email,
        value: a.athlete.id
      }))
  })

  async function openQuickAddModal() {
    isQuickAddModalOpen.value = true
    try {
      const data = await $fetch<any, string & {}>('/api/coaching/athletes')
      myCoachedAthletes.value = data as any[]
    } catch (e) {
      console.error(e)
      toast.add({ title: 'Failed to load coached athletes', color: 'error' })
    }
  }

  async function quickAddAthlete() {
    if (!selectedAthleteToQuickAdd.value) return
    quickAdding.value = true
    try {
      await $fetch<any, string & {}>(`/api/coaching/teams/${team.value.id}/members/add`, {
        method: 'POST',
        body: { athleteId: selectedAthleteToQuickAdd.value }
      })
      toast.add({ title: 'Athlete added to team!', color: 'success' })
      isQuickAddModalOpen.value = false
      selectedAthleteToQuickAdd.value = ''
      await refreshTeam()
    } catch (e) {
      toast.add({ title: 'Failed to add athlete', color: 'error' })
    } finally {
      quickAdding.value = false
    }
  }

  async function addAthleteByCode() {
    if (!athleteCodeToJoin.value) return
    quickAdding.value = true
    try {
      await $fetch<any, string & {}>(`/api/coaching/teams/${team.value.id}/join-by-code`, {
        method: 'POST',
        body: { code: athleteCodeToJoin.value.toUpperCase() }
      })
      toast.add({ title: 'Athlete added via code!', color: 'success' })
      isQuickAddModalOpen.value = false
      athleteCodeToJoin.value = ''
      await refreshTeam()
    } catch (err: any) {
      toast.add({
        title: 'Failed: ' + (err.data?.message || 'Invalid code'),
        color: 'error'
      })
    } finally {
      quickAdding.value = false
    }
  }

  // Roster and invites load independently so one transient failure does not blank the whole
  // page — but a failure is never rendered as "nothing here": the *Error flags drive an
  // explicit error state with a retry, and a successful empty response clears them.
  async function loadRoster() {
    const teamId = route.params.id as string
    try {
      const data = await $fetch<any, string & {}>(`/api/coaching/teams/${teamId}/roster`)
      roster.value = (data as any[]) || []
      rosterError.value = false
      return true
    } catch (e) {
      console.error(e)
      roster.value = []
      rosterError.value = true
      return false
    }
  }

  async function loadInvites() {
    const teamId = route.params.id as string
    try {
      const data = await $fetch<any, string & {}>(`/api/coaching/teams/${teamId}/invites`)
      invites.value = (data as any[]) || []
      invitesError.value = false
      return true
    } catch (e) {
      console.error(e)
      invites.value = []
      invitesError.value = true
      return false
    }
  }

  async function retryRoster() {
    retryingRoster.value = true
    try {
      const ok = await loadRoster()
      if (!ok) {
        toast.add({ title: 'Still unable to load the team roster', color: 'error' })
      }
    } finally {
      retryingRoster.value = false
    }
  }

  async function retryInvites() {
    retryingInvites.value = true
    try {
      const ok = await loadInvites()
      if (!ok) {
        toast.add({ title: 'Still unable to load pending invitations', color: 'error' })
      }
    } finally {
      retryingInvites.value = false
    }
  }

  async function refreshTeam() {
    const teamId = route.params.id as string
    try {
      team.value = await $fetch<any, string & {}>(`/api/coaching/teams/${teamId}`)

      await Promise.all([loadRoster(), loadInvites()])
    } catch (e) {
      console.error(e)
      toast.add({ title: 'Failed to load team data', color: 'error' })
    }
  }

  async function createInvite() {
    creatingInvite.value = true
    try {
      const payload = {
        ...newInvite.value,
        email: newInvite.value.email || undefined,
        groupId: newInvite.value.groupId || undefined
      }

      await $fetch<any, string & {}>(`/api/coaching/teams/${team.value.id}/invites`, {
        method: 'POST',
        body: payload
      })
      toast.add({ title: 'Invite code generated!', color: 'success' })
      isInviteModalOpen.value = false
      newInvite.value = { email: '', role: 'ATHLETE', groupId: undefined }
      await refreshTeam()
    } catch (e) {
      toast.add({ title: 'Failed to create invite', color: 'error' })
    } finally {
      creatingInvite.value = false
    }
  }

  async function createAthleteShareInvite() {
    creatingAthleteInvite.value = true
    try {
      await $fetch<any, string & {}>(`/api/coaching/teams/${team.value.id}/invites`, {
        method: 'POST',
        body: {
          role: 'ATHLETE',
          groupId: shareInviteGroupId.value || undefined
        }
      })
      toast.add({ title: 'Invite link generated!', color: 'success' })
      await refreshTeam()
    } catch (err: any) {
      toast.add({
        title: err.data?.message || 'Failed to generate invite link',
        color: 'error'
      })
    } finally {
      creatingAthleteInvite.value = false
    }
  }

  async function revokeInvite(inviteId: string) {
    try {
      await $fetch<any, string & {}>(`/api/coaching/teams/${team.value.id}/invites`, {
        method: 'DELETE',
        body: { inviteId }
      })
      toast.add({ title: 'Invite revoked', color: 'success' })
      await refreshTeam()
    } catch (e) {
      toast.add({ title: 'Failed to revoke invite', color: 'error' })
    }
  }

  function viewAthlete(athlete: any) {
    if (athlete?.canViewDetails === false || athlete?.isMasked) return
    router.push(`/coaching/athletes/${athlete.id}`)
  }

  function actAsAthlete(athlete: any) {
    if (!athlete?.id || athlete?.canViewDetails === false || athlete?.isMasked) return
    const name = athlete.name || athlete.email || 'Athlete'
    coachingStore.startActingAs(athlete.id, name)
  }

  async function removeMember(userId: string, displayName?: string) {
    if (!team.value?.id || !userId) return
    const label = displayName || 'this member'
    if (!confirm(`Remove ${label} from the team?`)) return

    removingMemberId.value = userId
    try {
      await $fetch<any, string & {}>(`/api/coaching/teams/${team.value.id}/members/${userId}`, {
        method: 'DELETE'
      })
      toast.add({ title: 'Member removed', color: 'success' })
      if (userId === currentUserId.value) {
        await router.push('/coaching/team')
        return
      }
      await refreshTeam()
    } catch (err: any) {
      toast.add({
        title: err.data?.message || 'Failed to remove member',
        color: 'error'
      })
    } finally {
      removingMemberId.value = null
    }
  }

  async function leaveTeam() {
    if (!team.value?.id || !currentUserId.value) return
    if (!confirm(`Leave "${team.value.name}"? You will lose access to this team.`)) return

    leavingTeam.value = true
    try {
      await $fetch<any, string & {}>(
        `/api/coaching/teams/${team.value.id}/members/${currentUserId.value}`,
        {
          method: 'DELETE'
        }
      )
      toast.add({ title: 'You left the team', color: 'success' })
      await router.push('/coaching/team')
    } catch (err: any) {
      toast.add({
        title: err.data?.message || 'Failed to leave team',
        color: 'error'
      })
    } finally {
      leavingTeam.value = false
    }
  }

  async function updateMemberRole(userId: string, role: string) {
    if (!team.value?.id || !userId || !role) return
    updatingRoleId.value = userId
    try {
      await $fetch<any, string & {}>(`/api/coaching/teams/${team.value.id}/members/${userId}`, {
        method: 'PATCH',
        body: { role }
      })
      toast.add({ title: 'Role updated', color: 'success' })
      await refreshTeam()
    } catch (err: any) {
      toast.add({
        title: err.data?.message || 'Failed to update role',
        color: 'error'
      })
    } finally {
      updatingRoleId.value = null
    }
  }

  async function confirmDeleteTeam() {
    if (!confirm(`Are you sure you want to delete "${team.value.name}"? This cannot be undone.`))
      return

    try {
      await $fetch<any, string & {}>(`/api/coaching/teams/${team.value.id}`, { method: 'DELETE' })
      toast.add({ title: 'Team deleted', color: 'success' })
      await router.push('/coaching/team')
    } catch (err: any) {
      toast.add({
        title: err.data?.message || 'Failed to delete team',
        color: 'error'
      })
    }
  }

  function formatRelative(date: string) {
    return formatDistanceToNow(new Date(date), { addSuffix: true })
  }

  onMounted(async () => {
    await refreshTeam()
    loading.value = false
  })
</script>
