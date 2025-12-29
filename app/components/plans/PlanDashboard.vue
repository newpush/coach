<template>
  <div class="space-y-6">
    <!-- Header / Overview -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold">{{ plan.goal?.title || plan.name || 'Untitled Plan' }}</h2>
        <div class="flex items-center gap-2 text-muted mt-1">
          <UIcon name="i-heroicons-calendar" class="w-4 h-4" />
          <span>Target: {{ formatDate(plan.targetDate) }}</span>
          <span class="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">{{ plan.strategy }}</span>
        </div>
      </div>
      <div class="text-right">
        <div class="text-sm text-muted">Current Phase</div>
        <div class="font-bold text-lg text-primary">{{ currentBlock?.name || 'Prep' }}</div>
        <div class="flex gap-2 justify-end mt-1">
          <UButton size="xs" color="neutral" variant="ghost" icon="i-heroicons-adjustments-horizontal" @click="showAdaptModal = true">
            Adapt Plan
          </UButton>
          <UButton size="xs" color="neutral" variant="ghost" icon="i-heroicons-bookmark" @click="showSaveTemplateModal = true">
            Save Template
          </UButton>
          <UButton size="xs" color="error" variant="ghost" icon="i-heroicons-trash" @click="showAbandonModal = true">
            Abandon
          </UButton>
        </div>
      </div>
    </div>

    <!-- Abandon Plan Modal -->
    <UModal 
      v-model:open="showAbandonModal" 
      title="Abandon Training Plan"
      description="Are you sure you want to abandon this plan?"
    >
      <template #body>
        <div class="p-6 space-y-4">
          <div class="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg text-sm text-red-800 dark:text-red-200 flex gap-3">
             <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 flex-shrink-0" />
             <div>
               <p class="font-bold">This action cannot be undone.</p>
               <p class="mt-1">All future planned workouts will be removed. Past completed workouts will remain in your history.</p>
             </div>
          </div>
          
          <div class="flex justify-end gap-2 mt-4">
            <UButton color="neutral" variant="ghost" @click="showAbandonModal = false">Cancel</UButton>
            <UButton color="error" :loading="abandoning" @click="confirmAbandon">Abandon Plan</UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Save Template Modal -->
    <UModal v-model:open="showSaveTemplateModal" title="Save as Template">
      <template #body>
        <div class="p-6 space-y-4">
          <p class="text-sm text-muted">Save this plan structure to reuse later.</p>
          <UFormField label="Template Name" required>
            <UInput v-model="templateName" placeholder="e.g. My Base Builder" class="w-full" />
          </UFormField>
          <UFormField label="Description">
            <UTextarea v-model="templateDescription" placeholder="Notes about this plan..." class="w-full" />
          </UFormField>
          
          <div class="flex justify-end gap-2 mt-4">
            <UButton color="neutral" variant="ghost" @click="showSaveTemplateModal = false">Cancel</UButton>
            <UButton color="primary" :loading="savingTemplate" @click="saveTemplate">Save</UButton>
          </div>
        </div>
      </template>
    </UModal>

    <UModal 
      v-model:open="showAdaptModal" 
      title="Adapt Training Plan"
      description="Adjust your plan to handle missed workouts or schedule changes."
    >
      <template #body>
        <div class="p-6 space-y-4">
          <p class="text-sm text-muted">Life happens. Use these tools to adjust your plan to your current reality.</p>
          
          <div class="grid grid-cols-1 gap-3">
            <UButton 
              block 
              variant="outline" 
              color="primary" 
              icon="i-heroicons-forward"
              :loading="adapting === 'RECALCULATE_WEEK'"
              @click="adaptPlan('RECALCULATE_WEEK')"
            >
              Recalculate Remaining Week
            </UButton>
            <p class="text-[10px] text-muted text-center px-4">AI will look at your missed workouts and reschedule the rest of the week for optimal load.</p>

            <UButton 
              block 
              variant="outline" 
              color="primary" 
              icon="i-heroicons-arrow-right-circle"
              :loading="adapting === 'PUSH_FORWARD'"
              @click="adaptPlan('PUSH_FORWARD')"
            >
              Push Schedule Forward 1 Day
            </UButton>
            <p class="text-[10px] text-muted text-center px-4">Shifts all future planned workouts by one day.</p>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Block Timeline -->
    <div class="relative pt-6 pb-2">
      <div class="h-2 bg-gray-200 dark:bg-gray-800 rounded-full w-full absolute top-9 z-0"></div>
      <div class="relative z-10 flex justify-between">
        <div 
          v-for="block in plan.blocks" 
          :key="block.id"
          class="flex flex-col items-center cursor-pointer group"
          @click="selectedBlockId = block.id"
        >
          <div 
            class="w-4 h-4 rounded-full border-2 transition-all mb-2"
            :class="getBlockStatusColor(block)"
          ></div>
          <div class="text-xs font-semibold" :class="selectedBlockId === block.id ? 'text-primary' : 'text-muted'">
            {{ block.name }}
          </div>
          <div class="text-[10px] text-muted hidden group-hover:block">{{ block.durationWeeks }}w</div>
        </div>
      </div>
    </div>

    <!-- Active Week View -->
    <div v-if="selectedBlock" class="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
      <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <h3 class="font-semibold text-lg">{{ selectedBlock.name }} - Overview</h3>
        <div class="flex gap-2">
           <UButton 
             v-for="week in selectedBlock.weeks" 
             :key="week.id"
             size="xs"
             :variant="selectedWeekId === week.id ? 'solid' : 'ghost'"
             @click="selectedWeekId = week.id"
           >
             Week {{ week.weekNumber }}
           </UButton>
        </div>
      </div>

      <div class="p-4">
        <div v-if="selectedWeek" class="space-y-4">
          <!-- Week Stats -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <div class="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div class="text-xs text-muted">Focus</div>
              <div class="font-bold">{{ selectedWeek.focus || selectedBlock.primaryFocus }}</div>
            </div>
            <div class="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div class="text-xs text-muted">Volume</div>
              <div class="font-bold">{{ Math.round((selectedWeek.volumeTargetMinutes / 60) * 10) / 10 }}h</div>
            </div>
            <div class="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div class="text-xs text-muted">TSS</div>
              <div class="font-bold">{{ selectedWeek.tssTarget }}</div>
            </div>
             <div class="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div class="text-xs text-muted">Type</div>
              <div class="font-bold" :class="selectedWeek.isRecovery ? 'text-green-500' : ''">
                {{ selectedWeek.isRecovery ? 'Recovery' : 'Training' }}
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2 text-xs text-muted mb-2 px-1">
            <UIcon name="i-heroicons-information-circle" class="w-4 h-4" />
            <span>Tip: Drag and drop rows to reorder workouts within the week.</span>
          </div>

          <!-- Workouts Table -->
          <table class="w-full text-sm">
            <thead class="bg-gray-50 dark:bg-gray-900 text-muted">
              <tr>
                <th class="w-8"></th>
                <th class="px-4 py-2 text-left w-10"></th>
                <th class="px-4 py-2 text-left">Day</th>
                <th class="px-4 py-2 text-left">Workout</th>
                <th class="px-4 py-2 text-left">Duration / Metric</th>
                <th class="px-4 py-2 text-left">Visual</th>
                <th class="px-4 py-2 text-center">
                  <div class="flex items-center justify-center gap-1">
                    <UIcon name="i-heroicons-chart-bar" class="w-4 h-4 inline" title="Structured Workout" />
                    <UButton
                      v-if="selectedWeek?.workouts.some((w: any) => !w.structuredWorkout)"
                      size="xs"
                      color="primary"
                      variant="ghost"
                      icon="i-heroicons-sparkles"
                      title="Generate structure for all workouts in this week"
                      :loading="generatingAllStructures"
                      @click="generateAllStructureForWeek"
                    />
                  </div>
                </th>
                <th class="px-4 py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
              <tr
                v-for="workout in selectedWeek.workouts"
                :key="workout.id"
                class="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors group"
                draggable="true"
                @dragstart="onDragStart($event, workout)"
                @dragover.prevent
                @drop="onDrop($event, workout)"
                @click="navigateToWorkout(workout.id)"
                :class="{ 'opacity-50': draggingId === workout.id }"
              >
                <td class="pl-2 text-center cursor-move text-gray-300 group-hover:text-gray-500">
                  <UIcon name="i-heroicons-bars-2" class="w-4 h-4" />
                </td>
                <td class="px-4 py-3 text-center border-l-4" :class="getSportColorClass(workout.type)">
                   <UIcon :name="getWorkoutIcon(workout.type)" class="w-5 h-5 text-muted" />
                </td>
                <td class="px-4 py-3 font-medium">{{ formatDay(workout.date) }}</td>
                <td class="px-4 py-3">
                  <div class="font-semibold">{{ workout.title }}</div>
                  <div class="text-xs text-muted">{{ workout.type }}</div>
                </td>
                <td class="px-4 py-3">
                    <div>{{ Math.round(workout.durationSec / 60) }}m</div>
                    <div v-if="workout.distanceMeters" class="text-xs text-muted">
                        {{ Math.round(workout.distanceMeters / 1000 * 10) / 10 }} km
                    </div>
                </td>
                <td class="px-4 py-3">
                    <!-- Dynamic Visual Column -->
                    <div v-if="workout.type === 'Ride' || workout.type === 'VirtualRide'">
                        <span class="font-semibold text-gray-700 dark:text-gray-300">
                            {{ Math.round(workout.tss || 0) }} TSS
                        </span>
                        <div v-if="userFtp && workout.workIntensity" class="text-xs text-muted">
                            {{ Math.round((workout.workIntensity || 0) * userFtp) }}W
                        </div>
                    </div>
                    <div v-else-if="workout.type === 'Run'">
                         <div class="text-xs font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded inline-block">
                            Run Focus
                         </div>
                    </div>
                    <div v-else-if="workout.type === 'Swim'">
                         <div class="text-xs font-bold text-cyan-500 bg-cyan-50 dark:bg-cyan-900/20 px-2 py-1 rounded inline-block">
                            {{ Math.round(workout.distanceMeters || 0) }}m
                         </div>
                    </div>
                    <div v-else-if="workout.type === 'Gym' || workout.type === 'WeightTraining'">
                         <div class="flex gap-1">
                            <span class="text-[10px] font-bold uppercase bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 px-1.5 py-0.5 rounded">Strength</span>
                         </div>
                    </div>
                </td>
                <td class="px-4 py-3 text-center">
                  <div class="flex justify-center">
                    <MiniWorkoutChart
                      v-if="workout.structuredWorkout"
                      :workout="workout.structuredWorkout"
                    />
                    <UButton
                      v-else
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      icon="i-heroicons-sparkles"
                      :loading="generatingStructureForWorkoutId === workout.id"
                      @click.stop="generateStructureForWorkout(workout.id)"
                      title="Generate Structured Workout"
                    />
                  </div>
                </td>
                <td class="px-4 py-3 text-right">
                  <UBadge :color="workout.completed ? 'success' : 'neutral'" size="xs">
                    {{ workout.completed ? 'Done' : 'Planned' }}
                  </UBadge>
                </td>
              </tr>
              <tr v-if="selectedWeek.workouts.length === 0">
                <td :colspan="userFtp ? 8 : 7" class="px-4 py-8 text-center text-muted">
                  <div v-if="isGenerating" class="flex flex-col items-center justify-center space-y-2 text-yellow-600 py-8">
                    <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin" />
                    <span class="font-medium animate-pulse">Generating Workouts...</span>
                    <span class="text-xs text-muted">This may take a minute as AI designs your optimal week.</span>
                  </div>
                  <div v-else>
                    No workouts generated for this week yet.
                    <div class="mt-2 flex justify-center">
                      <UButton 
                        size="xs" 
                        color="primary" 
                        variant="soft" 
                        :loading="generatingWorkouts"
                        @click="generateWorkoutsForBlock"
                      >
                        Generate Workouts
                      </UButton>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Zone Distribution Chart -->
      <WeeklyZoneSummary 
        v-if="selectedWeek" 
        :workouts="selectedWeek.workouts" 
        :loading="generatingAllStructures"
        @generate="generateAllStructureForWeek"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import MiniWorkoutChart from '~/components/workouts/MiniWorkoutChart.vue'
