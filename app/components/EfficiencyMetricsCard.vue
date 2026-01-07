<template>
  <div class="efficiency-metrics-card bg-white dark:bg-gray-800 rounded-lg shadow p-6">
    <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
      <UIcon name="i-heroicons-chart-pie" class="w-5 h-5" />
      Efficiency Metrics
    </h3>

    <div v-if="hasMetrics" class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- Variability Index -->
      <div
        v-if="metrics.variabilityIndex !== null && metrics.variabilityIndex !== undefined"
        class="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
      >
        <div class="flex items-center justify-between mb-2">
          <UTooltip
            :popper="{ placement: 'top' }"
            :ui="{ content: 'w-[300px] h-auto whitespace-normal' }"
            arrow
          >
            <span
              class="text-sm text-gray-600 dark:text-gray-400 border-b border-dashed border-gray-300 dark:border-gray-600 cursor-help"
              >Variability Index</span
            >
            <template #content>
              <div class="text-left text-sm">{{ metricTooltips['Variability Index'] }}</div>
            </template>
          </UTooltip>
          <UBadge :color="getVIColor(metrics.variabilityIndex)" variant="subtle">
            {{ getVIRating(metrics.variabilityIndex) }}
          </UBadge>
        </div>
        <div class="text-2xl font-bold text-gray-900 dark:text-white">
          {{ metrics.variabilityIndex.toFixed(3) }}
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
          NP/AP ratio. Lower is steadier pacing.
        </p>
      </div>

      <!-- Efficiency Factor -->
      <div
        v-if="metrics.efficiencyFactor !== null && metrics.efficiencyFactor !== undefined"
        class="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
      >
        <div class="flex items-center justify-between mb-2">
          <UTooltip
            :popper="{ placement: 'top' }"
            :ui="{ content: 'w-[300px] h-auto whitespace-normal' }"
            arrow
          >
            <span
              class="text-sm text-gray-600 dark:text-gray-400 border-b border-dashed border-gray-300 dark:border-gray-600 cursor-help"
              >Efficiency Factor</span
            >
            <template #content>
              <div class="text-left text-sm">{{ metricTooltips['Efficiency Factor'] }}</div>
            </template>
          </UTooltip>
          <UBadge :color="getEFColor(metrics.efficiencyFactor)" variant="subtle">
            {{ getEFRating(metrics.efficiencyFactor) }}
          </UBadge>
        </div>
        <div class="text-2xl font-bold text-gray-900 dark:text-white">
          {{ metrics.efficiencyFactor.toFixed(2) }}
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Power/HR efficiency. Higher is better.
        </p>
      </div>

      <!-- Decoupling -->
      <div
        v-if="metrics.decoupling !== null && metrics.decoupling !== undefined"
        class="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
      >
        <div class="flex items-center justify-between mb-2">
          <UTooltip
            :popper="{ placement: 'top' }"
            :ui="{ content: 'w-[300px] h-auto whitespace-normal' }"
            arrow
          >
            <span
              class="text-sm text-gray-600 dark:text-gray-400 border-b border-dashed border-gray-300 dark:border-gray-600 cursor-help"
              >Aerobic Decoupling</span
            >
            <template #content>
              <div class="text-left text-sm">{{ metricTooltips['Aerobic Decoupling'] }}</div>
            </template>
          </UTooltip>
          <UBadge :color="getDecouplingColor(metrics.decoupling)" variant="subtle">
            {{ getDecouplingRating(metrics.decoupling) }}
          </UBadge>
        </div>
        <div class="text-2xl font-bold text-gray-900 dark:text-white">
          {{ metrics.decoupling.toFixed(1) }}%
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Aerobic efficiency drift. Lower is better.
        </p>
      </div>

      <!-- Power/HR Ratio -->
      <div
        v-if="metrics.powerHrRatio !== null && metrics.powerHrRatio !== undefined"
        class="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
      >
        <div class="flex items-center justify-between mb-2">
          <UTooltip
            :popper="{ placement: 'top' }"
            :ui="{ content: 'w-[300px] h-auto whitespace-normal' }"
            arrow
          >
            <span
              class="text-sm text-gray-600 dark:text-gray-400 border-b border-dashed border-gray-300 dark:border-gray-600 cursor-help"
              >Power/HR Ratio</span
            >
            <template #content>
              <div class="text-left text-sm">{{ metricTooltips['Power/HR Ratio'] }}</div>
            </template>
          </UTooltip>
        </div>
        <div class="text-2xl font-bold text-gray-900 dark:text-white">
          {{ metrics.powerHrRatio.toFixed(2) }}
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Average watts per bpm.</p>
      </div>

      <!-- Polarization Index -->
      <div
        v-if="metrics.polarizationIndex !== null && metrics.polarizationIndex !== undefined"
        class="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
      >
        <div class="flex items-center justify-between mb-2">
          <UTooltip
            :popper="{ placement: 'top' }"
            :ui="{ content: 'w-[300px] h-auto whitespace-normal' }"
            arrow
          >
            <span
              class="text-sm text-gray-600 dark:text-gray-400 border-b border-dashed border-gray-300 dark:border-gray-600 cursor-help"
              >Polarization Index</span
            >
            <template #content>
              <div class="text-left text-sm">{{ metricTooltips['Polarization Index'] }}</div>
            </template>
          </UTooltip>
        </div>
        <div class="text-2xl font-bold text-gray-900 dark:text-white">
          {{ metrics.polarizationIndex.toFixed(2) }}
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Training intensity distribution.
        </p>
      </div>

      <!-- L/R Balance -->
      <div
        v-if="metrics.lrBalance !== null && metrics.lrBalance !== undefined"
        class="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
      >
        <div class="flex items-center justify-between mb-2">
          <UTooltip
            :popper="{ placement: 'top' }"
            :ui="{ content: 'w-[300px] h-auto whitespace-normal' }"
            arrow
          >
            <span
              class="text-sm text-gray-600 dark:text-gray-400 border-b border-dashed border-gray-300 dark:border-gray-600 cursor-help"
              >L/R Balance</span
            >
            <template #content>
              <div class="text-left text-sm">{{ metricTooltips['L/R Balance'] }}</div>
            </template>
          </UTooltip>
          <UBadge :color="getLRBalanceColor(metrics.lrBalance)" variant="subtle">
            {{ getLRBalanceRating(metrics.lrBalance) }}
          </UBadge>
        </div>
        <div class="text-2xl font-bold text-gray-900 dark:text-white">
          {{ metrics.lrBalance.toFixed(1) }}%
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Left pedal contribution. Ideal: 50%.
        </p>
      </div>
    </div>

    <div v-else class="text-center py-8">
      <UIcon name="i-heroicons-chart-pie-slash" class="w-12 h-12 mx-auto mb-4 text-gray-400" />
      <p class="text-gray-600 dark:text-gray-400">
        No efficiency metrics available for this workout
      </p>
    </div>

    <!-- Info Section -->
    <div
      v-if="hasMetrics"
      class="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
    >
      <h4 class="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
        Understanding Efficiency Metrics
      </h4>
      <ul class="text-xs text-blue-800 dark:text-blue-200 space-y-1">
        <li>
          <strong>VI:</strong> Values close to 1.0 indicate steady pacing. &gt;1.05 is variable.
        </li>
        <li>
          <strong>EF:</strong> Measures aerobic fitness. Higher values indicate better efficiency.
        </li>
        <li>
          <strong>Decoupling:</strong> &lt;5% is excellent. &gt;10% suggests fatigue or poor pacing.
        </li>
        <li>
          <strong>L/R Balance:</strong> 48-52% is ideal. Large imbalances may indicate biomechanical
          issues.
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
  const props = defineProps<{
    metrics: {
      variabilityIndex?: number | null
      efficiencyFactor?: number | null
      decoupling?: number | null
      powerHrRatio?: number | null
      polarizationIndex?: number | null
      lrBalance?: number | null
    }
  }>()

  const hasMetrics = computed(() => {
    return (
      props.metrics.variabilityIndex !== null ||
      props.metrics.efficiencyFactor !== null ||
      props.metrics.decoupling !== null ||
      props.metrics.powerHrRatio !== null ||
      props.metrics.polarizationIndex !== null ||
      props.metrics.lrBalance !== null
    )
  })

  // Variability Index ratings
  function getVIColor(vi: number | null | undefined): 'success' | 'warning' | 'error' | 'neutral' {
    if (vi == null) return 'neutral'
    if (vi <= 1.05) return 'success'
    if (vi <= 1.1) return 'warning'
    return 'error'
  }

  function getVIRating(vi: number | null | undefined): string {
    if (vi == null) return 'N/A'
    if (vi <= 1.05) return 'Excellent'
    if (vi <= 1.1) return 'Good'
    return 'Variable'
  }

  // Efficiency Factor ratings (rough guidelines)
  function getEFColor(ef: number | null | undefined): 'success' | 'warning' | 'error' | 'neutral' {
    if (ef == null) return 'neutral'
    if (ef >= 2.0) return 'success'
    if (ef >= 1.5) return 'warning'
    return 'error'
  }

  function getEFRating(ef: number | null | undefined): string {
    if (ef == null) return 'N/A'
    if (ef >= 2.0) return 'Excellent'
    if (ef >= 1.5) return 'Good'
    return 'Fair'
  }

  // Decoupling ratings
  function getDecouplingColor(
    dec: number | null | undefined
  ): 'success' | 'warning' | 'error' | 'neutral' {
    if (dec == null) return 'neutral'
    if (dec <= 5) return 'success'
    if (dec <= 10) return 'warning'
    return 'error'
  }

  function getDecouplingRating(dec: number | null | undefined): string {
    if (dec == null) return 'N/A'
    if (dec <= 5) return 'Excellent'
    if (dec <= 10) return 'Good'
    return 'High'
  }

  // L/R Balance ratings
  function getLRBalanceColor(
    balance: number | null | undefined
  ): 'success' | 'warning' | 'error' | 'neutral' {
    if (balance == null) return 'neutral'
    const deviation = Math.abs(balance - 50)
    if (deviation <= 2) return 'success'
    if (deviation <= 4) return 'warning'
    return 'error'
  }

  function getLRBalanceRating(balance: number | null | undefined): string {
    if (balance == null) return 'N/A'
    const deviation = Math.abs(balance - 50)
    if (deviation <= 2) return 'Balanced'
    if (deviation <= 4) return 'Fair'
    return 'Imbalanced'
  }
</script>

<style scoped>
  .efficiency-metrics-card {
    width: 100%;
  }
</style>
