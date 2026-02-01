import { describe, it, expect } from 'vitest'
import { profileUpdateSchema } from '../../../../../server/utils/schemas/profile'

describe('profileUpdateSchema', () => {
  it('should allow null for sex', () => {
    const result = profileUpdateSchema.safeParse({
      sex: null
    })
    expect(result.success).toBe(true)
  })

  it('should allow valid sex values', () => {
    const validValues = ['Male', 'Female', 'Other', 'M', 'F']
    validValues.forEach((sex) => {
      const result = profileUpdateSchema.safeParse({ sex })
      expect(result.success).toBe(true)
    })
  })

  it('should reject invalid sex values', () => {
    const result = profileUpdateSchema.safeParse({
      sex: 'Invalid'
    })
    expect(result.success).toBe(false)
  })

  it('should allow null for name', () => {
    const result = profileUpdateSchema.safeParse({
      name: null
    })
    expect(result.success).toBe(true)
  })

  it('should allow valid name', () => {
    const result = profileUpdateSchema.safeParse({
      name: 'John Doe'
    })
    expect(result.success).toBe(true)
  })
})
