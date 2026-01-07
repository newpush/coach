import * as Sentry from '@sentry/nuxt'

export default defineNitroPlugin((nitroApp) => {
  // Only enable JSON logging in production or if explicitly requested via env var
  // This preserves pretty printing during local development
  if (process.env.NODE_ENV !== 'production' && process.env.LOG_FORMAT !== 'json') {
    return
  }

  function formatJsonLog(severity: string, ...args: any[]) {
    const output: Record<string, any> = {
      severity,
      // timestamp is added automatically by Cloud Logging, but adding it doesn't hurt
      timestamp: new Date().toISOString(),
    }

    // Heuristic to determine 'message' vs 'payload'
    if (args.length === 0) {
      // Empty log
      output.message = ''
    } else if (args.length === 1) {
      const arg = args[0]
      if (arg instanceof Error) {
        // Handle Error objects
        output.message = arg.message
        output.stack_trace = arg.stack
        output.error_name = arg.name
      } else if (typeof arg === 'string') {
        // Single string message
        output.message = arg
      } else if (typeof arg === 'object' && arg !== null) {
        // Single object - merge it into the top level for querying
        // e.g. console.log({ workoutId: 1 }) -> { severity: 'INFO', workoutId: 1 }
        Object.assign(output, arg)
        
        // Ensure there is a textual message for the logs viewer summary
        if (!output.message) {
           output.message = JSON.stringify(arg)
        }
      } else {
        // Primitives like numbers, booleans
        output.message = String(arg)
      }
    } else {
      // Multiple arguments
      // Common pattern: console.log('Label', data)
      if (typeof args[0] === 'string') {
        output.message = args[0]
        
        // If the 2nd arg is an object, merge it in
        if (args.length === 2 && typeof args[1] === 'object' && args[1] !== null && !(args[1] instanceof Error)) {
           Object.assign(output, args[1])
        } else {
           // Otherwise put extra args in a 'data' array or similar
           // or just JSON stringify the rest for the message? 
           // Better for Cloud Logging: put structured data in a field
           output.data = args.slice(1)
        }
      } else {
        // Mixed args, just join them for the message
        output.message = args.map(a => 
          typeof a === 'object' ? JSON.stringify(a) : String(a)
        ).join(' ')
      }
    }

    // Manual Sentry Breadcrumb
    // Since we are bypassing the original console (which Sentry wraps), we must manually record the breadcrumb.
    try {
      const sentryLevel = severity === 'WARNING' ? 'warning' : severity === 'ERROR' ? 'error' : 'info'
      Sentry.addBreadcrumb({
        category: 'console',
        message: output.message,
        level: sentryLevel,
        data: output // Attach full data context to Sentry breadcrumb
      })
    } catch (e) {
      // Ignore Sentry errors (e.g. if not initialized)
    }

    // Google Cloud Logging specialized fields
    // If we have a trace ID in the context (not easy to get globally without AsyncLocalStorage), we'd add it here.
    
    // Write to stdout as a single line JSON string
    process.stdout.write(JSON.stringify(output) + '\n')
  }

  // Patch console methods
  console.log = (...args) => formatJsonLog('INFO', ...args)
  console.info = (...args) => formatJsonLog('INFO', ...args)
  console.warn = (...args) => formatJsonLog('WARNING', ...args)
  console.error = (...args) => formatJsonLog('ERROR', ...args)
  console.debug = (...args) => formatJsonLog('DEBUG', ...args)
})