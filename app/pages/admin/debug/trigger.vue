<script setup lang="ts">
  definePageMeta({
    layout: 'admin',
    middleware: ['auth', 'admin']
  })

  const loading = ref<string | null>(null)

  const result = ref<{ success: boolean; runId?: string; runUrl?: string; error?: any } | null>(
    null
  )

  const toast = useToast()

  // Fetch Trigger config

  const { data: envData } = await useFetch<any>('/api/admin/debug/env')

  const triggerConfig = computed(() => {
    const env = envData.value?.env || {}

    return {
      apiUrl: env.TRIGGER_API_URL,

      projectRef: env.TRIGGER_PROJECT_REF
    }
  })

  async function triggerTask(taskName: string) {
    loading.value = taskName
    result.value = null
    try {
      const res = await $fetch<{ success: boolean; runId: string; runUrl: string }>(
        '/api/admin/debug/trigger-test',
        {
          method: 'POST',
          body: { taskName }
        }
      )
      result.value = res
      toast.add({ title: 'Task Triggered', description: `Run ID: ${res.runId}`, color: 'success' })
    } catch (e: any) {
      console.error(e)
      result.value = { success: false, error: e.data || e.message }
      toast.add({ title: 'Trigger Failed', description: e.message, color: 'error' })
    } finally {
      loading.value = null
    }
  }
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Trigger.dev Debug" />
    </template>

    <template #body>
      <div class="p-6 space-y-6">
        <UCard>
          <template #header>
            <h3 class="text-base font-semibold leading-6 text-gray-900 dark:text-white">
              Configuration
            </h3>
          </template>

          <dl class="divide-y divide-gray-100 dark:divide-gray-800">
            <div class="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
              <dt class="text-sm font-medium leading-6 text-gray-900 dark:text-white">API URL</dt>
              <dd
                class="mt-1 text-sm leading-6 text-gray-700 dark:text-gray-400 sm:col-span-2 sm:mt-0 font-mono"
              >
                <span
                  v-if="triggerConfig.apiUrl"
                  class="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded"
                  >{{ triggerConfig.apiUrl }}</span
                >
                <span v-else class="text-gray-500 italic">Not Set (Defaults to Cloud)</span>
              </dd>
            </div>
            <div class="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
              <dt class="text-sm font-medium leading-6 text-gray-900 dark:text-white">
                Project Ref
              </dt>
              <dd
                class="mt-1 text-sm leading-6 text-gray-700 dark:text-gray-400 sm:col-span-2 sm:mt-0 font-mono"
              >
                <span
                  v-if="triggerConfig.projectRef"
                  class="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded"
                  >{{ triggerConfig.projectRef }}</span
                >
                <span v-else class="text-red-500 italic">Not Set</span>
              </dd>
            </div>
          </dl>
        </UCard>

        <UCard>
          <template #header>
            <h3 class="text-base font-semibold leading-6 text-gray-900 dark:text-white">
              Trigger Control
            </h3>
          </template>

          <div class="space-y-4">
            <p class="text-sm text-gray-500 dark:text-gray-400">
              Manually trigger tasks to verify the integration and error reporting.
            </p>

            <div class="flex gap-4">
              <UButton
                label="Trigger Hello World"
                color="primary"
                :loading="loading === 'hello-world'"
                @click="triggerTask('hello-world')"
              />

              <UButton
                label="Trigger Error Test"
                color="error"
                :loading="loading === 'sentry-error-test'"
                @click="triggerTask('sentry-error-test')"
              />
            </div>
          </div>
        </UCard>

        <UCard v-if="result">
          <template #header>
            <h3
              class="text-base font-semibold leading-6"
              :class="
                result.success
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              "
            >
              {{ result.success ? 'Trigger Successful' : 'Trigger Failed' }}
            </h3>
          </template>

          <div v-if="result.success" class="space-y-3">
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-600 dark:text-gray-300">Run ID:</span>
              <span
                class="font-mono font-bold text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded select-all"
                >{{ result.runId }}</span
              >
            </div>
            <div>
              <UButton
                v-if="result.runUrl"
                :to="result.runUrl"
                target="_blank"
                color="neutral"
                variant="link"
                icon="i-heroicons-arrow-top-right-on-square"
                label="View in Trigger.dev Dashboard"
                :padded="false"
              />
            </div>
          </div>

          <div v-else class="space-y-2">
            <p class="text-sm font-medium">Error Details:</p>
            <pre
              class="bg-gray-100 dark:bg-gray-900 p-4 rounded text-xs overflow-x-auto text-red-600 whitespace-pre-wrap"
              >{{ result.error }}</pre
            >
          </div>
        </UCard>

        <UCard>
          <template #header>
            <h3 class="text-base font-semibold leading-6 text-gray-900 dark:text-white">
              Additional Info
            </h3>
          </template>
          <div class="prose dark:prose-invert text-sm max-w-none">
            <p>
              Check the
              <NuxtLink to="/admin/stats/webhooks" class="text-primary hover:underline">
                Webhooks Stats
              </NuxtLink>
              for more insights on external events coming into the system.
            </p>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
