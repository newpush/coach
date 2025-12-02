<template>
  <div class="min-h-screen bg-gray-50">
    <nav class="bg-white shadow">
      <div class="container mx-auto px-4">
        <div class="flex justify-between items-center h-16">
          <div class="flex items-center gap-4">
            <UButton to="/dashboard" variant="ghost" icon="i-heroicons-arrow-left" />
            <h1 class="text-xl font-bold">Reports</h1>
          </div>
          <UButton color="gray" @click="signOut({ callbackUrl: '/login' })">
            Sign Out
          </UButton>
        </div>
      </div>
    </nav>
    
    <div class="container mx-auto p-6 max-w-4xl">
      <div class="mb-6 flex justify-between items-center">
        <div>
          <h2 class="text-2xl font-bold">Your Reports</h2>
          <p class="text-gray-600 mt-1">AI-generated training analysis and recommendations</p>
        </div>
        <UButton @click="generateNewReport" :loading="generating">
          <UIcon name="i-heroicons-sparkles" class="w-4 h-4 mr-2" />
          Generate New Report
        </UButton>
      </div>
      
      <div v-if="pending" class="flex justify-center py-20">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary" />
      </div>
      
      <div v-else-if="reports && reports.length > 0" class="space-y-4">
        <UCard
          v-for="report in reports"
          :key="report.id"
          class="cursor-pointer hover:shadow-md transition-shadow"
          @click="navigateTo(`/reports/${report.id}`)"
        >
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-2">
                <h3 class="font-semibold text-lg">{{ getReportTitle(report.type) }}</h3>
                <UBadge :color="getStatusColor(report.status)">
                  {{ report.status }}
                </UBadge>
              </div>
              <p class="text-sm text-gray-600">
                {{ formatDateRange(report.dateRangeStart, report.dateRangeEnd) }}
              </p>
              <p class="text-xs text-gray-500 mt-1">
                Created {{ formatDate(report.createdAt) }}
              </p>
            </div>
            <UIcon name="i-heroicons-chevron-right" class="w-5 h-5 text-gray-400" />
          </div>
        </UCard>
      </div>
      
      <div v-else class="text-center py-20">
        <UIcon name="i-heroicons-document-text" class="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <p class="text-gray-600 mb-4">No reports yet</p>
        <UButton @click="generateNewReport" :loading="generating">
          Generate Your First Report
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { data, signOut } = useAuth()
const generating = ref(false)

definePageMeta({
  middleware: 'auth'
})

const { data: reports, pending, refresh } = await useFetch('/api/reports')

const generateNewReport = async () => {
  generating.value = true
  try {
    const result = await $fetch('/api/reports/generate', {
      method: 'POST'
    })
    await refresh()
    navigateTo(`/reports/${result.reportId}`)
  } catch (error) {
    console.error('Failed to generate report:', error)
  } finally {
    generating.value = false
  }
}

const getReportTitle = (type: string) => {
  const titles: Record<string, string> = {
    'WEEKLY_ANALYSIS': 'Weekly Training Analysis',
    'RACE_PREP': 'Race Preparation Report',
    'DAILY_SUGGESTION': 'Daily Coaching Brief',
    'CUSTOM': 'Custom Report'
  }
  return titles[type] || 'Report'
}

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    'PENDING': 'yellow',
    'PROCESSING': 'blue',
    'COMPLETED': 'green',
    'FAILED': 'red'
  }
  return colors[status] || 'gray'
}

const formatDateRange = (start: string, end: string) => {
  const startDate = new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endDate = new Date(end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${startDate} - ${endDate}`
}

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}
</script>