import WeeklyZoneSummary from '~/components/ui/WeeklyZoneSummary.vue'

const props = defineProps<{
  plan: any
  userFtp?: number
  isGenerating?: boolean
  shouldAutoGenerate?: boolean
}>()

const emit = defineEmits(['refresh', 'generation-started'])

const selectedBlockId = ref<string | null>(null)
const selectedWeekId = ref<string | null>(null)
const showAdaptModal = ref(false)
const showSaveTemplateModal = ref(false)
const showAbandonModal = ref(false)
const templateName = ref('')
const templateDescription = ref('')
const savingTemplate = ref(false)
const abandoning = ref(false)
const generatingWorkouts = ref(false)
const generatingStructureForWorkoutId = ref<string | null>(null)
const generatingAllStructures = ref(false)
const adapting = ref<string | null>(null)
const draggingId = ref<string | null>(null)
const toast = useToast()

// Computed
const currentBlock = computed(() => {
  // Find block encompassing "today"
  const now = new Date()
  return props.plan.blocks.find((b: any) => new Date(b.startDate) <= now && new Date(b.startDate).getTime() + (b.durationWeeks * 7 * 24 * 3600 * 1000) > now.getTime()) || props.plan.blocks[0]
})

const selectedBlock = computed(() => props.plan.blocks.find((b: any) => b.id === selectedBlockId.value))
const selectedWeek = computed(() => selectedBlock.value?.weeks.find((w: any) => w.id === selectedWeekId.value))

