<template>
  <div id="pricing" class="py-24 sm:py-32 bg-gray-50 dark:bg-gray-900">
    <div class="mx-auto max-w-7xl px-6 lg:px-8">
      <div class="mx-auto max-w-2xl sm:text-center mb-16">
        <h2
          class="text-base font-semibold leading-7 text-primary-600 dark:text-primary-400 font-mono"
        >
          PRICING
        </h2>
        <p class="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
          Plans for Every Athlete
        </p>
        <p class="mt-6 text-lg leading-8 text-gray-600 dark:text-gray-300">
          From casual tracking to professional AI coaching. Start free and upgrade as you grow.
        </p>
      </div>

      <div v-if="subscriptionsEnabled">
        <LandingPricingPlans />

        <div class="mx-auto mt-16 max-w-2xl lg:text-center">
          <p class="text-sm text-gray-500">
            All plans include a 14-day money-back guarantee. No credit card required for the free
            plan.
          </p>
        </div>
      </div>
      <div v-else class="max-w-2xl mx-auto">
        <UAlert
          icon="i-heroicons-information-circle"
          color="info"
          variant="soft"
          title="Subscriptions Temporarily Unavailable"
          description="We are currently performing maintenance on our subscription system. New subscriptions are temporarily disabled, but existing subscriptions remain active and functional. Please check back soon!"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  const config = useRuntimeConfig()
  const subscriptionsEnabled = computed(() => config.public.subscriptionsEnabled)
</script>
