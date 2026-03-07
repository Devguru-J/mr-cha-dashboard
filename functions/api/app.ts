import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import { MOCK_RESIDUAL_VALUES, MOCK_UPLOADS } from './mock-data'

type Bindings = {
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

type SourceType = 'lease' | 'rent'

type NormalizedRecord = {
  source_type: SourceType
  maker_name: string
  model_name: string
  lineup_name: string
  detail_model_name: string
  term_months: number
  annual_mileage_km: number
  finance_name: string
  residual_value_percent: number
  snapshot_month: string
}

type ParseFailure = {
  sheet: string
  row: number
  reason: string
  raw: unknown[]
}

type ParseColumnIndexes = {
  makerName: number
  modelName: number
  lineupName: number
  detailModelName: number
  termMonths: number
  annualMileageKm: number
  financeName: number
  residualValuePercent: number
}
type SupabaseAdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>

const SHEET_SOURCES: Array<{
  sourceType: SourceType
  sheetNames: string[]
  required: boolean
}> = [
  { sourceType: 'lease', sheetNames: ['Lease Raw', 'Lease'], required: true },
  { sourceType: 'rent', sheetNames: ['Rent Raw', 'Rent'], required: false },
]

const SORT_FIELDS = new Set([
  'snapshot_month',
  'maker_name',
  'model_name',
  'lineup_name',
  'detail_model_name',
  'term_months',
  'annual_mileage_km',
  'finance_name',
  'residual_value_percent',
])

export const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors())

app.onError((err, c) => {
  console.error('[api-error]', err)
  return c.json(
    {
      ok: false,
      message: err instanceof Error ? err.message : 'Internal Server Error',
    },
    500,
  )
})

app.get('/api/health', (c) => {
  return c.json({
    ok: true,
    service: 'mr-cha-dashboard-api',
    timestamp: new Date().toISOString(),
  })
})

app.get('/api/config-check', async (c) => {
  const hasSupabaseUrl = Boolean(resolveEnv(c.env, 'SUPABASE_URL'))
  const hasSupabaseAnonKey = Boolean(resolveEnv(c.env, 'SUPABASE_ANON_KEY'))
  const hasSupabaseServiceRoleKey = Boolean(resolveEnv(c.env, 'SUPABASE_SERVICE_ROLE_KEY'))
  const hasCredentials = hasSupabaseUrl && (hasSupabaseAnonKey || hasSupabaseServiceRoleKey)

  let hasUploadsTable: boolean | null = null
  let hasResidualValuesTable: boolean | null = null
  let schemaCheckError: string | null = null

  if (hasCredentials) {
    const supabase = createSupabaseAdminClient(c.env)
    if (supabase) {
      const [uploadsCheck, residualCheck] = await Promise.all([
        supabase.from('uploads').select('id', { head: true, count: 'exact' }),
        supabase.from('residual_values').select('id', { head: true, count: 'exact' }),
      ])

      hasUploadsTable = !uploadsCheck.error
      hasResidualValuesTable = !residualCheck.error
      schemaCheckError = uploadsCheck.error?.message ?? residualCheck.error?.message ?? null
    }
  }

  const mockMode = !hasCredentials || hasUploadsTable === false || hasResidualValuesTable === false

  return c.json({
    ok: hasCredentials,
    hasSupabaseUrl,
    hasSupabaseAnonKey,
    hasSupabaseServiceRoleKey,
    hasUploadsTable,
    hasResidualValuesTable,
    schemaCheckError,
    mockMode,
  })
})