// Helpers
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDay(d: string) {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })
}

function getBlockStatusColor(block: any) {
  if (selectedBlockId.value === block.id) return 'bg-white border-primary scale-125'
  // Logic for past/future based on date could go here
  return 'bg-primary border-primary'
}

function getWorkoutIcon(type: string) {
  const map: Record<string, string> = {
    'Ride': 'i-heroicons-bolt',
    'VirtualRide': 'i-heroicons-bolt',
    'Run': 'i-heroicons-fire',
    'Swim': 'i-heroicons-drop',
    'Gym': 'i-heroicons-trophy',
    'WeightTraining': 'i-heroicons-trophy',
    'Rest': 'i-heroicons-moon',
    'Active Recovery': 'i-heroicons-arrow-path-rounded-square'
  }
  return map[type] || 'i-heroicons-question-mark-circle'
}

function getSportColorClass(type: string) {
    const map: Record<string, string> = {
        'Ride': 'border-green-500',
        'VirtualRide': 'border-green-500',
        'Run': 'border-orange-500',
        'Swim': 'border-cyan-500',
        'Gym': 'border-purple-500',
        'WeightTraining': 'border-purple-500',
        'Rest': 'border-gray-200 dark:border-gray-700'
    }
    return map[type] || 'border-gray-200'
}

