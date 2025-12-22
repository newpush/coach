<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-xl font-bold text-gray-900 dark:text-white uppercase tracking-tight">Developer Settings</h2>
      <p class="text-sm text-gray-500 dark:text-gray-400">Manage your API keys and access developer documentation.</p>
    </div>

    <!-- Documentation Link -->
    <UCard>
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="flex items-start gap-3">
          <div class="p-2 bg-primary-50 dark:bg-primary-900/20 rounded-lg shrink-0">
            <UIcon name="i-heroicons-book-open" class="w-6 h-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div class="min-w-0">
            <h3 class="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-widest">API Documentation</h3>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Explore our API endpoints and learn how to integrate with Coach Watts.</p>
          </div>
        </div>
        <UButton
          to="/_docs/scalar"
          target="_blank"
          color="neutral"
          variant="outline"
          icon="i-heroicons-arrow-top-right-on-square"
          size="sm"
          class="font-bold shrink-0"
        >
          View Docs
        </UButton>
      </div>
    </UCard>

    <!-- API Keys List -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-widest">API Keys</h3>
          <UButton
            color="primary"
            variant="solid"
            icon="i-heroicons-plus"
            size="sm"
            class="font-bold"
            @click="isCreateModalOpen = true"
          >
            Create Key
          </UButton>
        </div>
      </template>

      <div v-if="loading" class="space-y-4">
        <USkeleton v-for="i in 3" :key="i" class="h-12 w-full" />
      </div>

      <div v-else-if="apiKeys.length === 0" class="py-8 text-center">
        <UIcon name="i-heroicons-key" class="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
        <p class="text-sm text-gray-500 dark:text-gray-400">You haven't created any API keys yet.</p>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead>
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Prefix</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Last Used</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Created</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
            <tr v-for="key in apiKeys" :key="key.id">
              <td class="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{{ key.name }}</td>
              <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                <code class="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{{ key.prefix }}...</code>
              </td>
              <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                {{ key.lastUsedAt ? formatDate(key.lastUsedAt) : 'Never' }}
              </td>
              <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                {{ formatDate(key.createdAt) }}
              </td>
              <td class="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                <UButton
                  color="error"
                  variant="ghost"
                  icon="i-heroicons-trash"
                  size="xs"
                  @click="confirmDelete(key)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <!-- Create Key Modal -->
    <UModal v-model:open="isCreateModalOpen" title="Create API Key" description="Give your new API key a name to help you identify it later.">
      <template #body>
        <UFormField label="Key Name" help="e.g. My Website, External Script">
          <UInput v-model="newKeyName" placeholder="Enter a name" @keyup.enter="createKey" />
        </UFormField>

        <div v-if="generatedKey" class="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-800 rounded-lg">
          <div class="flex items-start gap-3">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
            <div>
              <p class="text-xs font-bold text-yellow-800 dark:text-yellow-300 uppercase tracking-tight">Save this key!</p>
              <p class="text-xs text-yellow-700 dark:text-yellow-400 mt-1">For security reasons, we can only show this key once. If you lose it, you'll need to create a new one.</p>
            </div>
          </div>
          <div class="mt-3 flex items-center gap-2">
            <UInput
              readonly
              :value="generatedKey"
              class="flex-1 font-mono text-xs"
              :type="isKeyVisible ? 'text' : 'password'"
            >
              <template #trailing>
                <UButton
                  color="neutral"
                  variant="ghost"
                  :icon="isKeyVisible ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'"
                  size="xs"
                  @click="isKeyVisible = !isKeyVisible"
                />
              </template>
            </UInput>
            <UButton
              color="neutral"
              variant="outline"
              icon="i-heroicons-clipboard"
              size="sm"
              @click="copyKey"
            >
              Copy
            </UButton>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-between w-full">
          <UButton
            label="Close"
            color="neutral"
            variant="ghost"
            @click="closeCreateModal"
          />
          <UButton
            v-if="!generatedKey"
            label="Create Key"
            color="primary"
            :loading="creating"
            @click="createKey"
          />
        </div>
      </template>
    </UModal>

    <!-- Delete Confirmation Modal -->
    <UModal v-model:open="isDeleteModalOpen" title="Revoke API Key" description="Are you sure you want to revoke this API key? Any applications using this key will immediately lose access.">
      <template #footer>
        <UButton label="Cancel" color="neutral" variant="ghost" @click="isDeleteModalOpen = false" />
        <UButton label="Revoke Key" color="error" :loading="deleting" @click="deleteKey" />
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
const toast = useToast()

definePageMeta({
  middleware: 'auth'
})

useHead({
  title: 'Developer Settings',
  meta: [
    { name: 'description', content: 'Manage your API keys and access developer documentation.' }
  ]
})

const loading = ref(true)
const apiKeys = ref<any[]>([])
const isCreateModalOpen = ref(false)
const isDeleteModalOpen = ref(false)
const isKeyVisible = ref(false)
const newKeyName = ref('')
const generatedKey = ref('')
const keyToDelete = ref<any>(null)
const creating = ref(false)
const deleting = ref(false)

async function fetchKeys() {
  loading.value = true
  try {
    apiKeys.value = await $fetch('/api/settings/api-keys')
  } catch (error) {
    console.error('Failed to fetch keys:', error)
    toast.add({ title: 'Error', description: 'Failed to load API keys', color: 'error' })
  } finally {
    loading.value = false
  }
}

async function createKey() {
  if (!newKeyName.value) return
  
  creating.value = true
  try {
    const response: any = await $fetch('/api/settings/api-keys', {
      method: 'POST',
      body: { name: newKeyName.value }
    })
    generatedKey.value = response.key
    await fetchKeys()
    toast.add({ title: 'Success', description: 'API key created successfully', color: 'success' })
  } catch (error) {
    console.error('Failed to create key:', error)
    toast.add({ title: 'Error', description: 'Failed to create API key', color: 'error' })
  } finally {
    creating.value = false
  }
}

function confirmDelete(key: any) {
  keyToDelete.value = key
  isDeleteModalOpen.value = true
}

async function deleteKey() {
  if (!keyToDelete.value) return
  
  deleting.value = true
  try {
    await $fetch(`/api/settings/api-keys/${keyToDelete.value.id}`, {
      method: 'DELETE'
    })
    await fetchKeys()
    isDeleteModalOpen.value = false
    toast.add({ title: 'Success', description: 'API key revoked', color: 'success' })
  } catch (error) {
    console.error('Failed to delete key:', error)
    toast.add({ title: 'Error', description: 'Failed to revoke API key', color: 'error' })
  } finally {
    deleting.value = false
  }
}

function copyKey() {
  navigator.clipboard.writeText(generatedKey.value)
  toast.add({ title: 'Copied', description: 'API key copied to clipboard', color: 'success' })
}

function closeCreateModal() {
  isCreateModalOpen.value = false
  generatedKey.value = ''
  newKeyName.value = ''
  isKeyVisible.value = false
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

onMounted(() => {
  fetchKeys()
})
</script>