app.get('/api/residual-values', async (c) => {
  const supabase = createSupabaseAdminClient(c.env)
  const sourceType = parseSourceType(c.req.query('sourceType')) ?? 'lease'
  const snapshotMonth = normalizeSnapshotMonthQuery(c.req.query('snapshotMonth'))
  const page = clampNumber(c.req.query('page'), 1, 1, 100000)
  const pageSize = clampNumber(c.req.query('pageSize'), 50, 1, 200)
  const sortBy = SORT_FIELDS.has(c.req.query('sortBy') ?? '') ? c.req.query('sortBy')! : 'residual_value_percent'
  const sortOrder = c.req.query('sortOrder') === 'asc' ? 'asc' : 'desc'

  const maker = cleanTextQuery(c.req.query('maker'))
  const model = cleanTextQuery(c.req.query('model'))
  const finance = cleanTextQuery(c.req.query('finance'))
  const termMonths = parseOptionalInt(c.req.query('termMonths'))
  const annualMileageKm = parseOptionalInt(c.req.query('annualMileageKm'))
  const keyword = cleanKeywordQuery(c.req.query('q'))

  if (!supabase) {
    const mockItems = filterRows(MOCK_RESIDUAL_VALUES, {
      sourceType,
      snapshotMonth,
      maker,
      model,
      finance,
      termMonths,
      annualMileageKm,
      keyword,
    })
    const sorted = sortRows(mockItems, sortBy, sortOrder)
    const from = (page - 1) * pageSize
    const items = sorted.slice(from, from + pageSize)

    return c.json({
      ok: true,
      items,
      total: sorted.length,
      page,
      pageSize,
      sourceType,
      snapshotMonth,
      mockMode: true,
    })
  }

  let query = supabase
    .from('residual_values')
    .select(
      'id,source_type,maker_name,model_name,lineup_name,detail_model_name,term_months,annual_mileage_km,finance_name,residual_value_percent,snapshot_month',
      { count: 'exact' },
    )
    .eq('source_type', sourceType)

  if (snapshotMonth) {
    query = query.eq('snapshot_month', snapshotMonth)
  }

  if (maker) query = query.ilike('maker_name', `%${maker}%`)
  if (model) query = query.ilike('model_name', `%${model}%`)
  if (finance) query = query.ilike('finance_name', `%${finance}%`)
  if (termMonths !== null) query = query.eq('term_months', termMonths)
  if (annualMileageKm !== null) query = query.eq('annual_mileage_km', annualMileageKm)
  if (keyword) {
    const like = `%${keyword}%`
    query = query.or(
      `maker_name.ilike.${like},model_name.ilike.${like},lineup_name.ilike.${like},detail_model_name.ilike.${like},finance_name.ilike.${like}`,
    )
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const result = await query.order(sortBy, { ascending: sortOrder === 'asc' }).range(from, to)

  if (result.error) {
    return c.json({ ok: false, message: result.error.message }, 500)
  }

  return c.json({
    ok: true,
    items: result.data ?? [],
    total: result.count ?? 0,
    page,
    pageSize,
    sourceType,
    snapshotMonth,
  })
})

app.get('/api/best-values', async (c) => {
  const supabase = createSupabaseAdminClient(c.env)
  const sourceType = parseSourceType(c.req.query('sourceType')) ?? 'lease'
  const snapshotMonth = normalizeSnapshotMonthQuery(c.req.query('snapshotMonth'))
  const limit = clampNumber(c.req.query('limit'), 100, 1, 1000)
  const fetchLimit = clampNumber(c.req.query('fetchLimit'), 20000, 100, 50000)

  const maker = cleanTextQuery(c.req.query('maker'))
  const model = cleanTextQuery(c.req.query('model'))
  const finance = cleanTextQuery(c.req.query('finance'))
  const termMonths = parseOptionalInt(c.req.query('termMonths'))
  const annualMileageKm = parseOptionalInt(c.req.query('annualMileageKm'))
  const keyword = cleanKeywordQuery(c.req.query('q'))

  if (!supabase) {
    const filtered = filterRows(MOCK_RESIDUAL_VALUES, {
      sourceType,
      snapshotMonth,
      maker,
      model,
      finance,
      termMonths,
      annualMileageKm,
      keyword,
    })
    const bestMap = pickBestByDetailModel(filtered)
    const items = Array.from(bestMap.values())
      .sort((a, b) => Number(b.residual_value_percent) - Number(a.residual_value_percent))
      .slice(0, limit)

    return c.json({
      ok: true,
      items,
      sourceType,
      snapshotMonth,
      total_groups: bestMap.size,
      returned: items.length,
      mockMode: true,
    })
  }

  let query = supabase
    .from('residual_values')
    .select(
      'source_type,maker_name,model_name,lineup_name,detail_model_name,term_months,annual_mileage_km,finance_name,residual_value_percent,snapshot_month',
    )
    .eq('source_type', sourceType)

  if (snapshotMonth) {
    query = query.eq('snapshot_month', snapshotMonth)
  }

  if (maker) query = query.ilike('maker_name', `%${maker}%`)
  if (model) query = query.ilike('model_name', `%${model}%`)
  if (finance) query = query.ilike('finance_name', `%${finance}%`)
  if (termMonths !== null) query = query.eq('term_months', termMonths)
  if (annualMileageKm !== null) query = query.eq('annual_mileage_km', annualMileageKm)
  if (keyword) {
    const like = `%${keyword}%`
    query = query.or(
      `maker_name.ilike.${like},model_name.ilike.${like},lineup_name.ilike.${like},detail_model_name.ilike.${like},finance_name.ilike.${like}`,
    )
  }

  const result = await query.order('residual_value_percent', { ascending: false }).range(0, fetchLimit - 1)

  if (result.error) {
    return c.json({ ok: false, message: result.error.message }, 500)
  }

  const bestMap = new Map<string, any>()
  for (const row of result.data ?? []) {
    const key = [
      row.source_type,
      row.maker_name,
      row.model_name,
      row.lineup_name,
      row.detail_model_name,
      row.term_months,
      row.annual_mileage_km,
      row.snapshot_month,
    ].join('|')

    const prev = bestMap.get(key)
    if (!prev || Number(row.residual_value_percent) > Number(prev.residual_value_percent)) {
      bestMap.set(key, row)
    }
  }

  const items = Array.from(bestMap.values())
    .sort((a, b) => Number(b.residual_value_percent) - Number(a.residual_value_percent))
    .slice(0, limit)

  return c.json({
    ok: true,
    items,
    sourceType,
    snapshotMonth,
    total_groups: bestMap.size,
    returned: items.length,
  })
})

app.get('/api/changes', async (c) => {
  const supabase = createSupabaseAdminClient(c.env)
  const sourceType = parseSourceType(c.req.query('sourceType')) ?? 'lease'
  const page = clampNumber(c.req.query('page'), 1, 1, 100000)
  const pageSize = clampNumber(c.req.query('pageSize'), 50, 1, 500)
  const direction = parseChangeDirection(c.req.query('direction'))
  const sortBy = parseChangeSort(c.req.query('sortBy'))
  const minAbsDeltaPp = parseMinAbsDeltaPp(c.req.query('minAbsDeltaPp'))
  const snapshotMonthInput = normalizeSnapshotMonthQuery(c.req.query('snapshotMonth'))
  const previousSnapshotMonthInput = normalizeSnapshotMonthQuery(c.req.query('previousSnapshotMonth'))

  if (!supabase) {
    const allMonths = Array.from(new Set(MOCK_RESIDUAL_VALUES.map((r) => r.snapshot_month))).sort().reverse()
    const currentMonth = snapshotMonthInput ?? allMonths[0] ?? null
    const prevMonth = previousSnapshotMonthInput ?? allMonths[1] ?? null

    const rows = computeChanges(
      MOCK_RESIDUAL_VALUES.filter((r) => r.source_type === sourceType),
      currentMonth,
      prevMonth,
    )
    const paged = filterSortAndPaginateChanges(rows, {
      direction,
      sortBy,
      minAbsDeltaPp,
      page,
      pageSize,
    })

    return c.json({
      ok: true,
      items: paged.items,
      total: paged.total,
      page,
      pageSize,
      sourceType,
      snapshotMonth: currentMonth,
      previousSnapshotMonth: prevMonth,
      mockMode: true,
    })
  }

  const monthPair = await resolveChangeMonthPair(
    supabase,
    sourceType,
    snapshotMonthInput,
    previousSnapshotMonthInput,
  )
  if (!monthPair.ok) {
    return c.json({ ok: false, message: monthPair.message }, 500)
  }
  const currentMonth = monthPair.currentMonth
  const prevMonth = monthPair.previousMonth

  if (!currentMonth || !prevMonth) {
    return c.json({
      ok: true,
      items: [],
      sourceType,
      snapshotMonth: currentMonth,
      previousSnapshotMonth: prevMonth,
    })
  }

  const dataRes = await supabase
    .from('residual_values')
    .select(
      'source_type,maker_name,model_name,lineup_name,detail_model_name,term_months,annual_mileage_km,finance_name,residual_value_percent,snapshot_month',
    )
    .eq('source_type', sourceType)
    .in('snapshot_month', [currentMonth, prevMonth])

  if (dataRes.error) {
    return c.json({ ok: false, message: dataRes.error.message }, 500)
  }

  const rows = computeChanges(dataRes.data ?? [], currentMonth, prevMonth)
  const paged = filterSortAndPaginateChanges(rows, {
    direction,
    sortBy,
    minAbsDeltaPp,
    page,
    pageSize,
  })

  return c.json({
    ok: true,
    items: paged.items,
    total: paged.total,
    page,
    pageSize,
    sourceType,
    snapshotMonth: currentMonth,
    previousSnapshotMonth: prevMonth,
  })
})

async function resolveChangeMonthPair(
  supabase: SupabaseAdminClient,
  sourceType: SourceType,
  snapshotMonthInput: string | null,
  previousSnapshotMonthInput: string | null,
): Promise<
  | { ok: true; currentMonth: string | null; previousMonth: string | null }
  | { ok: false; message: string }
> {
  let currentMonth = snapshotMonthInput
  if (!currentMonth) {
    const latestMonthRes = await queryLatestSnapshotMonth(supabase, sourceType, null)
    if (!latestMonthRes.ok) {
      return latestMonthRes
    }
    currentMonth = latestMonthRes.value
  }
  if (!currentMonth) {
    return { ok: true, currentMonth: null, previousMonth: null }
  }

  if (previousSnapshotMonthInput) {
    return { ok: true, currentMonth, previousMonth: previousSnapshotMonthInput }
  }

  const previousMonthRes = await queryLatestSnapshotMonth(supabase, sourceType, currentMonth)
  if (!previousMonthRes.ok) {
    return previousMonthRes
  }

  return { ok: true, currentMonth, previousMonth: previousMonthRes.value }
}

async function queryLatestSnapshotMonth(
  supabase: SupabaseAdminClient,
  sourceType: SourceType,
  ltSnapshotMonth: string | null,
): Promise<{ ok: true; value: string | null } | { ok: false; message: string }> {
  let query = supabase
    .from('residual_values')
    .select('snapshot_month')
    .eq('source_type', sourceType)

  if (ltSnapshotMonth) {
    query = query.lt('snapshot_month', ltSnapshotMonth)
  }

  const res = await query.order('snapshot_month', { ascending: false }).limit(1)
  if (res.error) {
    return { ok: false, message: res.error.message }
  }

  const value = res.data?.[0]?.snapshot_month ? String(res.data[0].snapshot_month) : null
  return { ok: true, value }
}

app.get('/api/uploads', async (c) => {
  const supabase = createSupabaseAdminClient(c.env)
  const limit = clampNumber(c.req.query('limit'), 30, 1, 100)

  if (!supabase) {
    return c.json({
      ok: true,
      items: MOCK_UPLOADS.slice(0, limit),
      mockMode: true,
    })
  }

  const res = await supabase
    .from('uploads')
    .select('id,source_file_name,snapshot_month,status,created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (res.error) {
    return c.json({ ok: false, message: res.error.message }, 500)
  }

  return c.json({ ok: true, items: res.data ?? [] })
})

app.get('/api/suggestions', async (c) => {
  const supabase = createSupabaseAdminClient(c.env)
  const sourceType = parseSourceType(c.req.query('sourceType')) ?? 'lease'
  const snapshotMonth = normalizeSnapshotMonthQuery(c.req.query('snapshotMonth'))
  const field = parseSuggestionField(c.req.query('field'))
  const keyword = cleanKeywordQuery(c.req.query('q')).toLowerCase()
  const limit = clampNumber(c.req.query('limit'), 10, 1, 50)

  if (!field) {
    return c.json({ ok: false, message: 'field is required' }, 400)
  }

  if (!supabase) {
    const values = Array.from(
      new Set(
        MOCK_RESIDUAL_VALUES.filter((row) => {
          if (row.source_type !== sourceType) return false
          if (snapshotMonth && row.snapshot_month !== snapshotMonth) return false
          if (!keyword) return true
          return String(row[field] ?? '').toLowerCase().includes(keyword)
        })
          .map((row) => String(row[field] ?? '').trim())
          .filter(Boolean),
      ),
    )
      .sort((a, b) => a.localeCompare(b, 'ko'))
      .slice(0, limit)

    return c.json({ ok: true, field, items: values, mockMode: true })
  }

  let query = supabase.from('residual_values').select(field).eq('source_type', sourceType)
  if (snapshotMonth) {
    query = query.eq('snapshot_month', snapshotMonth)
  }
  if (keyword) {
    query = query.ilike(field, `%${keyword}%`)
  }

  const result = await query.order(field, { ascending: true }).limit(200)
  if (result.error) {
    return c.json({ ok: false, message: result.error.message }, 500)
  }

  const items = Array.from(
    new Set(
      (result.data ?? [])
        .map((row: any) => String(row[field] ?? '').trim())
        .filter(Boolean),
    ),
  )
    .slice(0, limit)

  return c.json({ ok: true, field, items })
})

app.post('/api/uploads', async (c) => {
  const formData = await c.req.formData()
  const file = formData.get('file')
  const snapshotInput = formData.get('snapshotMonth')

  if (!(file instanceof File)) {
    return c.json({ ok: false, message: 'file is required (multipart/form-data)' }, 400)
  }

  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return c.json({ ok: false, message: 'only .xlsx files are supported in Sprint 2' }, 400)
  }

  const snapshotMonth = normalizeSnapshotMonth(snapshotInput)
  if (!snapshotMonth) {
    return c.json({ ok: false, message: 'snapshotMonth must be YYYY-MM (example: 2026-03)' }, 400)
  }

  const parseResult = await parseWorkbook(file, snapshotMonth)

  if (parseResult.records.length === 0) {
    return c.json(
      {
        ok: false,
        message: 'No valid records were parsed from Lease Raw / Rent Raw sheets',
        failures: parseResult.failures.slice(0, 20),
      },
      400,
    )
  }

  const supabase = createSupabaseAdminClient(c.env)
  if (!supabase) {
    return c.json(
      {
        ok: true,
        message:
          'Supabase not configured. Parsed successfully in mock mode; no DB insert was performed.',
        mockMode: true,
        upload_id: null,
        snapshot_month: snapshotMonth,
        file_name: file.name,
        total_rows: parseResult.totalRows,
        valid_rows: parseResult.records.length,
        invalid_rows: parseResult.failures.length,
        duplicate_rows_overwritten: parseResult.duplicates,
        failures_preview: parseResult.failures.slice(0, 20),
      },
    )
  }

  const uploadInsert = await supabase
    .from('uploads')
    .insert({
      source_file_name: file.name,
      snapshot_month: snapshotMonth,
      status: 'processing',
    })
    .select('id')
    .single()

  if (uploadInsert.error || !uploadInsert.data) {
    return c.json(
      {
        ok: false,
        message: 'Failed to create upload record. Check uploads table schema.',
        error: uploadInsert.error?.message,
      },
      500,
    )
  }

  const uploadId = uploadInsert.data.id as string
  const recordsWithUpload = parseResult.records.map((record) => ({
    ...record,
    upload_id: uploadId,
  }))

  const upsert = await upsertResidualValues(supabase, recordsWithUpload)
  if (!upsert.ok) {
    await supabase.from('uploads').update({ status: 'failed' }).eq('id', uploadId)

    return c.json(
      {
        ok: false,
        message: 'Failed to insert residual values. Check residual_values table schema.',
        error: upsert.error,
        upload_id: uploadId,
      },
      500,
    )
  }

  await supabase.from('uploads').update({ status: 'completed' }).eq('id', uploadId)

  return c.json({
    ok: true,
    upload_id: uploadId,
    snapshot_month: snapshotMonth,
    file_name: file.name,
    total_rows: parseResult.totalRows,
    valid_rows: parseResult.records.length,
    invalid_rows: parseResult.failures.length,
    duplicate_rows_overwritten: parseResult.duplicates,
    failures_preview: parseResult.failures.slice(0, 20),
  })
})

