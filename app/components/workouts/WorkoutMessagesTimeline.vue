<template>
  <UCard v-if="hasMessages">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-chat-bubble-left-right" class="w-5 h-5 text-primary" />
        <h3 class="font-semibold text-lg">Workout Cues & Motivation</h3>
      </div>
    </template>

    <div class="p-2">
      <UTimeline :items="timelineItems" class="px-2">
        <template #default="{ item }">
          <div class="flex items-start justify-between gap-3 group pb-4">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span
                  v-if="item.step"
                  class="text-xs font-bold uppercase tracking-wider"
                  :style="{ color: item.stepColor }"
                >
                  {{ item.step.name }}
                </span>
                <div v-if="item.step" class="flex gap-1">
                  <UBadge
                    size="xs"
                    variant="soft"
                    color="neutral"
                    class="text-[8px] px-1 py-0 uppercase"
                  >
                    {{ item.step.type }}
                  </UBadge>
                  <UBadge
                    size="xs"
                    variant="soft"
                    :color="getZoneColor(item.zone)"
                    class="text-[8px] px-1 py-0 uppercase"
                  >
                    {{ item.zone }}
                  </UBadge>
                </div>
              </div>

              <p class="text-sm text-gray-800 dark:text-gray-200 leading-relaxed italic">
                "{{ item.description }}"
              </p>
            </div>

            <div class="text-right shrink-0">
              <span
                class="text-[10px] font-mono font-bold bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-400"
              >
                {{ item.title }}
              </span>
            </div>
          </div>
        </template>
      </UTimeline>
    </div>
  </UCard>
</template>

<script setup lang="ts">
  const props = defineProps<{
    workout: any // structuredWorkout JSON
  }>()

  const hasMessages = computed(() => props.workout?.messages?.length > 0)

  const timelineItems = computed(() => {
    if (!props.workout?.messages || !props.workout?.steps) return []

    const totalDuration = props.workout.steps.reduce(
      (acc: number, s: any) => acc + s.durationSeconds,
      0
    )

    return [...props.workout.messages]
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((msg) => {
        const stepInfo = getStepInfoForTimestamp(msg.timestamp)
        return {
          ...msg,
          label: msg.text,
          description: msg.text,
          title: formatTime(msg.timestamp),
          step: stepInfo?.step,
          stepColor: stepInfo ? getStepColor(stepInfo.step.type) : undefined,
          zone: stepInfo
            ? getZone(
                stepInfo.step.power?.value ||
                  (stepInfo.step.power?.range
                    ? (stepInfo.step.power.range.start + stepInfo.step.power.range.end) / 2
                    : 0)
              )
            : undefined,
          icon: 'i-heroicons-chat-bubble-bottom-center-text'
        }
      })
  })

  function getStepInfoForTimestamp(timestamp: number) {
    let elapsed = 0
    for (const step of props.workout.steps) {
      if (timestamp >= elapsed && timestamp < elapsed + step.durationSeconds) {
        return { step, elapsed }
      }
      elapsed += step.durationSeconds
    }
    return null
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  function getStepColor(type: string): string {
    const colors: Record<string, string> = {
      Warmup: '#10b981', // green
      Active: '#f59e0b', // amber
      Rest: '#6366f1', // indigo
      Cooldown: '#06b6d4' // cyan
    }
    return colors[type] || '#9ca3af'
  }

  function getZone(power: number): string {
    if (power <= 0.55) return 'Z1'
    if (power <= 0.75) return 'Z2'
    if (power <= 0.9) return 'Z3'
    if (power <= 1.05) return 'Z4'
    if (power <= 1.2) return 'Z5'
    return 'Z6'
  }

  function getZoneColor(
    zone?: string
  ): 'error' | 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'neutral' {
    const colors: Record<
      string,
      'error' | 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'neutral'
    > = {
      Z1: 'neutral',
      Z2: 'primary',
      Z3: 'success',
      Z4: 'warning',
      Z5: 'warning',
      Z6: 'error'
    }
    return colors[zone || ''] || 'neutral'
  }
</script>
