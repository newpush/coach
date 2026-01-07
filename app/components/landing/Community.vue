<template>
  <div class="bg-gray-900 py-24 sm:py-32 relative overflow-hidden">
    <!-- Background Gradient -->
    <div class="absolute inset-0 bg-gradient-to-br from-primary-900/20 to-gray-900 z-0" />

    <div class="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
      <div class="mx-auto max-w-2xl text-center">
        <h2 class="text-base font-semibold leading-7 text-primary-400 font-mono">COMMUNITY</h2>
        <p class="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Trusted by Athletes
        </p>
        <p class="mt-6 text-lg leading-8 text-gray-300">
          We're building more than just code. We're building a community of data-driven endurance
          athletes.
        </p>
      </div>

      <div
        class="mx-auto mt-16 grid max-w-2xl grid-cols-1 grid-rows-1 gap-8 text-sm leading-6 text-gray-300 sm:mt-20 sm:grid-cols-2 xl:mx-0 xl:max-w-none xl:grid-flow-col xl:grid-cols-4"
      >
        <!-- Testimonial 1 -->
        <figure class="rounded-2xl bg-gray-800 p-6 shadow-lg ring-1 ring-gray-700">
          <blockquote class="text-gray-300">
            <p>
              "I finally broke the 4 W/kg barrier after years of stagnation. The AI insights
              identified exactly where I was overtraining."
            </p>
          </blockquote>
          <figcaption class="mt-6 flex items-center gap-x-4">
            <UAvatar alt="Sarah J" class="bg-primary/20 text-primary" size="sm" />
            <div>
              <div class="font-semibold text-white">Sarah Jenkins</div>
              <div class="text-gray-500">Cat 2 Racer</div>
            </div>
          </figcaption>
        </figure>

        <!-- Testimonial 2 -->
        <figure class="rounded-2xl bg-gray-800 p-6 shadow-lg ring-1 ring-gray-700 xl:col-span-2">
          <blockquote class="text-gray-300">
            <p>
              "The adaptive planning saved my season when work got crazy. It automatically adjusted
              my week so I didn't burn out. It's like having a pro coach in my pocket, but one that
              actually understands I have a job."
            </p>
          </blockquote>
          <figcaption class="mt-6 flex items-center gap-x-4">
            <UAvatar alt="Mike C" class="bg-blue-500/20 text-blue-500" size="sm" />
            <div>
              <div class="font-semibold text-white">Mike Chen</div>
              <div class="text-gray-500">Gravel Cyclist</div>
            </div>
          </figcaption>
        </figure>

        <!-- Testimonial 3 -->
        <figure class="rounded-2xl bg-gray-800 p-6 shadow-lg ring-1 ring-gray-700">
          <blockquote class="text-gray-300">
            <p>
              "Transparency means I can trust the algorithms. No black boxes, just pure data science
              applied to my physiology."
            </p>
          </blockquote>
          <figcaption class="mt-6 flex items-center gap-x-4">
            <UAvatar alt="David R" class="bg-yellow-500/20 text-yellow-500" size="sm" />
            <div>
              <div class="font-semibold text-white">David Ross</div>
              <div class="text-gray-500">Triathlete</div>
            </div>
          </figcaption>
        </figure>
      </div>

      <!-- Community CTA -->
      <div class="mt-16 flex justify-center">
        <div
          class="relative rounded-full px-3 py-1 text-sm leading-6 text-gray-400 ring-1 ring-gray-700 hover:ring-gray-500"
        >
          Join the conversation on
          <a href="#" class="font-semibold text-primary-400"
            ><span class="absolute inset-0" aria-hidden="true" />Discord
            <span aria-hidden="true">&rarr;</span></a
          >
        </div>
      </div>
    </div>
  </div>
</template>