app.notFound((c) => c.json({ ok: false, message: 'Not Found' }, 404))

function createSupabaseAdminClient(env: Bindings) {
  const supabaseUrl = resolveEnv(env, 'SUPABASE_URL')
  const supabaseServiceRoleKey = resolveEnv(env, 'SUPABASE_SERVICE_ROLE_KEY')
  const supabaseAnonKey = resolveEnv(env, 'SUPABASE_ANON_KEY')
  const supabaseKey = supabaseServiceRoleKey || supabaseAnonKey

  if (!supabaseUrl || !supabaseKey) {
    return null
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function resolveEnv(env: Bindings, key: keyof Bindings): string | undefined {
  const fromBinding = env[key]
  if (fromBinding) return fromBinding
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key]
  }
  return undefined
}

async function parseWorkbook(file: File, snapshotMonth: string) {
  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })

  const failures: ParseFailure[] = []
  const dedupMap = new Map<string, NormalizedRecord>()
  let totalRows = 0
  let duplicates = 0

  for (const source of SHEET_SOURCES) {
    const existingSheetName = source.sheetNames.find((name) => Boolean(workbook.Sheets[name]))
    const worksheet = existingSheetName ? workbook.Sheets[existingSheetName] : null

    if (!worksheet) {
      if (source.required) {
        failures.push({
          sheet: source.sheetNames.join(' | '),
          row: 0,
          reason: 'Required sheet is missing',
          raw: [],
        })
      }
      continue
    }

    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: '',
      raw: false,
    })

    if (rows.length <= 1) {
      continue
    }

    const columnIndexes = resolveColumnIndexes(rows[0] ?? [])
    if (!columnIndexes) {
      failures.push({
        sheet: existingSheetName ?? source.sourceType,
        row: 1,
        reason: 'Unrecognized header format. Expected Lease Raw(8 cols) or standard A:O headers.',
        raw: rows[0] ?? [],
      })
      continue
    }

    for (let idx = 1; idx < rows.length; idx += 1) {
      const row = rows[idx]
      totalRows += 1

      const parse = parseRawRow(
        existingSheetName ?? source.sourceType,
        source.sourceType,
        row,
        columnIndexes,
        idx + 1,
        snapshotMonth,
      )

      if (!parse.ok) {
        failures.push({
          sheet: existingSheetName ?? source.sourceType,
          row: idx + 1,
          reason: parse.reason,
          raw: row,
        })
        continue
      }

      const key = toUniqueKey(parse.record)
      if (dedupMap.has(key)) {
        duplicates += 1
      }
      dedupMap.set(key, parse.record)
    }
  }

  return {
    totalRows,
    records: Array.from(dedupMap.values()),
    failures,
    duplicates,
  }
}

