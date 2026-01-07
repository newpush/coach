import 'dotenv/config'
import pg from 'pg'
import fs from 'fs'
import path from 'path'

const prodConnectionString = process.env.DATABASE_URL_PROD

if (!prodConnectionString) {
  console.error('DATABASE_URL_PROD must be set in .env')
  process.exit(1)
}

async function runMigration() {
  console.log('🚀 Starting production schema sync...')
  console.log('Connecting to production database...')

  const pool = new pg.Pool({
    connectionString: prodConnectionString
  })

  try {
    const sqlPath = path.join(process.cwd(), 'scripts', 'sync-drift.sql')
    const sql = fs.readFileSync(sqlPath, 'utf-8')

    console.log('\n📄 Executing SQL migration script:')
    console.log('-----------------------------------')
    console.log(sql)
    console.log('-----------------------------------\n')

    await pool.query(sql)

    console.log('✅ Migration executed successfully!')
    console.log('Production database is now in sync with local schema.')
  } catch (error) {
    console.error('❌ Migration failed!')
    console.error(error)
  } finally {
    await pool.end()
  }
}

runMigration()
