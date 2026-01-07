<template>
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- Activity Type Distribution -->
    <UCard class="bg-gray-50/50 dark:bg-gray-800/40">
      <template #header>
        <h3
          class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest px-1"
        >
          Activity Distribution
        </h3>
      </template>
      <div v-if="loading" class="flex items-center justify-center h-[300px]">
        <USkeleton class="h-64 w-64 rounded-full" />
      </div>
      <div v-else class="flex justify-center" style="height: 300px">
        <ClientOnly>
          <Doughnut :data="distributionData" :options="chartOptions" />
        </ClientOnly>
      </div>
    </UCard>

    <!-- Workout Scores Trend -->
    <UCard class="bg-gray-50/50 dark:bg-gray-800/40">
      <template #header>
        <h3
          class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest px-1"
        >
          Workout Scores (30d)
        </h3>
      </template>
      <div v-if="loading" class="flex items-center justify-center h-[300px] px-4">
        <USkeleton class="h-full w-full" />
      </div>
      <div v-else style="height: 300px">
        <ClientOnly>
          <Line :data="scoresData" :options="lineOptions" />
        </ClientOnly>
      </div>
    </UCard>

    <!-- Training Load Trend -->
    <UCard class="bg-gray-50/50 dark:bg-gray-800/40">
      <template #header>
        <h3
          class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest px-1"
        >
          Training Load (30d)
        </h3>
      </template>
      <div v-if="loading" class="flex items-center justify-center h-[300px] px-4">
        <USkeleton class="h-full w-full" />
      </div>
      <div v-else style="height: 300px">
        <ClientOnly>
          <Bar :data="loadData" :options="barOptions" />
        </ClientOnly>
      </div>
    </UCard>

    <!-- Weekly Training Volume -->
    <UCard class="bg-gray-50/50 dark:bg-gray-800/40">
      <template #header>
        <h3
          class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest px-1"
        >
          Weekly Volume (8w)
        </h3>
      </template>
      <div v-if="loading" class="flex items-center justify-center h-[300px] px-4">
        <USkeleton class="h-full w-full" />
      </div>
      <div v-else style="height: 300px">
        <ClientOnly>
          <Bar :data="volumeData" :options="barOptions" />
        </ClientOnly>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
  import { Doughnut, Line, Bar } from 'vue-chartjs'
  import {
    Chart as ChartJS,
    ArcElement,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend
  } from 'chart.js'

  // Register Chart.js components
  ChartJS.register(
    ArcElement,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend
  )

  defineProps<{
    loading?: boolean
    distributionData: any
    scoresData: any
    loadData: any
    volumeData: any
    chartOptions: any
    lineOptions: any
    barOptions: any
  }>()
</script>
