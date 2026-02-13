<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="System Debugger">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-heroicons-clipboard"
            color="primary"
            variant="solid"
            size="sm"
            @click="copyReport"
          >
            Copy Full Report
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-8 max-w-6xl mx-auto space-y-8">
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
                <div class="font-bold">{{ (session?.user as any)?.timezone || 'Not Set' }}</div>
              </div>
              <div>
                <span class="text-gray-500">User ID:</span>
                <div class="text-xs">{{ (session?.user as any)?.id }}</div>
              </div>
            </div>
          </UCard>

          <!-- Calendar Logic Verification -->
          <UCard>
            <template #header>
              <h3 class="font-bold flex items-center gap-2">
                <UIcon name="i-heroicons-beaker" />
                Calendar Logic Verification (Live)
              </h3>
            </template>
            <div class="space-y-4">
              <!-- Date Function Outputs -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div class="p-2 bg-gray-50 dark:bg-gray-800 rounded">
                  <span class="text-gray-500 block mb-1">getUserLocalDate() (UTC):</span>
                  <div class="font-mono font-bold">{{ userLocalDate }}</div>
                </div>
                <div class="p-2 bg-gray-50 dark:bg-gray-800 rounded">
                  <span class="text-gray-500 block mb-1">Target Month Start:</span>
                  <div class="font-mono font-bold">{{ monthStartStr }}</div>
                </div>
              </div>

              <!-- Generated Grid Preview -->
              <div>
                <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  Generated Grid (First 3 Weeks)
                </h4>
                <div
                  class="border border-gray-200 dark:border-gray-700 rounded overflow-hidden text-xs"
                >
                  <div
                    class="grid grid-cols-8 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 font-bold p-1"
                  >
                    <div>Week</div>
                    <div>Mon</div>
                    <div>Tue</div>
                    <div>Wed</div>
                    <div>Thu</div>
                    <div>Fri</div>
                    <div>Sat</div>
                    <div>Sun</div>
                  </div>
                  <div
                    v-for="(week, i) in previewWeeks"
                    :key="i"
                    class="grid grid-cols-8 border-b border-gray-200 dark:border-gray-700 last:border-0 p-1"
                  >
                    <div class="text-gray-400 font-mono">W{{ week.number }}</div>
                    <div
                      v-for="day in week.days"
                      :key="day.date"
                      class="font-mono"
                      :class="{
                        'text-gray-300 dark:text-gray-600': day.isOtherMonth,
                        'text-blue-600 font-bold': day.isToday
                      }"
                    >
                      {{ day.label }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Workout Date Debugging -->
        <UCard v-if="workouts">
          <template #header>
            <h3 class="font-bold flex items-center gap-2">
              <UIcon name="i-heroicons-bolt" />
              Workout Date Verification
            </h3>
          </template>
          <div class="space-y-6">
            <div>
              <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Recent Completed Workouts
              </h4>
              <UTable
                :columns="workoutColumns"
                :data="workouts.recentWorkouts.map((w) => enrichWorkoutDate(w))"
                :ui="{ td: 'px-2 py-1 text-xs' }"
              />
            </div>
            <div>
              <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Upcoming Planned Workouts
              </h4>
              <UTable
                :columns="workoutColumns"
                :data="workouts.plannedWorkouts.map((w) => enrichWorkoutDate(w))"
                :ui="{ td: 'px-2 py-1 text-xs' }"
              />
            </div>
          </div>
        </UCard>

        <!-- System Info (New) -->
        <div v-if="data" class="space-y-4">
          <h2 class="text-xl font-semibold flex items-center gap-2">
            <UIcon name="i-heroicons-cpu-chip" />
            System Information
          </h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <UCard :ui="{ body: 'p-3' }">
              <div class="text-xs text-gray-500">Platform</div>
              <div class="font-bold">{{ data.system.platform }} ({{ data.system.arch }})</div>
            </UCard>
            <UCard :ui="{ body: 'p-3' }">
              <div class="text-xs text-gray-500">Node Version</div>
              <div class="font-bold">{{ data.system.nodeVersion }}</div>
            </UCard>
            <UCard :ui="{ body: 'p-3' }">
              <div class="text-xs text-gray-500">Uptime</div>
              <div class="font-bold">{{ formatUptime(data.system.uptime) }}</div>
            </UCard>
            <UCard :ui="{ body: 'p-3' }">
              <div class="text-xs text-gray-500">Memory (RSS)</div>
              <div class="font-bold">{{ formatBytes(data.system.memoryUsage.rss) }}</div>
            </UCard>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
  import { format, getISOWeek } from 'date-fns'

  useHead({
    title: 'System Debugger',
    meta: [{ name: 'robots', content: 'noindex' }]
  })

  const { data: session } = useAuth()
  const { getUserLocalDate, formatDateUTC, formatUserDate, formatDate } = useFormat()

  // Client Info
  const clientInfo = ref({
    timezone: '',
    time: '',
    iso: '',
    userAgent: ''
  })

  // Server Info
  const { data } = await useFetch('/api/debug/system')
  const { data: workouts } = await useFetch('/api/debug/workouts')

  // Calendar Logic Replication
  const userLocalDate = ref('')
  const monthStartStr = ref('')
  const previewWeeks = ref<any[]>([])

  // Workout Table Columns
  const workoutColumns = [
    { accessorKey: 'title', header: 'Title', id: 'title' },
    { accessorKey: 'dbDate', header: 'DB Date (ISO)', id: 'dbDate' },
    { accessorKey: 'utcFormat', header: 'formatDateUTC', id: 'utcFormat' },
    { accessorKey: 'userFormat', header: 'formatUserDate', id: 'userFormat' },
    { accessorKey: 'stdFormat', header: 'formatDate', id: 'stdFormat' }
  ]

  function enrichWorkoutDate(w: any) {
    const timezone = (session.value?.user as any)?.timezone || 'UTC'
    return {
      ...w,
      dbDate: w.date,
      utcFormat: formatDateUTC(w.date, 'yyyy-MM-dd HH:mm'),
      userFormat: formatUserDate(w.date, timezone, 'yyyy-MM-dd HH:mm'),
      stdFormat: formatDate(w.date, 'yyyy-MM-dd HH:mm')
    }
  }

  onMounted(() => {
    // Capture Client Info
    const now = new Date()
    clientInfo.value = {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      time: now.toString(),
      iso: now.toISOString(),
      userAgent: navigator.userAgent
    }

    // 1. Get "Current Date" using app logic
    const currentDate = getUserLocalDate()
    userLocalDate.value = currentDate.toISOString()

    // 2. Replicate activities.vue logic EXACTLY
    const year = currentDate.getUTCFullYear()
    const month = currentDate.getUTCMonth()
    const monthStart = new Date(Date.UTC(year, month, 1))
    monthStartStr.value = monthStart.toISOString()

    // Find start of week (Monday)
    const dayOfWeek = monthStart.getUTCDay()
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const start = new Date(monthStart)
    start.setUTCDate(monthStart.getUTCDate() + diffToMonday)

    // Generate 3 weeks for preview
    const weeks = []
    const dayIterator = new Date(start)

    for (let w = 0; w < 3; w++) {
      const currentWeekDays: any[] = []
      for (let d = 0; d < 7; d++) {
        const day = new Date(dayIterator)
        const dateStr = day.toISOString().split('T')[0]

        currentWeekDays.push({
          date: dateStr,
          label: `${day.getUTCDate()} ${format(day, 'MMM')}`,
          isOtherMonth: day.getUTCMonth() !== month,
          isToday: dateStr === userLocalDate.value.split('T')[0]
        })

        dayIterator.setUTCDate(dayIterator.getUTCDate() + 1)
      }

      if (currentWeekDays.length > 0) {
        weeks.push({
          number: getISOWeek(new Date(currentWeekDays[0].date)),
          days: currentWeekDays
        })
      }
    }

    previewWeeks.value = weeks
  })

  const copyReport = () => {
    const report = {
      client: clientInfo.value,
      server: data.value,
      userProfile: {
        timezone: (session.value?.user as any)?.timezone,
        id: (session.value?.user as any)?.id
      },
      calendarLogic: {
        userLocalDate: userLocalDate.value,
        monthStart: monthStartStr.value,
        previewWeeks: previewWeeks.value
      },
      workouts: workouts.value
        ? {
            recent: workouts.value.recentWorkouts.map((w) => enrichWorkoutDate(w)),
            planned: workouts.value.plannedWorkouts.map((w) => enrichWorkoutDate(w))
          }
        : null
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
