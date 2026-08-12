<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h3 class="font-mono text-[10px] font-black text-zinc-500 uppercase tracking-widest">
        {{ title }}
      </h3>
      <div
        class="px-2 py-0.5 rounded border border-white/10 bg-white/5 font-black uppercase tracking-widest text-[8px] text-zinc-400"
      >
        {{ intervals.length }} Segments
      </div>
    </div>

    <div class="overflow-hidden rounded-2xl border border-white/5 shadow-2xl">
      <table class="min-w-full divide-y divide-white/5">
        <thead class="bg-white/[0.03] dark:bg-black">
          <tr>
            <th
              scope="col"
              class="px-6 py-4 text-left font-mono text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em]"
            >
              Metric
            </th>
            <th
              scope="col"
              class="px-6 py-4 text-left font-mono text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em]"
            >
              Start
            </th>
            <th
              scope="col"
              class="px-6 py-4 text-left font-mono text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em]"
            >
              Duration
            </th>
            <th
              scope="col"
              class="px-6 py-4 text-left font-mono text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em]"
            >
              Avg Power
            </th>
            <th
              scope="col"
              class="px-6 py-4 text-left font-mono text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em]"
            >
              Avg HR
            </th>
            <th
              scope="col"
              class="px-6 py-4 text-left font-mono text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em]"
            >
              Avg Pace
            </th>
          </tr>
        </thead>
        <tbody class="bg-white dark:bg-[#09090B] divide-y divide-white/5">
          <tr
            v-for="(interval, index) in intervals"
            :key="index"
            :class="
              interval.type === 'WORK'
                ? `bg-${props.color}-500/[0.02]`
                : interval.type === 'STEADY'
                  ? 'bg-cyan-500/[0.02]'
                  : ''
            "
            class="hover:bg-white/[0.02] transition-colors cursor-pointer"
            @mouseenter="$emit('interval-hover', interval)"
            @mouseleave="$emit('interval-leave', interval)"
          >
            <td class="px-6 py-4 whitespace-nowrap">
              <div
                class="inline-block px-2 py-0.5 rounded border font-black uppercase tracking-widest text-[8px]"
                :class="[
                  interval.type === 'WORK'
                    ? `border-${props.color}-500/30 text-${props.color}-500 bg-${props.color}-500/5`
                    : interval.type === 'STEADY'
                      ? 'border-cyan-500/30 text-cyan-700 dark:text-cyan-400 bg-cyan-500/5'
                      : interval.type === 'RECOVERY'
                        ? 'border-blue-500/30 text-blue-400 bg-blue-500/5'
                        : 'border-zinc-500/30 text-zinc-400 bg-zinc-500/5'
                ]"
              >
                {{ interval.type }}
              </div>
            </td>
            <td
              class="px-6 py-4 whitespace-nowrap font-mono text-xs font-medium text-zinc-500 tabular-nums"
            >
              {{ formatTime(interval.start_time) }}
            </td>
            <td
              class="px-6 py-4 whitespace-nowrap text-sm font-black text-gray-900 dark:text-white tabular-nums"
            >
              {{ formatDuration(interval.duration) }}
            </td>
            <td
              class="px-6 py-4 whitespace-nowrap text-sm font-black text-gray-900 dark:text-white tabular-nums"
            >
              <span v-if="interval.avg_power"
                >{{ Math.round(interval.avg_power)
                }}<span class="text-[10px] ml-1 text-zinc-500 font-bold uppercase opacity-60"
                  >W</span
                ></span
              >
              <span v-else class="text-zinc-600">-</span>
            </td>
            <td
              class="px-6 py-4 whitespace-nowrap text-sm font-black text-gray-900 dark:text-white tabular-nums"
            >
              <span v-if="interval.avg_heartrate"
                >{{ Math.round(interval.avg_heartrate) }}
                <span class="text-[10px] ml-1 text-zinc-500 font-bold uppercase opacity-60"
                  >bpm</span
                ></span
              >
              <span v-else class="text-zinc-600">-</span>
            </td>
            <td
              class="px-6 py-4 whitespace-nowrap text-sm font-black text-gray-900 dark:text-white tabular-nums"
            >
              <span v-if="interval.avg_pace">{{ formatPace(interval.avg_pace) }}</span>
              <span v-else class="text-zinc-600">-</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { formatPace as formatPaceShared } from '~/utils/metrics'

  const props = withDefaults(
    defineProps<{
      intervals: any[]
      title: string
      color?: string
    }>(),
    {
      color: 'primary'
    }
  )

  defineEmits(['interval-hover', 'interval-leave'])

  const userStore = useUserStore()
  const distanceUnits = computed(() => userStore.profile?.distanceUnits || 'Kilometers')

  function formatDuration(seconds: number) {
    const mins = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  function formatTime(seconds: number) {
    const mins = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  function formatPace(mps: number) {
    if (!mps) return '-'
    return formatPaceShared(1000 / mps, distanceUnits.value)
  }
</script>
