<template>
  <div class="py-16 md:py-24">
    <UContainer>
      <!-- Header -->
      <div class="text-center max-w-3xl mx-auto mb-16">
        <UBadge color="primary" variant="subtle" class="mb-4">Community</UBadge>
        <h1 class="text-4xl md:text-5xl font-bold mb-6">Athlete Stories</h1>
        <p class="text-lg text-gray-600 dark:text-gray-300">
          Real athletes achieving their peak performance with Coach Watts. From first centuries to
          podium finishes.
        </p>
      </div>

      <!-- Featured Story -->
      <div class="mb-24">
        <div class="relative rounded-2xl overflow-hidden bg-gray-900 text-white shadow-2xl">
          <div class="absolute inset-0">
            <!-- Placeholder for a real image, using a gradient for now -->
            <div
              class="w-full h-full bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 opacity-90"
            />
          </div>
          <div class="relative grid md:grid-cols-2 gap-8 p-8 md:p-16 items-center">
            <div>
              <div
                class="flex items-center gap-2 mb-4 text-primary-400 font-bold tracking-wide uppercase text-sm"
              >
                <UIcon name="i-heroicons-trophy" />
                Featured Athlete
              </div>
              <h2 class="text-3xl md:text-4xl font-bold mb-6">
                "I finally broke the 4 W/kg barrier after years of stagnation."
              </h2>
              <blockquote class="text-lg text-gray-300 mb-8 italic">
                "I was training hard but not smart. Coach Watts analyzed my data and realized I
                wasn't recovering enough between hard blocks. The AI suggested a polarized approach
                that completely changed my game."
              </blockquote>
              <div class="flex items-center gap-4">
                <UAvatar size="lg" alt="Sarah J." class="bg-primary/20 text-primary" />
                <div>
                  <div class="font-bold">Sarah Jenkins</div>
                  <div class="text-sm text-gray-400">Cat 2 Road Racer</div>
                </div>
              </div>
            </div>
            <div class="hidden md:block">
              <!-- Abstract visual representing data/performance -->
              <div class="bg-white/5 backdrop-blur rounded-xl p-6 border border-white/10">
                <div class="space-y-4">
                  <div class="flex justify-between items-end border-b border-white/10 pb-2">
                    <span class="text-sm text-gray-400">FTP Improvement</span>
                    <span class="text-2xl font-bold text-green-400">+12%</span>
                  </div>
                  <div class="flex justify-between items-end border-b border-white/10 pb-2">
                    <span class="text-sm text-gray-400">VO2 Max</span>
                    <span class="text-2xl font-bold text-blue-400">54 ml/kg</span>
                  </div>
                  <div class="flex justify-between items-end">
                    <span class="text-sm text-gray-400">Training Consistency</span>
                    <span class="text-2xl font-bold text-purple-400">98%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- More Stories Grid -->
      <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        <UCard
          v-for="story in stories"
          :key="story.name"
          class="flex flex-col h-full hover:ring-2 hover:ring-primary/50 transition-all"
        >
          <template #header>
            <div class="flex items-start justify-between">
              <UAvatar :alt="story.name" size="md" class="bg-gray-100 dark:bg-gray-800" />
              <UIcon name="i-heroicons-star" class="text-yellow-400 w-5 h-5" />
            </div>
          </template>

          <h3 class="text-xl font-bold mb-2">{{ story.title }}</h3>
          <p class="text-gray-600 dark:text-gray-300 flex-grow mb-4">"{{ story.quote }}"</p>

          <div class="pt-4 border-t border-gray-100 dark:border-gray-800 text-sm">
            <div class="font-bold">{{ story.name }}</div>
            <div class="text-gray-500">{{ story.type }}</div>
          </div>
        </UCard>
      </div>

      <!-- CTA -->
      <div class="mt-24 text-center">
        <h2 class="text-2xl font-bold mb-4">Have your own success story?</h2>
        <p class="text-gray-600 dark:text-gray-300 mb-8">
          Join the community and start training smarter today.
        </p>
        <UButton to="/login" size="xl" color="primary" icon="i-heroicons-arrow-right"
          >Start Your Journey</UButton
        >
      </div>
    </UContainer>
  </div>
</template>

<script setup lang="ts">
  definePageMeta({
    layout: 'home',
    auth: false
  })

  useHead({
    title: 'Athlete Stories',
    meta: [
      {
        name: 'description',
        content:
          'See how athletes are using Coach Watts to train smarter, recover better, and reach their goals.'
      }
    ]
  })

  const stories = [
    {
      name: 'Mike Chen',
      type: 'Gravel Cyclist',
      title: 'Crushed Unbound 200',
      quote:
        "The adaptive planning was a lifesaver. When work got crazy and I missed training, Coach Watts instantly adjusted my plan so I didn't burn out."
    },
    {
      name: 'Elena Rodriguez',
      type: 'Triathlete',
      title: 'PB on the Bike Leg',
      quote:
        'Balancing three sports is hard. The integration with Whoop helped me understand exactly how much strain I could handle on the bike without wrecking my run.'
    },
    {
      name: 'David Smith',
      type: "Master's Cyclist (50+)",
      title: 'Feeling 10 Years Younger',
      quote:
        "I thought I had to train hard every day to keep up. Coach Watts taught me the power of recovery. I'm riding faster now than I was in my 40s."
    },
    {
      name: 'Tom Baker',
      type: 'Weekend Warrior',
      title: 'Finally Consistent',
      quote:
        "I used to be 'all or nothing'. This app gives me realistic daily goals that I can actually hit. The consistency has compounded into huge gains."
    },
    {
      name: 'Lisa Wong',
      type: 'Crit Racer',
      title: 'Smarter Tactics',
      quote:
        'The race analysis features helped me understand my power curve better. I know exactly when to launch my sprint now.'
    },
    {
      name: 'James Wilson',
      type: 'Ultra-Endurance',
      title: 'Managed Fatigue Perfectly',
      quote:
        'For multi-day events, fatigue management is key. The readiness score was spot on every single day.'
    }
  ]
</script>