function parseRawRow(
  sheetName: string,
  sourceType: SourceType,
  row: unknown[],
  columns: ParseColumnIndexes,
  rowNumber: number,
  snapshotMonth: string,
): { ok: true; record: NormalizedRecord } | { ok: false; reason: string } {
  const makerName = normalizeText(row[columns.makerName])
  const modelName = normalizeText(row[columns.modelName])
  const lineupName = normalizeText(row[columns.lineupName])
  const detailModelName = normalizeText(row[columns.detailModelName])
  const termMonths = parseTermMonths(row[columns.termMonths])
  const annualMileageKm = parseAnnualMileageKm(row[columns.annualMileageKm])
  const financeName = normalizeText(row[columns.financeName])
  const residualValuePercent = parseResidualPercent(row[columns.residualValuePercent])

  if (!makerName || !modelName || !lineupName || !detailModelName || !financeName) {
    return { ok: false, reason: `${sheetName}:${rowNumber} has empty required text fields` }
  }

  if (termMonths === null) {
    return { ok: false, reason: `${sheetName}:${rowNumber} invalid term_months` }
  }

  if (annualMileageKm === null) {
    return { ok: false, reason: `${sheetName}:${rowNumber} invalid annual_mileage_km` }
  }

  if (residualValuePercent === null) {
    return { ok: false, reason: `${sheetName}:${rowNumber} invalid residual_value_percent` }
  }

  return {
    ok: true,
    record: {
      source_type: sourceType,
      maker_name: makerName,
      model_name: modelName,
      lineup_name: lineupName,
      detail_model_name: detailModelName,
      term_months: termMonths,
      annual_mileage_km: annualMileageKm,
      finance_name: financeName,
      residual_value_percent: residualValuePercent,
      snapshot_month: snapshotMonth,
    },
  }
}

