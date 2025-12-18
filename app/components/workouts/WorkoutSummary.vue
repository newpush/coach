<template>
  <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
    <UCard class="bg-blue-50 dark:bg-blue-900/20 ring-blue-500/10">
      <div class="text-center space-y-1">
        <div class="text-3xl font-bold text-blue-600 dark:text-blue-400 tabular-nums tracking-tight">
          {{ totalWorkouts }}
        </div>
        <div class="text-[10px] font-bold text-blue-900/60 dark:text-blue-400/60 uppercase tracking-widest px-1">Total Workouts</div>
      </div>
    </UCard>
    
    <UCard class="bg-emerald-50 dark:bg-emerald-900/20 ring-emerald-500/10">
      <div class="text-center space-y-1">
        <div class="text-3xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums tracking-tight">
          {{ analyzedWorkouts }}
        </div>
        <div class="text-[10px] font-bold text-emerald-900/60 dark:text-emerald-400/60 uppercase tracking-widest px-1">AI Analyzed</div>
      </div>
    </UCard>
    
    <UCard class="bg-amber-50 dark:bg-amber-900/20 ring-amber-500/10">
      <div class="text-center space-y-1">
        <div class="text-3xl font-bold text-amber-600 dark:text-amber-400 tabular-nums tracking-tight">
          {{ avgScore !== null ? avgScore.toFixed(1) : '-' }}
        </div>
        <div class="text-[10px] font-bold text-amber-900/60 dark:text-amber-400/60 uppercase tracking-widest px-1">Avg Score</div>
      </div>
    </UCard>
    
    <UCard class="bg-purple-50 dark:bg-purple-900/20 ring-purple-500/10">
      <div class="text-center space-y-1">
        <div class="text-3xl font-bold text-purple-600 dark:text-purple-400 tabular-nums tracking-tight">
          {{ totalHours }}h
        </div>
        <div class="text-[10px] font-bold text-purple-900/60 dark:text-purple-400/60 uppercase tracking-widest px-1">Total Volume</div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  totalWorkouts: number
  analyzedWorkouts: number
  avgScore: number | null
  totalHours: number
}>()
</script>
