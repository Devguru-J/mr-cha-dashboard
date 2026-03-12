import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import { MOCK_DEALER_DISCOUNTS, MOCK_RESIDUAL_VALUES, MOCK_UPLOADS } from './mock-data'

type Bindings = {
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  ADMIN_SIGNUP_TOKEN?: string
}

type SourceType = 'lease' | 'rent'
type DealerBrand = 'BMW' | 'BENZ' | 'AUDI' | 'HYUNDAI' | 'KIA' | 'GENESIS' | 'ETC'

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
type SuggestionField = 'maker_name' | 'model_name' | 'finance_name'
type DealerVehicleRow = {
  maker_name: string
  model_name: string
  detail_model_name: string
}
type DealerDiscountRecord = {
  id: number
  dealer_code: string
  source_type: SourceType
  snapshot_month: string
  maker_name: string
  model_name: string
  detail_model_name: string
  discount_amount: number
  note: string
  created_at: string
  updated_at: string
}
type AppRole = 'super' | 'manager' | 'dealer'
type ApiStatus = 400 | 401 | 403 | 404 | 409 | 410 | 500
type InviteCodeRecord = {
  id: string
  role: AppRole
  dealer_brand: DealerBrand | null
  dealer_code: string | null
  expires_at: string | null
  used_at: string | null
  used_by_user_id: string | null
  created_at: string
}

let mockDealerDiscounts: DealerDiscountRecord[] = MOCK_DEALER_DISCOUNTS.map((row) => ({
  id: Number(row.id),
  dealer_code: String(row.dealer_code),
  source_type: row.source_type,
  snapshot_month: String(row.snapshot_month),
  maker_name: String(row.maker_name),
  model_name: String(row.model_name),
  detail_model_name: String(row.detail_model_name),
  discount_amount: Number(row.discount_amount),
  note: String(row.note ?? ''),
  created_at: String(row.created_at),
  updated_at: String(row.updated_at),
}))

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

app.get('/api/me', async (c) => {
  const supabase = createSupabaseAdminClient(c.env)
  if (!supabase) {
    return c.json({ ok: false, message: 'Supabase is not configured' }, 500)
  }

  const authUser = await getAuthUserFromRequest(c)
  if (!authUser.ok) {
    return c.json({ ok: false, message: authUser.message }, 401)
  }

  const roleRes = await supabase
    .from('user_roles')
    .select('role,login_id,dealer_brand,dealer_code')
    .eq('user_id', authUser.user.id)
    .maybeSingle()

  if (roleRes.error) {
    return c.json({ ok: false, message: roleRes.error.message }, 500)
  }

  return c.json({
    ok: true,
    user: {
      user_id: authUser.user.id,
      email: authUser.user.email ?? '',
      role: (roleRes.data?.role ?? null) as AppRole | null,
      login_id: roleRes.data?.login_id ?? null,
      dealer_brand: roleRes.data?.dealer_brand ?? null,
      dealer_code: roleRes.data?.dealer_code ?? null,
    },
  })
})

app.post('/api/register-profile', async (c) => {
  const supabase = createSupabaseAdminClient(c.env)
  if (!supabase) {
    return c.json({ ok: false, message: 'Supabase is not configured' }, 500)
  }

  const body = await c.req.json().catch(() => null)
  const userId = normalizeText(body?.userId)
  const loginId = normalizeLoginId(body?.loginId)
  const role = parseAppRole(body?.role)
  const dealerBrand = normalizeText(body?.dealerBrand)
  const dealerCode = normalizeText(body?.dealerCode)
  const adminSignupToken = normalizeText(body?.adminSignupToken)

  if (!userId || !role) {
    return c.json({ ok: false, message: 'userId and role are required' }, 400)
  }

  if (role !== 'dealer') {
    const superCountRes = await supabase
      .from('user_roles')
      .select('user_id', { count: 'exact', head: true })
      .eq('role', 'super')
    if (superCountRes.error) {
      return c.json({ ok: false, message: superCountRes.error.message }, 500)
    }

    const isBootstrap = (superCountRes.count ?? 0) === 0 && role === 'super'
    if (!isBootstrap) {
      const expected = resolveEnv(c.env, 'ADMIN_SIGNUP_TOKEN') ?? ''
      if (!expected || adminSignupToken !== expected) {
        return c.json({ ok: false, message: 'invalid admin signup token' }, 403)
      }
    }
  }

  if (role === 'dealer' && (!dealerBrand || !dealerCode)) {
    return c.json({ ok: false, message: 'dealerBrand and dealerCode are required for dealer role' }, 400)
  }

  const payload = {
    user_id: userId,
    login_id: loginId || null,
    role,
    dealer_brand: role === 'dealer' ? dealerBrand : null,
    dealer_code: role === 'dealer' ? dealerCode : null,
  }

  const upsert = await supabase.from('user_roles').upsert(payload, { onConflict: 'user_id' })
  if (upsert.error) {
    return c.json({ ok: false, message: upsert.error.message }, 500)
  }

  return c.json({ ok: true })
})

