<template>
  <UModal v-model:open="showConfigModal" title="Configure Custom Report" description="Create a customized analysis report with your specified filters and timeframe">
    <template #content>
      <ReportConfigModal
        @generate="handleCustomReport"
        @close="showConfigModal = false"
      />
    </template>
  </UModal>

  <UDashboardPanel id="reports">
    <template #header>
      <UDashboardNavbar title="Reports">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <div class="flex gap-2 sm:gap-3 items-center">
            <UButton
              @click="showConfigModal = true"
              :loading="reportStore.generating"
              icon="i-heroicons-adjustments-horizontal"
              color="primary"
              variant="solid"
              size="sm"
              class="font-bold"
            >
              <span class="hidden sm:inline">Custom Report</span>
              <span class="sm:hidden">Custom</span>
            </UButton>
            <USeparator orientation="vertical" class="h-6 hidden sm:block" />
            <div class="hidden sm:flex gap-3">
              <UButton
                @click="generateReport('LAST_3_WORKOUTS')"
                :loading="reportStore.generating"
                icon="i-heroicons-chart-bar"
                color="neutral"
                variant="outline"
                size="sm"
                class="font-bold"
              >
                <span class="hidden lg:inline">Last 3 Workouts</span>
                <span class="lg:hidden">Workouts</span>
              </UButton>
              <UButton
                @click="generateReport('WEEKLY_ANALYSIS')"
                :loading="reportStore.generating"
                icon="i-heroicons-calendar"
                color="neutral"
                variant="outline"
                size="sm"
                class="font-bold"
              >
                <span class="hidden lg:inline">Weekly Analysis</span>
                <span class="lg:hidden">Weekly</span>
              </UButton>
              <UButton
                @click="generateReport('LAST_3_NUTRITION')"
                :loading="reportStore.generating"
                icon="i-heroicons-cake"
                color="neutral"
                variant="outline"
                size="sm"
                class="font-bold"
              >
                <span class="hidden lg:inline">Last 3 Days</span>
                <span class="lg:hidden">Nutrition</span>
              </UButton>
              <UButton
                @click="generateReport('LAST_7_NUTRITION')"
                :loading="reportStore.generating"
                icon="i-heroicons-cake"
                color="neutral"
                variant="outline"
                size="sm"
                class="font-bold"
              >
                <span class="hidden lg:inline">Weekly Nutrition</span>
                <span class="lg:hidden">Trends</span>
              </UButton>
            </div>
            <UDropdownMenu
              v-if="!reportStore.generating"
              class="sm:hidden"
              :items="[
                [
                  { label: 'Last 3 Workouts', icon: 'i-heroicons-chart-bar', onSelect: () => generateReport('LAST_3_WORKOUTS') },
                  { label: 'Weekly Analysis', icon: 'i-heroicons-calendar', onSelect: () => generateReport('WEEKLY_ANALYSIS') },
                  { label: 'Last 3 Days (Nutrition)', icon: 'i-heroicons-cake', onSelect: () => generateReport('LAST_3_NUTRITION') },
                  { label: 'Weekly Nutrition', icon: 'i-heroicons-cake', onSelect: () => generateReport('LAST_7_NUTRITION') }
                ]
              ]"
              :content="{ align: 'end' }"
            >
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-heroicons-ellipsis-vertical"
                size="sm"
              />
            </UDropdownMenu>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-6 space-y-6">
        <div>
          <h2 class="text-2xl font-bold">Your Reports</h2>
          <p class="text-muted mt-1">AI-generated training analysis and recommendations</p>
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-2">
            Use the <strong>Custom Report</strong> button to configure exactly what you want to analyze with filters for timeframe, workout types, and focus areas.
          </p>
        </div>
        
        <!-- Reports Table -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div v-if="reportStore.status === 'pending'" class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Report Type</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date Range</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Created</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-for="i in 5" :key="i">
                  <td v-for="j in 5" :key="j" class="px-6 py-4">
                    <USkeleton class="h-4 w-full" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <div v-else-if="reportStore.status === 'error'" class="p-8 text-center text-red-600 dark:text-red-400">
            <UIcon name="i-heroicons-exclamation-circle" class="w-8 h-8 mx-auto mb-2" />
            <p>Error loading reports</p>
            <UButton size="sm" color="neutral" variant="solid" class="mt-2" @click="() => reportStore.fetchReports()">Retry</UButton>
          </div>

          <div v-else-if="!reportStore.reports.length" class="p-8 text-center text-gray-600 dark:text-gray-400">
            <UIcon name="i-heroicons-document-text" class="w-16 h-16 text-muted mx-auto mb-4" />
            <p class="mb-4">No reports yet</p>
            <div class="flex flex-col sm:flex-row gap-3 justify-center flex-wrap">
              <UButton
                @click="showConfigModal = true"
                :loading="reportStore.generating"
                size="lg"
              >
                <UIcon name="i-heroicons-adjustments-horizontal" class="w-5 h-5 mr-2" />
                Create Custom Report
              </UButton>
              
              <UButton
                @click="generateReport('LAST_3_WORKOUTS')"
                :loading="reportStore.generating"
                variant="outline"
              >
                <UIcon name="i-heroicons-chart-bar" class="w-4 h-4 mr-2" />
                Last 3 Workouts
              </UButton>
              <UButton
                @click="generateReport('WEEKLY_ANALYSIS')"
                :loading="reportStore.generating"
                variant="outline"
              >
                <UIcon name="i-heroicons-calendar" class="w-4 h-4 mr-2" />
                Weekly Analysis
              </UButton>
            </div>
          </div>
          
          <div v-else class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Report Type
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Date Range
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Created
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                <tr
                  v-for="report in reportStore.reports"
                  :key="report.id"
                  class="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <td class="px-6 py-4 text-sm text-gray-900 dark:text-white">
                    <div class="flex items-center gap-2">
                      <UIcon :name="getReportIcon(report.type)" class="w-5 h-5 text-primary" />
                      <span class="font-medium">{{ getReportTitle(report.type) }}</span>
                    </div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ formatDateRange(report.dateRangeStart, report.dateRangeEnd) }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm">
                    <span :class="getStatusBadgeClass(report.status)">
                      {{ report.status }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ formatDateTime(report.createdAt) }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm">
                    <UButton
                      size="xs"
                      color="primary"
                      variant="outline"
                      @click="navigateTo(`/report/${report.id}`)"
                    >
                      View Report
                    </UButton>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>

  </UDashboardPanel>