function navigateToWorkout(workoutId: string) {
  navigateTo(`/workouts/planned/${workoutId}`)
}

function onDragStart(event: DragEvent, workout: any) {
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', workout.id)
  }
  draggingId.value = workout.id
}

async function onDrop(event: DragEvent, targetWorkout: any) {
  const sourceId = draggingId.value
  draggingId.value = null
  
  if (!sourceId || sourceId === targetWorkout.id) return
  
  // Find source in list
  const sourceWorkout = selectedWeek.value.workouts.find((w: any) => w.id === sourceId)
  if (!sourceWorkout) return

  // Optimistic Swap Dates
  const sourceDate = sourceWorkout.date
  const targetDate = targetWorkout.date
  
  // Swap in UI (mutating prop/local state temporarily)
  sourceWorkout.date = targetDate
  targetWorkout.date = sourceDate
  
  // Re-sort list by date to reflect visual change
  selectedWeek.value.workouts.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
  
  // Call API
  try {
    await $fetch(`/api/workouts/planned/${sourceId}/move`, {
      method: 'POST',
      body: { targetDate: targetDate }
    })
    toast.add({ title: 'Workout moved', color: 'success' })
    emit('refresh')
  } catch (error) {
    // Revert on fail
    sourceWorkout.date = sourceDate
    targetWorkout.date = targetDate
    selectedWeek.value.workouts.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
    toast.add({ title: 'Failed to move', color: 'error' })
  }
}

