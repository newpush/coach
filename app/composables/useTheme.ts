export const useTheme = () => {
  const appConfig = useAppConfig()
  const colorMode = useColorMode()

  const isDark = computed(() => colorMode.value === 'dark')

  // Helper to get hex color from Tailwind color name
  // This is a simplified mapping. For a full production system, you might want to use a library or a more complete map.
  // Using standard Tailwind 500/600 shades for light/dark modes
  const getHex = (colorName: string, shade: number = 500) => {
    // These are approximations for standard Tailwind colors to be used in Canvas/Charts
    // where CSS classes can't be used directly.
    const colors: Record<string, Record<number, string>> = {
      green: { 400: '#4ade80', 500: '#22c55e', 600: '#16a34a' },
      amber: { 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706' },
      red: { 400: '#f87171', 500: '#ef4444', 600: '#dc2626' },
      blue: { 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb' },
      zinc: { 400: '#a1a1aa', 500: '#71717a', 600: '#52525b', 800: '#27272a' },
      purple: { 400: '#c084fc', 500: '#a855f7', 600: '#9333ea' },
      cyan: { 400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2' }
    }

    return colors[colorName]?.[shade] || colors.zinc?.[500] || '#71717a'
  }

  // Semantic color getters that adapt to light/dark mode
  const themeColors = computed(() => {
    // We default to the primary color configured in app.config
    const primary = appConfig.ui.colors.primary
    const success = 'green'
    const warning = 'amber'
    const error = 'red'
    const info = 'blue'

    return {
      primary: isDark.value ? getHex(primary, 400) : getHex(primary, 600),
      success: isDark.value ? getHex(success, 400) : getHex(success, 600),
      warning: isDark.value ? getHex(warning, 400) : getHex(warning, 600),
      error: isDark.value ? getHex(error, 400) : getHex(error, 600),
      info: isDark.value ? getHex(info, 400) : getHex(info, 600),

      // Category Specific
      performance: isDark.value ? getHex('amber', 400) : getHex('amber', 600),
      wellness: isDark.value ? getHex('indigo', 400) : getHex('indigo', 600),
      nutrition: isDark.value ? getHex('purple', 400) : getHex('purple', 600),
      effort: isDark.value ? getHex('rose', 400) : getHex('rose', 600),

      // Chart specific
      chartGrid: isDark.value ? 'rgba(75, 85, 99, 0.2)' : 'rgba(229, 231, 235, 0.5)',
      chartText: isDark.value ? '#9ca3af' : '#4b5563', // gray-400 / gray-600

      // Raw hex access for custom needs
      get: getHex
    }
  })

  return {
    isDark,
    colors: themeColors
  }
}
