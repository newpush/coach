import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

// Use DATABASE_URL_PROD if available, otherwise DATABASE_URL
const connectionString = process.env.DATABASE_URL_PROD || process.env.DATABASE_URL

if (!connectionString) {
  console.error('No database connection string found in environment variables.')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  const connStr = connectionString!
  console.log('Inspecting production database schema...')
  console.log(`Using connection string: ${connStr.replace(/:[^:]*@/, ':****@')}`) // Mask password

  try {
    // Get all tables
    const tables = (await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public';
    `) as any[]

    console.log(
      'Tables found:',
      tables.map((t) => t.table_name)
    )

    // Get all columns for all tables
    const columns = (await prisma.$queryRaw`
      SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position;
    `) as any[]

    // Group by table for easier reading
    const schema: Record<string, any[]> = {}
    for (const col of columns) {
      if (!schema[col.table_name]) {
        schema[col.table_name] = []
      }
      schema[col.table_name].push({
        name: col.column_name,
        type: col.data_type,
        nullable: col.is_nullable,
        default: col.column_default
      })
    }

    console.log(JSON.stringify(schema, null, 2))

    // Check pending migrations
    try {
      const migrations = await prisma.$queryRaw`
        SELECT * FROM "_prisma_migrations" ORDER BY "started_at" DESC LIMIT 10;
        `
      console.log('Recent migrations:', migrations)
    } catch (e) {
      console.warn('Could not query _prisma_migrations table. It might not exist.', e)
    }
  } catch (error) {
    console.error('Error querying database:', error)
  }
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
