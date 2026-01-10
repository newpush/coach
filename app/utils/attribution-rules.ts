export interface AttributionRule {
  logoLight: string
  logoDark: string
  requiresDeviceName: boolean
  // Function to format the text displayed next to the logo
  textFormat: (deviceName?: string) => string
  // Optional width constraint for the logo to ensure visual consistency
  logoHeightClass: string
}

export const ATTRIBUTION_RULES: Record<string, AttributionRule> = {
  garmin: {
    logoLight: '/images/logos/Garmin-Tag-black-high-res.png',
    logoDark: '/images/logos/Garmin-Tag-white-high-res.png',
    requiresDeviceName: true,
    textFormat: (deviceName) => deviceName || 'Device',
    logoHeightClass: 'h-6'
  },
  strava: {
    logoLight: '/images/logos/strava_powered_by.png',
    logoDark: '/images/logos/strava_powered_by.png', // Strava usually has a single "Powered by" asset
    requiresDeviceName: false,
    textFormat: () => '', // Text is embedded in the logo
    logoHeightClass: 'h-8' // Strava logo often needs to be slightly larger to be legible
  }
  // Future providers can be added here
}

export function getAttributionRule(provider: string): AttributionRule | undefined {
  return ATTRIBUTION_RULES[provider?.toLowerCase()]
}
