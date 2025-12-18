<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between px-1">
      <h2 class="text-xl font-bold text-gray-900 dark:text-white uppercase tracking-tight">Workout Performance</h2>
      <USelect
        v-model="period"
        :items="periodOptions"
        size="sm"
      />
    </div>
    
    <div v-if="loading" class="flex justify-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary-500" />
    </div>
    
    <div v-else-if="trendsData" class="space-y-6">
      <!-- Score Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <ScoreCard
          title="Overall"
          :score="trendsData.summary?.avgOverall"
          icon="i-heroicons-star"
          color="yellow"
          compact
          explanation="Click for AI-generated insights"
          @click="$emit('open-modal', 'Overall Workout Performance', trendsData.summary?.avgOverall, 'yellow')"
        />
        <ScoreCard
          title="Technical"
          :score="trendsData.summary?.avgTechnical"
          icon="i-heroicons-cog"
          color="blue"
          compact
          explanation="Click for AI-generated insights"
          @click="$emit('open-modal', 'Technical Execution', trendsData.summary?.avgTechnical, 'blue')"
        />
        <ScoreCard
          title="Effort"
          :score="trendsData.summary?.avgEffort"
          icon="i-heroicons-fire"
          color="red"
          compact
          explanation="Click for AI-generated insights"
          @click="$emit('open-modal', 'Effort Management', trendsData.summary?.avgEffort, 'red')"
        />
        <ScoreCard
          title="Pacing"
          :score="trendsData.summary?.avgPacing"
          icon="i-heroicons-chart-bar"
          color="green"
          compact
          explanation="Click for AI-generated insights"
          @click="$emit('open-modal', 'Pacing Strategy', trendsData.summary?.avgPacing, 'green')"
        />
        <ScoreCard
          title="Execution"
          :score="trendsData.summary?.avgExecution"
          icon="i-heroicons-check-circle"
          color="purple"
          compact
          explanation="Click for AI-generated insights"
          @click="$emit('open-modal', 'Workout Execution', trendsData.summary?.avgExecution, 'purple')"
        />
      </div>

      <!-- Trend Chart and Radar Chart Side by Side -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 space-y-4">
          <h3 class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest px-1">Score Trends</h3>
          <TrendChart :data="trendsData.workouts" type="workout" />
        </div>

        <div class="lg:col-span-1 space-y-4">
          <h3 class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest px-1">Current Balance</h3>
          <RadarChart
            :scores="{
              overall: trendsData.summary?.avgOverall,
              technical: trendsData.summary?.avgTechnical,
              effort: trendsData.summary?.avgEffort,
              pacing: trendsData.summary?.avgPacing,
              execution: trendsData.summary?.avgExecution
            }"
            type="workout"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  trendsData: any
  loading: boolean
  modelValue: number
}>()

const emit = defineEmits(['update:modelValue', 'open-modal'])

const period = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const periodOptions = [
  { label: '7 Days', value: 7 },
  { label: '14 Days', value: 14 },
  { label: '30 Days', value: 30 },
  { label: '90 Days', value: 90 }
]
</script>
