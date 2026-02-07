<template>
  <div class="flex flex-col flex-1 min-w-0 bg-gray-50 dark:bg-gray-900 min-h-screen">
    <!-- Header -->
    <div
      class="h-16 px-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-gray-900 sticky top-0 z-10"
    >
      <div class="flex items-center gap-4">
        <UDashboardSidebarCollapse />
        <h1 class="text-xl font-semibold text-gray-900 dark:text-white">LLM Tuning</h1>
      </div>
      <div class="flex items-center gap-3">
        <UButton
          icon="i-lucide-refresh-cw"
          label="Refresh"
          color="neutral"
          variant="outline"
          :loading="pending"
          @click="refresh"
        />
      </div>
    </div>

    <!-- Body -->
    <div class="p-4 sm:p-6 flex-1 overflow-y-auto max-w-7xl mx-auto w-full">
      <div v-if="pending && !settings.length" class="flex items-center justify-center py-12">
        <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-primary" />
      </div>

      <div v-else class="space-y-12 pb-24">
        <div v-for="tier in sortedSettings" :key="tier.tier" class="space-y-4">
          <!-- Tier Header -->
          <div class="flex items-center gap-3">
            <UBadge
              :color="getTierColor(tier.tier)"
              size="lg"
              variant="subtle"
              class="font-bold px-3 py-1"
            >
              {{ tier.tier }} TIER
            </UBadge>
            <div class="h-px flex-1 bg-gray-200 dark:bg-gray-800"></div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Tier Default Settings Card -->
            <UCard class="lg:col-span-1 border-2 border-primary-500/10 shadow-sm">
              <template #header>
                <div class="flex items-center justify-between">
                  <span class="font-semibold text-sm uppercase tracking-wider text-gray-500"
                    >Tier Defaults</span
                  >
                  <UIcon name="i-lucide-settings-2" class="size-4 text-primary-500" />
                </div>
              </template>

              <div class="space-y-5">
                <UFormField label="Model Family">
                  <USelect
                    v-model="tier.model"
                    :items="modelOptions"
                    class="w-full"
                    @change="onFamilyChange(tier)"
                  />
                </UFormField>

                <UFormField label="Exact Model">
                  <USelect
                    v-model="tier.modelId"
                    :items="getModelsForFamily(tier.model)"
                    class="w-full"
                    @change="saveTier(tier)"
                  />
                </UFormField>

                <UFormField v-if="tier.model === 'flash'" label="Thinking Budget">
                  <div class="space-y-2">
                    <div class="flex items-center justify-between text-xs text-gray-500">
                      <span>{{ tier.thinkingBudget.toLocaleString() }} tokens</span>
                      <span>16k max</span>
                    </div>
                    <UInput
                      v-model.number="tier.thinkingBudget"
                      type="range"
                      :min="0"
                      :max="16000"
                      :step="500"
                      @change="saveTier(tier)"
                    />
                  </div>
                </UFormField>

                <UFormField v-if="tier.model === 'pro'" label="Thinking Level">
                  <USelect
                    v-model="tier.thinkingLevel"
                    :items="getLevelOptionsForModel(tier.modelId)"
                    class="w-full"
                    @change="saveTier(tier)"
                  />
                </UFormField>

                <UFormField label="Max Tool Steps">
                  <div class="space-y-2">
                    <div class="flex items-center justify-between text-xs text-gray-500">
                      <span>{{ tier.maxSteps }} steps</span>
                      <span>20 max</span>
                    </div>
                    <UInput
                      v-model.number="tier.maxSteps"
                      type="range"
                      :min="1"
                      :max="20"
                      :step="1"
                      @change="saveTier(tier)"
                    />
                  </div>
                </UFormField>
              </div>
            </UCard>

            <!-- Operation Overrides Card -->
            <UCard
              class="lg:col-span-2 border-dashed border-2 border-gray-200 dark:border-gray-800"
            >
              <template #header>
                <div class="flex items-center justify-between">
                  <span class="font-semibold text-sm uppercase tracking-wider text-gray-500"
                    >Operation Overrides</span
                  >
                  <UButton
                    icon="i-lucide-plus"
                    label="Add Override"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    @click="openOverrideModal(tier)"
                  />
                </div>
              </template>

              <div>
                <div
                  v-if="!tier.overrides?.length"
                  class="flex flex-col items-center justify-center py-12 text-gray-400"
                >
                  <UIcon name="i-lucide-layers" class="size-8 mb-2 opacity-20" />
                  <p class="text-sm">No operation overrides for this tier.</p>
                  <p class="text-xs">Using tier defaults for all operations.</p>
                </div>

                <div v-else class="overflow-x-auto">
                  <table class="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr class="border-b border-gray-200 dark:border-gray-800">
                        <th
                          class="py-2 px-1 font-semibold text-gray-500 text-xs uppercase tracking-wider"
                        >
                          Operation
                        </th>
                        <th
                          class="py-2 px-1 font-semibold text-gray-500 text-xs uppercase tracking-wider"
                        >
                          Model
                        </th>
                        <th
                          class="py-2 px-1 font-semibold text-gray-500 text-xs uppercase tracking-wider"
                        >
                          Thinking
                        </th>
                        <th
                          class="py-2 px-1 font-semibold text-gray-500 text-xs uppercase tracking-wider"
                        >
                          Steps
                        </th>
                        <th
                          class="py-2 px-1 text-right font-semibold text-gray-500 text-xs uppercase tracking-wider"
                        >
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="override in tier.overrides"
                        :key="override.id"
                        class="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors group"
                      >
                        <td class="py-3 px-1">
                          <span class="font-medium text-gray-900 dark:text-white">{{
                            override.operation
                          }}</span>
                        </td>
                        <td class="py-3 px-1">
                          <div class="flex flex-col">
                            <span
                              class="text-xs"
                              :class="
                                override.model ? 'text-gray-900 dark:text-white' : 'text-gray-400'
                              "
                            >
                              {{ override.model || 'Inherited' }}
                            </span>
                            <span
                              v-if="override.modelId"
                              class="text-[10px] font-mono opacity-50 truncate max-w-[120px]"
                              :title="override.modelId"
                            >
                              {{ override.modelId }}
                            </span>
                          </div>
                        </td>
                        <td class="py-3 px-1">
                          <UBadge
                            v-if="override.thinkingBudget !== null"
                            size="xs"
                            variant="subtle"
                            color="blue"
                          >
                            {{
                              override.thinkingBudget === 0
                                ? 'Disabled'
                                : `${override.thinkingBudget.toLocaleString()} tokens`
                            }}
                          </UBadge>
                          <UBadge
                            v-else-if="override.thinkingLevel"
                            size="xs"
                            variant="subtle"
                            color="blue"
                          >
                            Level: {{ override.thinkingLevel }}
                          </UBadge>
                          <span v-else class="text-xs text-gray-400">Inherited</span>
                        </td>
                        <td class="py-3 px-1">
                          <UBadge
                            v-if="override.maxSteps"
                            size="xs"
                            variant="subtle"
                            color="orange"
                          >
                            {{ override.maxSteps }} steps
                          </UBadge>
                          <span v-else class="text-xs text-gray-400">Inherited</span>
                        </td>
                        <td class="py-3 px-1 text-right">
                          <div
                            class="flex items-center justify-end gap-1 sm:opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <UButton
                              icon="i-lucide-pencil"
                              size="xs"
                              color="neutral"
                              variant="ghost"
                              @click="openOverrideModal(tier, override)"
                            />
                            <UButton
                              icon="i-lucide-trash-2"
                              size="xs"
                              color="error"
                              variant="ghost"
                              @click="deleteOverride(override.id)"
                            />
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </UCard>
          </div>
        </div>
      </div>

      <!-- Info Footer -->
      <UAlert
        title="Override Logic"
        icon="i-lucide-info"
        color="neutral"
        variant="subtle"
        class="mt-8"
        description="Configuration is resolved as: User Status (Contributor) > User Tier (Pro/Free) > Operation Override > Tier Default. Setting an override field to null will make it inherit from the tier default."
      />
    </div>

    <!-- Override Modal -->
    <UModal
      v-model:open="isModalOpen"
      :title="editingOverride ? 'Edit Override' : 'New Operation Override'"
      description="Fine-tune LLM parameters for this specific operation and tier."
    >
      <template #content>
        <div class="p-6 space-y-6">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold sr-only">
              {{ editingOverride ? 'Edit Override' : 'New Operation Override' }}
            </h3>
            <UBadge v-if="activeTier" :color="getTierColor(activeTier.tier)"
              >{{ activeTier.tier }} Tier</UBadge
            >
          </div>

          <UForm :state="overrideState" @submit="saveOverride">
            <div class="space-y-4">
              <UFormField label="Operation" name="operation" required>
                <USelect
                  v-model="overrideState.operation"
                  :items="allOperations"
                  class="w-full"
                  :disabled="!!editingOverride"
                  placeholder="Select operation..."
                />
              </UFormField>

              <UFormField label="Override Family" help="Optional">
                <USelect
                  v-model="overrideState.model"
                  :items="[{ label: 'Inherit Default', value: 'inherit' }, ...modelOptions]"
                  class="w-full"
                  @change="onOverrideFamilyChange"
                />
              </UFormField>

              <UFormField
                v-if="overrideState.model && overrideState.model !== 'inherit'"
                label="Exact Model"
              >
                <USelect
                  v-model="overrideState.modelId"
                  :items="getModelsForFamily(overrideState.model)"
                  class="w-full"
                />
              </UFormField>

              <div class="grid grid-cols-2 gap-4">
                <UFormField
                  v-if="
                    overrideState.model === 'flash' ||
                    (overrideState.model === 'inherit' && activeTier?.model === 'flash')
                  "
                  label="Thinking Budget"
                >
                  <div class="space-y-3">
                    <USelect
                      v-model="overrideState.thinkingMode"
                      :items="[
                        { label: 'Inherit Tier Default', value: 'inherit' },
                        { label: 'Disabled (0 tokens)', value: 'disabled' },
                        { label: 'Custom Budget...', value: 'custom' }
                      ]"
                    />
                    <div v-if="overrideState.thinkingMode === 'custom'" class="pt-2">
                      <div class="flex items-center justify-between text-xs text-gray-500 mb-1">
                        <span>{{ overrideState.thinkingBudget.toLocaleString() }} tokens</span>
                      </div>
                      <UInput
                        v-model.number="overrideState.thinkingBudget"
                        type="range"
                        :min="500"
                        :max="16000"
                        :step="500"
                      />
                    </div>
                  </div>
                </UFormField>

                <UFormField
                  v-if="
                    overrideState.model === 'pro' ||
                    (overrideState.model === 'inherit' && activeTier?.model === 'pro')
                  "
                  label="Thinking Level"
                >
                  <USelect
                    v-model="overrideState.thinkingLevel"
                    :items="[
                      { label: 'Inherit', value: 'inherit' },
                      ...getLevelOptionsForModel(
                        overrideState.model === 'inherit'
                          ? activeTier.modelId
                          : overrideState.modelId
                      )
                    ]"
                  />
                </UFormField>
              </div>

              <UFormField label="Max Tool Steps" help="Optional">
                <UInput
                  v-model.number="overrideState.maxSteps"
                  type="number"
                  placeholder="Inherit..."
                />
              </UFormField>

              <div class="flex justify-end gap-3 mt-8">
                <UButton color="neutral" variant="ghost" @click="isModalOpen = false"
                  >Cancel</UButton
                >
                <UButton type="submit" color="primary" :loading="saving">Save Override</UButton>
              </div>
            </div>
          </UForm>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
  definePageMeta({
    layout: 'admin',
    middleware: ['auth', 'admin']
  })

  const { data: settings, pending, refresh } = await useFetch<any[]>('/api/admin/llm/settings')
  const toast = useToast()
  const saving = ref(false)

  const sortedSettings = computed(() => {
    if (!settings.value) return []
    const order = ['CONTRIBUTOR', 'PRO', 'SUPPORTER', 'FREE']
    return [...settings.value].sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier))
  })

  const modelOptions = [
    { label: 'Gemini 2.5', value: 'flash' },
    { label: 'Gemini 3.0', value: 'pro' }
  ]

  const MODEL_LIST = [
    { label: 'Gemini 3.0 Flash (Preview)', value: 'gemini-3-flash-preview', family: 'pro' },
    { label: 'Gemini 3.0 Pro (Preview)', value: 'gemini-3-pro-preview', family: 'pro' },
    { label: 'Gemini 2.5 Flash (Latest)', value: 'gemini-flash-latest', family: 'flash' },
    { label: 'Gemini 2.5 Pro (Latest)', value: 'gemini-pro-latest', family: 'flash' },
    { label: 'Gemini 2.5 Flash (Legacy)', value: 'gemini-2.5-flash', family: 'flash' }
  ]

  function getModelsForFamily(family: string) {
    return MODEL_LIST.filter((m) => m.family === family)
  }

  async function onFamilyChange(tier: any) {
    const familyModels = getModelsForFamily(tier.model)
    if (familyModels.length > 0) {
      tier.modelId = familyModels[0].value
    }
    await nextTick()
    saveTier(tier)
  }

  async function onOverrideFamilyChange() {
    if (overrideState.model === 'inherit') {
      overrideState.modelId = ''
      return
    }
    const familyModels = getModelsForFamily(overrideState.model)
    if (familyModels.length > 0) {
      overrideState.modelId = familyModels[0].value
    }
    await nextTick()
  }

  const levelOptions = [
    { label: 'Minimal', value: 'minimal' },
    { label: 'Low', value: 'low' },
    { label: 'Medium', value: 'medium' },
    { label: 'High', value: 'high' }
  ]

  function getLevelOptionsForModel(modelId: string) {
    if (modelId.includes('pro')) {
      return levelOptions.filter((l) => ['low', 'high'].includes(l.value))
    }
    return levelOptions
  }

  const allOperations = [
    'chat',
    'chat_ws',
    'chat_title_generation',
    'athlete_profile_generation',
    'generate_training_block',
    'weekly_plan_generation',
    'plan_structure',
    'workout_analysis',
    'nutrition_analysis',
    'wellness_analysis',
    'analyze_plan_adherence',
    'activity_recommendation',
    'generate_recommendations',
    'daily_coach_suggestion',
    'deduplicate_recommendations',
    'weekly_report_generation',
    'custom_report_generation',
    'unified_report_generation',
    'generate_structured_workout',
    'adjust_structured_workout',
    'generate_ad_hoc_workout',
    'goal_review',
    'goal_suggestions',
    'workout_score_explanation_batch',
    'nutrition_score_explanation_batch'
  ].sort()

  async function saveTier(tier: any) {
    try {
      await $fetch('/api/admin/llm/settings', {
        method: 'POST',
        body: {
          action: 'update_tier',
          tierId: tier.id,
          model: tier.model,
          modelId: tier.modelId,
          thinkingBudget: tier.thinkingBudget,
          thinkingLevel: tier.thinkingLevel,
          maxSteps: tier.maxSteps
        }
      })
      refresh()
      toast.add({ title: `Updated ${tier.tier} defaults`, color: 'success' })
    } catch (e) {
      console.error(e)
      toast.add({ title: 'Error saving settings', color: 'error' })
    }
  }

  // --- Override Management ---
  const isModalOpen = ref(false)
  const activeTier = ref<any>(null)
  const editingOverride = ref<any>(null)
  const overrideState = reactive({
    operation: '',
    model: 'inherit',
    modelId: '',
    thinkingMode: 'inherit' as 'inherit' | 'disabled' | 'custom',
    thinkingBudget: 2000,
    thinkingLevel: 'inherit',
    maxSteps: undefined as number | undefined
  })

  function openOverrideModal(tier: any, override: any = null) {
    activeTier.value = tier
    editingOverride.value = override

    if (override) {
      overrideState.operation = override.operation
      overrideState.model = override.model || 'inherit'
      overrideState.modelId = override.modelId || ''

      if (override.thinkingBudget === null) {
        overrideState.thinkingMode = 'inherit'
        overrideState.thinkingBudget = 2000
      } else if (override.thinkingBudget === 0) {
        overrideState.thinkingMode = 'disabled'
        overrideState.thinkingBudget = 0
      } else {
        overrideState.thinkingMode = 'custom'
        overrideState.thinkingBudget = override.thinkingBudget
      }

      overrideState.thinkingLevel = override.thinkingLevel || 'inherit'
      overrideState.maxSteps = override.maxSteps
    } else {
      overrideState.operation = ''
      overrideState.model = 'inherit'
      overrideState.modelId = ''
      overrideState.thinkingMode = 'inherit'
      overrideState.thinkingBudget = 2000
      overrideState.thinkingLevel = 'inherit'
      overrideState.maxSteps = undefined
    }

    isModalOpen.value = true
  }

  async function saveOverride() {
    saving.value = true
    try {
      let resolvedBudget: number | null = null
      if (overrideState.thinkingMode === 'disabled') resolvedBudget = 0
      else if (overrideState.thinkingMode === 'custom')
        resolvedBudget = overrideState.thinkingBudget

      await $fetch('/api/admin/llm/settings', {
        method: 'POST',
        body: {
          action: 'upsert_override',
          tierId: activeTier.value.id,
          overrideId: editingOverride.value?.id,
          operation: overrideState.operation,
          model: overrideState.model === 'inherit' ? null : overrideState.model,
          modelId: overrideState.modelId || null,
          thinkingBudget: resolvedBudget,
          thinkingLevel:
            overrideState.thinkingLevel === 'inherit' ? null : overrideState.thinkingLevel,
          maxSteps: overrideState.maxSteps || null
        }
      })
      isModalOpen.value = false
      refresh()
      toast.add({ title: 'Override saved successfully', color: 'success' })
    } catch (e) {
      console.error(e)
      toast.add({ title: 'Error saving override', color: 'error' })
    } finally {
      saving.value = false
    }
  }

  async function deleteOverride(id: string) {
    if (!confirm('Are you sure you want to remove this operation override?')) return
    try {
      await $fetch('/api/admin/llm/settings', {
        method: 'POST',
        body: {
          action: 'delete_override',
          overrideId: id
        }
      })
      refresh()
      toast.add({ title: 'Override removed', color: 'success' })
    } catch (e) {
      console.error(e)
    }
  }

  function getTierColor(tier: string) {
    switch (tier) {
      case 'CONTRIBUTOR':
        return 'blue'
      case 'PRO':
        return 'primary'
      case 'SUPPORTER':
        return 'purple'
      case 'FREE':
        return 'neutral'
      default:
        return 'neutral'
    }
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleString()
  }
</script>
