<template>
  <UModal
    v-model:open="isOpen"
    title="AI Nutrition Logger"
    description="Describe what you ate in natural language."
  >
    <template #header>
      <div class="flex items-center justify-between w-full">
        <h3 class="text-lg font-black uppercase tracking-tight flex items-center gap-2">
          <UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-primary-500" />
          AI Nutrition Logger
        </h3>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-heroicons-x-mark"
          @click="isOpen = false"
        />
      </div>
    </template>

    <template #body>
      <div class="space-y-4">
        <p class="text-xs text-gray-500 font-bold uppercase tracking-widest">
          Describe what you ate, and the AI coach will log it for you.
        </p>

        <UTextarea
          v-model="query"
          placeholder="e.g. I had a large bowl of oatmeal with a handful of blueberries and some honey for breakfast."
          :rows="4"
          class="w-full"
          autofocus
        />

        <div class="flex items-center gap-2">
          <span class="text-[10px] font-black uppercase text-gray-400">Target Meal:</span>
          <USelect v-model="mealType" :items="mealTypes" size="xs" color="neutral" variant="soft" />
        </div>

        <div
          v-if="error"
          class="p-3 bg-error-50 dark:bg-error-950/20 rounded-lg border border-error-100 dark:border-error-900/50"
        >
          <p class="text-xs text-error-600 dark:text-error-400 font-bold">{{ error }}</p>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton color="neutral" variant="ghost" @click="isOpen = false"> Cancel </UButton>
        <UButton
          color="primary"
          icon="i-heroicons-sparkles"
          :loading="loading"
          :disabled="!query.trim()"
          @click="onLog"
        >
          Log with AI
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
  const props = defineProps<{
    nutritionId?: string
    date: string
    initialContext?: {
      targetCarbs?: number
      windowType?: string
      item?: string | null
      mealType?: string
    } | null
  }>()

  const emit = defineEmits(['updated'])

  const isOpen = defineModel<boolean>('open', { default: false })
  const loading = ref(false)
  const query = ref('')
  const error = ref<string | null>(null)
  const mealType = ref('breakfast')

  watch(isOpen, (newValue) => {
    if (newValue) {
      error.value = null
      if (props.initialContext) {
        mealType.value = props.initialContext.mealType || 'breakfast'
        if (props.initialContext.targetCarbs) {
          if (props.initialContext.item) {
            query.value = `My coach recommended "${props.initialContext.item}" (${props.initialContext.targetCarbs}g carbs) for my ${props.initialContext.windowType || 'fueling window'}. Can you give me the exact portion sizes or a similar recipe?`
          } else {
            query.value = `I need to eat ${props.initialContext.targetCarbs}g of carbs for my ${props.initialContext.windowType || 'fueling window'}. Suggest something.`
          }
        } else {
          query.value = ''
        }
      } else {
        query.value = ''
        mealType.value = 'breakfast'
      }
    }
  })

  const mealTypes = [
    { label: 'Breakfast', value: 'breakfast' },
    { label: 'Lunch', value: 'lunch' },
    { label: 'Dinner', value: 'dinner' },
    { label: 'Snacks', value: 'snacks' }
  ]

  async function onLog() {
    if (!query.value.trim()) return
    loading.value = true
    error.value = null

    try {
      const res = await $fetch<any>(`/api/nutrition/${props.nutritionId || props.date}/log`, {
        method: 'POST',
        body: {
          query: query.value,
          mealType: mealType.value
        }
      })

      if (res.success) {
        isOpen.value = false
        emit('updated')
      } else {
        error.value = res.message || 'Could not parse entry.'
      }
    } catch (e: any) {
      error.value = e.data?.message || 'Error communicating with AI coach.'
    } finally {
      loading.value = false
    }
  }
</script>
