<script setup lang="ts">
  import { useTimeAgo } from '@vueuse/core'

  definePageMeta({
    layout: 'admin',
    middleware: ['auth', 'admin']
  })

  const route = useRoute()
  const userId = route.params.id as string
  const toast = useToast()

  const { data, pending, refresh } = await useFetch(`/api/admin/users/${userId}`)

  const impersonating = ref(false)

  async function impersonateUser() {
    impersonating.value = true
    try {
      await $fetch('/api/admin/impersonate', {
        method: 'POST',
        body: { userId }
      })

      toast.add({
        title: 'Success',
        description: 'Redirecting to impersonated user dashboard...',
        color: 'success'
      })

      window.location.href = '/dashboard'
    } catch (error) {
      toast.add({
        title: 'Error',
        description: 'Failed to impersonate user',
        color: 'error'
      })
    } finally {
      impersonating.value = false
    }
  }

  useHead({
    title: computed(() => `User: ${data.value?.profile.name || 'Unknown'}`)
  })
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="`User: ${data?.profile.name || 'Unknown'}`">
        <template #leading>
          <UButton to="/admin/users" icon="i-lucide-arrow-left" color="neutral" variant="ghost" />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <UButton
              color="neutral"
              variant="soft"
              icon="i-lucide-user-cog"
              label="Impersonate"
              :loading="impersonating"
              @click="impersonateUser"
            />
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-refresh-cw"
              :loading="pending"
              @click="() => refresh()"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-6 space-y-6">
        <div v-if="pending" class="flex items-center justify-center p-12">
          <UIcon name="i-lucide-loader-2" class="animate-spin h-8 w-8 text-gray-400" />
        </div>

        <template v-else-if="data">
          <!-- Top Stats -->
          <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
            <UCard>
              <div class="text-center">
                <div class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">
                  Total Workouts
                </div>
                <div class="text-2xl font-bold">{{ data.profile._count.workouts }}</div>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <div class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">
                  AI Cost
                </div>
                <div class="text-2xl font-bold text-emerald-600">
                  ${{ data.stats.totalCost.toFixed(4) }}
                </div>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <div class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">
                  Generated Reports
                </div>
                <div class="text-2xl font-bold">{{ data.profile._count.reports }}</div>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <div class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">
                  Last Active
                </div>
                <div class="text-sm font-medium mt-1">
                  {{ new Date(data.stats.lastActive).toLocaleDateString() }}
                </div>
                <div class="text-xs text-gray-400">
                  {{ useTimeAgo(data.stats.lastActive).value }}
                </div>
              </div>
            </UCard>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Profile Details -->
            <UCard class="lg:col-span-2">
              <template #header>
                <h3 class="font-semibold">Profile & Settings</h3>
              </template>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- Identity -->
                <div class="space-y-4">
                  <h4 class="text-xs font-bold text-gray-500 uppercase">Identity</h4>
                  <dl class="space-y-2 text-sm">
                    <div class="flex justify-between">
                      <dt class="text-gray-500">Email</dt>
                      <dd class="font-medium">{{ data.profile.email }}</dd>
                    </div>
                    <div class="flex justify-between">
                      <dt class="text-gray-500">Joined</dt>
                      <dd>{{ new Date(data.profile.createdAt).toLocaleDateString() }}</dd>
                    </div>
                    <div class="flex justify-between">
                      <dt class="text-gray-500">Role</dt>
                      <dd>
                        <UBadge :color="data.profile.isAdmin ? 'primary' : 'neutral'" size="xs">
                          {{ data.profile.isAdmin ? 'Admin' : 'User' }}
                        </UBadge>
                      </dd>
                    </div>
                    <div class="flex justify-between">
                      <dt class="text-gray-500">Auth Provider</dt>
                      <dd class="flex gap-1">
                        <UBadge
                          v-for="acc in data.profile.accounts"
                          :key="acc.provider"
                          color="neutral"
                          variant="subtle"
                          size="xs"
                        >
                          {{ acc.provider }}
                        </UBadge>
                      </dd>
                    </div>
                  </dl>
                </div>

                <!-- Physical & Coaching -->
                <div class="space-y-4">
                  <h4 class="text-xs font-bold text-gray-500 uppercase">Coaching Profile</h4>
                  <dl class="space-y-2 text-sm">
                    <div class="flex justify-between">
                      <dt class="text-gray-500">FTP</dt>
                      <dd class="font-medium">{{ data.profile.ftp || '--' }} W</dd>
                    </div>
                    <div class="flex justify-between">
                      <dt class="text-gray-500">Max HR</dt>
                      <dd class="font-medium">{{ data.profile.maxHr || '--' }} bpm</dd>
                    </div>
                    <div class="flex justify-between">
                      <dt class="text-gray-500">Weight</dt>
                      <dd class="font-medium">
                        {{ data.profile.weight ? `${data.profile.weight.toFixed(2)} kg` : '--' }}
                      </dd>
                    </div>
                    <div class="flex justify-between">
                      <dt class="text-gray-500">Age</dt>
                      <dd class="font-medium">
                        {{
                          data.profile.dob
                            ? new Date().getFullYear() - new Date(data.profile.dob).getFullYear()
                            : '--'
                        }}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              <div class="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
                <h4 class="text-xs font-bold text-gray-500 uppercase mb-4">Athlete Scores</h4>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                    <div class="text-2xl font-bold text-blue-500">
                      {{ data.profile.currentFitnessScore || '-' }}
                    </div>
                    <div class="text-xs text-gray-500 mt-1">Fitness</div>
                  </div>
                  <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                    <div class="text-2xl font-bold text-green-500">
                      {{ data.profile.recoveryCapacityScore || '-' }}
                    </div>
                    <div class="text-xs text-gray-500 mt-1">Recovery</div>
                  </div>
                  <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                    <div class="text-2xl font-bold text-amber-500">
                      {{ data.profile.nutritionComplianceScore || '-' }}
                    </div>
                    <div class="text-xs text-gray-500 mt-1">Nutrition</div>
                  </div>
                  <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                    <div class="text-2xl font-bold text-purple-500">
                      {{ data.profile.trainingConsistencyScore || '-' }}
                    </div>
                    <div class="text-xs text-gray-500 mt-1">Consistency</div>
                  </div>
                </div>
              </div>
            </UCard>

            <!-- Integrations -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Integrations</h3>
              </template>
              <div class="space-y-4">
                <div
                  v-for="int in data.profile.integrations"
                  :key="int.id"
                  class="flex items-center justify-between p-3 border border-gray-100 dark:border-gray-800 rounded-lg"
                >
                  <div>
                    <div class="font-medium capitalize">{{ int.provider }}</div>
                    <div class="text-xs text-gray-500">
                      Last sync: {{ int.lastSyncAt ? useTimeAgo(int.lastSyncAt).value : 'Never' }}
                    </div>
                  </div>
                  <UBadge
                    :color="
                      int.syncStatus === 'SUCCESS'
                        ? 'success'
                        : int.syncStatus === 'FAILED'
                          ? 'error'
                          : 'neutral'
                    "
                    variant="subtle"
                    size="xs"
                  >
                    {{ int.syncStatus || 'UNKNOWN' }}
                  </UBadge>
                </div>
                <div
                  v-if="!data.profile.integrations.length"
                  class="text-center text-sm text-gray-500 py-4"
                >
                  No active integrations
                </div>
              </div>
            </UCard>
          </div>

          <!-- Recent Activity -->
          <UCard>
            <template #header>
              <h3 class="font-semibold">Recent Workouts</h3>
            </template>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr class="text-left text-xs uppercase text-gray-500">
                    <th class="py-2">Date</th>
                    <th class="py-2">Activity</th>
                    <th class="py-2">Type</th>
                    <th class="py-2 text-right">Duration</th>
                    <th class="py-2 text-right">TSS</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                  <tr v-for="workout in data.recentWorkouts" :key="workout.id">
                    <td class="py-2 whitespace-nowrap text-gray-500">
                      {{ new Date(workout.date).toLocaleDateString() }}
                    </td>
                    <td class="py-2 font-medium">{{ workout.title }}</td>
                    <td class="py-2">
                      <UBadge color="neutral" variant="soft" size="xs">{{ workout.type }}</UBadge>
                    </td>
                    <td class="py-2 text-right font-mono">
                      {{ Math.round(workout.durationSec / 60) }}m
                    </td>
                    <td class="py-2 text-right font-mono">{{ workout.tss || '-' }}</td>
                  </tr>
                  <tr v-if="!data.recentWorkouts.length">
                    <td colspan="5" class="py-4 text-center text-gray-500">No workouts recorded</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </UCard>

          <!-- Recent LLM Usage -->
          <UCard>
            <template #header>
              <h3 class="font-semibold">Recent AI Usage</h3>
            </template>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr class="text-left text-xs uppercase text-gray-500">
                    <th class="py-2">Time</th>
                    <th class="py-2">Operation</th>
                    <th class="py-2">Model</th>
                    <th class="py-2 text-right">Tokens</th>
                    <th class="py-2 text-right">Cost</th>
                    <th class="py-2 text-center">Status</th>
                    <th class="py-2"></th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                  <tr v-for="log in data.recentLlmUsage" :key="log.id">
                    <td class="py-2 whitespace-nowrap text-gray-500">
                      {{ new Date(log.createdAt).toLocaleString() }}
                    </td>
                    <td class="py-2">
                      <UBadge color="neutral" variant="soft" size="xs" class="capitalize">{{
                        log.operation.replace(/_/g, ' ')
                      }}</UBadge>
                    </td>
                    <td class="py-2 text-xs font-mono text-gray-500">{{ log.model }}</td>
                    <td class="py-2 text-right font-mono">
                      {{ log.totalTokens?.toLocaleString() || '-' }}
                    </td>
                    <td class="py-2 text-right font-mono text-emerald-600 dark:text-emerald-400">
                      ${{ log.estimatedCost?.toFixed(5) || '0.00' }}
                    </td>
                    <td class="py-2 text-center">
                      <UIcon
                        :name="log.success ? 'i-lucide-check-circle' : 'i-lucide-x-circle'"
                        :class="log.success ? 'text-green-500' : 'text-red-500'"
                        class="w-4 h-4"
                      />
                    </td>
                    <td class="py-2 text-right">
                      <UButton
                        :to="`/admin/llm/logs/${log.id}`"
                        color="neutral"
                        variant="ghost"
                        icon="i-lucide-eye"
                        size="xs"
                      />
                    </td>
                  </tr>
                  <tr v-if="!data.recentLlmUsage.length">
                    <td colspan="6" class="py-4 text-center text-gray-500">No AI usage recorded</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </UCard>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
