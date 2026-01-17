<script setup lang="ts">
  definePageMeta({
    layout: 'admin',
    middleware: ['auth', 'admin']
  })

  const url = ref('')
  const method = ref('GET')
  const loading = ref(false)
  const result = ref<any>(null)

  const methods = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'PATCH']

  async function handlePing() {
    if (!url.value) return

    loading.value = true
    result.value = null

    try {
      const data = await $fetch('/api/admin/debug/ping', {
        method: 'POST',
        body: { url: url.value, method: method.value }
      })
      result.value = data
    } catch (e: any) {
      // This catch handles API errors (e.g. 403 Forbidden), not the fetch result itself which is handled by the API
      result.value = {
        success: false,
        error: e.message || 'Unknown error occurred calling the API'
      }
    } finally {
      loading.value = false
    }
  }

  const statusColor = computed(() => {
    if (!result.value) return 'neutral'
    if (result.value.success) return 'success'
    if (result.value.status >= 400 && result.value.status < 500) return 'warning'
    return 'error'
  })
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Network Ping Debug" />
    </template>

    <template #body>
      <div class="p-4 sm:p-6 space-y-6">
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-globe-alt" class="w-5 h-5 text-gray-500" />
              <h3 class="text-base font-semibold leading-6 text-gray-900 dark:text-white">
                Server-Side Request
              </h3>
            </div>
          </template>

          <form
            class="flex flex-col sm:flex-row gap-4 items-start sm:items-end"
            @submit.prevent="handlePing"
          >
            <UFormField label="Method" name="method" class="w-full sm:w-32">
              <USelect v-model="method" :options="methods" />
            </UFormField>

            <UFormField label="Target URL" name="url" class="flex-1 w-full" required>
              <UInput
                v-model="url"
                placeholder="https://api.example.com/health"
                icon="i-heroicons-link"
                class="w-full"
              />
            </UFormField>

            <UButton
              type="submit"
              label="Ping"
              color="primary"
              :loading="loading"
              icon="i-heroicons-paper-airplane"
              class="w-full sm:w-auto"
            />
          </form>
        </UCard>

        <UCard v-if="result" :ui="{ body: 'p-0' }">
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                Result
                <UBadge :color="statusColor" variant="subtle" size="xs">
                  {{
                    result.status ? `${result.status} ${result.statusText || ''}` : 'Network Error'
                  }}
                </UBadge>
              </h3>
              <div class="text-xs text-gray-500 font-mono">{{ result.duration }}ms</div>
            </div>
          </template>

          <div
            v-if="result.error"
            class="p-4 bg-red-50 dark:bg-red-900/10 border-b border-red-100 dark:border-red-900/20"
          >
            <p class="text-sm text-red-600 dark:text-red-400 font-medium">
              Error: {{ result.error }}
            </p>
            <p v-if="result.code" class="text-xs text-red-500 mt-1 font-mono">
              Code: {{ result.code }}
            </p>
          </div>

          <div v-if="result.headers" class="border-b border-gray-200 dark:border-gray-800">
            <UAccordion
              color="white"
              variant="soft"
              size="sm"
              :items="[
                { label: 'Response Headers', slot: 'headers', icon: 'i-heroicons-list-bullet' }
              ]"
            >
              <template #headers>
                <div
                  class="p-4 bg-gray-50 dark:bg-gray-900 max-h-48 overflow-y-auto font-mono text-xs"
                >
                  <div v-for="(val, key) in result.headers" :key="key" class="flex gap-2">
                    <span class="text-gray-500 shrink-0">{{ key }}:</span>
                    <span class="text-gray-900 dark:text-gray-300 break-all">{{ val }}</span>
                  </div>
                </div>
              </template>
            </UAccordion>
          </div>

          <div class="p-0">
            <div
              class="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wider"
            >
              Response Body
            </div>
            <pre
              class="p-4 bg-white dark:bg-gray-950 overflow-x-auto text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap max-h-[500px]"
              >{{ result.body || '(Empty body)' }}</pre
            >
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
