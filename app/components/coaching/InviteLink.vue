<script setup lang="ts">
  import QRCode from 'qrcode'
  import { useTranslate } from '@tolgee/vue'

  const { t } = useTranslate('coaching')

  const props = defineProps<{
    code: string
    /** @deprecated Kept for call-site compatibility; join URLs always redeem this code. */
    coachSlug?: string | null
    label?: string
    variant?: 'soft' | 'subtle' | 'outline' | 'ghost'
  }>()

  const toast = useToast()

  /**
   * Always redeem the specific invite code via `/join/{code}`.
   * Never point at `/start` (request-only) or `/coach/{slug}/join` (latest
   * public invite only — may not match this code).
   */
  const joinUrl = computed(() => {
    const base = import.meta.client ? window.location.origin : 'https://coachwatts.com'
    return `${base}/join/${props.code.toUpperCase()}`
  })

  function copyUrl() {
    navigator.clipboard.writeText(joinUrl.value)
    toast.add({
      title: t.value('invite_link_toast_url_copied', 'Join URL copied to clipboard!'),
      color: 'success'
    })
  }

  function copyCode() {
    navigator.clipboard.writeText(props.code.toUpperCase())
    toast.add({ title: t.value('invite_link_toast_code_copied', 'Code copied!'), color: 'primary' })
  }

  const isQrModalOpen = ref(false)
  const qrCodeDataUrl = ref('')

  async function generateQrCode() {
    try {
      const canvas = document.createElement('canvas')
      await QRCode.toCanvas(canvas, joinUrl.value, {
        width: 400,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      })
      qrCodeDataUrl.value = canvas.toDataURL('image/png')
    } catch (err) {
      console.error('Failed to generate QR code:', err)
    }
  }

  watch(isQrModalOpen, (val) => {
    if (val) {
      qrCodeDataUrl.value = ''
      void generateQrCode()
    }
  })
</script>

<template>
  <div class="flex items-center gap-2">
    <div
      class="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg group"
    >
      <span class="font-mono font-bold text-primary-600 dark:text-primary-400 tracking-wider">
        {{ code.toUpperCase() }}
      </span>
      <div class="flex items-center border-l border-gray-100 dark:border-gray-800 ml-2 pl-2 gap-1">
        <UTooltip :text="t('invite_link_copy_url', 'Copy Join URL')">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-heroicons-link"
            size="xs"
            @click="
              () => {
                void copyUrl()
              }
            "
          />
        </UTooltip>
        <UTooltip :text="t('invite_link_show_qr', 'Show QR Code')">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-heroicons-qr-code"
            size="xs"
            @click="
              () => {
                isQrModalOpen = true
              }
            "
          />
        </UTooltip>
        <UTooltip :text="t('invite_link_copy_code', 'Copy Code Only')">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-heroicons-clipboard"
            size="xs"
            @click="
              () => {
                void copyCode()
              }
            "
          />
        </UTooltip>
      </div>
    </div>

    <UModal v-model:open="isQrModalOpen" :title="t('invite_link_qr_title', 'Invite QR Code')">
      <template #body>
        <div class="flex flex-col items-center p-6 space-y-6">
          <div class="text-center space-y-1">
            <p class="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight">
              {{ t('invite_link_qr_heading', 'Scan to Join') }}
            </p>
            <p class="text-xs text-neutral-500">
              {{
                t('invite_link_qr_desc', 'Hold your camera over the code to open the join link.')
              }}
            </p>
          </div>

          <div
            class="p-4 bg-white rounded-2xl shadow-xl border-4 border-primary-500/10 transition-transform hover:scale-105 duration-300"
          >
            <img
              v-if="qrCodeDataUrl"
              :src="qrCodeDataUrl"
              class="w-64 h-64"
              :alt="t('invite_link_qr_title', 'Invite QR Code')"
            />
            <div v-else class="w-64 h-64 flex items-center justify-center">
              <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary-500" />
            </div>
          </div>

          <div
            class="w-full bg-neutral-50 dark:bg-neutral-900 p-4 rounded-xl text-center space-y-2"
          >
            <p class="text-[10px] font-black uppercase text-neutral-400">
              {{ t('invite_link_join_url_label', 'Join URL') }}
            </p>
            <p
              class="text-xs font-mono break-all text-primary-600 dark:text-primary-400 font-bold px-2"
            >
              {{ joinUrl }}
            </p>
          </div>
        </div>
      </template>
      <template #footer>
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('invite_link_close', 'Close')"
          block
          @click="
            () => {
              isQrModalOpen = false
            }
          "
        />
      </template>
    </UModal>
  </div>
</template>
