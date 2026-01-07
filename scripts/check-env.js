import 'dotenv/config'

console.log('--- Environment Check ---')
console.log('NUXT_AUTH_ORIGIN:', process.env.NUXT_AUTH_ORIGIN)
console.log('NUXT_PUBLIC_SITE_URL:', process.env.NUXT_PUBLIC_SITE_URL)
console.log('AUTH_BYPASS_USER:', process.env.AUTH_BYPASS_USER)
console.log('NODE_ENV:', process.env.NODE_ENV)
console.log('-------------------------')
