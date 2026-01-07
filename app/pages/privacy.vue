<template>
  <div class="bg-white dark:bg-gray-900 py-24 sm:py-32">
    <div class="mx-auto max-w-3xl px-6 lg:px-8">
      <div class="mx-auto max-w-2xl text-center">
        <h2 class="text-base font-semibold leading-7 text-primary-600 dark:text-primary-400">
          Legal
        </h2>
        <p class="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
          Privacy Policy
        </p>
      </div>

      <div class="mt-16 space-y-8 text-base leading-7 text-gray-600 dark:text-gray-300">
        <div>
          <h3 class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
            1. Data Privacy Philosophy
          </h3>
          <p>
            We believe your health data is sensitive and private. Our architecture is designed to
            process data securely. We do not use your personal training data to train public AI
            models.
          </p>
        </div>

        <div>
          <h3 class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
            2. Information We Collect
          </h3>
          <ul class="list-disc pl-5 space-y-2 mt-2">
            <li><strong>Profile Data:</strong> Name, email, and preferences.</li>
            <li>
              <strong>Fitness Data:</strong> Workouts, heart rate, power data, and GPS tracks synced
              from connected services (Strava, Intervals.icu).
            </li>
            <li>
              <strong>Health Data:</strong> Sleep, HRV, and recovery metrics synced from connected
              services (Whoop, Oura, etc).
            </li>
          </ul>
        </div>

        <div>
          <h3 class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
            3. How We Use Your Data
          </h3>
          <p>Your data is used exclusively to:</p>
          <ul class="list-disc pl-5 space-y-2 mt-2">
            <li>Generate personalized coaching insights and training plans.</li>
            <li>Calculate performance metrics (FTP, fatigue, fitness).</li>
            <li>Provide LLM-based chat responses tailored to your history.</li>
          </ul>
        </div>

        <div>
          <h3 class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
            4. Data Security
          </h3>
          <p>
            We employ industry-standard encryption for data in transit and at rest. Access to your
            data is restricted to the automated systems required to provide the service.
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
    title: 'Privacy Policy',
    meta: [
      {
        name: 'description',
        content:
          'Coach Watts Privacy Policy. How we collect, use, and protect your personal training data.'
      }
    ]
  })
</script>
