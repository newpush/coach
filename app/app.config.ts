export default defineAppConfig({
  ui: {
    colors: {
      primary: 'green',
      gray: 'neutral',
      neutral: 'zinc',
      success: 'green',
      warning: 'amber',
      error: 'red',
      info: 'blue'
    },
    // Custom design tokens overrides
    card: {
      slots: {
        // root: 'bg-white dark:bg-gray-900 rounded-xl shadow-sm ring-1 ring-gray-200 dark:ring-gray-800',
        body: 'p-4 sm:p-6',
        header: 'p-4 sm:p-6',
        footer: 'p-4 sm:p-6'
      }
    },
    button: {
      defaultVariants: {
        size: 'md'
      }
    },
    modal: {
      slots: {
        overlay: 'backdrop-blur-sm',
        content: 'rounded-xl shadow-xl ring-1 ring-gray-200 dark:ring-gray-800'
      }
    }
  },
  // Custom design tokens for consistent usage
  theme: {
    colors: {
      success: 'green',
      warning: 'amber',
      error: 'red',
      info: 'blue'
    }
  }
})
