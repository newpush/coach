import { defineEventHandler, deleteCookie } from 'h3'
import { getServerSession } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!session?.user) {
    return { success: false, error: 'Not authenticated' }
  }

  console.log('[Stop Impersonation] Stopping impersonation')

  // Delete impersonation cookies
  deleteCookie(event, 'auth.impersonated_user_id')
  deleteCookie(event, 'auth.impersonation_meta')

  console.log('[Stop Impersonation] Impersonation stopped')

  return { success: true }
})
