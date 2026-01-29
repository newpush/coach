import { defineStore } from 'pinia'
import type { SubscriptionTier, SubscriptionStatus } from '@prisma/client'

interface User {
  id: string
  email: string
  name: string | null
  image: string | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  subscriptionTier: SubscriptionTier
  subscriptionStatus: SubscriptionStatus
  subscriptionPeriodEnd: Date | null
}

interface UserEntitlements {
  tier: 'FREE' | 'SUPPORTER' | 'PRO'
  autoSync: boolean
  autoAnalysis: boolean
  aiModel: 'flash' | 'pro'
  priorityProcessing: boolean
  proactivity: boolean
}

export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(null)
  const profile = ref<any>(null)
  const loading = ref(false)
  const generating = ref(false)
  const userLoading = ref(false)
  const toast = useToast()
  const { refresh: refreshRuns } = useUserRuns()
  const { onTaskCompleted } = useUserRunsState()

  // Fetch user data (including subscription)
  async function fetchUser(force = false) {
    if (user.value && !force) return

    userLoading.value = true
    try {
      const data = await $fetch('/api/user/me')
      user.value = data as User
    } catch (error) {
      console.error('Error fetching user:', error)
      user.value = null
    } finally {
      userLoading.value = false
    }
  }

  // Calculate user entitlements based on subscription
  const entitlements = computed<UserEntitlements | null>(() => {
    if (!user.value) return null

    const config = useRuntimeConfig()

    // If Stripe is not configured (self-hosted mode), everyone is PRO
    if (!config.public.stripePublishableKey) {
      return {
        tier: 'PRO',
        autoSync: true,
        autoAnalysis: true,
        aiModel: 'pro',
        priorityProcessing: true,
        proactivity: true
      }
    }

    const now = new Date()
    const periodEnd = user.value.subscriptionPeriodEnd
      ? new Date(user.value.subscriptionPeriodEnd)
      : new Date(0)

    // Grace period logic
    const isEffectivePremium =
      user.value.subscriptionStatus === 'ACTIVE' ||
      user.value.subscriptionStatus === 'CONTRIBUTOR' ||
      (user.value.subscriptionPeriodEnd && now < periodEnd)

    const effectiveTier = isEffectivePremium ? user.value.subscriptionTier : 'FREE'

    return {
      tier: effectiveTier,
      autoSync: effectiveTier !== 'FREE',
      autoAnalysis: effectiveTier !== 'FREE',
      aiModel: effectiveTier === 'PRO' ? 'pro' : 'flash',
      priorityProcessing: effectiveTier !== 'FREE',
      proactivity: effectiveTier === 'PRO'
    }
  })

  // Check if user has a specific entitlement
  function hasEntitlement(feature: keyof Omit<UserEntitlements, 'tier'>): boolean | string {
    return entitlements.value?.[feature] ?? false
  }

  // Check if user has minimum tier
  function hasMinimumTier(minimumTier: 'FREE' | 'SUPPORTER' | 'PRO'): boolean {
    if (!entitlements.value) return false
    const tierHierarchy = { FREE: 0, SUPPORTER: 1, PRO: 2 }
    return tierHierarchy[entitlements.value.tier] >= tierHierarchy[minimumTier]
  }

  async function fetchProfile(force = false) {
    if (profile.value && !force) return

    loading.value = true
    try {
      const data = await $fetch('/api/profile/dashboard')
      profile.value = data?.profile || null
    } catch (error) {
      console.error('Error fetching profile:', error)
    } finally {
      loading.value = false
    }
  }

  async function generateProfile() {
    generating.value = true
    try {
      await $fetch('/api/profile/generate', { method: 'POST' })
      refreshRuns()

      toast.add({
        title: 'Profile Generation Started',
        description: 'Creating your comprehensive athlete profile. This may take a minute...',
        color: 'success',
        icon: 'i-heroicons-check-circle'
      })
    } catch (error: any) {
      generating.value = false
      toast.add({
        title: 'Generation Failed',
        description: error.data?.message || 'Failed to generate profile',
        color: 'error',
        icon: 'i-heroicons-exclamation-circle'
      })
    }
  }

  // Listen for completion
  onTaskCompleted('generate-athlete-profile', async () => {
    await fetchProfile(true)
    generating.value = false
    toast.add({
      title: 'Profile Ready',
      description: 'Your athlete profile has been generated',
      color: 'success',
      icon: 'i-heroicons-check-badge'
    })
  })

  return {
    user,
    profile,
    loading,
    generating,
    userLoading,
    entitlements,
    fetchUser,
    fetchProfile,
    generateProfile,
    hasEntitlement,
    hasMinimumTier
  }
})
