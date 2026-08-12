<template>
  <UDashboardPanel id="workout-map-detail">
    <template #header>
      <UDashboardNavbar :title="workout ? `Map Analysis: ${workout.title}` : 'Map Analysis'">
        <template #leading>
          <UButton
            icon="i-heroicons-arrow-left"
            color="neutral"
            variant="ghost"
            aria-label="Back to Workout"
            @click="
              () => {
                void goBack()
              }
            "
          >
            <span class="hidden sm:inline">Back to Workout</span>
          </UButton>
        </template>
        <template #right>
          <div v-if="workout" class="flex items-center gap-4">
            <UButton
              icon="i-heroicons-document-arrow-down"
              color="neutral"
              variant="outline"
              size="xs"
              :loading="isExporting"
              @click="
                () => {
                  void downloadGPX()
                }
              "
            >
              Download GPX
            </UButton>
            <div class="hidden sm:flex flex-col items-end">
              <span class="text-[10px] font-black uppercase text-gray-500">{{
                formatDateWeekday(workout.date)
              }}</span>
              <span class="text-xs font-bold">{{ formatDatePrimary(workout.date) }}</span>
            </div>
            <UiDataAttribution :provider="workout.source" :device-name="workout.deviceName" />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="loading" class="flex items-center justify-center h-full">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary-500" />
      </div>

      <div v-else-if="error" class="p-8">
        <UAlert
          icon="i-heroicons-exclamation-triangle"
          color="error"
          variant="soft"
          :title="error"
        />
      </div>

      <div
        v-else-if="workout"
        class="flex h-full min-h-0 flex-col gap-3 overflow-y-auto overscroll-y-contain pb-3 sm:gap-4 sm:p-4"
      >
        <div
          class="hidden px-3 sm:flex sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 sm:px-0"
        >
          <div class="flex min-w-0 items-center gap-2">
            <span class="shrink-0 text-[10px] font-black uppercase tracking-widest text-gray-500">
              Layout
            </span>
            <div class="min-w-0 flex-1 overflow-x-auto pb-1">
              <div
                class="inline-flex min-w-max items-center rounded-xl border border-gray-200/80 bg-gray-100/80 p-1 shadow-sm dark:border-gray-800 dark:bg-gray-950/80"
              >
                <UButton
                  size="xs"
                  color="neutral"
                  :variant="layoutMode === 'default' ? 'soft' : 'ghost'"
                  icon="i-heroicons-rectangle-group"
                  class="whitespace-nowrap"
                  @click="
                    () => {
                      layoutMode = 'default'
                    }
                  "
                >
                  Default
                </UButton>
                <UButton
                  size="xs"
                  color="neutral"
                  :variant="layoutMode === 'chart-focus' ? 'soft' : 'ghost'"
                  icon="i-heroicons-chart-bar-square"
                  class="whitespace-nowrap"
                  @click="
                    () => {
                      layoutMode = 'chart-focus'
                    }
                  "
                >
                  Charts Wide
                </UButton>
              </div>
            </div>
          </div>
          <p
            class="max-w-full text-[10px] font-bold uppercase tracking-widest text-gray-400 sm:text-right"
          >
            {{
              layoutMode === 'chart-focus'
                ? 'Charts left, map stacked under splits'
                : 'Map-first layout'
            }}
          </p>
        </div>

        <div :class="contentGridClass">
          <div :class="mapCardClass">
            <UiWorkoutMap
              ref="workoutMap"
              :coordinates="workout.streams?.latlng || summaryPolylineCoordinates"
              :streams="workout.streams"
              :loading="loading"
              :workout-id="workout.id"
              :highlight-index="hoverIndex"
              :highlight-range="activeHighlightRange"
              :highlight-ranges="zoneHoverRangesForDisplay"
              :interactive="true"
              class="!h-full !rounded-none !border-0"
            />
          </div>

          <div :class="splitsCardClass">
            <div
              class="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50"
            >
              <div class="px-3 pt-3 flex items-center justify-between">
                <h3 class="text-[10px] font-black uppercase tracking-widest text-gray-500">
                  Segment Analysis
                </h3>
              </div>
              <div class="overflow-x-auto px-2 pb-1">
                <UTabs
                  v-model="segmentTab"
                  :items="[
                    { label: 'Laps', value: 'laps', icon: 'i-heroicons-flag' },
                    { label: 'Intervals', value: 'intervals', icon: 'i-heroicons-bolt' },
                    { label: 'Peaks', value: 'peaks', icon: 'i-heroicons-chart-bar-square' },
                    { label: 'Climbs', value: 'climbs', icon: 'i-heroicons-arrow-trending-up' },
                    { label: 'Zones', value: 'zones', icon: 'i-heroicons-heart' }
                  ]"
                  variant="link"
                  class="min-w-max"
                />
              </div>
            </div>

            <div class="flex-1 overflow-y-auto">
              <!-- LAPS TABLE -->
              <table
                v-if="segmentTab === 'laps'"
                class="min-w-full divide-y divide-gray-100 dark:divide-gray-800"
              >
                <thead class="bg-gray-50/30 dark:bg-gray-950/30 sticky top-0 z-10 backdrop-blur-sm">
                  <tr>
                    <th class="px-4 py-2 text-left text-[9px] font-black text-gray-400 uppercase">
                      Lap
                    </th>
                    <th class="px-4 py-2 text-left text-[9px] font-black text-gray-400 uppercase">
                      Pace
                    </th>
                    <th class="px-4 py-2 text-left text-[9px] font-black text-gray-400 uppercase">
                      Dist
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                  <tr
                    v-for="split in lapSplits"
                    :key="split.lap"
                    class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                    @mouseenter="onSplitHover(split)"
                    @mouseleave="onSplitLeave"
                  >
                    <td class="px-4 py-2.5 text-xs font-black text-gray-900 dark:text-white">
                      {{ split.lap }}
                    </td>
                    <td
                      class="px-4 py-2.5 text-xs font-medium text-gray-600 dark:text-gray-400 tabular-nums"
                    >
                      {{ split.pace }}
                    </td>
                    <td
                      class="px-4 py-2.5 text-xs font-medium text-gray-600 dark:text-gray-400 tabular-nums"
                    >
                      {{ formatDistance(split.distance) }}
                    </td>
                  </tr>
                </tbody>
              </table>

              <!-- INTERVALS TABLE -->
              <table
                v-else-if="segmentTab === 'intervals'"
                class="min-w-full divide-y divide-gray-100 dark:divide-gray-800"
              >
                <thead class="bg-gray-50/30 dark:bg-gray-950/30 sticky top-0 z-10 backdrop-blur-sm">
                  <tr>
                    <th class="px-4 py-2 text-left text-[9px] font-black text-gray-400 uppercase">
                      Type
                    </th>
                    <th class="px-4 py-2 text-left text-[9px] font-black text-gray-400 uppercase">
                      Avg
                    </th>
                    <th class="px-4 py-2 text-left text-[9px] font-black text-gray-400 uppercase">
                      Time
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                  <tr
                    v-for="(interval, idx) in detectedIntervals"
                    :key="idx"
                    class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                    @mouseenter="onSplitHover(interval)"
                    @mouseleave="onSplitLeave"
                  >
                    <td class="px-4 py-2.5 text-xs font-black">
                      <span
                        :class="
                          interval.type === 'WORK'
                            ? 'text-primary-600'
                            : interval.type === 'STEADY'
                              ? 'text-cyan-700 dark:text-cyan-400'
                              : 'text-gray-400'
                        "
                      >
                        {{ interval.type }}
                      </span>
                    </td>
                    <td
                      class="px-4 py-2.5 text-xs font-medium text-gray-600 dark:text-gray-400 tabular-nums"
                    >
                      {{
                        interval.avg_power
                          ? Math.round(interval.avg_power) + 'W'
                          : interval.avg_pace
                            ? formatPace(interval.avg_pace)
                            : '-'
                      }}
                    </td>
                    <td
                      class="px-4 py-2.5 text-xs font-medium text-gray-600 dark:text-gray-400 tabular-nums"
                    >
                      {{ formatTime(interval.duration) }}
                    </td>
                  </tr>
                  <tr v-if="detectedIntervals.length === 0">
                    <td
                      colspan="3"
                      class="px-4 py-8 text-center text-[10px] text-gray-400 font-bold uppercase tracking-widest"
                    >
                      No intervals detected
                    </td>
                  </tr>
                </tbody>
              </table>

              <!-- PEAKS TABLE -->
              <table
                v-else-if="segmentTab === 'peaks'"
                class="min-w-full divide-y divide-gray-100 dark:divide-gray-800"
              >
                <thead class="bg-gray-50/30 dark:bg-gray-950/30 sticky top-0 z-10 backdrop-blur-sm">
                  <tr>
                    <th class="px-4 py-2 text-left text-[9px] font-black text-gray-400 uppercase">
                      Window
                    </th>
                    <th class="px-4 py-2 text-left text-[9px] font-black text-gray-400 uppercase">
                      Power
                    </th>
                    <th class="px-4 py-2 text-left text-[9px] font-black text-gray-400 uppercase">
                      Time
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                  <tr
                    v-for="peak in peakPowerWindows"
                    :key="peak.duration"
                    :class="[
                      'hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer',
                      selectedSegmentSource?.type === 'peak' &&
                      selectedSegmentSource.duration === peak.duration
                        ? 'bg-primary-50/80 dark:bg-primary-950/30'
                        : ''
                    ]"
                    @click="
                      () => {
                        void selectPeakWindow(peak)
                      }
                    "
                  >
                    <td class="px-4 py-2.5 text-xs font-black text-gray-900 dark:text-white">
                      {{ peak.durationLabel }}
                    </td>
                    <td
                      class="px-4 py-2.5 text-xs font-medium text-gray-600 dark:text-gray-400 tabular-nums"
                    >
                      {{ peak.power }}W
                    </td>
                    <td
                      class="px-4 py-2.5 text-xs font-medium text-gray-600 dark:text-gray-400 tabular-nums"
                    >
                      {{ formatTime(peak.startTime) }}-{{ formatTime(peak.endTime) }}
                    </td>
                  </tr>
                  <tr v-if="!peakPowerLoading && peakPowerWindows.length === 0">
                    <td
                      colspan="3"
                      class="px-4 py-8 text-center text-[10px] text-gray-400 font-bold uppercase tracking-widest"
                    >
                      No peak power data available
                    </td>
                  </tr>
                  <tr v-if="peakPowerLoading">
                    <td
                      colspan="3"
                      class="px-4 py-8 text-center text-[10px] text-gray-400 font-bold uppercase tracking-widest"
                    >
                      Loading power peaks
                    </td>
                  </tr>
                </tbody>
              </table>

              <!-- CLIMBS TABLE -->
              <table
                v-else-if="segmentTab === 'climbs'"
                class="min-w-full divide-y divide-gray-100 dark:divide-gray-800"
              >
                <thead class="bg-gray-50/30 dark:bg-gray-950/30 sticky top-0 z-10 backdrop-blur-sm">
                  <tr>
                    <th class="px-4 py-2 text-left text-[9px] font-black text-gray-400 uppercase">
                      Gain
                    </th>
                    <th class="px-4 py-2 text-left text-[9px] font-black text-gray-400 uppercase">
                      Grade
                    </th>
                    <th class="px-4 py-2 text-left text-[9px] font-black text-gray-400 uppercase">
                      Dist
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                  <tr
                    v-for="(climb, idx) in detectedClimbs"
                    :key="idx"
                    class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                    @mouseenter="onSplitHover(climb)"
                    @mouseleave="onSplitLeave"
                  >
                    <td class="px-4 py-2.5 text-xs font-black text-gray-900 dark:text-white">
                      +{{ formatElevation(climb.ascent) }}
                    </td>
                    <td
                      class="px-4 py-2.5 text-xs font-medium text-gray-600 dark:text-gray-400 tabular-nums"
                    >
                      {{ climb.avg_grade }}%
                    </td>
                    <td
                      class="px-4 py-2.5 text-xs font-medium text-gray-600 dark:text-gray-400 tabular-nums"
                    >
                      {{ formatDistance(climb.distance) }}
                    </td>
                  </tr>
                  <tr v-if="detectedClimbs.length === 0">
                    <td
                      colspan="3"
                      class="px-4 py-8 text-center text-[10px] text-gray-400 font-bold uppercase tracking-widest"
                    >
                      No significant climbs detected
                    </td>
                  </tr>
                </tbody>
              </table>

              <!-- ZONES TABLE -->
              <table
                v-else-if="segmentTab === 'zones'"
                class="min-w-full divide-y divide-gray-100 dark:divide-gray-800"
              >
                <thead class="bg-gray-50/30 dark:bg-gray-950/30 sticky top-0 z-10 backdrop-blur-sm">
                  <tr>
                    <th class="px-4 py-2 text-left text-[9px] font-black text-gray-400 uppercase">
                      Zone
                    </th>
                    <th class="px-4 py-2 text-left text-[9px] font-black text-gray-400 uppercase">
                      BPM
                    </th>
                    <th class="px-4 py-2 text-left text-[9px] font-black text-gray-400 uppercase">
                      Time
                    </th>
                    <th class="px-4 py-2 text-left text-[9px] font-black text-gray-400 uppercase">
                      %
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                  <tr v-for="zone in hrZones" :key="zone.index" class="transition-colors">
                    <td class="px-4 py-2.5 text-xs font-black text-gray-900 dark:text-white">
                      {{ zone.name }}
                    </td>
                    <td
                      class="px-4 py-2.5 text-xs font-medium text-gray-600 dark:text-gray-400 tabular-nums"
                    >
                      {{ formatZoneRange(zone) }}
                    </td>
                    <td
                      class="px-4 py-2.5 text-xs font-medium text-gray-600 dark:text-gray-400 tabular-nums"
                    >
                      {{ formatTime(zone.time) }}
                    </td>
                    <td
                      class="px-4 py-2.5 text-xs font-medium text-gray-600 dark:text-gray-400 tabular-nums"
                    >
                      {{
                        Math.round(
                          (zone.time /
                            (hrZones.reduce((a, b) => a + b.time, 0) || workout.duration || 1)) *
                            100
                        )
                      }}%
                    </td>
                  </tr>
                  <tr v-if="hrZones.length === 0">
                    <td
                      colspan="4"
                      class="px-4 py-8 text-center text-[10px] text-gray-400 font-bold uppercase tracking-widest"
                    >
                      No zone data available
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div :class="chartsCardClass">
            <div
              class="flex flex-col gap-3 border-b border-gray-100 bg-gray-50/50 p-3 dark:border-gray-800 dark:bg-gray-800/50 lg:flex-row lg:items-center lg:justify-between"
            >
              <div class="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                <h3 class="text-[10px] font-black uppercase tracking-widest text-gray-500">
                  Stream Analysis
                </h3>
                <div class="flex min-w-0 flex-wrap items-center gap-2">
                  <UButton
                    v-if="zoomRange"
                    icon="i-heroicons-magnifying-glass-minus"
                    size="xs"
                    color="neutral"
                    variant="outline"
                    @click="
                      () => {
                        void resetZoom()
                      }
                    "
                  >
                    Reset Zoom
                  </UButton>
                  <UButton
                    v-if="selectedSegmentRange"
                    icon="i-heroicons-x-mark"
                    size="xs"
                    color="neutral"
                    variant="outline"
                    @click="
                      () => {
                        void clearSelectedSegment()
                      }
                    "
                  >
                    Clear Selection
                  </UButton>
                  <client-only>
                    <USelectMenu
                      v-model="selectedStreamValues"
                      multiple
                      placeholder="Add streams..."
                      :items="availableStreamOptions"
                      value-key="value"
                      label-key="label"
                      size="xs"
                      class="min-w-0 flex-1 sm:w-48 sm:flex-none"
                    >
                      <template #leading>
                        <UIcon name="i-heroicons-plus-circle" class="w-3.5 h-3.5" />
                      </template>
                    </USelectMenu>
                  </client-only>
                </div>
              </div>
              <div
                v-if="hoverIndex !== null && workout?.streams?.time"
                class="max-w-full text-[10px] font-black uppercase text-primary-500"
              >
                T: {{ formatTime(workout.streams.time[hoverIndex]) }} |
                <span v-if="workout.streams.heartrate"
                  >{{ workout.streams.heartrate[hoverIndex] }} bpm</span
                >
                <span v-if="workout.streams.altitude">
                  | {{ Math.round(workout.streams.altitude[hoverIndex]) }}m</span
                >
              </div>
            </div>

            <div
              v-if="selectedSegmentRange"
              class="border-b border-gray-100 bg-white px-3 py-3 dark:border-gray-800 dark:bg-gray-900"
            >
              <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div class="min-w-0">
                  <p class="text-[10px] font-black uppercase tracking-widest text-gray-400">
                    Selected Segment
                  </p>
                  <p class="truncate text-sm font-black text-gray-900 dark:text-white">
                    {{ selectedSegmentLabel }}
                  </p>
                </div>
                <div
                  class="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:flex lg:flex-wrap lg:justify-end"
                >
                  <div
                    v-for="metric in selectedSegmentMetricItems"
                    :key="metric.label"
                    class="min-w-0 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-950"
                  >
                    <p class="text-[9px] font-black uppercase tracking-widest text-gray-400">
                      {{ metric.label }}
                    </p>
                    <p class="text-sm font-black tabular-nums text-gray-900 dark:text-white">
                      {{ metric.value }}
                    </p>
                  </div>
                </div>
              </div>
              <p
                v-if="selectedSegmentLoading"
                class="mt-2 text-[10px] font-bold uppercase tracking-widest text-primary-500"
              >
                Calculating segment metrics...
              </p>
              <p
                v-else-if="selectedSegmentError"
                class="mt-2 text-[10px] font-bold uppercase tracking-widest text-red-500"
              >
                {{ selectedSegmentError }}
              </p>
            </div>

            <div
              :class="[
                'flex-1 p-4',
                layoutMode === 'chart-focus'
                  ? 'overflow-y-auto space-y-0'
                  : 'overflow-hidden flex flex-col'
              ]"
            >
              <div
                v-if="selectedStreamObjects.length === 0"
                class="flex flex-col items-center justify-center h-full text-gray-400 space-y-2 py-12"
              >
                <UIcon name="i-heroicons-chart-bar" class="w-12 h-12 opacity-20" />
                <p class="text-xs font-bold uppercase tracking-widest">
                  Select streams to analyze data points
                </p>
              </div>

              <div
                v-else-if="layoutMode === 'default' && !zoomedStreams?.time?.length"
                class="flex flex-col items-center justify-center min-h-[280px] flex-1 text-gray-400 space-y-2 py-12"
              >
                <UIcon name="i-heroicons-chart-bar" class="w-12 h-12 opacity-20" />
                <p class="text-xs font-bold uppercase tracking-widest">
                  Stream timing data unavailable for this workout
                </p>
              </div>

              <!-- Default Layout: Single Unified Chart -->
              <div
                v-else-if="layoutMode === 'default' && zoomedStreams?.time?.length"
                class="min-h-[280px] flex-1 sm:min-h-0"
              >
                <client-only>
                  <StreamChart
                    :datasets="
                      selectedStreams.map((key) => ({
                        label: getStreamMetadata(key).label,
                        data: zoomedStreams[key],
                        color: getStreamMetadata(key).color,
                        unit: getStreamMetadata(key).unit
                      }))
                    "
                    :labels="zoomedStreams.time"
                    :height-class="'h-full'"
                    :highlight-index="zoomedHoverIndex"
                    :highlight-range="zoomedActiveHighlightRange"
                    :highlight-ranges="zoomedZoneHoverRangesForDisplay"
                    drag-mode="select"
                    @chart-hover="onChartHover"
                    @chart-leave="onChartLeave"
                    @chart-zoom="onChartZoom"
                    @chart-select="onChartSelect"
                  />
                </client-only>
              </div>

              <!-- Focus Layout: Stacked Draggable Charts -->
              <draggable
                v-else
                v-model="selectedStreamObjects"
                item-key="value"
                handle=".drag-handle"
                ghost-class="opacity-50"
                class="space-y-0"
              >
                <template #item="{ element: streamObject, index: idx }">
                  <div
                    class="relative group border-b border-gray-100 dark:border-gray-800 last:border-0 pb-1 pt-1 first:pt-0"
                  >
                    <div
                      class="absolute top-1 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                    >
                      <div
                        class="drag-handle cursor-grab active:cursor-grabbing p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      >
                        <UIcon name="i-heroicons-bars-2" class="w-4 h-4" />
                      </div>
                      <UButton
                        icon="i-heroicons-x-mark"
                        size="xs"
                        color="neutral"
                        variant="ghost"
                        @click="
                          () => {
                            selectedStreamObjects = selectedStreamObjects.filter(
                              (s) => s.value !== streamObject.value
                            )
                          }
                        "
                      />
                    </div>
                    <div class="mb-0 flex items-center gap-2 px-2">
                      <div
                        class="w-2 h-2 rounded-full"
                        :style="{ backgroundColor: getStreamMetadata(streamObject.value).color }"
                      />
                      <span class="text-[9px] font-black uppercase tracking-widest text-gray-400">
                        {{ getStreamMetadata(streamObject.value).label }}
                      </span>
                    </div>
                    <div v-if="zoomedStreams?.time?.length" class="h-40">
                      <client-only>
                        <StreamChart
                          :label="getStreamMetadata(streamObject.value).label"
                          :data-points="zoomedStreams[streamObject.value]"
                          :labels="zoomedStreams.time"
                          :color="getStreamMetadata(streamObject.value).color"
                          :y-axis-label="getStreamMetadata(streamObject.value).unit"
                          :height-class="'h-40'"
                          :highlight-index="zoomedHoverIndex"
                          :highlight-range="zoomedActiveHighlightRange"
                          :highlight-ranges="zoomedZoneHoverRangesForDisplay"
                          :show-x-axis="idx === selectedStreamObjects.length - 1"
                          :fixed-y-axis-width="80"
                          drag-mode="select"
                          @chart-hover="onChartHover"
                          @chart-leave="onChartLeave"
                          @chart-zoom="onChartZoom"
                          @chart-select="onChartSelect"
                        />
                      </client-only>
                    </div>
                  </div>
                </template>
              </draggable>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
  import { decode } from '@googlemaps/polyline-codec'
  import { getWorkoutSourceLabel } from '~/utils/workout-source'
  import {
    formatDistance as formatDist,
    formatElevation as formatElev,
    formatPace as formatPaceShared
  } from '~/utils/metrics'

  import { ref, computed, watch, toRaw, nextTick } from 'vue'
  import draggable from 'vuedraggable'
  import StreamChart from '~/components/charts/streams/BaseStreamChart.vue'

  const route = useRoute()
  const router = useRouter()
  const userStore = useUserStore()
  const workoutId = route.params.id as string

  const loading = ref(true)
  const error = ref<string | null>(null)
  const workout = ref<any>(null)
  const lapSplits = ref<any[]>([])
  const detectedIntervals = ref<any[]>([])
  const detectedClimbs = ref<any[]>([])
  const peakPowerWindows = ref<any[]>([])
  const hrZones = ref<any[]>([])
  const userHrZones = ref<any[]>([])
  const segmentTab = ref('laps')
  const hoverIndex = ref<number | null>(null)
  const hoverSplit = ref<any | null>(null)
  const hoverZone = ref<any | null>(null)
  const isZoneHoverTemporarilyDisabled = true
  const zoomRange = ref<[number, number] | null>(null)
  const isExporting = ref(false)
  const peakPowerLoading = ref(false)
  const selectedSegmentRange = ref<[number, number] | null>(null)
  const selectedSegmentSource = ref<
    { type: 'peak'; duration: number; label: string } | { type: 'custom'; label: string } | null
  >(null)
  const selectedSegmentSummary = ref<any | null>(null)
  const selectedSegmentLoading = ref(false)
  const selectedSegmentError = ref<string | null>(null)
  const selectedStreamObjects = ref<{ label: string; value: string }[]>([])
  const selectedStreamValues = ref<string[]>([])
  const selectedStreams = computed(() => selectedStreamObjects.value.map((s) => s.value))
  const summaryPolylineCoordinates = computed<[number, number][]>(() => {
    const polyline = workout.value?.summaryPolyline
    if (!polyline) return []

    try {
      return decode(polyline) as [number, number][]
    } catch (error) {
      console.error('Failed to decode workout summary polyline:', error)
      return []
    }
  })

  function calculateDisplayedHrZoneTimes(streams: Record<string, any>, zones: any[]) {
    if (!Array.isArray(streams?.heartrate) || !Array.isArray(streams?.time) || !zones.length)
      return []

    const hrZoneTimes = new Array(zones.length).fill(0)
    const heartrate = streams.heartrate as number[]
    const time = streams.time as number[]

    for (let i = 0; i < heartrate.length; i++) {
      const hr = heartrate[i]
      if (!isValidHeartRateSample(hr)) continue

      const zoneIndex = getZoneIndex(hr, zones)
      if (zoneIndex < 0) continue

      const currentTime = typeof time[i] === 'number' ? time[i] : null
      const nextTime =
        i < time.length - 1 && typeof time[i + 1] === 'number' ? time[i + 1] : currentTime
      const duration = Math.max(1, (nextTime ?? currentTime ?? 0) - (currentTime ?? 0))

      hrZoneTimes[zoneIndex] += duration
    }

    return hrZoneTimes
  }

  const zoomedStreams = computed(() => {
    if (!workout.value?.streams) return null
    if (!zoomRange.value) return workout.value.streams

    const [start, end] = zoomRange.value
    const filtered: Record<string, any> = {}

    Object.keys(workout.value.streams).forEach((key) => {
      const data = workout.value.streams[key]
      if (Array.isArray(data)) {
        filtered[key] = data.slice(start, end + 1)
      } else {
        filtered[key] = data
      }
    })

    return filtered
  })

  const activeHighlightRange = computed(() => hoverSplitRange.value || selectedSegmentRange.value)

  const selectedSegmentLabel = computed(() => {
    const summary = selectedSegmentSummary.value
    const sourceLabel = selectedSegmentSource.value?.label || 'Custom selection'
    if (!summary) return sourceLabel
    return `${sourceLabel} | ${formatTime(summary.startTime || 0)}-${formatTime(summary.endTime || 0)}`
  })

  const selectedSegmentMetricItems = computed(() => {
    const summary = selectedSegmentSummary.value
    if (!summary) {
      return [
        { label: 'Duration', value: '-' },
        { label: 'NP', value: '-' },
        { label: 'Avg Power', value: '-' },
        { label: 'Gradient', value: '-' },
        { label: 'Elev Gain', value: '-' },
        { label: 'VAM', value: '-' }
      ]
    }

    return [
      { label: 'Duration', value: formatTime(summary.durationSec || 0) },
      { label: 'NP', value: formatNullableWatts(summary.normalizedPower) },
      { label: 'Avg Power', value: formatNullableWatts(summary.averageWatts) },
      { label: 'Gradient', value: formatNullablePercent(summary.gradientPercent) },
      { label: 'Elev Gain', value: formatElevation(summary.elevationGain || 0) },
      { label: 'VAM', value: summary.vam ? `${summary.vam} m/h` : '-' }
    ]
  })

  // Save selection and order when changed
  watch(
    selectedStreamObjects,
    (newObjs) => {
      const newValues = newObjs.map((o) => o.value)

      // Sync values ref for dropdown checkmarks
      if (
        JSON.stringify(newValues.slice().sort()) !==
        JSON.stringify(selectedStreamValues.value.slice().sort())
      ) {
        selectedStreamValues.value = newValues
      }

      // Save preference including ORDER
      if (newValues.length > 0) {
        userStore.updateDashboardSettings({ mapSelectedStreams: newValues })
      }
    },
    { deep: true }
  )

  // Sync string values from dropdown back to objects (for adding new ones)
  watch(
    selectedStreamValues,
    (newValues) => {
      if (newValues.length !== selectedStreamObjects.value.length) {
        // Rebuild objects maintaining order of existing ones where possible
        const currentMap = new Map(selectedStreamObjects.value.map((o) => [o.value, o]))
        const newObjs = newValues
          .map((v) => currentMap.get(v) || availableStreamOptions.value.find((o) => o.value === v))
          .filter(Boolean) as { label: string; value: string }[]

        const currentKeys = selectedStreamObjects.value.map((o) => o.value)
        const newKeys = newObjs.map((o) => o.value)

        if (JSON.stringify(currentKeys) !== JSON.stringify(newKeys)) {
          selectedStreamObjects.value = newObjs
        }
      }
    },
    { deep: true }
  )

  const layoutMode = ref<'default' | 'chart-focus'>(
    userStore.user?.dashboardSettings?.mapLayoutMode || 'default'
  )

  // Sync layout mode from user settings when they load
  watch(
    () => userStore.user?.dashboardSettings?.mapLayoutMode,
    (newVal) => {
      if (newVal && newVal !== layoutMode.value) {
        layoutMode.value = newVal
      }
    }
  )

  const workoutMap = ref<any>(null)

  // Save layout preference when changed
  watch(layoutMode, (newMode) => {
    userStore.updateDashboardSettings({ mapLayoutMode: newMode })

    // Recenter map after layout change (DOM needs a tick to update size)
    nextTick(() => {
      const map = workoutMap.value?.mapObject?.leafletObject
      if (map) {
        map.invalidateSize()
      }

      if (workoutMap.value?.fitBounds) {
        workoutMap.value.fitBounds()
      }
    })
  })
  const contentGridClass = computed(() => {
    const base = 'grid min-h-0 grid-cols-1 gap-3 sm:gap-4 lg:flex-1'
    if (layoutMode.value === 'chart-focus') {
      return `${base} lg:grid-cols-3 lg:grid-rows-[minmax(220px,0.42fr)_minmax(320px,0.58fr)]`
    }
    return `${base} lg:grid-cols-3 lg:grid-rows-[380px_minmax(0,1fr)]`
  })

  const mapCardClass = computed(() => {
    const base =
      'relative h-[34svh] min-h-[240px] max-h-[320px] overflow-hidden rounded-none border-y border-gray-100 bg-gray-50 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:h-[320px] sm:max-h-none sm:rounded-xl sm:border'
    if (layoutMode.value === 'chart-focus') {
      return `${base} lg:col-start-3 lg:col-span-1 lg:row-start-2 lg:h-auto lg:min-h-0`
    }
    return `${base} lg:col-span-2 lg:row-start-1 lg:h-auto lg:min-h-0`
  })

  const splitsCardClass = computed(() => {
    const base =
      'flex min-h-[240px] flex-col overflow-hidden rounded-none border-y border-gray-100 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:min-h-[220px] sm:rounded-xl sm:border'
    if (layoutMode.value === 'chart-focus') {
      return `${base} lg:col-start-3 lg:col-span-1 lg:row-start-1 lg:min-h-0`
    }
    return `${base} lg:col-span-1 lg:row-start-1 lg:min-h-0`
  })

  const chartsCardClass = computed(() => {
    const base =
      'flex min-h-[320px] flex-col overflow-hidden rounded-none border-y border-gray-100 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:min-h-[380px] sm:rounded-xl sm:border'
    if (layoutMode.value === 'chart-focus') {
      return `${base} lg:col-start-1 lg:col-span-2 lg:row-span-2 lg:min-h-0`
    }
    return `${base} lg:col-span-3 lg:row-start-2 lg:min-h-0`
  })

  function getStreamMetadataMap() {
    return {
      heartrate: { label: 'Heart Rate', color: '#ef4444', unit: ' bpm' },
      altitude: { label: 'Altitude', color: '#10b981', unit: 'm' },
      watts: { label: 'Power', color: '#8b5cf6', unit: 'W' },
      velocity: { label: 'Pace', color: '#3b82f6', unit: '' }, // Pace is complex to add as suffix
      cadence: { label: 'Cadence', color: '#f59e0b', unit: ' rpm' },
      temp: { label: 'Temperature', color: '#06b6d4', unit: '°C' },
      grade: { label: 'Grade', color: '#14b8a6', unit: '%' },
      distance: { label: 'Distance', color: '#6366f1', unit: 'm' }
    } as Record<string, { label: string; color: string; unit: string }>
  }

  function getStreamMetadata(key: string) {
    return getStreamMetadataMap()[key] || { label: key, color: '#9ca3af', unit: '' }
  }

  const availableStreamOptions = computed(() => {
    if (!workout.value?.streams) return []
    const metadata = getStreamMetadataMap()
    // Convert to plain object keys to avoid proxy issues during enumeration
    const streams = toRaw(workout.value.streams)
    const availableKeys = new Set(Object.keys(streams))

    // Always include currently selected streams in options to avoid selection disappearance
    selectedStreamValues.value.forEach((key) => availableKeys.add(key))

    return Array.from(availableKeys)
      .filter((key) => {
        const data = streams[key]
        const isArray = Array.isArray(data)
        const isSelected = selectedStreamValues.value.includes(key)

        // Strictly only allow array streams that are not internal metadata
        const metadataBlacklist = [
          'time',
          'latlng',
          'hrZones',
          'powerZones',
          'hrZoneTimes',
          'powerZoneTimes',
          'pacingStrategy',
          'lapSplits',
          'surges',
          'detectedIntervals',
          'detectedClimbs',
          'icu_intervals',
          'icu_groups',
          'id',
          'workoutId',
          'createdAt',
          'updatedAt'
        ]

        return (isArray && metadata[key] && !metadataBlacklist.includes(key)) || isSelected
      })
      .map((key) => ({
        label: metadata[key]?.label || key,
        value: key
      }))
  })

  // useFetch forwards the SSR request cookies; raw $fetch inside useAsyncData does not.
  const workoutEndpoint: string = `/api/workouts/${workoutId}`
  const streamsEndpoint: string = `/api/workouts/${workoutId}/streams`
  const { data: workoutData, error: workoutError } = (await useFetch(workoutEndpoint as any, {
    key: `workout-map-${workoutId}`,
    query: { includeStreams: false },
    lazy: true
  })) as any
  const { data: streamsData, error: streamsError } = (await useFetch(streamsEndpoint as any, {
    key: `workout-streams-${workoutId}`,
    lazy: true
  })) as any

  watch(
    [workoutData, streamsData],
    ([newWorkout, newStreams]) => {
      if (newWorkout && newStreams) {
        console.log('[Map] Streams loaded:', Object.keys(newStreams))
        console.log('[Map] HR Zones Data:', newStreams.hrZones)
        console.log('[Map] HR Zone Times:', newStreams.hrZoneTimes)
        console.log('[Map] Stream lengths:', {
          time: Array.isArray(newStreams.time) ? newStreams.time.length : null,
          heartrate: Array.isArray(newStreams.heartrate) ? newStreams.heartrate.length : null,
          latlng: Array.isArray(newStreams.latlng) ? newStreams.latlng.length : null
        })
        console.log('[Map] Downsampling debug:', newStreams._debugDownsampling || null)

        if (
          Array.isArray(newStreams.time) &&
          Array.isArray(newStreams.heartrate) &&
          Array.isArray(newStreams.latlng)
        ) {
          const middleIndex = Math.floor(newStreams.time.length / 2)
          console.log('[Map] Stream alignment samples:', {
            first: {
              index: 0,
              time: newStreams.time[0],
              heartrate: newStreams.heartrate[0],
              latlng: newStreams.latlng[0]
            },
            middle: {
              index: middleIndex,
              time: newStreams.time[middleIndex],
              heartrate: newStreams.heartrate[middleIndex],
              latlng: newStreams.latlng[middleIndex]
            },
            last: {
              index: newStreams.time.length - 1,
              time: newStreams.time[newStreams.time.length - 1],
              heartrate: newStreams.heartrate[newStreams.heartrate.length - 1],
              latlng: newStreams.latlng[newStreams.latlng.length - 1]
            }
          })
        }

        workout.value = {
          ...newWorkout,
          streams: newStreams
        }

        if (newStreams.lapSplits) {
          lapSplits.value = newStreams.lapSplits
        }

        if (newStreams.detectedIntervals) {
          detectedIntervals.value = newStreams.detectedIntervals
        }

        if (newStreams.detectedClimbs) {
          detectedClimbs.value = newStreams.detectedClimbs
        }

        if (newStreams.hrZones) {
          userHrZones.value = newStreams.hrZones
        }

        // Calculate HR Zones data if heartrate stream exists
        if (newStreams.heartrate && Array.isArray(newStreams.heartrate)) {
          if (newStreams.hrZoneTimes && newStreams.hrZones) {
            const displayedHrZoneTimes = calculateDisplayedHrZoneTimes(
              newStreams,
              newStreams.hrZones
            )
            console.log('[Map] Zone time comparison:', {
              apiHrZoneTimes: newStreams.hrZoneTimes,
              displayedHrZoneTimes,
              apiTotal: newStreams.hrZoneTimes.reduce(
                (sum: number, value: number) => sum + value,
                0
              ),
              displayedTotal: displayedHrZoneTimes.reduce(
                (sum: number, value: number) => sum + value,
                0
              )
            })

            hrZones.value = displayedHrZoneTimes
              .map((time: number, idx: number) => {
                if (time === null || idx >= newStreams.hrZones.length) return null
                return {
                  name: newStreams.hrZones[idx]?.name || `Z${idx + 1}`,
                  time: time,
                  index: idx,
                  min: newStreams.hrZones[idx]?.min,
                  max: newStreams.hrZones[idx]?.max
                }
              })
              .filter(Boolean)
          }
        } // Initialize from user settings or auto-detect
        const savedSelection = userStore.user?.dashboardSettings?.mapSelectedStreams
        if (Array.isArray(savedSelection) && savedSelection.length > 0) {
          selectedStreamObjects.value = savedSelection.map((key) => ({
            label: getStreamMetadata(key).label,
            value: key
          }))
        } else if (selectedStreamObjects.value.length === 0) {
          const initial: string[] = []
          if (newStreams.heartrate) initial.push('heartrate')
          if (newStreams.altitude) initial.push('altitude')
          if (newStreams.watts) initial.push('watts')

          selectedStreamObjects.value = availableStreamOptions.value.filter((option) =>
            initial.includes(option.value)
          )
        }

        loading.value = false
        fetchPeakPowerWindows()
      }
    },
    { immediate: true }
  )

  watch([workoutError, streamsError], ([wErr, sErr]) => {
    if (wErr || sErr) {
      error.value = wErr?.message || sErr?.message || 'Failed to load data'
      loading.value = false
    }
  })

  function onChartHover(index: number) {
    if (zoomRange.value) {
      hoverIndex.value = zoomRange.value[0] + index
    } else {
      hoverIndex.value = index
    }
  }

  function onChartLeave() {
    hoverIndex.value = null
  }

  function findDisplayIndexAtOrAfter(targetTime: number) {
    const timeStream = workout.value?.streams?.time || []
    const index = timeStream.findIndex((time: number) => time >= targetTime)
    return index === -1 ? Math.max(0, timeStream.length - 1) : index
  }

  function findDisplayIndexAtOrBefore(targetTime: number) {
    const timeStream = workout.value?.streams?.time || []
    for (let index = timeStream.length - 1; index >= 0; index--) {
      if (timeStream[index] <= targetTime) return index
    }
    return 0
  }

  async function fetchPeakPowerWindows() {
    if (peakPowerLoading.value || peakPowerWindows.value.length > 0) return

    const streams = workout.value?.streams
    if (
      !Array.isArray(streams?.watts) ||
      streams.watts.length === 0 ||
      !Array.isArray(streams?.time) ||
      streams.time.length === 0
    ) {
      return
    }

    try {
      peakPowerLoading.value = true
      const data = await ($fetch as any)(`/api/workouts/${workoutId}/power-curve`)
      peakPowerWindows.value = Array.isArray(data?.powerCurve) ? data.powerCurve : []
    } catch (e) {
      console.error('Failed to load peak power windows:', e)
      peakPowerWindows.value = []
    } finally {
      peakPowerLoading.value = false
    }
  }

  async function loadSelectedSegmentSummary(startTime: number, endTime: number) {
    selectedSegmentLoading.value = true
    selectedSegmentError.value = null

    try {
      selectedSegmentSummary.value = await ($fetch as any)(
        `/api/workouts/${workoutId}/segment-summary`,
        {
          method: 'POST',
          body: { startTime, endTime }
        }
      )
    } catch (e: any) {
      console.error('Failed to calculate segment metrics:', e)
      selectedSegmentSummary.value = null
      selectedSegmentError.value = e?.data?.message || e?.message || 'Segment metrics unavailable'
    } finally {
      selectedSegmentLoading.value = false
    }
  }

  function selectTimeRange(startTime: number, endTime: number) {
    const startIndex = findDisplayIndexAtOrAfter(Math.min(startTime, endTime))
    const endIndex = findDisplayIndexAtOrBefore(Math.max(startTime, endTime))
    selectedSegmentRange.value = [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)]
    loadSelectedSegmentSummary(Math.min(startTime, endTime), Math.max(startTime, endTime))
  }

  function selectPeakWindow(peak: any) {
    selectedSegmentSource.value = {
      type: 'peak',
      duration: peak.duration,
      label: `${peak.durationLabel} peak (${peak.power}W)`
    }
    selectTimeRange(peak.startTime, peak.endTime)
  }

  function onChartSelect(range: [number, number]) {
    const [relativeStart, relativeEnd] = range
    const startIndex = zoomRange.value ? zoomRange.value[0] + relativeStart : relativeStart
    const endIndex = zoomRange.value ? zoomRange.value[0] + relativeEnd : relativeEnd
    const timeStream = workout.value?.streams?.time || []
    const startTime = timeStream[Math.min(startIndex, endIndex)]
    const endTime = timeStream[Math.max(startIndex, endIndex)]

    if (typeof startTime !== 'number' || typeof endTime !== 'number') return

    selectedSegmentSource.value = { type: 'custom', label: 'Custom selection' }
    selectedSegmentRange.value = [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)]
    loadSelectedSegmentSummary(startTime, endTime)
  }

  function clearSelectedSegment() {
    selectedSegmentRange.value = null
    selectedSegmentSource.value = null
    selectedSegmentSummary.value = null
    selectedSegmentError.value = null
  }

  function onSplitHover(split: any) {
    hoverSplit.value = split
  }

  function onSplitLeave() {
    hoverSplit.value = null
  }

  function onZoneHover(zone: any) {
    if (isZoneHoverTemporarilyDisabled) return
    hoverZone.value = zone
    console.log('[Map] Zone hover start:', {
      zone: zone.name,
      zoneIndex: zone.index,
      bpmRange: formatZoneRange(zone)
    })
  }

  function onZoneLeave() {
    hoverZone.value = null
  }

  function isValidHeartRateSample(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
  }

  function getZoneIndex(value: number, zones: any[]): number {
    if (!isValidHeartRateSample(value) || !zones || zones.length === 0) return -1
    for (let i = 0; i < zones.length; i++) {
      if (value >= zones[i].min && value <= zones[i].max) {
        return i
      }
    }
    // If value is above all zones, put it in the highest zone
    if (value > zones[zones.length - 1].max) {
      return zones.length - 1
    }
    return -1
  }

  const hoverZoneRanges = computed(() => {
    if (isZoneHoverTemporarilyDisabled) return null
    if (!hoverZone.value || !workout.value?.streams?.heartrate || userHrZones.value.length === 0)
      return null

    const hrStream = workout.value.streams.heartrate
    const targetIdx = hoverZone.value.index
    const ranges: [number, number][] = []

    let currentStart: number | null = null

    for (let i = 0; i < hrStream.length; i++) {
      const hr = hrStream[i]
      if (!isValidHeartRateSample(hr)) {
        if (currentStart !== null) {
          ranges.push([currentStart, i - 1])
          currentStart = null
        }
        continue
      }

      const zoneIdx = getZoneIndex(hr, userHrZones.value)

      if (zoneIdx === targetIdx) {
        if (currentStart === null) currentStart = i
      } else {
        if (currentStart !== null) {
          ranges.push([currentStart, i - 1])
          currentStart = null
        }
      }
    }

    if (currentStart !== null) {
      ranges.push([currentStart, hrStream.length - 1])
    }

    return ranges
  })

  watch(
    () => hoverZone.value,
    (zone) => {
      if (!zone) {
        console.log('[Map] Zone hover cleared')
      }
    }
  )

  watch(
    () => hoverZoneRanges.value,
    (ranges) => {
      if (!hoverZone.value || !ranges || !workout.value?.streams) return

      const timeStream = workout.value.streams.time || []
      const hrStream = workout.value.streams.heartrate || []
      const latLngStream = workout.value.streams.latlng || []

      console.log('[Map] Hover zone range analysis:', {
        zone: hoverZone.value.name,
        zoneIndex: hoverZone.value.index,
        bpmRange: formatZoneRange(hoverZone.value),
        segmentCount: ranges.length,
        segments: ranges.map(([start, end], segmentIndex) => ({
          segmentIndex,
          start,
          end,
          bpmStart: hrStream[start],
          bpmEnd: hrStream[end],
          timeStart: timeStream[start],
          timeEnd: timeStream[end],
          latLngStart: latLngStream[start],
          latLngEnd: latLngStream[end]
        }))
      })
    }
  )

  const zoomedHoverIndex = computed(() => {
    if (hoverIndex.value === null || hoverIndex.value === undefined) return null
    if (!zoomRange.value) return hoverIndex.value

    const [zoomStart, zoomEnd] = zoomRange.value
    if (hoverIndex.value < zoomStart || hoverIndex.value > zoomEnd) return null

    return hoverIndex.value - zoomStart
  })

  const zoomedActiveHighlightRange = computed(() => {
    if (!activeHighlightRange.value) return null
    if (!zoomRange.value || !zoomedStreams.value?.time?.length) return activeHighlightRange.value

    const [zoomStart, zoomEnd] = zoomRange.value
    const [rangeStart, rangeEnd] = activeHighlightRange.value
    const clippedStart = Math.max(rangeStart, zoomStart)
    const clippedEnd = Math.min(rangeEnd, zoomEnd)

    if (clippedStart > clippedEnd) return null

    return [clippedStart - zoomStart, clippedEnd - zoomStart] as [number, number]
  })

  const zoomedHoverZoneRanges = computed(() => {
    if (!hoverZoneRanges.value) return null
    if (!zoomRange.value) return hoverZoneRanges.value

    const [zoomStart, zoomEnd] = zoomRange.value

    return hoverZoneRanges.value
      .map(([rangeStart, rangeEnd]) => {
        const clippedStart = Math.max(rangeStart, zoomStart)
        const clippedEnd = Math.min(rangeEnd, zoomEnd)

        if (clippedStart > clippedEnd) return null

        return [clippedStart - zoomStart, clippedEnd - zoomStart] as [number, number]
      })
      .filter(Boolean) as [number, number][]
  })

  const zoneHoverRangesForDisplay = computed(() =>
    isZoneHoverTemporarilyDisabled ? null : hoverZoneRanges.value
  )

  const zoomedZoneHoverRangesForDisplay = computed(() =>
    isZoneHoverTemporarilyDisabled ? null : zoomedHoverZoneRanges.value
  )

  watch(
    () => zoomedHoverZoneRanges.value,
    (ranges) => {
      if (!hoverZone.value) return

      console.log('[Map] Zoomed hover zone ranges:', {
        zone: hoverZone.value.name,
        zoomRange: zoomRange.value,
        ranges
      })
    }
  )

  const hoverSplitRange = computed(() => {
    if (!hoverSplit.value || !workout.value?.streams?.time) return null

    // For Laps, we calculate cumulative time from durations
    if (segmentTab.value === 'laps') {
      const splits = lapSplits.value
      const currentIdx = splits.findIndex((s) => s.lap === hoverSplit.value!.lap)
      if (currentIdx === -1) return null
      let startTime = 0
      for (let i = 0; i < currentIdx; i++) {
        startTime += splits[i].time
      }
      const endTime = startTime + hoverSplit.value.time
      const timeStream = workout.value.streams.time
      let startIdx = timeStream.findIndex((t: number) => t >= startTime)
      if (startIdx === -1) startIdx = 0
      let endIdx = timeStream.findIndex((t: number) => t >= endTime)
      if (endIdx === -1) endIdx = timeStream.length - 1
      return [startIdx, endIdx] as [number, number]
    }

    // For Intervals and Climbs, we use stored indices
    if (hoverSplit.value.start_index !== undefined && hoverSplit.value.end_index !== undefined) {
      return [hoverSplit.value.start_index, hoverSplit.value.end_index] as [number, number]
    }

    return null
  })
  function onChartZoom(range: [number, number]) {
    const [start, end] = range
    // If we're already zoomed, the range is relative to the CURRENT zoomed view
    if (zoomRange.value) {
      const currentStart = zoomRange.value[0]
      zoomRange.value = [currentStart + start, currentStart + end]
    } else {
      zoomRange.value = [start, end]
    }
  }

  function resetZoom() {
    zoomRange.value = null
  }

  function goBack() {
    router.push(`/workouts/${workoutId}`)
  }

  async function downloadGPX() {
    const toast = useToast()
    try {
      isExporting.value = true
      const response = await fetch(`/api/workouts/${workoutId}/export/gpx`, {
        credentials: 'include'
      })
      if (!response.ok) {
        throw new Error(`Export failed (${response.status})`)
      }

      const blob = await response.blob()
      const disposition = response.headers.get('content-disposition')
      const filenameMatch = disposition?.match(/filename="([^"]+)"/)
      const filename = filenameMatch?.[1] || `workout-${workoutId}.gpx`
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Failed to download GPX:', e)
      toast.add({
        title: 'GPX download failed',
        description: 'Please try again.',
        color: 'error'
      })
    } finally {
      isExporting.value = false
    }
  }

  // Formatters
  function formatDateWeekday(date: string) {
    return new Date(date).toLocaleDateString('en-US', { weekday: 'long' })
  }

  function formatDatePrimary(date: string) {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  function formatDistance(meters: number) {
    return formatDist(meters, userStore.profile?.distanceUnits || 'Kilometers')
  }

  function formatElevation(meters: number) {
    return formatElev(meters, userStore.profile?.distanceUnits || 'Kilometers')
  }

  function formatNullableWatts(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)}W` : '-'
  }

  function formatNullablePercent(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}%` : '-'
  }

  function formatPace(metersPerSecond: number) {
    if (!metersPerSecond || metersPerSecond <= 0) return '-'
    const paceSeconds = 1000 / metersPerSecond
    return formatPaceShared(paceSeconds, userStore.profile?.distanceUnits || 'Kilometers')
  }

  function formatTime(seconds: number) {
    const h = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    if (h > 0) {
      return `${h}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  function formatZoneRange(zone: { min?: number; max?: number }) {
    if (typeof zone?.min !== 'number' || typeof zone?.max !== 'number') return '-'
    return `${zone.min}-${zone.max} bpm`
  }
</script>
