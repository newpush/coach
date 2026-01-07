<template>
  <div class="bg-white dark:bg-gray-900 py-24 sm:py-32">
    <div class="mx-auto max-w-3xl px-6 lg:px-8">
      <div class="mx-auto max-w-2xl text-center">
        <h2 class="text-base font-semibold leading-7 text-primary-600 dark:text-primary-400">
          Legal
        </h2>
        <p class="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
          Terms of Service
        </p>
      </div>

      <div class="mt-16 space-y-8 text-base leading-7 text-gray-600 dark:text-gray-300">
        <div>
          <h3 class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
            1. Introduction
          </h3>
          <p>
            Welcome to Coach Watts. By accessing or using our website and services, you agree to be
            bound by these Terms of Service.
          </p>
        </div>

        <div>
          <h3 class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
            2. Medical Disclaimer
          </h3>
          <p>
            Coach Watts is an AI-powered coaching tool, not a doctor. The training advice, recovery
            analysis, and health insights provided are for informational purposes only. Always
            consult a physician before starting any new exercise program.
          </p>
        </div>

        <div>
          <h3 class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
            3. Data Usage
          </h3>
          <p>
            By connecting third-party accounts (Strava, Whoop, etc.), you grant us permission to
            analyze this data to generate coaching insights. We do not sell your personal data to
            third parties.
          </p>
        </div>

        <div>
          <h3 class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
            4. Accessibility
          </h3>
          <p>
            Coach Watts is designed to be accessible to everyone. We are committed to transparency
            in our algorithms and data processing.
          </p>
        </div>

        <div class="pt-8 border-t border-gray-200 dark:border-gray-800">
          <p class="text-sm">Last updated: December 2025</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  definePageMeta({
    layout: 'home',
    auth: false
  })

  useHead({
    title: 'Terms of Service',
    meta: [
      {
        name: 'description',
        content:
          'Coach Watts Terms of Service. Read about our user agreement, data usage, and disclaimers.'
      }
    ]
  })
</script>
