<template>
  <div>
    <!-- Hero Section -->
    <LandingPageHero 
      title="Train Smarter, Not Harder"
      highlight="With AI"
      description="Coach Watts analyzes your data from Intervals.icu, Whoop, and more to provide daily actionable training advice tailored to your recovery and goals."
      pill="New: Integration with Whoop 4.0"
    >
      <template #actions>
        <UButton size="xl" to="/login" icon="i-heroicons-rocket-launch">Start Training Now</UButton>
        <UButton size="xl" variant="outline" to="#features" icon="i-heroicons-arrow-down">Learn More</UButton>
      </template>

            <template #image>
              <div class="rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 shadow-2xl bg-gray-900 aspect-video relative group">
                <UCarousel
                  v-slot="{ item }"
                  :items="heroImages"
                  :ui="{ item: 'basis-full', container: 'gap-0' }"
                  class="w-full h-full absolute inset-0"
                  :autoplay="{ delay: 6000 }"
                  :infinite="true"
                >
                  <img
                    :src="item.src"
                    :alt="item.alt"
                    class="w-full h-full object-cover opacity-90 transition-transform duration-700 group-hover:scale-105"
                  />
                </UCarousel>
                <div class="absolute inset-0 bg-gradient-to-t from-gray-900/50 to-transparent"></div>
      
                <!-- Floating UI Element (Carousel) -->
                <div class="absolute bottom-6 left-6 right-6 md:left-auto md:right-6 md:w-96 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 transform translate-y-2 group-hover:translate-y-0 transition-all duration-500 overflow-hidden">
                   <UCarousel
                     v-slot="{ item }"
                     :items="insights"
                     :ui="{ item: 'basis-full', container: 'gap-0' }"
                     class="w-full"
                     indicators
                     :autoplay="{ delay: 4000 }"
                     :infinite="true"
                   >
                     <div class="p-4 w-full">
                       <div class="flex items-start gap-4">
                          <div :class="['w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0', item.bg]">
                             <UIcon :name="item.icon" :class="['w-6 h-6', item.color]" />
                          </div>
                          <div>
                             <h4 class="font-bold text-sm mb-1">{{ item.title }}</h4>
                             <p class="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                               {{ item.text }}
                             </p>
                          </div>
                       </div>
                     </div>
                   </UCarousel>
                </div>
              </div>
            </template>
          </LandingPageHero>
      
          <!-- Features Section -->
          <LandingPageSection id="features" title="Everything you need to perform" description="Comprehensive tools to analyze, plan, and execute your training.">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
              <UCard v-for="feature in features" :key="feature.title" class="hover:ring-2 hover:ring-primary/50 transition-all">
                <template #header>
                  <div class="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <UIcon :name="feature.icon" class="w-6 h-6 text-primary" />
                  </div>
                  <h3 class="text-xl font-bold mb-2">{{ feature.title }}</h3>
                </template>
                <p class="text-gray-600 dark:text-gray-300">{{ feature.description }}</p>
              </UCard>
            </div>
          </LandingPageSection>
      
          <!-- Integrations Section -->
          <LandingPageSection title="Works with your favorite tools" alternate>
            <div class="flex flex-wrap justify-center gap-8 md:gap-16">
              <div class="group flex flex-col items-center gap-3 p-4 rounded-xl hover:bg-white dark:hover:bg-gray-800 transition-all duration-300">
                <div class="w-16 h-16 rounded-full bg-[#FC4C02]/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <UIcon name="i-simple-icons-strava" class="w-8 h-8 text-[#FC4C02]" />
                </div>
                <span class="font-bold text-gray-700 dark:text-gray-200">Strava</span>
              </div>
      
              <div class="group flex flex-col items-center gap-3 p-4 rounded-xl hover:bg-white dark:hover:bg-gray-800 transition-all duration-300">
                <div class="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                   <UIcon name="i-heroicons-chart-bar" class="w-8 h-8 text-blue-500" />
                </div>
                <span class="font-bold text-gray-700 dark:text-gray-200">Intervals.icu</span>
              </div>
      
              <div class="group flex flex-col items-center gap-3 p-4 rounded-xl hover:bg-white dark:hover:bg-gray-800 transition-all duration-300">
                <div class="w-16 h-16 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                   <UIcon name="i-simple-icons-garmin" class="w-8 h-8 text-gray-900 dark:text-white" />
                </div>
                <span class="font-bold text-gray-700 dark:text-gray-200">Garmin</span>
              </div>
      
              <div class="group flex flex-col items-center gap-3 p-4 rounded-xl hover:bg-white dark:hover:bg-gray-800 transition-all duration-300">
                <div class="w-16 h-16 rounded-full bg-red-600/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                   <UIcon name="i-heroicons-heart" class="w-8 h-8 text-red-600" />
                </div>
                <span class="font-bold text-gray-700 dark:text-gray-200">Whoop</span>
              </div>
            </div>
          </LandingPageSection>
      
          <!-- Testimonials Preview Section -->
          <LandingPageSection title="Trusted by Athletes" description="See how Coach Watts is changing the game for cyclists everywhere.">
             <div class="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                <UCard class="bg-gray-50 dark:bg-gray-900 border-none shadow-none">
                   <div class="flex gap-1 text-yellow-400 mb-3">
                      <UIcon name="i-heroicons-star-solid" v-for="i in 5" :key="i" />
                   </div>
                   <p class="text-lg italic mb-4">"I finally broke the 4 W/kg barrier after years of stagnation. The AI insights identified exactly where I was overtraining."</p>
                   <div class="flex items-center gap-3">
                      <UAvatar alt="Sarah J" class="bg-primary/20 text-primary" />
                      <div class="font-bold">Sarah Jenkins <span class="text-gray-500 font-normal text-sm">- Cat 2 Racer</span></div>
                   </div>
                </UCard>
                <UCard class="bg-gray-50 dark:bg-gray-900 border-none shadow-none">
                   <div class="flex gap-1 text-yellow-400 mb-3">
                      <UIcon name="i-heroicons-star-solid" v-for="i in 5" :key="i" />
                   </div>
                   <p class="text-lg italic mb-4">"The adaptive planning saved my season when work got crazy. It automatically adjusted my week so I didn't burn out."</p>
                   <div class="flex items-center gap-3">
                      <UAvatar alt="Mike C" class="bg-blue-500/20 text-blue-500" />
                      <div class="font-bold">Mike Chen <span class="text-gray-500 font-normal text-sm">- Gravel Cyclist</span></div>
                   </div>
                </UCard>
             </div>
             <div class="text-center mt-12">
                <UButton to="/stories" variant="link" color="gray">Read more success stories →</UButton>
             </div>
          </LandingPageSection>
      
          <!-- Pricing Section -->
          <LandingPageSection id="pricing" title="Simple Pricing" description="Start for free, upgrade for advanced AI insights.">
            <LandingPricingPlans :plans="plans" />
          </LandingPageSection>
      
          <!-- CTA Section -->
          <LandingPageSection class="!py-0">
            <div class="my-16">
              <UCard class="bg-primary/5 dark:bg-primary/10 text-center py-12 sm:py-16 ring-0 shadow-none rounded-3xl">
                <h2 class="text-3xl font-bold mb-4">Ready to reach your peak?</h2>
                <p class="text-lg text-gray-600 dark:text-gray-300 mb-8 max-w-xl mx-auto">
                  Join hundreds of athletes using Coach Watts to train smarter every day.
                </p>
                <div class="flex justify-center gap-4">
                   <UButton size="xl" to="/login" color="primary">Get Started for Free</UButton>
                   <UButton size="xl" to="#features" color="gray" variant="ghost">Learn More</UButton>
                </div>
              </UCard>
            </div>
          </LandingPageSection>
        </div>
      </template>
      
      <script setup lang="ts">
      definePageMeta({
        layout: 'home',
        auth: false // Disable auth middleware for this page
      })
      
      const heroImages = [
        {
          src: "https://images.unsplash.com/photo-1541625602330-2277a4c46182?q=80&w=2196&auto=format&fit=crop",
          alt: "Cyclist riding on road"
        },
        {
          src: "https://images.unsplash.com/photo-1517649763962-0c623066013b?q=80&w=2670&auto=format&fit=crop",
          alt: "Cyclist on mountain road"
        },
          {
            src: "https://images.unsplash.com/photo-1533560906234-54cb6264e97e?q=80&w=2670&auto=format&fit=crop",
            alt: "Cyclists in a group"
          }      ]
      const insights = [
        {
          title: "Ready to Train",
          text: "You're well recovered today (92%). It's a perfect day for that VO2 Max workout you skipped on Tuesday.",
          icon: "i-heroicons-sparkles",
          color: "text-primary",
          bg: "bg-primary/10"
        },
        {
          title: "Sleep Debt Detected",
          text: "Your average sleep this week is down 15%. Consider swapping today's intervals for a Zone 2 ride.",
          icon: "i-heroicons-moon",
          color: "text-indigo-500",
          bg: "bg-indigo-500/10"
        },
        {
          title: "New FTP Detected",
          text: "Based on yesterday's effort, your eFTP has increased by 5W to 285W. Nice work!",
          icon: "i-heroicons-trending-up",
          color: "text-green-500",
          bg: "bg-green-500/10"
        }
      ]
      
      const features = [
        {
          title: 'AI Daily Coach',
          description: 'Get daily workout recommendations based on your sleep, HRV, and recent training load.',
          icon: 'i-heroicons-sparkles'
        },
        {
          title: 'Performance Analytics',
          description: 'Deep dive into your power curve, fatigue resistance, and training trends.',
          icon: 'i-heroicons-chart-bar'
        },
        {
          title: 'Smart Scheduling',
          description: 'Adaptive training plans that adjust automatically when you miss a workout.',
          icon: 'i-heroicons-calendar'
        }
      ]
      
      const plans = [
        {
          name: 'Starter',
          price: '$0',
          description: 'Perfect for getting started with structured training.',
          features: ['Basic Analytics', 'Manual Workout Planning', 'Connect 1 Device', 'Community Support'],
          cta: 'Start Free'
        },
        {
          name: 'Pro Athlete',
          price: '$12',
          description: 'Advanced AI insights for serious performance.',
          features: ['AI Daily Recommendations', 'Advanced Performance Metrics', 'Unlimited Device Sync', 'Priority Support', 'Training Plan Builder'],
          popular: true,
          cta: 'Start Trial'
        },
        {
          name: 'Team',
          price: '$49',
          description: 'For coaches and teams managing multiple athletes.',
          features: ['Manage 5 Athletes', 'Team Dashboard', 'Compliance Reports', 'Custom Branding'],
          cta: 'Contact Sales'
        }
      ]
      </script>
