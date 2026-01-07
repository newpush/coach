<template>
  <div class="space-y-8">
    <!-- Hero Section -->
    <div class="text-center space-y-4 py-8">
      <div
        class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-100 dark:bg-primary-900/30 mb-4"
      >
        <UIcon
          name="i-heroicons-rocket-launch"
          class="w-8 h-8 text-primary-600 dark:text-primary-400"
        />
      </div>
      <h1 class="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
        Welcome to Coach Watts
      </h1>
      <p class="max-w-2xl mx-auto text-lg text-gray-600 dark:text-gray-300">
        Your AI-powered endurance coach is ready. Connect your training apps to get personalized
        insights, recovery analysis, and daily recommendations.
      </p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
      <!-- Main Connection Column -->
      <div class="lg:col-span-2 space-y-6">
        <!-- Primary Action: Intervals.icu -->
        <UCard class="border-2 border-primary-500/20 shadow-lg relative overflow-hidden">
          <div class="absolute top-0 right-0 p-4 opacity-10">
            <UIcon name="i-heroicons-chart-bar" class="w-32 h-32" />
          </div>

          <div class="relative z-10">
            <div class="flex items-start gap-4 mb-6">
              <div
                class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
              >
                <img
                  src="/images/logos/intervals.png"
                  alt="Intervals.icu Logo"
                  class="w-8 h-8 object-contain"
                />
              </div>
              <div>
                <h3 class="text-lg font-bold text-gray-900 dark:text-white">
                  Connect Intervals.icu
                </h3>
                <p class="text-gray-600 dark:text-gray-400 mt-1">
                  Required for your athlete profile, power data, and training calendar. This is the
                  core of your AI coach.
                </p>
              </div>
            </div>

            <div class="flex items-center gap-4">
              <UButton
                size="lg"
                color="primary"
                class="font-bold px-8"
                icon="i-heroicons-link"
                @click="signIn('intervals')"
              >
                Connect Now
              </UButton>
              <a
                href="https://intervals.icu"
                target="_blank"
                class="text-sm font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 underline decoration-dotted"
              >
                What is Intervals.icu?
              </a>
            </div>
          </div>
        </UCard>

        <!-- Secondary Connections Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Strava -->
          <UCard
            class="transition-all"
            :class="[
              isStravaDisabled
                ? 'opacity-60 cursor-not-allowed grayscale'
                : 'hover:ring-2 hover:ring-orange-500/20 cursor-pointer'
            ]"
            @click="!isStravaDisabled && navigateTo('/connect-strava')"
          >
            <div class="flex items-center gap-3 mb-3">
              <div
                class="w-8 h-8 bg-white rounded-md flex items-center justify-center overflow-hidden ring-1 ring-gray-200 dark:ring-gray-700"
              >
                <img
                  src="/images/logos/strava.svg"
                  alt="Strava Logo"
                  class="w-5 h-5 object-contain"
                />
              </div>
              <h4 class="font-bold text-gray-900 dark:text-white">Strava</h4>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-4 h-10">
              Import activities, segments, and social training data.
            </p>
            <UTooltip
              :text="
                isStravaDisabled
                  ? 'Strava integration is temporarily unavailable on coachwatts.com'
                  : ''
              "
              :popper="{ placement: 'top' }"
            >
              <UButton
                :to="isStravaDisabled ? undefined : '/connect-strava'"
                variant="soft"
                color="warning"
                size="xs"
                block
                icon="i-heroicons-plus"
                :disabled="isStravaDisabled"
              >
                Connect
              </UButton>
            </UTooltip>
          </UCard>

          <!-- WHOOP -->
          <UCard
            class="hover:ring-2 hover:ring-red-500/20 transition-all cursor-pointer"
            @click="navigateTo('/connect-whoop')"
          >
            <div class="flex items-center gap-3 mb-3">
              <div
                class="w-8 h-8 bg-white rounded-md flex items-center justify-center overflow-hidden ring-1 ring-gray-200 dark:ring-gray-700"
              >
                <img
                  src="/images/logos/whoop_square.svg"
                  alt="WHOOP Logo"
                  class="w-5 h-5 object-contain"
                />
              </div>
              <h4 class="font-bold text-gray-900 dark:text-white">WHOOP</h4>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-4 h-10">
              Sync recovery scores, sleep performance, and HRV trends.
            </p>
            <UButton
              to="/connect-whoop"
              variant="soft"
              color="error"
              size="xs"
              block
              icon="i-heroicons-plus"
            >
              Connect
            </UButton>
          </UCard>

          <!-- Yazio -->
          <UCard
            class="hover:ring-2 hover:ring-green-500/20 transition-all cursor-pointer"
            @click="navigateTo('/connect-yazio')"
          >
            <div class="flex items-center gap-3 mb-3">
              <div
                class="w-8 h-8 bg-white rounded-md flex items-center justify-center overflow-hidden ring-1 ring-gray-200 dark:ring-gray-700"
              >
                <img
                  src="/images/logos/yazio_square.webp"
                  alt="Yazio Logo"
                  class="w-5 h-5 object-contain"
                />
              </div>
              <h4 class="font-bold text-gray-900 dark:text-white">Yazio</h4>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-4 h-10">
              Track nutrition, macros, and hydration for better fueling.
            </p>
            <UButton
              to="/connect-yazio"
              variant="soft"
              color="success"
              size="xs"
              block
              icon="i-heroicons-plus"
            >
              Connect
            </UButton>
          </UCard>
        </div>
      </div>

      <!-- Checklist Column -->
      <div class="lg:col-span-1">
        <UCard class="bg-gray-50 dark:bg-gray-800/50 sticky top-4">
          <template #header>
            <h3 class="font-bold text-sm uppercase tracking-wider text-gray-500">
              Getting Started
            </h3>
          </template>

          <div class="relative pl-2 space-y-6">
            <!-- Vertical Line -->
            <div class="absolute left-[15px] top-2 bottom-2 w-0.5 bg-gray-200 dark:bg-gray-700" />

            <!-- Step 1: Account Created -->
            <div class="relative flex items-start gap-4">
              <div
                class="relative z-10 w-7 h-7 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center border-2 border-white dark:border-gray-900"
              >
                <UIcon
                  name="i-heroicons-check"
                  class="w-4 h-4 text-green-600 dark:text-green-400"
                />
              </div>
              <div>
                <p class="font-bold text-sm text-gray-900 dark:text-white">Account Ready</p>
                <p class="text-xs text-gray-500">Welcome to the team!</p>
              </div>
            </div>

            <!-- Step 2: Connect Intervals -->
            <div class="relative flex items-start gap-4">
              <div
                class="relative z-10 w-7 h-7 rounded-full bg-white dark:bg-gray-800 border-2 border-primary-500 flex items-center justify-center animate-pulse"
              >
                <div class="w-2.5 h-2.5 rounded-full bg-primary-500" />
              </div>
              <div>
                <p class="font-bold text-sm text-gray-900 dark:text-white">Connect Data</p>
                <p class="text-xs text-gray-500">Link Intervals.icu to start</p>
              </div>
            </div>

            <!-- Step 3: Analysis -->
            <div class="relative flex items-start gap-4 opacity-50">
              <div
                class="relative z-10 w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center"
              >
                <span class="text-[10px] font-bold text-gray-500">3</span>
              </div>
              <div>
                <p class="font-bold text-sm text-gray-900 dark:text-white">AI Analysis</p>
                <p class="text-xs text-gray-500">Processing your history</p>
              </div>
            </div>

            <!-- Step 4: First Report -->
            <div class="relative flex items-start gap-4 opacity-50">
              <div
                class="relative z-10 w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center"
              >
                <span class="text-[10px] font-bold text-gray-500">4</span>
              </div>
              <div>
                <p class="font-bold text-sm text-gray-900 dark:text-white">First Report</p>
                <p class="text-xs text-gray-500">Get your baseline insights</p>
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  const { signIn } = useAuth()

  const isStravaDisabled = computed(() => {
    if (import.meta.server) return false
    return window.location.hostname === 'coachwatts.com'
  })
</script>