function resolveColumnIndexes(headerRow: unknown[]): ParseColumnIndexes | null {
  const map = new Map<string, number>()
  for (let i = 0; i < headerRow.length; i += 1) {
    map.set(normalizeHeaderKey(headerRow[i]), i)
  }

  const byName = {
    makerName: findHeaderIndex(map, ['maker_name', '제조사']),
    modelName: findHeaderIndex(map, ['model_name', '모델']),
    lineupName: findHeaderIndex(map, ['lineup', '라인업']),
    detailModelName: findHeaderIndex(map, ['trim_name', '세부모델']),
    termMonths: findHeaderIndex(map, ['month', '기간개월', '기간']),
    annualMileageKm: findHeaderIndex(map, ['km', '약정거리', '약정거리km']),
    financeName: findHeaderIndex(map, ['finance_name', '금융사']),
    residualValuePercent: findHeaderIndex(map, ['rv_percent', '잔존가치']),
  }

  if (Object.values(byName).every((v) => typeof v === 'number')) {
    return byName as ParseColumnIndexes
  }

  // Fallback: legacy Lease Raw 8-column positional format.
  if (headerRow.length >= 8) {
    return {
      makerName: 0,
      modelName: 1,
      lineupName: 2,
      detailModelName: 3,
      termMonths: 4,
      annualMileageKm: 5,
      financeName: 6,
      residualValuePercent: 7,
    }
  }

  return null
}

