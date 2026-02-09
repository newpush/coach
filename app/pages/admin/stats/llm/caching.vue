<script setup lang="ts">
  import {
    Chart as ChartJS,
    Tooltip,
    Legend,
    BarElement,
    CategoryScale,
    LinearScale
  } from 'chart.js'
  import { Bar } from 'vue-chartjs'

  ChartJS.register(Tooltip, Legend, BarElement, CategoryScale, LinearScale)

  definePageMeta({
    layout: 'admin',
    middleware: ['auth', 'admin']
  })

  const { data: stats, pending } = await useFetch('/api/admin/stats/llm/overview')

  useHead({
    title: 'LLM Caching Stats'
  })

  const stackedBarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom' as const,
        labels: {
          boxWidth: 12,
          padding: 15
        }
      }
    },
    scales: {
      x: {
        stacked: true,
        grid: {
          display: false
        }
      },
      y: {
        stacked: true,
        beginAtZero: true
      }
    }
  }

  // Helper to generate consistent colors for models
  const getModelColor = (model: string) => {
    const colors: Record<string, string> = {
      'gemini-2.0-flash-exp': '#3b82f6', // Blue
      'gemini-1.5-flash': '#60a5fa', // Light Blue
      'gemini-1.5-pro': '#8b5cf6', // Purple
      'gpt-4o': '#10b981', // Emerald
      'gpt-4o-mini': '#34d399', // Light Emerald
      'claude-3-5-sonnet': '#f59e0b', // Amber
      'gemini-2.0-flash-thinking-exp': '#ec4899' // Pink
    }
    if (!colors[model]) {
      let hash = 0
      for (let i = 0; i < model.length; i++) {
        hash = model.charCodeAt(i) + ((hash << 5) - hash)
      }
      const c = (hash & 0x00ffffff).toString(16).toUpperCase()
      return '#' + '00000'.substring(0, 6 - c.length) + c
    }
    return colors[model]
  }

  const dailyCachedTokensChartData = computed(() => {
    if (!stats.value?.dailyCachedTokensByModel) return { labels: [], datasets: [] }

    const data = stats.value.dailyCachedTokensByModel
    const dates = [...new Set(data.map((d) => d.date))].sort()
    const models = [...new Set(data.map((d) => d.model))]

    return {
      labels: dates.map((d) =>
        new Date(d!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      ),
      datasets: models.map((model) => {
        return {
          label: model,
          backgroundColor: getModelColor(model),
          data: dates.map((date) => {
            const entry = data.find((d) => d.date === date && d.model === model)
            return entry ? entry.count : 0
          })
        }
      })
    }
  })

  const dailyTokenBreakdownChartData = computed(() => {
    if (!stats.value?.dailyTokenBreakdown) return { labels: [], datasets: [] }

    const data = stats.value.dailyTokenBreakdown
    const dates = data.map((d) => d.date).sort()

    return {
      labels: dates.map((d) =>
        new Date(d!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      ),
      datasets: [
        {
          label: 'Cached Tokens',
          backgroundColor: '#10b981', // Emerald
          data: dates.map((date) => {
            const entry = data.find((d) => d.date === date)
            return entry ? entry.cached : 0
          })
        },
        {
          label: 'Uncached Input',
          backgroundColor: '#3b82f6', // Blue
          data: dates.map((date) => {
            const entry = data.find((d) => d.date === date)
            return entry ? entry.uncached : 0
          })
        }
      ]
    }
  })

  // Hourly Chart Data (Last 48 Hours)
  const hourlyChartLabels = computed(() => {
    if (!stats.value?.hourlyStats) return []
    const hours = [...new Set(stats.value.hourlyStats.map((h) => h.hour))].sort()
    return hours.map((h) => {
      const d = new Date(h)
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      })
    })
  })

  const hourlyEfficiencyChartData = computed(() => {
    if (!stats.value?.hourlyStats) return { labels: [], datasets: [] }

    const data = stats.value.hourlyStats
    const hours = [...new Set(data.map((h) => h.hour))].sort()

    return {
      labels: hourlyChartLabels.value,
      datasets: [
        {
          label: 'Cached Tokens',
          backgroundColor: '#10b981',
          data: hours.map((hour) => {
            const entries = data.filter((d) => d.hour === hour)
            return entries.reduce((sum, e) => sum + e.cached, 0)
          })
        },
        {
          label: 'Uncached Input',
          backgroundColor: '#3b82f6',
          data: hours.map((hour) => {
            const entries = data.filter((d) => d.hour === hour)
            return entries.reduce((sum, e) => sum + e.uncached, 0)
          })
        }
      ]
    }
  })

  const hourlyCachedByModelChartData = computed(() => {
    if (!stats.value?.hourlyStats) return { labels: [], datasets: [] }

    const data = stats.value.hourlyStats
    const hours = [...new Set(data.map((h) => h.hour))].sort()
    const models = [...new Set(data.map((h) => h.model))]

    return {
      labels: hourlyChartLabels.value,
      datasets: models.map((model) => ({
        label: model,
        backgroundColor: getModelColor(model),
        data: hours.map((hour) => {
          const entry = data.find((d) => d.hour === hour && d.model === model)
          return entry ? entry.cached : 0
        })
      }))
    }
  })
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="LLM Caching Performance">
        <template #leading>
          <UButton
            to="/admin/stats/llm"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-6 space-y-6">
        <div v-if="pending" class="flex items-center justify-center p-12">
          <UIcon name="i-lucide-loader-2" class="animate-spin h-8 w-8 text-gray-400" />
        </div>

        <template v-else>
          <!-- Caching Overview Cards -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <UCard class="bg-blue-50/50 dark:bg-blue-900/10">
              <div class="text-center">
                <div class="text-xs font-bold text-blue-500 uppercase tracking-widest mb-1">
                  Total Input Tokens
                </div>
                <div class="text-2xl font-bold font-mono">
                  {{ stats?.totals?.tokens?.prompt?.toLocaleString() ?? '0' }}
                </div>
              </div>
            </UCard>
            <UCard class="bg-emerald-50/50 dark:bg-emerald-900/10">
              <div class="text-center">
                <div class="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-1">
                  Cached Tokens
                </div>
                <div class="text-2xl font-bold font-mono">
                  {{ stats?.totals?.tokens?.cached?.toLocaleString() || '0' }}
                </div>
                <div class="text-xs text-gray-500 mt-1">
                  {{
                    (
                      ((stats?.totals?.tokens?.cached || 0) /
                        (stats?.totals?.tokens?.prompt || 1)) *
                      100
                    ).toFixed(1)
                  }}% Overall Savings
                </div>
              </div>
            </UCard>
            <UCard class="bg-indigo-50/50 dark:bg-indigo-900/10">
              <div class="text-center">
                <div class="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-1">
                  Uncached Input
                </div>
                <div class="text-2xl font-bold font-mono">
                  {{
                    (
                      (stats?.totals?.tokens?.prompt || 0) - (stats?.totals?.tokens?.cached || 0)
                    ).toLocaleString()
                  }}
                </div>
              </div>
            </UCard>
          </div>

          <!-- Daily Efficiency -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <UCard>
              <template #header>
                <h3 class="font-semibold">Daily Input Caching Efficiency</h3>
              </template>
              <div class="h-64 relative">
                <Bar :data="dailyTokenBreakdownChartData" :options="stackedBarOptions" />
              </div>
            </UCard>

            <UCard>
              <template #header>
                <h3 class="font-semibold">Daily Cached Tokens by Model</h3>
              </template>
              <div class="h-64 relative">
                <Bar :data="dailyCachedTokensChartData" :options="stackedBarOptions" />
              </div>
            </UCard>
          </div>

          <!-- Hourly Trends -->
          <div class="space-y-6">
            <div class="flex items-center gap-2 mt-4">
              <UIcon name="i-lucide-clock" class="w-5 h-5 text-gray-400" />
              <h2 class="text-lg font-semibold">Hourly Caching Trends (Past 48 Hours)</h2>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <UCard>
                <template #header>
                  <h3 class="font-semibold">Hourly Caching Efficiency</h3>
                </template>
                <div class="h-64 relative">
                  <Bar :data="hourlyEfficiencyChartData" :options="stackedBarOptions" />
                </div>
              </UCard>

              <UCard>
                <template #header>
                  <h3 class="font-semibold">Hourly Cached Tokens by Model</h3>
                </template>
                <div class="h-64 relative">
                  <Bar :data="hourlyCachedByModelChartData" :options="stackedBarOptions" />
                </div>
              </UCard>
            </div>
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
