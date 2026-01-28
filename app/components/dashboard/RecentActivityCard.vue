<template>
  <UCard class="lg:col-span-2 overflow-hidden flex flex-col h-full">
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

    <!-- Activity Cards List -->
    <div v-else class="space-y-3 max-h-[500px] overflow-y-auto pr-2 -mr-2 p-1">
      <div
        v-for="item in activityStore.recentActivity.items as any[]"
        :key="item.id"
        class="group relative p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 ring-1 ring-inset ring-gray-200 dark:ring-gray-700 hover:ring-primary-500/50 hover:bg-white dark:hover:bg-gray-800 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md"
        @click="navigateActivity(item)"
      >
        <!-- Top Row: Icon + Title/Type + Chevron -->
        <div class="flex items-center gap-4">
          <!-- Icon Box -->
          <div
            class="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full"
            :class="getIconBgClass(item)"
          >
            <UIcon
              :name="item.icon || 'i-heroicons-calendar'"
              class="w-5 h-5"
              :class="getIconColorClass(item)"
            />
          </div>

          <!-- Title & Meta -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between mb-0.5">
              <p
                class="font-bold text-sm text-gray-900 dark:text-white truncate pr-2 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors"
              >
                {{ item.title }}
              </p>
              <span
                class="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest whitespace-nowrap bg-white dark:bg-gray-900 px-2 py-0.5 rounded-full ring-1 ring-gray-100 dark:ring-gray-800"
              >
                {{ formatActivityDate(item.date) }}
              </span>
            </div>

            <div
              v-if="item.activityType || item.sourceName"
              class="flex items-center gap-1.5 text-[10px] font-medium text-gray-500 dark:text-gray-400"
            >
              <span v-if="item.activityType">{{ item.activityType }}</span>
              <span
                v-if="item.activityType && item.sourceName"
                class="text-gray-300 dark:text-gray-600"
                >•</span
              >
              <span v-if="item.sourceName">{{ item.sourceName }}</span>
            </div>
          </div>

          <!-- Chevron -->
          <UIcon
            name="i-heroicons-chevron-right"
            class="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-primary-500 transform group-hover:translate-x-0.5 transition-all flex-shrink-0"
          />
        </div>

        <!-- Bottom Row: Details / Description -->
        <!-- Mobile: Full width (under icon). Desktop: Indented (aligned with title) -->
        <div class="mt-3 sm:mt-1 sm:pl-[3.5rem]">
          <div
            v-if="item.details && item.details.length > 0"
            class="grid grid-cols-3 sm:grid-cols-5 gap-x-2 gap-y-3"
          >
            <div v-for="(detail, i) in item.details" :key="i" class="space-y-1 min-w-0">
              <div
                class="flex items-center gap-1 text-[10px] font-bold text-gray-500/80 dark:text-gray-400/80 uppercase tracking-tight"
              >
                <UIcon
                  :name="detail.icon"
                  class="w-3 h-3 flex-shrink-0"
                  :class="getIconColorClass(item)"
                />
                <span class="truncate">{{ detail.label }}</span>
              </div>
              <div class="text-xs font-bold text-gray-900 dark:text-gray-100 tabular-nums truncate">
                {{ detail.value }}
              </div>
            </div>
          </div>

          <p
            v-else-if="item.description"
            class="text-xs font-medium text-gray-500 dark:text-gray-400 leading-relaxed truncate"
          >
            {{ item.description }}
          </p>
        </div>
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

  function getIconBgClass(item: any) {
    switch (item.type) {
      case 'workout':
        return 'bg-amber-50 dark:bg-amber-900/20'
      case 'wellness':
        return 'bg-blue-50 dark:bg-blue-900/20'
      case 'nutrition':
        return 'bg-emerald-50 dark:bg-emerald-900/20'
      default:
        return 'bg-gray-50 dark:bg-gray-800'
    }
  }

  function getIconColorClass(item: any) {
    switch (item.type) {
      case 'workout':
        return 'text-amber-500'
      case 'wellness':
        return 'text-blue-500'
      case 'nutrition':
        return 'text-emerald-500'
      default:
        return 'text-gray-500'
    }
  }

  // Format date for timeline display
  function formatActivityDate(date: string | Date): string {
    if (!date) return ''
    const activityDate = new Date(date)
    const today = getUserLocalDate()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    // Create day-only strings for comparison
    // activityDate is a timestamp -> convert to User Timezone date string
    const activityDateStr = formatDate(activityDate, 'yyyy-MM-dd')

    // today/yesterday are already "User Local Dates" stored as UTC midnight
    // e.g. "2023-10-27T00:00:00Z" means it is Oct 27th for the user.
    // So we just take the ISO date part (UTC) to compare.
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
</script>
