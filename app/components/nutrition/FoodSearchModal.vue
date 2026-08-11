<template>
  <UModal
    v-model:open="isOpen"
    title="Nutrition Database Search"
    :ui="{
      content: 'z-[9999]',
      overlay: 'z-[9998]'
    }"
    description="Search branded & generic foods or lookup barcodes."
  >
    <template #header>
      <div class="flex items-center justify-between w-full">
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-magnifying-glass-circle" class="w-6 h-6 text-primary-500" />
          <h3 class="text-lg font-black uppercase tracking-tight">Food Database Search</h3>
        </div>
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
      <div class="space-y-4">
        <!-- Search mode tabs -->
        <div class="flex border-b border-neutral-200 dark:border-neutral-800 pb-2 gap-2">
          <UButton
            :color="searchMode === 'keyword' ? 'primary' : 'neutral'"
            :variant="searchMode === 'keyword' ? 'solid' : 'ghost'"
            size="sm"
            icon="i-heroicons-magnifying-glass"
            @click="
              () => {
                searchMode = 'keyword'
              }
            "
          >
            Keyword Search
          </UButton>
          <UButton
            :color="searchMode === 'barcode' ? 'primary' : 'neutral'"
            :variant="searchMode === 'barcode' ? 'solid' : 'ghost'"
            size="sm"
            icon="i-heroicons-qr-code"
            @click="
              () => {
                searchMode = 'barcode'
              }
            "
          >
            Barcode Lookup
          </UButton>
        </div>

        <!-- Keyword search input -->
        <div v-if="searchMode === 'keyword'" class="space-y-2">
          <UInput
            v-model="searchQuery"
            placeholder="Search foods (e.g., Nutella, Oats, Greek Yogurt)..."
            icon="i-heroicons-magnifying-glass"
            class="w-full"
            :loading="loading"
          />
        </div>

        <!-- Barcode lookup input -->
        <div v-else class="flex gap-2">
          <UInput
            v-model="barcodeQuery"
            placeholder="Enter UPC/EAN barcode..."
            icon="i-heroicons-qr-code"
            class="flex-1"
            :loading="loading"
            @keyup.enter="performBarcodeLookup"
          />
          <UButton color="primary" :loading="loading" @click="performBarcodeLookup">
            Lookup
          </UButton>
        </div>

        <!-- Error / Warning Alert -->
        <div
          v-if="errorMessage"
          class="p-3 text-sm rounded-lg bg-error-50 dark:bg-error-950/40 border border-error-200 dark:border-error-800 text-error-700 dark:text-error-300 flex items-center gap-2"
        >
          <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 shrink-0" />
          <span>{{ errorMessage }}</span>
        </div>

        <!-- Search Results List -->
        <div v-if="items.length > 0" class="max-h-56 overflow-y-auto space-y-2 pr-1">
          <div
            v-for="item in items"
            :key="item.barcode || item.external_key || item.name"
            class="p-3 rounded-lg border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2"
            :class="
              selectedItem === item
                ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-950/30'
                : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50'
            "
            @click="selectItem(item)"
          >
            <div>
              <div class="flex items-center gap-2">
                <span
                  v-if="item.brand"
                  class="text-xs font-semibold px-2 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
                >
                  {{ item.brand }}
                </span>
                <span class="font-bold text-sm text-neutral-900 dark:text-neutral-100">{{
                  item.name
                }}</span>
              </div>
              <p
                v-if="item.serving_description"
                class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5"
              >
                Serving: {{ item.serving_description }}
              </p>
            </div>
            <div class="flex items-center gap-2 text-xs font-mono">
              <span
                class="px-2 py-1 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold"
              >
                {{ Math.round(item.nutrients_per_100g.calories_kcal) }} kcal
              </span>
              <span class="text-neutral-600 dark:text-neutral-400">
                P: {{ item.nutrients_per_100g.protein_g }}g | C:
                {{ item.nutrients_per_100g.carbs_g }}g | F: {{ item.nutrients_per_100g.fat_g }}g
              </span>
              <span class="text-[10px] text-neutral-400 dark:text-neutral-500">(100g)</span>
            </div>
          </div>
        </div>

        <div
          v-else-if="!loading && (searchQuery.trim().length >= 2 || hasSearchedBarcode)"
          class="p-6 text-center text-sm text-neutral-500 dark:text-neutral-400"
        >
          No food items found matching your criteria.
        </div>

        <!-- Portion Size Calculator -->
        <div
          v-if="selectedItem"
          class="p-4 rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50/30 dark:bg-primary-950/20 space-y-3"
        >
          <div class="flex items-center justify-between">
            <h4
              class="text-sm font-bold uppercase tracking-wide text-primary-700 dark:text-primary-300 flex items-center gap-1.5"
            >
              <UIcon name="i-heroicons-calculator" class="w-4 h-4" />
              Portion Calculator
            </h4>
            <span class="text-xs font-medium text-neutral-500">
              {{ selectedItem.name }}
            </span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <UFormField label="Portion Size (g)">
              <UInput v-model.number="portionGrams" type="number" min="1" step="5" class="w-full" />
            </UFormField>

            <div class="flex items-end gap-1 pb-0.5">
              <UButton
                v-if="selectedItem.serving_size_g"
                size="xs"
                color="neutral"
                variant="outline"
                @click="
                  () => {
                    portionGrams = selectedItem.serving_size_g
                  }
                "
              >
                1 Serving ({{ selectedItem.serving_size_g }}g)
              </UButton>
              <UButton
                size="xs"
                color="neutral"
                variant="outline"
                @click="
                  () => {
                    portionGrams = 100
                  }
                "
              >
                100g
              </UButton>
            </div>
          </div>

          <!-- Calculated Macros Summary -->
          <div
            class="grid grid-cols-4 gap-2 text-center pt-2 border-t border-primary-200/60 dark:border-primary-800/60"
          >
            <div class="p-2 rounded bg-neutral-100 dark:bg-neutral-800/80">
              <div class="text-[10px] text-neutral-500 uppercase font-semibold">Calories</div>
              <div class="text-base font-black text-amber-600 dark:text-amber-400">
                {{ calculatedPortion.calories }}
              </div>
            </div>
            <div class="p-2 rounded bg-neutral-100 dark:bg-neutral-800/80">
              <div class="text-[10px] text-neutral-500 uppercase font-semibold">Carbs</div>
              <div class="text-base font-black text-blue-600 dark:text-blue-400">
                {{ calculatedPortion.carbs_g }}g
              </div>
            </div>
            <div class="p-2 rounded bg-neutral-100 dark:bg-neutral-800/80">
              <div class="text-[10px] text-neutral-500 uppercase font-semibold">Protein</div>
              <div class="text-base font-black text-emerald-600 dark:text-emerald-400">
                {{ calculatedPortion.protein_g }}g
              </div>
            </div>
            <div class="p-2 rounded bg-neutral-100 dark:bg-neutral-800/80">
              <div class="text-[10px] text-neutral-500 uppercase font-semibold">Fat</div>
              <div class="text-base font-black text-rose-600 dark:text-rose-400">
                {{ calculatedPortion.fat_g }}g
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-between w-full">
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
          icon="i-heroicons-plus"
          :disabled="!selectedItem"
          @click="confirmSelection"
        >
          Use Food Item
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
  import { ref, computed, watch } from 'vue'

  export interface FoodItemPayload {
    name: string
    brand?: string
    barcode?: string
    amount: number
    unit: string
    calories: number
    carbs: number
    protein: number
    fat: number
    fiber?: number
    sugar?: number
  }

  const isOpen = defineModel<boolean>('open', { default: false })
  const emit = defineEmits<{
    (e: 'select-food', payload: FoodItemPayload): void
  }>()

  const searchMode = ref<'keyword' | 'barcode'>('keyword')
  const searchQuery = ref('')
  const barcodeQuery = ref('')
  const loading = ref(false)
  const errorMessage = ref('')
  const hasSearchedBarcode = ref(false)

  const items = ref<any[]>([])
  const selectedItem = ref<any | null>(null)
  const portionGrams = ref<number>(100)

  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  watch(searchQuery, (newVal) => {
    if (searchMode.value !== 'keyword') return
    if (debounceTimer) clearTimeout(debounceTimer)
    errorMessage.value = ''

    if (!newVal || newVal.trim().length < 2) {
      items.value = []
      selectedItem.value = null
      return
    }

    debounceTimer = setTimeout(async () => {
      loading.value = true
      try {
        const res = await $fetch<any, string & {}>('/api/nutrition/search', {
          params: { q: newVal.trim(), limit: 10 }
        })
        items.value = res.items || []
        if (items.value.length > 0) {
          selectItem(items.value[0])
        } else {
          selectedItem.value = null
        }
      } catch (err: any) {
        console.error('Failed to search food database:', err)
        errorMessage.value = err.data?.message || 'Error searching food database'
        items.value = []
        selectedItem.value = null
      } finally {
        loading.value = false
      }
    }, 300)
  })

  async function performBarcodeLookup() {
    if (!barcodeQuery.value || !barcodeQuery.value.trim()) return
    errorMessage.value = ''
    loading.value = true
    hasSearchedBarcode.value = true

    try {
      const res = await $fetch<any, string & {}>(
        `/api/nutrition/barcode/${encodeURIComponent(barcodeQuery.value.trim())}`
      )
      if (res && res.item) {
        items.value = [res.item]
        selectItem(res.item)
      } else {
        items.value = []
        selectedItem.value = null
        errorMessage.value = `No item found for barcode ${barcodeQuery.value}`
      }
    } catch (err: any) {
      items.value = []
      selectedItem.value = null
      errorMessage.value = err.data?.message || `Barcode ${barcodeQuery.value} not found.`
    } finally {
      loading.value = false
    }
  }

  function selectItem(item: any) {
    selectedItem.value = item
    portionGrams.value = item.serving_size_g || 100
  }

  const calculatedPortion = computed(() => {
    if (!selectedItem.value) {
      return { calories: 0, carbs_g: 0, protein_g: 0, fat_g: 0 }
    }

    const factor = (portionGrams.value || 100) / 100
    const n = selectedItem.value.nutrients_per_100g || {}

    const round1 = (val?: number) => (val !== undefined ? Math.round(val * factor * 10) / 10 : 0)

    return {
      calories: Math.round((n.calories_kcal || 0) * factor),
      carbs_g: round1(n.carbs_g),
      protein_g: round1(n.protein_g),
      fat_g: round1(n.fat_g),
      fiber_g: round1(n.fiber_g),
      sugar_g: round1(n.sugar_g)
    }
  })

  function confirmSelection() {
    if (!selectedItem.value) return

    const displayName = selectedItem.value.brand
      ? `${selectedItem.value.brand} ${selectedItem.value.name}`
      : selectedItem.value.name

    const payload: FoodItemPayload = {
      name: displayName,
      brand: selectedItem.value.brand,
      barcode: selectedItem.value.barcode,
      amount: portionGrams.value || 100,
      unit: 'g',
      calories: calculatedPortion.value.calories,
      carbs: calculatedPortion.value.carbs_g,
      protein: calculatedPortion.value.protein_g,
      fat: calculatedPortion.value.fat_g,
      fiber: calculatedPortion.value.fiber_g,
      sugar: calculatedPortion.value.sugar_g
    }

    emit('select-food', payload)
    isOpen.value = false
  }
</script>
