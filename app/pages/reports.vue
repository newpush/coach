<template>
  <!-- Configure Custom Report Modal (Legacy/Advanced) -->
  <UModal
    v-model:open="showConfigModal"
    :title="t('config_title', 'Configure Custom Report')"
    :description="
      t(
        'config_description',
        'Create a customized analysis report with your specified filters and timeframe'
      )
    "
    :ui="{ content: 'sm:max-w-2xl', body: 'p-0 sm:p-0' }"
  >
    <template #body>
      <ReportConfigModal @generate="handleCustomReport" @close="showConfigModal = false" />
    </template>
  </UModal>

  <!-- Select Report Template Modal (New) -->
  <UModal
    v-model:open="showSelectModal"
    :title="t('select_title', 'Create New Report')"
    :description="t('select_description', 'Select a report template to analyze your training data')"
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
            @click="
              () => {
                void generateReport(template.type || 'TEMPLATE', template.id)
              }
            "
          >
            <div class="flex items-center gap-3 mb-2 w-full">
              <UIcon
                :name="template.icon || 'i-heroicons-document-text'"
                class="w-6 h-6 text-primary shrink-0"
              />
              <span class="font-bold text-base flex-1">{{ template.name }}</span>
              <UBadge v-if="template.isSystem" size="sm" variant="subtle" color="neutral">{{
                t('select_system_badge', 'System')
              }}</UBadge>
            </div>
            <p class="text-sm text-muted line-clamp-2">{{ template.description }}</p>
          </UButton>

          <!-- Custom Report Button -->
          <UButton
            variant="outline"
            color="primary"
            class="flex flex-col items-start p-4 h-auto text-left border-dashed"
            @click="
              () => {
                void openCustomReportConfig()
              }
            "
          >
            <div class="flex items-center gap-3 mb-2">
              <UIcon name="i-heroicons-adjustments-horizontal" class="w-6 h-6 shrink-0" />
              <span class="font-bold text-base">{{ t('type_custom', 'Custom Report') }}</span>
            </div>
            <p class="text-sm text-muted">
              {{
                t(
                  'select_custom_description',
                  'Configure a one-off report with custom filters and timeframe.'
                )
              }}
            </p>
          </UButton>
        </div>

        <div
          class="mt-8 pt-4 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center"
        >
          <p class="text-xs text-muted">
            {{ t('select_templates_hint', 'You can define your own report templates soon.') }}
          </p>
          <UButton
            color="neutral"
            variant="ghost"
            @click="
              () => {
                showSelectModal = false
              }
            "
            >{{ t('select_cancel', 'Cancel') }}</UButton
          >
        </div>
      </div>
    </template>
  </UModal>

  <UDashboardPanel id="reports">
    <template #header>
      <UDashboardNavbar :title="t('list_title', 'Reports')">
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
              @click="
                () => {
                  showSelectModal = true
                }
              "
            >
              <span class="hidden sm:inline">{{ t('list_new_report', 'New Report') }}</span>
              <span class="sm:hidden">{{ t('list_new_report_short', 'New') }}</span>
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-0 sm:p-6 space-y-6">
        <!-- Dashboard Branding -->
        <div class="px-4 sm:px-0">
          <h1 class="text-4xl font-black text-gray-900 dark:text-white uppercase tracking-tight">
            {{ t('list_title', 'Reports') }}
          </h1>
          <p
            class="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-[0.2em] mt-1 italic"
          >
            {{ t('list_subtitle', 'AI Insights & Performance Summaries') }}
          </p>
        </div>

        <!-- Reports Table -->
        <div
          class="bg-white dark:bg-gray-800 rounded-none sm:rounded-lg shadow-none sm:shadow overflow-hidden ring-0 sm:ring-1 ring-gray-200 dark:ring-gray-800 border-y sm:border border-gray-200 dark:border-gray-800"
        >
          <div v-if="reportStore.status === 'pending'" class="hidden md:block overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    {{ t('list_column_type', 'Report Type') }}
                  </th>
                  <th
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    {{ t('list_column_date_range', 'Date Range') }}
                  </th>
                  <th
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    {{ t('list_column_status', 'Status') }}
                  </th>
                  <th
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    {{ t('list_column_created', 'Created') }}
                  </th>
                  <th
                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    {{ t('list_column_actions', 'Actions') }}
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
            v-if="reportStore.status === 'pending'"
            class="divide-y divide-gray-200 dark:divide-gray-700 md:hidden"
          >
            <UCard
              v-for="i in 3"
              :key="`report-mobile-skeleton-${i}`"
              :ui="{
                root: 'rounded-none shadow-none ring-0 border-0',
                body: 'p-4 space-y-3'
              }"
            >
              <USkeleton class="h-5 w-2/3" />
              <USkeleton class="h-4 w-1/2" />
              <USkeleton class="h-10 w-full" />
            </UCard>
          </div>

          <div
            v-else-if="reportStore.status === 'error'"
            class="p-8 text-center text-red-600 dark:text-red-400"
          >
            <UIcon name="i-heroicons-exclamation-circle" class="w-8 h-8 mx-auto mb-2" />
            <p>{{ t('list_error_title', 'Error loading reports') }}</p>
            <UButton
              size="sm"
              color="neutral"
              variant="solid"
              class="mt-2"
              @click="() => reportStore.fetchReports()"
              >{{ t('list_error_retry', 'Retry') }}</UButton
            >
          </div>

          <div
            v-else-if="!reportStore.reports.length"
            class="p-8 text-center text-gray-600 dark:text-gray-400"
          >
            <UIcon name="i-heroicons-document-text" class="w-16 h-16 text-muted mx-auto mb-4" />
            <p class="mb-4">{{ t('list_empty_title', 'No reports yet') }}</p>
            <div class="flex flex-col sm:flex-row gap-3 justify-center flex-wrap">
              <UButton
                :loading="reportStore.generating"
                size="lg"
                @click="
                  () => {
                    showSelectModal = true
                  }
                "
              >
                <UIcon name="i-heroicons-plus" class="w-5 h-5 mr-2" />
                {{ t('list_empty_cta', 'Create First Report') }}
              </UButton>
            </div>
          </div>

          <div v-else>
            <div class="hidden md:block overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead class="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th
                      class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                    >
                      {{ t('list_column_type', 'Report Type') }}
                    </th>
                    <th
                      class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                    >
                      {{ t('list_column_date_range', 'Date Range') }}
                    </th>
                    <th
                      class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                    >
                      {{ t('list_column_status', 'Status') }}
                    </th>
                    <th
                      class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                    >
                      {{ t('list_column_created', 'Created') }}
                    </th>
                    <th
                      class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                    >
                      {{ t('list_column_actions', 'Actions') }}
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
                    <td
                      class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400"
                    >
                      {{ formatDateRange(report.dateRangeStart, report.dateRangeEnd) }}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm">
                      <span :class="getStatusBadgeClass(report.status)">
                        {{ report.status }}
                      </span>
                    </td>
                    <td
                      class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400"
                    >
                      {{ formatDateTime(report.createdAt) }}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm">
                      <div class="flex items-center gap-2">
                        <UButton
                          size="xs"
                          color="primary"
                          variant="outline"
                          @click="
                            () => {
                              void navigateTo(`/report/${report.id}`)
                            }
                          "
                        >
                          {{ t('list_view_report', 'View Report') }}
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

            <div class="divide-y divide-gray-200 dark:divide-gray-700 md:hidden">
              <UCard
                v-for="report in reportStore.reports"
                :key="`report-mobile-${report.id}`"
                :ui="{
                  root: 'rounded-none shadow-none ring-0 border-0',
                  body: 'p-4 space-y-3'
                }"
              >
                <div class="flex items-start gap-3">
                  <UIcon
                    :name="getReportIcon(report)"
                    class="mt-0.5 w-5 h-5 shrink-0 text-primary"
                  />
                  <div class="min-w-0 flex-1">
                    <h3 class="font-semibold text-gray-900 dark:text-white">
                      {{ getReportTitle(report) }}
                    </h3>
                    <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      {{ formatDateRange(report.dateRangeStart, report.dateRangeEnd) }}
                    </p>
                    <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span :class="getStatusBadgeClass(report.status)">{{ report.status }}</span>
                      <span class="text-gray-500">{{ formatDateTime(report.createdAt) }}</span>
                    </div>
                  </div>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <UButton
                    size="sm"
                    color="primary"
                    variant="outline"
                    class="min-h-11"
                    @click="
                      () => {
                        void navigateTo(`/report/${report.id}`)
                      }
                    "
                  >
                    {{ t('list_view_report', 'View Report') }}
                  </UButton>
                  <AiFeedback
                    v-if="report.llmUsageId"
                    :llm-usage-id="report.llmUsageId"
                    :initial-feedback="report.feedback"
                    :initial-feedback-text="report.feedbackText"
                  />
                </div>
              </UCard>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'

  const { t } = useTranslate('report')

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

  useHead(
    computed(() => ({
      title: t.value('list_title', 'Reports'),
      meta: [
        {
          name: 'description',
          content: t.value(
            'list_meta_description',
            'Generate and view AI-powered coaching reports, including weekly analysis, workout insights, and nutrition reviews.'
          )
        },
        { property: 'og:title', content: t.value('list_og_title', 'Reports | Coach Watts') },
        {
          property: 'og:description',
          content: t.value(
            'list_meta_description',
            'Generate and view AI-powered coaching reports, including weekly analysis, workout insights, and nutrition reviews.'
          )
        }
      ]
    }))
  )

  // Fetch data on mount
  onMounted(async () => {
    reportStore.fetchReports()
    fetchTemplates()
  })

  const fetchTemplates = async () => {
    loadingTemplates.value = true
    try {
      templates.value = await ($fetch as any)('/api/reports/templates')
    } catch (error) {
      console.error('Error fetching templates:', error)
    } finally {
      loadingTemplates.value = false
    }
  }

  // Centralized report type configuration (Legacy fallback + overrides).
  // Labels reuse the `type_*` keys already used by the report detail page so both
  // surfaces name a report type identically. `label` is the English default handed
  // to Tolgee for locales that have not translated the key yet.
  const REPORT_TYPE_CONFIG: Record<string, { labelKey: string; label: string; icon: string }> = {
    LAST_3_WORKOUTS: {
      labelKey: 'type_last_3_workouts',
      label: 'Last 3 Workouts Analysis',
      icon: 'i-heroicons-chart-bar'
    },
    WEEKLY_ANALYSIS: {
      labelKey: 'type_weekly_analysis',
      label: 'Weekly Training Analysis',
      icon: 'i-heroicons-calendar'
    },
    LAST_3_NUTRITION: {
      labelKey: 'type_last_3_nutrition',
      label: 'Last 3 Days Nutrition Analysis',
      icon: 'i-heroicons-cake'
    },
    LAST_7_NUTRITION: {
      labelKey: 'type_last_7_nutrition',
      label: 'Weekly Nutrition Analysis',
      icon: 'i-heroicons-cake'
    },
    RACE_PREP: {
      labelKey: 'type_race_prep',
      label: 'Race Preparation Report',
      icon: 'i-heroicons-trophy'
    },
    DAILY_SUGGESTION: {
      labelKey: 'type_daily_suggestion',
      label: 'Daily Coaching Brief',
      icon: 'i-heroicons-light-bulb'
    },
    CUSTOM: {
      labelKey: 'type_custom',
      label: 'Custom Report',
      icon: 'i-heroicons-adjustments-horizontal'
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
      const template = templates.value.find((tpl) => tpl.id === report.templateId)
      if (template) return template.name
    }

    const type = report.type
    const config = REPORT_TYPE_CONFIG[type]
    if (config) {
      return t.value(config.labelKey, config.label)
    }
    return type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
  }

  const getReportIcon = (report: any): string => {
    if (report.templateId) {
      const template = templates.value.find((tpl) => tpl.id === report.templateId)
      if (template?.icon) return template.icon
    }

    return REPORT_TYPE_CONFIG[report.type]?.icon ?? 'i-heroicons-document-text'
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
