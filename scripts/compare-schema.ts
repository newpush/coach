import 'dotenv/config'
import pg from 'pg'

const localConnectionString = process.env.DATABASE_URL
const prodConnectionString = process.env.DATABASE_URL_PROD

if (!localConnectionString || !prodConnectionString) {
  console.error('Both DATABASE_URL and DATABASE_URL_PROD must be set in .env')
  process.exit(1)
}

interface ColumnInfo {
  column_name: string
  data_type: string
  is_nullable: string
  column_default: string | null
}

interface IndexInfo {
  indexname: string
  indexdef: string
}

async function getTables(pool: pg.Pool) {
  const query = `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `
  const result = await pool.query(query)
  return result.rows.map((row) => row.table_name)
}

async function getTableSchema(pool: pg.Pool, tableName: string) {
  const query = `
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = $1
    ORDER BY column_name;
  `
  const result = await pool.query(query, [tableName])

  const indexesQuery = `
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = $1
      ORDER BY indexname;
  `
  const indexesResult = await pool.query(indexesQuery, [tableName])

  return {
    columns: result.rows as ColumnInfo[],
    indexes: indexesResult.rows as IndexInfo[]
  }
}

async function compareSchemas() {
  console.log('Comparing Full Database Schema: Local vs Production...\n')

  const localPool = new pg.Pool({ connectionString: localConnectionString })
  const prodPool = new pg.Pool({ connectionString: prodConnectionString })

  try {
    const localTables = await getTables(localPool)
    const prodTables = await getTables(prodPool)

    const allTables = new Set([...localTables, ...prodTables])
    let totalDifferences = 0

    for (const tableName of Array.from(allTables).sort()) {
      if (tableName === '_prisma_migrations') continue // Skip migrations table

      const isLocal = localTables.includes(tableName)
      const isProd = prodTables.includes(tableName)

      if (!isLocal) {
        console.log(`❌ Table '${tableName}' is missing in LOCAL database`)
        totalDifferences++
        continue
      }
      if (!isProd) {
        console.log(`❌ Table '${tableName}' is missing in PRODUCTION database`)
        totalDifferences++
        continue
      }

      const localSchema = await getTableSchema(localPool, tableName)
      const prodSchema = await getTableSchema(prodPool, tableName)

      // Compare Columns
      const allColumns = new Set([
        ...localSchema.columns.map((c) => c.column_name),
        ...prodSchema.columns.map((c) => c.column_name)
      ])

      let tableHasDifferences = false
      const diffs: string[] = []

      for (const colName of Array.from(allColumns).sort()) {
        const localCol = localSchema.columns.find((c) => c.column_name === colName)
        const prodCol = prodSchema.columns.find((c) => c.column_name === colName)

        if (!localCol) {
          diffs.push(`  - Column '${colName}' missing in LOCAL`)
          tableHasDifferences = true
        } else if (!prodCol) {
          diffs.push(`  - Column '${colName}' missing in PROD`)
          tableHasDifferences = true
        } else if (
          localCol.data_type !== prodCol.data_type ||
          localCol.is_nullable !== prodCol.is_nullable
        ) {
          diffs.push(
            `  - Column '${colName}' mismatch: Local[${localCol.data_type}, ${localCol.is_nullable}] vs Prod[${prodCol.data_type}, ${prodCol.is_nullable}]`
          )
          tableHasDifferences = true
        }
      }

      // Compare Indexes
      const allIndexes = new Set([
        ...localSchema.indexes.map((i) => i.indexname),
        ...prodSchema.indexes.map((i) => i.indexname)
      ])

      for (const indexName of Array.from(allIndexes).sort()) {
        const localIndex = localSchema.indexes.find((i) => i.indexname === indexName)
        const prodIndex = prodSchema.indexes.find((i) => i.indexname === indexName)

        if (!localIndex) {
          diffs.push(`  - Index '${indexName}' missing in LOCAL`)
          tableHasDifferences = true
        } else if (!prodIndex) {
          diffs.push(`  - Index '${indexName}' missing in PROD`)
          tableHasDifferences = true
        } else if (localIndex.indexdef !== prodIndex.indexdef) {
          // Ignore "public." prefix differences which sometimes happen
          const cleanLocal = localIndex.indexdef.replace('public.', '')
          const cleanProd = prodIndex.indexdef.replace('public.', '')
          if (cleanLocal !== cleanProd) {
            diffs.push(`  - Index '${indexName}' definition mismatch`)
            tableHasDifferences = true
          }
        }
      }

      if (tableHasDifferences) {
        console.log(`⚠️  Differences in table '${tableName}':`)
        diffs.forEach((d) => console.log(d))
        totalDifferences++
      } else {
        // console.log(`✅ Table '${tableName}' matches`)
      }
    }

    console.log('\n----------------------------------------')
    if (totalDifferences > 0) {
      console.log(`❌ Found differences in ${totalDifferences} tables.`)
    } else {
      console.log('✅ Full database schema matches perfectly (excluding _prisma_migrations).')
    }
  } catch (error) {
    console.error('Error comparing schemas:', error)
  } finally {
    await localPool.end()
    await prodPool.end()
  }
}

compareSchemas()
