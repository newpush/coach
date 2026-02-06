<template>
  <UModal v-model="isOpen" :ui="{ width: 'sm:max-w-4xl' } as any">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-xl font-bold">{{ title || 'Upgrade Your Plan' }}</h3>
          <UButton color="neutral" variant="ghost" icon="i-heroicons-x-mark" @click="close" />
        </div>
      </template>

      <div class="space-y-6">
        <!-- Maintenance Message when Subscriptions are Disabled -->
        <div v-if="!subscriptionsEnabled">
          <UAlert
            icon="i-heroicons-information-circle"
            color="info"
            variant="soft"
            title="Subscriptions Temporarily Unavailable"
            description="We are currently performing maintenance on our subscription system. New subscriptions and upgrades are temporarily disabled. Please check back later!"
          />
        </div>

        <!-- Feature-specific message -->
        <div
          v-if="feature && subscriptionsEnabled"
          class="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4"
        >
          <div class="flex items-start gap-3">
            <UIcon
              name="i-heroicons-lock-closed"
              class="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5"
            />
            <div>
              <h4 class="font-medium text-blue-900 dark:text-blue-100">
                {{ featureTitle }}
              </h4>
              <p class="text-sm text-blue-700 dark:text-blue-300 mt-1">
                {{ featureDescription }}
              </p>
            </div>
          </div>
        </div>

        <!-- Recommended plan (if specified) -->
        <div v-if="recommendedTier && subscriptionsEnabled">
          <h4 class="font-semibold mb-3">Recommended Plan</h4>
          <PricingPlanCard :plan="recommendedPlan!" :show-popular="false" :highlight="true" />
        </div>

        <!-- All plans -->
        <div v-if="subscriptionsEnabled">
          <h4 class="font-semibold mb-3">
            {{ recommendedTier ? 'All Plans' : 'Choose Your Plan' }}
          </h4>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <PricingPlanCard
              v-for="plan in availablePlans"
              :key="plan.key"
              :plan="plan"
              :compact="true"
            />
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-between items-center">
          <UButton variant="ghost" color="neutral" @click="close">
            {{ subscriptionsEnabled ? 'Maybe Later' : 'Close' }}
          </UButton>
          <UButton
            v-if="subscriptionsEnabled"
            variant="link"
            color="primary"
            :to="'/pricing'"
            @click="close"
          >
            View Full Pricing Details
            <UIcon name="i-heroicons-arrow-right" class="w-4 h-4 ml-1" />
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>

<script setup lang="ts">
  import { PRICING_PLANS, type PricingTier } from '~/utils/pricing'

  interface Props {
    title?: string
    feature?: string
    featureTitle?: string
    featureDescription?: string
    recommendedTier?: PricingTier
  }

  const props = withDefaults(defineProps<Props>(), {
    title: 'Upgrade Your Plan',
    featureTitle: 'Premium Feature',
    featureDescription: 'This feature requires a paid subscription.'
  })

  const isOpen = defineModel<boolean>({ default: false })
  const userStore = useUserStore()
  const config = useRuntimeConfig()
  const subscriptionsEnabled = computed(() => config.public.subscriptionsEnabled)

  const recommendedPlan = computed(() => {
    if (!props.recommendedTier) return null
    return PRICING_PLANS.find((p) => p.key === props.recommendedTier)
  })

  const availablePlans = computed(() => {
    const currentTier = userStore.user?.subscriptionTier?.toLowerCase()

    // Filter out Free plan and current plan
    return PRICING_PLANS.filter((p) => {
      if (p.key === 'free') return false
      if (p.key === currentTier) return false
      if (props.recommendedTier && p.key === props.recommendedTier) return false
      return true
    })
  })

  function close() {
    isOpen.value = false
  }
</script>
