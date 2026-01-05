<template>
  <UCard class="flex flex-col overflow-hidden">
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-user-circle" class="w-5 h-5 text-primary-500" />
          <h3 class="font-bold text-sm tracking-tight uppercase">Athlete Profile</h3>
        </div>
        <UButton
          to="/profile/settings"
          icon="i-heroicons-pencil"
          color="neutral"
          variant="ghost"
          size="xs"
          class="rounded-full"
        />
      </div>
    </template>
    
    <!-- Loading skeleton -->
    <div v-if="userStore?.loading && !userStore?.profile" class="space-y-4 animate-pulse flex-grow">
      <div>
        <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-2"></div>
        <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-48"></div>
      </div>
      <div class="pt-2 border-t space-y-2">
        <div class="flex justify-between">
          <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
          <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
        </div>
        <div class="flex justify-between">
          <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
          <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
        </div>
        <div class="flex justify-between">
          <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
          <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
        </div>
      </div>
    </div>
    
    <!-- Actual profile data -->
    <div v-else-if="userStore?.profile" class="space-y-4 flex-grow">
      <!-- Profile Info Card - Clickable -->
      <NuxtLink
        to="/profile/athlete"
        class="group block w-full text-left p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 ring-1 ring-inset ring-gray-200 dark:ring-gray-700 hover:ring-primary-500/50 transition-all duration-200"
      >
         <div class="flex items-center justify-between mb-3">
            <p class="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Athlete's Profile</p>
            <div class="flex items-center gap-2">
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-heroicons-arrow-path"
                :loading="userStore?.generating"
                @click.prevent="userStore?.generateProfile"
              >
                Refresh
              </UButton>
              <UIcon name="i-heroicons-chevron-right" class="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors" />
            </div>
          </div>
          
          <div class="mb-3">
            <div class="flex items-baseline gap-2">
              <p class="font-bold text-lg text-gray-900 dark:text-white">{{ userStore.profile.name || 'Athlete' }}</p>
              <p v-if="userStore.profile.age" class="text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-widest">
                {{ userStore.profile.age }} yrs
              </p>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-3">
             <div class="space-y-1">
              <div class="flex items-center gap-1 text-[10px] font-bold text-gray-500 uppercase">
                 <UIcon name="i-heroicons-heart-solid" class="w-3 h-3 text-rose-500" />
                 Max HR
               </div>
              <div class="text-sm font-bold text-gray-900 dark:text-white">
                <template v-if="userStore.profile.maxHr">{{ userStore.profile.maxHr }} bpm</template>
                <template v-else-if="userStore.profile.estimatedMaxHR">~{{ userStore.profile.estimatedMaxHR }} bpm</template>
                <UButton v-else to="/profile/settings" icon="i-heroicons-pencil" color="neutral" variant="soft" size="xs" class="-my-1" @click.stop />
              </div>
            </div>
            <div class="space-y-1">
               <div class="flex items-center gap-1 text-[10px] font-bold text-gray-500 uppercase">
                 <UIcon name="i-heroicons-heart" class="w-3 h-3 text-blue-500" />
                 Resting HR
               </div>
               <div class="text-sm font-bold text-gray-900 dark:text-white">
                 <template v-if="userStore.profile.restingHr">{{ userStore.profile.restingHr }} bpm</template>
                 <UButton v-else to="/profile/settings" icon="i-heroicons-pencil" color="neutral" variant="soft" size="xs" class="-my-1" @click.stop />
               </div>
            </div>
            <div class="space-y-1">
               <div class="flex items-center gap-1 text-[10px] font-bold text-gray-500 uppercase">
                 <UIcon name="i-heroicons-fire" class="w-3 h-3 text-orange-500" />
                 LTHR
               </div>
               <div class="text-sm font-bold text-gray-900 dark:text-white">
                 <template v-if="userStore.profile.lthr">{{ userStore.profile.lthr }} bpm</template>
                 <UButton v-else to="/profile/settings" icon="i-heroicons-pencil" color="neutral" variant="soft" size="xs" class="-my-1" @click.stop />
               </div>
            </div>
          </div>
      </NuxtLink>

      <!-- Training Load & Form Section -->
      <NuxtLink
        to="/performance"
        class="group block w-full text-left p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 ring-1 ring-inset ring-gray-200 dark:ring-gray-700 hover:ring-primary-500/50 transition-all duration-200"
      >
        <div class="flex items-center justify-between mb-3">
          <p class="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-widest">Training Load & Form</p>
          <UIcon name="i-heroicons-chevron-right" class="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors" />
        </div>
        
        <div v-if="pmcLoading" class="grid grid-cols-3 gap-3 animate-pulse">
          <div v-for="i in 3" :key="i" class="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
        </div>
        
        <div v-else-if="pmcData?.summary" class="grid grid-cols-3 gap-3">
          <div class="space-y-1">
            <div class="flex items-center gap-1 text-[10px] font-bold text-gray-500 uppercase">
              <UIcon name="i-heroicons-presentation-chart-line" class="w-3 h-3 text-purple-500" />
              CTL <span class="text-[9px] font-normal lowercase opacity-70">(fitness)</span>
            </div>
            <div class="text-sm font-bold text-gray-900 dark:text-white">{{ (pmcData.summary.currentCTL ?? 0).toFixed(0) }}</div>
          </div>
          <div class="space-y-1">
            <div class="flex items-center gap-1 text-[10px] font-bold text-gray-500 uppercase">
              <UIcon name="i-heroicons-bolt" class="w-3 h-3 text-yellow-500" />
              ATL <span class="text-[9px] font-normal lowercase opacity-70">(fatigue)</span>
            </div>
            <div class="text-sm font-bold text-gray-900 dark:text-white">{{ (pmcData.summary.currentATL ?? 0).toFixed(0) }}</div>
          </div>
          <div class="space-y-1">
            <div class="flex items-center gap-1 text-[10px] font-bold text-gray-500 uppercase">
              <UIcon name="i-heroicons-chart-bar" class="w-3 h-3" :class="getTSBIconColor(pmcData.summary.currentTSB)" />
              TSB <span class="text-[9px] font-normal lowercase opacity-70">(form)</span>
            </div>
            <div class="text-sm font-bold" :class="getTSBTextColor(pmcData.summary.currentTSB)">
              {{ (pmcData.summary.currentTSB ?? 0) > 0 ? '+' : '' }}{{ (pmcData.summary.currentTSB ?? 0).toFixed(0) }}
            </div>
          </div>
        </div>
        <div v-else class="text-xs text-gray-500 italic text-center py-1">Connect Intervals.icu for training load data</div>
      </NuxtLink>
      
      <!-- Performance Section - Clickable -->
      <NuxtLink
        to="/performance"
        class="group block w-full text-left p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 ring-1 ring-inset ring-gray-200 dark:ring-gray-700 hover:ring-primary-500/50 transition-all duration-200"
      >
        <div class="flex items-center justify-between mb-3">
          <p class="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">Core Performance</p>
          <UIcon name="i-heroicons-chevron-right" class="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors" />
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div class="space-y-1">
            <div class="flex items-center gap-1 text-[10px] font-bold text-gray-500 uppercase">
              <UIcon name="i-heroicons-bolt-solid" class="w-3 h-3" />
              FTP
            </div>
            <div class="text-sm font-bold text-gray-900 dark:text-white">
              <template v-if="userStore.profile.ftp">{{ userStore.profile.ftp }}W</template>
              <UButton v-else to="/profile/settings" icon="i-heroicons-pencil" color="neutral" variant="soft" size="xs" class="-my-1" @click.stop />
            </div>
          </div>
          <div class="space-y-1">
            <div class="flex items-center gap-1 text-[10px] font-bold text-gray-500 uppercase">
              <UIcon name="i-heroicons-scale" class="w-3 h-3" />
              Weight
            </div>
            <div class="text-sm font-bold text-gray-900 dark:text-white">
              <template v-if="userStore.profile.weight">{{ userStore.profile.weight }}kg</template>
              <UButton v-else to="/profile/settings" icon="i-heroicons-pencil" color="neutral" variant="soft" size="xs" class="-my-1" @click.stop />
            </div>
          </div>
          <div class="space-y-1">
            <div class="flex items-center gap-1 text-[10px] font-bold text-gray-500 uppercase">
              <UIcon name="i-heroicons-chart-bar-square" class="w-3 h-3" />
              W/kg
            </div>
            <div class="text-sm font-bold text-gray-900 dark:text-white">
              <template v-if="userStore.profile.ftp && userStore.profile.weight">
                {{ (userStore.profile.ftp / userStore.profile.weight).toFixed(2) }}
              </template>
              <UButton v-else to="/profile/settings" icon="i-heroicons-pencil" color="neutral" variant="soft" size="xs" class="-my-1" @click.stop />
            </div>
          </div>
        </div>
      </NuxtLink>
      
      <!-- Wellness Section - Clickable -->
      <button
        v-if="userStore.profile.recentHRV || userStore.profile.restingHr || userStore.profile.recentSleep || userStore.profile.recentRecoveryScore"
        @click="$emit('open-wellness')"
        class="group w-full text-left p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 ring-1 ring-inset ring-gray-200 dark:ring-gray-700 hover:ring-primary-500/50 transition-all duration-200"
      >
        <div class="flex items-center justify-between mb-3">
          <p class="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Latest Wellness</p>
          <UIcon name="i-heroicons-chevron-right" class="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors" />
        </div>
        <div class="grid grid-cols-3 gap-4">
          <div v-if="userStore.profile.recentSleep" class="space-y-1">
             <div class="flex items-center gap-1 text-[10px] font-bold text-gray-500 uppercase">
                <UIcon name="i-heroicons-moon" class="w-3 h-3 text-indigo-500" />
                Sleep
             </div>
             <div class="text-sm font-bold text-gray-900 dark:text-white">{{ userStore.profile.recentSleep.toFixed(1) }}h</div>
          </div>
          <div v-if="userStore.profile.recentHRV" class="space-y-1">
             <div class="flex items-center gap-1 text-[10px] font-bold text-gray-500 uppercase">
               <UIcon name="i-heroicons-heart" class="w-3 h-3 text-indigo-500" />
               HRV
             </div>
            <div class="text-sm font-bold text-gray-900 dark:text-white">{{ Math.round(userStore.profile.recentHRV) }} ms</div>
          </div>
           <div v-if="userStore.profile.restingHr" class="space-y-1">
             <div class="flex items-center gap-1 text-[10px] font-bold text-gray-500 uppercase">
               <UIcon name="i-heroicons-heart" class="w-3 h-3 text-indigo-500" />
               RHR
             </div>
            <div class="text-sm font-bold text-gray-900 dark:text-white">{{ userStore.profile.restingHr }} bpm</div>
          </div>
        </div>
      </button>
    </div>
  </UCard>
