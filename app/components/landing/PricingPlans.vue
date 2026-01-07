<template>
  <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
    <UCard
      v-for="(plan, index) in plans"
      :key="index"
      class="flex flex-col relative overflow-hidden"
      :class="{
        'ring-2 ring-primary border-primary': plan.popular,
        'opacity-90 hover:opacity-100 transition-opacity': !plan.popular
      }"
      :ui="{ body: 'flex-grow' }"
    >
      <div
        v-if="plan.popular"
        class="absolute top-0 right-0 bg-primary text-white text-xs font-bold px-3 py-1 rounded-bl-lg"
      >
        POPULAR
      </div>

      <template #header>
        <h3 class="text-xl font-bold">{{ plan.name }}</h3>
        <div class="mt-4 flex items-baseline gap-1">
          <span class="text-4xl font-extrabold">{{ plan.price }}</span>
          <span class="text-sm text-gray-500 dark:text-gray-400">/month</span>
        </div>
        <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">{{ plan.description }}</p>
      </template>

      <ul class="space-y-3 mb-6 flex-grow">
        <li
          v-for="(feature, fIndex) in plan.features"
          :key="fIndex"
          class="flex items-start gap-2 text-sm"
        >
          <UIcon name="i-heroicons-check" class="w-5 h-5 text-primary flex-shrink-0" />
          <span>{{ feature }}</span>
        </li>
      </ul>

      <template #footer>
        <UButton
          :color="plan.popular ? 'primary' : 'neutral'"
          :variant="plan.popular ? 'solid' : 'outline'"
          block
          :to="plan.link || '/login'"
        >
          {{ plan.cta || 'Get Started' }}
        </UButton>
      </template>
    </UCard>
  </div>
</template>

<script setup lang="ts">
  interface Plan {
    name: string
    price: string
    description: string
    features: string[]
    popular?: boolean
    link?: string
    cta?: string
  }

  defineProps<{
    plans: Plan[]
  }>()
</script>
