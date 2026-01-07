import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const pool = new pg.Pool({
  connectionString: 'postgresql://coach:3JXkrGaUZURywjZk@185.112.156.142:4426/coach'
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Inspecting FULL database schema...')

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
    const migrations = await prisma.$queryRaw`
      SELECT * FROM "_prisma_migrations" ORDER BY "started_at" DESC LIMIT 10;
    `
    console.log('Recent migrations:', migrations)
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
  })
