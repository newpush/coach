<template>
  <UDashboardPanel id="upload">
    <template #header>
      <UDashboardNavbar :title="t('upload_nav_title', 'Upload Workouts')">
        <template #leading>
          <UDashboardSidebarCollapse />
          <UButton to="/data" color="neutral" variant="ghost" icon="i-heroicons-arrow-left">
            {{ t('upload_back_to_data', 'Back to Data') }}
          </UButton>
        </template>
        <template #right>
          <ClientOnly>
            <DashboardTriggerMonitorButton />
          </ClientOnly>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-3xl mx-auto p-4 sm:p-8 space-y-8 pb-24">
        <div class="text-center space-y-4">
          <div
            class="w-16 h-16 bg-primary-50 dark:bg-primary-900/20 rounded-2xl flex items-center justify-center mx-auto border border-primary-100 dark:border-primary-800"
          >
            <UIcon name="i-heroicons-cloud-arrow-up" class="w-8 h-8 text-primary-500" />
          </div>
          <div class="space-y-1">
            <h1 class="text-3xl font-black text-gray-900 dark:text-white uppercase tracking-tight">
              {{ t('upload_title', 'Manual Ingestion') }}
            </h1>
            <p
              class="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest"
            >
              {{ t('upload_eyebrow', 'Integrity Center • FIT File Upload') }}
            </p>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto leading-relaxed">
            {{
              t(
                'upload_intro',
                "Directly upload .FIT files from your device. We'll analyze the biometric streams and sync them to your performance history."
              )
            }}
          </p>
        </div>

        <UCard
          :ui="{
            root: 'rounded-xl shadow-lg border-gray-100 dark:border-gray-800',
            body: 'p-0'
          }"
          class="overflow-hidden"
        >
          <div
            class="flex flex-col items-center justify-center min-h-[300px] border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl m-4 transition-all duration-300"
            :class="{
              'border-primary-500 bg-primary-50 dark:bg-primary-900/10 scale-[0.99]': isDragging
            }"
            @dragover.prevent="isDragging = true"
            @dragleave.prevent="isDragging = false"
            @drop.prevent="handleDrop"
          >
            <input
              ref="fileInput"
              type="file"
              class="hidden"
              accept=".fit"
              multiple
              @change="handleFileSelect"
            />

            <div v-if="selectedFiles.length === 0" class="text-center p-8">
              <div class="mb-6 opacity-40">
                <UIcon name="i-heroicons-document-plus" class="size-12 text-gray-400" />
              </div>
              <UButton
                color="primary"
                variant="solid"
                size="lg"
                class="font-black uppercase tracking-widest text-xs px-8"
                @click="
                  () => {
                    void fileInput?.click()
                  }
                "
              >
                {{ t('upload_select_files', 'Select Files') }}
              </UButton>
              <p class="text-xs text-gray-400 mt-4 font-bold uppercase tracking-tighter">
                {{ t('upload_drag_hint', 'or drag and drop here') }}
              </p>
            </div>

            <div v-else class="w-full p-6">
              <div class="mb-4">
                <h3 class="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">
                  {{ t('upload_queue_title', 'Pending Upload Queue') }}
                </h3>
                <div class="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                  <div
                    v-for="(file, index) in selectedFiles"
                    :key="index"
                    class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700/50 group"
                  >
                    <div class="flex items-center gap-3 min-w-0">
                      <div
                        class="size-8 rounded-lg bg-white dark:bg-gray-900 flex items-center justify-center shadow-sm border border-gray-100 dark:border-gray-800"
                      >
                        <UIcon name="i-heroicons-document-text" class="size-4 text-primary-500" />
                      </div>
                      <div class="min-w-0">
                        <div
                          class="text-xs font-black text-gray-900 dark:text-white truncate uppercase tracking-tight"
                        >
                          {{ file.name }}
                        </div>
                        <div class="text-[9px] text-gray-400 font-bold uppercase tracking-widest">
                          {{ formatFileSize(file.size) }}
                        </div>
                      </div>
                    </div>
                    <UButton
                      color="neutral"
                      variant="ghost"
                      icon="i-heroicons-trash"
                      size="xs"
                      class="opacity-0 group-hover:opacity-100 transition-opacity"
                      @click="
                        () => {
                          void removeFile(index)
                        }
                      "
                    />
                  </div>
                </div>
              </div>

              <div
                class="flex items-center justify-between mt-6 pt-6 border-t border-gray-100 dark:border-gray-800"
              >
                <div class="flex flex-col">
                  <span
                    class="text-[10px] font-black uppercase tracking-widest text-gray-400 leading-none"
                    >{{ t('upload_ready_label', 'Ready to Process') }}</span
                  >
                  <span class="text-xl font-black text-primary-600 leading-tight">{{
                    sessionCountLabel
                  }}</span>
                </div>
                <div class="flex gap-3">
                  <UButton
                    color="neutral"
                    variant="ghost"
                    class="font-black uppercase tracking-widest text-[10px]"
                    @click="
                      () => {
                        void clearFiles()
                      }
                    "
                    >{{ t('upload_reset', 'Reset') }}</UButton
                  >
                  <UButton
                    :loading="uploading"
                    color="primary"
                    variant="solid"
                    class="font-black uppercase tracking-widest text-[10px] px-6"
                    @click="
                      () => {
                        void uploadFiles()
                      }
                    "
                  >
                    {{
                      uploading
                        ? t('upload_submitting', 'Uploading...')
                        : t('upload_submit', 'Commence Ingestion')
                    }}
                  </UButton>
                </div>
              </div>
            </div>
          </div>
        </UCard>

        <div
          v-if="uploadResult"
          class="rounded-xl p-6 border transition-all duration-500"
          :class="
            uploadResult.success
              ? 'bg-green-50 dark:bg-green-950/20 border-green-100 dark:border-green-900/50'
              : 'bg-red-50 dark:bg-red-950/20 border-red-100 dark:border-red-900/50'
          "
        >
          <div class="flex gap-4">
            <div class="flex-shrink-0">
              <div
                class="size-10 rounded-xl flex items-center justify-center"
                :class="
                  uploadResult.success
                    ? 'bg-green-100 dark:bg-green-800 text-green-600 dark:text-green-400'
                    : 'bg-red-100 dark:bg-red-800 text-red-600 dark:text-red-400'
                "
              >
                <UIcon
                  :name="uploadResult.success ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                  class="size-6"
                />
              </div>
            </div>
            <div class="flex-1">
              <h3
                class="text-sm font-black uppercase tracking-tight mb-1"
                :class="
                  uploadResult.success
                    ? 'text-green-900 dark:text-green-100'
                    : 'text-red-900 dark:text-red-100'
                "
              >
                {{ uploadResult.message }}
              </h3>
              <div
                v-if="uploadResult.results && uploadResult.results.errors.length > 0"
                class="mt-2 text-xs font-medium space-y-1"
                :class="
                  uploadResult.success
                    ? 'text-green-700 dark:text-green-300'
                    : 'text-red-700 dark:text-red-300'
                "
              >
                <div
                  v-for="err in uploadResult.results.errors"
                  :key="err"
                  class="flex items-center gap-2"
                >
                  <div class="size-1 rounded-full bg-current" />
                  {{ err }}
                </div>
              </div>
              <div
                v-if="uploadResult.success"
                class="mt-3 text-xs font-medium text-green-700 dark:text-green-300 leading-relaxed"
              >
                {{
                  t(
                    'upload_success_hint',
                    'Ingestion pipelines have been initialized. Workouts will appear on your dashboard as analysis completes.'
                  )
                }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'

  const { t } = useTranslate('workout')

  definePageMeta({
    middleware: 'auth'
  })

  const fileInput = ref<HTMLInputElement | null>(null)
  const isDragging = ref(false)
  const selectedFiles = ref<File[]>([])
  const uploading = ref(false)
  const uploadResult = ref<{ success: boolean; message: string; results?: any } | null>(null)

  // Built in script rather than the template: the ICU plural default contains `}}`,
  // which Vue's template compiler would read as the end of the interpolation.
  const sessionCountLabel = computed(() =>
    t.value('upload_session_count', '{count, plural, one {# Session} other {# Sessions}}', {
      count: selectedFiles.value.length
    })
  )

  function handleDrop(e: DragEvent) {
    isDragging.value = false
    const files = e.dataTransfer?.files
    if (files?.length) {
      addFiles(Array.from(files))
    }
  }

  function handleFileSelect(e: Event) {
    const files = (e.target as HTMLInputElement).files
    if (files?.length) {
      addFiles(Array.from(files))
    }
  }

  function addFiles(files: File[]) {
    const validFiles = files.filter((file) => file.name.toLowerCase().endsWith('.fit'))

    if (validFiles.length < files.length) {
      useToast().add({
        title: t.value('upload_invalid_title', 'Invalid Files Skipped'),
        description: t.value('upload_invalid_description', 'Only .fit files are allowed.'),
        color: 'warning'
      })
    }

    // Avoid duplicates by name + size (simple check)
    const newFiles = validFiles.filter(
      (nf) => !selectedFiles.value.some((sf) => sf.name === nf.name && sf.size === nf.size)
    )

    selectedFiles.value = [...selectedFiles.value, ...newFiles]
    uploadResult.value = null
  }

  function removeFile(index: number) {
    selectedFiles.value.splice(index, 1)
  }

  function clearFiles() {
    selectedFiles.value = []
    if (fileInput.value) {
      fileInput.value.value = ''
    }
    uploadResult.value = null
  }

  function formatFileSize(bytes: number) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const { refresh: refreshRuns } = useUserRuns()
  const { onTaskCompleted } = useUserRunsState()

  // Listen for completion
  onTaskCompleted('ingest-fit-file', async (run) => {
    useToast().add({
      title: t.value('upload_complete_title', 'Processing Complete'),
      description: t.value(
        'upload_complete_description',
        'A workout file has been analyzed and added to your history.'
      ),
      color: 'success',
      icon: 'i-heroicons-check-circle'
    })
  })

  async function uploadFiles() {
    if (selectedFiles.value.length === 0) return

    uploading.value = true
    const formData = new FormData()
    selectedFiles.value.forEach((file) => {
      formData.append('file', file)
    })

    try {
      const response = await ($fetch as any)('/api/workouts/upload-fit', {
        method: 'POST',
        body: formData
      })

      uploadResult.value = {
        success: response.success,
        message: response.message,
        results: response.results
      }
      refreshRuns()

      if (response.success) {
        // Clear files after successful upload
        setTimeout(() => {
          clearFiles()
        }, 2000)
      }
    } catch (error: any) {
      uploadResult.value = {
        success: false,
        message: error.data?.message || t.value('upload_failed', 'Upload failed')
      }
    } finally {
      uploading.value = false
    }
  }

  useHead(
    computed(() => ({
      title: t.value('upload_nav_title', 'Upload Workouts'),
      meta: [
        {
          name: 'description',
          content: t.value(
            'upload_meta_description',
            'Manually upload FIT files to your training history.'
          )
        }
      ]
    }))
  )
</script>
