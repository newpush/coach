import { randomBytes, createHash } from 'node:crypto'

export const generateApiKey = () => {
  // Generate 32 bytes of random data for the key
  const buffer = randomBytes(32)
  const key = `cw_${buffer.toString('hex')}`
  const prefix = key.slice(0, 7) // cw_ + 4 chars

  return {
    key,
    prefix
  }
}

export const hashApiKey = (key: string) => {
  return createHash('sha256').update(key).digest('hex')
}
