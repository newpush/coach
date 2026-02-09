<template>
  <div
    class="flex flex-col items-center justify-center h-full text-center p-6 text-gray-500 dark:text-gray-400"
  >
    <div class="mb-6 p-4 rounded-full bg-primary-50 dark:bg-primary-900/20">
      <UIcon name="i-heroicons-sparkles" class="w-10 h-10 text-primary-500" />
    </div>
    <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">Welcome to your AI Coach!</h3>
    <p class="max-w-sm mb-8 text-sm">
      I'm here to help you analyze your training, optimize your nutrition, and reach your endurance
      goals.
    </p>

    <div class="grid gap-4 max-w-sm w-full text-left">
      <div
        class="flex items-start gap-3 p-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm hover:border-primary-200 dark:hover:border-primary-800 transition-colors"
      >
        <div class="p-2 rounded-lg bg-primary-50 dark:bg-primary-950/50 shrink-0">
          <UIcon name="i-heroicons-chat-bubble-left-right" class="w-5 h-5 text-primary-500" />
        </div>
        <div>
          <span class="font-bold text-gray-900 dark:text-white block text-sm mb-0.5"
            >Start Fresh</span
          >
          <span class="text-xs leading-relaxed"
            >Open new chats frequently. Keeping conversations focused helps me give better
            advice.</span
          >
        </div>
      </div>

      <div
        class="flex items-start gap-3 p-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm hover:border-primary-200 dark:hover:border-primary-800 transition-colors"
      >
        <div class="p-2 rounded-lg bg-primary-50 dark:bg-primary-950/50 shrink-0">
          <UIcon name="i-heroicons-bolt" class="w-5 h-5 text-primary-500" />
        </div>
        <div>
          <span class="font-bold text-gray-900 dark:text-white block text-sm mb-0.5"
            >Be Specific</span
          >
          <span class="text-xs leading-relaxed"
            >Ask about specific workouts, health metrics, or race goals for the most accurate
            analysis.</span
          >
        </div>
      </div>

      <!-- Disclaimer -->
      <div
        class="mt-4 flex items-center gap-2 p-3 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30 text-orange-600 dark:text-orange-400"
      >
        <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 shrink-0" />
        <span class="text-[10px] leading-tight text-left"
          >Coach Watts is an AI assistant and may make mistakes. Always listen to your body and
          verify critical training advice.</span
        >
      </div>
    </div>
  </div>
</template>
