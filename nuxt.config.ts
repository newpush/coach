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
        {
          name: 'description',
          content: 'AI-powered endurance coaching platform that adapts to your training.'
        },
        { name: 'apple-mobile-web-app-title', content: 'Coach Watts' },
        { name: 'application-name', content: 'Coach Watts' },
        { property: 'og:site_name', content: 'Coach Watts' },
        { property: 'og:type', content: 'website' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:site', content: '@coachwatts' }
      ],
      link: [{ rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }]
    }
  },

  modules: [
    '@nuxt/ui',
    '@sidebase/nuxt-auth',
    '@nuxtjs/mdc',
    '@pinia/nuxt',
    'nuxt-gtag',
    '@sentry/nuxt/module',
    '@nuxt/eslint'
  ],

  colorMode: {
    preference: 'dark',
    fallback: 'dark'
  },

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
    },
    // Ensure unhead is properly bundled/traced
    externals: {
      inline: ['unhead']
    }
  },

  css: ['~/assets/css/main.css'],

  auth: {
    baseURL: '/api/auth',
    provider: {
      type: 'authjs'
    },
    session: {
      enableRefreshPeriodically: true,
      enableRefreshOnWindowFocus: true
    }
  },

  runtimeConfig: {
    authOrigin: process.env.NUXT_AUTH_ORIGIN || 'http://localhost:3099/api/auth',
    authBypassEnabled: !!process.env.AUTH_BYPASS_USER,
    authBypassUser: process.env.AUTH_BYPASS_USER || '',
    authBypassName: process.env.AUTH_BYPASS_NAME || '',
    public: {
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3099',
      version: pkg.version,
      authBypassEnabled: !!process.env.AUTH_BYPASS_USER,
      authBypassUser: process.env.AUTH_BYPASS_USER || '',
      authBypassName: process.env.AUTH_BYPASS_NAME || '',
      gtag: {
        id: 'GTM-WJK5K3HK'
      }
    }
  },

  devServer: {
    port: 3099
  },

  build: {
    transpile: ['@vue-leaflet/vue-leaflet']
  },

  vite: {
    optimizeDeps: {
      include: ['prosemirror-state']
    },
    vue: {
      template: {
        compilerOptions: {
          isCustomElement: (tag) => ['rapi-doc'].includes(tag)
        }
      }
    }
  },

  sentry: {
    org: 'newpush-y4',
    project: 'coach-watts'
  },

  sourcemap: {
    client: 'hidden'
  }
})