app.post('/api/signup', async (c) => {
  const supabase = createSupabaseAdminClient(c.env)
  if (!supabase) {
    return c.json({ ok: false, message: 'Supabase is not configured' }, 500)
  }

  const body = await c.req.json().catch(() => null)
  const loginId = normalizeLoginId(body?.loginId)
  const password = String(body?.password ?? '')
  const role = parseAppRole(body?.role)
  const adminSignupToken = normalizeText(body?.adminSignupToken)
  const inviteCode = normalizeInviteCode(body?.inviteCode)
  const dealerSignupCode = normalizeText(body?.dealerCode)

  if (!loginId || !password || !role) {
    return c.json({ ok: false, message: 'loginId, password and role are required' }, 400)
  }

  if (password.length < 6) {
    return c.json({ ok: false, message: '비밀번호는 6자 이상이어야 합니다.' }, 400)
  }

  let dealerBrand: DealerBrand | null = null
  let dealerCode: string | null = null
  let inviteRow: InviteCodeRecord | null = null

  if (role === 'dealer') {
    if (!inviteCode) {
      return c.json({ ok: false, message: '가입 코드를 입력해주세요.' }, 400)
    }
    if (!dealerSignupCode) {
      return c.json({ ok: false, message: '딜러 코드를 입력해주세요.' }, 400)
    }

    const inviteLookup = await findDealerInviteCodeByPlaintext(supabase, inviteCode)
    if (!inviteLookup.ok) {
      return c.json({ ok: false, message: inviteLookup.message }, { status: inviteLookup.status })
    }

    inviteRow = inviteLookup.invite
    dealerBrand = inviteRow.dealer_brand
    dealerCode = dealerSignupCode
  } else {
    const superCountRes = await supabase
      .from('user_roles')
      .select('user_id', { count: 'exact', head: true })
      .eq('role', 'super')
    if (superCountRes.error) {
      return c.json({ ok: false, message: superCountRes.error.message }, 500)
    }

    const isBootstrap = (superCountRes.count ?? 0) === 0 && role === 'super'
    if (!isBootstrap) {
      const expected = resolveEnv(c.env, 'ADMIN_SIGNUP_TOKEN') ?? ''
      if (!expected || adminSignupToken !== expected) {
        return c.json({ ok: false, message: 'invalid admin signup token' }, 403)
      }
    }
  }

  const authRes = await supabase.auth.admin.createUser({
    email: toAuthEmail(loginId),
    password,
    email_confirm: true,
    user_metadata: { login_id: loginId },
  })

  if (authRes.error || !authRes.data.user) {
    return c.json({ ok: false, message: authRes.error?.message ?? '회원 생성에 실패했습니다.' }, 400)
  }

  const userId = authRes.data.user.id
  const roleInsert = await supabase.from('user_roles').insert({
    user_id: userId,
    login_id: loginId,
    role,
    dealer_brand: role === 'dealer' ? dealerBrand : null,
    dealer_code: role === 'dealer' ? dealerCode : null,
  })

  if (roleInsert.error) {
    await supabase.auth.admin.deleteUser(userId)
    return c.json({ ok: false, message: roleInsert.error.message }, 500)
  }

  if (role === 'dealer' && inviteRow) {
    const consumeRes = await supabase
      .from('dealer_invite_codes')
      .update({
        used_at: new Date().toISOString(),
        used_by_user_id: userId,
      })
      .eq('id', inviteRow.id)
      .is('used_at', null)

    if (consumeRes.error) {
      await supabase.from('user_roles').delete().eq('user_id', userId)
      await supabase.auth.admin.deleteUser(userId)
      return c.json({ ok: false, message: '가입 코드 사용 처리에 실패했습니다.' }, 500)
    }
  }

  return c.json({ ok: true, userId })
})

