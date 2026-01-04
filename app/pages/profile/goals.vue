<script setup lang="ts">
import EventGoalWizard from '~/components/goals/EventGoalWizard.vue'
import GoalCard from '~/components/goals/GoalCard.vue'

definePageMeta({
  middleware: 'auth'
})

const showWizard = ref(false)
const editingGoal = ref<any>(null)
const showDeleteModal = ref(false)
const goalToDelete = ref<string | null>(null)
const toast = useToast()

// AI Features
const suggestionsLoading = ref(false)
const reviewLoading = ref(false)
const suggestions = ref<any>(null)
const review = ref<any>(null)
const showSuggestions = ref(false)
const showReview = ref(false)

const { data, pending: loading, refresh } = await useFetch('/api/goals')

const goals = computed(() => data.value?.goals || [])
const activeGoals = computed(() => goals.value.filter((g: any) => g.status === 'ACTIVE'))

function handleEdit(goal: any) {
  editingGoal.value = goal
  showWizard.value = true
}

function closeWizard() {
  showWizard.value = false
  editingGoal.value = null
}

async function refreshGoals() {
  await refresh()
}

function onGoalCreated() {
  refreshGoals()
  showWizard.value = false
}

function onGoalUpdated() {
  refreshGoals()
  showWizard.value = false
  editingGoal.value = null
}

function deleteGoal(id: string) {
  goalToDelete.value = id
  showDeleteModal.value = true
}

async function confirmDelete() {
  if (!goalToDelete.value) return
  
  try {
    await $fetch(`/api/goals/${goalToDelete.value}`, {
      method: 'DELETE'
    })
    refreshGoals()
    toast.add({
      title: 'Goal Deleted',
      color: 'success'
    })
  } catch (error) {
    toast.add({
      title: 'Error',
      description: 'Failed to delete goal',
      color: 'error'
    })
  } finally {
    showDeleteModal.value = false
    goalToDelete.value = null
  }
}

// AI Suggestions
async function generateSuggestions() {
  suggestionsLoading.value = true
  suggestions.value = null
  showSuggestions.value = true
  
  try {
    const result = await $fetch('/api/goals/suggest', { method: 'POST' })
    
    toast.add({
      title: 'Generating Suggestions',
      description: result.message,
      color: 'primary'
    })
    
    // Poll for results
    await pollForSuggestions(result.jobId)
  } catch (error) {
    toast.add({
      title: 'Error',
      description: 'Failed to generate goal suggestions',
      color: 'error'
    })
    suggestionsLoading.value = false
  }
}

async function pollForSuggestions(jobId: string) {
  const maxAttempts = 60 // 5 minutes max
  let attempts = 0
  
  const interval = setInterval(async () => {
    attempts++
    
    if (attempts > maxAttempts) {
      clearInterval(interval)
      suggestionsLoading.value = false
      toast.add({
        title: 'Timeout',
        description: 'Suggestion generation took too long',
        color: 'warning'
      })
      return
    }
    
    try {
      const result = await $fetch(`/api/goals/suggestions?jobId=${jobId}`) as any
      
      if (result.isCompleted && result.output) {
        suggestions.value = result.output.suggestions
        clearInterval(interval)
        suggestionsLoading.value = false
        
        toast.add({
          title: 'Suggestions Ready',
          description: 'AI has analyzed your profile and generated goal suggestions',
          color: 'success'
        })
      } else if (result.isFailed) {
        clearInterval(interval)
        suggestionsLoading.value = false
        toast.add({
          title: 'Generation Failed',
          description: 'Failed to generate suggestions. Please try again.',
          color: 'error'
        })
      }
      // Continue polling if still running
    } catch (error) {
      // Continue polling
    }
  }, 5000)
}

// Goal Review
async function reviewGoals() {
  if (activeGoals.value.length === 0) {
    toast.add({
      title: 'No Active Goals',
      description: 'Create some goals first before requesting a review',
      color: 'warning'
    })
    return
  }
  
  reviewLoading.value = true
  review.value = null
  showReview.value = true
  
  try {
    const result = await $fetch('/api/goals/review', { method: 'POST' })
    
    toast.add({
      title: 'Reviewing Goals',
      description: result.message,
      color: 'primary'
    })
    
    // Poll for results
    await pollForReview(result.jobId)
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to review goals',
      color: 'error'
    })
    reviewLoading.value = false
  }
}

