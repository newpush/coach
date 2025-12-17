export default defineNitroPlugin((nitroApp) => {
  const config = useRuntimeConfig()
  const authOrigin = config.authOrigin
  const callbackUrl = `${authOrigin}/callback/google`
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🔐 Google OAuth Callback URL:')
  console.log(`   ${callbackUrl}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
})