<template>
  <div v-if="rule" :class="containerClasses">
    <!-- Logo -->
    <div class="relative flex items-center">
      <img
        :src="rule.logoLight"
        :alt="`Data from ${provider}`"
        :class="[rule.logoHeightClass, 'w-auto object-contain dark:hidden']"
      />
      <img
        :src="rule.logoDark"
        :alt="`Data from ${provider}`"
        :class="[rule.logoHeightClass, 'w-auto object-contain hidden dark:block']"
      />
    </div>

    <!-- Text (Device Name or Attribution) -->
    <span
      v-if="shouldShowText"
      class="ml-2 font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap"
      :class="textClasses"
    >
      {{ rule.textFormat(deviceName) }}
    </span>
  </div>
</template>

<script setup lang="ts">
  import { getAttributionRule } from '~/utils/attribution-rules'

  const props = withDefaults(
    defineProps<{
      provider: string
      deviceName?: string
      mode?: 'standard' | 'minimal' | 'overlay'
    }>(),
    {
      mode: 'standard',
      deviceName: undefined
    }
  )

  const rule = computed(() => getAttributionRule(props.provider))

  const shouldShowText = computed(() => {
    if (!rule.value) return false
    // Always show text if the rule requires it (e.g. Garmin needs device name)
    // But suppress it if format returns empty string (e.g. Strava)
    return rule.value.requiresDeviceName && rule.value.textFormat(props.deviceName)
  })

  const containerClasses = computed(() => {
    const classes = ['flex', 'items-center', 'select-none']

    switch (props.mode) {
      case 'overlay':
        // High contrast, absolute positioning context usually
        classes.push('bg-white/80 dark:bg-black/60', 'backdrop-blur-sm', 'px-2', 'py-1', 'rounded')
        break
      case 'minimal':
        classes.push('text-xs')
        break
      case 'standard':
      default:
        classes.push('text-sm')
        break
    }

    return classes
  })

  const textClasses = computed(() => {
    if (props.mode === 'overlay') return 'text-xs font-semibold'
    return ''
  })
</script>

<style scoped>
  @media print {
    div {
      display: flex !important;
      print-color-adjust: exact;
    }
  }
</style>
