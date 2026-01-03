<template>
  <UDashboardPanel id="upload">
    <template #header>
      <UDashboardNavbar title="Upload Workout">
        <template #leading>
          <UDashboardSidebarCollapse />
          <UButton
            to="/data"
            color="neutral"
            variant="ghost"
            icon="i-heroicons-arrow-left"
          >
            Back to Data
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-2xl mx-auto p-6 space-y-6">
        <div class="text-center">
          <UIcon name="i-heroicons-cloud-arrow-up" class="w-12 h-12 mx-auto text-gray-400" />
          <h2 class="mt-4 text-lg font-semibold text-gray-900 dark:text-white">Upload FIT File</h2>
          <p class="mt-2 text-sm text-gray-500">
            Upload your workout file (.fit) manually. We'll analyze it and add it to your history.
          </p>
        </div>

        <UCard class="relative">
          <div
            class="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-12 transition-colors"
            :class="{ 'border-primary-500 bg-primary-50 dark:bg-primary-900/10': isDragging }"
            @dragover.prevent="isDragging = true"
            @dragleave.prevent="isDragging = false"
            @drop.prevent="handleDrop"
          >
            <input
              type="file"
              ref="fileInput"
              class="hidden"
              accept=".fit"
              @change="handleFileSelect"
            />
            
            <div v-if="!selectedFile" class="text-center">
              <UButton
                @click="fileInput?.click()"
                color="primary"
                variant="soft"
                class="mb-4"
              >
                Select File
              </UButton>
              <p class="text-xs text-gray-500">or drag and drop here</p>
            </div>

            <div v-else class="w-full text-center">
              <div class="flex items-center justify-center gap-2 mb-4">
                <UIcon name="i-heroicons-document" class="w-6 h-6 text-gray-400" />
                <span class="font-medium">{{ selectedFile.name }}</span>
                <UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-heroicons-x-mark"
                  size="xs"
                  @click="clearFile"
                />
              </div>
              
              <UButton
                @click="uploadFile"
                :loading="uploading"
                color="primary"
                block
              >
                {{ uploading ? 'Uploading...' : 'Upload Workout' }}
              </UButton>
            </div>
          </div>
        </UCard>

        <div v-if="uploadResult" class="rounded-md p-4" :class="uploadResult.success ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'">
          <div class="flex">
            <div class="flex-shrink-0">
              <UIcon
                :name="uploadResult.success ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                class="h-5 w-5"
                :class="uploadResult.success ? 'text-green-400' : 'text-red-400'"
              />
            </div>
            <div class="ml-3">
              <h3 class="text-sm font-medium" :class="uploadResult.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'">
                {{ uploadResult.message }}
              </h3>
              <div v-if="uploadResult.success" class="mt-2 text-sm text-green-700 dark:text-green-300">
                <p>Processing has started in the background. It may take a minute to appear in your dashboard.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

const fileInput = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const selectedFile = ref<File | null>(null)
const uploading = ref(false)
const uploadResult = ref<{ success: boolean; message: string } | null>(null)

function handleDrop(e: DragEvent) {
  isDragging.value = false
  const files = e.dataTransfer?.files
  if (files?.length && files[0]) {
    validateAndSelectFile(files[0])
  }
}

function handleFileSelect(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (files?.length && files[0]) {
    validateAndSelectFile(files[0])
  }
}

function validateAndSelectFile(file: File) {
  if (!file.name.toLowerCase().endsWith('.fit')) {
    useToast().add({
      title: 'Invalid File',
      description: 'Please upload a valid .fit file',
      color: 'error'
    })
    return
  }
  selectedFile.value = file
  uploadResult.value = null
}

function clearFile() {
  selectedFile.value = null
  if (fileInput.value) {
    fileInput.value.value = ''
  }
  uploadResult.value = null
}

async function uploadFile() {
  if (!selectedFile.value) return

  uploading.value = true
  const formData = new FormData()
  formData.append('file', selectedFile.value)

  try {
    const response = await $fetch('/api/workouts/upload-fit', {
      method: 'POST',
      body: formData
    })

    uploadResult.value = {
      success: true,
      message: response.message
    }
    
    // Clear file after successful upload
    setTimeout(() => {
      clearFile()
    }, 2000)

  } catch (error: any) {
    uploadResult.value = {
      success: false,
      message: error.data?.message || 'Upload failed'
    }
  } finally {
    uploading.value = false
  }
}

useHead({
  title: 'Upload Workout',
  meta: [
    { name: 'description', content: 'Manually upload FIT files to your training history.' }
  ]
})
</script>
