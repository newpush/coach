<template>
  <div
    class="relative pl-8 pb-10 border-l-2 border-gray-100 dark:border-gray-800 last:border-0 last:pb-0"
  >
    <!-- Timeline Icon -->
    <div
      class="absolute left-[-11px] top-0 w-5 h-5 rounded-full border-2 bg-white dark:bg-gray-900 z-10 flex items-center justify-center shadow-sm"
      :class="statusBorderClass"
    >
      <UIcon :name="windowIcon" class="w-3 h-3" :class="statusTextClass" />
    </div>

    <!-- Content Card -->
    <div class="space-y-4">
      <!-- Window Header -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-black uppercase tracking-widest text-gray-900 dark:text-white">
              {{ title }}
            </h3>
            <div
              v-if="compliance === 'HIT'"
              class="flex items-center gap-1 text-[10px] font-bold text-green-500 uppercase"
            >
              <UIcon name="i-heroicons-check-badge" class="w-3 h-3" />
              Hit
            </div>
            <div v-if="!isLocked" class="flex items-center gap-1 ml-1">
              <UButton
                icon="i-heroicons-plus-circle"
                variant="ghost"
                color="neutral"
                size="xs"
                class="opacity-40 hover:opacity-100 transition-opacity"
                @click="$emit('add', { type, meals })"
              />
              <UButton
                icon="i-heroicons-sparkles"
                variant="ghost"
                color="primary"
                size="xs"
                class="opacity-40 hover:opacity-100 transition-opacity"
                @click="$emit('addAi', { type, meals })"
              />
            </div>
          </div>
          <p class="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
            {{ formatTime(startTime) }} — {{ formatTime(endTime) }}
          </p>
        </div>

        <!-- Targets Chips -->
        <div class="flex flex-wrap gap-2">
          <div
            v-if="targetCarbs > 0"
            class="flex items-center gap-1.5 px-2 py-1 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-100 dark:border-yellow-900/50"
          >
            <UIcon name="i-tabler-bread" class="w-3.5 h-3.5 text-yellow-500" />
            <span class="text-xs font-black text-yellow-700 dark:text-yellow-400"
              >{{ targetCarbs }}g</span
            >
          </div>
          <div
            v-if="targetProtein > 0"
            class="flex items-center gap-1.5 px-2 py-1 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-900/50"
          >
            <UIcon name="i-tabler-egg" class="w-3.5 h-3.5 text-blue-500" />
            <span class="text-xs font-black text-blue-700 dark:text-blue-400"
              >{{ targetProtein }}g</span
            >
          </div>

          <!-- Supplement Pips -->
          <div
            v-if="supplements?.length"
            class="flex gap-1 ml-1 border-l border-gray-200 dark:border-gray-700 pl-2"
          >
            <UTooltip v-for="supp in supplements" :key="supp" :text="supp">
              <div
                class="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center border border-purple-200 dark:border-purple-800"
              >
                <UIcon
                  :name="getSupplementIcon(supp)"
                  class="w-3.5 h-3.5 text-purple-600 dark:text-purple-400"
                />
              </div>
            </UTooltip>
          </div>
        </div>
      </div>

      <!-- Hydration Card (Intra-Workout Only) -->

      <div v-if="type === 'INTRA_WORKOUT' && (targetFluid || targetSodium)" class="space-y-3">
        <!-- Fueling Script -->

        <div
          v-if="targetCarbs > 0"
          class="bg-amber-50 dark:bg-amber-950/20 rounded-xl p-4 border border-amber-100 dark:border-amber-900/50"
        >
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <UIcon
                name="i-heroicons-document-text"
                class="w-4 h-4 text-amber-600 dark:text-amber-400"
              />

              <span
                class="text-[10px] font-black uppercase text-amber-600 dark:text-amber-400 tracking-widest"
                >Intra-Workout Script</span
              >
            </div>

            <UBadge
              v-if="strategyLabel"
              variant="soft"
              color="warning"
              size="xs"
              class="font-black text-[8px] uppercase"
              :class="{ 'animate-pulse': fuelState === 3 }"
            >
              {{ strategyLabel }}
            </UBadge>
          </div>

          <p class="text-xs font-bold text-amber-800 dark:text-amber-200">
            Target:
            {{
              Math.round(
                targetCarbs / (Math.abs(endTime.getTime() - startTime.getTime()) / 3600000)
              )
            }}g carbs per hour.

            <span class="font-normal opacity-80">({{ getGelCountLabel(targetCarbs) }})</span>
          </p>

          <!-- Fueling Checklist -->
          <div
            v-if="intraScriptItems.length > 0"
            class="mt-4 space-y-3 border-t border-amber-200/50 dark:border-amber-800/30 pt-4"
          >
            <div
              v-for="item in intraScriptItems"
              :key="item.time"
              class="flex items-center gap-3 p-2 rounded-lg bg-white/50 dark:bg-black/20 border border-amber-200/30 dark:border-amber-800/30 shadow-sm"
            >
              <UCheckbox
                :label="item.label"
                color="primary"
                :ui="{
                  label:
                    'text-[11px] font-black text-amber-900 dark:text-amber-100 uppercase tracking-tight',
                  container: 'flex items-center gap-2'
                }"
              />
              <div
                class="ml-auto text-[10px] font-black px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-400"
              >
                {{ item.time }}
              </div>
            </div>
          </div>
        </div>

        <div
          class="bg-blue-50/50 dark:bg-blue-900/10 rounded-xl p-4 border border-blue-100/50 dark:border-blue-900/30"
        >
          <div class="flex items-center gap-2 mb-3">
            <UIcon name="i-heroicons-beaker" class="w-4 h-4 text-blue-500" />

            <span class="text-[10px] font-black uppercase text-blue-600 tracking-widest"
              >Hydration & Electrolytes</span
            >
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="flex items-center gap-3">
              <div
                class="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center"
              >
                <UIcon name="i-tabler-droplet" class="w-5 h-5 text-blue-500" />
              </div>

              <div>
                <div class="text-[10px] font-bold text-gray-400 uppercase">Fluid Target</div>

                <div class="text-sm font-black text-gray-900 dark:text-white">
                  {{ (targetFluid || 0) / 1000 }}L
                </div>
              </div>
            </div>

            <div class="flex items-center gap-3">
              <div
                class="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center"
              >
                <UIcon name="i-tabler-grain" class="w-5 h-5 text-blue-500" />
              </div>

              <div>
                <div class="text-[10px] font-bold text-gray-400 uppercase">Sodium Target</div>

                <div class="text-sm font-black text-gray-900 dark:text-white">
                  {{ targetSodium }}mg
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- AI Recommendations Tool (If empty and not locked) -->
      <div
        v-if="items.length === 0 && !isLocked && type !== 'DAILY_BASE'"
        class="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-dashed border-gray-200 dark:border-gray-700"
      >
        <div class="flex items-center gap-2 mb-2">
          <UIcon name="i-heroicons-sparkles" class="w-4 h-4 text-primary-500" />
          <span class="text-[10px] font-bold uppercase text-gray-500 tracking-wider"
            >Coach Suggests</span
          >
        </div>
        <p class="text-xs text-gray-600 dark:text-gray-400 italic leading-relaxed">
          {{ recommendationText }}
        </p>
      </div>

      <!-- Logged Items -->
      <div v-if="items.length > 0" class="space-y-2">
        <div
          v-for="(item, idx) in items"
          :key="item.id || `item-${idx}`"
          class="group flex items-center justify-between p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm"
        >
          <div class="flex items-center gap-3">
            <div
              class="w-8 h-8 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-center justify-center"
            >
              <UIcon
                :name="item.source === 'yazio' ? 'i-heroicons-link' : 'i-heroicons-pencil'"
                class="w-4 h-4 text-gray-400"
              />
            </div>
            <div>
              <div class="text-sm font-bold text-gray-900 dark:text-white">
                {{ item.name || item.product_name }}
              </div>
              <div
                class="text-[10px] text-gray-500 font-medium uppercase flex items-center gap-1.5"
              >
                <span v-if="getItemTime(item)" class="text-primary-500 font-bold">{{
                  getItemTime(item)
                }}</span>
                <span v-if="getItemTime(item)">•</span>
                <span>{{ item.amount }}{{ item.unit || 'g' }} • {{ item.calories }} kcal</span>
              </div>
            </div>
          </div>
          <div class="flex gap-1.5">
            <div class="flex flex-col items-end">
              <span class="text-[10px] font-black text-yellow-600 dark:text-yellow-400"
                >{{ item.carbs }}g C</span
              >
              <span class="text-[10px] font-black text-blue-600 dark:text-blue-400"
                >{{ item.protein }}g P</span
              >
            </div>
            <UButton
              v-if="!isLocked"
              icon="i-heroicons-pencil-square"
              variant="ghost"
              color="neutral"
              size="xs"
              class="opacity-0 group-hover:opacity-100 transition-opacity"
              @click="$emit('edit', item)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  const props = defineProps<{
    type: string
    title: string
    startTime: Date
    endTime: Date
    targetCarbs: number
    targetProtein: number
    targetFat: number
    targetFluid?: number
    targetSodium?: number
    items: any[]
    supplements?: string[]
    meals?: string[]
    isLocked?: boolean
    fuelState?: number
  }>()

  defineEmits(['add', 'addAi', 'edit'])

  const strategyLabel = computed(() => {
    if (props.type !== 'INTRA_WORKOUT') return null
    if (props.fuelState === 3) return 'Gut Training: Active'
    if (props.fuelState === 2) return 'Steady Fueling'
    if (props.fuelState === 1) return 'Low Intensity'
    // Fallback based on carbs if prop not passed
    if (props.targetCarbs >= 80) return 'Gut Training: Active'
    return null
  })

  const intraScriptItems = computed(() => {
    if (props.type !== 'INTRA_WORKOUT' || props.targetCarbs <= 0) return []

    const items = []
    const totalCarbs = props.targetCarbs
    const durationMs = Math.abs(props.endTime.getTime() - props.startTime.getTime())
    const durationHours = durationMs / 3600000

    // Heuristic: If we have a target >= 80g (Gut Training), we use the requested script pattern
    if (totalCarbs >= 80 && durationHours >= 1.5) {
      items.push({ time: '0:45', label: '1 Gel (30g Carbs)' })
      items.push({ time: '1:30', label: '500ml Mix (60g Carbs)' })
    } else if (totalCarbs >= 60 && durationHours >= 1) {
      items.push({ time: '0:30', label: '1 Gel (30g Carbs)' })
      items.push({ time: '1:00', label: '1 Gel (30g Carbs)' })
    } else if (totalCarbs >= 30) {
      items.push({ time: '0:45', label: '1 Gel (30g Carbs)' })
    }

    return items
  })

  const formatTime = (date: Date) => {
    if (!date || isNaN(date.getTime())) return ''
    const { formatDate } = useFormat()
    return formatDate(date, 'HH:mm')
  }

  const windowIcon = computed(() => {
    switch (props.type) {
      case 'PRE_WORKOUT':
        return 'i-heroicons-sun'
      case 'INTRA_WORKOUT':
        return 'i-heroicons-bolt'
      case 'POST_WORKOUT':
        return 'i-heroicons-sparkles'
      case 'TRANSITION':
        return 'i-heroicons-arrows-right-left'
      default:
        return 'i-heroicons-cake'
    }
  })

  const statusBorderClass = computed(() => {
    if (compliance.value === 'HIT') return 'border-green-500 bg-green-50 dark:bg-green-950'
    if (props.items.length > 0) return 'border-orange-400 bg-orange-50 dark:bg-orange-950'
    return 'border-gray-200 dark:border-gray-700'
  })

  const statusTextClass = computed(() => {
    if (compliance.value === 'HIT') return 'text-green-600 dark:text-green-400'
    if (props.items.length > 0) return 'text-orange-500 dark:text-orange-400'
    return 'text-gray-400'
  })

  const compliance = computed(() => {
    const actualCarbs = props.items.reduce((sum, item) => sum + (item.carbs || 0), 0)
    if (props.targetCarbs === 0) return 'NONE'
    if (actualCarbs >= props.targetCarbs * 0.8) return 'HIT'
    if (actualCarbs > 0) return 'PARTIAL'
    return 'PENDING'
  })

  const recommendationText = computed(() => {
    if (props.targetCarbs > 80)
      return `Focus on high-glycemic carbs. Recommendation: 1 large bagel with jam and a banana.`

    if (props.targetCarbs > 40) return `Moderate fueling needed. Try 1 bowl of oatmeal with honey.`

    return `Light fueling. A piece of fruit or 1 energy gel will suffice.`
  })

  function getGelCountLabel(carbs: number) {
    const count = Math.round(carbs / 30)

    if (count <= 0) return 'Water/Electrolytes only'

    if (count === 1) return 'Take ~1 gel'

    return `Take ~${count} gels`
  }

  function getItemTime(item: any) {
    const { getUserDateFromLocal } = useFormat()
    const timeVal = item.logged_at || item.date || item._heuristic_time
    if (!timeVal) return null

    let date: Date
    if (typeof timeVal === 'string' && /^\d{2}:\d{2}$/.test(timeVal)) {
      // Use the nutrition date from context if available, otherwise fallback to today
      const dateStr = (item.date || new Date().toISOString()).split('T')[0]
      date = getUserDateFromLocal(dateStr, `${timeVal}:00`)
    } else {
      // Handle YYYY-MM-DD HH:mm:ss by replacing space with T
      const normalized = typeof timeVal === 'string' ? timeVal.replace(' ', 'T') : timeVal
      date = new Date(normalized)
    }

    if (isNaN(date.getTime())) return null

    // If it's exactly midnight UTC, it might be just a date without time info
    // Only show if we explicitly have a time string or heuristic time
    if (
      date.getUTCHours() === 0 &&
      date.getUTCMinutes() === 0 &&
      !item.logged_at &&
      !item._heuristic_time
    ) {
      return null
    }

    return formatTime(date)
  }

  function getSupplementIcon(supp: string) {
    const s = supp.toLowerCase()
    if (s.includes('caffeine')) return 'i-tabler-pill'
    if (s.includes('nitrate')) return 'i-tabler-bottle'
    if (s.includes('bicarbonate')) return 'i-tabler-flask'
    return 'i-heroicons-plus-circle'
  }
</script>
