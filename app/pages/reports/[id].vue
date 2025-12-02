<template>
  <div class="min-h-screen bg-gray-50">
    <nav class="bg-white shadow">
      <div class="container mx-auto px-4">
        <div class="flex justify-between items-center h-16">
          <div class="flex items-center gap-4">
            <UButton to="/reports" variant="ghost" icon="i-heroicons-arrow-left" />
            <h1 class="text-xl font-bold">Report</h1>
          </div>
          <UButton color="gray" @click="signOut({ callbackUrl: '/login' })">
            Sign Out
          </UButton>
        </div>
      </div>
    </nav>
    
    <div class="container mx-auto p-6 max-w-4xl">
      <div v-if="pending" class="flex justify-center py-20">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary" />
      </div>
      
      <div v-else-if="report">
        <!-- Header -->
        <div class="mb-6">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h2 class="text-3xl font-bold">{{ reportTitle }}</h2>
              <p class="text-gray-600 mt-2">
                {{ formatDateRange(report.dateRangeStart, report.dateRangeEnd) }}
              </p>
            </div>
            <UBadge :color="statusColor" size="lg">
              {{ report.status }}
            </UBadge>
          </div>
        </div>
        
        <!-- Status Alert -->
        <UAlert
          v-if="report.status === 'PROCESSING'"
          color="blue"
          icon="i-heroicons-arrow-path"
          title="Generating Report"
          description="Your AI coach is analyzing your training data. This may take a few moments..."
          class="mb-6"
        />
        
        <UAlert
          v-else-if="report.status === 'FAILED'"
          color="red"
          icon="i-heroicons-exclamation-triangle"
          title="Report Generation Failed"
          description="Unable to generate report. Please try again."
          class="mb-6"
        />
        
        <!-- Content -->
        <UCard v-if="report.status === 'COMPLETED' && report.markdown" class="prose prose-lg max-w-none">
          <MDC :value="report.markdown" />
        </UCard>
        
        <!-- Suggestions (for daily coach) -->
        <UCard v-if="report.suggestions" class="mt-6">
          <template #header>
            <h3 class="text-xl font-semibold flex items-center gap-2">
              <UIcon name="i-heroicons-light-bulb" class="w-6 h-6" />
              Today's Coaching Suggestion
            </h3>
          </template>
          
          <div class="space-y-4">
            <div>
              <p class="text-lg font-semibold mb-2">{{ getActionText(report.suggestions.action) }}</p>
              <p class="text-gray-700">{{ report.suggestions.reason }}</p>
            </div>
            
            <div v-if="report.suggestions.modification" class="bg-blue-50 p-4 rounded-lg">
              <p class="text-sm font-medium text-blue-900 mb-1">Recommended Modification:</p>
              <p class="text-blue-800">{{ report.suggestions.modification }}</p>
            </div>
            
            <div class="flex items-center justify-between text-sm text-gray-600">
              <span>Confidence: {{ (report.suggestions.confidence * 100).toFixed(0) }}%</span>
              <span>Model: {{ report.modelVersion }}</span>
            </div>
          </div>
        </UCard>
        
        <!-- Actions -->
        <div class="mt-6 flex gap-4">
          <UButton
            color="gray"
            variant="outline"
            @click="handlePrint"
          >
            <UIcon name="i-heroicons-printer" class="w-4 h-4 mr-2" />
            Print / Save as PDF
          </UButton>
          
          <UButton
            v-if="report.status === 'COMPLETED'"
            color="gray"
            variant="outline"
            disabled
          >
            <UIcon name="i-heroicons-share" class="w-4 h-4 mr-2" />
            Share (Coming Soon)
          </UButton>
        </div>
      </div>
      
      <div v-else class="text-center py-20">
        <p class="text-gray-600">Report not found</p>
        <UButton to="/reports" class="mt-4">
          Back to Reports
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const { signOut } = useAuth()
const reportId = route.params.id as string

const { data: report, pending } = await useFetch(`/api/reports/${reportId}`, {
  // Refresh every 5 seconds if report is still processing
  watch: false,
})

// Poll for updates if report is processing
if (report.value?.status === 'PROCESSING') {
  const interval = setInterval(async () => {
    const { data } = await useFetch(`/api/reports/${reportId}`)
    if (data.value) {
      report.value = data.value
      if (data.value.status !== 'PROCESSING') {
        clearInterval(interval)
      }
    }
  }, 5000)
  
  onUnmounted(() => clearInterval(interval))
}

definePageMeta({
  middleware: 'auth'
})

const reportTitle = computed(() => {
  if (!report.value) return ''
  const titles: Record<string, string> = {
    'WEEKLY_ANALYSIS': 'Weekly Training Analysis',
    'RACE_PREP': 'Race Preparation Report',
    'DAILY_SUGGESTION': 'Daily Coaching Brief',
    'CUSTOM': 'Custom Report'
  }
  return titles[report.value.type] || 'Report'
})

const statusColor = computed(() => {
  if (!report.value) return 'gray'
  const colors: Record<string, string> = {
    'PENDING': 'yellow',
    'PROCESSING': 'blue',
    'COMPLETED': 'green',
    'FAILED': 'red'
  }
  return colors[report.value.status] || 'gray'
})

const formatDateRange = (start: string, end: string) => {
  const startDate = new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endDate = new Date(end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${startDate} - ${endDate}`
}

const getActionText = (action: string) => {
  const texts: Record<string, string> = {
    'proceed': '✅ Proceed as Planned',
    'modify': '🔄 Modify Workout',
    'reduce_intensity': '📉 Reduce Intensity',
    'rest': '🛌 Rest Day Recommended'
  }
  return texts[action] || action
}

const handlePrint = () => {
  window.print()
}
</script>

<style>
/* Print styles */
@media print {
  nav, .actions {
    display: none;
  }
}

/* Markdown prose customization */
.prose {
  @apply text-gray-900;
}

.prose h2 {
  @apply mt-8 mb-4 text-2xl font-bold text-gray-900 border-b pb-2;
}

.prose h3 {
  @apply mt-6 mb-3 text-xl font-semibold text-gray-900;
}

.prose p {
  @apply my-4 leading-relaxed;
}

.prose ul, .prose ol {
  @apply my-4 space-y-2;
}

.prose li {
  @apply ml-6;
}

.prose strong {
  @apply font-semibold text-gray-900;
}

.prose code {
  @apply bg-gray-100 px-1 py-0.5 rounded text-sm;
}

.prose blockquote {
  @apply border-l-4 border-blue-500 pl-4 italic my-4;
}
</style>