<template>
  <div class="space-y-8">
    <!-- Billing Interval Toggle -->
    <div class="flex justify-center">
      <div class="inline-flex items-center gap-3 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
        <button
          class="px-4 py-2 rounded-md text-sm font-medium transition-all"
          :class="
            billingInterval === 'monthly'
              ? 'bg-white dark:bg-gray-900 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          "
          @click="billingInterval = 'monthly'"
        >
          Monthly
        </button>
        <button
          class="px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2"
          :class="
            billingInterval === 'annual'
              ? 'bg-white dark:bg-gray-900 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          "
          @click="billingInterval = 'annual'"
        >
          Annual
          <span
            class="text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full"
          >
            Save 33%
          </span>
        </button>
      </div>
    </div>

    <!-- Pricing Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8">
      <UCard
        v-for="plan in PRICING_PLANS"
        :key="plan.key"
        class="flex flex-col relative overflow-hidden"
        :class="{
          'ring-2 ring-primary border-primary': plan.popular,
          'opacity-90 hover:opacity-100 transition-opacity': !plan.popular
        }"
        :ui="{ body: { base: 'flex-grow', padding: 'p-4 sm:p-6' } }"
      >
        <!-- Popular Badge -->
        <div
          v-if="plan.popular"
          class="absolute top-0 right-0 bg-primary text-white text-xs font-bold px-3 py-1 rounded-bl-lg"
        >
          POPULAR
        </div>

        <!-- Current Plan Badge -->
        <div
          v-if="isCurrentPlan(plan)"
          class="absolute top-0 left-0 bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-br-lg"
        >
          CURRENT PLAN
        </div>

        <template #header>
          <h3 class="text-xl font-bold">{{ plan.name }}</h3>
          <div class="mt-4 flex items-baseline gap-1">
            <span class="text-4xl font-extrabold">{{
              formatPrice(getPrice(plan, billingInterval))
            }}</span>
            <span class="text-sm text-gray-500 dark:text-gray-400">
              {{
                plan.key === 'free' ? '' : `/ ${billingInterval === 'annual' ? 'year' : 'month'}`
              }}
            </span>
          </div>

          <!-- Savings Badge for Annual -->
          <div class="mt-2 h-4">
            <span
              v-if="billingInterval === 'annual' && plan.annualPrice"
              class="text-xs text-green-600 dark:text-green-400 font-medium"
            >
              Save {{ calculateAnnualSavings(plan) }}% vs monthly
            </span>
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
            :disabled="isCurrentPlan(plan) || loading"
            :loading="loading && selectedPlan === plan.key"
            @click="handlePlanSelect(plan)"
          >
            {{ getButtonLabel(plan) }}
          </UButton>
        </template>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
  import {
    PRICING_PLANS,
    calculateAnnualSavings,
    formatPrice,
    getPrice,
    getStripePriceId,
    type BillingInterval,
    type PricingPlan
  } from '~/utils/pricing'

  const { status } = useAuth()
  const userStore = useUserStore()
  const { createCheckoutSession } = useStripe()

  const billingInterval = ref<BillingInterval>('annual')
  const loading = ref(false)
  const selectedPlan = ref<string | null>(null)

  function isCurrentPlan(plan: PricingPlan): boolean {
    if (!userStore.user || status.value !== 'authenticated') return false
    const currentTier = userStore.user.subscriptionTier?.toLowerCase()
    return currentTier === plan.key
  }

  function getButtonLabel(plan: PricingPlan): string {
    if (isCurrentPlan(plan)) {
      return 'Current Plan'
    }

    if (plan.key === 'free') {
      return status.value === 'authenticated' ? 'Get Started' : 'Sign Up'
    }

    if (status.value === 'authenticated') {
      return 'Upgrade'
    }

    return plan.name === 'Supporter' ? 'Go Supporter' : 'Become Pro'
  }

  async function handlePlanSelect(plan: PricingPlan) {
    // Free plan - redirect to signup or dashboard
    if (plan.key === 'free') {
      if (status.value === 'authenticated') {
        navigateTo('/dashboard')
      } else {
        navigateTo('/login')
      }
      return
    }

    // Paid plans
    if (status.value !== 'authenticated') {
      // Not logged in - redirect to signup with plan parameter
      navigateTo(`/login?plan=${plan.key}&interval=${billingInterval.value}`)
      return
    }

    // Logged in - start Stripe checkout
    const priceId = getStripePriceId(plan, billingInterval.value)
    if (!priceId) {
      console.error('No Stripe price ID found for plan:', plan.key, billingInterval.value)
      return
    }

    loading.value = true
    selectedPlan.value = plan.key

    await createCheckoutSession(priceId, {
      successUrl: `${window.location.origin}/settings/billing?success=true`,
      cancelUrl: `${window.location.origin}/pricing?canceled=true`
    })

    // Reset loading state (in case redirect fails)
    setTimeout(() => {
      loading.value = false
      selectedPlan.value = null
    }, 3000)
  }
</script>
