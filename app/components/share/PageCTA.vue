<template>
  <div
    class="py-16 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 border-t border-gray-200 dark:border-gray-700 relative overflow-hidden"
  >
    <!-- Decorative background elements -->
    <div
      class="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl pointer-events-none opacity-50 dark:opacity-20"
    >
      <div
        class="absolute top-[-10%] right-[-10%] w-96 h-96 bg-primary-500/10 rounded-full blur-3xl"
      />
      <div
        class="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"
      />
    </div>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
      <h2 class="text-3xl font-extrabold text-gray-900 dark:text-white sm:text-4xl tracking-tight">
        <span class="block">Ready to reach your peak?</span>
        <span
          class="block mt-1 bg-clip-text text-transparent bg-gradient-to-r from-primary-600 to-blue-600 dark:from-primary-400 dark:to-blue-400"
        >
          Train smarter with AI coaching.
        </span>
      </h2>
      <p class="mt-6 text-lg leading-8 text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
        Join hundreds of endurance athletes using Coach Wattz to unlock personalized insights,
        optimize recovery, and crush their goals.
      </p>

      <div class="mt-10 flex flex-col sm:flex-row justify-center gap-4">
        <UButton
          to="/"
          size="xl"
          color="primary"
          variant="solid"
          icon="i-heroicons-rocket-launch"
          class="font-bold shadow-lg shadow-primary-500/20"
        >
          Get Started for Free
        </UButton>
        <UButton
          to="https://coachwatts.com"
          target="_blank"
          size="xl"
          color="neutral"
          variant="ghost"
          icon="i-heroicons-arrow-right-circle"
          class="font-semibold"
        >
          See How It Works
        </UButton>
      </div>

      <p class="mt-6 text-sm text-gray-500 dark:text-gray-400">
        No credit card required. Free forever plan available.
      </p>
    </div>
  </div>
</template>
