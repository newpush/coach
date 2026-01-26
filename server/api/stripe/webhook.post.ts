import type Stripe from 'stripe'
import type { SubscriptionStatus, SubscriptionTier } from '@prisma/client'
import { prisma } from '../../utils/db'
import { stripe } from '../../utils/stripe'

/**
 * Map Stripe subscription status to internal status
 */
function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'ACTIVE'
    case 'past_due':
      return 'PAST_DUE'
    case 'canceled':
    case 'unpaid':
      return 'CANCELED'
    default:
      return 'NONE'
  }
}

/**
 * Determine subscription tier from Stripe product ID
 */
function getSubscriptionTier(productId: string): SubscriptionTier {
  const config = useRuntimeConfig()

  if (productId === config.stripeSupporterProductId) {
    return 'SUPPORTER'
  }
  if (productId === config.stripeProProductId) {
    return 'PRO'
  }

  // Default to FREE if product not recognized
  return 'FREE'
}

/**
 * Handle subscription created or updated
 */
async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string
  const subscriptionId = subscription.id

  // Get the product ID from the first subscription item
  const productId = subscription.items.data[0]?.price.product as string
  if (!productId) {
    console.error('No product ID found in subscription')
    return
  }

  const tier = getSubscriptionTier(productId)
  console.log(`Resolved tier '${tier}' for product '${productId}'`)

  const status = mapStripeStatus(subscription.status)
  const periodEnd = new Date((subscription as any).current_period_end * 1000)
  // Update user in database (Skip if user is a CONTRIBUTOR)
  await prisma.user.updateMany({
    where: {
      stripeCustomerId: customerId,
      NOT: { subscriptionStatus: 'CONTRIBUTOR' }
    },
    data: {
      stripeSubscriptionId: subscriptionId,
      subscriptionTier: tier,
      subscriptionStatus: status,
      subscriptionPeriodEnd: periodEnd
    }
  })

  console.log(`Updated subscription for customer ${customerId}: ${tier} (${status})`)
}

/**
 * Handle subscription deleted (complete cancellation)
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string

  // Downgrade to FREE tier (Skip if user is a CONTRIBUTOR)
  await prisma.user.updateMany({
    where: {
      stripeCustomerId: customerId,
      NOT: { subscriptionStatus: 'CONTRIBUTOR' }
    },
    data: {
      stripeSubscriptionId: null,
      subscriptionTier: 'FREE',
      subscriptionStatus: 'NONE',
      subscriptionPeriodEnd: null
    }
  })

  console.log(`Subscription deleted for customer ${customerId}, downgraded to FREE`)
}

/**
 * Handle checkout session completed (initial subscription)
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const customerId = session.customer as string
  const subscriptionId = session.subscription as string

  if (!subscriptionId) {
    console.error('No subscription ID in checkout session')
    return
  }

  // Retrieve the full subscription object
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  await handleSubscriptionChange(subscription)

  console.log(`Checkout completed for customer ${customerId}, subscription ${subscriptionId}`)
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const webhookSecret = config.stripeWebhookSecret

  if (!webhookSecret) {
    throw createError({
      statusCode: 500,
      message: 'STRIPE_WEBHOOK_SECRET is not configured'
    })
  }

  // Get the raw body
  const body = await readRawBody(event)
  if (!body) {
    throw createError({
      statusCode: 400,
      message: 'Missing request body'
    })
  }

  // Get the Stripe signature header
  const signature = getHeader(event, 'stripe-signature')
  if (!signature) {
    throw createError({
      statusCode: 400,
      message: 'Missing stripe-signature header'
    })
  }

  let stripeEvent: Stripe.Event

  try {
    // Verify the webhook signature
    stripeEvent = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message)
    throw createError({
      statusCode: 400,
      message: `Webhook Error: ${err.message}`
    })
  }

  // Log the event for debugging
  console.log(`Received Stripe webhook: ${stripeEvent.type}`)

  // Handle the event
  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(stripeEvent.data.object as Stripe.Checkout.Session)
        break

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionChange(stripeEvent.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(stripeEvent.data.object as Stripe.Subscription)
        break

      case 'invoice.payment_failed': {
        // Handle payment failure - could trigger email notification
        const failedInvoice = stripeEvent.data.object as Stripe.Invoice
        console.log(`Payment failed for customer ${failedInvoice.customer}`)
        break
      }

      case 'invoice.payment_succeeded': {
        // Handle successful payment - renewal confirmation
        const successInvoice = stripeEvent.data.object as Stripe.Invoice
        console.log(`Payment succeeded for customer ${successInvoice.customer}`)
        break
      }

      default:
        console.log(`Unhandled event type: ${stripeEvent.type}`)
    }

    return { received: true }
  } catch (error: any) {
    console.error('Error processing webhook:', error)
    if (error.stack) console.error(error.stack)
    throw createError({
      statusCode: 500,
      message: `Webhook processing error: ${error.message}`
    })
  }
})
