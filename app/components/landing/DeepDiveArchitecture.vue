<template>
  <div id="architecture" class="bg-gray-900 py-24 sm:py-32 border-t border-gray-800">
    <div class="mx-auto max-w-7xl px-6 lg:px-8">

      <!-- Section Header -->
      <div class="mx-auto max-w-2xl text-center mb-16">
        <h2 class="text-base font-semibold leading-7 text-primary-400 font-mono">STATE OF THE ART</h2>
        <p class="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">The Brain Behind the Performance</p>
        <p class="mt-6 text-lg leading-8 text-gray-300">
          We don't just count steps. Coach Watts uses a multi-layered AI pipeline to construct a "Digital Twin" of your
          physiology.
        </p>
      </div>

      <div class="grid grid-cols-1 gap-16 lg:grid-cols-2 lg:gap-8 items-start">

        <!-- Left: Text Explanation -->
        <div class="lg:pr-8 lg:pt-4">
          <div class="lg:max-w-lg">
            <h3 class="text-2xl font-bold tracking-tight text-white">Context is King.</h3>
            <p class="mt-4 text-base leading-7 text-gray-300">
              Most platforms analyze a workout in isolation. Coach Watts analyzes it in the context of your entire
              history, your nutrition, and your recovery.
            </p>
            <dl class="mt-10 max-w-xl space-y-8 text-base leading-7 text-gray-300 lg:max-w-none">

              <div class="relative pl-9">
                <dt class="inline font-semibold text-white">
                  <UIcon name="i-heroicons-arrow-down-tray" class="absolute left-1 top-1 h-5 w-5 text-primary-500" />
                  Unified Data View
                </dt>
                <dd class="inline">
                  We unite data from Strava, Whoop, and Intervals.icu into a single, comprehensive view. This solves the
                  "fragmented data" problem.
                </dd>
              </div>

              <div class="relative pl-9">
                <dt class="inline font-semibold text-white">
                  <UIcon name="i-heroicons-cpu-chip" class="absolute left-1 top-1 h-5 w-5 text-primary-500" />
                  Smart Workout Analysis
                </dt>
                <dd class="inline">
                  Every new workout is analyzed by our AI Coach to extract qualitative insights (e.g., "The athlete
                  struggled with power in the third interval due to potential fatigue").
                </dd>
              </div>

              <div class="relative pl-9">
                <dt class="inline font-semibold text-white">
                  <UIcon name="i-heroicons-user-circle" class="absolute left-1 top-1 h-5 w-5 text-primary-500" />
                  Your Digital Twin
                </dt>
                <dd class="inline">
                  These event insights feed into a persistent "Athlete Profile." This living profile evolves daily,
                  tracking fatigue resistance, recovery patterns, and mental resilience.
                </dd>
              </div>

              <div class="relative pl-9">
                <dt class="inline font-semibold text-white">
                  <UIcon name="i-heroicons-chat-bubble-bottom-center-text"
                    class="absolute left-1 top-1 h-5 w-5 text-primary-500" />
                  4. Holistic Coaching
                </dt>
                <dd class="inline">
                  When the Daily Coach runs, it reads the <i>Athlete Profile</i>, not just the raw data. This allows it
                  to say "Your recovery is low, and <i>historically you get sick when training in this state</i>" rather
                  than just "HRV is low."
                </dd>
              </div>

            </dl>
          </div>
        </div>

        <!-- Right: Visualization -->
        <div class="relative pt-8">
          <div class="rounded-xl bg-gray-800 border border-gray-700 p-8 shadow-2xl">
            <!-- Schematic Visualization -->
            <div class="space-y-4">

              <!-- Input Layer -->
              <div class="flex gap-2 justify-center">
                <div class="px-3 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-gray-400">Strava</div>
                <div class="px-3 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-gray-400">Whoop</div>
                <div class="px-3 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-gray-400">Yazio</div>
              </div>

              <div class="h-8 flex justify-center">
                <div class="w-px bg-gray-600"></div>
              </div>

              <!-- Ingestion Engine -->
              <div class="p-4 bg-gray-900 border border-primary-500/30 rounded-lg text-center">
                <div class="text-primary-400 font-mono text-sm mb-1">DATA ENGINE</div>
                <div class="text-xs text-gray-500">Unification & Security</div>
              </div>

              <div class="h-8 flex justify-center">
                <div class="w-px bg-gray-600"></div>
              </div>

              <!-- Analysis Layer -->
              <div class="grid grid-cols-2 gap-4">
                <div class="p-3 bg-gray-900 border border-gray-700 rounded text-center">
                  <div class="text-gray-300 font-mono text-xs">WORKOUT ANALYSIS</div>
                </div>
                <div class="p-3 bg-gray-900 border border-gray-700 rounded text-center">
                  <div class="text-gray-300 font-mono text-xs">NUTRITION ANALYSIS</div>
                </div>
              </div>

              <div class="h-8 flex justify-center text-gray-600 text-xs">Updating State...</div>

              <!-- The Digital Twin -->
              <div
                class="p-6 bg-gradient-to-b from-gray-800 to-gray-900 border-2 border-primary-500 rounded-xl text-center relative overflow-hidden">
                <div class="absolute inset-0 bg-primary-500/5"></div>
                <div class="relative z-10">
                  <UIcon name="i-heroicons-user" class="w-12 h-12 text-primary-500 mx-auto mb-2" />
                  <div class="text-white font-bold text-lg">DIGITAL ATHLETE TWIN</div>
                  <div class="text-xs text-gray-400 mt-2 space-y-1">
                    <p>Fitness: 8.5/10</p>
                    <p>Fatigue: High</p>
                    <p>Trend: Peaking</p>
                  </div>
                </div>
              </div>

              <div class="h-8 flex justify-center">
                <div class="w-px bg-gray-600"></div>
              </div>

              <!-- Output -->
              <div class="p-4 bg-white/5 border border-white/10 rounded-lg">
                <div class="flex gap-3">
                  <div class="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center flex-shrink-0">
                    <UIcon name="i-heroicons-chat-bubble-left" class="text-white w-5 h-5" />
                  </div>
                  <div class="text-sm text-gray-300">
                    "Based on your profile, you respond best to rest when HRV drops below 40ms. Let's take today off."
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>