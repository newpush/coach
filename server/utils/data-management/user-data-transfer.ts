import {
  PROFILE_FIELDS,
  TRANSFER_TABLES,
  type DateRange,
  type TransferRef,
  type TransferSection,
  type TransferTable
} from './transfer-plan'

/**
 * Copies one user's data between two Coach Watts databases, section by section,
 * remapping it onto a user that already exists in the target database.
 *
 * Unlike `UserUniverseImporter` (which creates a brand new user from an export
 * file inside a single transaction), this engine merges into an existing user,
 * streams table by table, and tolerates partial data: foreign keys that would
 * dangle are either nulled or their rows dropped, and inserts use
 * `skipDuplicates` so a run can be repeated safely.
 *
 * It never writes to the source database.
 */

export interface TransferOptions {
  sourceUserId: string
  targetUserId: string
  sections: TransferSection[]
  range?: DateRange
  /** Delete the target user's rows in the selected sections before inserting. */
  replace?: boolean
  /** Count only; perform no writes. */
  dryRun?: boolean
  onProgress?: (message: string) => void
  /** node-postgres pools behind the two clients; required for raw-copied tables. */
  pools?: { source: RawPool; target: RawPool }
}

/** The slice of a `pg.Pool` this module needs. */
export interface RawPool {
  query: (
    text: string,
    values?: unknown[]
  ) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>
}

export interface TableResult {
  model: string
  label: string
  section: TransferSection
  /** Rows found in the source for this user (and date range). */
  fetched: number
  /** Rows newly written to the target. */
  inserted: number
  /** Rows the target already had (unique constraint hit). */
  skippedExisting: number
  /** Rows dropped because a required foreign key was not present in the target. */
  droppedRefs: number
  /** Columns nulled because an optional foreign key was not present in the target. */
  nulledRefs: number
  /** Rows the database refused. */
  failed: number
  /** Rows removed by `--replace`. */
  deleted: number
  errors: string[]
}

export interface TransferReport {
  profileUpdated: boolean
  tables: TableResult[]
  totals: { fetched: number; inserted: number; failed: number; deleted: number }
}

type AnyPrisma = Record<string, any>

const MAX_ERRORS_PER_TABLE = 5
const DEFAULT_PAGE_SIZE = 500

const userFieldsOf = (table: TransferTable): string[] => table.userFields ?? ['userId']

/** Models in the plan that carry a `userId` column, so target lookups can be user-scoped. */
const USER_SCOPED_MODELS = new Set(
  TRANSFER_TABLES.filter((t) => userFieldsOf(t).includes('userId')).map((t) => t.model)
)

const refScope = (ref: TransferRef): 'user' | 'global' =>
  ref.scope ?? (USER_SCOPED_MODELS.has(ref.model) ? 'user' : 'global')

export function tablesForSections(sections: TransferSection[]): TransferTable[] {
  const wanted = new Set(sections)
  return TRANSFER_TABLES.filter((t) => wanted.has(t.section))
}

