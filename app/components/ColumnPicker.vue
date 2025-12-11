<template>
  <UPopover :ui="{ width: 'w-72' }">
    <UButton
      icon="i-heroicons-view-columns"
      color="gray"
      variant="ghost"
      size="sm"
      label="Columns"
    />

    <template #panel>
      <div class="p-4 space-y-4">
        <div class="space-y-2">
          <UInput
            v-model="searchQuery"
            icon="i-heroicons-magnifying-glass"
            placeholder="Find column..."
            size="sm"
            autofocus
          />
        </div>

        <div class="max-h-[300px] overflow-y-auto space-y-1">
          <div
            v-for="(col, index) in displayColumns"
            :key="col.id"
            class="flex items-center justify-between group p-1.5 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <div class="flex items-center gap-2 overflow-hidden">
              <UCheckbox
                :model-value="isSelected(col.id)"
                @update:model-value="(val) => toggleColumn(col.id, val)"
              />
              <span class="text-sm truncate" :title="col.header">
                {{ col.header }}
              </span>
            </div>

            <!-- Reordering controls (only visible when not searching) -->
            <div
              v-if="!searchQuery && isSelected(col.id)"
              class="flex items-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <UButton
                icon="i-heroicons-chevron-up"
                variant="ghost"
                color="gray"
                size="2xs"
                :disabled="index === 0"
                @click.stop="moveColumn(index, -1)"
              />
              <UButton
                icon="i-heroicons-chevron-down"
                variant="ghost"
                color="gray"
                size="2xs"
                :disabled="index === displayColumns.length - 1"
                @click.stop="moveColumn(index, 1)"
              />
            </div>
          </div>
        </div>

        <div class="pt-2 border-t border-gray-200 dark:border-gray-700 flex justify-between">
            <UButton
                size="xs"
                variant="ghost"
                color="gray"
                label="Reset"
                @click="reset"
            />
             <span class="text-xs text-gray-500 self-center">
                {{ selectedCount }} selected
             </span>
        </div>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

interface Column {
  id: string
  header: string
  [key: string]: any
}

const props = defineProps<{
  columns: Column[]
  modelValue: string[] // Ordered list of selected IDs
  defaultColumns?: string[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string[]): void
}>()

const searchQuery = ref('')

// When not searching, we show the SELECTED columns in their order, followed by UNSELECTED columns
// OR just the list of available columns, but that makes reordering the *selected* ones hard if they are mixed.
// Better approach:
// 1. Show all columns in the list.
// 2. But the order of the list should reflect the user's preference?
//    If I move "Date" below "Type", "Date" should physically move in the list.
//    So the list passed to `v-for` should be the `modelValue` (selected IDs) + `unselected IDs`.

const orderedAllColumns = computed(() => {
  // 1. Start with selected IDs in order
  const selected = props.modelValue
    .map(id => props.columns.find(c => c.id === id))
    .filter(Boolean) as Column[]

  // 2. Add remaining unselected columns (in their original definition order)
  const unselected = props.columns.filter(c => !props.modelValue.includes(c.id))

  return [...selected, ...unselected]
})

const displayColumns = computed(() => {
  if (!searchQuery.value) return orderedAllColumns.value
  
  const query = searchQuery.value.toLowerCase()
  return props.columns.filter(c => 
    c.header.toLowerCase().includes(query)
  )
})

const selectedCount = computed(() => props.modelValue.length)

function isSelected(id: string) {
  return props.modelValue.includes(id)
}

function toggleColumn(id: string, isChecked: boolean) {
  const current = [...props.modelValue]
  if (isChecked) {
    // Add to end
    current.push(id)
  } else {
    // Remove
    const idx = current.indexOf(id)
    if (idx > -1) {
      current.splice(idx, 1)
    }
  }
  emit('update:modelValue', current)
}

function moveColumn(index: number, direction: number) {
  // We can only reorder the visible/selected columns in the `modelValue` array
  // The `orderedAllColumns` computed reflects `modelValue` + `unselected`.
  // `index` here is the index in `orderedAllColumns`.
  
  // If we try to move an item that is NOT selected (i.e. in the unselected chunk), 
  // we probably shouldn't be reordering it relative to selected ones in this view 
  // unless we select it first.
  // But my UI only shows move buttons `v-if="isSelected(col.id)"`.
  
  // So `index` is guaranteed to be within the `selected` part of `orderedAllColumns`
  // which corresponds exactly to `props.modelValue`.
  
  const current = [...props.modelValue]
  const newIndex = index + direction
  
  if (newIndex < 0 || newIndex >= current.length) return
  
  // Swap
  const temp = current[index]
  current[index] = current[newIndex]
  current[newIndex] = temp
  
  emit('update:modelValue', current)
}

function reset() {
    if (props.defaultColumns) {
        emit('update:modelValue', [...props.defaultColumns])
    } else {
        // Default to all
        emit('update:modelValue', props.columns.map(c => c.id))
    }
}
</script>
