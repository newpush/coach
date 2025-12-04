<template>
  <div class="min-h-screen flex flex-col font-sans bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
    <header class="sticky top-0 z-50 bg-white/75 dark:bg-gray-950/75 backdrop-blur border-b border-gray-200 dark:border-gray-800">
      <UContainer class="h-16 flex items-center justify-between">
        <NuxtLink to="/home" class="flex items-center gap-2 font-bold text-xl hover:text-primary transition-colors">
          <UIcon name="i-lucide-zap" class="w-6 h-6 text-primary" />
          Coach Watts
        </NuxtLink>
        
        <nav class="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600 dark:text-gray-300">
          <NuxtLink to="#features" class="hover:text-primary transition-colors">Features</NuxtLink>
          <NuxtLink to="#pricing" class="hover:text-primary transition-colors">Pricing</NuxtLink>
          <NuxtLink to="/stories" class="hover:text-primary transition-colors">Stories</NuxtLink>
        </nav>

        <div class="flex items-center gap-2">
          <UButton to="/login" variant="ghost" color="gray">Sign In</UButton>
          <UButton to="/login" color="primary">Get Started</UButton>
          <ColorModeButton />
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
            <div class="flex items-center gap-2 font-bold text-xl mb-4">
              <UIcon name="i-lucide-zap" class="w-6 h-6 text-primary" />
              Coach Watts
            </div>
            <p class="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
              AI-powered cycling coaching that adapts to your life, recovery, and goals.
            </p>
          </div>
          <div>
            <h3 class="font-semibold mb-4">Product</h3>
            <ul class="space-y-2 text-sm text-gray-500 dark:text-gray-400">
              <li><NuxtLink to="#features" class="hover:text-primary">Features</NuxtLink></li>
              <li><NuxtLink to="#pricing" class="hover:text-primary">Pricing</NuxtLink></li>
              <li><NuxtLink to="/login" class="hover:text-primary">Login</NuxtLink></li>
            </ul>
          </div>
          <div>
            <h3 class="font-semibold mb-4">Legal</h3>
            <ul class="space-y-2 text-sm text-gray-500 dark:text-gray-400">
              <li><a href="#" class="hover:text-primary">Privacy</a></li>
              <li><a href="#" class="hover:text-primary">Terms</a></li>
            </ul>
          </div>
        </div>
        <div class="flex flex-col md:flex-row justify-between items-center gap-4 pt-8 border-t border-gray-200 dark:border-gray-800">
          <div class="text-sm text-gray-500">
            © {{ new Date().getFullYear() }} Coach Watts. All rights reserved.
          </div>
          <div class="flex gap-4">
            <UButton icon="i-lucide-twitter" color="gray" variant="ghost" to="https://twitter.com" target="_blank" />
            <UButton icon="i-lucide-github" color="gray" variant="ghost" to="https://github.com" target="_blank" />
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
