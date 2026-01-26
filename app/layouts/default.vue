<script setup lang="ts">
  import type { NavigationMenuItem } from '@nuxt/ui'

  const { data, signOut, refresh } = useAuth()
  const user = computed(() => data.value?.user)
  const toast = useToast()
  const stoppingImpersonation = ref(false)

  // Background Task Monitor State
  const { isOpen: showTriggerMonitor } = useTriggerMonitor()

  const impersonationMeta = useCookie<{
    adminId: string
    adminEmail: string
    impersonatedUserId: string
    impersonatedUserEmail: string
  }>('auth.impersonation_meta')

  const impersonatedEmail = computed(() => impersonationMeta.value?.impersonatedUserEmail)

  async function stopImpersonation() {
    stoppingImpersonation.value = true
    try {
      await $fetch('/api/admin/stop-impersonation', { method: 'POST' })
      toast.add({
        title: 'Impersonation stopped',
        description: 'Returning to admin account',
        color: 'success'
      })
      // Refresh session and redirect
      await refresh()
      await navigateTo('/admin/users')
    } catch (error) {
      console.error('Failed to stop impersonation:', error)
      toast.add({
        title: 'Error',
        description: 'Failed to stop impersonation',
        color: 'error'
      })
    } finally {
      stoppingImpersonation.value = false
    }
  }

  const route = useRoute()

  const open = ref(false)

  const links = computed<NavigationMenuItem[][]>(() => {
    const primaryLinks: any[] = [
      {
        label: 'Dashboard',
        icon: 'i-lucide-layout-dashboard',
        to: '/dashboard',
        onSelect: () => {
          open.value = false
        }
      },
      {
        label: 'Activities',
        icon: 'i-lucide-calendar-days',
        to: '/activities',
        onSelect: () => {
          open.value = false
        }
      },
      {
        label: 'Performance',
        icon: 'i-lucide-trending-up',
        to: '/performance',
        onSelect: () => {
          open.value = false
        }
      },
      {
        label: 'Recommendations',
        icon: 'i-lucide-sparkles',
        to: '/recommendations',
        onSelect: () => {
          open.value = false
        }
      },
      {
        label: 'Training Plan',
        icon: 'i-lucide-calendar',
        to: '/plan',
        onSelect: () => {
          open.value = false
        }
      },
      {
        label: 'My Plans',
        icon: 'i-lucide-library',
        to: '/plans',
        onSelect: () => {
          open.value = false
        }
      },
      {
        label: 'Workouts',
        icon: 'i-lucide-activity',
        to: '/workouts',
        onSelect: () => {
          open.value = false
        }
      },
      {
        label: 'Nutrition',
        icon: 'i-lucide-utensils',
        to: '/nutrition',
        onSelect: () => {
          open.value = false
        }
      },
      {
        label: 'Fitness',
        icon: 'i-lucide-heart-pulse',
        to: '/fitness',
        onSelect: () => {
          open.value = false
        }
      },
      {
        label: 'Goals',
        icon: 'i-lucide-trophy',
        to: '/profile/goals',
        onSelect: () => {
          open.value = false
        }
      },
      {
        label: 'Events',
        icon: 'i-lucide-flag',
        to: '/events',
        onSelect: () => {
          open.value = false
        }
      },
      {
        label: 'Reports',
        icon: 'i-lucide-file-text',
        to: '/reports',
        onSelect: () => {
          open.value = false
        }
      },
      {
        label: 'Coaching',
        icon: 'i-lucide-users',
        to: '/coaching',
        onSelect: () => {
          open.value = false
        }
      },
      {
        label: 'AI Chat',
        icon: 'i-lucide-message-circle',
        to: '/chat',
        onSelect: () => {
          open.value = false
        }
      },
      {
        label: 'Data',
        icon: 'i-lucide-database',
        to: '/data',
        onSelect: () => {
          open.value = false
        }
      }
    ]

    if ((user.value as any)?.isAdmin) {
      primaryLinks.push({
        label: 'Admin',
        icon: 'i-lucide-shield-check',
        to: '/admin',
        onSelect: () => {
          open.value = false
        }
      })
    }

    primaryLinks.push({
      label: 'Settings',
      icon: 'i-lucide-settings',
      defaultOpen: route.path.includes('settings'),
      children: [
        {
          label: 'Profile',
          icon: 'i-lucide-user',
          to: '/profile/settings',
          onSelect: () => {
            open.value = false
          }
        },
        {
          label: 'AI Coach',
          icon: 'i-lucide-sparkles',
          to: '/settings/ai',
          onSelect: () => {
            open.value = false
          }
        },
        {
          label: 'Billing',
          icon: 'i-lucide-credit-card',
          to: '/settings/billing',
          onSelect: () => {
            open.value = false
          }
        },
        {
          label: 'Apps',
          icon: 'i-lucide-layout-grid',
          to: '/settings/apps',
          onSelect: () => {
            open.value = false
          }
        },
        {
          label: 'Authorized Apps',
          icon: 'i-lucide-shield-check',
          to: '/settings/authorized-apps',
          onSelect: () => {
            open.value = false
          }
        },
        {
          label: 'Coaching',
          icon: 'i-lucide-users',
          to: '/settings/coaching',
          onSelect: () => {
            open.value = false
          }
        },
        {
          label: 'Changelog',
          icon: 'i-lucide-list',
          to: '/settings/changelog',
          onSelect: () => {
            open.value = false
          }
        },
        {
          label: 'Developer',
          icon: 'i-lucide-code-2',
          to: '/settings/developer',
          onSelect: () => {
            open.value = false
          }
        },
        {
          label: 'Danger Zone',
          icon: 'i-lucide-trash-2',
          to: '/settings/danger',
          onSelect: () => {
            open.value = false
          }
        }
      ]
    })

    return [primaryLinks]
  })

  const groups = computed(() => [
    {
      id: 'links',
      label: 'Go to',
      items: links.value.flat()
    }
  ])
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="default"
      v-model:open="open"
      collapsible
      resizable
      class="bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink
          to="/dashboard"
          class="flex items-center w-full overflow-hidden shrink-0"
          :class="collapsed ? 'p-1 justify-center' : 'p-4 justify-start lg:justify-center'"
        >
          <img
            v-if="!collapsed"
            src="/media/coach_watts_text_cropped.webp"
            alt="Coach Watts"
            class="h-8 lg:h-10 w-auto object-contain"
          />
          <img v-else src="/media/logo.webp" alt="Coach Watts" class="size-12 object-contain" />
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton
          v-if="false"
          :collapsed="collapsed"
          class="bg-transparent ring-default"
        />

        <UNavigationMenu :collapsed="collapsed" :items="links[0]" orientation="vertical" tooltip />
      </template>

      <template #footer="{ collapsed }">
        <div class="w-full">
          <div v-if="!collapsed" class="px-4 pb-2">
            <div class="flex items-center justify-center gap-4 mb-4">
              <NuxtLink
                to="https://www.strava.com"
                target="_blank"
                class="hover:opacity-100 transition-opacity"
              >
                <img
                  src="/images/logos/strava_powered_by_black.png"
                  alt="Powered by Strava"
                  class="h-6 w-auto opacity-75 hover:opacity-100 dark:hidden"
                />
                <img
                  src="/images/logos/strava_powered_by.png"
                  alt="Powered by Strava"
                  class="h-6 w-auto opacity-75 hover:opacity-100 hidden dark:block"
                />
              </NuxtLink>
              <NuxtLink
                to="https://www.garmin.com"
                target="_blank"
                class="hover:opacity-100 transition-opacity"
              >
                <img
                  src="/images/logos/WorksWithGarmin-Black.svg"
                  alt="Works with Garmin"
                  class="h-6 w-auto opacity-75 hover:opacity-100 dark:hidden"
                />
                <img
                  src="/images/logos/WorksWithGarmin-White.svg"
                  alt="Works with Garmin"
                  class="h-6 w-auto opacity-75 hover:opacity-100 hidden dark:block"
                />
              </NuxtLink>
            </div>
            <USeparator class="mb-4" />
            <div class="flex items-center justify-center gap-2">
              <UButton
                to="https://discord.gg/dPYkzg49T9"
                target="_blank"
                color="neutral"
                variant="ghost"
                icon="i-simple-icons-discord"
                size="xs"
                class="flex-1 justify-center"
              >
                Discord
              </UButton>
              <USeparator orientation="vertical" class="h-4" />
              <UButton
                to="https://github.com/newpush/coach"
                target="_blank"
                color="neutral"
                variant="ghost"
                icon="i-simple-icons-github"
                size="xs"
                class="flex-1 justify-center"
              >
                GitHub
              </UButton>
            </div>
            <USeparator class="my-2" />
          </div>

          <div class="p-4 flex items-center gap-3">
            <UAvatar v-if="user" :alt="user.email || ''" size="md" />
            <div v-if="!collapsed" class="flex-1 min-w-0 flex flex-col items-start gap-0.5">
              <UTooltip
                :text="impersonatedEmail || user?.email || ''"
                :popper="{ placement: 'right' }"
              >
                <p class="text-sm font-medium truncate text-gray-900 dark:text-white">
                  {{ user?.name || impersonatedEmail || user?.email }}
                </p>
              </UTooltip>
              <UButton
                v-if="impersonatedEmail"
                variant="link"
                color="warning"
                size="xs"
                :padded="false"
                class="p-0 h-auto font-normal text-yellow-600 hover:text-yellow-700 dark:text-yellow-400 dark:hover:text-yellow-300"
                :loading="stoppingImpersonation"
                @click="stopImpersonation"
              >
                Stop impersonating
              </UButton>
              <UButton
                v-else
                variant="link"
                color="neutral"
                size="xs"
                :padded="false"
                class="p-0 h-auto font-normal text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                @click="signOut({ callbackUrl: '/login' })"
              >
                Sign out
              </UButton>
            </div>
            <ColorModeButton />
          </div>
        </div>
      </template>
    </UDashboardSidebar>

    <UDashboardSearch :groups="groups" />

    <slot />

    <ClientOnly>
      <DashboardTriggerMonitor v-model="showTriggerMonitor" />
    </ClientOnly>
  </UDashboardGroup>
</template>
