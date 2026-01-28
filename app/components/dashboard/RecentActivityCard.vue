<template>
  <UCard
    class="lg:col-span-2 overflow-hidden flex flex-col h-full"
    :ui="{ body: 'px-4 py-4 sm:px-6 sm:py-6' }"
  >
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-clock" class="w-5 h-5 text-primary-500" />
          <h3 class="font-bold text-sm tracking-tight uppercase">Recent Activity</h3>
        </div>
        <UBadge
          v-if="activityStore.recentActivity && activityStore.recentActivity.items.length > 0"
          color="neutral"
          variant="subtle"
          size="xs"
          class="font-bold uppercase tracking-widest"
        >
          Last 5 Days
        </UBadge>
      </div>
    </template>

    <!-- Loading state -->
    <div v-if="activityStore.loading" class="text-center py-8">
      <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin inline text-primary" />
      <p class="text-sm text-muted mt-2">Loading activity...</p>
    </div>

    <!-- No activity -->
    <div
      v-else-if="!activityStore.recentActivity || activityStore.recentActivity.items.length === 0"
      class="text-center py-8"
    >
      <UIcon name="i-heroicons-calendar" class="w-12 h-12 mx-auto text-muted mb-3" />
      <p class="text-sm text-muted">No recent activity found. Your data is syncing...</p>
    </div>

    <!-- New Layout -->
    <div v-else class="space-y-5">
      <!-- Hero Card (Latest Wellness) -->
      <DashboardActivityCardHero
        v-if="heroItem"
        :item="heroItem"
        :date-label="getDateLabel(heroItem.date)"
        @click="navigateActivity(heroItem)"
      />

      <!-- Activity List -->
      <div v-if="listItems.length > 0" class="space-y-1">
        <div class="flex items-center gap-2 mb-2 px-1">
          <div class="h-px bg-gray-100 dark:bg-gray-800 flex-1"></div>
          <span class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">History</span>
          <div class="h-px bg-gray-100 dark:bg-gray-800 flex-1"></div>
        </div>
        <DashboardActivityRowCompact
          v-for="item in listItems"
          :key="item.id"
          :item="item"
          :date-label="getDateLabel(item.date)"
          @click="navigateActivity(item)"
        />
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
  const activityStore = useActivityStore()
  const { formatDate, getUserLocalDate } = useFormat()

  function navigateActivity(item: any) {
    if (item.link) {
      navigateTo(item.link)
    }
  }

  // Format date for timeline display
  function getDateLabel(date: string | Date): string {
    if (!date) return ''
    const activityDate = new Date(date)
    const today = getUserLocalDate()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    // Create day-only strings for comparison
    const activityDateStr = formatDate(activityDate, 'yyyy-MM-dd')
    const todayStr = today.toISOString().split('T')[0]
    const yesterdayStr = yesterday.toISOString().split('T')[0]

    if (activityDateStr === todayStr) {
      return 'Today'
    } else if (activityDateStr === yesterdayStr) {
      return 'Yesterday'
    } else {
      return formatDate(activityDate, 'MMM d')
    }
  }

  // Logic to split items
  const heroItem = computed(() => {
    if (!activityStore.recentActivity?.items) return null
    // Find the first wellness item (Recent Activity is already sorted by date desc)
    return activityStore.recentActivity.items.find((i: any) => i.type === 'wellness')
  })

  const listItems = computed(() => {
    if (!activityStore.recentActivity?.items) return []
    const heroId = heroItem.value?.id
    // Return all items except the hero item
    return activityStore.recentActivity.items.filter((i: any) => i.id !== heroId)
  })
</script>
