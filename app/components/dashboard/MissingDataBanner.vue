<template>
  <div
    v-if="isVisible && missingFields.length > 0"
    class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-6"
  >
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div class="flex items-start gap-3">
        <div class="mt-0.5 shrink-0">
          <UIcon
            name="i-heroicons-exclamation-triangle"
            class="w-5 h-5 text-amber-600 dark:text-amber-400"
          />
        </div>
        <div>
          <h3 class="text-sm font-bold text-amber-800 dark:text-amber-200 uppercase tracking-tight">
            Complete your profile for personalized insights
          </h3>
          <p class="mt-1 text-sm text-amber-700 dark:text-amber-300 font-medium">
            We're missing:
            <span class="font-bold underline decoration-amber-500/30">{{ missingFieldsList }}</span
            >. Providing this information is critical for accurate coaching guidance.
          </p>
        </div>
      </div>
      <div class="flex items-center gap-3 shrink-0 self-end sm:self-center">
        <UButton
          to="/profile/settings"
          color="warning"
          variant="solid"
          size="sm"
          class="font-bold"
          icon="i-heroicons-user-circle"
        >
          Complete Profile
        </UButton>
        <UButton
          color="warning"
          variant="ghost"
          size="sm"
          icon="i-heroicons-x-mark"
          @click="dismiss"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  const props = defineProps<{
    missingFields: string[]
  }>()

  const isVisible = ref(true)
  const storageKey = 'profile-banner-dismissed'

  onMounted(() => {
    const dismissed = localStorage.getItem(storageKey)
    if (dismissed) {
      isVisible.value = false
    }
  })

  const missingFieldsList = computed(() => {
    if (props.missingFields.length === 0) return ''
    if (props.missingFields.length === 1) return props.missingFields[0]
    if (props.missingFields.length === 2) return props.missingFields.join(' and ')

    const last = props.missingFields[props.missingFields.length - 1]
    const others = props.missingFields.slice(0, -1).join(', ')
    return `${others}, and ${last}`
  })

  function dismiss() {
    isVisible.value = false
    localStorage.setItem(storageKey, 'true')
  }
</script>