function normalizeHeaderKey(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()%]/g, '')
    .trim()
}

function findHeaderIndex(map: Map<string, number>, candidates: string[]): number | null {
  for (const key of candidates) {
    const idx = map.get(key)
    if (typeof idx === 'number') {
      return idx
    }
  }
  return null
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanTextQuery(value: string | undefined): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
}

function cleanKeywordQuery(value: string | undefined): string {
  return cleanTextQuery(value).replace(/[%,]/g, '')
}

function parseTermMonths(value: unknown): number | null {
  const text = normalizeText(value)
  if (!text) {
    return null
  }

  const cleaned = text.replace(/개월/g, '').replace(/[^0-9.]/g, '')
  if (!cleaned) {
    return null
  }

  const num = Number(cleaned)
  if (!Number.isFinite(num)) {
    return null
  }

  return Math.round(num)
}

function parseAnnualMileageKm(value: unknown): number | null {
  const text = normalizeText(value).toLowerCase().replace(/,/g, '')
  if (!text) {
    return null
  }

  const onlyDigits = text.replace(/[^0-9]/g, '')
  if (/만\s*km?$/.test(text) || text.includes('만km') || text.includes('만 km')) {
    const base = Number(onlyDigits)
    if (!Number.isFinite(base)) {
      return null
    }
    return Math.round(base * 10000)
  }

  const numericPart = text.replace(/[^0-9.]/g, '')
  if (!numericPart) {
    return null
  }

  const num = Number(numericPart)
  if (!Number.isFinite(num)) {
    return null
  }

  return Math.round(num)
}

