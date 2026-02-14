/**
 * Nutrition Absorption Constants and Mapping
 * Used in the UI for selecting and displaying absorption profiles.
 * Core computation logic has been moved to server/utils/nutrition-domain.
 */

export const ABSORPTION_PROFILES = {
  RAPID: {
    id: 'RAPID' as const,
    label: 'Rapid (Gels/Liquids)',
    delay: 5,
    peak: 15, // Total 20 min from consumption
    duration: 45,
    k: 2
  },
  FAST: {
    id: 'FAST' as const,
    label: 'Fast (Fruit/White Bread)',
    delay: 10,
    peak: 30, // Total 40 min from consumption
    duration: 90,
    k: 3
  },
  BALANCED: {
    id: 'BALANCED' as const,
    label: 'Balanced (Oats/Pasta)',
    delay: 30,
    peak: 60, // Total 90 min from consumption
    duration: 180,
    k: 3
  },
  DENSE: {
    id: 'DENSE' as const,
    label: 'Dense (Protein/Fats/Fiber)',
    delay: 45,
    peak: 120, // Total 165 min from consumption
    duration: 300,
    k: 4
  },
  HYPER_LOAD: {
    id: 'HYPER_LOAD' as const,
    label: 'Hyper-Load (Large Meal)',
    delay: 60,
    peak: 180, // Total 240 min from consumption
    duration: 480,
    k: 5
  }
}

export type AbsorptionType = keyof typeof ABSORPTION_PROFILES
export type AbsorptionProfile = (typeof ABSORPTION_PROFILES)[AbsorptionType]

/**
 * Maps a food item to its absorption profile
 */
export function getProfileForItem(itemName: string): AbsorptionProfile {
  const name = itemName.toLowerCase()

  // RAPID: Liquid/Gel
  if (
    name.includes('gel') ||
    name.includes('liquid') ||
    name.includes('drink') ||
    name.includes('juice') ||
    name.includes('honey') ||
    name.includes('sugar') ||
    name.includes('glucose') ||
    name.includes('maltodextrin')
  ) {
    return ABSORPTION_PROFILES.RAPID
  }

  // FAST: Fruit/White Bread
  if (
    name.includes('banana') ||
    name.includes('date') ||
    name.includes('white bread') ||
    name.includes('toast') ||
    name.includes('jam') ||
    name.includes('syrup') ||
    name.includes('candy') ||
    name.includes('gummy')
  ) {
    return ABSORPTION_PROFILES.FAST
  }

  // BALANCED: Oats/Pasta
  if (
    name.includes('oats') ||
    name.includes('pasta') ||
    name.includes('rice') ||
    name.includes('potato') ||
    name.includes('cereal') ||
    name.includes('bagel') ||
    name.includes('bar')
  ) {
    return ABSORPTION_PROFILES.BALANCED
  }

  // DENSE: Protein/Fats/Fiber
  if (
    name.includes('meat') ||
    name.includes('chicken') ||
    name.includes('beef') ||
    name.includes('steak') ||
    name.includes('egg') ||
    name.includes('nut') ||
    name.includes('butter') ||
    name.includes('oil') ||
    name.includes('avocado') ||
    name.includes('fiber') ||
    name.includes('whole grain') ||
    name.includes('salad') ||
    name.includes('veg')
  ) {
    return ABSORPTION_PROFILES.DENSE
  }

  // Default to BALANCED for generic meals, HYPER_LOAD is usually assigned by AI for "Large Meal"
  return ABSORPTION_PROFILES.BALANCED
}
