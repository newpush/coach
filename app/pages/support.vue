<template>
  <div class="py-24 sm:py-32">
    <UContainer>
      <div class="mx-auto max-w-2xl text-center mb-16">
        <h1 class="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
          Support
        </h1>
        <p class="mt-4 text-lg text-gray-600 dark:text-gray-300">
          We're here to help. Choose the channel that works best for you.
        </p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
        <!-- Community Support -->
        <UCard>
          <template #header>
            <div class="flex items-center gap-3">
              <UIcon name="i-simple-icons-discord" class="w-8 h-8 text-[#5865F2]" />
              <h2 class="text-xl font-semibold">Community Support</h2>
            </div>
          </template>

          <p class="text-gray-600 dark:text-gray-300 mb-6">
            Join our Discord server to ask questions, share feedback, and connect with other users.
            This is the fastest way to get help.
          </p>

          <template #footer>
            <UButton
              to="https://discord.gg/dPYkzg49T9"
              target="_blank"
              color="primary"
              variant="solid"
              block
              icon="i-simple-icons-discord"
            >
              Join our Discord
            </UButton>
          </template>
        </UCard>

        <!-- GitHub Issues -->
        <UCard>
          <template #header>
            <div class="flex items-center gap-3">
              <UIcon name="i-simple-icons-github" class="w-8 h-8 text-gray-900 dark:text-white" />
              <h2 class="text-xl font-semibold">GitHub Issues</h2>
            </div>
          </template>

          <p class="text-gray-600 dark:text-gray-300 mb-6">
            Found a bug or have a feature request? Open an issue on our GitHub repository to track
            its progress and contribute.
          </p>

          <template #footer>
            <UButton
              to="https://github.com/newpush/coach/issues"
              target="_blank"
              color="neutral"
              variant="solid"
              block
              icon="i-simple-icons-github"
            >
              Open an Issue
            </UButton>
          </template>
        </UCard>

        <!-- Email Support -->
        <UCard>
          <template #header>
            <div class="flex items-center gap-3">
              <UIcon name="i-heroicons-envelope" class="w-8 h-8 text-primary-500" />
              <h2 class="text-xl font-semibold">Email Support</h2>
            </div>
          </template>

          <p class="text-gray-600 dark:text-gray-300 mb-6">
            Have a specific issue or need private assistance? Send us an email and we'll get back to
            you as soon as possible.
          </p>

          <template #footer>
            <UButton
              to="mailto:support@newpush.com"
              color="neutral"
              variant="solid"
              block
              icon="i-heroicons-envelope"
            >
              Contact Support
            </UButton>
          </template>
        </UCard>
      </div>

      <!-- Contact Form -->
      <div class="mt-16 max-w-6xl mx-auto">
        <UCard>
          <template #header>
            <div class="flex items-center gap-3">
              <UIcon name="i-heroicons-chat-bubble-left-right" class="w-8 h-8 text-primary-500" />
              <h2 class="text-xl font-semibold">Send us a Message</h2>
            </div>
          </template>

          <UForm :state="form" class="grid grid-cols-1 md:grid-cols-2 gap-6" @submit="sendMessage">
            <template v-if="!isAuthenticated">
              <UFormField label="Name" name="name" required class="col-span-1">
                <UInput v-model="form.name" placeholder="Your Name" class="w-full" />
              </UFormField>
              <UFormField label="Email" name="email" required class="col-span-1">
                <UInput
                  v-model="form.email"
                  type="email"
                  placeholder="your@email.com"
                  class="w-full"
                />
              </UFormField>
            </template>
            <template v-else>
              <div class="col-span-1 md:col-span-2">
                <p class="text-sm text-gray-500">
                  Sending as <strong>{{ user?.name || user?.email }}</strong>
                </p>
              </div>
            </template>

            <UFormField label="Subject" name="subject" required class="col-span-1 md:col-span-2">
              <UInput v-model="form.subject" placeholder="What is this about?" class="w-full" />
            </UFormField>

            <UFormField label="Message" name="message" required class="col-span-1 md:col-span-2">
              <UTextarea
                v-model="form.message"
                :rows="5"
                placeholder="Describe your issue or feedback..."
                class="w-full"
              />
            </UFormField>

            <div class="col-span-1 md:col-span-2 flex justify-end">
              <UButton type="submit" :loading="loading" color="primary" size="lg">
                Send Message
              </UButton>
            </div>
          </UForm>
        </UCard>
      </div>
    </UContainer>
  </div>
</template>

<script setup lang="ts">
  const { status, data: session } = useAuth()
  const isAuthenticated = computed(() => status.value === 'authenticated')
  const user = computed(() => session.value?.user)
  const toast = useToast()

  const loading = ref(false)
  const form = reactive({
    name: '',
    email: '',
    subject: '',
    message: ''
  })

  // Pre-fill if auth (optional, backend handles it but nice for UI if we wanted to show fields)
  // But we hide fields if auth, so no need to pre-fill form model necessarily if backend takes from session.
  // However, if we want to allow user to edit, we should pre-fill.
  // For simplicity, I hid the fields if authenticated.

  async function sendMessage() {
    if (!isAuthenticated.value && (!form.name || !form.email)) {
      toast.add({ title: 'Name and Email are required', color: 'red' })
      return
    }
    if (!form.subject || !form.message) {
      toast.add({ title: 'Subject and Message are required', color: 'red' })
      return
    }

    loading.value = true
    try {
      await $fetch('/api/support/send', {
        method: 'POST',
        body: form
      })
      toast.add({ title: 'Message sent successfully!', color: 'green' })
      form.subject = ''
      form.message = ''
      // Keep name/email if guest for convenience? Or clear?
      if (!isAuthenticated.value) {
        form.name = ''
        form.email = ''
      }
    } catch (error: any) {
      toast.add({
        title: 'Failed to send message',
        description: error.message || 'Unknown error',
        color: 'red'
      })
    } finally {
      loading.value = false
    }
  }

  definePageMeta({
    layout: 'home',
    auth: false
  })

  useHead({
    title: 'Support | Coach Watts',
    meta: [
      {
        name: 'description',
        content:
          'Get help with Coach Watts. Join our Discord community or contact our support team.'
      }
    ]
  })
</script>
