<template>
  <UDashboardPanel id="training-plan-page">
    <template #header>
      <UDashboardNavbar title="Training Plan">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton 
            v-if="activePlan"
            size="xs" 
            color="gray" 
            variant="ghost" 
            icon="i-heroicons-plus" 
            @click="startNewPlan"
          >
            New Plan
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-6 space-y-6">
        <!-- Loading State -->
        <div v-if="loading && !activePlan" class="flex justify-center py-20">
          <UIcon name="i-heroicons-arrow-path" class="w-10 h-10 animate-spin text-primary" />
        </div>

        <!-- Active Plan View -->
        <div v-else-if="activePlan">
           <PlanDashboard 
             :plan="activePlan" 
             :user-ftp="userFtp" 
             :is-generating="isPolling"
             :should-auto-generate="autoTriggerStructure"
             @refresh="fetchActivePlan" 
             @generation-started="autoTriggerStructure = false"
           />
        </div>

        <!-- No Plan State / Onboarding -->
        <div v-else class="max-w-4xl mx-auto text-center py-12">
          <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-10">
            <div class="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <UIcon name="i-heroicons-trophy" class="w-10 h-10 text-primary" />
            </div>
            <h2 class="text-3xl font-bold mb-3">Start Your Goal-Driven Plan</h2>
            <p class="text-lg text-muted mb-8 max-w-lg mx-auto">
              Select a race or fitness goal, and let our AI build a periodized training plan tailored to your schedule and physiology.
            </p>
            <UButton size="xl" color="primary" @click.stop="openWizard">
              Create Training Plan
            </UButton>
          </div>
        </div>

        <!-- Plan Wizard Modal -->
        <!-- Only render if explicitly open to prevent ghost clicks -->
        <UModal 
          v-if="showWizard"
          v-model:open="showWizard" 
          :ui="{ width: 'sm:max-w-4xl' }"
          title="Create Training Plan"
          description="Follow the steps to configure your personalized training plan."
        >
          <template #body>
             <div class="p-6">
               <PlanWizard @close="showWizard = false" @plan-created="onPlanCreated" />
             </div>
          </template>
        </UModal>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import PlanWizard from '~/components/plans/PlanWizard.vue'
import PlanDashboard from '~/components/plans/PlanDashboard.vue'

definePageMeta({
  middleware: 'auth'
})

useHead({
  title: 'Training Plan',
})

const showWizard = ref(false)
const isPolling = ref(false)
const autoTriggerStructure = ref(false)
const toast = useToast()

const { data, status, refresh } = await useFetch<any>('/api/plans/active')
const activePlan = computed(() => data.value?.plan)
const userFtp = computed(() => data.value?.userFtp)
const loading = computed(() => status.value === 'pending')

function fetchActivePlan() {
  refresh()
}

function openWizard() {
  showWizard.value = true
}

function startNewPlan() {
  if (confirm('Create a new plan? This will archive your current active plan.')) {
    openWizard()
  }
}

function onPlanCreated(plan: any) {
  // Optimistic update
  if (!data.value) data.value = {}
  data.value.plan = plan
  
  showWizard.value = false
  
  toast.add({
    title: 'Plan Created',
    description: 'AI is generating your workouts. This may take a moment.',
    color: 'info'
  })
  
  // Start polling for workouts
  startPolling()
}

function startPolling() {
  if (isPolling.value) return
  isPolling.value = true
  
  let attempts = 0
  const maxAttempts = 20 // 1 minute
  
  const interval = setInterval(async () => {
    attempts++
    await refresh()
    
    // Check if first block has workouts
    const hasWorkouts = activePlan.value?.blocks?.[0]?.weeks?.[0]?.workouts?.length > 0
    
    if (hasWorkouts || attempts >= maxAttempts) {
      clearInterval(interval)
      isPolling.value = false
      if (hasWorkouts) {
        toast.add({
          title: 'Workouts Ready',
          description: 'Your training plan has been populated.',
          color: 'success'
        })
        
        // Pass a signal to PlanDashboard to auto-generate structure
        autoTriggerStructure.value = true
      }
    }
  }, 3000)
}

// Safety: Close wizard if plan exists
</script>
