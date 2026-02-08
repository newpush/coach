<template>
  <UCard
    class="flex flex-col relative overflow-hidden"
    :class="{
      'ring-2 ring-primary border-primary': highlight || plan.popular,
      'opacity-90 hover:opacity-100 transition-opacity': !highlight && !plan.popular
    }"
    :ui="{ body: compact ? 'p-4' : undefined }"
  >
    <!-- Popular Badge -->
    <div
      v-if="showPopular && plan.popular"
      class="absolute top-0 right-0 bg-primary text-white text-xs font-bold px-3 py-1 rounded-bl-lg"
    >
      POPULAR
    </div>

    <!-- Current Plan Badge -->
    <div
      v-if="isCurrentPlan"
      class="absolute top-0 left-0 bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-br-lg"
    >
      CURRENT
    </div>

    <template #header>
      <h3 :class="compact ? 'text-lg' : 'text-xl'" class="font-bold">{{ plan.name }}</h3>
      <div :class="compact ? 'mt-2' : 'mt-4'" class="flex items-baseline gap-1">
        <span :class="compact ? 'text-2xl' : 'text-4xl'" class="font-extrabold">
          {{ formatPriceLocalized(plan.monthlyPrice, currencyContext) }}
        </span>
        <span class="text-sm text-gray-500 dark:text-gray-400"> / month </span>
      </div>
      <p
        :class="compact ? 'mt-1 text-xs' : 'mt-2 text-sm'"
        class="text-gray-500 dark:text-gray-400"
      >
        {{ plan.description }}
      </p>
    </template>

    <ul :class="compact ? 'space-y-2' : 'space-y-3'" class="mb-4 flex-grow">
      <li
        v-for="(feature, fIndex) in displayFeatures"
        :key="fIndex"
        class="flex items-start gap-2"
        :class="compact ? 'text-xs' : 'text-sm'"
      >
        <UIcon
          name="i-heroicons-check"
          :class="compact ? 'w-4 h-4' : 'w-5 h-5'"
          class="text-primary flex-shrink-0"
        />
        <span>{{ feature }}</span>
      </li>
    </ul>

    <template #footer>
      <UButton
        :color="plan.popular || highlight ? 'primary' : 'neutral'"
        :variant="plan.popular || highlight ? 'solid' : 'outline'"
        block
        :disabled="isCurrentPlan || !subscriptionsEnabled"
        @click="$emit('select', plan)"
      >
        {{ subscriptionsEnabled ? buttonLabel : 'Unavailable' }}
      </UButton>
    </template>
  </UCard>
</template>

<script setup lang="ts">
  import { formatPriceLocalized, type PricingPlan } from '~/utils/pricing'

  interface Props {
    plan: PricingPlan
    compact?: boolean
    showPopular?: boolean
    highlight?: boolean
  }

  const props = withDefaults(defineProps<Props>(), {
    compact: false,
    showPopular: true,
    highlight: false
  })

  defineEmits<{
    select: [plan: PricingPlan]
  }>()

  const userStore = useUserStore()
  const { data } = useAuth()
  const config = useRuntimeConfig()
  const subscriptionsEnabled = computed(() => config.public.subscriptionsEnabled)
  const { timezone } = useFormat()

  const currencyContext = computed(() => ({
    country: userStore.profile?.country,
    preferredCurrency: userStore.profile?.currencyPreference,
    profileTimezone: (data.value?.user as any)?.timezone || timezone.value,
    browserTimezone: import.meta.client ? Intl.DateTimeFormat().resolvedOptions().timeZone : null,
    locale: import.meta.client ? navigator.language : null
  }))

  const isCurrentPlan = computed(() => {
    const currentTier = userStore.user?.subscriptionTier?.toLowerCase()
    return currentTier === props.plan.key
  })

  const displayFeatures = computed(() => {
    if (props.compact) {
      return props.plan.features.slice(0, 3)
    }
    return props.plan.features
  })

  const buttonLabel = computed(() => {
    if (isCurrentPlan.value) return 'Current Plan'
    return 'Upgrade'
  })
</script>
