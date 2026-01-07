import * as Sentry from '@sentry/nuxt'

Sentry.init({
  dsn: 'https://27c2bc691e512298040726bf5de7608a@o4508727277256704.ingest.de.sentry.io/4510667866243152',

  // We recommend adjusting this value in production, or using tracesSampler
  // for finer control
  tracesSampleRate: 1.0,

  integrations: [Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] })],

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending of user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nuxt/configuration/options/#sendDefaultPii
  sendDefaultPii: true,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  environment: process.env.NODE_ENV || 'development'
})
