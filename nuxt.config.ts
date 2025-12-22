import pkg from './package.json'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  app: {
    head: {
      titleTemplate: '%s - Coach Watts',
      title: 'Coach Watts',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'AI-powered endurance coaching platform that adapts to your training.' }
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }
      ]
    }
  },

  modules: [
    '@nuxt/ui',
    '@sidebase/nuxt-auth',
    '@nuxtjs/mdc',
    '@pinia/nuxt'
  ],

  nitro: {
    experimental: {
      openAPI: true
    },
    openAPI: {
      production: 'runtime',
      route: '/_openapi.json',
      meta: {
        title: 'Coach Watts API',
        description: 'AI-powered endurance coaching platform API',
        version: pkg.version
      },
      ui: {
        scalar: {
          route: '/_docs/scalar',
          theme: 'purple'
        },
        swagger: {
          route: '/_docs/swagger'
        }
      }
    }
  },

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
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3099',
      version: pkg.version
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