app.get('/api/dealer-invite-codes', async (c) => {
  const supabase = createSupabaseAdminClient(c.env)
  if (!supabase) {
    return c.json({ ok: false, message: 'Supabase is not configured' }, 500)
  }

  const authUser = await getAuthorizedUser(c, ['super', 'manager'])
  if (!authUser.ok) {
    return c.json({ ok: false, message: authUser.message }, { status: authUser.status })
  }

  const result = await supabase
    .from('dealer_invite_codes')
    .select('id,role,dealer_brand,dealer_code,expires_at,used_at,used_by_user_id,created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  if (result.error) {
    return c.json({ ok: false, message: result.error.message }, 500)
  }

  return c.json({ ok: true, items: result.data ?? [] })
})

app.post('/api/dealer-invite-codes', async (c) => {
  const supabase = createSupabaseAdminClient(c.env)
  if (!supabase) {
    return c.json({ ok: false, message: 'Supabase is not configured' }, 500)
  }

  const authUser = await getAuthorizedUser(c, ['super', 'manager'])
  if (!authUser.ok) {
    return c.json({ ok: false, message: authUser.message }, { status: authUser.status })
  }

  const body = await c.req.json().catch(() => null)
  const dealerBrand = parseDealerBrand(body?.dealerBrand)
  const expiresInDays = clampNumber(String(body?.expiresInDays ?? ''), 7, 1, 365)

  if (!dealerBrand) {
    return c.json({ ok: false, message: '브랜드를 선택해주세요.' }, 400)
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()

  let plainCode = ''
  let codeHash = ''
  let insertError: string | null = null

  for (let attempt = 0; attempt < 5; attempt += 1) {
    plainCode = generateDealerInviteCode(dealerBrand)
    codeHash = await sha256Hex(normalizeInviteCode(plainCode))

    const insertRes = await supabase
      .from('dealer_invite_codes')
      .insert({
        role: 'dealer',
        dealer_brand: dealerBrand,
        dealer_code: null,
        code_hash: codeHash,
        expires_at: expiresAt,
        created_by_user_id: authUser.user.id,
      })
      .select('id,role,dealer_brand,dealer_code,expires_at,used_at,used_by_user_id,created_at')
      .single()

    if (!insertRes.error && insertRes.data) {
      return c.json({
        ok: true,
        code: plainCode,
        item: insertRes.data,
      })
    }

    insertError = insertRes.error?.message ?? '가입 코드 생성에 실패했습니다.'
  }

  return c.json({ ok: false, message: insertError ?? '가입 코드 생성에 실패했습니다.' }, 500)
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

app.get('/api/dealer-vehicles', async (c) => {
  const supabase = createSupabaseAdminClient(c.env)
  const sourceType = parseSourceType(c.req.query('sourceType')) ?? 'lease'
  const dealerBrand = cleanTextQuery(c.req.query('dealerBrand'))
  const snapshotMonth = normalizeSnapshotMonthQuery(c.req.query('snapshotMonth'))
  const keyword = cleanKeywordQuery(c.req.query('q')).toLowerCase()
  const limit = clampNumber(c.req.query('limit'), 500, 1, 3000)

  if (!dealerBrand) {
    return c.json({ ok: false, message: 'dealerBrand is required' }, 400)
  }

  if (!supabase) {
    const rows = buildDealerVehicleRows(
      MOCK_RESIDUAL_VALUES.filter((row) => {
        if (row.source_type !== sourceType) return false
        if (row.maker_name !== dealerBrand) return false
        if (snapshotMonth && row.snapshot_month !== snapshotMonth) return false
        if (!keyword) return true
        const haystack = `${row.model_name} ${row.detail_model_name}`.toLowerCase()
        return haystack.includes(keyword)
      }),
      limit,
    )
    return c.json({ ok: true, items: rows, sourceType, dealerBrand, snapshotMonth, mockMode: true })
  }

  let query = supabase
    .from('residual_values')
    .select('maker_name,model_name,detail_model_name,snapshot_month')
    .eq('source_type', sourceType)
    .eq('maker_name', dealerBrand)

  if (snapshotMonth) {
    query = query.eq('snapshot_month', snapshotMonth)
  }

  const res = await query.order('model_name', { ascending: true }).limit(20000)
  if (res.error) {
    return c.json({ ok: false, message: res.error.message }, 500)
  }

  const filtered = (res.data ?? []).filter((row: any) => {
    if (!keyword) return true
    const haystack = `${row.model_name} ${row.detail_model_name}`.toLowerCase()
    return haystack.includes(keyword)
  })

  const rows = buildDealerVehicleRows(filtered, limit)
  return c.json({ ok: true, items: rows, sourceType, dealerBrand, snapshotMonth })
})

app.get('/api/dealer-discounts', async (c) => {
  const supabase = createSupabaseAdminClient(c.env)
  const sourceType = parseSourceType(c.req.query('sourceType')) ?? 'lease'
  const dealerBrand = cleanTextQuery(c.req.query('dealerBrand'))
  const dealerCode = cleanTextQuery(c.req.query('dealerCode'))
  const snapshotMonth = normalizeSnapshotMonthQuery(c.req.query('snapshotMonth'))
  const limit = clampNumber(c.req.query('limit'), 200, 1, 2000)

  if (!dealerBrand || !dealerCode) {
    return c.json({ ok: false, message: 'dealerBrand and dealerCode are required' }, 400)
  }

  if (!supabase) {
    const items = mockDealerDiscounts
      .filter((row) => {
        if (row.source_type !== sourceType) return false
        if (row.dealer_code !== dealerCode) return false
        if (row.maker_name !== dealerBrand) return false
        if (snapshotMonth && row.snapshot_month !== snapshotMonth) return false
        return true
      })
      .slice(0, limit)
    return c.json({ ok: true, items, sourceType, dealerBrand, dealerCode, snapshotMonth, mockMode: true })
  }

  let query = supabase
    .from('dealer_discounts')
    .select(
      'id,dealer_code,source_type,snapshot_month,maker_name,model_name,detail_model_name,discount_amount,note,created_at,updated_at',
    )
    .eq('source_type', sourceType)
    .eq('dealer_code', dealerCode)
    .eq('maker_name', dealerBrand)

  if (snapshotMonth) {
    query = query.eq('snapshot_month', snapshotMonth)
  }

  const res = await query.order('updated_at', { ascending: false }).limit(limit)
  if (res.error) {
    return c.json({ ok: false, message: res.error.message }, 500)
  }

  return c.json({ ok: true, items: res.data ?? [], sourceType, dealerBrand, dealerCode, snapshotMonth })
})

app.post('/api/dealer-discounts', async (c) => {
  const supabase = createSupabaseAdminClient(c.env)
  const body = await c.req.json().catch(() => null)
  const sourceType = parseSourceType(body?.sourceType) ?? 'lease'
  const dealerCode = normalizeText(body?.dealerCode)
  const dealerBrand = normalizeText(body?.dealerBrand)
  const makerName = normalizeText(body?.maker_name)
  const modelName = normalizeText(body?.model_name)
  const detailModelName = normalizeText(body?.detail_model_name)
  const note = normalizeText(body?.note)
  const snapshotMonth = normalizeSnapshotMonthFromText(body?.snapshotMonth)
  const discountAmount = parseDiscountAmount(body?.discount_amount)

  if (!dealerCode || !dealerBrand) {
    return c.json({ ok: false, message: 'dealerCode and dealerBrand are required' }, 400)
  }
  if (!makerName || !modelName || !detailModelName || !snapshotMonth) {
    return c.json({ ok: false, message: 'maker_name, model_name, detail_model_name, snapshotMonth are required' }, 400)
  }
  if (makerName !== dealerBrand) {
    return c.json({ ok: false, message: 'maker_name must match dealerBrand' }, 400)
  }
  if (discountAmount === null) {
    return c.json({ ok: false, message: 'discount_amount must be a valid number' }, 400)
  }

  if (!supabase) {
    const now = new Date().toISOString()
    const existingIdx = mockDealerDiscounts.findIndex(
      (row) =>
        row.dealer_code === dealerCode &&
        row.source_type === sourceType &&
        row.snapshot_month === snapshotMonth &&
        row.maker_name === makerName &&
        row.model_name === modelName &&
        row.detail_model_name === detailModelName,
    )

    if (existingIdx >= 0) {
      mockDealerDiscounts[existingIdx] = {
        ...mockDealerDiscounts[existingIdx],
        discount_amount: discountAmount,
        note,
        updated_at: now,
      }
      return c.json({ ok: true, item: mockDealerDiscounts[existingIdx], mockMode: true })
    }

    const newItem = {
      id: mockDealerDiscounts.length + 1,
      dealer_code: dealerCode,
      source_type: sourceType,
      snapshot_month: snapshotMonth,
      maker_name: makerName,
      model_name: modelName,
      detail_model_name: detailModelName,
      discount_amount: discountAmount,
      note,
      created_at: now,
      updated_at: now,
    }
    mockDealerDiscounts = [newItem, ...mockDealerDiscounts]
    return c.json({ ok: true, item: newItem, mockMode: true })
  }

  const upsertData = {
    dealer_code: dealerCode,
    source_type: sourceType,
    snapshot_month: snapshotMonth,
    maker_name: makerName,
    model_name: modelName,
    detail_model_name: detailModelName,
    discount_amount: discountAmount,
    note,
    updated_at: new Date().toISOString(),
  }

  const res = await supabase
    .from('dealer_discounts')
    .upsert(upsertData, {
      onConflict:
        'dealer_code,source_type,snapshot_month,maker_name,model_name,detail_model_name',
    })
    .select(
      'id,dealer_code,source_type,snapshot_month,maker_name,model_name,detail_model_name,discount_amount,note,created_at,updated_at',
    )
    .single()

  if (res.error) {
    return c.json(
      {
        ok: false,
        message: 'Failed to upsert dealer discount. Check dealer_discounts table schema/unique key.',
        error: res.error.message,
      },
      500,
    )
  }

  return c.json({ ok: true, item: res.data })
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

async function getAuthUserFromRequest(c: any): Promise<
  | { ok: true; user: { id: string; email?: string | null } }
  | { ok: false; message: string }
> {
  const authHeader = c.req.header('authorization') ?? c.req.header('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) {
    return { ok: false, message: 'Missing bearer token' }
  }

  const supabase = createSupabaseAdminClient(c.env)
  if (!supabase) {
    return { ok: false, message: 'Supabase is not configured' }
  }

  const userRes = await supabase.auth.getUser(token)
  if (userRes.error || !userRes.data.user) {
    return { ok: false, message: userRes.error?.message ?? 'Invalid token' }
  }

  return {
    ok: true,
    user: {
      id: userRes.data.user.id,
      email: userRes.data.user.email ?? null,
    },
  }
}

async function getAuthorizedUser(
  c: any,
  allowedRoles: AppRole[],
): Promise<
  | { ok: true; user: { id: string; email?: string | null }; role: AppRole }
  | { ok: false; message: string; status: ApiStatus }
> {
  const authUser = await getAuthUserFromRequest(c)
  if (!authUser.ok) {
    return { ok: false, message: authUser.message, status: 401 }
  }

  const supabase = createSupabaseAdminClient(c.env)
  if (!supabase) {
    return { ok: false, message: 'Supabase is not configured', status: 500 }
  }

  const roleRes = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', authUser.user.id)
    .maybeSingle()

  if (roleRes.error) {
    return { ok: false, message: roleRes.error.message, status: 500 }
  }

  const role = parseAppRole(roleRes.data?.role)
  if (!role || !allowedRoles.includes(role)) {
    return { ok: false, message: '권한이 없습니다.', status: 403 }
  }

  return { ok: true, user: authUser.user, role }
}

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

async function findDealerInviteCodeByPlaintext(
  supabase: SupabaseAdminClient,
  plainCode: string,
): Promise<
  | { ok: true; invite: InviteCodeRecord }
  | { ok: false; message: string; status: ApiStatus }
> {
  const codeHash = await sha256Hex(normalizeInviteCode(plainCode))
  const inviteRes = await supabase
    .from('dealer_invite_codes')
    .select('id,role,dealer_brand,dealer_code,expires_at,used_at,used_by_user_id,created_at')
    .eq('code_hash', codeHash)
    .maybeSingle()

  if (inviteRes.error) {
    return { ok: false, message: inviteRes.error.message, status: 500 }
  }

  const invite = inviteRes.data as InviteCodeRecord | null
  if (!invite) {
    return { ok: false, message: '유효하지 않은 가입 코드입니다.', status: 404 }
  }

  if (invite.role !== 'dealer' || !invite.dealer_brand) {
    return { ok: false, message: '딜러 가입 코드가 아닙니다.', status: 400 }
  }

  if (invite.used_at) {
    return { ok: false, message: '이미 사용된 가입 코드입니다.', status: 409 }
  }

  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    return { ok: false, message: '만료된 가입 코드입니다.', status: 410 }
  }

  return { ok: true, invite }
}

function generateDealerInviteCode(brand: DealerBrand): string {
  const prefix = brand.slice(0, 3)
  return `${prefix}-${randomCodePart(4)}-${randomCodePart(4)}`
}

function randomCodePart(length: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let out = ''
  for (let i = 0; i < bytes.length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length]
  }
  return out
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
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
): SuggestionField | null {
  if (value === 'maker_name' || value === 'model_name' || value === 'finance_name') {
    return value
  }
  return null
}

function parseAppRole(value: unknown): AppRole | null {
  if (value === 'super' || value === 'manager' || value === 'dealer') {
    return value
  }
  return null
}

function parseDealerBrand(value: unknown): DealerBrand | null {
  if (
    value === 'BMW' ||
    value === 'BENZ' ||
    value === 'AUDI' ||
    value === 'HYUNDAI' ||
    value === 'KIA' ||
    value === 'GENESIS' ||
    value === 'ETC'
  ) {
    return value
  }
  return null
}

function normalizeLoginId(value: unknown): string {
  return normalizeText(value).toLowerCase()
}

function normalizeInviteCode(value: unknown): string {
  return normalizeText(value).toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '')
}

function toAuthEmail(loginId: string) {
  const normalized = loginId.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')
  return `${normalized}@mrcha.local`
}

function parseDiscountAmount(value: unknown): number | null {
  const raw = String(value ?? '')
    .replace(/,/g, '')
    .trim()
  if (!raw) return null
  const num = Number(raw)
  if (!Number.isFinite(num)) return null
  return Math.round(num)
}

function normalizeSnapshotMonthFromText(value: unknown): string | null {
  const raw = normalizeText(value)
  if (!raw) return null
  return normalizeSnapshotMonthQuery(raw)
}

function buildDealerVehicleRows(rows: ReadonlyArray<any>, limit: number): DealerVehicleRow[] {
  const map = new Map<string, DealerVehicleRow>()
  for (const row of rows) {
    const makerName = normalizeText(row.maker_name)
    const modelName = normalizeText(row.model_name)
    const detailModelName = normalizeText(row.detail_model_name)
    if (!makerName || !modelName || !detailModelName) continue
    const key = [makerName, modelName, detailModelName].join('|')
    if (!map.has(key)) {
      map.set(key, {
        maker_name: makerName,
        model_name: modelName,
        detail_model_name: detailModelName,
      })
    }
    if (map.size >= limit) break
  }

  return Array.from(map.values()).sort((a, b) => {
    const makerSort = a.maker_name.localeCompare(b.maker_name, 'ko')
    if (makerSort !== 0) return makerSort
    const modelSort = a.model_name.localeCompare(b.model_name, 'ko')
    if (modelSort !== 0) return modelSort
    return a.detail_model_name.localeCompare(b.detail_model_name, 'ko')
  })
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
