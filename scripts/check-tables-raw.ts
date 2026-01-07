import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import pkg from 'pg'
const { Pool } = pkg

// Create a raw PG pool to bypass Prisma for the schema check
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
})

async function main() {
  const client = await pool.connect()

  try {
    console.log('Checking database tables...')
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `)

    console.log(
      'Tables found in database:',
      res.rows.map((r) => r.table_name)
    )

    const fitFileTable = res.rows.find((r) => r.table_name === 'FitFile')
    if (fitFileTable) {
      console.log('✅ FitFile table exists')
    } else {
      console.log('❌ FitFile table DOES NOT exist')

      // Check for case sensitivity issues
      const lowerCaseFitFile = res.rows.find((r) => r.table_name.toLowerCase() === 'fitfile')
      if (lowerCaseFitFile) {
        console.log(
          `⚠️ Found table '${lowerCaseFitFile.table_name}' instead. This might be a casing issue.`
        )
      }
    }
  } catch (e) {
    console.error('Error:', e)
  } finally {
    client.release()
    await pool.end()
  }
}

main()
