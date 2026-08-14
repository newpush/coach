import { describe, expect, it } from 'vitest'
import { normalizeFluidFields } from '../../../../../server/utils/nutrition/totals'

// CW-586: normalizeFluidFields spreads its argument. Spreading a string explodes
// it into character-indexed keys - {...'pasta'} => {0:'p',1:'a',...} - which then
// persists as an item with no name and no macros. An athlete reported exactly
// that: nutrition entries with no description and zero calories, whose stored
// items were "strings split into objects with numeric keys".

const numericKeys = (obj: Record<string, any>) => Object.keys(obj).filter((k) => /^\d+$/.test(k))

describe('normalizeFluidFields input guard (CW-586)', () => {
  it('does not fragment a string into character-indexed keys', () => {
    const result = normalizeFluidFields('pasta' as unknown as Record<string, any>)

    expect(numericKeys(result)).toEqual([])
    expect(result.name).toBeUndefined()
  })

  it.each([null, undefined, 42, true])('tolerates %p without producing junk keys', (input) => {
    const result = normalizeFluidFields(input as unknown as Record<string, any>)

    expect(numericKeys(result)).toEqual([])
    expect(result.fluidMl).toBe(0)
  })

  it('tolerates an array without spreading its indices', () => {
    const result = normalizeFluidFields(['a', 'b'] as unknown as Record<string, any>)

    expect(numericKeys(result)).toEqual([])
  })

  // Reads run over already-stored rows, and corrupt ones exist in production -
  // this must degrade, not throw, or the affected athletes lose those tools.
  it('does not throw on malformed stored input', () => {
    expect(() => normalizeFluidFields('bad' as unknown as Record<string, any>)).not.toThrow()
  })

  it('leaves a well-formed food item intact', () => {
    const item = { name: 'Oatmeal', calories: 320, carbs: 54, protein: 11, fat: 6 }

    const result = normalizeFluidFields(item)

    expect(result).toMatchObject(item)
    expect(result.fluidMl).toBe(0)
  })

  it('still derives hydration fields for a fluid item', () => {
    const result = normalizeFluidFields({ name: 'Water', entryType: 'HYDRATION', waterMl: 500 })

    expect(result.name).toBe('Water')
    expect(result.fluidMl).toBe(500)
    expect(result.hydrationContributionMl).toBe(500)
  })
})