async function pollForReview(jobId: string) {
  const maxAttempts = 60 // 5 minutes max
  let attempts = 0
  
  const interval = setInterval(async () => {
    attempts++
    
    if (attempts > maxAttempts) {
      clearInterval(interval)
      reviewLoading.value = false
      toast.add({
        title: 'Timeout',
        description: 'Goal review took too long',
        color: 'warning'
      })
      return
    }
    
    try {
      const result = await $fetch(`/api/goals/review-result?jobId=${jobId}`) as any
      
      if (result.isCompleted && result.output) {
        review.value = result.output.review
        clearInterval(interval)
        reviewLoading.value = false
        
        toast.add({
          title: 'Review Complete',
          description: 'AI has reviewed your active goals',
          color: 'success'
        })
      } else if (result.isFailed) {
        clearInterval(interval)
        reviewLoading.value = false
        toast.add({
          title: 'Review Failed',
          description: 'Failed to review goals. Please try again.',
          color: 'error'
        })
      }
      // Continue polling if still running
    } catch (error) {
      // Continue polling
    }
  }, 5000)
}

async function acceptSuggestion(suggestion: any) {
  try {
    await $fetch('/api/goals', {
      method: 'POST',
      body: {
        type: suggestion.type,
        title: suggestion.title,
        description: suggestion.description,
        metric: suggestion.metric,
        currentValue: suggestion.currentValue,
        targetValue: suggestion.targetValue,
        startValue: suggestion.currentValue,
        targetDate: suggestion.targetDate,
        priority: suggestion.priority,
        aiContext: suggestion.rationale
      }
    })
    
    await refreshGoals()
    
    toast.add({
      title: 'Goal Created',
      description: `Added: ${suggestion.title}`,
      color: 'success'
    })
  } catch (error) {
    toast.add({
      title: 'Error',
      description: 'Failed to create goal from suggestion',
      color: 'error'
    })
  }
}

useHead({
  title: 'Goals',
  meta: [
    { name: 'description', content: 'Set and track your fitness goals to stay motivated and measure progress.' }
  ]
})
</script>

