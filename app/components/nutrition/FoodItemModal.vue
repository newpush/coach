<template>
  <UModal
    v-model:open="isOpen"
    :title="isEditing ? 'Edit Food Entry' : 'Add Food Entry'"
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
          @click="isOpen = false"
        />
      </div>
    </template>

    <template #body>
      <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormField label="Meal Type" name="mealType">
          <USelect v-model="state.mealType" :items="mealTypes" class="w-full" />
        </UFormField>

        <UFormField label="Food Name" name="name">
          <UInput v-model="state.name" placeholder="e.g. Oatmeal with blueberries" class="w-full" />
        </UFormField>

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
          @click="onDelete"
        >
          Delete
        </UButton>
        <div class="flex gap-2 ml-auto">
          <UButton color="neutral" variant="ghost" @click="isOpen = false"> Cancel </UButton>
          <UButton color="primary" :loading="loading" @click="onSubmit">
            {{ isEditing ? 'Save Changes' : 'Add Item' }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
  import { z } from 'zod'
  import { ABSORPTION_PROFILES, getProfileForItem } from '~/utils/nutrition-absorption'

  const props = defineProps<{
    nutritionId?: string
    date: string
    initialData?: any
    mode?: 'add' | 'edit'
  }>()

  const emit = defineEmits(['updated'])

  const isOpen = defineModel<boolean>('open', { default: false })
  const loading = ref(false)
  const isEditing = computed(() => props.mode === 'edit')

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

  watch(isOpen, (newValue) => {
    if (newValue) {
      const { formatDate, getUserLocalTime } = useFormat()
      if (props.initialData && props.mode === 'edit') {
        currentItemId.value = props.initialData.id
        state.value = {
          ...props.initialData,
          mealType: props.initialData.mealType || props.initialData.meal || 'breakfast'
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
          logged_at: getUserLocalTime()
        }
      }
    }
  })

  async function onSubmit() {
    loading.value = true
    try {
      const { getUserDateFromLocal } = useFormat()
      const payload = { ...state.value }

      if (payload.logged_at && /^\d{2}:\d{2}$/.test(payload.logged_at)) {
        const dateObj = getUserDateFromLocal(props.date, payload.logged_at)
        if (!isNaN(dateObj.getTime())) {
          payload.logged_at = dateObj.toISOString()
        }
      }

      await $fetch(`/api/nutrition/${props.nutritionId || props.date}/items`, {
        method: 'PATCH',
        body: {
          action: isEditing.value ? 'update' : 'add',
          mealType: state.value.mealType,
          item: {
            ...payload,
            id: currentItemId.value
          }
        }
      })
      isOpen.value = false
      emit('updated')
    } catch (e) {
      console.error('Save error:', e)
    } finally {
      loading.value = false
    }
  }

  async function onDelete() {
    if (!confirm('Are you sure you want to delete this item?')) return
    loading.value = true
    try {
      await $fetch(`/api/nutrition/${props.nutritionId || props.date}/items`, {
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
