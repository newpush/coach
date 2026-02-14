<template>
  <div
    class="grid grid-cols-[100px_repeat(7,minmax(130px,1fr))] gap-px bg-gray-200 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-700"
  >
    <!-- Summary Column Placeholder -->
    <div
      class="bg-gray-50 dark:bg-gray-800/50 p-2 flex flex-col items-center justify-center text-[10px] text-gray-400 font-bold uppercase tracking-wider space-y-1"
    >
      <div>Metabolic</div>
      <div class="flex flex-col gap-1 items-start scale-75 origin-left">
        <div class="flex items-center gap-1">
          <span class="w-2 h-0.5 bg-blue-600 rounded-full"></span>
          <span class="text-[9px] text-gray-500">Actual</span>
        </div>
        <div class="flex items-center gap-1">
          <span class="w-2 h-0.5 border-t border-slate-400 border-dashed"></span>
          <span class="text-[9px] text-gray-500">Plan</span>
        </div>
      </div>
    </div>

    <!-- Daily Sparklines -->
    <div
      v-for="(day, index) in week"
      :key="day.date.toISOString()"
      class="relative h-16 bg-white dark:bg-gray-900 overflow-hidden"
    >
      <svg
        v-if="getDayPoints(day.date).length > 0"
        class="absolute inset-0 w-full h-full"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        <defs>
          <linearGradient :id="`wave-gradient-${weekIndex}-${index}`" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.2" />
            <stop offset="100%" stop-color="#3b82f6" stop-opacity="0" />
          </linearGradient>
        </defs>

        <path
          :d="generatePath(getDayPoints(day.date), true)"
          :fill="`url(#wave-gradient-${weekIndex}-${index})`"
        />

        <path
          v-if="showPastLine(day.date)"
          :d="generatePath(getDayPoints(day.date), false, false, true)"
          fill="none"
          stroke="#2563eb"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />

        <!-- Dashed Future Line (if applicable) -->
        <path
          v-if="showFutureLine(day.date)"
          :d="generatePath(getDayPoints(day.date), false, true, false)"
          fill="none"
          stroke="#94a3b8"
          stroke-width="1.5"
          stroke-dasharray="3,3"
          stroke-linecap="round"
        />
      </svg>

      <!-- Ending Value Label -->
      <div
        v-if="getDayPoints(day.date).length"
        class="absolute bottom-1 right-1 text-[9px] font-bold text-gray-300"
      >
        {{ getDayPoints(day.date)[getDayPoints(day.date).length - 1]?.level }}%
      </div>

      <!-- Loading State -->
      <div
        v-if="props.loading"
        class="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/50 z-10"
      >
        <UIcon name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin text-gray-400" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { format } from 'date-fns'
  import type { EnergyPoint } from '~/types/nutrition'
  export type WavePoint = EnergyPoint & {
    dateKey?: string
    dataType?: 'historical' | 'current' | 'future'
  }

  const props = defineProps<{
    week: any[]
    weekIndex: number
    points?: WavePoint[]
    loading?: boolean
  }>()

  const pointsByDay = computed(() => {
    const map: Record<string, WavePoint[]> = {}
    const points = props.points || []
    points.forEach((p) => {
      const dateKey = p.dateKey
      if (!dateKey) return

      if (!map[dateKey]) map[dateKey] = []
      map[dateKey].push(p)
    })
    return map
  })

  function normalizeDayPoints(points: WavePoint[]): WavePoint[] {
    const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp)
    if (sorted.length <= 1) return sorted

    const normalized: WavePoint[] = []
    let lastMinute = -1

    for (const p of sorted) {
      const m = pointMinutes(p.time)
      if (m == null) {
        normalized.push(p)
        continue
      }

      // Drop rollover points like ...23:45 -> 00:00 that belong to next day boundary.
      if (m < lastMinute) {
        continue
      }

      normalized.push(p)
      lastMinute = m
    }

    return normalized
  }

  function getDayPoints(date: Date): WavePoint[] {
    const key = date.toISOString().split('T')[0]
    if (!key) return []
    return normalizeDayPoints(pointsByDay.value[key] || [])
  }

  function getDayDataType(date: Date): 'historical' | 'current' | 'future' | null {
    const points = getDayPoints(date)
    if (!points.length) return null
    return points[0]?.dataType || null
  }

  function pointMinutes(time: string | undefined): number | null {
    const match = /^(\d{1,2}):(\d{2})$/.exec((time || '').trim())
    if (!match) return null
    const hh = Number(match[1])
    const mm = Number(match[2])
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null
    return hh * 60 + mm
  }

  function isFuturePointForRender(point: WavePoint, dayType: 'historical' | 'current' | 'future') {
    if (dayType === 'historical') return false
    if (dayType === 'future') return true

    // For "current" day, split by clock-time to avoid timestamp/day-key drift artifacts.
    const pm = pointMinutes(point.time)
    if (pm == null) return !!point.isFuture
    const now = new Date()
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    return pm > nowMinutes
  }

  function showPastLine(date: Date): boolean {
    const dataType = getDayDataType(date)
    if (dataType === 'future') return false
    if (dataType === 'historical') return true
    return getDayPoints(date).some((p) => !isFuturePointForRender(p, 'current'))
  }

  function showFutureLine(date: Date): boolean {
    const dataType = getDayDataType(date)
    if (dataType === 'historical') return false
    if (dataType === 'future') return true
    return getDayPoints(date).some((p) => isFuturePointForRender(p, 'current'))
  }

  // Generate SVG Path
  // Normalize X (00:00 -> 24:00) to 0-100
  // Normalize Y (0-100%) to 100-0
  function generatePath(
    points: WavePoint[],
    isArea: boolean,
    onlyFuture: boolean = false,
    onlyPast: boolean = false
  ) {
    if (!points.length) return ''

    const dayType = points[0]?.dataType || 'current'
    const filteredPoints = points
      .filter((p) => {
        const future = isFuturePointForRender(p, dayType as 'historical' | 'current' | 'future')
        if (onlyFuture) return future
        if (onlyPast) return !future
        return true
      })
      .slice()

    if (filteredPoints.length === 0) return ''

    // Sort by time just in case
    filteredPoints.sort((a, b) => a.timestamp - b.timestamp)

    const firstPoint = filteredPoints[0]
    if (!firstPoint) return ''

    const msInDay = 24 * 60 * 60 * 1000

    const coords = filteredPoints.map((p) => {
      const timeStr = (p.time || '').trim()
      const match = /^(\d{1,2}):(\d{2})$/.exec(timeStr)

      let minutesFromMidnight: number
      if (match) {
        const hh = Number(match[1])
        const mm = Number(match[2])
        minutesFromMidnight = hh * 60 + mm
      } else {
        // Fallback to timestamp-based positioning anchored to the server-provided dateKey
        const dateKey = p.dateKey || new Date(p.timestamp).toISOString().split('T')[0] || ''
        const dayStartMs = dateKey ? Date.parse(`${dateKey}T00:00:00Z`) : NaN
        if (!Number.isNaN(dayStartMs)) {
          minutesFromMidnight = Math.round((p.timestamp - dayStartMs) / 60000)
        } else {
          minutesFromMidnight = 0
        }
      }

      const msFromMidnight = Math.max(0, Math.min(24 * 60, minutesFromMidnight)) * 60 * 1000
      // Clamp to 0-100 range (handle slight TZ offsets if any)
      const x = Math.max(0, Math.min(100, (msFromMidnight / msInDay) * 100))
      const y = 100 - p.level
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })

    let d = `M ${coords.join(' L ')}`

    if (isArea) {
      // Close the loop for area fill
      const lastX = coords[coords.length - 1]?.split(',')[0] || '100'
      const firstX = coords[0]?.split(',')[0] || '0'
      d += ` L ${lastX},100 L ${firstX},100 Z`
    }

    return d
  }
</script>
