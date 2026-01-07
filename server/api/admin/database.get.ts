import { defineEventHandler, createError } from 'h3'
import { getServerSession } from '../../utils/session'
import { prisma } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  // Strict admin check
  if (!session?.user?.isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden'
    })
  }

  try {
    const stats = await prisma.$queryRaw`
      SELECT
        relname as table_name,
        n_live_tup as row_count,
        pg_total_relation_size(relid) as total_size_bytes
      FROM pg_stat_user_tables
      ORDER BY total_size_bytes DESC;
    `

    // Convert BigInt to string/number because JSON.stringify doesn't handle BigInt
    const formattedStats = (stats as any[]).map((stat) => ({
      table_name: stat.table_name,
      row_count: Number(stat.row_count),
      total_size_bytes: Number(stat.total_size_bytes)
    }))

    return formattedStats
  } catch (error) {
    console.error('Database stats error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch database stats'
    })
  }
})