export async function transferUserData(
  source: AnyPrisma,
  target: AnyPrisma,
  opts: TransferOptions
): Promise<TransferReport> {
  const log = opts.onProgress ?? (() => {})
  const range = opts.range ?? {}
  const sourceCtx = { userId: opts.sourceUserId, range }
  const targetCtx = { userId: opts.targetUserId, range }
  const tables = tablesForSections(opts.sections)

  const report: TransferReport = {
    profileUpdated: false,
    tables: [],
    totals: { fetched: 0, inserted: 0, failed: 0, deleted: 0 }
  }

  // Ids known to exist in the target: everything this run wrote (or found
  // already present), plus per-model lookups cached from the target database.
  const knownIds = new Map<string, Set<string>>()
  const missingIds = new Map<string, Set<string>>()

  const remember = (model: string, id: string) => {
    let set = knownIds.get(model)
    if (!set) knownIds.set(model, (set = new Set()))
    set.add(id)
  }

  /** Which of these ids exist in the target for this model? */
  const resolvePresence = async (ref: TransferRef, ids: string[]): Promise<Set<string>> => {
    const known = knownIds.get(ref.model) ?? new Set<string>()
    const missing = missingIds.get(ref.model) ?? new Set<string>()
    const unknown = ids.filter((id) => !known.has(id) && !missing.has(id))

    if (unknown.length && !opts.dryRun) {
      const where: Record<string, unknown> = { id: { in: unknown } }
      if (refScope(ref) === 'user') where.userId = opts.targetUserId
      const rows: { id: string }[] = await target[ref.model].findMany({
        where,
        select: { id: true }
      })
      const found = new Set(rows.map((r) => r.id))
      const absent = unknown.filter((id) => !found.has(id))

      // Shared reference data the target has never been seeded with.
      if (absent.length && ref.copyMissing) {
        const sourceRows: Record<string, unknown>[] = await source[ref.model].findMany({
          where: { id: { in: absent } }
        })
        if (sourceRows.length) {
          await target[ref.model].createMany({ data: sourceRows, skipDuplicates: true })
          log(`Copied ${sourceRows.length} shared ${ref.model} rows`)
          for (const row of sourceRows) found.add(row.id as string)
        }
      }

      for (const id of unknown) {
        if (found.has(id)) remember(ref.model, id)
        else {
          let set = missingIds.get(ref.model)
          if (!set) missingIds.set(ref.model, (set = new Set()))
          set.add(id)
        }
      }
    }

    return knownIds.get(ref.model) ?? new Set<string>()
  }

  // ------------------------------------------------------------------ profile
  if (opts.sections.includes('profile')) {
    const sourceUser = await source.user.findUnique({ where: { id: opts.sourceUserId } })
    if (!sourceUser) throw new Error(`Source user ${opts.sourceUserId} not found`)

    const data: Record<string, unknown> = {}
    for (const field of PROFILE_FIELDS) {
      if (field in sourceUser) data[field] = sourceUser[field]
    }

    if (!opts.dryRun) {
      await target.user.update({ where: { id: opts.targetUserId }, data })
      report.profileUpdated = true
      log(`Profile: ${Object.keys(data).length} fields updated`)
    }
  }

  // ------------------------------------------------------------------ replace
  const deletedByModel = new Map<string, number>()
  if (opts.replace && !opts.dryRun) {
    // Children first, so a failed parent delete cannot orphan anything.
    for (const table of [...tables].reverse()) {
      try {
        const { count } = await target[table.model].deleteMany({ where: table.where(targetCtx) })
        deletedByModel.set(table.model, count)
        if (count) log(`Cleared ${count} × ${table.label}`)
      } catch (e) {
        log(`Could not clear ${table.label}: ${(e as Error).message}`)
      }
    }
  }

  // ------------------------------------------------------------------- tables
  for (const table of tables) {
    const result = emptyResult(table)
    result.deleted = deletedByModel.get(table.model) ?? 0
    const pageSize = table.pageSize ?? DEFAULT_PAGE_SIZE
    const where = table.where(sourceCtx)
    const deferred: { id: string; field: string; value: string }[] = []

    result.fetched = await source[table.model].count({ where })

    if (opts.dryRun) {
      report.tables.push(result)
      continue
    }

    if (result.fetched === 0) {
      report.tables.push(result)
      continue
    }

    log(`${table.label}: ${result.fetched} rows`)

    if (table.raw) {
      if (!opts.pools) {
        pushError(result, 'raw copy requires database pools; table skipped')
        report.tables.push(result)
        continue
      }

      // Raw tables are driven by their parent's ids: fetch the parent ids this
      // run covers, keep the ones that exist in the target (from this run or an
      // earlier one), and copy their rows.
      const parentSpec = TRANSFER_TABLES.find((t) => t.model === table.raw!.parentModel)
      const parentIds: string[] = parentSpec
        ? (
            await source[parentSpec.model].findMany({
              where: parentSpec.where(sourceCtx),
              select: { id: true }
            })
          ).map((r: { id: string }) => r.id)
        : []
      const parentRef: TransferRef = (table.refs ?? []).find(
        (r) => r.field === table.raw!.parentColumn
      ) ?? { field: table.raw!.parentColumn, model: table.raw!.parentModel, onMissing: 'drop' }
      const present = await resolvePresence(parentRef, parentIds)

      await copyRawTable(
        opts.pools,
        table,
        parentIds.filter((id) => present.has(id)),
        result
      )
      report.tables.push(result)
      continue
    }

    let cursor: string | undefined
    let processed = 0

    while (processed < result.fetched) {
      const rows: Record<string, any>[] = await source[table.model].findMany({
        where,
        orderBy: { id: 'asc' },
        take: pageSize,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
      })
      const last = rows[rows.length - 1]
      if (!last) break
      cursor = last.id as string
      processed += rows.length

      // Resolve foreign keys for the whole page in one query per ref.
      const presence = new Map<string, Set<string>>()
      for (const ref of table.refs ?? []) {
        const ids = rows
          .map((r) => r[ref.field])
          .filter((v): v is string => typeof v === 'string' && v.length > 0)
        presence.set(ref.field, await resolvePresence(ref, Array.from(new Set(ids))))
      }

      const prepared: Record<string, any>[] = []
      for (const row of rows) {
        const copy: Record<string, any> = { ...row }
        let drop = false

        for (const ref of table.refs ?? []) {
          const value = copy[ref.field]
          if (typeof value !== 'string' || value.length === 0) continue
          if (presence.get(ref.field)?.has(value)) continue
          if (ref.onMissing === 'drop') {
            drop = true
            break
          }
          copy[ref.field] = null
          result.nulledRefs++
        }
        if (drop) {
          result.droppedRefs++
          continue
        }

        for (const field of userFieldsOf(table)) {
          if (copy[field] === opts.sourceUserId) copy[field] = opts.targetUserId
        }
        for (const field of table.nullify ?? []) copy[field] = null
        Object.assign(copy, table.set ?? {})
        for (const field of table.selfRefs ?? []) {
          const value = copy[field]
          if (typeof value === 'string' && value.length > 0) {
            deferred.push({ id: copy.id as string, field, value })
            copy[field] = null
          }
        }

        prepared.push(copy)
      }

      if (prepared.length) {
        const { written, failedIds } = await insertRows(target, table.model, prepared, result)
        result.inserted += written
        // Rows skipped as duplicates are present in the target too, so later
        // foreign keys pointing at them still resolve. Failed rows are not.
        for (const row of prepared) {
          const id = row.id as string
          if (!failedIds.has(id)) remember(table.model, id)
        }
      }
    }

    // Self-references are nulled during insert so chunking cannot break them,
    // then restored once every row of the table is present.
    const present = knownIds.get(table.model) ?? new Set<string>()
    for (const patch of deferred) {
      if (!present.has(patch.value)) continue
      try {
        await target[table.model].update({
          where: { id: patch.id },
          data: { [patch.field]: patch.value }
        })
      } catch (e) {
        pushError(result, `self-ref ${patch.field} on ${patch.id}: ${(e as Error).message}`)
      }
    }

    result.skippedExisting = Math.max(
      0,
      result.fetched - result.droppedRefs - result.inserted - result.failed
    )
    report.tables.push(result)
  }

  for (const t of report.tables) {
    report.totals.fetched += t.fetched
    report.totals.inserted += t.inserted
    report.totals.failed += t.failed
    report.totals.deleted += t.deleted
  }

  return report
}

