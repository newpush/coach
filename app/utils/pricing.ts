import { formatCurrencyFromUsd, type CurrencyContext } from '~/utils/currency'

export type BillingInterval = 'monthly' | 'annual'
export type PricingTier = 'free' | 'supporter' | 'pro'

export interface PricingPlan {
  key: PricingTier
  name: string
  monthlyPrice: number
  annualPrice: number | null
  description: string
  features: string[]
  popular: boolean
  stripePriceIds?: {
    monthly?: string
    annual?: string
  }
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    key: 'free',
    name: 'Free',
    monthlyPrice: 0,
    annualPrice: null,
    description: "The smartest logbook you've ever used.",
    features: [
      'Unlimited data history',
      'Manual sync mode',
      'On-demand analysis',
      'Quick AI Analysis Level'
    ],
    popular: false
  },
  {
    key: 'supporter',
    name: 'Supporter',
    monthlyPrice: 8.99,
    annualPrice: 89.99,
    description: 'Automated insights for the self-coached athlete.',
    features: [
      'Everything in Free',
      'Automatic sync mode',
      'Always-on analysis',
      'Priority processing',
      'Quick AI Analysis Level'
    ],
    popular: true
  },
  {
    key: 'pro',
    name: 'Pro',
    monthlyPrice: 14.99,
    annualPrice: 119.0,
    description: 'Your full-service Digital Twin and Coach.',
    features: [
      'Everything in Supporter',
      'Thoughtful AI Analysis Level',
      'Advanced strategy & planning',
      'Proactive AI coaching',
      'Priority processing',
      'Deep insights'
    ],
    popular: false
  }
]

/**
 * Calculate savings percentage for annual plans
 */
export function calculateAnnualSavings(plan: PricingPlan): number {
  if (!plan.annualPrice) return 0
  const monthlyTotal = plan.monthlyPrice * 12
  const savings = ((monthlyTotal - plan.annualPrice) / monthlyTotal) * 100
  return Math.round(savings)
}

/**
 * Format price for display
 */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: price % 1 === 0 ? 0 : 2
  }).format(price)
}

/**
 * Format price using a localized currency context.
 */
export function formatPriceLocalized(price: number, context: CurrencyContext): string {
  return formatCurrencyFromUsd(price, context)
}

/**
 * Get price for a specific interval
 */
export function getPrice(plan: PricingPlan, interval: BillingInterval): number {
  return interval === 'annual' && plan.annualPrice ? plan.annualPrice : plan.monthlyPrice
}

/**
 * Get Stripe price ID for a plan and interval
 */
export function getStripePriceId(plan: PricingPlan, interval: BillingInterval): string | undefined {
  const config = useRuntimeConfig()

  if (plan.key === 'supporter') {
    return interval === 'monthly'
      ? config.public.stripeSupporterMonthlyPriceId
      : config.public.stripeSupporterAnnualPriceId
  }

  if (plan.key === 'pro') {
    return interval === 'monthly'
      ? config.public.stripeProMonthlyPriceId
      : config.public.stripeProAnnualPriceId
  }

  return undefined
}
