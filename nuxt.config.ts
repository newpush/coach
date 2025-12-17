// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: [
    '@nuxt/ui',
    '@sidebase/nuxt-auth',
    '@nuxtjs/mdc'
  ],

  css: ['~/assets/css/main.css'],

  auth: {
    baseURL: '/api/auth',
    provider: {
      type: 'authjs'
    }
  },

  runtimeConfig: {
    authOrigin: process.env.NUXT_AUTH_ORIGIN || 'http://localhost:3099/api/auth',
    public: {
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3099'
    }
  },

  devServer: {
    port: 3099
  },

  vite: {
    optimizeDeps: {
      include: ['prosemirror-state']
    },
    vue: {
      template: {
        compilerOptions: {
          isCustomElement: (tag) => ['vue-advanced-chat', 'emoji-picker'].includes(tag)
        }
      }
    }
  }
})
