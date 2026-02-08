<script setup lang="ts">
  import { WORKOUT_ICONS } from '~/utils/activity-types'

  const props = defineProps<{
    initialAvailability: any[]
    loading?: boolean
  }>()

  const emit = defineEmits(['save'])

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

  const displayOrder = [1, 2, 3, 4, 5, 6, 0]

  const availability = ref<any[]>([])

  function initialize() {
    const data = [...props.initialAvailability]
    const result = []

    for (const dayIdx of displayOrder) {
      const existing = data.find((d) => d.dayOfWeek === dayIdx)
      if (existing) {
        result.push({
          ...existing,
          slots: Array.isArray(existing.slots) ? existing.slots : []
        })
      } else {
        result.push({
          dayOfWeek: dayIdx,
          slots: [],
          notes: ''
        })
      }
    }
    availability.value = result
  }

  watch(() => props.initialAvailability, initialize, { immediate: true })

  function addSlot(day: any, template?: any) {
    if (!day.slots) day.slots = []

    const newSlot = template
      ? { ...template, id: crypto.randomUUID() }
      : {
          id: crypto.randomUUID(),
          name: 'Training Session',
          startTime: '07:00',
          duration: 60,
          activityTypes: [],
          gymAccess: false,
          bikeAccess: true,
          indoorOnly: false
        }

    day.slots.push(newSlot)
    day.slots.sort((a: any, b: any) => (a.startTime || '0').localeCompare(b.startTime || '0'))
  }

  function removeSlot(day: any, index: number) {
    day.slots.splice(index, 1)
  }

  function copyToWeekdays(day: any) {
    const weekdayIndices = [1, 2, 3, 4, 5]
    availability.value.forEach((d) => {
      if (weekdayIndices.includes(d.dayOfWeek) && d.dayOfWeek !== day.dayOfWeek) {
        d.slots = JSON.parse(JSON.stringify(day.slots))
        d.notes = day.notes
      }
    })
  }

  function save() {
    const dataToSave = availability.value.map((day) => {
      const slots = day.slots || []
      return {
        ...day,
        morning: slots.some((s: any) => parseInt((s.startTime || '0').split(':')[0]) < 12),
        afternoon: slots.some((s: any) => {
          const h = parseInt((s.startTime || '0').split(':')[0])
          return h >= 12 && h < 17
        }),
        evening: slots.some((s: any) => parseInt((s.startTime || '0').split(':')[0]) >= 17),
        gymAccess: slots.some((s: any) =>
          s.activityTypes?.some((t: string) => ['Gym', 'WeightTraining', 'Crossfit'].includes(t))
        ),
        bikeAccess: slots.some((s: any) =>
          s.activityTypes?.some((t: string) =>
            ['Ride', 'VirtualRide', 'MountainBikeRide', 'GravelRide'].includes(t)
          )
        ),
        indoorOnly: slots.every((s: any) => s.indoorOnly) && slots.length > 0
      }
    })
    emit('save', dataToSave)
  }

  const activityTypes = Object.keys(WORKOUT_ICONS)
    .sort()
    .map((type) => ({
      label: type,
      value: type,
      icon: WORKOUT_ICONS[type]
    }))

  const templateGroups = [
    {
      label: 'Endurance',
      items: [
        {
          name: 'Morning Run',
          startTime: '07:00',
          duration: 45,
          activityTypes: ['Run', 'TrailRun'],
          indoorOnly: false
        },
        {
          name: 'Evening Ride',
          startTime: '18:00',
          duration: 90,
          activityTypes: ['Ride', 'VirtualRide'],
          indoorOnly: false
        },
        {
          name: 'Swim Session',
          startTime: '06:30',
          duration: 60,
          activityTypes: ['Swim'],
          indoorOnly: false
        },
        {
          name: 'Long Weekend Session',
          startTime: '09:00',
          duration: 180,
          activityTypes: ['Ride', 'Run', 'GravelRide'],
          indoorOnly: false
        }
      ]
    },
    {
      label: 'Strength & Power',
      items: [
        {
          name: 'Gym Workout',
          startTime: '17:00',
          duration: 60,
          activityTypes: ['Gym', 'WeightTraining'],
          indoorOnly: true
        },
        {
          name: 'HIIT / Crossfit',
          startTime: '12:00',
          duration: 45,
          activityTypes: ['HIIT', 'Crossfit'],
          indoorOnly: true
        }
      ]
    },
    {
      label: 'Recovery & Mobility',
      items: [
        {
          name: 'Yoga / Mobility',
          startTime: '20:00',
          duration: 30,
          activityTypes: ['Yoga', 'Pilates'],
          indoorOnly: true
        },
        {
          name: 'Recovery Walk',
          startTime: '12:00',
          duration: 30,
          activityTypes: ['Walk', 'Active Recovery'],
          indoorOnly: false
        }
      ]
    },
    {
      label: 'Lifestyle',
      items: [
        {
          name: 'Commute',
          startTime: '08:00',
          duration: 30,
          activityTypes: ['Ride', 'Walk', 'Commute'],
          indoorOnly: false
        }
      ]
    }
  ]