/**
 * Copies a table with plain SQL, one row at a time, for data the Prisma client
 * cannot decode (see `TransferTable.raw`). `SELECT *` is safe here because both
 * databases run the same migrations.
 */
async function copyRawTable(
  pools: { source: RawPool; target: RawPool },
  table: TransferTable,
  parentIds: string[],
  result: TableResult
): Promise<void> {
  const spec = table.raw!
  const batchSize = table.pageSize ?? 25
  let read = 0

  // node-postgres hands json/jsonb back as JS values; an array would otherwise
  // be re-encoded as a Postgres array literal, so those columns are stringified.
  const { rows: columnTypes } = await pools.target.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1`,
    [spec.table]
  )
  const jsonColumns = new Set(
    columnTypes
      .filter((c) => c.data_type === 'json' || c.data_type === 'jsonb')
      .map((c) => String(c.column_name))
  )

  for (let i = 0; i < parentIds.length; i += batchSize) {
    const batch = parentIds.slice(i, i + batchSize)
    const { rows } = await pools.source.query(
      `SELECT * FROM "${spec.table}" WHERE "${spec.parentColumn}" = ANY($1::text[])`,
      [batch]
    )
    read += rows.length

    for (const row of rows) {
      const columns = Object.keys(row)
      const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ')
      const quoted = columns.map((c) => `"${c}"`).join(', ')
      try {
        const inserted = await pools.target.query(
          `INSERT INTO "${spec.table}" (${quoted}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          columns.map((c) =>
            jsonColumns.has(c) && row[c] !== null && row[c] !== undefined
              ? JSON.stringify(row[c])
              : row[c]
          )
        )
        if (inserted.rowCount) result.inserted++
        else result.skippedExisting++
      } catch (e) {
        result.failed++
        pushError(result, `${String(row.id)}: ${(e as Error).message}`)
      }
    }
  }

  result.droppedRefs = Math.max(0, result.fetched - read)
}

function emptyResult(table: TransferTable): TableResult {
  return {
    model: table.model,
    label: table.label,
    section: table.section,
    fetched: 0,
    inserted: 0,
    skippedExisting: 0,
    droppedRefs: 0,
    nulledRefs: 0,
    failed: 0,
    deleted: 0,
    errors: []
  }
}

function pushError(result: TableResult, message: string) {
  if (result.errors.length < MAX_ERRORS_PER_TABLE) result.errors.push(message)
}

/**
 * Bulk insert with `skipDuplicates`, falling back to row-by-row on failure so a
 * single bad record cannot lose the whole batch.
 */
async function insertRows(
  target: AnyPrisma,
  model: string,
  rows: Record<string, unknown>[],
  result: TableResult
): Promise<{ written: number; failedIds: Set<string> }> {
  const failedIds = new Set<string>()

  try {
    const { count } = await target[model].createMany({ data: rows, skipDuplicates: true })
    return { written: count, failedIds }
  } catch (e) {
    pushError(result, `batch insert failed, retrying row by row: ${(e as Error).message}`)
  }

  let written = 0
  for (const row of rows) {
    try {
      const { count } = await target[model].createMany({ data: [row], skipDuplicates: true })
      written += count
    } catch (e) {
      result.failed++
      failedIds.add((row as { id?: string }).id ?? '')
      pushError(result, `${(row as { id?: string }).id}: ${(e as Error).message}`)
    }
  }
  return { written, failedIds }
}
