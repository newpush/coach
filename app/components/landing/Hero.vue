<template>
   <div class="relative isolate overflow-hidden">
      <div class="mx-auto max-w-7xl px-6 pb-24 pt-10 sm:pb-32 lg:flex lg:px-8 lg:py-40">
         <div class="mx-auto max-w-2xl lg:mx-0 lg:max-w-xl lg:flex-shrink-0 lg:pt-8">
            <div class="mt-24 sm:mt-32 lg:mt-16">
               <NuxtLink to="#architecture" class="inline-flex space-x-6">
                  <span
                     class="rounded-full bg-primary-500/10 px-3 py-1 text-sm font-semibold leading-6 text-primary-400 ring-1 ring-inset ring-primary-500/20">Transparent
                     Intelligence</span>
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
               The first AI Endurance Coach built by cybersecurity experts. Secure, data-driven, and completely free.
               Turn your fitness data into a gold medal strategy.
            </p>
            <div class="mt-10 flex items-center gap-x-6">
               <UButton to="/login" size="xl" color="primary" variant="solid"
                  class="px-8 py-3 text-base font-semibold shadow-sm hover:bg-primary-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400">
                  Start Training - Free
               </UButton>
               <UButton to="#how-it-works" size="xl" color="neutral" variant="ghost"
                  class="text-sm font-semibold leading-6 text-white">
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
         <div
            class="mx-auto mt-16 flex max-w-2xl sm:mt-24 lg:ml-10 lg:mt-0 lg:mr-0 lg:max-w-none lg:flex-none xl:ml-32">
            <div class="max-w-3xl flex-none sm:max-w-5xl lg:max-w-none">
               <div
                  class="-m-2 rounded-xl bg-gray-900/5 p-2 ring-1 ring-inset ring-gray-900/10 lg:-m-4 lg:rounded-2xl lg:p-4">
                  <div
                     class="relative rounded-md shadow-2xl ring-1 ring-gray-900/10 overflow-hidden bg-gray-800 border border-gray-700 tilt-card group">
                     <div class="aspect-[16/10] w-[40rem] bg-gray-900/95 relative overflow-hidden">

                        <div
                           class="h-12 border-b border-gray-700 flex items-center justify-between px-4 bg-gray-800/50 backdrop-blur">
                           <div class="flex items-center space-x-2">
                              <div class="w-3 h-3 rounded-full bg-red-500/50"></div>
                              <div class="w-3 h-3 rounded-full bg-yellow-500/50"></div>
                              <div class="w-3 h-3 rounded-full bg-green-500/50"></div>
                           </div>
                           <div class="flex items-center space-x-3">
                              <div class="h-2 w-20 bg-gray-700 rounded-full"></div>
                              <div class="h-8 w-8 bg-gray-700 rounded-full"></div>
                           </div>
                        </div>

                        <div class="p-6 grid grid-cols-12 gap-6 h-full">

                           <div class="col-span-1 flex flex-col items-center space-y-6 pt-4 text-gray-600">
                              <UIcon name="i-heroicons-home" class="w-6 h-6 text-primary-500" />
                              <UIcon name="i-heroicons-chart-bar"
                                 class="w-6 h-6 hover:text-gray-400 transition-colors" />
                              <UIcon name="i-heroicons-calendar"
                                 class="w-6 h-6 hover:text-gray-400 transition-colors" />
                              <UIcon name="i-heroicons-user" class="w-6 h-6 hover:text-gray-400 transition-colors" />
                           </div>

                           <div class="col-span-11 grid grid-cols-2 gap-6">

                              <div
                                 class="col-span-2 bg-gray-800/50 rounded-xl border border-gray-700/50 p-4 relative overflow-hidden hover:border-primary-500/30 transition-colors group/card">
                                 <div class="flex items-center gap-3 mb-3">
                                    <div
                                       class="w-8 h-8 rounded-full bg-primary-500/20 flex items-center justify-center text-primary-400">
                                       <UIcon name="i-heroicons-sparkles" class="w-5 h-5" />
                                    </div>
                                    <span class="text-sm font-medium text-gray-300">Daily Insight</span>
                                 </div>

                                 <div class="text-sm text-gray-400 font-mono leading-relaxed h-12 relative">
                                    <span class="typing-text">Recovery is low (34%). Switching intervals to Zone
                                       2...</span>
                                    <span class="cursor inline-block w-2 h-4 bg-primary-500 ml-1 animate-pulse"></span>
                                 </div>
                              </div>

                              <div
                                 class="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4 hover:bg-gray-800 transition-colors">
                                 <div class="text-xs text-gray-500 mb-1">FITNESS SCORE</div>
                                 <div class="text-2xl font-bold text-white flex items-end gap-2">
                                    72
                                    <span class="text-xs text-green-400 mb-1 flex items-center">
                                       <UIcon name="i-heroicons-arrow-trending-up" class="w-3 h-3 mr-0.5" /> +2.4
                                    </span>
                                 </div>
                                 <div class="mt-3 h-10 flex items-end space-x-1">
                                    <div class="w-1/5 bg-gray-700 h-4 rounded-t"></div>
                                    <div class="w-1/5 bg-gray-700 h-6 rounded-t"></div>
                                    <div class="w-1/5 bg-gray-700 h-5 rounded-t"></div>
                                    <div class="w-1/5 bg-gray-700 h-8 rounded-t"></div>
                                    <div class="w-1/5 bg-primary-500 h-10 rounded-t animate-pulse"></div>
                                 </div>
                              </div>

                              <div
                                 class="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4 hover:bg-gray-800 transition-colors">
                                 <div class="text-xs text-gray-500 mb-1">RECOVERY</div>
                                 <div class="text-2xl font-bold text-white flex items-end gap-2">
                                    34%
                                    <span class="text-xs text-red-400 mb-1">Low</span>
                                 </div>
                                 <div class="mt-4 w-full bg-gray-700 h-2 rounded-full overflow-hidden">
                                    <div class="bg-red-500 h-full w-[34%] relative">
                                       <div class="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]"></div>
                                    </div>
                                 </div>
                              </div>

                              <div
                                 class="col-span-2 bg-gray-800/30 rounded-xl border border-gray-700/30 h-32 relative overflow-hidden group-hover:border-gray-700/50 transition-colors">
                                 <div
                                    class="absolute inset-0 opacity-10 bg-[url('https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbm95MXY4Z3Y0Z3Y0Z3Y0Z3Y0Z3Y0Z3Y0Z3Y0Z3Y0Z3Y0Z3Y0/U3qYN8S0j3bpK/giphy.gif')] bg-cover mix-blend-screen pointer-events-none">
                                 </div>

                                 <svg class="absolute bottom-0 left-0 right-0 h-full w-full" preserveAspectRatio="none">
                                    <path d="M0,80 C100,70 200,90 300,50 C400,10 500,60 600,40 L600,128 L0,128 Z"
                                       fill="url(#gradient)" opacity="0.2" />
                                    <path d="M0,80 C100,70 200,90 300,50 C400,10 500,60 600,40" stroke="#10b981"
                                       stroke-width="2" fill="none" class="drop-shadow-lg" />
                                    <defs>
                                       <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                          <stop offset="0%" stop-color="#10b981" stop-opacity="0.5" />
                                          <stop offset="100%" stop-color="#10b981" stop-opacity="0" />
                                       </linearGradient>
                                    </defs>
                                 </svg>
                              </div>

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