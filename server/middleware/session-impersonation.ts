import { defineEventHandler, getCookie } from 'h3'
import { getServerSession as getBaseSession } from '#auth'
import { prisma } from '../utils/db'

/**
 * Middleware that intercepts getServerSession calls and applies impersonation
 * This runs before all API routes and modifies the session in the event context
 */
export default defineEventHandler(async (event) => {
  // Skip for non-API routes
  if (!event.path.startsWith('/api')) {
    return
  }

  // Skip for auth routes to avoid recursion
  if (event.path.startsWith('/api/auth')) {
    return
  }

  // Check for impersonation cookie
  const impersonatedUserId = getCookie(event, 'auth.impersonated_user_id')

  if (!impersonatedUserId) {
    return // No impersonation active
  }

  // Store a flag that impersonation is active
  event.context.impersonation = {
    enabled: true,
    userId: impersonatedUserId
  }
})
