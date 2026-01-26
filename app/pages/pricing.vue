<template>
  <div>
    <LandingPricing />
  </div>
</template>

<script setup lang="ts">
  definePageMeta({
    layout: 'landing',
    auth: false
  })

  useHead({
    title: 'Pricing',
    meta: [
      {
        name: 'description',
        content:
          'Choose the perfect plan for your endurance training journey. From free tracking to professional AI coaching.'
      }
    ]
  })
</script>
