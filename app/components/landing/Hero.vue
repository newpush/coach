<template>
  <div class="relative isolate overflow-hidden">
    <div class="mx-auto max-w-7xl px-6 pb-24 pt-10 sm:pb-32 lg:flex lg:px-8 lg:py-40">
      <div class="mx-auto max-w-2xl lg:mx-0 lg:max-w-xl lg:flex-shrink-0 lg:pt-8">
        <div class="mt-24 sm:mt-32 lg:mt-16">
          <NuxtLink to="#architecture" class="inline-flex space-x-6">
            <span class="rounded-full bg-primary-500/10 px-3 py-1 text-sm font-semibold leading-6 text-primary-400 ring-1 ring-inset ring-primary-500/20">Accessible</span>
            <span class="inline-flex items-center space-x-2 text-sm font-medium leading-6 text-gray-300">
              <span>View the Architecture</span>
              <UIcon name="i-heroicons-chevron-right" class="h-5 w-5 text-gray-500" />
            </span>
          </NuxtLink>
        </div>
        <h1 class="mt-10 text-4xl font-bold tracking-tight text-white sm:text-6xl font-mono">
          Elite Coaching. <br />
          <span class="text-primary-500">For Everyone.</span>
        </h1>
        <p class="mt-6 text-lg leading-8 text-gray-300">
          The first AI Endurance Coach built by cybersecurity experts. Secure, data-driven, and completely free. Turn your fitness data into a gold medal strategy.
        </p>
        <div class="mt-10 flex items-center gap-x-6">
          <UButton
            to="/login"
            size="xl"
            color="primary"
            variant="solid"
            class="px-8 py-3 text-base font-semibold shadow-sm hover:bg-primary-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400"
          >
            Start Training - Free
          </UButton>
          <UButton
            to="#how-it-works"
            size="xl"
            color="neutral"
            variant="ghost"
            class="text-sm font-semibold leading-6 text-white"
          >
            See How It Works <span aria-hidden="true">→</span>
          </UButton>
        </div>
        
        <!-- Privacy Callout -->
        <div class="mt-8 flex items-center gap-x-3 text-sm text-gray-400">
          <UIcon name="i-heroicons-shield-check" class="h-5 w-5 text-green-400" />
          <span>Your data never trains public models. Local-first processing.</span>
        </div>
      </div>
      
      <!-- Right Side Visual -->
      <div class="mx-auto mt-16 flex max-w-2xl sm:mt-24 lg:ml-10 lg:mt-0 lg:mr-0 lg:max-w-none lg:flex-none xl:ml-32">
        <div class="max-w-3xl flex-none sm:max-w-5xl lg:max-w-none">
          <div class="-m-2 rounded-xl bg-gray-900/5 p-2 ring-1 ring-inset ring-gray-900/10 lg:-m-4 lg:rounded-2xl lg:p-4">
            <div class="relative rounded-md shadow-2xl ring-1 ring-gray-900/10 overflow-hidden bg-gray-800 border border-gray-700 tilt-card">
               <img
                 src="/images/screenshots/todays_training.png"
                 alt="Coach Watts Dashboard"
                 class="w-[40rem] rounded-md shadow-2xl ring-1 ring-gray-900/10"
               />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tilt-card {
  transform: perspective(1000px) rotateY(-5deg) rotateX(2deg);
  transition: transform 0.5s ease;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

.tilt-card:hover {
  transform: perspective(1000px) rotateY(-2deg) rotateX(1deg);
}
</style>