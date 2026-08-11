<template>
  <UModal
    v-model:open="isOpen"
    :title="isEditing ? 'Edit Food Entry' : 'Add Food Entry'"
    :ui="{
      content: 'z-[9999]',
      overlay: 'z-[9998]'
    }"
    description="Correct or update nutritional information for this item."
  >
    <template #header>
      <div class="flex items-center justify-between w-full">
        <h3 class="text-lg font-black uppercase tracking-tight">
          {{ isEditing ? 'Edit Food Entry' : 'Add Food Entry' }}
        </h3>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-heroicons-x-mark"
          @click="
            () => {
              isOpen = false
            }
          "
        />
      </div>
    </template>

    <template #body>
      <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormField label="Meal Type" name="mealType">
          <USelect v-model="state.mealType" :items="mealTypes" class="w-full" />
        </UFormField>

        <div class="flex items-end gap-2">
          <UFormField label="Food Name" name="name" class="flex-1">
            <UInput
              v-model="state.name"
              placeholder="e.g. Oatmeal with blueberries"
              class="w-full"
            />
          </UFormField>
          <UButton
            color="neutral"
            variant="soft"
            icon="i-heroicons-magnifying-glass"
            class="mb-[2px]"
            @click="
              () => {
                isSearchModalOpen = true
              }
            "
          >
            Search DB
          </UButton>
        </div>

        <UFormField label="Absorption Type" name="absorptionType">
          <USelect
            v-model="state.absorptionType"
            :items="absorptionTypes"
            class="w-full"
            placeholder="Select absorption rate"
          />
        </UFormField>

        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Amount" name="amount">
            <UInput v-model="state.amount" type="number" step="0.1" class="w-full" />
          </UFormField>
          <UFormField label="Unit" name="unit">
            <UInput v-model="state.unit" placeholder="g, ml, cup, etc." class="w-full" />
          </UFormField>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <UFormField label="Calories" name="calories">
            <UInput v-model="state.calories" type="number" class="w-full" />
          </UFormField>
          <UFormField label="Carbs (g)" name="carbs">
            <UInput v-model="state.carbs" type="number" class="w-full" />
          </UFormField>
          <UFormField label="Protein (g)" name="protein">
            <UInput v-model="state.protein" type="number" class="w-full" />
          </UFormField>
          <UFormField label="Fat (g)" name="fat">
            <UInput v-model="state.fat" type="number" class="w-full" />
          </UFormField>
        </div>

        <UFormField label="Time (optional)" name="logged_at">
          <UInput v-model="state.logged_at" type="time" class="w-full" />
        </UFormField>
      </UForm>
    </template>

    <template #footer>
      <div class="flex justify-between w-full">
        <UButton
          v-if="isEditing"
          color="error"
          variant="soft"
          icon="i-heroicons-trash"
          @click="
            () => {
              void onDelete()
            }
          "
        >
          Delete
        </UButton>
        <div class="flex gap-2 ml-auto">
          <UButton
            color="neutral"
            variant="ghost"
            @click="
              () => {
                isOpen = false
              }
            "
          >
            Cancel
          </UButton>
          <UButton
            color="primary"
            :loading="loading"
            @click="
              () => {
                void onSubmit()
              }
            "
          >
            {{ isEditing ? 'Save Changes' : 'Add Item' }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>

  <NutritionFoodSearchModal
    v-model:open="isSearchModalOpen"
    @select-food="handleSelectFoodFromSearch"
  />
</template>

<script setup lang="ts">
  import { z } from 'zod'
  import { ABSORPTION_PROFILES } from '~/utils/nutrition-absorption'
  import type { FoodItemPayload } from './FoodSearchModal.vue'

  const props = defineProps<{
    nutritionId?: string
    date: string
    initialData?: any
    mode?: 'add' | 'edit'
  }>()

  const emit = defineEmits(['updated'])

  const isOpen = defineModel<boolean>('open', { default: false })
  const isSearchModalOpen = ref(false)
  const loading = ref(false)

  function handleSelectFoodFromSearch(food: FoodItemPayload) {
    state.value.name = food.name
    state.value.amount = food.amount
    state.value.unit = food.unit
    state.value.calories = food.calories
    state.value.carbs = food.carbs
    state.value.protein = food.protein
    state.value.fat = food.fat
  }

  const isEditing = computed(() => props.mode === 'edit')
  const toast = useToast()

  const LEGACY_ABSORPTION_TYPE_MAP: Record<string, string> = {
    SIMPLE: 'RAPID',
    INTERMEDIATE: 'FAST',
    COMPLEX: 'BALANCED'
  }

  const mealTypes = [
    { label: 'Breakfast', value: 'breakfast' },
    { label: 'Lunch', value: 'lunch' },
    { label: 'Dinner', value: 'dinner' },
    { label: 'Snacks', value: 'snacks' }
  ]

  const absorptionTypes = Object.values(ABSORPTION_PROFILES).map((p) => ({
    label: p.label,
    value: p.id
  }))
  const validAbsorptionTypes = new Set(absorptionTypes.map((type) => type.value))

  const schema = z.object({
    name: z.string().min(1, 'Name is required'),
    mealType: z.string(),
    calories: z.coerce.number().min(0),
    carbs: z.coerce.number().min(0),
    protein: z.coerce.number().min(0),
    fat: z.coerce.number().min(0),
    amount: z.coerce.number().optional(),
    unit: z.string().optional(),
    logged_at: z.string().optional(),
    absorptionType: z.string()
  })

  const state = ref<any>({
    name: '',
    mealType: 'breakfast',
    calories: 0,
    carbs: 0,
    protein: 0,
    fat: 0,
    amount: 1,
    unit: 'serving',
    logged_at: '',
    absorptionType: 'BALANCED'
  })

  const currentItemId = ref<string | null>(null)

  function normalizeAbsorptionType(absorptionType?: string) {
    if (!absorptionType) return 'BALANCED'
    const normalized = String(absorptionType).toUpperCase()
    const mapped = LEGACY_ABSORPTION_TYPE_MAP[normalized] || normalized
    // @ts-expect-error - validAbsorptionTypes handles validation
    return validAbsorptionTypes.has(mapped) ? mapped : 'BALANCED'
  }

  watch(isOpen, (newValue) => {
    if (newValue) {
      const { formatDate, getUserLocalTime } = useFormat()
      if (props.initialData && props.mode === 'edit') {
        currentItemId.value = props.initialData.id
        state.value = {
          ...props.initialData,
          mealType: props.initialData.mealType || props.initialData.meal || 'breakfast',
          calories: Number(props.initialData.calories ?? 0) || 0,
          carbs: Number(props.initialData.carbs ?? 0) || 0,
          protein: Number(props.initialData.protein ?? 0) || 0,
          fat: Number(props.initialData.fat ?? 0) || 0,
          absorptionType: normalizeAbsorptionType(props.initialData.absorptionType)
        }
        if (state.value.logged_at && state.value.logged_at.includes('T')) {
          state.value.logged_at = formatDate(state.value.logged_at, 'HH:mm')
        }
      } else {
        currentItemId.value = null
        state.value = {
          name: '',
          mealType: props.initialData?.mealType || 'breakfast',
          calories: 0,
          carbs: 0,
          protein: 0,
          fat: 0,
          amount: 1,
          unit: 'serving',
          logged_at: getUserLocalTime(),
          absorptionType: 'BALANCED'
        }
      }
    }
  })

  async function onSubmit() {
    loading.value = true
    try {
      const { getUserDateFromLocal } = useFormat()
      const payload = { ...state.value }
      payload.calories = Number(payload.calories ?? 0) || 0
      payload.carbs = Number(payload.carbs ?? 0) || 0
      payload.protein = Number(payload.protein ?? 0) || 0
      payload.fat = Number(payload.fat ?? 0) || 0
      payload.absorptionType = normalizeAbsorptionType(payload.absorptionType)

      if (payload.logged_at && /^\d{2}:\d{2}(:\d{2})?$/.test(payload.logged_at)) {
        const localTime = payload.logged_at.slice(0, 5)
        const dateObj = getUserDateFromLocal(props.date, localTime)
        if (!isNaN(dateObj.getTime())) {
          payload.logged_at = dateObj.toISOString()
        }
      }

      await $fetch<any, string & {}>(`/api/nutrition/${props.nutritionId || props.date}/items`, {
        method: 'PATCH',
        body: {
          action: isEditing.value ? 'update' : 'add',
          mealType: state.value.mealType,
          item: {
            ...payload,
            ...(typeof currentItemId.value === 'string' && currentItemId.value.length > 0
              ? { id: currentItemId.value }
              : {})
          }
        }
      })
      isOpen.value = false
      emit('updated')
    } catch (e) {
      console.error('Save error:', e)
      toast.add({
        title: 'Save Failed',
        description:
          (e as any)?.data?.message || (e as any)?.message || 'Could not save this food entry.',
        color: 'error'
      })
    } finally {
      loading.value = false
    }
  }

  async function onDelete() {
    if (!confirm('Are you sure you want to delete this item?')) return
    loading.value = true
    try {
      await $fetch<any, string & {}>(`/api/nutrition/${props.nutritionId || props.date}/items`, {
        method: 'PATCH',
        body: {
          action: 'delete',
          mealType: state.value.mealType,
          itemId: currentItemId.value
        }
      })
      isOpen.value = false
      emit('updated')
    } catch (e) {
      console.error('Delete error:', e)
    } finally {
      loading.value = false
    }
  }
</script>
