<template>
  <div class="py-12 sm:py-20 bg-gray-50 dark:bg-gray-950 flex-grow flex items-center">
    <UContainer class="w-full">
      <div
        class="grid lg:grid-cols-12 bg-white dark:bg-gray-900 rounded-3xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-800 min-h-[600px]">

        <!-- Left: Marketing Section -->
        <div class="lg:col-span-5 relative bg-gray-900 text-white p-8 sm:p-12 flex flex-col justify-between">
          <!-- Background Image with Overlay -->
          <div class="absolute inset-0 z-0">
            <img src="https://images.unsplash.com/photo-1517649763962-0c623066013b?q=80&w=2670&auto=format&fit=crop"
              alt="Endurance Sports" class="w-full h-full object-cover opacity-40" />
            <div class="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/40 to-transparent"></div>
          </div>

          <!-- Content -->
          <div class="relative z-10">
            <div
              class="w-12 h-12 bg-primary/20 backdrop-blur-sm rounded-xl flex items-center justify-center mb-8 text-primary">
              <UIcon name="i-heroicons-cpu-chip" class="w-6 h-6" />
            </div>

            <h2 class="text-3xl font-bold leading-tight mb-4">
              Your Digital Twin <br />
              <span class="text-primary">Awaits</span>
            </h2>
            <p class="text-gray-300 text-lg leading-relaxed">
              Access your personalized athlete profile, daily AI coaching, and recovery analytics.
            </p>
          </div>

          <div class="relative z-10 mt-12">
            <div class="flex -space-x-3 mb-4">
              <UAvatar src="https://i.pravatar.cc/150?u=1" alt="User" size="sm" class="ring-2 ring-gray-900" />
              <UAvatar src="https://i.pravatar.cc/150?u=2" alt="User" size="sm" class="ring-2 ring-gray-900" />
              <UAvatar src="https://i.pravatar.cc/150?u=3" alt="User" size="sm" class="ring-2 ring-gray-900" />
              <div
                class="w-8 h-8 rounded-full bg-gray-800 ring-2 ring-gray-900 flex items-center justify-center text-xs font-bold text-white">
                +2k
              </div>
            </div>
            <p class="text-sm font-medium text-gray-400">
              Join 2,000+ athletes training smarter.
            </p>
          </div>
        </div>

        <!-- Right: Auth Form -->
        <div class="lg:col-span-7 p-8 sm:p-12 flex flex-col justify-center bg-white dark:bg-gray-900">
          <div class="max-w-md mx-auto w-full">
            <div class="mb-10">
              <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-3">
                Welcome Back
              </h1>
              <p class="text-gray-500 dark:text-gray-400 text-lg">
                Sign in to access your dashboard.
              </p>
            </div>

            <div class="space-y-4">
              <UButton block size="xl" icon="i-lucide-chrome" color="primary" variant="solid"
                class="shadow-sm hover:bg-primary-600 transition-all py-4" :loading="loading"
                @click="handleGoogleLogin">
                Continue with Google
              </UButton>

              <UButton block size="xl" icon="i-heroicons-chart-bar" color="neutral" variant="outline"
                class="shadow-sm py-4" :loading="loadingIntervals"
                @click="handleIntervalsLogin">
                Continue with Intervals.icu
              </UButton>

              <div class="relative">
                <div class="absolute inset-0 flex items-center">
                  <span class="w-full border-t border-gray-200 dark:border-gray-700" />
                </div>
                <div class="relative flex justify-center text-sm">
                  <span class="bg-white dark:bg-gray-900 px-2 text-gray-500">Secure OAuth Login</span>
                </div>
              </div>
            </div>

            <div class="mt-10 text-center space-y-4">
              <p class="text-sm text-gray-600 dark:text-gray-400">
                New athlete?
                <NuxtLink to="/join" class="text-primary hover:underline underline-offset-4 font-semibold">Create an
                  account</NuxtLink>
              </p>

              <p class="text-xs text-gray-400 dark:text-gray-500 pt-4">
                By continuing, you agree to our
                <NuxtLink to="#" class="text-primary hover:underline underline-offset-4">Terms of Service</NuxtLink>
                and
                <NuxtLink to="#" class="text-primary hover:underline underline-offset-4">Privacy Policy</NuxtLink>.
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
  title: 'Login',
  meta: [
    { name: 'description', content: 'Login to your Coach Watts account to access your personalized training dashboard.' }
  ]
})

const loading = ref(false)
const loadingIntervals = ref(false)

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

async function handleIntervalsLogin() {
  loadingIntervals.value = true
  try {
    await signIn('intervals', { callbackUrl: '/dashboard' })
  } catch (error: any) {
    toast.add({
      title: 'Login Failed',
      description: error.message || 'Could not initiate Intervals login.',
      color: 'error'
    })
    loadingIntervals.value = false
  }
}
</script>
