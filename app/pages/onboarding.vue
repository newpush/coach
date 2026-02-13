<template>
  <div>
    <div class="mb-10 text-center">
      <div class="flex justify-center mb-8">
        <img
          src="/media/logo_with_text_cropped.webp"
          alt="Coach Watts Logo"
          class="w-full max-h-60 object-contain"
        />
      </div>

      <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-3">
        Welcome to the Future of Training
      </h1>
      <p class="text-gray-500 dark:text-gray-400 text-lg max-w-sm mx-auto">
        You're just a few clicks away from AI-powered coaching insights. Let's get your account set
        up for success.
      </p>
    </div>

    <form class="space-y-6" @submit.prevent="submitConsent">
      <div class="space-y-4">
        <!-- Terms Checkbox Card -->
        <div
          class="relative flex items-start p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer group"
          :class="
            acceptedTerms
              ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-900/10'
              : 'border-gray-200 dark:border-gray-700 hover:border-primary-200 dark:hover:border-primary-800'
          "
          @click="acceptedTerms = !acceptedTerms"
        >
          <div class="flex h-6 items-center" @click.stop>
            <UCheckbox v-model="acceptedTerms" name="terms" />
          </div>
          <div class="ml-3 text-sm leading-6">
            <label
              class="font-medium text-gray-900 dark:text-white cursor-pointer group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors"
            >
              Accept Legal Terms
            </label>
            <p class="text-gray-500 dark:text-gray-400 mt-1">
              I agree to the
              <a
                href="/terms"
                target="_blank"
                class="text-primary-600 hover:text-primary-500 font-semibold underline decoration-dotted decoration-primary-500/50 underline-offset-4"
                @click.stop
                >Terms of Service</a
              >
              and
              <a
                href="/privacy"
                target="_blank"
                class="text-primary-600 hover:text-primary-500 font-semibold underline decoration-dotted decoration-primary-500/50 underline-offset-4"
                @click.stop
                >Privacy Policy</a
              >.
            </p>
          </div>
        </div>

        <!-- Health Consent Checkbox Card -->
        <div
          class="relative flex items-start p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer group"
          :class="
            acceptedHealth
              ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-900/10'
              : 'border-gray-200 dark:border-gray-700 hover:border-primary-200 dark:hover:border-primary-800'
          "
          @click="acceptedHealth = !acceptedHealth"
        >
          <div class="flex h-6 items-center" @click.stop>
            <UCheckbox v-model="acceptedHealth" name="health" />
          </div>
          <div class="ml-3 text-sm leading-6">
            <label
              class="font-medium text-gray-900 dark:text-white cursor-pointer group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors"
            >
              Enable Health Insights
            </label>
            <p class="text-gray-500 dark:text-gray-400 mt-1">
              I explicitly consent to the processing of my health and biometric data (HR, power,
              location) to generate personalized AI coaching.
            </p>
          </div>
        </div>
      </div>

      <UButton
        type="submit"
        block
        size="xl"
        :color="isValid ? 'primary' : 'neutral'"
        :variant="isValid ? 'solid' : 'soft'"
        :disabled="!isValid"
        :loading="loading"
        class="shadow-sm transition-all py-4 font-bold rounded-xl"
      >
        {{ isValid ? "Let's Go! 🚀" : 'Accept & Continue' }}
      </UButton>
    </form>
  </div>
</template>

<script setup lang="ts">
  definePageMeta({
    layout: 'simple',
    middleware: 'auth' // Ensure user is logged in (but specific onboarding middleware handles the redirection logic)
  })

  useHead({
    title: 'Welcome',
    meta: [{ name: 'robots', content: 'noindex' }]
  })

  const { data: session, refresh } = useAuth()
  const acceptedTerms = ref(false)
  const acceptedHealth = ref(false)
  const loading = ref(false)

  const isValid = computed(() => acceptedTerms.value && acceptedHealth.value)

  // Constants for policy versions
  const TOS_VERSION = '1.0' // TODO: Move to a shared config if needed
  const PRIVACY_VERSION = '1.0'

  async function submitConsent() {
    if (!isValid.value) return

    loading.value = true
    try {
      await $fetch('/api/user/consent', {
        method: 'POST',
        body: {
          termsVersion: TOS_VERSION,
          privacyPolicyVersion: PRIVACY_VERSION
        }
      })

      // Refresh session to update termsAcceptedAt locally if possible,
      // though usually a page reload or full session refresh is needed.
      // For now, we rely on the redirect to work.
      // Force a session reload might be tricky without a plugin,
      // but the next navigation check should ideally query the updated state or allow through based on the client-side knowledge.

      // Simplest approach: Update session manually if the library allows, or just redirect.
      // Since our middleware checks the session, we might need to reload the page or trigger a session refetch.
      await refresh()

      navigateTo('/dashboard')
    } catch (error) {
      console.error('Failed to save consent:', error)
      // You might want to show a toast notification here
    } finally {
      loading.value = false
    }
  }
</script>
