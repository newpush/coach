<template>
  <div class="bg-gray-900 min-h-screen">
    <LandingHero />
    <LandingHowItWorks />
    <LandingDeepDiveArchitecture />
    <LandingFeatureBento />
    <LandingFeatureGoals />
    <LandingCommunity />
    <LandingPricing />

    <!-- CTA Final -->
    <div class="relative isolate overflow-hidden bg-gray-900 px-6 py-24 sm:py-32 lg:px-8">
      <div class="mx-auto max-w-2xl text-center">
        <h2 class="text-3xl font-bold tracking-tight text-white sm:text-4xl">Ready to reach your peak?</h2>
        <p class="mx-auto mt-6 max-w-xl text-lg leading-8 text-gray-300">
          Join hundreds of endurance athletes using Coach Watts to train smarter every day.
        </p>
        <div class="mt-10 flex items-center justify-center gap-x-6">
          <UButton size="xl" to="/login" color="primary">Get Started for Free</UButton>
          <UButton size="xl" to="/stories" color="neutral" variant="ghost">Read Success Stories <span
              aria-hidden="true">→</span></UButton>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <footer class="bg-gray-900 py-12 border-t border-gray-800">
      <div class="mx-auto max-w-7xl px-6 lg:px-8">
        <div class="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <p class="text-sm text-gray-400">
            &copy; 2025 Coach Watts. All rights reserved.
          </p>
          <div class="flex gap-6">
            <a href="#" class="text-sm text-gray-400 hover:text-white">Discord</a>
            <a href="#" class="text-sm text-gray-400 hover:text-white">Docs</a>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
const { status } = useAuth()

definePageMeta({
  layout: 'home',
  auth: false
})

// Only redirect if authenticated, otherwise stay on landing page
watchEffect(() => {
  if (status.value === 'authenticated') {
    navigateTo('/dashboard')
  }
})
</script>