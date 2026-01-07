import { promises as fs } from 'fs'
import path from 'path'

export default defineEventHandler(async () => {
  const config = useRuntimeConfig()
  const version = config.public.version as string

  // Construct the path to the release note file
  // We look in the public folder where release notes are stored
  const releaseNotePath = path.resolve(
    process.cwd(),
    'public',
    'content',
    'releases',
    `v${version}.md`
  )

  try {
    // Check if file exists and read it
    const content = await fs.readFile(releaseNotePath, 'utf-8')
    return {
      version,
      content
    }
  } catch (error) {
    // If file doesn't exist (e.g., minor patch without notes), return null content
    return {
      version,
      content: null
    }
  }
})
