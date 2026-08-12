<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import CoachJoinPage from '~/components/public/CoachJoinPage.vue'

  const { t } = useTranslate('coaching')

  const route = useRoute()
  const router = useRouter()
  const toast = useToast()
  const { data: session } = useAuth()

  // Public invite landing page: reachable signed-out *and* signed-in, so it must
  // not pick up the `guest` middleware (which bounces authenticated visitors to
  // /dashboard). `layout: false` matches the sibling branded join page at
  // `coach/[slug]/join.vue`, which renders the same CoachJoinPage full-bleed.
  definePageMeta({
    layout: false,
    auth: false
  })

  const code = computed(() => (route.params.code as string)?.toUpperCase())
  const invite = ref<any>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)
  const joining = ref(false)
  const autoAccepting = ref(false)
  const brandedJoin = computed(
    () => invite.value?.type === 'ATHLETE_INVITE' && invite.value?.coachJoin
  )
  const signupUrl = computed(
    () => `/join?callbackUrl=${encodeURIComponent(`/join/${code.value}?accept=1`)}`
  )
  const loginUrl = computed(
    () => `/login?callbackUrl=${encodeURIComponent(`/join/${code.value}?accept=1`)}`
  )

  async function fetchInvite() {
    loading.value = true
    error.value = null
    try {
      invite.value = await $fetch<any, string & {}>(`/api/join/${code.value}`)
    } catch (err: any) {
      error.value =
        err.data?.message || t.value('join_error_default', 'Invalid or expired invitation code.')
    } finally {
      loading.value = false
    }
  }

  async function acceptJoin() {
    if (!session.value) {
      await navigateTo(brandedJoin.value ? signupUrl.value : loginUrl.value)
      return
    }

    joining.value = true
    try {
      const response: any = await $fetch<any, string & {}>(`/api/join/${code.value}`, {
        method: 'POST'
      })

      toast.add({
        title:
          response.type === 'TEAM'
            ? t.value('join_toast_team', 'Successfully joined the team!')
            : response.type === 'COACHING'
              ? t.value('join_toast_coaching', 'Athlete connected!')
              : t.value('join_toast_coach', 'Successfully connected with coach!'),
        color: 'success'
      })

      if (response.type === 'TEAM' && response.teamId) {
        router.push(`/coaching/teams/${response.teamId}`)
      } else if (response.type === 'COACHING') {
        router.push('/coaching/athletes')
      } else {
        router.push('/coaching/team')
      }
    } catch (err: any) {
      toast.add({
        title: t.value('join_toast_failed', 'Failed to join: {message}', {
          message: err.data?.message || t.value('join_toast_unknown_error', 'Unknown error')
        }),
        color: 'error'
      })
    } finally {
      joining.value = false
    }
  }

  onMounted(fetchInvite)

  watchEffect(() => {
    if (
      import.meta.client &&
      session.value &&
      invite.value &&
      !loading.value &&
      route.query.accept === '1' &&
      !joining.value &&
      !autoAccepting.value
    ) {
      autoAccepting.value = true
      acceptJoin().finally(() => {
        autoAccepting.value = false
      })
    }
  })
</script>