function parseResidualPercent(value: unknown): number | null {
  const text = normalizeText(value).replace('%', '')
  if (!text) {
    return null
  }

  const num = Number(text)
  if (!Number.isFinite(num)) {
    return null
  }

  return Math.round(num * 100) / 100
}

function normalizeSnapshotMonth(value: FormDataEntryValue | null): string | null {
  const raw = typeof value === 'string' ? value.trim() : ''
  const candidate = raw || `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`

  const match = candidate.match(/^(\d{4})-(\d{2})$/)
  if (!match) {
    return null
  }

  const month = Number(match[2])
  if (month < 1 || month > 12) {
    return null
  }

  return `${match[1]}-${match[2]}-01`
}

function normalizeSnapshotMonthQuery(value: string | undefined): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null

  if (/^\d{4}-\d{2}$/.test(raw)) {
    return `${raw}-01`
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw
  }

  return null
}

function parseSourceType(value: string | undefined): SourceType | null {
  if (value === 'lease' || value === 'rent') {
    return value
  }
  return null
}

function parseOptionalInt(value: string | undefined): number | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const num = Number(raw)
  if (!Number.isFinite(num)) return null
  return Math.round(num)
}

function clampNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  const num = parseOptionalInt(value)
  if (num === null) return fallback
  return Math.min(max, Math.max(min, num))
}

function filterRows(
  rows: ReadonlyArray<any>,
  options: {
    sourceType: SourceType
    snapshotMonth: string | null
    maker: string
    model: string
    finance: string
    termMonths: number | null
    annualMileageKm: number | null
    keyword: string
  },
) {
  const lower = (value: unknown) => String(value ?? '').toLowerCase()
  const keyword = options.keyword.toLowerCase()
  return rows.filter((row) => {
    if (row.source_type !== options.sourceType) return false
    if (options.snapshotMonth && row.snapshot_month !== options.snapshotMonth) return false
    if (options.maker && !lower(row.maker_name).includes(options.maker.toLowerCase())) return false
    if (options.model && !lower(row.model_name).includes(options.model.toLowerCase())) return false
    if (options.finance && !lower(row.finance_name).includes(options.finance.toLowerCase())) return false
    if (options.termMonths !== null && Number(row.term_months) !== options.termMonths) return false
    if (options.annualMileageKm !== null && Number(row.annual_mileage_km) !== options.annualMileageKm) return false

    if (keyword) {
      const searchable = [
        row.maker_name,
        row.model_name,
        row.lineup_name,
        row.detail_model_name,
        row.finance_name,
      ]
        .map((v) => lower(v))
        .join(' ')
      if (!searchable.includes(keyword)) return false
    }

    return true
  })
}

function sortRows(rows: ReadonlyArray<any>, sortBy: string, sortOrder: 'asc' | 'desc') {
  const sorted = [...rows].sort((a, b) => {
    const av = a[sortBy]
    const bv = b[sortBy]
    if (av === bv) return 0
    if (av === null || av === undefined) return -1
    if (bv === null || bv === undefined) return 1
    if (typeof av === 'number' && typeof bv === 'number') return av - bv
    return String(av).localeCompare(String(bv), 'ko')
  })
  return sortOrder === 'asc' ? sorted : sorted.reverse()
}

function pickBestByDetailModel(rows: ReadonlyArray<any>) {
  const bestMap = new Map<string, any>()
  for (const row of rows) {
    const key = [
      row.source_type,
      row.maker_name,
      row.model_name,
      row.lineup_name,
      row.detail_model_name,
      row.term_months,
      row.annual_mileage_km,
      row.snapshot_month,
    ].join('|')
    const prev = bestMap.get(key)
    if (!prev || Number(row.residual_value_percent) > Number(prev.residual_value_percent)) {
      bestMap.set(key, row)
    }
  }
  return bestMap
}

