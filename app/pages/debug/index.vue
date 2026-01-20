<template>
  <div class="p-8 max-w-6xl mx-auto space-y-8">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">System Debugger</h1>
      <UButton icon="i-heroicons-clipboard" color="primary" @click="copyReport">
        Copy Full Report
      </UButton>
    </div>

    <!-- Timezone & Date Logic -->
    <div class="space-y-4">
      <h2 class="text-xl font-semibold flex items-center gap-2">
        <UIcon name="i-heroicons-clock" />
        Time & Date
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Client Side -->
        <UCard>
          <template #header>
            <h3 class="font-bold">Client (Browser)</h3>
          </template>
          <div class="space-y-2 text-sm font-mono">
            <div>
              <span class="text-gray-500">Timezone:</span>
              <div class="font-bold">{{ clientInfo.timezone }}</div>
            </div>
            <div>
              <span class="text-gray-500">Current Time:</span>
              <div>{{ clientInfo.time }}</div>
            </div>
            <div>
              <span class="text-gray-500">ISO String:</span>
              <div>{{ clientInfo.iso }}</div>
            </div>
            <div>
              <span class="text-gray-500">User Agent:</span>
              <div class="break-all text-xs text-gray-400">{{ clientInfo.userAgent }}</div>
            </div>
          </div>
        </UCard>

        <!-- Server Side -->
        <UCard>
          <template #header>
            <h3 class="font-bold">Server (API)</h3>
          </template>
          <div v-if="data" class="space-y-2 text-sm font-mono">
            <div>
              <span class="text-gray-500">Timezone:</span>
              <div class="font-bold">{{ data.time.serverTimezone }}</div>
            </div>
            <div>
              <span class="text-gray-500">Current Time:</span>
              <div>{{ data.time.serverTime }}</div>
            </div>
            <div>
              <span class="text-gray-500">ISO String:</span>
              <div>{{ data.time.serverTimeISO }}</div>
            </div>
            <div>
              <span class="text-gray-500">process.env.TZ:</span>
              <div>{{ data.time.processEnvTZ || 'Not Set' }}</div>
            </div>
          </div>
          <div v-else class="flex items-center justify-center h-40">
            <UIcon name="i-heroicons-arrow-path" class="animate-spin w-6 h-6" />
          </div>
        </UCard>
      </div>
    </div>

    <!-- Application State & Tests -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <UCard>
        <template #header>
          <h3 class="font-bold flex items-center gap-2">
            <UIcon name="i-heroicons-user" />
            User Context
          </h3>
        </template>
        <div class="space-y-2 text-sm font-mono">
          <div>
            <span class="text-gray-500">Profile Timezone:</span>
            <div class="font-bold">{{ user?.timezone || 'Not Set' }}</div>
          </div>
          <div>
            <span class="text-gray-500">User ID:</span>
            <div class="text-xs">{{ user?.id }}</div>
          </div>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h3 class="font-bold flex items-center gap-2">
            <UIcon name="i-heroicons-beaker" />
            Calendar Logic Verification
          </h3>
        </template>
        <div class="pt-2">
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div class="p-2 bg-gray-50 dark:bg-gray-800 rounded">
              <span class="text-gray-500 block mb-1">Jan 18, 2026</span>
              <div
                class="font-bold text-lg"
                :class="testDate2026.startsWith('Sunday') ? 'text-green-600' : 'text-red-600'"
              >
                {{ testDate2026 }}
              </div>
              <div class="text-xs text-gray-400">Target: Sunday</div>
            </div>
            <div class="p-2 bg-gray-50 dark:bg-gray-800 rounded">
              <span class="text-gray-500 block mb-1">Jan 18, 2027</span>
              <div
                class="font-bold text-lg"
                :class="testDate2027.startsWith('Monday') ? 'text-green-600' : 'text-red-600'"
              >
                {{ testDate2027 }}
              </div>
              <div class="text-xs text-gray-400">Target: Monday</div>
            </div>
          </div>
        </div>
      </UCard>
    </div>

    <!-- System Info (New) -->
    <div v-if="data" class="space-y-4">
      <h2 class="text-xl font-semibold flex items-center gap-2">
        <UIcon name="i-heroicons-cpu-chip" />
        System Information
      </h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <UCard :ui="{ body: { padding: 'p-3' } }">
          <div class="text-xs text-gray-500">Platform</div>
          <div class="font-bold">{{ data.system.platform }} ({{ data.system.arch }})</div>
        </UCard>
        <UCard :ui="{ body: { padding: 'p-3' } }">
          <div class="text-xs text-gray-500">Node Version</div>
          <div class="font-bold">{{ data.system.nodeVersion }}</div>
        </UCard>
        <UCard :ui="{ body: { padding: 'p-3' } }">
          <div class="text-xs text-gray-500">Uptime</div>
          <div class="font-bold">{{ formatUptime(data.system.uptime) }}</div>
        </UCard>
        <UCard :ui="{ body: { padding: 'p-3' } }">
          <div class="text-xs text-gray-500">Memory (RSS)</div>
          <div class="font-bold">{{ formatBytes(data.system.memoryUsage.rss) }}</div>
        </UCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  const { data: user } = useAuth()

  // Client Info
  const clientInfo = ref({
    timezone: '',
    time: '',
    iso: '',
    userAgent: ''
  })

  // Server Info
  const { data } = await useFetch('/api/debug/system')

  // Calendar Tests
  const testDate2026 = ref('')
  const testDate2027 = ref('')

  onMounted(() => {
    // Capture Client Info
    const now = new Date()
    clientInfo.value = {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      time: now.toString(),
      iso: now.toISOString(),
      userAgent: navigator.userAgent
    }

    // Run Calendar Logic Tests
    const d2026 = new Date('2026-01-18T12:00:00')
    testDate2026.value = d2026.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })

    const d2027 = new Date('2027-01-18T12:00:00')
    testDate2027.value = d2027.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  })

  const copyReport = () => {
    const report = {
      client: clientInfo.value,
      server: data.value,
      userProfile: {
        timezone: user.value?.timezone,
        id: user.value?.id
      },
      calendarTest: {
        jan18_2026: testDate2026.value,
        jan18_2027: testDate2027.value
      }
    }

    navigator.clipboard.writeText(JSON.stringify(report, null, 2))

    const toast = useToast()
    toast.add({
      title: 'Report Copied',
      description: 'Paste this into the chat to help us debug.',
      color: 'success'
    })
  }

  function formatUptime(seconds: number) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return `${h}h ${m}m`
  }

  function formatBytes(bytes: number) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
</script>
