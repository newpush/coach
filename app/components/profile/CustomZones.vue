<template>
  <div class="space-y-6 animate-fade-in">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold flex items-center gap-2">
        <UIcon name="i-heroicons-chart-bar" class="w-5 h-5 text-primary" />
        Custom Zones
      </h2>
      <UButton variant="soft" size="sm" icon="i-heroicons-plus">Add Zone System</UButton>
    </div>
    
    <div class="space-y-4">
      <!-- Heart Rate Zones -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-medium">Heart Rate Zones</h3>
            <UButton icon="i-heroicons-pencil" color="neutral" variant="ghost" size="xs" @click="editingZones = 'hr'" />
          </div>
        </template>
        <div class="space-y-2">
          <template v-if="editingZones === 'hr'">
              <div v-for="(zone, index) in localHrZones" :key="index" class="flex items-center gap-2 py-1">
                <span class="text-muted w-24 text-sm">{{ zone.name }}</span>
                <UInput v-model="zone.min" type="number" size="xs" class="w-20" />
                <span class="text-sm text-muted">-</span>
                <UInput v-model="zone.max" type="number" size="xs" class="w-20" />
                <span class="text-sm text-muted">bpm</span>
              </div>
              <div class="flex justify-end gap-2 mt-2">
                  <UButton size="xs" color="neutral" variant="ghost" @click="editingZones = null">Cancel</UButton>
                  <UButton size="xs" color="primary" @click="saveZones('hr')">Save</UButton>
              </div>
          </template>
          <template v-else>
              <div v-for="(zone, index) in localHrZones" :key="index" class="flex items-center justify-between text-sm py-1 border-b dark:border-gray-700 last:border-0">
                <span class="text-muted">{{ zone.name }}</span>
                <span class="font-medium">{{ zone.min }}-{{ zone.max }} bpm</span>
              </div>
          </template>
        </div>
      </UCard>
      
      <!-- Power Zones -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-medium">Power Zones (Cycling)</h3>
            <UButton icon="i-heroicons-pencil" color="neutral" variant="ghost" size="xs" @click="editingZones = 'power'" />
          </div>
        </template>
        <div class="space-y-2">
          <template v-if="editingZones === 'power'">
              <div v-for="(zone, index) in localPowerZones" :key="index" class="flex items-center gap-2 py-1">
                <span class="text-muted w-32 text-sm">{{ zone.name }}</span>
                <template v-if="index === 0">
                    <span class="text-sm text-muted"><</span>
                    <UInput v-model="zone.max" type="number" size="xs" class="w-20" />
                </template>
                  <template v-else-if="index === localPowerZones.length - 1">
                    <span class="text-sm text-muted">></span>
                    <UInput v-model="zone.min" type="number" size="xs" class="w-20" />
                </template>
                <template v-else>
                    <UInput v-model="zone.min" type="number" size="xs" class="w-20" />
                    <span class="text-sm text-muted">-</span>
                    <UInput v-model="zone.max" type="number" size="xs" class="w-20" />
                </template>
                <span class="text-sm text-muted">W</span>
              </div>
              <div class="flex justify-end gap-2 mt-2">
                  <UButton size="xs" color="neutral" variant="ghost" @click="editingZones = null">Cancel</UButton>
                  <UButton size="xs" color="primary" @click="saveZones('power')">Save</UButton>
              </div>
          </template>
          <template v-else>
            <div v-for="(zone, index) in localPowerZones" :key="index" class="flex items-center justify-between text-sm py-1 border-b dark:border-gray-700 last:border-0">
                <span class="text-muted">{{ zone.name }}</span>
                <span class="font-medium">
                    <template v-if="index === 0">< {{ zone.max }} W</template>
                    <template v-else-if="index === localPowerZones.length - 1">> {{ zone.min }} W</template>
                    <template v-else>{{ zone.min }}-{{ zone.max }} W</template>
                </span>
              </div>
          </template>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  hrZones: any[]
  powerZones: any[]
}>()

const emit = defineEmits(['update:hrZones', 'update:powerZones'])

const editingZones = ref<string | null>(null)
const localHrZones = ref<any[]>([])
const localPowerZones = ref<any[]>([])

// Initialize local state
watchEffect(() => {
  localHrZones.value = JSON.parse(JSON.stringify(props.hrZones))
  localPowerZones.value = JSON.parse(JSON.stringify(props.powerZones))
})

function saveZones(type: string) {
  if (type === 'hr') {
    emit('update:hrZones', localHrZones.value)
  } else if (type === 'power') {
    emit('update:powerZones', localPowerZones.value)
  }
  editingZones.value = null
}
</script>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.2s ease-in-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>