<template>
  <CoachJoinPage
    v-if="!loading && !error && brandedJoin"
    :coach="invite.coachJoin.coach"
    :join-page="invite.coachJoin.joinPage"
    :proof="invite.coachJoin.proof"
    :active-invite-available="invite.coachJoin.activeInviteAvailable"
    :session="session"
    :joining="joining"
    :invite-reserved-email="invite.email"
    :signup-url="signupUrl"
    :login-url="loginUrl"
    @join="acceptJoin"
  />

  <div v-else class="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
    <UCard class="w-full max-w-md overflow-hidden">
      <div v-if="loading" class="p-8 text-center space-y-4">
        <UIcon
          name="i-heroicons-arrow-path"
          class="w-12 h-12 text-primary-500 animate-spin mx-auto"
        />
        <p class="text-neutral-500 font-medium">
          {{ t('join_checking', 'Checking invitation...') }}
        </p>
      </div>

      <div v-else-if="error" class="p-8 text-center space-y-6">
        <div class="bg-error-50 dark:bg-error-950/20 p-4 rounded-full inline-block">
          <UIcon name="i-heroicons-exclamation-triangle" class="w-12 h-12 text-error-500" />
        </div>
        <div class="space-y-2">
          <h1 class="text-2xl font-black text-gray-900 dark:text-white uppercase">
            {{ t('join_not_found_title', 'Invite Not Found') }}
          </h1>
          <p class="text-neutral-500">{{ error }}</p>
        </div>
        <UButton
          to="/dashboard"
          color="neutral"
          variant="ghost"
          :label="t('join_back_to_dashboard', 'Back to Dashboard')"
          block
          size="lg"
        />
      </div>

      <div v-else-if="invite" class="p-0">
        <!-- Hero Header -->
        <div class="bg-primary-600 p-8 text-center text-white space-y-2 relative overflow-hidden">
          <div class="relative z-10">
            <p class="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">
              {{ t('join_eyebrow', "You've been invited") }}
            </p>
            <h1 class="text-3xl font-black uppercase tracking-tight leading-none">
              {{
                invite.type === 'TEAM'
                  ? t('join_title_team', 'Join Team')
                  : t('join_title_coach', 'Connect with Coach')
              }}
            </h1>
          </div>
          <!-- Decorative Background -->
          <div class="absolute inset-0 opacity-10 pointer-events-none">
            <UIcon
              name="i-lucide-users"
              class="w-64 h-64 -bottom-12 -right-12 absolute transform rotate-12"
            />
          </div>
        </div>

        <div class="p-8 space-y-8">
          <!-- Content -->
          <div class="flex flex-col items-center text-center space-y-4">
            <UAvatar
              v-if="invite.image"
              :src="invite.image"
              :alt="invite.name"
              size="2xl"
              class="ring-4 ring-primary-500/20"
            />
            <div v-else class="bg-primary-50 dark:bg-primary-950/30 p-6 rounded-full">
              <UIcon
                :name="invite.type === 'TEAM' ? 'i-heroicons-user-group' : 'i-heroicons-user'"
                class="w-12 h-12 text-primary-600 dark:text-primary-400"
              />
            </div>

            <div class="space-y-1">
              <h2 class="text-2xl font-bold text-gray-900 dark:text-white">{{ invite.name }}</h2>
              <p v-if="invite.description" class="text-sm text-neutral-500 italic max-w-xs">
                "{{ invite.description }}"
              </p>
              <p
                v-if="invite.type === 'ATHLETE_INVITE' && invite.email"
                class="text-xs text-neutral-500 max-w-xs"
              >
                {{
                  t('join_reserved_for', 'This invitation is reserved for {email}.', {
                    email: invite.email
                  })
                }}
              </p>
              <div v-if="invite.type === 'TEAM'" class="mt-4 flex flex-wrap justify-center gap-2">
                <UBadge color="neutral" variant="subtle" size="xs" class="font-bold uppercase">
                  {{ t('join_role', 'Role: {role}', { role: invite.role }) }}
                </UBadge>
                <UBadge
                  v-if="invite.groupName"
                  color="primary"
                  variant="subtle"
                  size="xs"
                  class="font-bold uppercase"
                >
                  {{ t('join_group', 'Group: {group}', { group: invite.groupName }) }}
                </UBadge>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="space-y-3">
            <UButton
              color="primary"
              size="xl"
              block
              class="font-black uppercase tracking-wide"
              :loading="joining"
              @click="
                () => {
                  void acceptJoin()
                }
              "
            >
              {{
                session ? t('join_accept', 'Accept Invitation') : t('join_login', 'Login to Join')
              }}
            </UButton>
            <p v-if="!session" class="text-[10px] text-center text-neutral-400 uppercase font-bold">
              {{ t('join_account_required', 'You must have a Coach Watts account to join') }}
            </p>
            <UButton
              v-if="session"
              to="/dashboard"
              color="neutral"
              variant="ghost"
              :label="t('join_not_now', 'Not now')"
              block
            />
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
