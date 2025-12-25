<template>
  <div class="space-y-6">
    <!-- Header / Overview -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold">{{ plan.goal.title }}</h2>
        <div class="flex items-center gap-2 text-muted mt-1">
          <UIcon name="i-heroicons-calendar" class="w-4 h-4" />
          <span>Target: {{ formatDate(plan.targetDate) }}</span>
          <span class="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">{{ plan.strategy }}</span>
        </div>
      </div>
      <div class="text-right">
        <div class="text-sm text-muted">Current Phase</div>
        <div class="font-bold text-lg text-primary">{{ currentBlock?.name || 'Prep' }}</div>
        <UButton size="xs" color="gray" variant="ghost" icon="i-heroicons-adjustments-horizontal" @click="showAdaptModal = true">
          Adapt Plan
        </UButton>
      </div>
    </div>

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
              <div class="font-bold">{{ selectedWeek.volumeTargetMinutes / 60 }}h</div>
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

          <!-- Workouts Table -->
          <table class="w-full text-sm">
            <thead class="bg-gray-50 dark:bg-gray-900 text-muted">
              <tr>
                <th class="px-4 py-2 text-left">Day</th>
                <th class="px-4 py-2 text-left">Workout</th>
                <th class="px-4 py-2 text-left">Duration</th>
                <th class="px-4 py-2 text-left">TSS</th>
                <th class="px-4 py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
              <tr v-for="workout in selectedWeek.workouts" :key="workout.id" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td class="px-4 py-3 font-medium">{{ formatDay(workout.date) }}</td>
                <td class="px-4 py-3">
                  <div class="font-semibold">{{ workout.title }}</div>
                  <div class="text-xs text-muted">{{ workout.type }}</div>
                </td>
                <td class="px-4 py-3">{{ Math.round(workout.durationSec / 60) }}m</td>
                <td class="px-4 py-3">{{ Math.round(workout.tss) }}</td>
                <td class="px-4 py-3 text-right">
                  <UBadge :color="workout.completed ? 'green' : 'gray'" size="xs">
                    {{ workout.completed ? 'Done' : 'Planned' }}
                  </UBadge>
                </td>
              </tr>
              <tr v-if="selectedWeek.workouts.length === 0">
                <td colspan="5" class="px-4 py-8 text-center text-muted">
                  No workouts generated for this week yet.
                  <div class="mt-2">
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
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  plan: any
}>()

const emit = defineEmits(['refresh'])

const selectedBlockId = ref<string | null>(null)
const selectedWeekId = ref<string | null>(null)
const showAdaptModal = ref(false)
const generatingWorkouts = ref(false)
const adapting = ref<string | null>(null)
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
    setTimeout(() => {
      emit('refresh')
    }, 10000)
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
    }
  }, { immediate: true })

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
