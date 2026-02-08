<template>
  <div class="space-y-8 animate-fade-in">
    <div class="flex justify-end">
      <UButton
        icon="i-heroicons-arrow-path"
        size="sm"
        variant="soft"
        color="primary"
        :loading="autodetecting"
        @click="autodetectProfile"
      >
        Auto-detect from Apps
      </UButton>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <!-- Name -->
      <div class="group relative">
        <div class="flex items-center gap-1 mb-1">
          <label class="text-sm text-muted">Name</label>
          <button
            class="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            @click="startEdit('name')"
          >
            <UIcon name="i-heroicons-pencil" class="w-3 h-3 text-muted hover:text-primary" />
          </button>
        </div>
        <div v-if="editingField === 'name'" class="flex gap-2">
          <UInput
            v-model="editValue"
            size="sm"
            class="w-full"
            autofocus
            @keyup.enter="saveField"
            @keyup.esc="cancelEdit"
          />
          <UButton size="xs" color="primary" variant="solid" label="Save" @click="saveField" />
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-heroicons-x-mark"
            @click="cancelEdit"
          />
        </div>
        <p v-else class="font-medium text-lg">{{ modelValue.name }}</p>
      </div>

      <!-- Language -->
      <div class="group relative">
        <div class="flex items-center gap-1 mb-1">
          <label class="text-sm text-muted">Language</label>
          <button
            class="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            @click="startEdit('language')"
          >
            <UIcon name="i-heroicons-pencil" class="w-3 h-3 text-muted hover:text-primary" />
          </button>
        </div>
        <div v-if="editingField === 'language'" class="flex gap-2 w-full relative z-50">
          <USelectMenu
            v-model="editValue"
            :items="['English', 'Spanish', 'French', 'German']"
            size="sm"
            class="flex-1"
            :search-input="false"
            :ui="{ content: 'w-full min-w-[var(--reka-popper-anchor-width)]' }"
            @update:model-value="saveField"
          />
        </div>
        <p v-else class="font-medium text-lg">{{ modelValue.language }}</p>
      </div>

      <!-- Weight -->
      <div class="group relative">
        <div class="flex items-center gap-1 mb-1">
          <label class="text-sm text-muted">Weight</label>
          <button
            class="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            @click="startEdit('weight')"
          >
            <UIcon name="i-heroicons-pencil" class="w-3 h-3 text-muted hover:text-primary" />
          </button>
        </div>
        <div v-if="editingField === 'weight'" class="flex gap-2">
          <UInput
            v-model="editValue"
            type="number"
            size="sm"
            class="w-full"
            autofocus
            @keyup.enter="saveField"
            @keyup.esc="cancelEdit"
          />
          <UButton size="xs" color="primary" variant="solid" label="Save" @click="saveField" />
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-heroicons-x-mark"
            @click="cancelEdit"
          />
        </div>
        <p v-else class="font-medium text-lg">
          {{
            typeof modelValue.weight === 'number' ? modelValue.weight.toFixed(2) : modelValue.weight
          }}
        </p>
      </div>

      <!-- Weight Units -->
      <div class="group relative">
        <div class="flex items-center gap-1 mb-1">
          <label class="text-sm text-muted">Units</label>
          <button
            class="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            @click="startEdit('weightUnits')"
          >
            <UIcon name="i-heroicons-pencil" class="w-3 h-3 text-muted hover:text-primary" />
          </button>
        </div>
        <div v-if="editingField === 'weightUnits'" class="flex gap-2 w-full relative z-50">
          <USelectMenu
            v-model="editValue"
            :items="['Kilograms', 'Pounds']"
            size="sm"
            class="flex-1"
            :search-input="false"
            :ui="{ content: 'w-full min-w-[var(--reka-popper-anchor-width)]' }"
            @update:model-value="saveField"
          />
        </div>
        <p v-else class="font-medium text-lg">{{ modelValue.weightUnits }}</p>
      </div>

      <!-- Height -->
      <div class="group relative">
        <div class="flex items-center gap-1 mb-1">
          <label class="text-sm text-muted">Height</label>
          <button
            class="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            @click="startEdit('height')"
          >
            <UIcon name="i-heroicons-pencil" class="w-3 h-3 text-muted hover:text-primary" />
          </button>
        </div>
        <div v-if="editingField === 'height'" class="flex gap-2">
          <UInput
            v-model="editValue"
            type="number"
            size="sm"
            class="w-full"
            autofocus
            @keyup.enter="saveField"
            @keyup.esc="cancelEdit"
          />
          <UButton size="xs" color="primary" variant="solid" label="Save" @click="saveField" />
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-heroicons-x-mark"
            @click="cancelEdit"
          />
        </div>
        <p v-else class="font-medium text-lg">{{ modelValue.height }}</p>
      </div>

      <!-- Height Units -->
      <div class="group relative">
        <div class="flex items-center gap-1 mb-1">
          <label class="text-sm text-muted">Units</label>
          <button
            class="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            @click="startEdit('heightUnits')"
          >
            <UIcon name="i-heroicons-pencil" class="w-3 h-3 text-muted hover:text-primary" />
          </button>
        </div>
        <div v-if="editingField === 'heightUnits'" class="flex gap-2 w-full relative z-50">
          <USelectMenu
            v-model="editValue"
            :items="['cm', 'ft/in']"
            size="sm"
            class="flex-1"
            :search-input="false"
            :ui="{ content: 'w-full min-w-[var(--reka-popper-anchor-width)]' }"
            @update:model-value="saveField"
          />
        </div>
        <p v-else class="font-medium text-lg">{{ modelValue.heightUnits }}</p>
      </div>

      <!-- Distance -->
      <div class="group relative">
        <div class="flex items-center gap-1 mb-1">
          <label class="text-sm text-muted">Distance</label>
          <button
            class="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            @click="startEdit('distanceUnits')"
          >
            <UIcon name="i-heroicons-pencil" class="w-3 h-3 text-muted hover:text-primary" />
          </button>
        </div>
        <div v-if="editingField === 'distanceUnits'" class="flex gap-2 w-full relative z-50">
          <USelectMenu
            v-model="editValue"
            :items="['Kilometers', 'Miles']"
            size="sm"
            class="flex-1"
            :search-input="false"
            :ui="{ content: 'w-full min-w-[var(--reka-popper-anchor-width)]' }"
            @update:model-value="saveField"
          />
        </div>
        <p v-else class="font-medium text-lg">{{ modelValue.distanceUnits }}</p>
      </div>

      <!-- Temperature -->
      <div class="group relative">
        <div class="flex items-center gap-1 mb-1">
          <label class="text-sm text-muted">Temperature</label>
          <button
            class="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            @click="startEdit('temperatureUnits')"
          >
            <UIcon name="i-heroicons-pencil" class="w-3 h-3 text-muted hover:text-primary" />
          </button>
        </div>
        <div v-if="editingField === 'temperatureUnits'" class="flex gap-2 w-full relative z-50">
          <USelectMenu
            v-model="editValue"
            :items="['Celsius', 'Fahrenheit']"
            size="sm"
            class="flex-1"
            :search-input="false"
            :ui="{ content: 'w-full min-w-[var(--reka-popper-anchor-width)]' }"
            @update:model-value="saveField"
          />
        </div>
        <p v-else class="font-medium text-lg">{{ modelValue.temperatureUnits }}</p>
      </div>
    </div>

    <!-- Email (Full Row) -->
    <div class="group relative mt-6">
      <div class="flex items-center gap-1 mb-1">
        <label class="text-sm text-muted">Email Address</label>
      </div>
      <p class="font-medium text-lg">{{ email }}</p>
    </div>

    <!-- Row 2 -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-6">
      <!-- Visibility -->
      <div class="group relative">
        <div class="flex items-center gap-1 mb-1">
          <label class="text-sm text-muted">Visibility</label>
          <button
            class="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            @click="startEdit('visibility')"
          >
            <UIcon name="i-heroicons-pencil" class="w-3 h-3 text-muted hover:text-primary" />
          </button>
        </div>
        <div v-if="editingField === 'visibility'" class="flex gap-2 w-full relative z-50">
          <USelectMenu
            v-model="editValue"
            :items="['Private', 'Public', 'Followers Only']"
            size="sm"
            class="flex-1"
            :search-input="false"
            :ui="{ content: 'w-full min-w-[var(--reka-popper-anchor-width)]' }"
            @update:model-value="saveField"
          />
        </div>
        <p v-else class="font-medium text-lg">{{ modelValue.visibility }}</p>
      </div>

      <!-- Sex -->
      <div class="group relative">
        <div class="flex items-center gap-1 mb-1">
          <label class="text-sm text-muted">Sex</label>
          <button
            class="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            @click="startEdit('sex')"
          >
            <UIcon name="i-heroicons-pencil" class="w-3 h-3 text-muted hover:text-primary" />
          </button>
        </div>
        <div v-if="editingField === 'sex'" class="flex gap-2 w-full relative z-50">
          <USelectMenu
            v-model="editValue"
            :items="['Male', 'Female', 'Other']"
            size="sm"
            class="flex-1"
            :search-input="false"
            :ui="{ content: 'w-full min-w-[var(--reka-popper-anchor-width)]' }"
            @update:model-value="saveField"
          />
        </div>
        <p v-else class="font-medium text-lg">{{ modelValue.sex }}</p>
      </div>

      <!-- DOB -->
      <div class="group relative">
        <div class="flex items-center gap-1 mb-1">
          <label class="text-sm text-muted">Date of Birth</label>
          <button
            class="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            @click="startEdit('dob')"
          >
            <UIcon name="i-heroicons-pencil" class="w-3 h-3 text-muted hover:text-primary" />
          </button>
        </div>
        <div v-if="editingField === 'dob'" class="flex gap-2">
          <UInput
            :model-value="editValue ? formatUserDate(editValue, timezone, 'yyyy-MM-dd') : ''"
            type="date"
            size="sm"
            class="w-full"
            autofocus
            @update:model-value="(val) => (editValue = val)"
            @keyup.enter="saveField"
            @keyup.esc="cancelEdit"
          />
          <UButton size="xs" color="primary" variant="solid" label="Save" @click="saveField" />
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-heroicons-x-mark"
            @click="cancelEdit"
          />
        </div>
        <p v-else class="font-medium text-lg">
          {{ modelValue.dob ? formatUserDate(modelValue.dob, timezone, 'MMM d, yyyy') : 'Not set' }}
        </p>
      </div>

      <!-- City -->
      <div class="group relative">
        <div class="flex items-center gap-1 mb-1">
          <label class="text-sm text-muted">City</label>
          <button
            class="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            @click="startEdit('city')"
          >
            <UIcon name="i-heroicons-pencil" class="w-3 h-3 text-muted hover:text-primary" />
          </button>
        </div>
        <div v-if="editingField === 'city'" class="flex gap-2">
          <UInput
            v-model="editValue"
            size="sm"
            class="w-full"
            autofocus
            @keyup.enter="saveField"
            @keyup.esc="cancelEdit"
          />
          <UButton size="xs" color="primary" variant="solid" label="Save" @click="saveField" />
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-heroicons-x-mark"
            @click="cancelEdit"
          />
        </div>
        <p v-else class="font-medium text-lg">{{ modelValue.city }}</p>
      </div>

      <!-- State -->
      <div class="group relative">
        <div class="flex items-center gap-1 mb-1">
          <label class="text-sm text-muted">State/Province</label>
          <button
            class="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            @click="startEdit('state')"
          >
            <UIcon name="i-heroicons-pencil" class="w-3 h-3 text-muted hover:text-primary" />
          </button>
        </div>
        <div v-if="editingField === 'state'" class="flex gap-2">
          <UInput
            v-model="editValue"
            size="sm"
            class="w-full"
            autofocus
            @keyup.enter="saveField"
            @keyup.esc="cancelEdit"
          />
          <UButton size="xs" color="primary" variant="solid" label="Save" @click="saveField" />
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-heroicons-x-mark"
            @click="cancelEdit"
          />
        </div>
        <p v-else class="font-medium text-lg">{{ modelValue.state }}</p>
      </div>

      <!-- Country -->
      <div class="group relative">
        <div class="flex items-center gap-1 mb-1">
          <label class="text-sm text-muted">Country</label>
          <button
            class="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            @click="startEdit('country')"
          >
            <UIcon name="i-heroicons-pencil" class="w-3 h-3 text-muted hover:text-primary" />
          </button>
        </div>
        <div v-if="editingField === 'country'" class="flex gap-2 w-full relative z-50">
          <USelectMenu
            v-model="countryModel"
            :items="countriesWithLabel"
            option-attribute="label"
            :search-attributes="['name', 'code']"
            size="sm"
            class="flex-1"
            searchable
            searchable-placeholder="Search country..."
            autofocus
            :ui="{ content: 'w-full min-w-[var(--reka-popper-anchor-width)]' }"
            @update:model-value="saveField"
          />
        </div>
        <p v-else class="font-medium text-lg flex items-center gap-2">
          <span v-if="countries.find((c) => c.code === modelValue.country)">{{
            countries.find((c) => c.code === modelValue.country)?.flag
          }}</span>
          <span>{{
            countries.find((c) => c.code === modelValue.country)?.name || modelValue.country
          }}</span>
        </p>
      </div>
      <!-- Currency -->
      <div class="group relative">
        <div class="flex items-center gap-1 mb-1">
          <label class="text-sm text-muted">Currency</label>
          <button
            class="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            @click="startEdit('currencyPreference')"
          >
            <UIcon name="i-heroicons-pencil" class="w-3 h-3 text-muted hover:text-primary" />
          </button>
        </div>
        <div v-if="editingField === 'currencyPreference'" class="flex gap-2 w-full relative z-50">
          <USelectMenu
            v-model="currencyModel"
            :items="currencyOptions"
            option-attribute="label"
            :search-attributes="['label', 'code']"
            size="sm"
            class="flex-1"
            searchable
            searchable-placeholder="Search currency..."
            autofocus
            :ui="{ content: 'w-full min-w-[var(--reka-popper-anchor-width)]' }"
            @update:model-value="saveField"
          />
        </div>
        <div v-else class="space-y-1">
          <p class="font-medium text-lg">
            {{
              modelValue.currencyPreference
                ? getCurrencyLabel(modelValue.currencyPreference)
                : 'Auto (Based on location)'
            }}
          </p>
          <p class="text-xs text-gray-500 dark:text-gray-400">In use: {{ currentCurrencyLabel }}</p>
        </div>
      </div>
      <!-- Timezone -->
      <div class="lg:col-span-2 group relative">
        <div class="flex items-center gap-1 mb-1">
          <label class="text-sm text-muted">Timezone</label>
          <button
            class="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            @click="startEdit('timezone')"
          >
            <UIcon name="i-heroicons-pencil" class="w-3 h-3 text-muted hover:text-primary" />
          </button>
        </div>
        <div v-if="editingField === 'timezone'" class="flex gap-2 w-full relative z-50">
          <USelectMenu
            v-model="editValue"
            :items="timezones"
            size="sm"
            class="flex-1"
            searchable
            placeholder="Select timezone"
            :ui="{ content: 'w-full min-w-[var(--reka-popper-anchor-width)]' }"
          />
          <UButton
            size="xs"
            color="primary"
            variant="ghost"
            icon="i-heroicons-check"
            @click="saveField"
          />
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-heroicons-x-mark"
            @click="cancelEdit"
          />
        </div>
        <p v-else class="font-medium text-lg">{{ modelValue.timezone }}</p>
      </div>
    </div>

    <!-- Autodetect Confirmation Modal -->
    <UModal
      v-model:open="showConfirmModal"
      title="Confirm Profile Updates"
      description="We found differences between your current profile and your connected apps. Review the changes below:"
    >
      <template #body>
        <ul
          class="divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-md"
        >
          <li v-for="(value, key) in pendingDiffs" :key="key" class="p-3 text-sm">
            <div
              class="flex items-center justify-between"
              :class="{ 'mb-2': key === 'sportSettings' }"
            >
              <span class="font-medium text-gray-700 dark:text-gray-200 capitalize">
                {{ formatFieldName(key) }}
              </span>
              <div v-if="key !== 'sportSettings'" class="flex items-center gap-3">
                <div class="text-right">
                  <span class="block text-xs text-gray-500 line-through mr-2">
                    {{ formatValue(key, modelValue[key]) }}
                  </span>
                </div>
                <div class="text-right font-semibold text-primary">
                  {{ formatValue(key, value) }}
                </div>
              </div>
            </div>

            <!-- Detailed Sport Settings List -->
            <div v-if="key === 'sportSettings' && Array.isArray(value)" class="pl-4 space-y-2">
              <div
                v-for="sport in value"
                :key="sport.externalId"
                class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
              >
                <UIcon :name="getSportIcon(sport.types)" class="w-3 h-3" />
                <span class="font-medium text-gray-700 dark:text-gray-300">{{
                  sport.types.join(', ')
                }}</span>
                <span v-if="sport.ftp" class="ml-auto">{{ sport.ftp }}W</span>
                <span v-if="sport.lthr" :class="{ 'ml-auto': !sport.ftp }"
                  >{{ sport.lthr }}bpm</span
                >
              </div>
            </div>
          </li>
        </ul>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="showConfirmModal = false"
            >Cancel</UButton
          >
          <UButton color="primary" @click="confirmAutodetect">Apply Changes</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
  import { countries } from '~/utils/countries'
  import { ACCEPTED_CURRENCIES, getCurrencyLabel, resolveCurrencyContext } from '~/utils/currency'
  const props = defineProps<{
    modelValue: any
    email: string
  }>()

  const emit = defineEmits(['update:modelValue', 'autodetect'])
  const { formatUserDate, timezone } = useFormat()

  const editingField = ref<string | null>(null)
  const editValue = ref<any>(null)

  const timezones = Intl.supportedValuesOf('timeZone')
  const autodetecting = ref(false)
  const toast = useToast()

  const countryModel = computed({
    get: () => countriesWithLabel.value.find((c) => c.code === editValue.value),
    set: (val: any) => {
      editValue.value = val?.code
    }
  })

  const currencyOptions = computed(() => [
    { code: '', label: 'Auto (Based on location)' },
    ...ACCEPTED_CURRENCIES
  ])

  const currencyModel = computed({
    get: () => {
      const current = editValue.value ? editValue.value.toString() : ''
      return currencyOptions.value.find((c) => c.code === current)
    },
    set: (val: any) => {
      editValue.value = val?.code || ''
    }
  })

  const currentCurrencyLabel = computed(() => {
    const resolved = resolveCurrencyContext({
      preferredCurrency: props.modelValue.currencyPreference,
      country: props.modelValue.country,
      profileTimezone: props.modelValue.timezone,
      browserTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: typeof navigator !== 'undefined' ? navigator.language : null
    })

    return `${resolved.currency} - ${getCurrencyLabel(resolved.currency)}`
  })

  const countriesWithLabel = computed(() =>
    countries.map((c) => ({
      ...c,
      label: `${c.flag} ${c.name}`
    }))
  )

  // Confirmation Modal State
  const showConfirmModal = ref(false)
  const pendingDiffs = ref<any>({})
  const pendingDetectedProfile = ref<any>({})

  function getSportIcon(types: string[]) {
    if (types.includes('Run') || types.includes('VirtualRun')) return 'i-lucide-footprints'
    if (types.includes('Ride') || types.includes('VirtualRide')) return 'i-lucide-bike'
    if (types.includes('Swim')) return 'i-lucide-waves'
    return 'i-lucide-award'
  }

  async function autodetectProfile() {
    autodetecting.value = true
    try {
      const response: any = await $fetch('/api/profile/autodetect', {
        method: 'POST'
      })

      if (response.success && response.diff && Object.keys(response.diff).length > 0) {
        // Filter out restingHr, ftp, maxHr, and lthr from diffs as they're handled via wellness data or sport settings
        const { restingHr, ftp, maxHr, lthr, ...otherDiffs } = response.diff
        pendingDiffs.value = otherDiffs

        // Also filter from detected profile to avoid merging deprecated fields back
        const { restingHr: _r, ftp: _f, maxHr: _m, lthr: _l, ...otherDetected } = response.detected
        pendingDetectedProfile.value = otherDetected

        if (Object.keys(pendingDiffs.value).length > 0) {
          showConfirmModal.value = true
        } else {
          toast.add({
            title: 'No Updates Found',
            description: 'Your profile is already in sync with connected apps.',
            color: 'neutral'
          })
        }
      } else {
        toast.add({
          title: 'No Updates Found',
          description: response.message || 'Your profile is already in sync with connected apps.',
          color: 'neutral'
        })
      }
    } catch (error: any) {
      toast.add({
        title: 'Autodetect Failed',
        description: error.message || 'Failed to sync with apps.',
        color: 'error'
      })
    } finally {
      autodetecting.value = false
    }
  }

  function confirmAutodetect() {
    // Merge pending diffs into modelValue
    const newProfile = { ...props.modelValue, ...pendingDiffs.value }

    // Emit updates to parent
    emit('update:modelValue', newProfile)

    // Emit event for parent to handle other updates (like zones)
    emit('autodetect', pendingDetectedProfile.value)

    toast.add({
      title: 'Profile Updated',
      description: `Updated ${Object.keys(pendingDiffs.value).length} fields from connected apps.`,
      color: 'success'
    })

    showConfirmModal.value = false
  }

  function formatFieldName(key: string | number) {
    const k = String(key)
    if (k === 'hrZones') return 'Heart Rate Zones'
    if (k === 'powerZones') return 'Power Zones'
    if (k === 'sportSettings') return 'Sport Specific Settings'
    return k.charAt(0).toUpperCase() + k.slice(1).replace(/([A-Z])/g, ' $1')
  }

  function formatValue(key: string | number, value: any) {
    if (value === null || value === undefined) return 'Not set'
    if (key === 'hrZones' || key === 'powerZones') {
      return `${(value as any[]).length} zones`
    }
    if (key === 'sportSettings') {
      const types = (value as any[]).flatMap((s) => s.types).filter(Boolean)
      const uniqueTypes = [...new Set(types)].slice(0, 3)
      const remainder = types.length - uniqueTypes.length

      let label = uniqueTypes.join(', ')
      if (remainder > 0) label += ` +${remainder} more`

      return `${(value as any[]).length} sports (${label})`
    }
    return value
  }

  function startEdit(field: string) {
    editingField.value = field
    editValue.value = props.modelValue[field]
  }

  // Watch for changes to editValue
  // watch(editValue, (newVal) => {
  //   console.log('editValue changed to:', newVal)
  // })

  function saveField() {
    if (editingField.value) {
      let newValue = editValue.value === '' ? null : editValue.value

      // Coerce numeric fields
      const numericFields = ['weight', 'height']
      if (numericFields.includes(editingField.value) && newValue !== null) {
        const num = Number(newValue)
        newValue = isNaN(num) ? null : num
      }

      emit('update:modelValue', {
        ...props.modelValue,
        [editingField.value]: newValue
      })
      editingField.value = null
    }
  }

  function cancelEdit() {
    editingField.value = null
    editValue.value = null
  }
</script>

<style scoped>
  .animate-fade-in {
    animation: fadeIn 0.2s ease-in-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(5px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
