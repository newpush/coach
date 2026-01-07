<template>
  <div
    class="min-h-screen flex flex-col font-sans bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
  >
    <header
      class="sticky top-0 z-50 bg-white/75 dark:bg-gray-950/75 backdrop-blur border-b border-gray-200 dark:border-gray-800"
    >
      <UContainer class="h-16 flex items-center justify-between">
        <NuxtLink to="/" class="flex items-center hover:opacity-90 transition-opacity">
          <img src="/media/coach-watts.webp" alt="Coach Watts" class="h-12 w-auto object-contain" />
        </NuxtLink>

        <nav
          class="hidden lg:flex items-center gap-6 text-sm font-medium text-gray-600 dark:text-gray-300"
        >
          <NuxtLink to="/#how-it-works" class="hover:text-primary transition-colors"
            >How it Works</NuxtLink
          >
          <NuxtLink
            to="/#pricing"
            class="hover:text-primary transition-colors flex items-center gap-1"
          >
            Pricing
            <UBadge size="xs" color="primary" variant="soft" class="font-bold">Free</UBadge>
          </NuxtLink>
          <NuxtLink to="/stories" class="hover:text-primary transition-colors">Stories</NuxtLink>
        </nav>

        <div class="flex items-center gap-2">
          <div class="hidden sm:flex items-center gap-2">
            <UButton to="/login" variant="ghost" color="gray">Sign In</UButton>
            <UButton to="/join" color="primary">Get Started</UButton>
          </div>
          <ColorModeButton />

          <UPopover class="lg:hidden">
            <UButton icon="i-lucide-menu" color="gray" variant="ghost" />
            <template #content>
              <div class="p-4 w-48 flex flex-col gap-4">
                <NuxtLink
                  to="/#how-it-works"
                  class="text-sm font-medium hover:text-primary transition-colors"
                  >How it Works</NuxtLink
                >
                <NuxtLink
                  to="/#pricing"
                  class="text-sm font-medium hover:text-primary transition-colors flex items-center justify-between"
                >
                  Pricing
                  <UBadge size="xs" color="primary" variant="soft" class="font-bold">Free</UBadge>
                </NuxtLink>
                <NuxtLink
                  to="/stories"
                  class="text-sm font-medium hover:text-primary transition-colors"
                  >Stories</NuxtLink
                >
                <hr class="border-gray-200 dark:border-gray-800" />
                <UButton to="/login" variant="ghost" color="gray" block>Sign In</UButton>
                <UButton to="/join" color="primary" block>Get Started</UButton>
              </div>
            </template>
          </UPopover>
        </div>
      </UContainer>
    </header>

    <main class="flex-grow">
      <slot />
    </main>

    <footer class="border-t border-gray-200 dark:border-gray-800 py-12 bg-gray-50 dark:bg-gray-900">
      <UContainer>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div class="md:col-span-2">
            <NuxtLink to="/" class="flex items-center mb-4 hover:opacity-90 transition-opacity">
              <img
                src="/media/coach-watts.webp"
                alt="Coach Watts"
                class="h-16 w-auto object-contain"
              />
            </NuxtLink>
            <p class="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
              AI-powered endurance coaching that adapts to your life, recovery, and goals.
            </p>
          </div>
          <div>
            <h3 class="font-semibold mb-4">Product</h3>
            <ul class="space-y-2 text-sm text-gray-500 dark:text-gray-400">
              <li>
                <NuxtLink to="/#features" class="hover:text-primary">Features</NuxtLink>
              </li>
              <li>
                <NuxtLink to="/#architecture" class="hover:text-primary">Architecture</NuxtLink>
              </li>
              <li>
                <NuxtLink to="/#pricing" class="hover:text-primary flex items-center gap-1">
                  Pricing
                  <UBadge size="xs" color="primary" variant="soft" class="font-bold">Free</UBadge>
                </NuxtLink>
              </li>
              <li>
                <NuxtLink to="/login" class="hover:text-primary">Login</NuxtLink>
              </li>
            </ul>
          </div>
          <div>
            <h3 class="font-semibold mb-4">Legal</h3>
            <ul class="space-y-2 text-sm text-gray-500 dark:text-gray-400">
              <li>
                <NuxtLink to="/privacy" class="hover:text-primary">Privacy</NuxtLink>
              </li>
              <li>
                <NuxtLink to="/terms" class="hover:text-primary">Terms</NuxtLink>
              </li>
            </ul>
          </div>
        </div>
        <div
          class="flex flex-col md:flex-row justify-between items-center gap-4 pt-8 border-t border-gray-200 dark:border-gray-800"
        >
          <div class="text-sm text-gray-500">
            © {{ new Date().getFullYear() }} Coach Watts. All rights reserved.
          </div>
          <div class="flex gap-4">
            <UButton
              icon="i-lucide-twitter"
              color="gray"
              variant="ghost"
              to="https://twitter.com"
              target="_blank"
            />
          </div>
        </div>
      </UContainer>
    </footer>
  </div>
</template>

<script setup>
  // Minimal ColorModeButton component inline or assumed to exist.
  // If not, I'll remove it or create it. I'll check app/components later.
  // For now, I'll assume standard UButton works for toggling if I add logic.
  // I'll create a simple ColorModeButton component if needed.
</script>