<template>
  <UDashboardPanel id="goals">
    <template #header>
      <UDashboardNavbar title="Goals">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            v-if="!showWizard"
            color="primary"
            variant="solid"
            icon="i-heroicons-plus"
            size="sm"
            class="font-bold"
            @click="showWizard = true"
          >
            <span class="hidden sm:inline">Add Goal</span>
            <span class="sm:hidden">Add</span>
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-3 sm:p-6 space-y-4 sm:space-y-6">
        <!-- Page Header -->
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Goals</h1>
          <p class="text-sm text-muted mt-1">
            Set and track your fitness goals to stay motivated and measure progress
          </p>
        </div>
        
        <div class="space-y-6">
          
          <!-- AI Features Section -->
          <div class="flex gap-3">
            <UButton
              color="primary"
              variant="outline"
              icon="i-heroicons-sparkles"
              size="sm"
              class="font-bold"
              :loading="suggestionsLoading"
              @click="generateSuggestions"
            >
              AI Suggest
            </UButton>
            <UButton
              v-if="activeGoals.length > 0"
              color="primary"
              variant="outline"
              icon="i-heroicons-check-badge"
              size="sm"
              class="font-bold"
              :loading="reviewLoading"
              @click="reviewGoals"
            >
              Review
            </UButton>
          </div>
          
          <!-- AI Suggestions Section -->
          <UCard v-if="showSuggestions">
            <template #header>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-primary" />
                  <h3 class="font-semibold">AI Goal Suggestions</h3>
                </div>
                <UButton
                  icon="i-heroicons-x-mark"
                  variant="ghost"
                  size="sm"
                  @click="showSuggestions = false"
                />
              </div>
            </template>
            
            <div v-if="suggestionsLoading" class="space-y-4">
              <div class="flex items-center gap-3">
                <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin text-primary" />
                <p class="text-sm text-muted">
                  Analyzing your athlete profile, workouts, and performance to suggest achievable goals...
                </p>
              </div>
              <USkeleton class="h-32 w-full" v-for="i in 3" :key="i" />
            </div>
            
            <div v-else-if="suggestions" class="space-y-6">
              <div v-if="suggestions.executive_summary" class="p-4 bg-primary/5 rounded-lg border border-primary/10">
                <p class="text-sm">{{ suggestions.executive_summary }}</p>
              </div>
              
              <div v-if="suggestions.suggested_goals?.length > 0" class="space-y-4">
                <h4 class="font-medium text-sm text-muted">Suggested Goals ({{ suggestions.suggested_goals.length }})</h4>
                
                <div
                  v-for="(suggestion, index) in suggestions.suggested_goals"
                  :key="index"
                  class="p-4 border rounded-lg hover:border-primary/50 transition-colors space-y-3"
                >
                  <div class="flex items-start justify-between gap-4">
                    <div class="flex-1 space-y-2">
                      <div class="flex items-center gap-2">
                        <UBadge :color="suggestion.priority === 'HIGH' ? 'error' : suggestion.priority === 'MEDIUM' ? 'warning' : 'primary'" size="xs">
                          {{ suggestion.priority }}
                        </UBadge>
                        <UBadge color="neutral" size="xs">{{ suggestion.type.replace('_', ' ') }}</UBadge>
                        <UBadge
                          :color="suggestion.difficulty === 'easy' ? 'success' : suggestion.difficulty === 'moderate' ? 'primary' : suggestion.difficulty === 'challenging' ? 'warning' : 'error'"
                          size="xs"
                        >
                          {{ suggestion.difficulty }}
                        </UBadge>
                      </div>
                      
                      <h5 class="font-semibold">{{ suggestion.title }}</h5>
                      <p class="text-sm text-muted">{{ suggestion.description }}</p>
                      
                      <div class="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md border border-blue-200 dark:border-blue-800">
                        <p class="text-sm"><strong>Why this goal:</strong> {{ suggestion.rationale }}</p>
                      </div>
                      
                      <div v-if="suggestion.metric && suggestion.targetValue" class="flex items-center gap-4 text-xs text-muted">
                        <span>
                          <strong>Target:</strong> {{ suggestion.currentValue }} → {{ suggestion.targetValue }} {{ suggestion.metric }}
                        </span>
                        <span v-if="suggestion.timeframe_weeks">
                          <strong>Timeframe:</strong> {{ suggestion.timeframe_weeks }} weeks
                        </span>
                      </div>
                      
                      <div v-if="suggestion.prerequisites?.length" class="text-xs">
                        <strong class="text-muted">Prerequisites:</strong>
                        <ul class="list-disc list-inside mt-1 space-y-1">
                          <li v-for="(prereq, i) in suggestion.prerequisites" :key="i" class="text-muted">{{ prereq }}</li>
                        </ul>
                      </div>
                    </div>
                    
                    <UButton
                      color="primary"
                      size="sm"
                      @click="acceptSuggestion(suggestion)"
                    >
                      Accept
                    </UButton>
                  </div>
                </div>
              </div>
              
              <div v-else class="text-center py-8 text-muted">
                <p>No suggestions available at this time.</p>
              </div>
            </div>
          </UCard>
          
          <!-- Goal Review Section -->
          <UCard v-if="showReview">
            <template #header>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <UIcon name="i-heroicons-check-badge" class="w-5 h-5 text-primary" />
                  <h3 class="font-semibold">Goal Review</h3>
                </div>
                <UButton
                  icon="i-heroicons-x-mark"
                  variant="ghost"
                  size="sm"
                  @click="showReview = false"
                />
              </div>
            </template>
            
            <div v-if="reviewLoading" class="space-y-4">
              <div class="flex items-center gap-3">
                <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin text-primary" />
                <p class="text-sm text-muted">
                  Reviewing your active goals for rationality and achievability...
                </p>
              </div>
              <USkeleton class="h-32 w-full" v-for="i in 2" :key="i" />
            </div>
            
            <div v-else-if="review" class="space-y-6">
              <div v-if="review.overall_assessment" class="space-y-3">
                <div class="flex items-center gap-2">
                  <UBadge
                    :color="review.overall_assessment.goal_balance === 'well_balanced' ? 'success' : review.overall_assessment.goal_balance === 'needs_rebalancing' ? 'warning' : 'error'"
                  >
                    {{ review.overall_assessment.goal_balance?.replace('_', ' ') }}
                  </UBadge>
                  <UBadge
                    :color="review.overall_assessment.alignment_with_profile === 'excellent' ? 'success' : review.overall_assessment.alignment_with_profile === 'good' ? 'primary' : 'warning'"
                  >
                    Alignment: {{ review.overall_assessment.alignment_with_profile }}
                  </UBadge>
                </div>
                
                <div class="p-4 bg-primary/5 rounded-lg border border-primary/10">
                  <p class="text-sm">{{ review.overall_assessment.summary }}</p>
                </div>
                
                <div v-if="review.overall_assessment.key_concerns?.length" class="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                  <h5 class="font-medium text-sm mb-2">Key Concerns:</h5>
                  <ul class="list-disc list-inside space-y-1 text-sm">
                    <li v-for="(concern, i) in review.overall_assessment.key_concerns" :key="i">{{ concern }}</li>
                  </ul>
                </div>
              </div>
              
              <div v-if="review.goal_reviews?.length > 0" class="space-y-4">
                <h4 class="font-medium text-sm text-muted">Individual Goal Reviews</h4>
                
                <div
                  v-for="(goalReview, index) in review.goal_reviews"
                  :key="index"
                  class="p-4 border rounded-lg space-y-3"
                >
                  <div class="flex items-start justify-between gap-4">
                    <div class="flex-1 space-y-2">
                      <div class="flex items-center gap-2">
                        <UBadge
                          :color="goalReview.assessment === 'realistic' ? 'success' : goalReview.assessment === 'slightly_ambitious' ? 'primary' : goalReview.assessment === 'too_ambitious' ? 'error' : goalReview.assessment === 'too_conservative' ? 'warning' : 'neutral'"
                          size="xs"
                        >
                          {{ goalReview.assessment?.replace('_', ' ') }}
                        </UBadge>
                      </div>
                      
                      <h5 class="font-semibold">{{ goalReview.title }}</h5>
                      <p class="text-sm text-muted">{{ goalReview.rationale }}</p>
                      
                      <div v-if="goalReview.progress_analysis" class="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md border border-blue-200 dark:border-blue-800">
                        <p class="text-sm"><strong>Progress:</strong> {{ goalReview.progress_analysis }}</p>
                      </div>
                      
                      <div v-if="goalReview.recommendations?.length" class="text-sm">
                        <strong class="text-muted">Recommendations:</strong>
                        <ul class="list-disc list-inside mt-1 space-y-1">
                          <li v-for="(rec, i) in goalReview.recommendations" :key="i" class="text-muted">{{ rec }}</li>
                        </ul>
                      </div>
                      
                      <div v-if="goalReview.risks?.length" class="text-sm">
                        <strong class="text-amber-600 dark:text-amber-400">Risks:</strong>
                        <ul class="list-disc list-inside mt-1 space-y-1">
                          <li v-for="(risk, i) in goalReview.risks" :key="i" class="text-amber-600 dark:text-amber-400">{{ risk }}</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div v-if="review.action_plan" class="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800 space-y-3">
                <h5 class="font-medium">Action Plan</h5>
                
                <div v-if="review.action_plan.immediate_actions?.length">
                  <strong class="text-sm">Immediate Actions:</strong>
                  <ul class="list-disc list-inside mt-1 space-y-1 text-sm">
                    <li v-for="(action, i) in review.action_plan.immediate_actions" :key="i">{{ action }}</li>
                  </ul>
                </div>
                
                <div v-if="review.action_plan.goals_to_adjust?.length">
                  <strong class="text-sm">Goals to Adjust:</strong>
                  <ul class="list-disc list-inside mt-1 space-y-1 text-sm">
                    <li v-for="(goal, i) in review.action_plan.goals_to_adjust" :key="i">{{ goal }}</li>
                  </ul>
                </div>
              </div>
            </div>
          </UCard>
          
          <div v-if="showWizard">
            <UCard>
              <template #header>
                <div class="flex items-center justify-between">
                  <h3 class="font-semibold">{{ editingGoal ? 'Edit Goal' : 'Create New Goal' }}</h3>
                  <UButton icon="i-heroicons-x-mark" variant="ghost" size="sm" @click="closeWizard" />
                </div>
              </template>
              <EventGoalWizard
                :goal="editingGoal"
                @close="closeWizard"
                @created="onGoalCreated"
                @updated="onGoalUpdated"
              />
            </UCard>
          </div>
          
          <div v-if="loading" class="space-y-4">
            <USkeleton class="h-32 w-full" v-for="i in 2" :key="i" />
          </div>
          
          <div v-else-if="goals.length === 0 && !showWizard" class="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-lg">
            <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <UIcon name="i-heroicons-trophy" class="w-8 h-8 text-primary" />
            </div>
            <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100">No goals set</h3>
            <p class="text-gray-500 dark:text-gray-400 mt-2 mb-6 max-w-md mx-auto">
              Set your first goal to get personalized AI coaching advice and track your progress.
            </p>
            <UButton color="primary" size="lg" @click="showWizard = true" icon="i-heroicons-plus">
              Create First Goal
            </UButton>
          </div>
          
          <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <GoalCard
              v-for="goal in goals"
              :key="goal.id"
              :goal="goal"
              @edit="handleEdit"
              @delete="deleteGoal"
            />
          </div>
          
          <!-- Delete Confirmation Modal -->
          <UModal
            v-model:open="showDeleteModal"
            title="Delete Goal?"
            description="Are you sure you want to delete this goal? This action cannot be undone."
            :ui="{ footer: 'justify-end' }"
          >
            <template #footer="{ close }">
              <UButton
                label="Cancel"
                variant="outline"
                color="neutral"
                @click="close"
              />
              <UButton
                label="Delete Goal"
                color="error"
                @click="confirmDelete"
              />
            </template>
          </UModal>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>