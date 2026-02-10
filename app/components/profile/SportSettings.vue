<template>
  <div class="space-y-6 animate-fade-in">
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">
              Configure Sports
            </h3>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Manage thresholds and zones for specific activity types.
            </p>
          </div>
          <div class="flex gap-2">
            <UButton
              icon="i-heroicons-arrow-path"
              size="sm"
              variant="soft"
              color="primary"
              :loading="autodetecting"
              label="Auto-detect"
              @click="autodetectProfile"
            />
            <UButton
              icon="i-lucide-plus"
              size="sm"
              variant="soft"
              color="primary"
              label="Add Sport"
              @click="openAddModal"
            />
          </div>
        </div>
      </template>

      <!-- Empty State -->
      <div
        v-if="!settings || settings.length === 0"
        class="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-b-lg border-t border-gray-200 dark:border-gray-800"
      >
        <div
          class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 mb-4"
        >
          <UIcon name="i-lucide-award" class="w-8 h-8 text-gray-400" />
        </div>
        <h3 class="text-lg font-medium text-gray-900 dark:text-white">No Sport Settings Found</h3>
        <p class="text-gray-500 mt-2 max-w-sm mx-auto mb-6">
          Connect to Intervals.icu to sync your profile or add a sport manually.
        </p>
        <UButton icon="i-lucide-plus" size="md" color="primary" @click="openAddModal">
          Add Your First Sport
        </UButton>
      </div>

      <!-- Sport List -->
      <div v-else>
        <UAccordion
          v-model="openItems"
          :items="accordionItems"
          multiple
          :ui="{ trigger: 'px-4 sm:px-6' }"
        >
          <template #sport-item="{ item, index }">
            <div class="p-4 space-y-8">
              <!-- Header Actions -->
              <div
                class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6"
              >
                <div v-if="editingIndex === index" class="w-full sm:flex-1">
                  <UFormField label="Profile Name" name="name">
                    <UInput
                      v-model="editForm.name"
                      placeholder="e.g. Road Cycling"
                      size="xs"
                      class="w-full"
                      :disabled="item.content.isDefault"
                    />
                  </UFormField>
                </div>
                <div v-else class="flex-1">
                  <h4
                    v-if="item.content.name"
                    class="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2"
                  >
                    {{ item.content.name }}
                    <UBadge v-if="item.content.isDefault" color="primary" variant="subtle" size="xs"
                      >Default</UBadge
                    >
                  </h4>
                </div>
                <div class="flex gap-2 shrink-0 self-end sm:self-auto">
                  <template v-if="editingIndex !== index">
                    <UButton
                      v-if="!item.content.isDefault"
                      icon="i-lucide-trash-2"
                      size="xs"
                      variant="ghost"
                      color="error"
                      @click="deleteSport(index)"
                    >
                      Delete
                    </UButton>

                    <UDropdownMenu
                      v-if="settings.length > 1"
                      :items="getCopyOptions(index)"
                      :content="{ align: 'end' }"
                    >
                      <UButton icon="i-lucide-copy" size="xs" variant="ghost" color="neutral">
                        Copy from
                      </UButton>
                    </UDropdownMenu>

                    <UButton
                      icon="i-lucide-pencil"
                      size="xs"
                      variant="ghost"
                      color="primary"
                      @click="startEdit(index, item.content)"
                    >
                      Edit Sport
                    </UButton>
                  </template>
                  <div v-else class="flex gap-2">
                    <UButton
                      icon="i-lucide-x"
                      size="xs"
                      variant="ghost"
                      color="neutral"
                      @click="cancelEdit"
                    >
                      Cancel
                    </UButton>
                    <UButton
                      icon="i-lucide-check"
                      size="xs"
                      variant="solid"
                      color="primary"
                      @click="saveEdit(index)"
                    >
                      Save Changes
                    </UButton>
                  </div>
                </div>
              </div>

              <!-- Activity Types (Edit mode only) -->
              <section v-if="editingIndex === index && !item.content.isDefault" class="space-y-4">
                <UFormField label="Assign to Activity Types" name="types" required>
                  <USelectMenu
                    v-model="editForm.types"
                    :items="availableSports"
                    multiple
                    placeholder="Choose sports..."
                    class="w-full"
                    :ui="{ content: 'w-full min-w-[var(--reka-popper-anchor-width)]' }"
                  />
                </UFormField>
              </section>

              <!-- General Settings -->
              <section class="space-y-4">
                <h4
                  class="text-sm font-medium text-gray-500 uppercase tracking-wider border-b pb-2 dark:border-gray-800"
                >
                  General
                </h4>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <!-- Warmup -->
                  <div class="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <template v-if="editingIndex === index">
                      <UFormField
                        label="Warmup"
                        help="Auto-shrink warmup segments to this duration (min)."
                      >
                        <UInput
                          v-model.number="editForm.warmupTime"
                          type="number"
                          size="xs"
                          class="w-full"
                        />
                      </UFormField>
                    </template>
                    <template v-else>
                      <div class="text-xs text-gray-500 uppercase tracking-wider mb-1">Warmup</div>
                      <div class="text-xl font-semibold h-7">
                        {{ item.content.warmupTime || '-' }}
                        <span v-if="item.content.warmupTime" class="text-xs text-gray-400">min</span>
                      </div>
                      <div class="text-[10px] text-gray-400 mt-1">Default duration</div>
                    </template>
                  </div>

                  <!-- Cooldown -->
                  <div class="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <template v-if="editingIndex === index">
                      <UFormField
                        label="Cooldown"
                        help="Auto-shrink cooldown segments to this duration (min)."
                      >
                        <UInput
                          v-model.number="editForm.cooldownTime"
                          type="number"
                          size="xs"
                          class="w-full"
                        />
                      </UFormField>
                    </template>
                    <template v-else>
                      <div class="text-xs text-gray-500 uppercase tracking-wider mb-1">
                        Cooldown
                      </div>
                      <div class="text-xl font-semibold h-7">
                        {{ item.content.cooldownTime || '-' }}
                        <span v-if="item.content.cooldownTime" class="text-xs text-gray-400"
                          >min</span
                        >
                      </div>
                      <div class="text-[10px] text-gray-400 mt-1">Default duration</div>
                    </template>
                  </div>

                  <!-- Load Priority -->
                  <div class="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg md:col-span-2">
                    <template v-if="editingIndex === index">
                      <UFormField
                        label="Load Priority"
                        help="Order of preference for calculating training load."
                      >
                        <USelectMenu
                          v-model="editForm.loadPreference"
                          :items="LOAD_PREFERENCES"
                          size="xs"
                          class="w-full"
                        />
                      </UFormField>
                    </template>
                    <template v-else>
                      <div class="text-xs text-gray-500 uppercase tracking-wider mb-1">
                        Load Priority
                      </div>
                      <div class="text-sm font-medium h-7 flex items-center">
                        {{ item.content.loadPreference || '-' }}
                      </div>
                      <div class="text-[10px] text-gray-400 mt-1">Load calculation order</div>
                    </template>
                  </div>
                </div>
              </section>

              <!-- Power Settings -->
              <section class="space-y-4">
                <h4
                  class="text-sm font-medium text-gray-500 uppercase tracking-wider border-b pb-2 dark:border-gray-800 flex items-center gap-2"
                >
                  <UIcon name="i-lucide-zap" class="w-4 h-4 text-yellow-500" />
                  Power Settings
                </h4>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <!-- FTP -->
                  <div class="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <template v-if="editingIndex === index">
                      <UFormField label="FTP" help="Functional Threshold Power (Watts).">
                        <UInput
                          v-model.number="editForm.ftp"
                          type="number"
                          size="xs"
                          class="w-full"
                          @update:model-value="handleThresholdChange('power', 'edit')"
                        />
                      </UFormField>
                    </template>
                    <template v-else>
                      <div class="text-xs text-gray-500 uppercase tracking-wider mb-1">FTP</div>
                      <div class="text-xl font-semibold h-7">
                        {{ item.content.ftp || '-' }}
                        <span v-if="item.content.ftp" class="text-xs text-gray-400">W</span>
                      </div>
                      <div class="text-[10px] text-gray-400 mt-1">Functional Threshold Power</div>
                    </template>
                  </div>

                  <!-- eFTP -->
                  <div class="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <template v-if="editingIndex === index">
                      <UFormField label="eFTP" help="Estimated FTP from recent efforts.">
                        <UInput
                          v-model.number="editForm.eFtp"
                          type="number"
                          size="xs"
                          class="w-full"
                        />
                      </UFormField>
                    </template>
                    <template v-else>
                      <div class="text-xs text-gray-500 uppercase tracking-wider mb-1">eFTP</div>
                      <div class="text-xl font-semibold h-7">
                        {{ item.content.eFtp || '-' }}
                        <span v-if="item.content.eFtp" class="text-xs text-gray-400">W</span>
                      </div>
                      <div class="text-[10px] text-gray-400 mt-1">Estimated FTP</div>
                    </template>
                  </div>

                  <!-- Indoor FTP -->
                  <div class="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <template v-if="editingIndex === index">
                      <UFormField label="Indoor FTP" help="Override for indoor workouts.">
                        <UInput
                          v-model.number="editForm.indoorFtp"
                          type="number"
                          size="xs"
                          class="w-full"
                        />
                      </UFormField>
                    </template>
                    <template v-else>
                      <div class="text-xs text-gray-500 uppercase tracking-wider mb-1">
                        Indoor FTP
                      </div>
                      <div class="text-xl font-semibold h-7">
                        {{ item.content.indoorFtp || '-' }}
                        <span v-if="item.content.indoorFtp" class="text-xs text-gray-400">W</span>
                      </div>
                      <div class="text-[10px] text-gray-400 mt-1">Indoor override</div>
                    </template>
                  </div>

                  <!-- W' -->
                  <div class="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <template v-if="editingIndex === index">
                      <UFormField label="W' (Joules)" help="Anaerobic work capacity above FTP.">
                        <UInput
                          v-model.number="editForm.wPrime"
                          type="number"
                          size="xs"
                          class="w-full"
                        />
                      </UFormField>
                    </template>
                    <template v-else>
                      <div class="text-xs text-gray-500 uppercase tracking-wider mb-1">W'</div>
                      <div class="text-xl font-semibold h-7">
                        {{ item.content.wPrime ? (item.content.wPrime / 1000).toFixed(1) : '-' }}
                        <span v-if="item.content.wPrime" class="text-xs text-gray-400">kJ</span>
                      </div>
                      <div class="text-[10px] text-gray-400 mt-1">Anaerobic capacity</div>
                    </template>
                  </div>

                  <!-- Pmax -->
                  <div
                    v-if="editingIndex === index || item.content.pMax"
                    class="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                  >
                    <template v-if="editingIndex === index">
                      <UFormField label="Pmax" help="Maximum power for 1 second.">
                        <UInput
                          v-model.number="editForm.pMax"
                          type="number"
                          size="xs"
                          class="w-full"
                        />
                      </UFormField>
                    </template>
                    <template v-else>
                      <div class="text-xs text-gray-500 uppercase tracking-wider mb-1">Pmax</div>
                      <div class="text-xl font-semibold h-7">
                        {{ item.content.pMax || '-' }}
                        <span v-if="item.content.pMax" class="text-xs text-gray-400">W</span>
                      </div>
                      <div class="text-[10px] text-gray-400 mt-1">Max power (1s)</div>
                    </template>
                  </div>

                  <!-- Power Spikes -->
                  <div
                    v-if="editingIndex === index || item.content.powerSpikeThreshold"
                    class="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                  >
                    <template v-if="editingIndex === index">
                      <UFormField label="Spikes %" help="Filter data exceeding FTP by this %.">
                        <UInput
                          v-model.number="editForm.powerSpikeThreshold"
                          type="number"
                          size="xs"
                          class="w-full"
                        />
                      </UFormField>
                    </template>
                    <template v-else>
                      <div class="text-xs text-gray-500 uppercase tracking-wider mb-1">
                        Power Spikes
                      </div>
                      <div class="text-xl font-semibold h-7">
                        {{ item.content.powerSpikeThreshold || '-' }}
                        <span v-if="item.content.powerSpikeThreshold" class="text-xs text-gray-400"
                          >%</span
                        >
                      </div>
                      <div class="text-[10px] text-gray-400 mt-1">Spike threshold</div>
                    </template>
                  </div>
                </div>

                <!-- Power Zones Editor -->
                <div v-if="editingIndex === index" class="mt-4">
                  <ProfileZoneEditor
                    v-model="editForm.powerZones"
                    title="Power Zones"
                    units="W"
                    icon="i-lucide-zap"
                    icon-color="text-yellow-500"
                  >
                    <template #actions>
                      <UButton size="xs" variant="soft" @click="recalculateZones('power', 'edit')"
                        >Calculate Default</UButton
                      >
                    </template>
                  </ProfileZoneEditor>
                </div>
                <div
                  v-else-if="item.content.powerZones?.length"
                  class="p-4 bg-gray-50/50 dark:bg-gray-800/20 rounded-xl"
                >
                  <div class="text-xs font-bold uppercase text-gray-400 mb-3">Power Zones</div>
                  <div class="space-y-2">
                    <div
                      v-for="(zone, zIdx) in item.content.powerZones"
                      :key="zIdx"
                      class="p-2 border dark:border-gray-800 rounded text-xs flex justify-between bg-white dark:bg-gray-900"
                    >
                      <span class="text-muted truncate mr-1">{{ zone.name }}</span>
                      <span class="font-mono font-bold"
                        >{{ zone.min }}-{{ zone.max
                        }}<span class="text-[10px] ml-0.5 text-gray-400">W</span></span
                      >
                    </div>
                  </div>
                </div>
              </section>

              <!-- Heart Rate Settings -->
              <section class="space-y-4">
                <h4
                  class="text-sm font-medium text-gray-500 uppercase tracking-wider border-b pb-2 dark:border-gray-800 flex items-center gap-2"
                >
                  <UIcon name="i-lucide-heart" class="w-4 h-4 text-red-500" />
                  Heart Rate Settings
                </h4>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <!-- LTHR -->
                  <div class="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <template v-if="editingIndex === index">
                      <UFormField label="LTHR" help="Lactate Threshold HR (bpm).">
                        <UInput
                          v-model.number="editForm.lthr"
                          type="number"
                          size="xs"
                          class="w-full"
                          @update:model-value="handleThresholdChange('hr', 'edit')"
                        />
                      </UFormField>
                    </template>
                    <template v-else>
                      <div class="text-xs text-gray-500 uppercase tracking-wider mb-1">LTHR</div>
                      <div class="text-xl font-semibold h-7">
                        {{ item.content.lthr || '-' }}
                        <span v-if="item.content.lthr" class="text-xs text-gray-400">bpm</span>
                      </div>
                      <div class="text-[10px] text-gray-400 mt-1">Lactate Threshold HR</div>
                    </template>
                  </div>

                  <!-- Max HR -->
                  <div class="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <template v-if="editingIndex === index">
                      <UFormField label="Max HR" help="Maximum Heart Rate.">
                        <UInput
                          v-model.number="editForm.maxHr"
                          type="number"
                          size="xs"
                          class="w-full"
                          @update:model-value="handleThresholdChange('hr', 'edit')"
                        />
                      </UFormField>
                    </template>
                    <template v-else>
                      <div class="text-xs text-gray-500 uppercase tracking-wider mb-1">Max HR</div>
                      <div class="text-xl font-semibold h-7">
                        {{ item.content.maxHr || '-' }}
                        <span v-if="item.content.maxHr" class="text-xs text-gray-400">bpm</span>
                      </div>
                      <div class="text-[10px] text-gray-400 mt-1">Maximum Heart Rate</div>
                    </template>
                  </div>

                  <!-- Resting HR -->
                  <div
                    v-if="editingIndex === index || item.content.restingHr"
                    class="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                  >
                    <template v-if="editingIndex === index">
                      <UFormField label="Resting HR" help="Activity-specific resting HR.">
                        <UInput
                          v-model.number="editForm.restingHr"
                          type="number"
                          size="xs"
                          class="w-full"
                        />
                      </UFormField>
                    </template>
                    <template v-else>
                      <div class="text-xs text-gray-500 uppercase tracking-wider mb-1">
                        Resting HR
                      </div>
                      <div class="text-xl font-semibold h-7">
                        {{ item.content.restingHr || '-' }}
                        <span v-if="item.content.restingHr" class="text-xs text-gray-400"
                          >bpm</span
                        >
                      </div>
                      <div class="text-[10px] text-gray-400 mt-1">Resting Heart Rate</div>
                    </template>
                  </div>

                  <!-- HR Load Type -->
                  <div class="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <template v-if="editingIndex === index">
                      <UFormField label="Load Type" help="Model for HR training load.">
                        <USelectMenu
                          v-model="editForm.hrLoadType"
                          :items="['HRSS', 'AVG_HR', 'HR_ZONES']"
                          size="xs"
                          class="w-full"
                        />
                      </UFormField>
                    </template>
                    <template v-else>
                      <div class="text-xs text-gray-500 uppercase tracking-wider mb-1">
                        Load Type
                      </div>
                      <div class="text-sm font-medium h-7 flex items-center">
                        {{ item.content.hrLoadType || '-' }}
                      </div>
                      <div class="text-[10px] text-gray-400 mt-1">Load calculation model</div>
                    </template>
                  </div>
                </div>

                <!-- HR Zones Editor -->
                <div v-if="editingIndex === index" class="mt-4">
                  <ProfileZoneEditor
                    v-model="editForm.hrZones"
                    title="Heart Rate Zones"
                    units="bpm"
                    icon="i-lucide-heart"
                    icon-color="text-red-500"
                  >
                    <template #actions>
                      <UButton size="xs" variant="soft" @click="recalculateZones('hr', 'edit')"
                        >Calculate Default</UButton
                      >
                    </template>
                  </ProfileZoneEditor>
                </div>
                <div
                  v-else-if="item.content.hrZones?.length"
                  class="p-4 bg-gray-50/50 dark:bg-gray-800/20 rounded-xl"
                >
                  <div class="text-xs font-bold uppercase text-gray-400 mb-3">Heart Rate Zones</div>
                  <div class="space-y-2">
                    <div
                      v-for="(zone, zIdx) in item.content.hrZones"
                      :key="zIdx"
                      class="p-2 border dark:border-gray-800 rounded text-xs flex justify-between bg-white dark:bg-gray-900"
                    >
                      <span class="text-muted truncate mr-1">{{ zone.name }}</span>
                      <span class="font-mono font-bold"
                        >{{ zone.min }}-{{ zone.max
                        }}<span class="text-[10px] ml-0.5 text-gray-400">bpm</span></span
                      >
                    </div>
                  </div>
                </div>
              </section>

              <!-- Pace Settings -->
              <section class="space-y-4">
                <h4
                  class="text-sm font-medium text-gray-500 uppercase tracking-wider border-b pb-2 dark:border-gray-800"
                >
                  Pace
                </h4>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div class="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <template v-if="editingIndex === index">
                      <UFormField label="Threshold Pace" help="m/s (e.g. 4.0 = 4:10/km).">
                        <UInput
                          v-model.number="editForm.thresholdPace"
                          type="number"
                          step="0.01"
                          size="xs"
                          class="w-full"
                        />
                      </UFormField>
                    </template>
                    <template v-else>
                      <div class="text-xs text-gray-500 uppercase tracking-wider mb-1">
                        Threshold Pace
                      </div>
                      <div class="text-xl font-semibold h-7">
                        {{ formatPace(item.content.thresholdPace) }}
                        <span v-if="item.content.thresholdPace" class="text-xs text-gray-400"
                          >/km</span
                        >
                      </div>
                    </template>
                  </div>
                </div>
              </section>
            </div>
          </template>
        </UAccordion>
      </div>
    </UCard>

    <!-- Autodetect Confirmation Modal -->
    <UModal
      v-model:open="showConfirmModal"
      title="Confirm Sport Profile Updates"
      description="We found changes in your connected apps (like Intervals.icu) for your sport profiles. Review them below:"
    >
      <template #body>
        <div class="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
          <ul class="divide-y divide-gray-200 dark:divide-gray-700">
            <li
              v-for="(sport, idx) in pendingDiffs.sportSettings"
              :key="idx"
              class="p-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              <div class="flex items-center gap-2 mb-2">
                <UIcon :name="getIconForTypes(sport.types)" class="w-4 h-4 text-primary" />
                <span class="font-semibold text-gray-900 dark:text-white">{{
                  sport.name || sport.types.join(', ')
                }}</span>
                <UBadge v-if="!sport.id" color="success" variant="subtle" size="xs" class="ml-auto">
                  New Profile
                </UBadge>
                <UBadge v-else color="warning" variant="subtle" size="xs" class="ml-auto">
                  Updated
                </UBadge>
              </div>

              <div class="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400 pl-6">
                <div v-if="sport.ftp" class="flex justify-between">
                  <span>FTP:</span>
                  <span class="font-mono font-medium text-gray-900 dark:text-gray-200"
                    >{{ sport.ftp }}W</span
                  >
                </div>
                <div v-if="sport.lthr" class="flex justify-between">
                  <span>LTHR:</span>
                  <span class="font-mono font-medium text-gray-900 dark:text-gray-200"
                    >{{ sport.lthr }}bpm</span
                  >
                </div>
                <div v-if="sport.maxHr" class="flex justify-between">
                  <span>Max HR:</span>
                  <span class="font-mono font-medium text-gray-900 dark:text-gray-200"
                    >{{ sport.maxHr }}bpm</span
                  >
                </div>
                <div v-if="sport.powerZones" class="flex justify-between col-span-2">
                  <span>Power Zones:</span>
                  <span class="font-medium text-primary"
                    >{{ sport.powerZones.length }} zones detected</span
                  >
                </div>
                <div v-if="sport.hrZones" class="flex justify-between col-span-2">
                  <span>HR Zones:</span>
                  <span class="font-medium text-primary"
                    >{{ sport.hrZones.length }} zones detected</span
                  >
                </div>
              </div>
            </li>
          </ul>
        </div>
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

    <!-- Add Sport Slideover -->
    <USlideover
      v-model:open="showAddModal"
      title="Add New Sport Profile"
      description="Configure metrics and thresholds for a specific activity type."
    >
      <template #content>
        <div class="flex-1 overflow-y-auto p-6 bg-white dark:bg-gray-900">
          <UForm :state="addForm" class="space-y-8" @submit="addSport">
            <!-- Activity Types -->
            <section class="space-y-4">
              <h4
                class="text-sm font-medium text-gray-500 uppercase tracking-wider border-b pb-2 dark:border-gray-800"
              >
                General Info
              </h4>
              <UFormField
                label="Profile Name"
                name="name"
                help="Give this settings profile a name (e.g. 'Road Cycling')"
              >
                <UInput v-model="addForm.name" placeholder="e.g. Road Cycling" />
              </UFormField>
              <UFormField
                label="Assign to Activity Types"
                name="types"
                required
                help="Select the activity types this profile applies to."
              >
                <USelectMenu
                  v-model="addForm.types"
                  :items="availableSports"
                  multiple
                  placeholder="Choose sports..."
                  class="w-full"
                  :ui="{ content: 'w-full min-w-[var(--reka-popper-anchor-width)]' }"
                />
              </UFormField>
            </section>

            <!-- Power Settings -->
            <section class="space-y-4">
              <div class="flex items-center justify-between border-b pb-2 dark:border-gray-800">
                <h4
                  class="text-sm font-medium text-gray-500 uppercase tracking-wider flex items-center gap-2"
                >
                  <UIcon name="i-lucide-zap" class="w-4 h-4 text-yellow-500" />
                  Power Settings
                </h4>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <UFormField label="FTP (Watts)" name="ftp" help="Functional Threshold Power">
                  <UInput
                    v-model.number="addForm.ftp"
                    type="number"
                    placeholder="e.g. 229"
                    @update:model-value="handleThresholdChange('power', 'add')"
                  />
                </UFormField>
                <UFormField
                  label="Indoor FTP"
                  name="indoorFtp"
                  help="Power target override for indoor sessions"
                >
                  <UInput v-model.number="addForm.indoorFtp" type="number" />
                </UFormField>
              </div>

              <!-- Power Zones (Calculated) -->
              <div class="mt-4">
                <ProfileZoneEditor
                  v-model="addForm.powerZones"
                  title="Power Zones"
                  units="W"
                  icon="i-lucide-zap"
                  icon-color="text-yellow-500"
                >
                  <template #actions>
                    <UButton size="xs" variant="soft" @click="recalculateZones('power', 'add')"
                      >Recalculate</UButton
                    >
                  </template>
                </ProfileZoneEditor>
              </div>
            </section>

            <!-- Heart Rate Settings -->
            <section class="space-y-4">
              <div class="flex items-center justify-between border-b pb-2 dark:border-gray-800">
                <h4
                  class="text-sm font-medium text-gray-500 uppercase tracking-wider flex items-center gap-2"
                >
                  <UIcon name="i-lucide-heart" class="w-4 h-4 text-red-500" />
                  Heart Rate Settings
                </h4>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <UFormField label="LTHR (bpm)" name="lthr" help="Lactate Threshold HR">
                  <UInput
                    v-model.number="addForm.lthr"
                    type="number"
                    placeholder="e.g. 168"
                    @update:model-value="handleThresholdChange('hr', 'add')"
                  />
                </UFormField>
                <UFormField label="Max HR (bpm)" name="maxHr" help="Maximum Heart Rate">
                  <UInput
                    v-model.number="addForm.maxHr"
                    type="number"
                    placeholder="e.g. 185"
                    @update:model-value="handleThresholdChange('hr', 'add')"
                  />
                </UFormField>
              </div>

              <!-- HR Zones (Calculated) -->
              <div class="mt-4">
                <ProfileZoneEditor
                  v-model="addForm.hrZones"
                  title="Heart Rate Zones"
                  units="bpm"
                  icon="i-lucide-heart"
                  icon-color="text-red-500"
                >
                  <template #actions>
                    <UButton size="xs" variant="soft" @click="recalculateZones('hr', 'add')"
                      >Recalculate</UButton
                    >
                  </template>
                </ProfileZoneEditor>
              </div>
            </section>

            <!-- Advanced Metrics (Collapsible) -->
            <UAccordion
              :items="[
                {
                  label: 'Advanced Metrics & General',
                  slot: 'advanced',
                  icon: 'i-lucide-settings-2'
                }
              ]"
              size="sm"
            >
              <template #advanced>
                <div class="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6 text-xs">
                  <UFormField
                    label="eFTP (Watts)"
                    name="eFtp"
                    help="Estimated FTP based on your best efforts from activity data."
                  >
                    <UInput v-model.number="addForm.eFtp" type="number" />
                  </UFormField>
                  <UFormField
                    label="Pmax (Watts)"
                    name="pMax"
                    help="The maximum power you can generate for 1 second."
                  >
                    <UInput v-model.number="addForm.pMax" type="number" />
                  </UFormField>
                  <UFormField
                    label="W' (Joules)"
                    name="wPrime"
                    help="Anaerobic work capacity: the total work you can do above FTP."
                  >
                    <UInput v-model.number="addForm.wPrime" type="number" />
                  </UFormField>
                  <UFormField
                    label="Power Spikes %"
                    name="powerSpikeThreshold"
                    help="Data points exceeding FTP by this % will be filtered."
                  >
                    <UInput
                      v-model.number="addForm.powerSpikeThreshold"
                      type="number"
                      placeholder="30"
                    />
                  </UFormField>
                  <UFormField
                    label="Resting HR"
                    name="restingHr"
                    help="Activity-specific resting HR if different from global."
                  >
                    <UInput v-model.number="addForm.restingHr" type="number" />
                  </UFormField>
                  <UFormField
                    label="HR Load Type"
                    name="hrLoadType"
                    help="Model used to calculate HR training load (HRSS is recommended)."
                  >
                    <USelectMenu
                      v-model="addForm.hrLoadType"
                      :items="['HRSS', 'AVG_HR', 'HR_ZONES']"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField
                    label="Threshold Pace"
                    name="thresholdPace"
                    help="Your threshold pace in m/s (used for pace-based load)."
                  >
                    <UInput v-model.number="addForm.thresholdPace" type="number" step="0.01" />
                  </UFormField>
                  <UFormField
                    label="Load Priority"
                    name="loadPreference"
                    help="Which data source to prioritize for training load calculation."
                  >
                    <USelectMenu
                      v-model="addForm.loadPreference"
                      :items="LOAD_PREFERENCES"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField
                    label="Warmup (min)"
                    name="warmupTime"
                    help="Auto-shrink warmup segments to this duration in charts."
                  >
                    <UInput v-model.number="addForm.warmupTime" type="number" />
                  </UFormField>
                  <UFormField
                    label="Cooldown (min)"
                    name="cooldownTime"
                    help="Auto-shrink cooldown segments to this duration in charts."
                  >
                    <UInput v-model.number="addForm.cooldownTime" type="number" />
                  </UFormField>
                </div>
              </template>
            </UAccordion>

            <div
              class="pt-6 flex justify-end gap-3 border-t dark:border-gray-800 sticky bottom-0 bg-white dark:bg-gray-900 pb-2 z-10"
            >
              <UButton color="neutral" variant="ghost" @click="showAddModal = false"
                >Cancel</UButton
              >
              <UButton type="submit" color="primary">Create Sport Profile</UButton>
            </div>
          </UForm>
        </div>
      </template>
    </USlideover>
  </div>
