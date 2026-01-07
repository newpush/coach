<template>
  <div class="py-12 sm:py-20 bg-gray-50 dark:bg-gray-950 flex-grow flex items-center">
    <UContainer class="w-full">
      <div
        class="grid lg:grid-cols-12 bg-white dark:bg-gray-900 rounded-3xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-800 min-h-[600px]"
      >
        <!-- Left: Marketing Section -->
        <div
          class="lg:col-span-5 relative bg-gray-900 text-white p-8 sm:p-12 flex flex-col justify-between overflow-hidden"
        >
          <!-- Animated Matrix Background -->
          <div class="absolute inset-0 z-0">
            <div
              class="absolute inset-0 opacity-20 bg-[url('https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbm95MXY4Z3Y0Z3Y0Z3Y0Z3Y0Z3Y0Z3Y0Z3Y0Z3Y0Z3Y0Z3Y0/U3qYN8S0j3bpK/giphy.gif')] bg-cover mix-blend-screen pointer-events-none"
            />
            <div
              class="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/60 to-transparent"
            />
          </div>

          <!-- Content -->
          <div class="relative z-10">
            <div
              class="w-12 h-12 bg-primary/20 backdrop-blur-sm rounded-xl flex items-center justify-center mb-8 text-primary ring-1 ring-primary/50 group"
            >
              <UIcon name="i-heroicons-sparkles" class="w-6 h-6 group-hover:animate-spin" />
            </div>

            <h2 class="text-3xl font-bold leading-tight mb-2 tracking-tight">
              Initialize Your <br />
              <span class="text-primary typing-effect">Digital Twin</span>
            </h2>
            <p class="text-gray-400 text-sm font-medium uppercase tracking-wider mb-8">
              Start your evolution today
            </p>

            <!-- Chat Simulation -->
            <div class="space-y-4 mb-8">
              <!-- User Message -->
              <div class="flex justify-end">
                <div
                  class="bg-gray-800 rounded-2xl rounded-tr-sm px-4 py-2 text-sm text-gray-200 max-w-[85%] border border-gray-700"
                >
                  My legs feel super heavy today. Should I push through?
                </div>
              </div>

              <!-- AI Response -->
              <div class="flex justify-start items-end gap-2">
                <div
                  class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 border border-primary/30"
                >
                  <UIcon name="i-heroicons-sparkles" class="w-4 h-4 text-primary" />
                </div>
                <div
                  class="bg-primary/10 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-white max-w-[90%] border border-primary/20 backdrop-blur-sm shadow-sm"
                >
                  <p class="mb-2">
                    I noticed your
                    <span class="text-primary font-bold">HRV dropped to 28ms</span> overnight. 📉
                  </p>
                  <p>
                    Let's swap your intervals for a
                    <span class="font-bold text-white bg-white/10 px-1 rounded"
                      >Zone 2 Recovery Ride</span
                    >. We'll get back to intensity tomorrow when you're primed.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div
            class="relative z-10 mt-12 bg-gray-800/50 rounded-xl p-4 backdrop-blur-sm border border-gray-700/50"
          >
            <div class="flex items-center gap-3 mb-2">
              <div class="flex -space-x-2">
                <UAvatar
                  src="https://i.pravatar.cc/150?u=4"
                  size="2xs"
                  class="ring-1 ring-gray-900"
                />
                <UAvatar
                  src="https://i.pravatar.cc/150?u=8"
                  size="2xs"
                  class="ring-1 ring-gray-900"
                />
                <UAvatar
                  src="https://i.pravatar.cc/150?u=12"
                  size="2xs"
                  class="ring-1 ring-gray-900"
                />
              </div>
              <div class="text-xs text-gray-300">
                <span class="text-primary font-bold">2,412</span> athletes active today
              </div>
            </div>
            <div class="flex items-center gap-2 text-[10px] text-gray-400 font-mono">
              <span class="relative flex h-2 w-2">
                <span
                  class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"
                />
                <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <span class="typing-text">🔥 12 athletes hit a PB in the last hour</span>
            </div>
            <p class="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mt-3">
              Works with your favorite fitness trackers
            </p>
          </div>
        </div>
        <!-- Right: Auth Form -->
        <div
          class="lg:col-span-7 p-8 sm:p-12 flex flex-col justify-center bg-gray-900 border-l border-gray-800"
        >
          <div class="max-w-md mx-auto w-full">
            <div class="mb-10">
              <h1 class="text-3xl font-bold text-white mb-3">Get Started</h1>
              <p class="text-gray-400 text-lg">
                Create your Coach Watts account. No credit card required.
              </p>
            </div>

            <div class="space-y-6">
              <UButton
                block
                size="xl"
                icon="i-lucide-chrome"
                color="primary"
                variant="solid"
                class="shadow-sm hover:bg-primary-600 transition-all py-4"
                :loading="loading"
                @click="handleGoogleLogin"
              >
                Create Account with Google
              </UButton>

              <div class="relative">
                <div class="absolute inset-0 flex items-center">
                  <span class="w-full border-t border-gray-800" />
                </div>
                <div class="relative flex justify-center text-sm">
                  <span class="bg-gray-900 px-2 text-gray-500">Only Google Login supported</span>
                </div>
              </div>
            </div>

            <div class="mt-10 text-center space-y-4">
              <p class="text-sm text-gray-400">
                Already have an account?
                <NuxtLink
                  to="/login"
                  class="text-primary hover:underline underline-offset-4 font-semibold"
                  >Log in
                </NuxtLink>
              </p>

              <p class="text-xs text-gray-500 pt-4">
                By continuing, you agree to our
                <NuxtLink to="#" class="text-primary hover:underline underline-offset-4"
                  >Terms of Service</NuxtLink
                >
                and
                <NuxtLink to="#" class="text-primary hover:underline underline-offset-4"
                  >Privacy Policy </NuxtLink
                >.
              </p>
            </div>
          </div>
        </div>
      </div>
    </UContainer>
  </div>
</template>

<script setup lang="ts">
  const { signIn } = useAuth()
  const toast = useToast()

  definePageMeta({
    layout: 'home',
    middleware: ['guest'],
    auth: false
  })

  useHead({
    title: 'Join Coach Watts',
    meta: [
      {
        name: 'description',
        content:
          'Create your Coach Watts account and start training smarter with your AI digital twin.'
      }
    ]
  })

  const loading = ref(false)

  async function handleGoogleLogin() {
    loading.value = true
    try {
      await signIn('google', { callbackUrl: '/dashboard' })
    } catch (error: any) {
      toast.add({
        title: 'Login Failed',
        description: error.message || 'Could not initiate Google login.',
        color: 'error'
      })
      loading.value = false
    }
  }
</script>

<style scoped>
  .typing-effect {
    overflow: hidden;
    white-space: nowrap;
    animation: typing 3.5s steps(40, end);
  }
</style>
