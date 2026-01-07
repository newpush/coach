<template>
  <div id="how-it-works" class="py-24 sm:py-32 bg-gray-900 relative overflow-hidden">
    <!-- Matrix Background Effect -->
    <div
      class="absolute inset-0 opacity-5 bg-[url('https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbm95MXY4Z3Y0Z3Y0Z3Y0Z3Y0Z3Y0Z3Y0Z3Y0Z3Y0Z3Y0Z3Y0/U3qYN8S0j3bpK/giphy.gif')] bg-cover mix-blend-screen pointer-events-none"
    />

    <div class="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
      <div class="mx-auto max-w-2xl text-center">
        <h2 class="text-base font-semibold leading-7 text-primary-400 font-mono">THE PROCESS</h2>
        <p class="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          From Raw Data to Gold Medal Strategy
        </p>
        <p class="mt-6 text-lg leading-8 text-gray-400">
          We don't just show you charts. We ingest your entire digital physiology, analyze the
          hidden patterns, and build a coaching strategy unique to you.
        </p>
      </div>

      <div class="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
        <dl class="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-4">
          <!-- Step 1: Ingest -->
          <div class="flex flex-col relative group">
            <div
              class="mb-6 flex h-14 w-14 items-center justify-center rounded-lg bg-gray-800 ring-1 ring-gray-700 group-hover:bg-primary-500/10 group-hover:ring-primary-500 transition-all duration-300"
            >
              <UIcon
                name="i-heroicons-arrow-down-tray"
                class="h-6 w-6 text-white group-hover:text-primary-400"
              />
            </div>
            <dt class="flex items-center gap-x-3 text-base font-semibold leading-7 text-white">
              <span class="font-mono text-primary-500">01_</span>
              Connect
            </dt>
            <dd class="mt-4 flex flex-auto flex-col text-base leading-7 text-gray-400">
              <p class="flex-auto">
                Connect your favorite training and recovery apps. We pull data from Strava, Whoop,
                Garmin, and more to create a single source of truth.
              </p>

              <!-- Visual Hint -->
              <div class="mt-6 flex -space-x-2 overflow-hidden">
                <div class="inline-block h-6 w-6 rounded-full bg-orange-500 ring-2 ring-gray-900" />
                <!-- Strava color -->
                <div
                  class="inline-block h-6 w-6 rounded-full bg-black ring-2 ring-gray-900 border border-white/20"
                />
                <!-- Whoop color -->
                <div class="inline-block h-6 w-6 rounded-full bg-blue-500 ring-2 ring-gray-900" />
                <!-- Icons for more -->
                <div
                  class="inline-block h-6 w-6 rounded-full bg-gray-700 ring-2 ring-gray-900 flex items-center justify-center text-[10px] text-white font-bold"
                >
                  +
                </div>
              </div>
            </dd>

            <!-- Connector Line (Desktop) -->
            <div
              class="hidden lg:block absolute top-7 left-14 w-[calc(100%-3.5rem)] h-px bg-gradient-to-r from-gray-800 to-transparent group-hover:from-primary-500/50 transition-all duration-500"
            />
          </div>

          <!-- Step 2: Analyze -->
          <div class="flex flex-col relative group">
            <div
              class="mb-6 flex h-14 w-14 items-center justify-center rounded-lg bg-gray-800 ring-1 ring-gray-700 group-hover:bg-primary-500/10 group-hover:ring-primary-500 transition-all duration-300"
            >
              <UIcon
                name="i-heroicons-cpu-chip"
                class="h-6 w-6 text-white group-hover:text-primary-400"
              />
            </div>
            <dt class="flex items-center gap-x-3 text-base font-semibold leading-7 text-white">
              <span class="font-mono text-primary-500">02_</span>
              Analyze
            </dt>
            <dd class="mt-4 flex flex-auto flex-col text-base leading-7 text-gray-400">
              <p class="flex-auto">
                Our AI analyzes every session to find hidden fatigue and recovery trends that
                standard charts miss.
              </p>
              <div class="mt-4 flex items-center gap-2">
                <span class="relative flex h-3 w-3">
                  <span
                    class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"
                  />
                  <span class="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                </span>
                <span
                  class="px-2 py-1 rounded bg-red-500/10 text-red-400 text-xs font-mono border border-red-500/20"
                  >Status: Deep Fatigue Detected</span
                >
              </div>
            </dd>
            <!-- Connector Line -->
            <div
              class="hidden lg:block absolute top-7 left-14 w-[calc(100%-3.5rem)] h-px bg-gradient-to-r from-gray-800 to-transparent group-hover:from-primary-500/50 transition-all duration-500"
            />
          </div>

          <!-- Step 3: Profile -->
          <div class="flex flex-col relative group">
            <div
              class="mb-6 flex h-14 w-14 items-center justify-center rounded-lg bg-gray-800 ring-1 ring-gray-700 group-hover:bg-primary-500/10 group-hover:ring-primary-500 transition-all duration-300"
            >
              <UIcon
                name="i-heroicons-user-circle"
                class="h-6 w-6 text-white group-hover:text-primary-400"
              />
            </div>
            <dt class="flex items-center gap-x-3 text-base font-semibold leading-7 text-white">
              <span class="font-mono text-primary-500">03_</span>
              Profile
            </dt>
            <dd class="mt-4 flex flex-auto flex-col text-base leading-7 text-gray-400">
              <p class="flex-auto">
                Your Digital Twin evolves daily. Instead of just numbers, we track your readiness to
                perform.
              </p>
              <!-- Score Hint -->
              <div class="mt-4 flex gap-2">
                <span
                  class="px-2 py-0.5 rounded bg-green-500/20 text-green-400 text-xs font-bold border border-green-500/30"
                  >FITNESS: PEAKING</span
                >
                <span
                  class="px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 text-xs font-bold border border-yellow-500/30"
                  >RECOVERY: BALANCED</span
                >
              </div>
            </dd>
            <!-- Connector Line -->
            <div
              class="hidden lg:block absolute top-7 left-14 w-[calc(100%-3.5rem)] h-px bg-gradient-to-r from-gray-800 to-transparent group-hover:from-primary-500/50 transition-all duration-500"
            />
          </div>

          <!-- Step 4: Coach -->
          <div class="flex flex-col relative group">
            <div
              class="mb-6 flex h-14 w-14 items-center justify-center rounded-lg bg-gray-800 ring-1 ring-gray-700 group-hover:bg-primary-500/10 group-hover:ring-primary-500 transition-all duration-300"
            >
              <UIcon
                name="i-heroicons-chat-bubble-bottom-center-text"
                class="h-6 w-6 text-white group-hover:text-primary-400"
              />
            </div>
            <dt class="flex items-center gap-x-3 text-base font-semibold leading-7 text-white">
              <span class="font-mono text-primary-500">04_</span>
              Coach
            </dt>
            <dd class="mt-4 flex flex-auto flex-col text-base leading-7 text-gray-400">
              <p class="flex-auto">
                Receive actionable, daily advice. "Your recovery is low (33%). Let's swap today's
                intervals for Zone 2."
              </p>

              <div
                class="mt-4 p-3 bg-gray-800 rounded-lg border-l-2 border-primary-500 text-xs text-gray-300 italic flex gap-3 items-center"
              >
                <UIcon name="i-heroicons-cpu-chip" class="w-5 h-5 text-primary-500 shrink-0" />
                <span>"Swap intervals for 60min Z2 today."</span>
              </div>
            </dd>
          </div>
        </dl>
      </div>
    </div>
  </div>
</template>
