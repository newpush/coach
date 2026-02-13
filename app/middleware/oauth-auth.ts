export default defineNuxtRouteMiddleware((to) => {
  const { status, signOut } = useAuth()

  // Handle prompt=login: if user is authenticated, we sign them out first
  // to ensure they see the specialized OAuth login screen
  if (to.query.prompt === 'login' && status.value === 'authenticated') {
    // We remove the prompt from the URL to avoid an infinite loop of signouts
    const newQuery = { ...to.query }
    delete newQuery.prompt

    const targetUrl = {
      path: to.path,
      query: newQuery
    }

    // signout and redirect to the same page (which will then hit the unauthenticated block below)
    return signOut({
      callbackUrl: useNuxtApp().$router.resolve(targetUrl).fullPath
    }) as Promise<void>
  }

  // If not authenticated, redirect to the specialized OAuth login page
  if (status.value !== 'authenticated') {
    return navigateTo(`/oauth/login?callbackUrl=${encodeURIComponent(to.fullPath)}`)
  }
})
