export default defineNuxtRouteMiddleware(async (to, from) => {
  const { status } = useAuth()

  if (status.value !== 'authenticated') {
    return navigateTo('/login')
  }
})