</template>

<script setup lang="ts">
  import { WORKOUT_ICONS } from '~/utils/activity-types'

  const props = defineProps<{
    settings: any[]
    profile?: any
  }>()

  const emit = defineEmits(['update:settings', 'autodetect'])

  const toast = useToast()
  const editingIndex = ref<number | null>(null)
  const editForm = ref<any>({})

  const showAddModal = ref(false)
  const openItems = ref<string[]>(['0']) // Open the first item (Default) by default
  const addForm = ref<any>({
    name: '',
    types: [],
    ftp: null,
    eFtp: null,
    indoorFtp: null,
    wPrime: null,
    eWPrime: null,
    pMax: null,
    ePMax: null,
    powerSpikeThreshold: 30,
    eftpMinDuration: 300,
    lthr: null,
    maxHr: null,
    restingHr: null,
    hrLoadType: 'HRSS',
    thresholdPace: null,
    warmupTime: 10,
    cooldownTime: 10,
    loadPreference: 'POWER_HR_PACE',
    powerZones: [],
    hrZones: []
  })

  // Auto-detect State
  const autodetecting = ref(false)
  const showConfirmModal = ref(false)
  const pendingDiffs = ref<any>({})
  const pendingDetectedProfile = ref<any>({})

  const availableSports = Object.keys(WORKOUT_ICONS).sort()

  const accordionItems = computed(() => {
    // Sort: Default first, then others
    const sorted = [...props.settings].sort((a, b) => {
      if (a.isDefault) return -1
      if (b.isDefault) return 1
      return 0
    })

    return sorted.map((s, i) => ({
      label: s.name || (s.isDefault ? 'Default Profile' : s.types.join(', ')),
      icon: s.isDefault ? 'i-lucide-globe' : getIconForTypes(s.types),
      content: s,
      value: String(i),
      slot: 'sport-item'
    }))
  })

  // Methodology Constants from user request
  const POWER_PCT = [0.55, 0.75, 0.9, 1.05, 1.2, 1.5, 9.99]
  const POWER_NAMES = [
    'Z1 Active Recovery',
    'Z2 Endurance',
    'Z3 Tempo',
    'Z4 Threshold',
    'Z5 VO2 Max',
    'Z6 Anaerobic',
    'Z7 Neuromuscular'
  ]
  const SS_PCT = [0.84, 0.97]

  const HR_PCT = [0.8, 0.89, 0.93, 0.99, 1.02, 1.05, 1.1]
  const HR_NAMES = [
    'Z1 Recovery',
    'Z2 Aerobic',
    'Z3 Tempo',
    'Z4 SubThreshold',
    'Z5 SuperThreshold',
    'Z6 Aerobic Capacity',
    'Z7 Anaerobic'
  ]

  const LOAD_PREFERENCES = [
    'POWER_HR_PACE',
    'POWER_PACE_HR',
    'HR_POWER_PACE',
    'HR_PACE_POWER',
    'PACE_POWER_HR',
    'PACE_HR_POWER'
  ]

  function openAddModal() {
    showAddModal.value = true

    // Pre-fill with user profile defaults if available
    if (props.profile) {
      if (props.profile.ftp) addForm.value.ftp = props.profile.ftp
      if (props.profile.lthr) addForm.value.lthr = props.profile.lthr
      if (props.profile.maxHr) addForm.value.maxHr = props.profile.maxHr
      if (props.profile.restingHr) addForm.value.restingHr = props.profile.restingHr

      // Auto-calculate zones if we have the base metrics
      if (addForm.value.ftp) {
        recalculateZones('power', 'add')
      }
      if (addForm.value.lthr || addForm.value.maxHr) {
        recalculateZones('hr', 'add')
      }
    }
  }

  function startEdit(index: number, content: any) {
    editingIndex.value = index
    // Clone content to editForm to avoid direct mutation
    editForm.value = JSON.parse(JSON.stringify(content))

    // Ensure zones exist
    if (!editForm.value.powerZones) editForm.value.powerZones = []
    if (!editForm.value.hrZones) editForm.value.hrZones = []
    // Ensure name exists
    if (!editForm.value.name)
      editForm.value.name = content.isDefault
        ? 'Default Profile'
        : content.types?.join(', ') || 'Sport Profile'
  }

  function cancelEdit() {
    editingIndex.value = null
    editForm.value = {}
  }

  function saveEdit(index: number) {
    const item = accordionItems.value[index]
    if (!item) return

    // Find the original item in props.settings to update
    const modifiedItem = item.content
    // Map back to original array
    const newSettings = props.settings.map((s) => {
      // Match by ID if exists, or reference equality if simple object
      if (
        s === modifiedItem ||
        (s.id && s.id === modifiedItem.id) ||
        (s.externalId && s.externalId === modifiedItem.externalId)
      ) {
        return { ...s, ...editForm.value }
      }
      return s
    })

    emit('update:settings', newSettings)
    cancelEdit()
  }

  function deleteSport(index: number) {
    const item = accordionItems.value[index]
    if (!item) return

    const itemToDelete = item.content
    if (itemToDelete.isDefault) {
      alert('Cannot delete the default profile.')
      return
    }

    if (confirm('Are you sure you want to remove this sport profile?')) {
      const newSettings = props.settings.filter(
        (s) =>
          s !== itemToDelete &&
          (!s.id || s.id !== itemToDelete.id) &&
          (!s.externalId || s.externalId !== itemToDelete.externalId)
      )
      emit('update:settings', newSettings)
    }
  }

  function handleThresholdChange(type: 'power' | 'hr', mode: 'add' | 'edit') {
    recalculateZones(type, mode)
  }

  function copySettings(targetIndex: number, sourceProfile: any) {
    const item = accordionItems.value[targetIndex]
    if (!item) return

    const targetProfile = item.content

    // Start editing
    editingIndex.value = targetIndex

    // Clone target to editForm first to keep its identity (name/types)
    editForm.value = JSON.parse(JSON.stringify(targetProfile))

    // List of fields to copy (everything except identity and ID)
    const fieldsToCopy = [
      'ftp',
      'eFtp',
      'indoorFtp',
      'wPrime',
      'eWPrime',
      'pMax',
      'ePMax',
      'powerSpikeThreshold',
      'eftpMinDuration',
      'lthr',
      'maxHr',
      'restingHr',
      'hrLoadType',
      'thresholdPace',
      'warmupTime',
      'cooldownTime',
      'loadPreference',
      'powerZones',
      'hrZones'
    ]

    fieldsToCopy.forEach((field) => {
      if (sourceProfile[field] !== undefined) {
        editForm.value[field] = JSON.parse(JSON.stringify(sourceProfile[field]))
      }
    })

    toast.add({
      title: 'Settings Copied',
      description: `Copied settings from ${
        sourceProfile.name || sourceProfile.types?.join(', ') || 'another profile'
      }. Review and save changes.`,
      color: 'primary'
    })
  }

  const getCopyOptions = (index: number) => {
    const item = accordionItems.value[index]
    if (!item) return []
    const currentItem = item.content
    const otherSports = props.settings.filter(
      (s) => s !== currentItem && (s.id !== currentItem.id || !s.id)
    )

    if (otherSports.length === 0) return []

    return [
      otherSports.map((s) => ({
        label: s.name || (s.isDefault ? 'Default Profile' : s.types.join(', ')),
        icon: s.isDefault ? 'i-lucide-globe' : getIconForTypes(s.types),
        onSelect: () => copySettings(index, s)
      }))
    ]
  }

  function recalculateZones(type: 'power' | 'hr', mode: 'add' | 'edit') {
    const form = mode === 'add' ? addForm.value : editForm.value

    if (type === 'power' && form.ftp) {
      const ftp = form.ftp
      const zones = POWER_PCT.map((pct, i) => {
        const prevPct = i === 0 ? 0 : (POWER_PCT[i - 1] ?? 0)
        return {
          name: POWER_NAMES[i],
          min: Math.round(ftp * prevPct) + (i === 0 ? 0 : 1),
          max: pct > 5 ? 2000 : Math.round(ftp * pct)
        }
      })

      // Add Sweet Spot
      if (SS_PCT.length >= 2) {
        zones.push({
          name: 'SS Sweet Spot',
          min: Math.round(ftp * (SS_PCT[0] ?? 0)),
          max: Math.round(ftp * (SS_PCT[1] ?? 0))
        })
      }

      form.powerZones = zones
    }

    if (type === 'hr' && (form.lthr || form.maxHr)) {
      const threshold = form.lthr || (form.maxHr ? Math.round(form.maxHr * 0.85) : 160)
      const maxHr = form.maxHr || Math.round(threshold * 1.1)

      const zones = HR_PCT.map((pct, i) => {
        const prevPct = i === 0 ? 0 : (HR_PCT[i - 1] ?? 0)
        return {
          name: HR_NAMES[i],
          min: Math.round(threshold * prevPct) + (i === 0 ? 0 : 1),
          max: i === HR_PCT.length - 1 ? maxHr : Math.round(threshold * pct)
        }
      })

      form.hrZones = zones
    }
  }

  function addSport() {
    if (!addForm.value.types.length) return

    const newSport = {
      ...addForm.value,
      name: addForm.value.name || addForm.value.types.join(', '),
      externalId: `manual_${Date.now()}`,
      source: 'manual'
    }

    const newSettings = [...props.settings, newSport]
    emit('update:settings', newSettings)

    // Reset
    showAddModal.value = false
    addForm.value = {
      name: '',
      types: [],
      ftp: null,
      eFtp: null,
      indoorFtp: null,
      wPrime: null,
      eWPrime: null,
      pMax: null,
      ePMax: null,
      powerSpikeThreshold: 30,
      eftpMinDuration: 300,
      lthr: null,
      maxHr: null,
      restingHr: null,
      hrLoadType: 'HRSS',
      thresholdPace: null,
      warmupTime: 10,
      cooldownTime: 10,
      loadPreference: 'POWER_HR_PACE',
      powerZones: [],
      hrZones: []
    }
  }

  function getIconForTypes(types: string[]) {
    if (types.includes('Run') || types.includes('VirtualRun')) return 'i-lucide-footprints'
    if (types.includes('Ride') || types.includes('VirtualRide')) return 'i-lucide-bike'
    if (types.includes('Swim')) return 'i-lucide-waves'

    if (types.some((t) => t.toLowerCase().includes('run'))) return 'i-lucide-footprints'
    if (types.some((t) => t.toLowerCase().includes('ride'))) return 'i-lucide-bike'
    if (types.some((t) => t.toLowerCase().includes('swim'))) return 'i-lucide-waves'
    return 'i-lucide-settings-2'
  }

  function formatPace(metersPerSecond: number) {
    if (!metersPerSecond) return '-'
    const secondsPerKm = 1000 / metersPerSecond
    const mins = Math.floor(secondsPerKm / 60)
    const secs = Math.round(secondsPerKm % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  async function autodetectProfile() {
    autodetecting.value = true
    try {
      const response: any = await $fetch('/api/profile/autodetect', {
        method: 'POST'
      })

      if (
        response.success &&
        response.diff &&
        response.diff.sportSettings &&
        response.diff.sportSettings.length > 0
      ) {
        pendingDiffs.value = response.diff
        pendingDetectedProfile.value = response.detected
        showConfirmModal.value = true
      } else if (response.success && Object.keys(response.diff).length > 0) {
        // Detected changes in basic settings but not sport settings
        // Notify user to check Basic Settings tab
        toast.add({
          title: 'Basic Settings Found',
          description:
            'Updates found for basic profile stats. Switch to the Basic Settings tab to review.',
          color: 'primary',
          actions: [
            {
              label: 'Switch Tab',
              onClick: () => emit('autodetect', null) // Signal parent to maybe switch tab? Or just let user do it
            }
          ]
        })
      } else {
        toast.add({
          title: 'No Updates Found',
          description: response.message || 'Your sport profiles are already in sync.',
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
    if (pendingDetectedProfile.value.sportSettings) {
      // Merge detected sport settings into current settings
      // We need to be careful: are we replacing or merging?
      // The logic in autodetect.post.ts returns the *changes*.
      // But typically we might just want to replace the list or update specific items.

      // Actually, autodetect logic on parent 'handleAutodetect' does:
      // if (updatedProfile.sportSettings) sportSettings.value = updatedProfile.sportSettings
      // So we should emit the FULL detected profile if possible, OR just the changes.
      // Parent handleAutodetect expects 'updatedProfile' object.

      // We emit 'autodetect' event which parent listens to
      emit('autodetect', pendingDetectedProfile.value)
    }

    showConfirmModal.value = false
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