function computeChanges(rows: ReadonlyArray<any>, currentMonth: string | null, prevMonth: string | null) {
  if (!currentMonth || !prevMonth) return []

  const currentRows = rows.filter((r) => String(r.snapshot_month) === currentMonth)
  const prevRows = rows.filter((r) => String(r.snapshot_month) === prevMonth)

  const toKey = (row: any) =>
    [
      row.source_type,
      row.maker_name,
      row.model_name,
      row.lineup_name,
      row.detail_model_name,
      row.term_months,
      row.annual_mileage_km,
      row.finance_name,
    ].join('|')

  const prevMap = new Map<string, any>()
  for (const row of prevRows) {
    prevMap.set(toKey(row), row)
  }

  const items: any[] = []
  for (const row of currentRows) {
    const key = toKey(row)
    const prev = prevMap.get(key)
    if (!prev) continue
    const prevPercent = Number(prev.residual_value_percent)
    const currentPercent = Number(row.residual_value_percent)
    const deltaPp = Math.round((currentPercent - prevPercent) * 100) / 100

    if (deltaPp === 0) continue

    items.push({
      source_type: row.source_type,
      maker_name: row.maker_name,
      model_name: row.model_name,
      lineup_name: row.lineup_name,
      detail_model_name: row.detail_model_name,
      term_months: row.term_months,
      annual_mileage_km: row.annual_mileage_km,
      finance_name: row.finance_name,
      previous_percent: prevPercent,
      current_percent: currentPercent,
      delta_pp: deltaPp,
      snapshot_month: currentMonth,
      previous_snapshot_month: prevMonth,
    })
  }

  return items.sort((a, b) => Math.abs(Number(b.delta_pp)) - Math.abs(Number(a.delta_pp)))
}

function parseChangeDirection(value: string | undefined): 'all' | 'up' | 'down' {
  if (value === 'up' || value === 'down') return value
  return 'all'
}

function parseChangeSort(value: string | undefined): 'abs' | 'delta_desc' | 'delta_asc' {
  if (value === 'delta_desc' || value === 'delta_asc') return value
  return 'abs'
}

function parseMinAbsDeltaPp(value: string | undefined): number {
  const raw = String(value ?? '').trim()
  if (!raw) return 0
  const num = Number(raw)
  if (!Number.isFinite(num) || num < 0) return 0
  return num
}

function parseSuggestionField(
  value: string | undefined,
): 'maker_name' | 'model_name' | 'finance_name' | null {
  if (value === 'maker_name' || value === 'model_name' || value === 'finance_name') {
    return value
  }
  return null
}

function filterSortAndPaginateChanges(
  rows: ReadonlyArray<any>,
  options: {
    direction: 'all' | 'up' | 'down'
    sortBy: 'abs' | 'delta_desc' | 'delta_asc'
    minAbsDeltaPp: number
    page: number
    pageSize: number
  },
) {
  let filtered = [...rows]

  if (options.direction === 'up') {
    filtered = filtered.filter((row) => Number(row.delta_pp) > 0)
  } else if (options.direction === 'down') {
    filtered = filtered.filter((row) => Number(row.delta_pp) < 0)
  }

  if (options.minAbsDeltaPp > 0) {
    filtered = filtered.filter((row) => Math.abs(Number(row.delta_pp)) >= options.minAbsDeltaPp)
  }

  if (options.sortBy === 'delta_desc') {
    filtered.sort((a, b) => Number(b.delta_pp) - Number(a.delta_pp))
  } else if (options.sortBy === 'delta_asc') {
    filtered.sort((a, b) => Number(a.delta_pp) - Number(b.delta_pp))
  } else {
    filtered.sort((a, b) => Math.abs(Number(b.delta_pp)) - Math.abs(Number(a.delta_pp)))
  }

  const total = filtered.length
  const from = (options.page - 1) * options.pageSize
  const items = filtered.slice(from, from + options.pageSize)

  return { total, items }
}

function toUniqueKey(record: NormalizedRecord): string {
  return [
    record.source_type,
    record.maker_name,
    record.model_name,
    record.lineup_name,
    record.detail_model_name,
    record.term_months,
    record.annual_mileage_km,
    record.finance_name,
    record.snapshot_month,
  ].join('|')
}

async function upsertResidualValues(
  supabase: any,
  records: Array<NormalizedRecord & { upload_id: string }>,
) {
  const chunkSize = 1000

  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize)
    const res = await supabase.from('residual_values').insert(chunk)
    if (res.error) {
      return { ok: false as const, error: res.error.message }
    }
  }

  return { ok: true as const }
}