</template>

<script setup lang="ts">
// State
const showConfigModal = ref(false)
const toast = useToast()
const { formatDate: baseFormatDate, formatDateTime } = useFormat()

const reportStore = useReportStore()

definePageMeta({
  middleware: 'auth'
})

useHead({
  title: 'Reports',
  meta: [
    { name: 'description', content: 'Generate and view AI-powered coaching reports, including weekly analysis, workout insights, and nutrition reviews.' },
    { property: 'og:title', content: 'Reports | Coach Watts' },
    { property: 'og:description', content: 'Generate and view AI-powered coaching reports, including weekly analysis, workout insights, and nutrition reviews.' }
  ]
})

// Fetch reports data on mount
onMounted(() => {
    reportStore.fetchReports()
})

// Centralized report type configuration
const REPORT_TYPE_CONFIG = {
  'LAST_3_WORKOUTS': {
    label: 'Last 3 Workouts Analysis',
    icon: 'i-heroicons-chart-bar',
    description: 'Analyze your 3 most recent endurance workouts to identify trends, progression, and recovery patterns.'
  },
  'WEEKLY_ANALYSIS': {
    label: 'Weekly Training Analysis',
    icon: 'i-heroicons-calendar',
    description: 'Comprehensive analysis of the last 30 days of training including workouts, recovery metrics, and recommendations.'
  },
  'LAST_3_NUTRITION': {
    label: 'Last 3 Days Nutrition',
    icon: 'i-heroicons-cake',
    description: 'Nutrition analysis of your last 3 days of dietary intake including macros, calories, and recommendations.'
  },
  'LAST_7_NUTRITION': {
    label: 'Weekly Nutrition Analysis',
    icon: 'i-heroicons-cake',
    description: 'Comprehensive weekly nutrition analysis including patterns, consistency, and optimization opportunities.'
  },
  'RACE_PREP': {
    label: 'Race Preparation Report',
    icon: 'i-heroicons-trophy',
    description: 'Comprehensive race preparation analysis with taper recommendations and readiness assessment.'
  },
  'DAILY_SUGGESTION': {
    label: 'Daily Coaching Brief',
    icon: 'i-heroicons-light-bulb',
    description: 'Daily training suggestions based on your current fitness and recovery status.'
  },
  'CUSTOM': {
    label: 'Custom Report',
    icon: 'i-heroicons-adjustments-horizontal',
    description: 'Custom training analysis report with your specified filters.'
  }
} as const

const generateReport = async (reportType: string) => {
  try {
    const reportId = await reportStore.generateReport(reportType)
    navigateTo(`/report/${reportId}`)
  } catch (error) {
    // Error handling is done in store
  }
}

const handleCustomReport = async (config: any) => {
  showConfigModal.value = false
  
  try {
    const reportId = await reportStore.generateReport('CUSTOM', config)
    navigateTo(`/report/${reportId}`)
  } catch (error) {
    // Error handling is done in store
  }
}

const getReportTitle = (type: string): string => {
  type ReportTypeKey = keyof typeof REPORT_TYPE_CONFIG
  if (type in REPORT_TYPE_CONFIG) {
    return REPORT_TYPE_CONFIG[type as ReportTypeKey].label
  }
  return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

const getReportIcon = (type: string): string => {
  type ReportTypeKey = keyof typeof REPORT_TYPE_CONFIG
  if (type in REPORT_TYPE_CONFIG) {
    return REPORT_TYPE_CONFIG[type as ReportTypeKey].icon
  }
  return 'i-heroicons-document-text'
}

const getStatusBadgeClass = (status: string) => {
  const baseClass = 'px-2 py-1 rounded text-xs font-medium'
  if (status === 'COMPLETED') return `${baseClass} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`
  if (status === 'PROCESSING') return `${baseClass} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`
  if (status === 'PENDING') return `${baseClass} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`
  if (status === 'FAILED') return `${baseClass} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`
  return `${baseClass} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300`
}

const formatDateRange = (start: string, end: string) => {
  const startDateStr = baseFormatDate(start, 'MMM d')
  const endDateStr = baseFormatDate(end, 'MMM d, yyyy')
  return `${startDateStr} - ${endDateStr}`
}
</script>
