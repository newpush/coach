import { readFile, writeFile } from 'fs/promises'
import { join, relative, dirname } from 'path'
import { glob } from 'glob'

/**
 * Script to fix all getServerSession imports in server/api endpoints
 * to use the centralized session utility that handles impersonation
 */

async function fixSessionImports() {
  console.log('🔍 Finding all API files that import from #auth...')

  // Find all TypeScript files in server/api
  const files = await glob('server/api/**/*.ts', {
    ignore: ['**/node_modules/**']
  })

  console.log(`📁 Found ${files.length} API files`)

  let fixedCount = 0
  let skippedCount = 0

  for (const file of files) {
    try {
      const content = await readFile(file, 'utf-8')

      // Check if file imports getServerSession from #auth
      if (!content.includes("from '#auth'") || !content.includes('getServerSession')) {
        skippedCount++
        continue
      }

      // Calculate relative path to utils/session.ts
      const fileDir = dirname(file)
      const sessionUtilPath = join(process.cwd(), 'server/utils/session.ts')
      let relativePath = relative(fileDir, sessionUtilPath)

      // Ensure it starts with ./ or ../
      if (!relativePath.startsWith('.')) {
        relativePath = './' + relativePath
      }

      // Remove .ts extension for import
      relativePath = relativePath.replace(/\.ts$/, '')

      // Replace the import
      const newContent = content.replace(
        /import\s*{\s*getServerSession\s*}\s*from\s*['"]#auth['"]/g,
        `import { getServerSession } from '${relativePath}'`
      )

      if (newContent !== content) {
        await writeFile(file, newContent, 'utf-8')
        console.log(`✅ Fixed: ${file}`)
        fixedCount++
      } else {
        console.log(`⚠️  Skipped (pattern not matched): ${file}`)
        skippedCount++
      }
    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error)
    }
  }

  console.log('\n📊 Summary:')
  console.log(`   Fixed: ${fixedCount} files`)
  console.log(`   Skipped: ${skippedCount} files`)
  console.log('   Total: ' + files.length + ' files')
  console.log('\n✨ Done! All API endpoints now use the centralized session utility.')
}

fixSessionImports().catch(console.error)
