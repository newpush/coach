<template>
  <div class="space-y-4">
    <UCard :ui="{ body: 'p-0' }">
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-base font-semibold leading-6 text-gray-900 dark:text-white">
            {{ title }}
          </h3>
          <div class="flex items-center gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              :icon="isExpandedAll ? 'i-heroicons-minus-circle' : 'i-heroicons-plus-circle'"
              title="Expand All"
              @click="isExpandedAll = !isExpandedAll"
            />
            <UButton
              v-if="collapsible"
              color="neutral"
              variant="ghost"
              :icon="
                isOpen ? 'i-heroicons-chevron-up-20-solid' : 'i-heroicons-chevron-down-20-solid'
              "
              @click="isOpen = !isOpen"
            />
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-heroicons-arrow-down-tray-20-solid"
              @click="downloadJson"
            />
          </div>
        </div>
      </template>

      <div v-show="isOpen" class="p-4">
        <vue-json-pretty
          :data="data"
          :show-depth="isExpandedAll ? 10 : deep"
          :show-double-quotes="true"
          :show-length="true"
          :show-line="false"
          :show-select-controller="true"
          class="text-sm"
        />
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
  import VueJsonPretty from 'vue-json-pretty'
  import 'vue-json-pretty/lib/styles.css'

  const props = defineProps({
    title: {
      type: String,
      default: 'JSON Data'
    },
    data: {
      type: [Object, Array],
      required: true
    },
    collapsible: {
      type: Boolean,
      default: true
    },
    defaultOpen: {
      type: Boolean,
      default: false
    },
    deep: {
      type: Number,
      default: 2
    },
    filename: {
      type: String,
      default: 'data.json'
    }
  })

  const isOpen = ref(props.defaultOpen)
  const isExpandedAll = ref(false)

  const downloadJson = () => {
    const dataStr = JSON.stringify(props.data, null, 2)
    const blob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = props.filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }
</script>

<style>
  /* Adjust vue-json-pretty colors for dark mode */
  .dark .vjs-tree {
    color: #e5e7eb;
  }
  .dark .vjs-key {
    color: #93c5fd;
  }
  .dark .vjs-value {
    color: #86efac;
  }
  .dark .vjs-string {
    color: #fca5a5;
  }

  /* More subtle hover highlight */
  .vjs-tree-node:hover {
    background-color: rgba(0, 0, 0, 0.03) !important;
  }
  .dark .vjs-tree-node:hover {
    background-color: rgba(255, 255, 255, 0.05) !important;
  }

  /* Adjust selection controller for dark mode if needed */
  .dark .vjs-check-controller {
    filter: invert(1) hue-rotate(180deg);
  }
</style>