</template>

<script setup lang="ts">
const userStore = useUserStore()
const integrationStore = useIntegrationStore()

defineEmits(['open-wellness'])

const pmcData = ref<any>(null)
const pmcLoading = ref(false)

async function fetchPMCData() {
  if (!integrationStore.intervalsConnected) return
  
  pmcLoading.value = true
  try {
    const data = await $fetch('/api/performance/pmc', {
      query: { days: 7 }
    })
    pmcData.value = data
  } catch (e) {
    console.error('Failed to load PMC data', e)
  } finally {
    pmcLoading.value = false
  }
}

function getTSBTextColor(tsb: number | undefined) {
  const val = tsb ?? 0
  if (val >= 5) return 'text-green-600 dark:text-green-400'
  if (val < -30) return 'text-red-600 dark:text-red-400'
  if (val < -10) return 'text-orange-600 dark:text-orange-400'
  return 'text-gray-900 dark:text-white'
}

function getTSBIconColor(tsb: number | undefined) {
  const val = tsb ?? 0
  if (val >= 5) return 'text-green-500'
  if (val < -30) return 'text-red-500'
  if (val < -10) return 'text-orange-500'
  return 'text-gray-400'
}

onMounted(() => {
  fetchPMCData()
})

watch(() => integrationStore.intervalsConnected, (connected) => {
  if (connected) fetchPMCData()
})

function formatWellnessDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
</script>
