<template>
  <div
    class="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-x-clip bg-[oklch(12%_0.015_155)] px-4 py-10 sm:px-6 lg:py-16"
  >
    <UContainer class="relative z-10 w-full max-w-6xl">
      <div
        class="grid overflow-hidden rounded-2xl border border-white/10 bg-[oklch(14%_0.018_155)] lg:grid-cols-12"
      >
        <aside
          class="relative hidden flex-col justify-between border-r border-white/8 p-10 lg:col-span-5 lg:flex lg:p-12"
        >
          <div>
            <p class="text-xs font-bold uppercase tracking-widest text-primary-400">Coach Watts</p>
            <h2
              class="font-athletic mt-6 text-3xl font-bold uppercase leading-[0.95] tracking-tight text-white"
            >
              {{ joinHeroTitle }}
              <span class="text-primary-400">{{ joinHeroTitleAccent }}</span>
            </h2>
            <p class="mt-4 text-sm font-medium leading-relaxed text-gray-400">
              {{ joinTagline }}
            </p>
          </div>

          <div class="mt-10 border-t border-white/8 pt-8">
            <blockquote class="text-sm font-medium leading-relaxed text-gray-300">
              “Precision endurance coaching backed by live biometric load & readiness analytics.”
            </blockquote>
            <div class="mt-4 flex items-center gap-3">
              <span class="h-2 w-2 rounded-full bg-primary-400" />
              <span class="text-xs font-bold uppercase tracking-widest text-gray-400"
                >Adaptive Intelligence</span
              >
            </div>
          </div>
        </aside>

        <div class="flex flex-col justify-center p-8 sm:p-12 lg:col-span-7 lg:p-16">
          <div class="mx-auto w-full max-w-md">
            <h1
              class="font-athletic text-4xl font-bold uppercase leading-[0.9] tracking-tight text-white sm:text-5xl"
            >
              {{ joinTitle }}
              <span class="text-primary-400">{{ joinSubtitle }}</span>
            </h1>
            <p class="mt-4 text-base font-medium text-gray-400 sm:text-lg">
              {{ joinFormSubtitle }}
            </p>

            <div class="mt-8 space-y-3">
              <UButton
                v-if="appleSignInEnabled"
                block
                size="xl"
                icon="i-simple-icons-apple"
                color="neutral"
                variant="solid"
                class="h-14 min-w-full rounded-xl bg-black text-xs font-bold uppercase tracking-[0.15em] text-white hover:bg-neutral-900"
                :loading="loadingApple"
                @click="
                  () => {
                    void handleAppleLogin()
                  }
                "
              >
                {{ joinApple }}
              </UButton>

              <UButton
                block
                size="xl"
                icon="i-simple-icons-google"
                color="primary"
                variant="solid"
                class="h-14 min-w-full rounded-xl text-xs font-bold uppercase tracking-[0.15em]"
                :loading="loading"
                @click="
                  () => {
                    void handleGoogleLogin()
                  }
                "
              >
                {{ joinGoogle }}
              </UButton>

              <UButton
                block
                size="xl"
                color="neutral"
                variant="outline"
                class="h-14 min-w-full rounded-xl border-white/10 text-xs font-bold uppercase tracking-[0.12em]"
                :loading="loadingStrava"
                @click="
                  () => {
                    void handleStravaLogin()
                  }
                "
              >
                <template #leading>
                  <UIcon name="i-simple-icons-strava" class="h-5 w-5 text-[#FC4C02]" />
                </template>
                {{ joinStrava }}
              </UButton>

              <UButton
                block
                size="xl"
                color="neutral"
                variant="outline"
                class="h-14 min-w-full rounded-xl border-white/10 text-xs font-bold uppercase tracking-[0.12em]"
                :loading="loadingIntervals"
                @click="
                  () => {
                    void handleIntervalsLogin()
                  }
                "
              >
                <template #leading>
                  <img src="/images/logos/intervals.png" alt="" class="h-5 w-5" />
                </template>
                {{ joinIntervals }}
              </UButton>
            </div>

            <p class="mt-5 text-xs font-bold uppercase tracking-widest text-primary-400">
              {{ joinFreeForeverNote }}
            </p>

            <p class="mt-8 text-sm text-gray-400">
              {{ joinAlreadyAccount }}
              <NuxtLink
                :to="
                  callbackUrl === '/dashboard'
                    ? '/login'
                    : `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
                "
                class="ml-1 font-bold uppercase tracking-widest text-primary-400 transition-colors hover:text-primary-300"
                >{{ joinLogin }}</NuxtLink
              >
            </p>

            <p class="mt-4 max-w-sm text-xs leading-relaxed text-gray-400">
              {{ joinTermsAgree }}
              <NuxtLink to="/terms" class="underline underline-offset-2 hover:text-white">{{
                joinTerms
              }}</NuxtLink>
              {{ joinAnd }}
              <NuxtLink to="/privacy" class="underline underline-offset-2 hover:text-white">{{
                joinPrivacy
              }}</NuxtLink
              >.
            </p>
          </div>
        </div>
      </div>
    </UContainer>
  </div>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import { buildAcquisitionContext } from '#shared/analytics-events'

  const { t } = useTranslate('auth')

  // Tolgee resolves these keys from bundled static data in production, but in dev it
  // replaces the namespace with whatever the Tolgee platform returns. Any key that has
  // not been pushed to the platform yet would then render as its raw key, so every
  // lookup on this public page carries its English source string as a fallback.
  const translateOrFallback = (key: string, fallback: string, invalidValues: string[] = []) =>
    computed(() => {
      const translated = t.value(key)
      return translated === key || invalidValues.includes(translated) ? fallback : translated
    })

  const { signIn } = useAuth()
  const route = useRoute()
  const toast = useToast()
  const { trackSignupStarted, trackSignupFailed } = useAnalytics()
  const runtimeConfig = useRuntimeConfig()
  const appleSignInEnabled = computed(() => Boolean(runtimeConfig.public.appleSignInEnabled))

  const acquisitionContext = computed(() => buildAcquisitionContext(route.query, 'join'))

  definePageMeta({
    layout: 'home',
    middleware: ['guest'],
    auth: false
  })

  const callbackUrl = (route.query.callbackUrl as string) || '/dashboard'

  const joinHeroTitle = translateOrFallback('join.hero_title', 'Eliminate the')
  const joinHeroTitleAccent = translateOrFallback('join.hero_title_accent', 'guesswork')
  const joinSeoTitle = translateOrFallback('join.seo_title', 'Create your account')
  const joinSeoOgTitle = translateOrFallback(
    'join.seo_og_title',
    'Join Coach Watts - AI Endurance Coaching'
  )
  const joinSeoDescription = translateOrFallback(
    'join.seo_description',
    'Create your Coach Watts account and get personalized AI training, recovery analytics, and daily coaching insights.'
  )

  useSeoMeta({
    title: () => joinSeoTitle.value,
    ogTitle: () => joinSeoOgTitle.value,
    description: () => joinSeoDescription.value,
    ogDescription: () => joinSeoDescription.value,
    ogImage: '/images/og-image.png',
    twitterCard: 'summary_large_image',
    twitterTitle: () => joinSeoOgTitle.value,
    twitterDescription: () => joinSeoDescription.value,
    twitterImage: '/images/og-image.png'
  })

  const loading = ref(false)
  const loadingApple = ref(false)
  const loadingStrava = ref(false)
  const loadingIntervals = ref(false)

  const joinTitle = translateOrFallback('join.title', 'Create your')
  const joinSubtitle = translateOrFallback('join.subtitle', 'account')
  const joinTagline = translateOrFallback(
    'join.tagline',
    'Adaptive training and fueling guidance from day one.'
  )
  const joinFormSubtitle = translateOrFallback(
    'join.form_subtitle',
    'Start free with a 14-day full-access trial. No credit card required.',
    ['Create your Coach Watts account. No credit card required.']
  )
  const joinErrorTitle = translateOrFallback('join.error_title', 'Signup failed')
  const joinErrorApple = translateOrFallback(
    'join.error_apple',
    'Could not start Apple signup. Please try again.'
  )
  const joinErrorGoogle = translateOrFallback(
    'join.error_google',
    'Could not start Google signup. Please try again.'
  )
  const joinErrorStrava = translateOrFallback(
    'join.error_strava',
    'Could not start Strava signup. Please try again.'
  )
  const joinErrorIntervals = translateOrFallback(
    'join.error_intervals',
    'Could not start Intervals signup. Please try again.'
  )
  const joinApple = translateOrFallback('join.apple', 'Create Account with Apple')
  const joinGoogle = translateOrFallback('join.google', 'Create Account with Google')
  const joinStrava = translateOrFallback('join.strava', 'Create Account with Strava')
  const joinIntervals = translateOrFallback('join.intervals', 'Create Account with Intervals.icu')
  const joinFreeForeverNote = translateOrFallback(
    'join.free_forever_note',
    'Free forever with optional upgrades. Your 14-day trial starts at signup.'
  )
  const joinAlreadyAccount = translateOrFallback('join.already_account', 'Already have an account?')
  const joinLogin = translateOrFallback('join.login', 'Log in')
  const joinTermsAgree = translateOrFallback('join.terms_agree', 'By continuing, you agree to our')
  const joinTerms = translateOrFallback('join.terms', 'Terms of Service')
  const joinAnd = translateOrFallback('join.and', 'and')
  const joinPrivacy = translateOrFallback('join.privacy', 'Privacy Policy')

  const referral = computed(() => (route.query.ref as string) || '')

  const joinUserMessage = translateOrFallback(
    'join.user_message',
    'My legs feel super heavy today. Should I push through?'
  )
  const joinHallOfFameUserMessage = translateOrFallback(
    'join.hall_of_fame_user_message',
    'I want to break my 5K personal best. Can you help?'
  )
  const joinAiGreeting = translateOrFallback(
    'join.ai_greeting',
    "I noticed your <span class='text-primary-400 font-bold'>HRV</span> dropped to 28ms overnight."
  )
  const joinHallOfFameAiGreeting = translateOrFallback(
    'join.hall_of_fame_ai_greeting',
    'Absolutely. I see your current best is 18:42 from last June.'
  )
  const joinAiAdvice = translateOrFallback(
    'join.ai_advice',
    "Let's swap your intervals for a <span class='font-bold text-primary-400'>Zone 2 Recovery Ride</span>. We'll get back to intensity tomorrow."
  )
  const joinHallOfFameAiAdvice = translateOrFallback(
    'join.hall_of_fame_ai_advice',
    "Based on your current fatigue profile, we need to focus on <span class='font-bold text-primary-400'>Threshold Intervals</span> this week to push that ceiling."
  )

  const userInquiry = computed(() =>
    referral.value === 'hall-of-fame' ? joinHallOfFameUserMessage.value : joinUserMessage.value
  )

  const aiGreeting = computed(() =>
    referral.value === 'hall-of-fame' ? joinHallOfFameAiGreeting.value : joinAiGreeting.value
  )

  const aiAdvice = computed(() =>
    referral.value === 'hall-of-fame' ? joinHallOfFameAiAdvice.value : joinAiAdvice.value
  )

  function showSignupError(
    description: string,
    error: unknown,
    provider: 'apple' | 'google' | 'strava' | 'intervals'
  ) {
    console.error(`${provider} signup error:`, error)
    toast.add({
      title: joinErrorTitle.value,
      description: error instanceof Error ? error.message : description,
      color: 'error'
    })
  }

  function signupFailureCode(error: unknown) {
    if (error instanceof Error && error.message) {
      return error.message.slice(0, 64)
    }
    return 'unknown_error'
  }

  async function handleAppleLogin() {
    trackSignupStarted('apple', acquisitionContext.value)
    loadingApple.value = true
    try {
      await signIn('apple', { callbackUrl })
    } catch (error: unknown) {
      showSignupError(joinErrorApple.value, error, 'apple')
      trackSignupFailed('apple', 'oauth_start', signupFailureCode(error), acquisitionContext.value)
      loadingApple.value = false
    }
  }

  async function handleGoogleLogin() {
    trackSignupStarted('google', acquisitionContext.value)
    loading.value = true
    try {
      await signIn('google', { callbackUrl })
    } catch (error: unknown) {
      showSignupError(joinErrorGoogle.value, error, 'google')
      trackSignupFailed('google', 'oauth_start', signupFailureCode(error), acquisitionContext.value)
      loading.value = false
    }
  }

  async function handleStravaLogin() {
    trackSignupStarted('strava', acquisitionContext.value)
    loadingStrava.value = true
    try {
      await signIn('strava', { callbackUrl })
    } catch (error: unknown) {
      showSignupError(joinErrorStrava.value, error, 'strava')
      trackSignupFailed('strava', 'oauth_start', signupFailureCode(error), acquisitionContext.value)
      loadingStrava.value = false
    }
  }

  async function handleIntervalsLogin() {
    trackSignupStarted('intervals', acquisitionContext.value)
    loadingIntervals.value = true
    try {
      await signIn('intervals', { callbackUrl })
    } catch (error: unknown) {
      showSignupError(joinErrorIntervals.value, error, 'intervals')
      trackSignupFailed(
        'intervals',
        'oauth_start',
        signupFailureCode(error),
        acquisitionContext.value
      )
      loadingIntervals.value = false
    }
  }
</script>
