<script setup lang="ts">
import * as Sentry from "@sentry/nuxt";

definePageMeta({
  middleware: 'auth'
})

const triggerSentryLogger = () => {
  // Note: Sentry.logger is an internal utility for Sentry's own debugging.
  // It only prints to the console if 'debug: true' is set in Sentry.init.
  // It does NOT send events to the Sentry Dashboard.
  // @ts-ignore
  if (Sentry.logger && typeof Sentry.logger.info === 'function') {
    // @ts-ignore
    Sentry.logger.info('User triggered test log (Console only)', { log_source: 'sentry_test' });
    alert('Sentry.logger.info called. Check browser console.');
  } else {
    console.warn('Sentry.logger.info is not available or internal logging is disabled.');
    alert('Sentry.logger is not enabled. Set debug: true in Sentry.init to see these logs in console.');
  }
};

const triggerCaptureMessage = () => {
  Sentry.captureMessage('Test message captured via Sentry.captureMessage', {
    level: 'info',
    extra: { log_source: 'sentry_test' }
  });
};

const triggerConsoleLog = () => {
  console.log('User triggered standard console.log', { log_source: 'sentry_test' });
};

const triggerError = () => {
  try {
    throw new Error("Sentry Test Error from Debug Page");
  } catch (e) {
    Sentry.captureException(e);
  }
};

const loadingServer = ref(false);
const triggerServerLog = async () => {
  loadingServer.value = true;
  try {
    await $fetch('/api/debug/sentry', { method: 'POST' });
    alert('Server logs triggered. Check your Sentry dashboard and server console.');
  } catch (e) {
    console.error(e);
    alert('Failed to trigger server logs');
  } finally {
    loadingServer.value = false;
  }
};
</script>

<template>
  <UContainer class="py-10">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h1 class="text-xl font-bold">Sentry Debug Test</h1>
          <UButton to="/dashboard" variant="ghost" icon="i-heroicons-home" />
        </div>
      </template>

      <div class="flex flex-col gap-4">
        <p class="text-sm text-gray-500 mb-4">
          Use these buttons to verify your Sentry configuration.
        </p>

        <UButton color="info" @click="triggerSentryLogger">
          Trigger Sentry.logger.info (As requested)
        </UButton>
        
        <UButton color="primary" @click="triggerCaptureMessage">
          Trigger Sentry.captureMessage
        </UButton>
        
        <UButton color="neutral" @click="triggerConsoleLog">
          Trigger console.log (Caught by consoleLoggingIntegration)
        </UButton>

        <UButton color="error" @click="triggerError">
          Trigger and Capture Exception
        </UButton>

        <UDivider label="Server Side" />

        <UButton color="neutral" @click="triggerServerLog" :loading="loadingServer">
          Trigger Server-Side Logs
        </UButton>
      </div>

      <template #footer>
        <p class="text-xs text-gray-400">
          Check your Sentry dashboard at: <br>
          <code class="text-blue-400">https://newpush-y4.sentry.io/projects/coach-watts/</code>
        </p>
      </template>
    </UCard>
  </UContainer>
</template>
