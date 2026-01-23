import pkg from './package.json'

const getGitCommitHash = () => {
  if (process.env.NUXT_PUBLIC_COMMIT_HASH) {
    return process.env.NUXT_PUBLIC_COMMIT_HASH
  }
  if (process.env.COMMIT_SHA) {
    return process.env.COMMIT_SHA.substring(0, 7)
  }
  if (process.env.REVISION_ID) {
    return process.env.REVISION_ID.substring(0, 7)
  }
  if (process.env.SHORT_SHA) {
    return process.env.SHORT_SHA
  }
  if (process.env.BUILD_ID) {
    return process.env.BUILD_ID
  }
  return process.env.NODE_ENV === 'development' ? 'dev' : 'unknown'
}

const commitHash = getGitCommitHash()
const date = new Date()
const buildDate = date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

const sentryRelease = `${pkg.name}@${pkg.version}+${commitHash}`

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },

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
      link: [{ rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }],
      script: [
        {
          innerHTML: `
            (function() {
              window.addEventListener('error', function(event) {
                var errorText = event.message || '';
                if (
                  errorText.includes('Importing a module script failed') ||
                  errorText.includes('Failed to fetch dynamically imported module') ||
                  errorText.includes('loading chunk')
                ) {
                  var now = Date.now();
                  var lastReload = sessionStorage.getItem('chunk-error-reload');
                  if (lastReload && (now - parseInt(lastReload) < 10000)) return;
                  sessionStorage.setItem('chunk-error-reload', now.toString());
                  var url = new URL(window.location.href);
                  url.searchParams.set('reload', now.toString());
                  window.location.href = url.toString();
                }
              }, true);
            })();
          `.replace(/\s+/g, ' '),
          type: 'text/javascript'
        }
      ]
    }
  },

  modules: [
    '@nuxt/ui',
    '@sidebase/nuxt-auth',
    '@nuxtjs/mdc',
    '@pinia/nuxt',
    'nuxt-gtag',
    'nuxt-rate-limit',
    '@sentry/nuxt/module',
    '@nuxt/eslint'
  ],

  colorMode: {
    preference: 'system',
    fallback: 'light'
  },

  nitro: {
    experimental: {
      openAPI: true,
      websocket: true
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

    // Redis / DragonflyDB
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    public: {
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3099',
      version: pkg.version,
      commitHash,
      buildDate,
      sentryRelease,
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
      include: [
        'prosemirror-state',
        'leaflet',
        '@vueuse/core',
        'date-fns',
        'date-fns-tz',
        'vue-chartjs',
        'chart.js',
        'chartjs-adapter-date-fns',
        'vuedraggable',
        '@sentry/nuxt',
        'zod',
        '@internationalized/date'
      ]
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
  },

  rateLimit: {
    exclude: ['/_nuxt/*', '/_ipx/*'],
    redis: process.env.REDIS_URL,
    routes: {
      '/api/integrations/withings/webhook': {
        max: parseInt(process.env.WEBHOOK_RATE_LIMIT_MAX || '100', 10),
        ttl: parseInt(process.env.WEBHOOK_RATE_LIMIT_TTL || '60', 10)
      },
      '/api/integrations/whoop/webhook': {
        max: parseInt(process.env.WEBHOOK_RATE_LIMIT_MAX || '100', 10),
        ttl: parseInt(process.env.WEBHOOK_RATE_LIMIT_TTL || '60', 10)
      },
      '/api/integrations/intervals/webhook': {
        max: parseInt(process.env.WEBHOOK_RATE_LIMIT_MAX || '100', 10),
        ttl: parseInt(process.env.WEBHOOK_RATE_LIMIT_TTL || '60', 10)
      }
    }
  }
})