</script>

<template>
  <div class="space-y-4">
    <div
      v-for="day in availability"
      :key="day.dayOfWeek"
      class="flex flex-col gap-6 p-4 sm:p-6 bg-neutral-50/50 dark:bg-neutral-900/20 border-b border-neutral-100 dark:border-neutral-800/50 transition-all hover:bg-neutral-100/50 dark:hover:bg-neutral-900/40 group/day first:rounded-t-2xl last:rounded-b-2xl last:border-b-0"
    >
      <!-- Row 1: Header (Day Info & Controls) -->
      <div class="flex items-center justify-between w-full">
        <div class="flex items-center gap-4">
          <h3
            class="font-bold text-xl text-neutral-900 dark:text-white group-hover/day:text-primary-600 dark:group-hover/day:text-primary-400 transition-colors"
          >
            {{ days[day.dayOfWeek === 0 ? 6 : day.dayOfWeek - 1] }}
          </h3>
          <div class="flex items-center gap-2">
            <UBadge
              v-if="day.slots?.length > 0"
              size="xs"
              variant="subtle"
              color="primary"
              class="font-black px-1.5 py-0"
            >
              {{ day.slots.length }}
            </UBadge>
            <span v-else class="text-[10px] font-bold text-neutral-400 uppercase tracking-widest"
              >Rest Day</span
            >
          </div>
        </div>

        <div class="flex items-center gap-2">
          <UDropdownMenu
            :items="[
              ...templateGroups.map((group) =>
                group.items.map((t) => ({
                  label: t.name,
                  icon: t.activityTypes[0] ? WORKOUT_ICONS[t.activityTypes[0]] : 'i-heroicons-plus',
                  onSelect: () => addSlot(day, t)
                }))
              ),
              [
                {
                  label: 'Custom Session',
                  icon: 'i-heroicons-sparkles',
                  onSelect: () => addSlot(day)
                }
              ]
            ]"
            :content="{ align: 'end' }"
          >
            <UButton
              variant="soft"
              color="primary"
              icon="i-heroicons-plus"
              size="sm"
              label="Add Session"
            />
          </UDropdownMenu>

          <UDropdownMenu
            :items="[
              [
                {
                  label: 'Copy to Weekdays',
                  icon: 'i-heroicons-document-duplicate',
                  onSelect: () => copyToWeekdays(day)
                },
                {
                  label: 'Clear Day',
                  icon: 'i-heroicons-trash',
                  color: 'error',
                  onSelect: () => (day.slots = [])
                }
              ]
            ]"
            :content="{ align: 'end' }"
          >
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-heroicons-ellipsis-horizontal"
              size="sm"
            />
          </UDropdownMenu>
        </div>
      </div>

      <!-- Row 2: Sessions -->
      <div class="w-full">
        <div
          v-if="!day.slots || day.slots.length === 0"
          class="h-full min-h-[64px] flex items-center p-4 bg-white/5 dark:bg-neutral-800/10 rounded-xl border border-dashed border-neutral-200/50 dark:border-neutral-800/50"
        >
          <div class="flex items-center gap-3 text-neutral-400 dark:text-neutral-500">
            <UIcon name="i-lucide-moon" class="size-4" />
            <span class="text-xs font-medium italic">Recovery focused. No sessions planned.</span>
          </div>
        </div>

        <div v-else class="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
          <div
            v-for="(slot, idx) in day.slots"
            :key="slot.id"
            class="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl p-5 shadow-sm relative group/slot transition-all hover:shadow-md hover:border-primary-500/50"
          >
            <div class="absolute left-0 top-4 bottom-4 w-1 bg-primary-500 rounded-full" />

            <div class="space-y-4">
              <div class="flex items-center justify-between gap-2">
                <UInput
                  v-model="slot.name"
                  size="sm"
                  variant="none"
                  class="font-bold text-neutral-900 dark:text-white p-0 h-auto text-base"
                  placeholder="Session Name"
                />
                <UButton
                  color="error"
                  variant="ghost"
                  icon="i-heroicons-x-mark"
                  size="xs"
                  class="opacity-0 group-hover/slot:opacity-100 transition-opacity -mr-1"
                  @click="removeSlot(day, idx as number)"
                />
              </div>

              <div class="flex flex-row items-end gap-4">
                <div class="flex-1 space-y-1.5">
                  <label class="text-[10px] font-black uppercase text-neutral-400 tracking-wider"
                    >Start Time</label
                  >
                  <UInput
                    v-model="slot.startTime"
                    type="time"
                    size="sm"
                    block
                    color="neutral"
                    variant="subtle"
                  />
                </div>
                <div class="flex-1 space-y-1.5">
                  <label class="text-[10px] font-black uppercase text-neutral-400 tracking-wider"
                    >Duration</label
                  >
                  <div class="flex items-center gap-2">
                    <UInput
                      v-model="slot.duration"
                      type="number"
                      size="sm"
                      block
                      color="neutral"
                      variant="subtle"
                    />
                    <span class="text-[10px] font-bold text-neutral-400 tracking-widest shrink-0"
                      >MIN</span
                    >
                  </div>
                </div>
              </div>

                                          <USelectMenu v-model="slot.activityTypes" multiple :items="activityTypes" size="xs"

                                            placeholder="All Sports" class="w-full" value-key="value">

                            

                              <template #default="{ modelValue }">

                                <UButton color="neutral" variant="subtle" size="xs" class="w-full justify-start overflow-hidden px-3 py-2 h-auto min-h-8">

                                  <template v-if="Array.isArray(modelValue) && modelValue.length">

                                    <div class="flex gap-1 flex-wrap overflow-hidden py-0.5">

                                      <UBadge v-for="type in modelValue" :key="String(type)" size="xs" variant="soft" color="neutral" class="whitespace-nowrap">

                                        {{ type }}

                                      </UBadge>

                                    </div>

                                  </template>

                                  <span v-else class="text-neutral-400 text-xs italic">All Sports</span>

                                </UButton>

                              </template>

                            </USelectMenu>

              

              <div
                class="flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-neutral-800"
              >
                <div class="flex items-center gap-1">
                  <UTooltip text="Force Indoor (Treadmill/Trainer)">
                    <UButton
                      :color="slot.indoorOnly ? 'primary' : 'neutral'"
                      :variant="slot.indoorOnly ? 'subtle' : 'ghost'"
                      icon="i-lucide-home"
                      size="xs"
                      label="Indoor Only"
                      @click="slot.indoorOnly = !slot.indoorOnly"
                    />
                  </UTooltip>
                </div>

                <div class="flex items-center gap-1.5">
                  <UIcon
                    v-for="type in (slot.activityTypes as string[])?.slice(0, 3)"
                    :key="type"
                    :name="WORKOUT_ICONS[type] || 'i-lucide-activity'"
                    class="size-3.5 text-neutral-400"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Sticky Footer -->
    <div
      class="sticky bottom-0 bg-white/95 dark:bg-neutral-950/95 backdrop-blur-xl -mx-4 px-4 py-4 border-t border-neutral-200 dark:border-neutral-800 z-30"
    >
      <div class="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
        <div class="flex items-center gap-3">
          <div
            class="size-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400"
          >
            <UIcon name="i-heroicons-bolt" class="size-5" />
          </div>
          <div class="hidden md:block">
            <p class="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-tight">
              Daily Rhythm Saved Automatically
            </p>
            <p class="text-[10px] text-neutral-500">
              Your AI Coach adapts the plan as your schedule evolves.
            </p>
          </div>
        </div>

        <UButton
          color="primary"
          size="lg"
          label="Save Weekly Schedule"
          icon="i-heroicons-check-badge"
          :loading="loading"
          class="min-w-[200px] shadow-lg shadow-primary-500/20 font-bold"
          @click="save"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
  :deep(.n-input-none input) {
    padding-left: 0;
    padding-right: 0;
    font-size: 0.875rem;
  }
</style>
