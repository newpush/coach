<script setup lang="ts">
  import { format } from 'date-fns'
  import type { SubscriptionStatus, SubscriptionTier } from '@prisma/client'

  definePageMeta({
    middleware: 'auth'
  })

  useHead({
    title: 'Billing & Subscription',
    meta: [
      {
        name: 'description',
        content: 'Manage your subscription and billing information.'
      }
    ]
  })

  const route = useRoute()
  const userStore = useUserStore()
  const { openCustomerPortal } = useStripe()

  const loadingPortal = ref(false)
  const syncing = ref(false)
  const showSuccessMessage = ref(route.query.success === 'true')
  const showCanceledMessage = ref(route.query.canceled === 'true')
  const showPlansModal = ref(false)

  const config = useRuntimeConfig()
  const subscriptionsEnabled = computed(() => config.public.subscriptionsEnabled)

  // Always refresh user data on mount to ensure latest subscription status
  onMounted(() => {
    userStore.fetchUser()
  })

  // Computed
  const isPremium = computed(() => {
    return (
      userStore.user?.subscriptionTier === 'SUPPORTER' || userStore.user?.subscriptionTier === 'PRO'
    )
  })

  const entitlements = computed(() => {
    if (!userStore.user) return null

    // Simple client-side entitlements calculation
    const tier = userStore.user.subscriptionTier
    const status = userStore.user.subscriptionStatus
    const periodEnd = userStore.user.subscriptionPeriodEnd

    const isEffectivePremium =
      status === 'ACTIVE' ||
      status === 'CONTRIBUTOR' ||
      (periodEnd && new Date(periodEnd) > new Date())

    const effectiveTier = isEffectivePremium ? tier : 'FREE'

    return {
      tier: effectiveTier,
      autoSync: effectiveTier !== 'FREE',
      autoAnalysis: effectiveTier !== 'FREE',
      aiModel: effectiveTier === 'PRO' ? 'pro' : 'flash',
      priorityProcessing: effectiveTier !== 'FREE',
      proactivity: effectiveTier === 'PRO'
    }
  })

  // Methods
  function formatStatus(status: SubscriptionStatus | undefined): string {
    if (!status) return 'None'
    if (status === 'CONTRIBUTOR') return 'Contributor'
    return status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ')
  }

  function getStatusColor(status: SubscriptionStatus | undefined): string {
    switch (status) {
      case 'ACTIVE':
        return 'green'
      case 'CANCELED':
        return 'yellow'
      case 'PAST_DUE':
        return 'orange'
      case 'UNPAID':
        return 'red'
      case 'CONTRIBUTOR':
        return 'primary'
      default:
        return 'gray'
    }
  }
  function formatTier(tier: SubscriptionTier | undefined): string {
    if (!tier) return 'Free'
    return tier.charAt(0) + tier.slice(1).toLowerCase()
  }

  function getTierIcon(tier: SubscriptionTier | undefined): string {
    switch (tier) {
      case 'PRO':
        return 'i-heroicons-star'
      case 'SUPPORTER':
        return 'i-heroicons-heart'
      default:
        return 'i-heroicons-user'
    }
  }

  function getTierDescription(tier: SubscriptionTier | undefined): string {
    switch (tier) {
      case 'PRO':
        return 'Your full-service Digital Twin and Coach.'
      case 'SUPPORTER':
        return 'Automated insights for the self-coached athlete.'
      default:
        return "The smartest logbook you've ever used."
    }
  }

  function formatDate(date: string | Date | undefined): string {
    if (!date) return 'N/A'
    return format(new Date(date), 'MMMM d, yyyy')
  }

  async function handleManageSubscription() {
    loadingPortal.value = true
    await openCustomerPortal(window.location.href)
    loadingPortal.value = false
  }

  async function handleViewInvoices() {
    loadingPortal.value = true
    await openCustomerPortal(window.location.href)
    loadingPortal.value = false
  }

  async function handleSync() {
    syncing.value = true
    try {
      await $fetch('/api/stripe/sync', { method: 'POST' })
      await userStore.fetchUser()

      const toast = useToast()
      toast.add({
        title: 'Subscription Synced',
        description: 'Your subscription status has been updated from Stripe.',
        color: 'success'
      })
    } catch (e) {
      const toast = useToast()
      toast.add({
        title: 'Sync Failed',
        description: 'Could not sync subscription status. Please try again later.',
        color: 'error'
      })
    } finally {
      syncing.value = false
    }
  }
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold">Billing & Subscription</h2>
        <p class="text-neutral-500">Manage your subscription and billing information.</p>
      </div>
      <div v-if="userStore.user?.subscriptionStatus" class="hidden sm:block">
        <UBadge
          :color="getStatusColor(userStore.user?.subscriptionStatus) as any"
          class="font-semibold"
        >
          {{ formatTier(userStore.user?.subscriptionTier) }} •
          {{ formatStatus(userStore.user?.subscriptionStatus) }}
        </UBadge>
      </div>
    </div>

    <!-- Success/Canceled Alerts -->
    <div class="space-y-4">
      <UAlert
        v-if="showSuccessMessage"
        title="Subscription Activated!"
        icon="i-heroicons-check-circle"
        color="success"
        variant="soft"
        :close="{ color: 'success', variant: 'link', label: 'Dismiss' }"
        description="Your subscription has been successfully activated. Welcome aboard!"
        @update:open="showSuccessMessage = false"
      />

      <UAlert
        v-if="showCanceledMessage"
        title="Checkout Canceled"
        icon="i-heroicons-information-circle"
        color="info"
        variant="soft"
        :close="{ color: 'info', variant: 'link', label: 'Dismiss' }"
        description="You can upgrade anytime by selecting a plan below."
        @update:open="showCanceledMessage = false"
      />
    </div>

    <!-- Main Content Wrapper -->
    <div class="flex flex-col lg:flex-col gap-8">
      <!-- 2. Subscription Management (Active Sub + Entitlements) -->
      <!-- Show FIRST on mobile, SECOND on desktop (if not premium) -->
      <div
        class="grid grid-cols-1 lg:grid-cols-3 gap-6"
        :class="{ 'order-1 lg:order-2': !isPremium, 'order-1': isPremium }"
      >
        <!-- Detailed Status Card -->
        <UCard class="lg:col-span-2" :ui="{ body: 'p-4 sm:p-6' }">
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold">Active Subscription</h3>
              <UIcon
                :name="getTierIcon(userStore.user?.subscriptionTier)"
                class="w-5 h-5 text-primary"
              />
            </div>
          </template>

          <div class="space-y-6">
            <div class="flex items-start gap-4">
              <div class="p-3 bg-primary/10 rounded-lg">
                <UIcon
                  :name="getTierIcon(userStore.user?.subscriptionTier)"
                  class="w-8 h-8 text-primary"
                />
              </div>
              <div>
                <div class="text-xl font-bold">
                  {{ formatTier(userStore.user?.subscriptionTier) }} Plan
                </div>
                <p class="text-sm text-neutral-500">
                  {{ getTierDescription(userStore.user?.subscriptionTier) }}
                </p>
              </div>
            </div>

            <div
              class="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-gray-100 dark:border-gray-800"
            >
              <div>
                <dt class="text-xs font-bold text-gray-400 uppercase tracking-wider">Status</dt>
                <dd class="mt-1">
                  <UBadge
                    :color="getStatusColor(userStore.user?.subscriptionStatus) as any"
                    variant="subtle"
                  >
                    {{ formatStatus(userStore.user?.subscriptionStatus) }}
                  </UBadge>
                </dd>
              </div>
              <div v-if="userStore.user?.subscriptionPeriodEnd">
                <dt class="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  {{
                    userStore.user?.subscriptionStatus === 'CANCELED'
                      ? 'Access Expires'
                      : 'Next Billing Date'
                  }}
                </dt>
                <dd class="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                  {{ formatDate(userStore.user.subscriptionPeriodEnd) }}
                </dd>
              </div>
              <div v-if="userStore.user?.stripeCustomerId">
                <dt class="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Customer ID
                </dt>
                <dd class="mt-1 text-xs font-mono text-gray-500">
                  {{ userStore.user.stripeCustomerId }}
                </dd>
              </div>
            </div>
          </div>

          <template #footer>
            <div class="flex flex-wrap gap-3">
              <UButton
                v-if="
                  userStore.user?.stripeCustomerId && userStore.user?.subscriptionTier !== 'FREE'
                "
                color="primary"
                variant="solid"
                :loading="loadingPortal"
                @click="handleManageSubscription"
              >
                <UIcon name="i-heroicons-cog-6-tooth" class="w-4 h-4" />
                Manage
              </UButton>

              <!-- New Change Plan Button for Premium Users -->
              <UButton
                v-if="isPremium"
                color="primary"
                variant="soft"
                @click="showPlansModal = true"
              >
                <UIcon name="i-heroicons-arrow-path-rounded-square" class="w-4 h-4" />
                Change Plan
              </UButton>

              <UButton
                v-if="userStore.user?.stripeCustomerId"
                color="neutral"
                variant="outline"
                :loading="loadingPortal"
                @click="handleViewInvoices"
              >
                <UIcon name="i-heroicons-document-text" class="w-4 h-4" />
                Invoices
              </UButton>

              <UButton color="neutral" variant="ghost" :loading="syncing" @click="handleSync">
                <UIcon name="i-heroicons-arrow-path" class="w-4 h-4" />
                Sync
              </UButton>

              <p
                v-if="userStore.user?.subscriptionTier === 'FREE'"
                class="text-xs text-neutral-500 italic mt-2 w-full"
              >
                Subscribe to a plan below to manage billing.
              </p>
            </div>
          </template>
        </UCard>

        <!-- Entitlements Summary -->
        <UCard :ui="{ body: 'p-4 sm:p-6' }">
          <template #header>
            <h3 class="text-lg font-semibold text-center">Your Entitlements</h3>
          </template>

          <div class="space-y-4">
            <div
              class="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800"
            >
              <span class="text-sm">Sync Mode</span>
              <UBadge :color="entitlements?.autoSync ? 'success' : 'neutral'" size="xs">
                {{ entitlements?.autoSync ? 'Automatic' : 'Manual' }}
              </UBadge>
            </div>
            <div
              class="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800"
            >
              <span class="text-sm">Analysis</span>
              <UBadge :color="entitlements?.autoAnalysis ? 'success' : 'neutral'" size="xs">
                {{ entitlements?.autoAnalysis ? 'Always-On' : 'On-Demand' }}
              </UBadge>
            </div>
            <div
              class="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800"
            >
              <span class="text-sm">AI Engine</span>
              <UBadge :color="entitlements?.aiModel === 'pro' ? 'primary' : 'info'" size="xs">
                {{ entitlements?.aiModel === 'pro' ? 'Deep' : 'Standard' }}
              </UBadge>
            </div>
            <div
              class="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800"
            >
              <span class="text-sm">Priority</span>
              <UBadge :color="entitlements?.priorityProcessing ? 'success' : 'neutral'" size="xs">
                {{ entitlements?.priorityProcessing ? 'Yes' : 'No' }}
              </UBadge>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm">Proactive AI</span>
              <UBadge :color="entitlements?.proactivity ? 'success' : 'neutral'" size="xs">
                {{ entitlements?.proactivity ? 'Yes' : 'No' }}
              </UBadge>
            </div>
          </div>
        </UCard>
      </div>

      <!-- 1. Pricing & Comparison -->
      <!-- Show ONLY if NOT premium (or in modal) AND subscriptions are enabled -->
      <div
        v-if="!isPremium && subscriptionsEnabled"
        class="space-y-4 order-2 lg:order-1 pt-8 lg:pt-0 border-t lg:border-t-0 border-gray-200 dark:border-gray-800"
      >
        <div class="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
          <h3 class="text-xl font-bold">Subscription Plans</h3>
          <p
            v-if="userStore.user?.subscriptionTier !== 'PRO'"
            class="text-sm text-primary font-medium"
          >
            Upgrade to unlock advanced features
          </p>
        </div>
        <LandingPricingPlans />
      </div>

      <!-- Maintenance Message when Subscriptions are Disabled -->
      <div
        v-if="!isPremium && !subscriptionsEnabled"
        class="space-y-4 order-2 lg:order-1 pt-8 lg:pt-0 border-t lg:border-t-0 border-gray-200 dark:border-gray-800"
      >
        <UAlert
          icon="i-heroicons-information-circle"
          color="info"
          variant="soft"
          title="Subscriptions Temporarily Unavailable"
          description="We are currently performing maintenance on our subscription system. New subscriptions are temporarily disabled, but existing subscriptions remain active and functional."
        />
      </div>
    </div>

    <!-- Change Plan Modal -->
    <UModal v-model:open="showPlansModal" :ui="{ content: 'sm:max-w-5xl' }">
      <template #content>
        <UCard :ui="{ body: 'p-6 sm:p-8' }">
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-xl font-bold">Change Your Plan</h3>
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-heroicons-x-mark"
                @click="showPlansModal = false"
              />
            </div>
          </template>

          <div v-if="subscriptionsEnabled">
            <LandingPricingPlans />
          </div>
          <div v-else class="py-8">
            <UAlert
              icon="i-heroicons-information-circle"
              color="info"
              variant="soft"
              title="Subscriptions Temporarily Unavailable"
              description="New plan selections and changes are temporarily disabled while we perform system maintenance. Existing subscriptions remain active."
            />
          </div>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
