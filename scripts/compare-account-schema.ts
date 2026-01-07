import 'dotenv/config'
import pg from 'pg'

const localConnectionString = process.env.DATABASE_URL
const prodConnectionString = process.env.DATABASE_URL_PROD

if (!localConnectionString || !prodConnectionString) {
  console.error('Both DATABASE_URL and DATABASE_URL_PROD must be set in .env')
  process.exit(1)
}

async function getTableSchema(connectionString: string, tableName: string) {
  const pool = new pg.Pool({ connectionString })
  try {
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
      columns: result.rows,
      indexes: indexesResult.rows
    }
  } finally {
    await pool.end()
  }
}

async function compareSchemas() {
  console.log('Comparing Account table schema: Local vs Production...\n')

  try {
    const localSchema = await getTableSchema(localConnectionString!, 'Account')
    const prodSchema = await getTableSchema(prodConnectionString!, 'Account')

    console.log('--- Columns Comparison ---')
    const allColumns = new Set([
      ...localSchema.columns.map((c) => c.column_name),
      ...prodSchema.columns.map((c) => c.column_name)
    ])

    let hasDifferences = false

    const columnTable: any[] = []

    for (const colName of Array.from(allColumns).sort()) {
      const localCol = localSchema.columns.find((c) => c.column_name === colName)
      const prodCol = prodSchema.columns.find((c) => c.column_name === colName)

      const status = !localCol
        ? 'MISSING LOCAL'
        : !prodCol
          ? 'MISSING PROD'
          : localCol.data_type !== prodCol.data_type || localCol.is_nullable !== prodCol.is_nullable
            ? 'MISMATCH'
            : 'MATCH'

      if (status !== 'MATCH') hasDifferences = true

      columnTable.push({
        Column: colName,
        Status: status,
        Local: localCol ? `${localCol.data_type} (${localCol.is_nullable})` : '-',
        Prod: prodCol ? `${prodCol.data_type} (${prodCol.is_nullable})` : '-'
      })
    }
    console.table(columnTable)

    console.log('\n--- Indexes Comparison ---')
    const allIndexes = new Set([
      ...localSchema.indexes.map((i) => i.indexname),
      ...prodSchema.indexes.map((i) => i.indexname)
    ])

    const indexTable: any[] = []

    for (const indexName of Array.from(allIndexes).sort()) {
      const localIndex = localSchema.indexes.find((i) => i.indexname === indexName)
      const prodIndex = prodSchema.indexes.find((i) => i.indexname === indexName)

      const status = !localIndex
        ? 'MISSING LOCAL'
        : !prodIndex
          ? 'MISSING PROD'
          : localIndex.indexdef !== prodIndex.indexdef
            ? 'MISMATCH'
            : 'MATCH'

      if (status !== 'MATCH') hasDifferences = true

      indexTable.push({
        Index: indexName,
        Status: status,
        LocalDef: localIndex ? 'Exists' : '-', // abbreviating for readability
        ProdDef: prodIndex ? 'Exists' : '-'
      })
    }
    console.table(indexTable)

    if (hasDifferences) {
      console.log('\n❌ Differences detected between Local and Production schemas!')
    } else {
      console.log('\n✅ Local and Production schemas match perfectly.')
    }
  } catch (error) {
    console.error('Error comparing schemas:', error)
  }
}

compareSchemas()
