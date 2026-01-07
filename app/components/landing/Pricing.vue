<template>
  <div id="pricing" class="py-24 sm:py-32 bg-gray-50 dark:bg-gray-900">
    <div class="mx-auto max-w-7xl px-6 lg:px-8">
      <div class="mx-auto max-w-2xl sm:text-center">
        <h2
          class="text-base font-semibold leading-7 text-primary-600 dark:text-primary-400 font-mono"
        >
          PRICING
        </h2>
        <p class="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
          Free for Early Adopters
        </p>
        <p class="mt-6 text-lg leading-8 text-gray-600 dark:text-gray-300">
          We're currently in early access. All features are free while we build the future of AI
          coaching.
        </p>
      </div>
      <div
        class="mx-auto mt-16 max-w-2xl rounded-3xl ring-1 ring-gray-200 dark:ring-gray-700 sm:mt-20 lg:mx-0 lg:flex lg:max-w-none"
      >
        <div class="p-8 sm:p-10 lg:flex-auto">
          <h3 class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Pro Athlete
          </h3>
          <p class="mt-6 text-base leading-7 text-gray-600 dark:text-gray-300">
            Advanced AI insights for serious performance. Early users get full access to all
            features and will be rewarded with special legacy benefits.
          </p>
          <div class="mt-10 flex items-center gap-x-4">
            <h4
              class="flex-none text-sm font-semibold leading-6 text-primary-600 dark:text-primary-400"
            >
              What's included
            </h4>
            <div class="h-px flex-auto bg-gray-100 dark:bg-gray-700" />
          </div>
          <ul
            role="list"
            class="mt-8 grid grid-cols-1 gap-4 text-sm leading-6 text-gray-600 dark:text-gray-300 sm:grid-cols-2 sm:gap-6"
          >
            <li v-for="feature in includedFeatures" :key="feature" class="flex gap-x-3">
              <UIcon
                name="i-heroicons-check"
                class="h-6 w-5 flex-none text-primary-600 dark:text-primary-400"
                aria-hidden="true"
              />
              {{ feature }}
            </li>
          </ul>
        </div>
        <div class="-mt-2 p-2 lg:mt-0 lg:w-full lg:max-w-md lg:flex-shrink-0">
          <div
            class="rounded-2xl bg-gray-50 dark:bg-gray-800 py-10 text-center ring-1 ring-inset ring-gray-900/5 dark:ring-white/10 lg:flex lg:flex-col lg:justify-center lg:py-16"
          >
            <div class="mx-auto max-w-xs px-8">
              <p class="text-base font-semibold text-gray-600 dark:text-gray-400">Early Access</p>
              <p class="mt-6 flex items-baseline justify-center gap-x-2">
                <span class="text-5xl font-bold tracking-tight text-gray-900 dark:text-white"
                  >FREE</span
                >
              </p>
              <UButton to="/login" block size="xl" color="primary" class="mt-10">
                Join Early Access
              </UButton>
              <p class="mt-6 text-xs leading-5 text-gray-600 dark:text-gray-400">
                Free for early adopters. Early users will be greatly rewarded with special perks as
                we grow.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Free Tier Card (Smaller) -->
      <div class="mx-auto mt-10 max-w-2xl lg:text-center">
        <p class="text-sm text-gray-500">
          There will
          <span class="font-bold text-gray-900 dark:text-white">always be a free plan</span> for
          basic analytics and training tracking.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  const includedFeatures = [
    'Daily Workouts Tuned to Your Recovery',
    'Advanced Performance Metrics',
    'Unlimited Device Sync',
    'Priority Support',
    'Training Plan Builder',
    'Gold-Medal Race Capability'
  ]
</script>
