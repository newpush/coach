export default defineNuxtPlugin((nuxtApp) => {
  // Only run on client-side
  if (import.meta.server) return

  nuxtApp.hook('app:mounted', async () => {
    const { data, getSession } = useAuth()

    // We wait for the session to be ready/fetched
    // Note: getSession() refreshes the session from the server
    // but if we already have data, we can check it first to avoid unnecessary calls
    // However, to be sure we have the `timezone` field (which might be new), getSession is safer if data is stale

    if (!data.value?.user) {
      return // Not logged in
    }

    const user = data.value.user as any

    // Check if timezone is missing or empty
    if (!user.timezone) {
      try {
        const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone

        if (detectedTimezone) {
          // Call API to update profile
          await $fetch('/api/profile', {
            method: 'PATCH',
            body: {
              timezone: detectedTimezone
            }
          })

          // Refresh session to update the user object locally with the new timezone
          await getSession()

          // Notify the user (optional, but good UX so they know why it changed)
          const toast = useToast()
          toast.add({
            title: 'Timezone Detected',
            description: `We've detected your timezone as ${detectedTimezone}. Your training dates will now align correctly.`,
            color: 'primary'
          })
        }
      } catch (e) {
        console.warn('[Timezone] Failed to auto-detect or save timezone:', e)
        // Fallback mechanism:
        // If browser detection fails completely (rare), we could default to 'UTC' explicitly
        // or just let the backend handle the 'null' case as UTC (which it already does).
        // Explicitly setting UTC might be better for consistency if the user is truly in a weird environment.
        try {
          await $fetch('/api/profile', {
            method: 'PATCH',
            body: { timezone: 'UTC' }
          })
          await getSession()
        } catch (err) {
          console.error('[Timezone] Fallback to UTC failed:', err)
        }
      }
    }
  })
})
