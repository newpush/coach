<template>
  <!-- Configure Custom Report Modal (Legacy/Advanced) -->
  <UModal
    v-model:open="showConfigModal"
    title="Configure Custom Report"
    description="Create a customized analysis report with your specified filters and timeframe"
    :ui="{ content: 'sm:max-w-2xl', body: 'p-0 sm:p-0' }"
  >
    <template #body>
      <ReportConfigModal @generate="handleCustomReport" @close="showConfigModal = false" />
    </template>
  </UModal>

  <!-- Select Report Template Modal (New) -->
  <UModal
    v-model:open="showSelectModal"
    title="Create New Report"
    description="Select a report template to analyze your training data"
    :ui="{ content: 'sm:max-w-3xl' }"
  >
    <template #body>
      <div class="p-4 sm:p-6">
        <div v-if="loadingTemplates" class="flex justify-center p-8">
          <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary" />
        </div>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <!-- Templates -->
          <UButton
            v-for="template in templates"
            :key="template.id"
            variant="outline"
            color="neutral"
            class="flex flex-col items-start p-4 h-auto text-left transition-all hover:ring-2 hover:ring-primary/50"
            @click="generateReport(template.type || 'TEMPLATE', template.id)"
          >
            <div class="flex items-center gap-3 mb-2 w-full">
              <UIcon
                :name="template.icon || 'i-heroicons-document-text'"
                class="w-6 h-6 text-primary shrink-0"
              />
              <span class="font-bold text-base flex-1">{{ template.name }}</span>
              <UBadge v-if="template.isSystem" size="sm" variant="subtle" color="neutral"
                >System</UBadge
              >
            </div>
            <p class="text-sm text-muted line-clamp-2">{{ template.description }}</p>
          </UButton>

          <!-- Custom Report Button -->
          <UButton
            variant="outline"
            color="primary"
            class="flex flex-col items-start p-4 h-auto text-left border-dashed"
            @click="openCustomReportConfig"
          >
            <div class="flex items-center gap-3 mb-2">
              <UIcon name="i-heroicons-adjustments-horizontal" class="w-6 h-6 shrink-0" />
              <span class="font-bold text-base">Custom Report</span>
            </div>
            <p class="text-sm text-muted">
              Configure a one-off report with custom filters and timeframe.
            </p>
          </UButton>
        </div>

        <div
          class="mt-8 pt-4 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center"
        >
          <p class="text-xs text-muted">You can define your own report templates soon.</p>
          <UButton color="neutral" variant="ghost" @click="showSelectModal = false">Cancel</UButton>
        </div>
      </div>
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
              :loading="reportStore.generating"
              icon="i-heroicons-plus"
              color="primary"
              variant="solid"
              size="sm"
              class="font-bold"
              @click="showSelectModal = true"
            >
              <span class="hidden sm:inline">New Report</span>
              <span class="sm:hidden">New</span>
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-6 space-y-6">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Reports</h1>
          <p class="text-sm text-muted mt-1">AI-generated training analysis and recommendations</p>
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-2">
            Select from predefined templates or use the <strong>Custom Report</strong> option to
            configure exactly what you want to analyze.
          </p>
        </div>

        <!-- Reports Table -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div v-if="reportStore.status === 'pending'" class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    Report Type
                  </th>
                  <th
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    Date Range
                  </th>
                  <th
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    Status
                  </th>
                  <th
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    Created
                  </th>
                  <th
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody
                class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700"
              >
                <tr v-for="i in 5" :key="i">
                  <td v-for="j in 5" :key="j" class="px-6 py-4">
                    <USkeleton class="h-4 w-full" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div
            v-else-if="reportStore.status === 'error'"
            class="p-8 text-center text-red-600 dark:text-red-400"
          >
            <UIcon name="i-heroicons-exclamation-circle" class="w-8 h-8 mx-auto mb-2" />
            <p>Error loading reports</p>
            <UButton
              size="sm"
              color="neutral"
              variant="solid"
              class="mt-2"
              @click="() => reportStore.fetchReports()"
              >Retry</UButton
            >
          </div>

          <div
            v-else-if="!reportStore.reports.length"
            class="p-8 text-center text-gray-600 dark:text-gray-400"
          >
            <UIcon name="i-heroicons-document-text" class="w-16 h-16 text-muted mx-auto mb-4" />
            <p class="mb-4">No reports yet</p>
            <div class="flex flex-col sm:flex-row gap-3 justify-center flex-wrap">
              <UButton :loading="reportStore.generating" size="lg" @click="showSelectModal = true">
                <UIcon name="i-heroicons-plus" class="w-5 h-5 mr-2" />
                Create First Report
              </UButton>
            </div>
          </div>

          <div v-else class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    Report Type
                  </th>
                  <th
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    Date Range
                  </th>
                  <th
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    Status
                  </th>
                  <th
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    Created
                  </th>
                  <th
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody
                class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700"
              >
                <tr
                  v-for="report in reportStore.reports"
                  :key="report.id"
                  class="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <td class="px-6 py-4 text-sm text-gray-900 dark:text-white">
                    <div class="flex items-center gap-2">
                      <UIcon :name="getReportIcon(report)" class="w-5 h-5 text-primary" />
                      <span class="font-medium">{{ getReportTitle(report) }}</span>
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
                    <div class="flex items-center gap-2">
                      <UButton
                        size="xs"
                        color="primary"
                        variant="outline"
                        @click="navigateTo(`/report/${report.id}`)"
                      >
                        View Report
                      </UButton>
                      <AiFeedback
                        v-if="report.llmUsageId"
                        :llm-usage-id="report.llmUsageId"
                        :initial-feedback="report.feedback"
                        :initial-feedback-text="report.feedbackText"
                      />
                    </div>
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
  const showSelectModal = ref(false)
  const templates = ref<any[]>([])
  const loadingTemplates = ref(false)
  const toast = useToast()
  const { formatDate: baseFormatDate, formatDateTime } = useFormat()

  const reportStore = useReportStore()

  definePageMeta({
    middleware: 'auth'
  })

  useHead({
    title: 'Reports',
    meta: [
      {
        name: 'description',
        content:
          'Generate and view AI-powered coaching reports, including weekly analysis, workout insights, and nutrition reviews.'
      },
      { property: 'og:title', content: 'Reports | Coach Watts' },
      {
        property: 'og:description',
        content:
          'Generate and view AI-powered coaching reports, including weekly analysis, workout insights, and nutrition reviews.'
      }
    ]
  })

  // Fetch data on mount
  onMounted(async () => {
    reportStore.fetchReports()
    fetchTemplates()
  })

  const fetchTemplates = async () => {
    loadingTemplates.value = true
    try {
      templates.value = await $fetch('/api/reports/templates')
    } catch (error) {
      console.error('Error fetching templates:', error)
    } finally {
      loadingTemplates.value = false
    }
  }

  // Centralized report type configuration (Legacy fallback + overrides)
  const REPORT_TYPE_CONFIG: any = {
    LAST_3_WORKOUTS: {
      label: 'Last 3 Workouts Analysis',
      icon: 'i-heroicons-chart-bar',
      description:
        'Analyze your 3 most recent endurance workouts to identify trends, progression, and recovery patterns.'
    },
    WEEKLY_ANALYSIS: {
      label: 'Weekly Training Analysis',
      icon: 'i-heroicons-calendar',
      description:
        'Comprehensive analysis of the last 30 days of training including workouts, recovery metrics, and recommendations.'
    },
    LAST_3_NUTRITION: {
      label: 'Last 3 Days Nutrition',
      icon: 'i-heroicons-cake',
      description:
        'Nutrition analysis of your last 3 days of dietary intake including macros, calories, and recommendations.'
    },
    LAST_7_NUTRITION: {
      label: 'Weekly Nutrition Analysis',
      icon: 'i-heroicons-cake',
      description:
        'Comprehensive weekly nutrition analysis including patterns, consistency, and optimization opportunities.'
    },
    RACE_PREP: {
      label: 'Race Preparation Report',
      icon: 'i-heroicons-trophy',
      description:
        'Comprehensive race preparation analysis with taper recommendations and readiness assessment.'
    },
    DAILY_SUGGESTION: {
      label: 'Daily Coaching Brief',
      icon: 'i-heroicons-light-bulb',
      description: 'Daily training suggestions based on your current fitness and recovery status.'
    },
    CUSTOM: {
      label: 'Custom Report',
      icon: 'i-heroicons-adjustments-horizontal',
      description: 'Custom training analysis report with your specified filters.'
    }
  }

  const generateReport = async (reportType: string, templateId?: string) => {
    showSelectModal.value = false
    try {
      const reportId = await reportStore.generateReport(
        reportType,
        templateId ? { templateId } : undefined
      )
      navigateTo(`/report/${reportId}`)
    } catch (error) {
      // Error handling is done in store
    }
  }

  const openCustomReportConfig = () => {
    showConfigModal.value = true
    showSelectModal.value = false
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

  const getReportTitle = (report: any): string => {
    if (report.templateId) {
      const template = templates.value.find((t) => t.id === report.templateId)
      if (template) return template.name
    }

    const type = report.type
    if (type in REPORT_TYPE_CONFIG) {
      return REPORT_TYPE_CONFIG[type].label
    }
    return type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
  }

  const getReportIcon = (report: any): string => {
    if (report.templateId) {
      const template = templates.value.find((t) => t.id === report.templateId)
      if (template?.icon) return template.icon
    }

    const type = report.type
    if (type in REPORT_TYPE_CONFIG) {
      return REPORT_TYPE_CONFIG[type].icon
    }
    return 'i-heroicons-document-text'
  }

  const getStatusBadgeClass = (status: string) => {
    const baseClass = 'px-2 py-1 rounded text-xs font-medium'
    if (status === 'COMPLETED')
      return `${baseClass} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`
    if (status === 'PROCESSING')
      return `${baseClass} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`
    if (status === 'PENDING')
      return `${baseClass} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`
    if (status === 'FAILED')
      return `${baseClass} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`
    return `${baseClass} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300`
  }

  const formatDateRange = (start: string, end: string) => {
    const startDateStr = baseFormatDate(start, 'MMM d')
    const endDateStr = baseFormatDate(end, 'MMM d, yyyy')
    return `${startDateStr} - ${endDateStr}`
  }
</script>