async function generateWorkoutsForBlock() {
  if (!selectedBlockId.value) return
  
  generatingWorkouts.value = true
  try {
    await $fetch('/api/plans/generate-block', {
      method: 'POST',
      body: { blockId: selectedBlockId.value }
    })
    
    toast.add({
      title: 'Generation Started',
      description: 'AI is generating workouts for this block. Refresh in a few moments.',
      color: 'success'
    })
    
    // Auto refresh after a delay
    // We poll until we see workouts, then trigger auto-structure if needed
    const pollInterval = setInterval(() => {
      emit('refresh')
      
      // Check if we have workouts now
      if (selectedWeek.value?.workouts?.length > 0) {
        clearInterval(pollInterval)
        generatingWorkouts.value = false
        toast.add({ title: 'Workouts Generated', color: 'success' })
        
        // Auto-trigger structure generation
        generateAllStructureForWeek()
      }
    }, 3000)

    // Safety timeout to stop polling
    setTimeout(() => {
      if (generatingWorkouts.value) {
        clearInterval(pollInterval)
        generatingWorkouts.value = false
        // Let user retry if needed
      }
    }, 60000)

  } catch (error: any) {
    toast.add({
      title: 'Generation Failed',
      description: error.data?.message || 'Failed to trigger generation',
      color: 'error'
    })
      } finally {
      generatingWorkouts.value = false
    }
  }

  async function generateStructureForWorkout(workoutId: string) {
    generatingStructureForWorkoutId.value = workoutId
    try {
      await $fetch(`/api/workouts/planned/${workoutId}/generate-structure`, {
        method: 'POST'
      })
      
      toast.add({
        title: 'Generating...',
        description: 'AI is designing your workout structure. This takes a moment.',
        color: 'info'
      })
      
      // Poll for update or refresh
      // For simplicity, we trigger a full plan refresh after a delay
      setTimeout(() => {
        emit('refresh')
        generatingStructureForWorkoutId.value = null
      }, 5000)
      
    } catch (error: any) {
      toast.add({
        title: 'Generation Failed',
        description: error.data?.message || 'Failed to generate structure',
        color: 'error'
      })
      generatingStructureForWorkoutId.value = null
    }
  }

  async function generateAllStructureForWeek() {
    if (!selectedWeek.value) return
    
    // Find workouts without structure
    const pendingWorkouts = selectedWeek.value.workouts.filter((w: any) => !w.structuredWorkout)
    
    if (pendingWorkouts.length === 0) return
    
    generatingAllStructures.value = true
    toast.add({ 
      title: 'Batch Generation Started', 
      description: `Designing ${pendingWorkouts.length} workouts. This will take a minute...`, 
      color: 'info' 
    })
    
    try {
      // Process in batches of 3 to avoid overwhelming the server/LLM
      const batchSize = 3
      for (let i = 0; i < pendingWorkouts.length; i += batchSize) {
        const batch = pendingWorkouts.slice(i, i + batchSize)
        await Promise.all(batch.map((w: any) => 
          $fetch(`/api/workouts/planned/${w.id}/generate-structure`, { method: 'POST' })
            .catch(e => console.error(`Failed to generate for ${w.id}`, e))
        ))
      }
      
      // Poll for completion
      toast.add({ title: 'Generation Queued', description: 'Waiting for AI to finish designing workouts...', color: 'info' })
      
      let attempts = 0
      const maxAttempts = 20
      const pollInterval = setInterval(() => {
        attempts++
        emit('refresh')
        
        // Check if all workouts in the current week have structure now
        // We need to access the LATEST prop data, which might have updated via emit('refresh') -> parent refresh -> prop update
        // Since props are reactive, selectedWeek should reflect the new state
        const updatedPending = selectedWeek.value?.workouts.filter((w: any) => !w.structuredWorkout)
        
        if (updatedPending?.length === 0) {
          clearInterval(pollInterval)
          generatingAllStructures.value = false
          toast.add({ title: 'Generation Complete', color: 'success' })
        } else if (attempts >= maxAttempts) {
          clearInterval(pollInterval)
          generatingAllStructures.value = false
          toast.add({ title: 'Generation Complete (Timeout)', description: 'Some workouts might still be processing. Refresh manually if needed.', color: 'warning' })
        }
      }, 3000)
      
      // We return early and let the interval handle the final state
      return

    } catch (error) {
      console.error('Batch generation failed', error)
      toast.add({ title: 'Batch Generation Failed', color: 'error' })
      generatingAllStructures.value = false
    }
  }
  
  async function adaptPlan(type: string) {
    adapting.value = type
    try {
      await $fetch('/api/plans/adapt', {
        method: 'POST',
        body: { 
          planId: props.plan.id,
          adaptationType: type 
        }
      })
      
      toast.add({
        title: 'Adaptation Started',
        description: 'AI is recalculating your plan. Check back in a minute.',
        color: 'success'
      })
      
      showAdaptModal.value = false
      
      setTimeout(() => {
        emit('refresh')
      }, 15000)
    } catch (error: any) {
      toast.add({
        title: 'Adaptation Failed',
        description: error.data?.message || 'Failed to trigger adaptation',
        color: 'error'
      })
    } finally {
      adapting.value = null
    }
  }

  async function confirmAbandon() {
    abandoning.value = true
    try {
      await $fetch(`/api/plans/${props.plan.id}/abandon`, { method: 'POST' })
      toast.add({ title: 'Plan Abandoned', color: 'success' })
      emit('refresh')
      showAbandonModal.value = false
    } catch (error: any) {
      toast.add({ title: 'Failed to abandon plan', description: error.message, color: 'error' })
    } finally {
      abandoning.value = false
    }
  }

  async function saveTemplate() {
    if (!templateName.value) {
      toast.add({ title: 'Name required', color: 'error' })
      return
    }

    savingTemplate.value = true
    try {
      await $fetch(`/api/plans/${props.plan.id}/save-template`, {
        method: 'POST',
        body: {
          name: templateName.value,
          description: templateDescription.value
        }
      })
      toast.add({ title: 'Template Saved', color: 'success' })
      showSaveTemplateModal.value = false
    } catch (error: any) {
      toast.add({ title: 'Failed to save template', description: error.message, color: 'error' })
    } finally {
      savingTemplate.value = false
    }
  }
  
  // Watchers to auto-select defaults
  watch(() => props.plan, (newPlan) => {
    if (newPlan && newPlan.blocks.length > 0) {
      // 1. Determine Active Block
      const now = new Date().getTime()
      const activeBlock = newPlan.blocks.find((b: any) => {
        const start = new Date(b.startDate).getTime()
        const end = start + (b.durationWeeks * 7 * 24 * 3600 * 1000)
        return now >= start && now <= end
      }) || newPlan.blocks[0]
      
      selectedBlockId.value = activeBlock.id

      // 2. Determine Active Week within that block
      if (activeBlock.weeks.length > 0) {
        const currentWeek = activeBlock.weeks.find((w: any) => {
          return new Date(w.startDate).getTime() <= now && new Date(w.endDate).getTime() >= now
        })
        selectedWeekId.value = currentWeek ? currentWeek.id : activeBlock.weeks[0].id
      }

      // 3. Auto-trigger structure generation if requested
      if (props.shouldAutoGenerate) {
        // Wait a tick for computed properties to update
        nextTick(() => {
          generateAllStructureForWeek()
          emit('generation-started')
        })
      }
    }
  }, { immediate: true })

  // Watch specifically for the auto-generate prop to change
  watch(() => props.shouldAutoGenerate, (should) => {
    if (should) {
      nextTick(() => {
        generateAllStructureForWeek()
        emit('generation-started')
      })
    }
  })

  // When user manually changes block, update week
  watch(selectedBlockId, (newId) => {
    if (newId) {
      const block = props.plan.blocks.find((b: any) => b.id === newId)
      if (block && block.weeks.length > 0) {
        // Only reset if the current selected week is NOT in this block
        const weekInBlock = block.weeks.find((w: any) => w.id === selectedWeekId.value)
        if (!weekInBlock) {
           const now = new Date().getTime()
           const currentWeek = block.weeks.find((w: any) => {
             return new Date(w.startDate).getTime() <= now && new Date(w.endDate).getTime() >= now
           })
           selectedWeekId.value = currentWeek ? currentWeek.id : block.weeks[0].id
        }
      }
    }
  })
</script>
