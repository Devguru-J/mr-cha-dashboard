import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import './App.css'
import { hasSupabaseConfig, supabase } from './lib/supabase'

type SourceType = 'lease' | 'rent'
type MenuKey = 'home' | 'explorer' | 'best' | 'changes' | 'uploads' | 'dealer-discounts' | 'invite-codes'
type AppRole = 'super' | 'manager' | 'dealer'
type AuthMode = 'login' | 'signup'
type DealerBrand = 'BMW' | 'BENZ' | 'AUDI' | 'HYUNDAI' | 'KIA' | 'GENESIS' | 'ETC'
type ResidualSortBy =
  | 'residual_value_percent'
  | 'maker_name'
  | 'model_name'
  | 'lineup_name'
  | 'detail_model_name'
  | 'term_months'
  | 'annual_mileage_km'
  | 'finance_name'
  | 'snapshot_month'
type ResidualSortOrder = 'asc' | 'desc'

type ResidualValueRow = {
  id: number
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

type ResidualResponse = {
  ok: boolean
  items: ResidualValueRow[]
  total: number
}

type BestValuesResponse = {
  ok: boolean
  items: ResidualValueRow[]
  total_groups: number
}

type FilterState = {
  sourceType: SourceType
  q: string
  maker: string
  model: string
  finance: string
  snapshotMonth: string
  termMonths: string
  annualMileageKm: string
  pageSize: number
  sortBy: ResidualSortBy
  sortOrder: ResidualSortOrder
}

type ChangeRow = {
  source_type: SourceType
  maker_name: string
  model_name: string
  detail_model_name: string
  previous_percent: number
  current_percent: number
  delta_pp: number
  snapshot_month: string
}

type ChangeFilterState = {
  direction: 'all' | 'up' | 'down'
  sortBy: 'abs' | 'delta_desc' | 'delta_asc'
  minAbsDeltaPp: string
  pageSize: number
}

type UploadHistoryRow = {
  id: string
  source_file_name: string
  snapshot_month: string
  total_rows?: number
  invalid_rows?: number
  status: 'completed' | 'failed' | 'processing'
  created_at: string
}

type DealerVehicleRow = {
  maker_name: string
  model_name: string
  detail_model_name: string
}

type DealerDiscountRow = {
  id: number
  dealer_code: string
  source_type: SourceType
  snapshot_month: string
  maker_name: string
  model_name: string
  detail_model_name: string
  discount_amount: number
  note?: string
  updated_at: string
}

type DealerInviteCodeRow = {
  id: string
  role: AppRole
  dealer_brand: DealerBrand | null
  dealer_code: string | null
  expires_at: string | null
  used_at: string | null
  used_by_user_id: string | null
  created_at: string
}

type MeResponse = {
  ok: boolean
  user?: {
    user_id: string
    email: string
    role: AppRole | null
    login_id: string | null
    dealer_brand: string | null
    dealer_code: string | null
  }
  message?: string
}

const DEFAULT_FILTERS: FilterState = {
  sourceType: 'lease',
  q: '',
  maker: '',
  model: '',
  finance: '',
  snapshotMonth: '',
  termMonths: '',
  annualMileageKm: '',
  pageSize: 50,
  sortBy: 'residual_value_percent',
  sortOrder: 'desc',
}

const DEFAULT_CHANGE_FILTERS: ChangeFilterState = {
  direction: 'all',
  sortBy: 'abs',
  minAbsDeltaPp: '',
  pageSize: 50,
}

const DEALER_BRANDS: DealerBrand[] = ['BMW', 'BENZ', 'AUDI', 'HYUNDAI', 'KIA', 'GENESIS', 'ETC']

const MENU: Array<{ key: MenuKey; label: string }> = [
  { key: 'home', label: '대시보드' },
  { key: 'explorer', label: '데이터 탐색기' },
  { key: 'best', label: '최고 잔존가치' },
  { key: 'changes', label: '변동 리포트' },
  { key: 'uploads', label: '업로드 이력' },
  { key: 'dealer-discounts', label: '딜러 할인 입력' },
  { key: 'invite-codes', label: '가입 코드 관리' },
]

function App() {
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [authLoginId, setAuthLoginId] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [signupRole, setSignupRole] = useState<AppRole>('dealer')
  const [signupInviteCode, setSignupInviteCode] = useState('')
  const [signupDealerCode, setSignupDealerCode] = useState('')
  const [signupAdminToken, setSignupAdminToken] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authMessage, setAuthMessage] = useState<string | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [profile, setProfile] = useState<MeResponse['user'] | null>(null)

  const [menu, setMenu] = useState<MenuKey>('home')

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)

  const [rows, setRows] = useState<ResidualValueRow[]>([])
  const [total, setTotal] = useState(0)
  const [bestRows, setBestRows] = useState<ResidualValueRow[]>([])
  const [bestTotal, setBestTotal] = useState(0)
  const [isMockMode, setIsMockMode] = useState(false)
  const [changeRows, setChangeRows] = useState<ChangeRow[]>([])
  const [changeTotal, setChangeTotal] = useState(0)
  const [changeFilters, setChangeFilters] = useState<ChangeFilterState>(DEFAULT_CHANGE_FILTERS)
  const [changePage, setChangePage] = useState(1)
  const [uploadRows, setUploadRows] = useState<UploadHistoryRow[]>([])
  const [dealerBrand, setDealerBrand] = useState('BMW')
  const [dealerCode, setDealerCode] = useState('BMW-SEOUL-01')
  const [dealerSearchText, setDealerSearchText] = useState('')
  const [dealerSearchApplied, setDealerSearchApplied] = useState('')
  const [dealerVehicles, setDealerVehicles] = useState<DealerVehicleRow[]>([])
  const [dealerDiscountRows, setDealerDiscountRows] = useState<DealerDiscountRow[]>([])
  const [dealerDraftAmounts, setDealerDraftAmounts] = useState<Record<string, string>>({})
  const [dealerLoading, setDealerLoading] = useState(false)
  const [dealerSubmitMessage, setDealerSubmitMessage] = useState<string | null>(null)
  const [dealerSubmitError, setDealerSubmitError] = useState<string | null>(null)
  const [inviteDealerBrand, setInviteDealerBrand] = useState<DealerBrand>('BMW')
  const [inviteExpiresInDays, setInviteExpiresInDays] = useState('7')
  const [inviteRows, setInviteRows] = useState<DealerInviteCodeRow[]>([])
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteMessage, setInviteMessage] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteCreatedCode, setInviteCreatedCode] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<{
    maker: string[]
    model: string[]
    finance: string[]
  }>({
    maker: [],
    model: [],
    finance: [],
  })
  const [uploading, setUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalPages = useMemo(() => {
    const raw = Math.ceil(total / appliedFilters.pageSize)
    return raw > 0 ? raw : 1
  }, [total, appliedFilters.pageSize])

  const averageLease = useMemo(() => getAverage(rows, 'lease'), [rows])
  const averageRent = useMemo(() => getAverage(rows, 'rent'), [rows])
  const biggestDrop = useMemo(() => getBiggestDrop(changeRows), [changeRows])
  const changeTotalPages = useMemo(() => {
    const raw = Math.ceil(changeTotal / changeFilters.pageSize)
    return raw > 0 ? raw : 1
  }, [changeTotal, changeFilters.pageSize])

  const fetchMyProfile = async (token: string) => {
    const res = await fetch('/api/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = (await res.json()) as MeResponse
    if (!res.ok || !data.ok || !data.user) {
      throw new Error(data.message ?? '프로필 조회 실패')
    }
    setProfile(data.user)
    if (data.user.role === 'dealer') {
      setMenu('dealer-discounts')
      if (data.user.dealer_brand) setDealerBrand(data.user.dealer_brand)
      if (data.user.dealer_code) setDealerCode(data.user.dealer_code)
    }
  }

  useEffect(() => {
    if (!supabase) return
    let mounted = true
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      const token = data.session?.access_token ?? null
      setAccessToken(token)
      if (token) {
        try {
          await fetchMyProfile(token)
        } catch {
          setProfile(null)
        }
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const token = session?.access_token ?? null
      setAccessToken(token)
      if (!token) {
        setProfile(null)
        return
      }
      void fetchMyProfile(token).catch(() => {
        setProfile(null)
      })
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (menu !== 'invite-codes') return
    if (!accessToken) return
    if (profile?.role !== 'super' && profile?.role !== 'manager') return
    void loadInviteCodes()
  }, [menu, accessToken, profile?.role])

  useEffect(() => {
    if (!accessToken || !profile) return
    if (profile.role === 'dealer') return
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const listParams = buildParams(appliedFilters, page)
        const bestParams = buildParams(appliedFilters, 1)
        bestParams.set('limit', '30')

        const [listRes, bestRes] = await Promise.all([
          fetch(`/api/residual-values?${listParams.toString()}`),
          fetch(`/api/best-values?${bestParams.toString()}`),
        ])

        if (!listRes.ok) throw new Error(`잔존가치 조회 실패: ${listRes.status}`)
        if (!bestRes.ok) throw new Error(`최고값 조회 실패: ${bestRes.status}`)

        const listData = (await listRes.json()) as ResidualResponse & { mockMode?: boolean }
        const bestData = (await bestRes.json()) as BestValuesResponse

        setRows(listData.items ?? [])
        setTotal(listData.total ?? 0)
        setBestRows(bestData.items ?? [])
        setBestTotal(bestData.total_groups ?? 0)
        setIsMockMode(Boolean(listData.mockMode))

        const [changesRes, uploadsRes] = await Promise.all([
          fetch(`/api/changes?${buildChangesParams(appliedFilters.sourceType, appliedFilters.snapshotMonth, changeFilters, changePage).toString()}`),
          fetch('/api/uploads?limit=20'),
        ])
        if (changesRes.ok) {
          const changesData = (await changesRes.json()) as { items?: ChangeRow[]; total?: number }
          setChangeRows(changesData.items ?? [])
          setChangeTotal(changesData.total ?? 0)
        }
        if (uploadsRes.ok) {
          const uploadsData = (await uploadsRes.json()) as { items?: UploadHistoryRow[] }
          setUploadRows(uploadsData.items ?? [])
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '알 수 없는 오류')
      } finally {
        setLoading(false)
      }
    }
    void run()
  }, [appliedFilters, page, changeFilters, changePage])

  useEffect(() => {
    if (menu !== 'dealer-discounts') return
    if (!dealerBrand.trim() || !dealerCode.trim()) return

    const run = async () => {
      setDealerLoading(true)
      try {
        const vehicleParams = new URLSearchParams({
          sourceType: appliedFilters.sourceType,
          dealerBrand: dealerBrand.trim(),
          limit: '2000',
        })
        if (dealerSearchApplied.trim()) {
          vehicleParams.set('q', dealerSearchApplied.trim())
        }
        if (appliedFilters.snapshotMonth.trim()) {
          vehicleParams.set('snapshotMonth', appliedFilters.snapshotMonth.trim())
        }

        const discountParams = new URLSearchParams({
          sourceType: appliedFilters.sourceType,
          dealerBrand: dealerBrand.trim(),
          dealerCode: dealerCode.trim(),
          limit: '500',
        })
        if (appliedFilters.snapshotMonth.trim()) {
          discountParams.set('snapshotMonth', appliedFilters.snapshotMonth.trim())
        }

        const [vehiclesRes, discountsRes] = await Promise.all([
          fetch(`/api/dealer-vehicles?${vehicleParams.toString()}`),
          fetch(`/api/dealer-discounts?${discountParams.toString()}`),
        ])

        if (!vehiclesRes.ok) throw new Error(`딜러 차량 목록 조회 실패: ${vehiclesRes.status}`)
        if (!discountsRes.ok) throw new Error(`딜러 할인 목록 조회 실패: ${discountsRes.status}`)

        const vehiclesData = (await vehiclesRes.json()) as { items?: DealerVehicleRow[] }
        const discountsData = (await discountsRes.json()) as { items?: DealerDiscountRow[] }
        const vehicleItems = vehiclesData.items ?? []
        setDealerVehicles(vehicleItems)
        setDealerDiscountRows(discountsData.items ?? [])
      } catch (err) {
        setDealerSubmitError(err instanceof Error ? err.message : '딜러 데이터 조회 중 오류가 발생했습니다.')
      } finally {
        setDealerLoading(false)
      }
    }
    void run()
  }, [menu, appliedFilters.sourceType, appliedFilters.snapshotMonth, dealerBrand, dealerCode, dealerSearchApplied])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const base = new URLSearchParams()
        base.set('sourceType', filters.sourceType)
        base.set('limit', '10')
        if (filters.snapshotMonth.trim()) base.set('snapshotMonth', filters.snapshotMonth.trim())

        const call = async (field: 'maker_name' | 'model_name' | 'finance_name', q: string) => {
          if (!q.trim()) return []
          const params = new URLSearchParams(base)
          params.set('field', field)
          params.set('q', q.trim())
          const res = await fetch(`/api/suggestions?${params.toString()}`)
          if (!res.ok) return []
          const data = (await res.json()) as { items?: string[] }
          return data.items ?? []
        }

        const [maker, model, finance] = await Promise.all([
          call('maker_name', filters.maker),
          call('model_name', filters.model),
          call('finance_name', filters.finance),
        ])

        if (!cancelled) {
          setSuggestions({ maker, model, finance })
        }
      } catch {
        if (!cancelled) {
          setSuggestions({ maker: [], model: [], finance: [] })
        }
      }
    }, 180)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [filters.sourceType, filters.snapshotMonth, filters.maker, filters.model, filters.finance])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setPage(1)
    setChangePage(1)
    setAppliedFilters({ ...filters })
  }

  const onSourceChange = (sourceType: SourceType) => {
    const next = { ...filters, sourceType }
    setFilters(next)
    setPage(1)
    setChangePage(1)
    setAppliedFilters(next)
  }

  const onAuthSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase) {
      setAuthError('Supabase 설정이 필요합니다. VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 확인')
      return
    }

    setAuthLoading(true)
    setAuthError(null)
    setAuthMessage(null)

    try {
      const loginId = authLoginId.trim().toLowerCase()
      if (!loginId) {
        throw new Error('아이디를 입력해주세요.')
      }

      if (authMode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: toAuthEmail(loginId),
          password: authPassword,
        })
        if (error) throw error
        const token = data.session?.access_token
        if (!token) throw new Error('세션 토큰이 없습니다.')
        await fetchMyProfile(token)
        setAuthMessage('로그인 성공')
      } else {
        const signupRes = await fetch('/api/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            loginId,
            password: authPassword,
            role: signupRole,
            inviteCode: signupRole === 'dealer' ? signupInviteCode : null,
            dealerCode: signupRole === 'dealer' ? signupDealerCode.trim() : null,
            adminSignupToken: signupRole === 'dealer' ? '' : signupAdminToken,
          }),
        })
        const signupData = (await signupRes.json()) as { ok?: boolean; message?: string }
        if (!signupRes.ok || !signupData.ok) {
          throw new Error(signupData.message ?? '회원가입 실패')
        }

        setAuthMessage('회원가입 완료. 로그인해주세요.')
        setAuthMode('login')
        setAuthPassword('')
        setSignupInviteCode('')
        setSignupDealerCode('')
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : '인증 처리 중 오류가 발생했습니다.')
    } finally {
      setAuthLoading(false)
    }
  }

  const onLogout = async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setProfile(null)
    setAccessToken(null)
    setMenu('home')
  }

  const loadInviteCodes = async () => {
    if (!accessToken) return

    setInviteLoading(true)
    setInviteError(null)

    try {
      const res = await fetch('/api/dealer-invite-codes', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = (await res.json()) as { ok?: boolean; message?: string; items?: DealerInviteCodeRow[] }
      if (!res.ok || !data.ok) {
        throw new Error(data.message ?? '가입 코드 목록 조회 실패')
      }
      setInviteRows(data.items ?? [])
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : '가입 코드 목록 조회 중 오류가 발생했습니다.')
    } finally {
      setInviteLoading(false)
    }
  }

  const createInviteCode = async () => {
    if (!accessToken) return

    setInviteLoading(true)
    setInviteError(null)
    setInviteMessage(null)
    setInviteCreatedCode(null)

    try {
      const res = await fetch('/api/dealer-invite-codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          dealerBrand: inviteDealerBrand,
          expiresInDays: inviteExpiresInDays.trim() || '7',
        }),
      })

      const data = (await res.json()) as {
        ok?: boolean
        message?: string
        code?: string
        item?: DealerInviteCodeRow
      }

      if (!res.ok || !data.ok || !data.code || !data.item) {
        throw new Error(data.message ?? '가입 코드 생성 실패')
      }

      setInviteCreatedCode(data.code)
      setInviteMessage('가입 코드가 생성되었습니다. 이 코드는 한 번만 표시됩니다.')
      setInviteRows((prev) => [data.item!, ...prev])
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : '가입 코드 생성 중 오류가 발생했습니다.')
    } finally {
      setInviteLoading(false)
    }
  }

  const uploadLeaseFile = async (file: File, snapshotMonth: string) => {
    setUploading(true)
    setUploadMessage(null)
    setUploadError(null)

    try {
      const form = new FormData()
      form.append('file', file)
      form.append('snapshotMonth', snapshotMonth)

      const res = await fetch('/api/uploads', {
        method: 'POST',
        body: form,
      })

      const raw = await res.text()
      const data = (raw ? safeJsonParse(raw) : null) as
        | {
            ok?: boolean
            message?: string
            valid_rows?: number
            invalid_rows?: number
            mockMode?: boolean
          }
        | null

      if (!data) {
        const hint =
          res.status === 500
            ? 'API 서버가 내려가 있거나 프록시 오류일 수 있습니다. dev:api 실행 상태를 확인하세요.'
            : '응답 본문이 비어 있습니다.'
        throw new Error(`업로드 응답 파싱 실패 (${res.status}) - ${hint}`)
      }

      if (!res.ok || !data.ok) {
        throw new Error(data.message ?? `업로드 실패 (${res.status})`)
      }

      setUploadMessage(
        `업로드 성공: 유효 ${Number(data.valid_rows ?? 0).toLocaleString()}행, 오류 ${Number(
          data.invalid_rows ?? 0,
        ).toLocaleString()}행${data.mockMode ? ' (mock 모드 저장 없음)' : ''}`,
      )

      const uploadsRes = await fetch('/api/uploads?limit=20')
      if (uploadsRes.ok) {
        const uploadsData = (await uploadsRes.json()) as { items?: UploadHistoryRow[] }
        setUploadRows(uploadsData.items ?? [])
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '업로드 중 오류가 발생했습니다.')
    } finally {
      setUploading(false)
    }
  }

  const submitDealerDiscount = async (vehicle: DealerVehicleRow, rawAmount: string) => {
    setDealerSubmitError(null)
    setDealerSubmitMessage(null)
    const amount = rawAmount.replace(/,/g, '').trim()
    if (!amount) {
      setDealerSubmitError('할인 금액을 입력해주세요.')
      return
    }

    try {
      const res = await fetch('/api/dealer-discounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: appliedFilters.sourceType,
          snapshotMonth: appliedFilters.snapshotMonth.trim() || formatCurrentMonth(),
          dealerBrand: dealerBrand.trim(),
          dealerCode: dealerCode.trim(),
          maker_name: vehicle.maker_name,
          model_name: vehicle.model_name,
          detail_model_name: vehicle.detail_model_name,
          discount_amount: amount,
          note: '',
        }),
      })

      const data = (await res.json()) as { ok?: boolean; message?: string }
      if (!res.ok || !data.ok) {
        throw new Error(data.message ?? `할인 저장 실패 (${res.status})`)
      }

      setDealerSubmitMessage('할인 정보가 저장되었습니다.')
      setDealerDraftAmounts((prev) => ({ ...prev, [toVehicleKey(vehicle)]: amount }))

      const refreshParams = new URLSearchParams({
        sourceType: appliedFilters.sourceType,
        dealerBrand: dealerBrand.trim(),
        dealerCode: dealerCode.trim(),
        limit: '500',
      })
      if (appliedFilters.snapshotMonth.trim()) {
        refreshParams.set('snapshotMonth', appliedFilters.snapshotMonth.trim())
      }

      const refreshRes = await fetch(`/api/dealer-discounts?${refreshParams.toString()}`)
      if (refreshRes.ok) {
        const refreshData = (await refreshRes.json()) as { items?: DealerDiscountRow[] }
        setDealerDiscountRows(refreshData.items ?? [])
      }
    } catch (err) {
      setDealerSubmitError(err instanceof Error ? err.message : '할인 저장 중 오류가 발생했습니다.')
    }
  }

  const submitDealerDiscountAll = async () => {
    setDealerSubmitError(null)
    setDealerSubmitMessage(null)

    const targets = dealerVehicles
      .map((vehicle) => {
        const key = toVehicleKey(vehicle)
        const amount = (dealerDraftAmounts[key] ?? '').replace(/,/g, '').trim()
        return { vehicle, amount }
      })
      .filter((item) => item.amount.length > 0)

    if (targets.length === 0) {
      setDealerSubmitError('일괄 저장할 할인 금액이 없습니다.')
      return
    }

    try {
      const snapshotMonth = appliedFilters.snapshotMonth.trim() || formatCurrentMonth()
      const results = await Promise.all(
        targets.map(async ({ vehicle, amount }) => {
          const res = await fetch('/api/dealer-discounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sourceType: appliedFilters.sourceType,
              snapshotMonth,
              dealerBrand: dealerBrand.trim(),
              dealerCode: dealerCode.trim(),
              maker_name: vehicle.maker_name,
              model_name: vehicle.model_name,
              detail_model_name: vehicle.detail_model_name,
              discount_amount: amount,
              note: '',
            }),
          })

          const data = (await res.json()) as { ok?: boolean; message?: string }
          if (!res.ok || !data.ok) {
            throw new Error(data.message ?? `일괄 저장 실패 (${res.status})`)
          }
          return true
        }),
      )

      setDealerSubmitMessage(`일괄 저장 완료: ${results.length}건`)

      const refreshParams = new URLSearchParams({
        sourceType: appliedFilters.sourceType,
        dealerBrand: dealerBrand.trim(),
        dealerCode: dealerCode.trim(),
        limit: '500',
      })
      if (appliedFilters.snapshotMonth.trim()) {
        refreshParams.set('snapshotMonth', appliedFilters.snapshotMonth.trim())
      }

      const refreshRes = await fetch(`/api/dealer-discounts?${refreshParams.toString()}`)
      if (refreshRes.ok) {
        const refreshData = (await refreshRes.json()) as { items?: DealerDiscountRow[] }
        setDealerDiscountRows(refreshData.items ?? [])
      }
    } catch (err) {
      setDealerSubmitError(err instanceof Error ? err.message : '일괄 저장 중 오류가 발생했습니다.')
    }
  }

  const applyDealerSearch = () => {
    setDealerSubmitError(null)
    setDealerSearchApplied(dealerSearchText.trim())
  }

  if (!hasSupabaseConfig) {
    return (
      <main className="content">
        <section className="panel">
          <h2>Supabase 설정 필요</h2>
          <p className="section-sub">
            <code>VITE_SUPABASE_URL</code>, <code>VITE_SUPABASE_ANON_KEY</code>를 설정한 뒤 다시 실행해주세요.
          </p>
        </section>
      </main>
    )
  }

  if (!accessToken || !profile?.role) {
    return (
      <main className="stitch-auth-shell">
        <section className="stitch-auth-container">
          <div className="stitch-brand-block">
            <div className="stitch-brand-icon">🚘</div>
            <h1>MR CHA 운영자</h1>
            <p>운영자 전용 관리 시스템에 로그인하세요</p>
          </div>
          <div className="stitch-auth-card">
            <div className="stitch-tabs">
              <button
                type="button"
                className={authMode === 'login' ? 'stitch-tab active' : 'stitch-tab'}
                onClick={() => setAuthMode('login')}
              >
                로그인
              </button>
              <button
                type="button"
                className={authMode === 'signup' ? 'stitch-tab active' : 'stitch-tab'}
                onClick={() => setAuthMode('signup')}
              >
                회원가입
              </button>
            </div>
            <form className="stitch-auth-form" onSubmit={onAuthSubmit}>
              <div className="stitch-field">
                <label>아이디</label>
                <input
                  type="text"
                  placeholder="아이디를 입력하세요"
                  value={authLoginId}
                  onChange={(e) => setAuthLoginId(e.target.value)}
                  required
                />
              </div>
              <div className="stitch-field">
                <label>비밀번호</label>
                <input
                  type="password"
                  placeholder="비밀번호를 입력하세요"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  required
                />
              </div>
              {authMode === 'login' && (
                <div className="stitch-helper-row">
                  <label>
                    <input type="checkbox" /> 로그인 상태 유지
                  </label>
                  <a href="#">비밀번호 찾기</a>
                </div>
              )}
              {authMode === 'signup' && (
                <>
                  <div className="stitch-field">
                    <label>권한 설정(역할)</label>
                    <select value={signupRole} onChange={(e) => setSignupRole(e.target.value as AppRole)}>
                      <option value="dealer">dealer</option>
                      <option value="manager">manager</option>
                      <option value="super">super</option>
                    </select>
                  </div>
                  {signupRole === 'dealer' ? (
                    <>
                      <div className="stitch-field">
                        <label>가입 코드</label>
                        <input
                          placeholder="발급받은 가입 코드를 입력하세요"
                          value={signupInviteCode}
                          onChange={(e) => setSignupInviteCode(e.target.value.toUpperCase())}
                          required
                        />
                      </div>
                      <div className="stitch-field">
                        <label>딜러 코드</label>
                        <input
                          placeholder="예: BMW-SEOUL-01"
                          value={signupDealerCode}
                          onChange={(e) => setSignupDealerCode(e.target.value)}
                          required
                        />
                      </div>
                    </>
                  ) : (
                    <div className="stitch-field">
                      <label>관리자 가입 토큰</label>
                      <input
                        type="password"
                        placeholder="관리자 가입 토큰"
                        value={signupAdminToken}
                        onChange={(e) => setSignupAdminToken(e.target.value)}
                        required
                      />
                    </div>
                  )}
                </>
              )}
              <button type="submit" className="stitch-submit" disabled={authLoading}>
                {authLoading ? '처리중...' : authMode === 'login' ? '로그인' : '가입 신청하기'}
              </button>
            </form>
            {authMessage && <p className="upload-msg ok">{authMessage}</p>}
            {authError && <p className="upload-msg err">{authError}</p>}
          </div>
          <div className="stitch-auth-footer">
            <a href="#">Terms</a>
            <a href="#">Privacy</a>
            <a href="#">Help Center</a>
          </div>
        </section>
      </main>
    )
  }

  const visibleMenu =
    profile.role === 'dealer'
      ? MENU.filter((item) => item.key === 'dealer-discounts')
      : MENU.filter((item) => item.key !== 'invite-codes' || profile.role === 'super' || profile.role === 'manager')

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand">MR CHA 운영자</div>
          <nav className="menu">
            {visibleMenu.map((item) => (
              <button
                key={item.key}
                type="button"
                className={menu === item.key ? 'menu-item active' : 'menu-item'}
                onClick={() => setMenu(item.key)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
        <button type="button" className="ghost-btn sidebar-logout" onClick={onLogout}>
          로그아웃
        </button>
      </aside>

      <main className="content">
        <header className="topbar">
          <h1>{getPageTitle(menu)}</h1>
          {isMockMode && <span className="badge">Mock 데이터 모드</span>}
        </header>

        {menu !== 'dealer-discounts' && menu !== 'invite-codes' && (
          <>
            <section className="panel source-tabs">
              <button
                className={appliedFilters.sourceType === 'lease' ? 'tab active' : 'tab'}
                onClick={() => onSourceChange('lease')}
                type="button"
              >
                리스
              </button>
              <button
                className={appliedFilters.sourceType === 'rent' ? 'tab active' : 'tab'}
                onClick={() => onSourceChange('rent')}
                type="button"
              >
                렌트
              </button>
            </section>

            <section className="panel">
              <form className="filters" onSubmit={onSubmit}>
                <input
                  placeholder="통합 검색 (차종/라인업/세부모델/금융사)"
                  value={filters.q}
                  onChange={(e) => setFilters({ ...filters, q: e.target.value })}
                />
                <input
                  list="maker-suggestions"
                  placeholder="제조사"
                  value={filters.maker}
                  onChange={(e) => setFilters({ ...filters, maker: e.target.value })}
                />
                <input
                  list="model-suggestions"
                  placeholder="모델"
                  value={filters.model}
                  onChange={(e) => setFilters({ ...filters, model: e.target.value })}
                />
                <input
                  list="finance-suggestions"
                  placeholder="금융사"
                  value={filters.finance}
                  onChange={(e) => setFilters({ ...filters, finance: e.target.value })}
                />
                <input
                  placeholder="기준월 (YYYY-MM)"
                  value={filters.snapshotMonth}
                  onChange={(e) => setFilters({ ...filters, snapshotMonth: e.target.value })}
                />
                <input placeholder="기간(개월)" value={filters.termMonths} onChange={(e) => setFilters({ ...filters, termMonths: e.target.value })} />
                <input
                  placeholder="약정거리(km)"
                  value={filters.annualMileageKm}
                  onChange={(e) => setFilters({ ...filters, annualMileageKm: e.target.value })}
                />
                <select value={filters.pageSize} onChange={(e) => setFilters({ ...filters, pageSize: Number(e.target.value) })}>
                  <option value={20}>20개</option>
                  <option value={50}>50개</option>
                  <option value={100}>100개</option>
                </select>
                <select
                  value={filters.sortBy}
                  onChange={(e) => setFilters({ ...filters, sortBy: e.target.value as ResidualSortBy })}
                >
                  <option value="residual_value_percent">정렬: 잔존가치%</option>
                  <option value="maker_name">정렬: 제조사</option>
                  <option value="model_name">정렬: 모델</option>
                  <option value="detail_model_name">정렬: 세부모델</option>
                  <option value="term_months">정렬: 기간</option>
                  <option value="annual_mileage_km">정렬: 약정거리</option>
                  <option value="finance_name">정렬: 금융사</option>
                  <option value="snapshot_month">정렬: 기준월</option>
                </select>
                <select
                  value={filters.sortOrder}
                  onChange={(e) => setFilters({ ...filters, sortOrder: e.target.value as ResidualSortOrder })}
                >
                  <option value="desc">내림차순</option>
                  <option value="asc">오름차순</option>
                </select>
                <button type="submit">조회</button>
                <datalist id="maker-suggestions">
                  {suggestions.maker.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
                <datalist id="model-suggestions">
                  {suggestions.model.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
                <datalist id="finance-suggestions">
                  {suggestions.finance.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </form>
            </section>
          </>
        )}

        {error && <p className="error">{error}</p>}

        {renderPage(menu, {
          rows,
          bestRows,
          bestTotal,
          loading,
          total,
          page,
          totalPages,
          setPage,
          averageLease,
          averageRent,
          biggestDrop,
          changeRows,
          changeTotal,
          changeFilters,
          setChangeFilters,
          changePage,
          changeTotalPages,
          setChangePage,
          uploadRows,
          dealerBrand,
          setDealerBrand,
          dealerCode,
          setDealerCode,
          isDealerUser: profile.role === 'dealer',
          dealerSearchText,
          setDealerSearchText,
          applyDealerSearch,
          dealerVehicles,
          dealerDiscountRows,
          dealerDraftAmounts,
          setDealerDraftAmounts,
          dealerLoading,
          dealerSubmitMessage,
          dealerSubmitError,
          submitDealerDiscount,
          submitDealerDiscountAll,
          uploadLeaseFile,
          uploading,
          uploadMessage,
          uploadError,
          inviteDealerBrand,
          setInviteDealerBrand,
          inviteExpiresInDays,
          setInviteExpiresInDays,
          inviteRows,
          inviteLoading,
          inviteMessage,
          inviteError,
          inviteCreatedCode,
          createInviteCode,
          loadInviteCodes,
          isInviteManager: profile.role === 'super' || profile.role === 'manager',
        })}
      </main>
    </div>
  )
}

function safeJsonParse(input: string): unknown | null {
  try {
    return JSON.parse(input)
  } catch {
    return null
  }
}

function renderPage(
  menu: MenuKey,
  state: {
    rows: ResidualValueRow[]
    bestRows: ResidualValueRow[]
    bestTotal: number
    loading: boolean
    total: number
    page: number
    totalPages: number
    setPage: (next: number | ((prev: number) => number)) => void
    averageLease: number
    averageRent: number
    biggestDrop: number
    changeRows: ChangeRow[]
    changeTotal: number
    changeFilters: ChangeFilterState
    setChangeFilters: (next: ChangeFilterState) => void
    changePage: number
    changeTotalPages: number
    setChangePage: (next: number | ((prev: number) => number)) => void
    uploadRows: UploadHistoryRow[]
    dealerBrand: string
    setDealerBrand: (value: string) => void
    dealerCode: string
    setDealerCode: (value: string) => void
    isDealerUser: boolean
    dealerSearchText: string
    setDealerSearchText: (value: string) => void
    applyDealerSearch: () => void
    dealerVehicles: DealerVehicleRow[]
    dealerDiscountRows: DealerDiscountRow[]
    dealerDraftAmounts: Record<string, string>
    setDealerDraftAmounts: (updater: (prev: Record<string, string>) => Record<string, string>) => void
    dealerLoading: boolean
    dealerSubmitMessage: string | null
    dealerSubmitError: string | null
    submitDealerDiscount: (vehicle: DealerVehicleRow, rawAmount: string) => Promise<void>
    submitDealerDiscountAll: () => Promise<void>
    uploadLeaseFile: (file: File, snapshotMonth: string) => Promise<void>
    uploading: boolean
    uploadMessage: string | null
    uploadError: string | null
    inviteDealerBrand: DealerBrand
    setInviteDealerBrand: (value: DealerBrand) => void
    inviteExpiresInDays: string
    setInviteExpiresInDays: (value: string) => void
    inviteRows: DealerInviteCodeRow[]
    inviteLoading: boolean
    inviteMessage: string | null
    inviteError: string | null
    inviteCreatedCode: string | null
    createInviteCode: () => Promise<void>
    loadInviteCodes: () => Promise<void>
    isInviteManager: boolean
  },
): JSX.Element {
  if (menu === 'home') {
    return (
      <>
        <section className="kpi-grid">
          <KpiCard title="전체 행 수" value={state.total.toLocaleString()} />
          <KpiCard title="리스 평균" value={`${state.averageLease.toFixed(2)}%`} />
          <KpiCard title="렌트 평균" value={`${state.averageRent.toFixed(2)}%`} />
          <KpiCard title="최대 하락폭" value={`${state.biggestDrop.toFixed(1)}%p`} negative />
        </section>
        <section className="panel">
          <h2>세부모델 최고 잔존가치 미리보기</h2>
          <BestTable rows={state.bestRows.slice(0, 8)} />
        </section>
        <section className="panel">
          <h2>월간 변동 미리보기</h2>
          <ChangesTable rows={state.changeRows.slice(0, 6)} />
        </section>
      </>
    )
  }

  if (menu === 'explorer') {
    return (
      <section className="panel">
        <div className="section-head">
          <h2>잔존가치 데이터 조회</h2>
          <span>{state.loading ? '불러오는 중...' : `총 ${state.total.toLocaleString()}건`}</span>
        </div>
        <ExplorerTable rows={state.rows} loading={state.loading} />
        <Pager page={state.page} totalPages={state.totalPages} setPage={state.setPage} />
      </section>
    )
  }

  if (menu === 'best') {
    return (
      <section className="panel">
        <div className="section-head">
          <h2>세부모델별 최고 잔존가치</h2>
          <span>{state.bestTotal.toLocaleString()}개 그룹</span>
        </div>
        <BestTable rows={state.bestRows} />
      </section>
    )
  }

  if (menu === 'changes') {
    return (
      <section className="panel">
        <h2>변동 리포트</h2>
        <p className="section-sub">
          월간 비교 기준 변동폭(%p)을 보여줍니다. 총 {state.changeTotal.toLocaleString()}건
        </p>
        <ChangesTable
          rows={state.changeRows}
          filters={state.changeFilters}
          setFilters={state.setChangeFilters}
          setPage={state.setChangePage}
          page={state.changePage}
          totalPages={state.changeTotalPages}
        />
      </section>
    )
  }

  if (menu === 'dealer-discounts') {
    return (
      <section className="panel">
        <h2>딜러 할인 입력</h2>
        <p className="section-sub">브랜드(제조사)별 차량 목록에서 모델/세부모델을 선택해 할인 금액을 입력합니다.</p>
        <DealerDiscountPanel
          dealerBrand={state.dealerBrand}
          setDealerBrand={state.setDealerBrand}
          dealerCode={state.dealerCode}
          setDealerCode={state.setDealerCode}
          isDealerUser={state.isDealerUser}
          dealerSearchText={state.dealerSearchText}
          setDealerSearchText={state.setDealerSearchText}
          applyDealerSearch={state.applyDealerSearch}
          dealerVehicles={state.dealerVehicles}
          dealerDiscountRows={state.dealerDiscountRows}
          dealerDraftAmounts={state.dealerDraftAmounts}
          setDealerDraftAmounts={state.setDealerDraftAmounts}
          dealerLoading={state.dealerLoading}
          dealerSubmitMessage={state.dealerSubmitMessage}
          dealerSubmitError={state.dealerSubmitError}
          onSubmit={state.submitDealerDiscount}
          onSubmitAll={state.submitDealerDiscountAll}
        />
      </section>
    )
  }

  if (menu === 'invite-codes') {
    return (
      <section className="panel">
        <h2>가입 코드 관리</h2>
        <p className="section-sub">딜러 가입용 1회성 코드를 생성하고 사용 여부를 확인합니다.</p>
        <InviteCodePanel
          inviteDealerBrand={state.inviteDealerBrand}
          setInviteDealerBrand={state.setInviteDealerBrand}
          inviteExpiresInDays={state.inviteExpiresInDays}
          setInviteExpiresInDays={state.setInviteExpiresInDays}
          inviteRows={state.inviteRows}
          inviteLoading={state.inviteLoading}
          inviteMessage={state.inviteMessage}
          inviteError={state.inviteError}
          inviteCreatedCode={state.inviteCreatedCode}
          createInviteCode={state.createInviteCode}
          loadInviteCodes={state.loadInviteCodes}
          isInviteManager={state.isInviteManager}
        />
      </section>
    )
  }

  return (
    <section className="panel">
      <h2>업로드 이력</h2>
      <p className="section-sub">최근 업로드 상태를 확인할 수 있습니다.</p>
      <UploadBox
        uploading={state.uploading}
        uploadMessage={state.uploadMessage}
        uploadError={state.uploadError}
        onUpload={state.uploadLeaseFile}
      />
      <UploadHistoryTable rows={state.uploadRows} />
    </section>
  )
}

function UploadBox({
  uploading,
  uploadMessage,
  uploadError,
  onUpload,
}: {
  uploading: boolean
  uploadMessage: string | null
  uploadError: string | null
  onUpload: (file: File, snapshotMonth: string) => Promise<void>
}) {
  const [file, setFile] = useState<File | null>(null)
  const [snapshotMonth, setSnapshotMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!file) return
    await onUpload(file, snapshotMonth)
  }

  return (
    <form className="upload-box" onSubmit={onSubmit}>
      <input
        type="file"
        accept=".xlsx"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <input
        type="text"
        placeholder="기준월 (YYYY-MM)"
        value={snapshotMonth}
        onChange={(e) => setSnapshotMonth(e.target.value)}
      />
      <button type="submit" disabled={uploading || !file}>
        {uploading ? '업로드 중...' : '엑셀 업로드'}
      </button>
      {uploadMessage && <p className="upload-msg ok">{uploadMessage}</p>}
      {uploadError && <p className="upload-msg err">{uploadError}</p>}
      <p className="upload-hint">
        예: <code>cartner_residual_values_lease_test.xlsx</code> (Lease 단일 시트도 가능)
      </p>
    </form>
  )
}

function ExplorerTable({ rows, loading }: { rows: ResidualValueRow[]; loading: boolean }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>제조사</th>
            <th>모델</th>
            <th>라인업</th>
            <th>세부모델</th>
            <th>기간</th>
            <th>거리</th>
            <th>금융사</th>
            <th>잔존가치%</th>
            <th>기준월</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.maker_name}</td>
              <td>{row.model_name}</td>
              <td>{row.lineup_name}</td>
              <td>{row.detail_model_name}</td>
              <td>{row.term_months}</td>
              <td>{row.annual_mileage_km.toLocaleString()}</td>
              <td>{row.finance_name}</td>
              <td>{formatPercent(row.residual_value_percent)}</td>
              <td>{row.snapshot_month}</td>
            </tr>
          ))}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={9} className="empty">조회 결과가 없습니다.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function BestTable({ rows }: { rows: ResidualValueRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>제조사</th>
            <th>모델</th>
            <th>세부모델</th>
            <th>기간</th>
            <th>거리</th>
            <th>최고 금융사</th>
            <th>최고 잔존가치%</th>
            <th>기준월</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={`${row.detail_model_name}-${idx}`}>
              <td>{row.maker_name}</td>
              <td>{row.model_name}</td>
              <td>{row.detail_model_name}</td>
              <td>{row.term_months}</td>
              <td>{row.annual_mileage_km.toLocaleString()}</td>
              <td>{row.finance_name}</td>
              <td>{formatPercent(row.residual_value_percent)}</td>
              <td>{row.snapshot_month}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ChangesTable({
  rows,
  filters,
  setFilters,
  setPage,
  page,
  totalPages,
}: {
  rows: ChangeRow[]
  filters?: ChangeFilterState
  setFilters?: (next: ChangeFilterState) => void
  setPage?: (next: number | ((prev: number) => number)) => void
  page?: number
  totalPages?: number
}) {
  const isFullMode = Boolean(filters && setFilters && setPage && page && totalPages)

  return (
    <>
      {isFullMode && filters && setFilters && setPage && page && totalPages && (
        <div className="sub-toolbar">
          <div className="segmented">
            <button
              type="button"
              className={filters.direction === 'all' ? 'seg active' : 'seg'}
              onClick={() => {
                setPage(1)
                setFilters({ ...filters, direction: 'all' })
              }}
            >
              전체
            </button>
            <button
              type="button"
              className={filters.direction === 'up' ? 'seg active' : 'seg'}
              onClick={() => {
                setPage(1)
                setFilters({ ...filters, direction: 'up' })
              }}
            >
              상승
            </button>
            <button
              type="button"
              className={filters.direction === 'down' ? 'seg active' : 'seg'}
              onClick={() => {
                setPage(1)
                setFilters({ ...filters, direction: 'down' })
              }}
            >
              하락
            </button>
          </div>
          <div className="sub-toolbar-right">
            <input
              type="number"
              min={0}
              step="0.1"
              placeholder="최소 변동폭(%p)"
              value={filters.minAbsDeltaPp}
              onChange={(e) => {
                setPage(1)
                setFilters({ ...filters, minAbsDeltaPp: e.target.value })
              }}
            />
            <select
              value={filters.sortBy}
              onChange={(e) => {
                setPage(1)
                setFilters({ ...filters, sortBy: e.target.value as ChangeFilterState['sortBy'] })
              }}
            >
              <option value="abs">변동폭 순(절대값)</option>
              <option value="delta_desc">증가 순</option>
              <option value="delta_asc">감소 순</option>
            </select>
            <select
              value={filters.pageSize}
              onChange={(e) => {
                setPage(1)
                setFilters({ ...filters, pageSize: Number(e.target.value) })
              }}
            >
              <option value={20}>20개</option>
              <option value={50}>50개</option>
              <option value={100}>100개</option>
            </select>
            <span className="meta-count">{rows.length}건 표시</span>
          </div>
        </div>
      )}
      <div className="table-wrap">
        <table>
        <thead>
          <tr>
            <th>구분</th>
            <th>제조사</th>
            <th>모델</th>
            <th>세부모델</th>
            <th>이전 값</th>
            <th>현재 값</th>
            <th>변동폭</th>
            <th>기준월</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={`${row.detail_model_name}-${idx}`}>
              <td>{row.source_type === 'lease' ? '리스' : '렌트'}</td>
              <td>{row.maker_name}</td>
              <td>{row.model_name}</td>
              <td>{row.detail_model_name}</td>
              <td>{formatPercent(row.previous_percent)}</td>
              <td>{formatPercent(row.current_percent)}</td>
              <td className={row.delta_pp < 0 ? 'delta-down' : 'delta-up'}>
                {row.delta_pp > 0 ? '+' : ''}{row.delta_pp.toFixed(1)}%p
              </td>
              <td>{row.snapshot_month}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="empty">조건에 맞는 변동 데이터가 없습니다.</td>
            </tr>
          )}
        </tbody>
        </table>
      </div>
      {isFullMode && page && totalPages && setPage && (
        <Pager page={page} totalPages={totalPages} setPage={setPage} />
      )}
    </>
  )
}

function UploadHistoryTable({ rows }: { rows: UploadHistoryRow[] }) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'failed' | 'processing'>('all')
  const [selectedUploadId, setSelectedUploadId] = useState<string | null>(rows[0]?.id ?? null)

  const filteredRows = useMemo(() => {
    if (statusFilter === 'all') return rows
    return rows.filter((r) => r.status === statusFilter)
  }, [rows, statusFilter])

  const selectedUpload =
    filteredRows.find((row) => row.id === selectedUploadId) ??
    filteredRows[0] ??
    null

  return (
    <>
      <div className="sub-toolbar">
        <div className="segmented">
          <button type="button" className={statusFilter === 'all' ? 'seg active' : 'seg'} onClick={() => setStatusFilter('all')}>
            전체
          </button>
          <button type="button" className={statusFilter === 'completed' ? 'seg active' : 'seg'} onClick={() => setStatusFilter('completed')}>
            완료
          </button>
          <button type="button" className={statusFilter === 'failed' ? 'seg active' : 'seg'} onClick={() => setStatusFilter('failed')}>
            실패
          </button>
          <button type="button" className={statusFilter === 'processing' ? 'seg active' : 'seg'} onClick={() => setStatusFilter('processing')}>
            처리중
          </button>
        </div>
        <span className="meta-count">{filteredRows.length}건</span>
      </div>
      <UploadTable rows={filteredRows} onSelect={setSelectedUploadId} />
      <div className="upload-detail">
        <h3>업로드 상세</h3>
        {selectedUpload ? (
          <dl>
            <div><dt>파일명</dt><dd>{selectedUpload.source_file_name}</dd></div>
            <div><dt>기준월</dt><dd>{selectedUpload.snapshot_month}</dd></div>
            <div><dt>상태</dt><dd>{toKoreanStatus(selectedUpload.status)}</dd></div>
            <div><dt>총 행수</dt><dd>{typeof selectedUpload.total_rows === 'number' ? selectedUpload.total_rows.toLocaleString() : '-'}</dd></div>
            <div><dt>오류 행수</dt><dd>{typeof selectedUpload.invalid_rows === 'number' ? selectedUpload.invalid_rows.toLocaleString() : '-'}</dd></div>
            <div><dt>업로드 시각</dt><dd>{formatDateTime(selectedUpload.created_at)}</dd></div>
          </dl>
        ) : (
          <p className="section-sub">표에서 항목을 선택하면 상세가 표시됩니다.</p>
        )}
      </div>
    </>
  )
}

function InviteCodePanel({
  inviteDealerBrand,
  setInviteDealerBrand,
  inviteExpiresInDays,
  setInviteExpiresInDays,
  inviteRows,
  inviteLoading,
  inviteMessage,
  inviteError,
  inviteCreatedCode,
  createInviteCode,
  loadInviteCodes,
  isInviteManager,
}: {
  inviteDealerBrand: DealerBrand
  setInviteDealerBrand: (value: DealerBrand) => void
  inviteExpiresInDays: string
  setInviteExpiresInDays: (value: string) => void
  inviteRows: DealerInviteCodeRow[]
  inviteLoading: boolean
  inviteMessage: string | null
  inviteError: string | null
  inviteCreatedCode: string | null
  createInviteCode: () => Promise<void>
  loadInviteCodes: () => Promise<void>
  isInviteManager: boolean
}) {
  if (!isInviteManager) {
    return <p className="section-sub">가입 코드 관리는 관리자 또는 매니저만 사용할 수 있습니다.</p>
  }

  return (
    <>
      <div className="invite-toolbar">
        <div className="invite-create-grid">
          <select value={inviteDealerBrand} onChange={(e) => setInviteDealerBrand(e.target.value as DealerBrand)}>
            {DEALER_BRANDS.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            max={365}
            placeholder="만료일(일)"
            value={inviteExpiresInDays}
            onChange={(e) => setInviteExpiresInDays(e.target.value)}
          />
          <button type="button" onClick={() => void createInviteCode()} disabled={inviteLoading}>
            {inviteLoading ? '생성중...' : '가입 코드 생성'}
          </button>
        </div>
        <button type="button" className="ghost-btn" onClick={() => void loadInviteCodes()} disabled={inviteLoading}>
          새로고침
        </button>
      </div>
      {inviteCreatedCode && (
        <div className="invite-created-card">
          <p>이번에 생성된 가입 코드</p>
          <strong>{inviteCreatedCode}</strong>
          <span>이 코드는 지금 화면에서만 확인할 수 있습니다.</span>
        </div>
      )}
      {inviteMessage && <p className="upload-msg ok">{inviteMessage}</p>}
      {inviteError && <p className="upload-msg err">{inviteError}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>역할</th>
              <th>브랜드</th>
              <th>딜러코드</th>
              <th>만료일</th>
              <th>사용상태</th>
              <th>사용시각</th>
              <th>생성시각</th>
            </tr>
          </thead>
          <tbody>
            {inviteRows.map((row) => (
              <tr key={row.id}>
                <td>{row.role}</td>
                <td>{row.dealer_brand ?? '-'}</td>
                <td>{row.dealer_code ?? '가입 시 입력'}</td>
                <td>{row.expires_at ? formatDateTime(row.expires_at) : '-'}</td>
                <td>{getInviteStatusLabel(row)}</td>
                <td>{row.used_at ? formatDateTime(row.used_at) : '-'}</td>
                <td>{formatDateTime(row.created_at)}</td>
              </tr>
            ))}
            {inviteRows.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">생성된 가입 코드가 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

function DealerDiscountPanel({
  dealerBrand,
  setDealerBrand,
  dealerCode,
  setDealerCode,
  isDealerUser,
  dealerSearchText,
  setDealerSearchText,
  applyDealerSearch,
  dealerVehicles,
  dealerDiscountRows,
  dealerDraftAmounts,
  setDealerDraftAmounts,
  dealerLoading,
  dealerSubmitMessage,
  dealerSubmitError,
  onSubmit,
  onSubmitAll,
}: {
  dealerBrand: string
  setDealerBrand: (value: string) => void
  dealerCode: string
  setDealerCode: (value: string) => void
  isDealerUser: boolean
  dealerSearchText: string
  setDealerSearchText: (value: string) => void
  applyDealerSearch: () => void
  dealerVehicles: DealerVehicleRow[]
  dealerDiscountRows: DealerDiscountRow[]
  dealerDraftAmounts: Record<string, string>
  setDealerDraftAmounts: (updater: (prev: Record<string, string>) => Record<string, string>) => void
  dealerLoading: boolean
  dealerSubmitMessage: string | null
  dealerSubmitError: string | null
  onSubmit: (vehicle: DealerVehicleRow, rawAmount: string) => Promise<void>
  onSubmitAll: () => Promise<void>
}) {
  const [selectedVehicleKey, setSelectedVehicleKey] = useState<string | null>(null)
  const [drawerVehicleKey, setDrawerVehicleKey] = useState<string | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const discountMap = useMemo(() => {
    const map = new Map<string, DealerDiscountRow>()
    for (const row of dealerDiscountRows) {
      map.set(`${row.maker_name}|${row.model_name}|${row.detail_model_name}`, row)
    }
    return map
  }, [dealerDiscountRows])
  useEffect(() => {
    if (!selectedVehicleKey) return
    setDrawerVehicleKey(selectedVehicleKey)
    setIsDrawerOpen(true)
  }, [selectedVehicleKey])

  useEffect(() => {
    if (!drawerVehicleKey) return
    if (dealerVehicles.some((vehicle) => toVehicleKey(vehicle) === drawerVehicleKey)) return
    setDrawerVehicleKey(null)
    setSelectedVehicleKey(null)
    setIsDrawerOpen(false)
  }, [dealerVehicles, drawerVehicleKey])

  const selectedVehicle =
    dealerVehicles.find((vehicle) => toVehicleKey(vehicle) === drawerVehicleKey) ?? null
  const selectedVehicleKeyValue = selectedVehicle ? toVehicleKey(selectedVehicle) : null
  const selectedDiscount = selectedVehicleKeyValue ? discountMap.get(selectedVehicleKeyValue) : undefined
  const selectedInputValue =
    selectedVehicleKeyValue
      ? dealerDraftAmounts[selectedVehicleKeyValue] ??
        (selectedDiscount?.discount_amount ? String(selectedDiscount.discount_amount) : '')
      : ''
  const handleCloseDrawer = () => {
    setIsDrawerOpen(false)
    window.setTimeout(() => {
      setSelectedVehicleKey(null)
      setDrawerVehicleKey(null)
    }, 220)
  }
  const handleSaveSelectedVehicle = async () => {
    if (!selectedVehicle) return
    await onSubmit(selectedVehicle, selectedInputValue)
    handleCloseDrawer()
  }

  return (
    <>
      <div className="filters dealer-filters">
        <input
          placeholder="딜러 제조사 (예: BMW)"
          value={dealerBrand}
          onChange={(e) => setDealerBrand(e.target.value)}
          disabled={isDealerUser}
        />
        <input
          placeholder="딜러 코드 (예: BMW-SEOUL-01)"
          value={dealerCode}
          onChange={(e) => setDealerCode(e.target.value)}
          disabled={isDealerUser}
        />
        <input
          placeholder="차량 검색 (모델/세부모델)"
          value={dealerSearchText}
          onChange={(e) => setDealerSearchText(e.target.value)}
        />
        <button type="button" onClick={applyDealerSearch} disabled={dealerLoading}>
          {dealerLoading ? '조회중...' : '검색'}
        </button>
        <button type="button" onClick={() => void onSubmitAll()} disabled={dealerLoading}>
          {dealerLoading ? '처리중...' : '일괄 저장'}
        </button>
      </div>
      {dealerSubmitMessage && <p className="upload-msg ok">{dealerSubmitMessage}</p>}
      {dealerSubmitError && <p className="upload-msg err">{dealerSubmitError}</p>}
      <div className="table-wrap dealer-table-pane">
        <table>
          <thead>
            <tr>
              <th>제조사</th>
              <th>모델</th>
              <th>세부모델</th>
              <th>기존 할인(원)</th>
              <th>수정시각</th>
              <th>편집</th>
            </tr>
          </thead>
          <tbody>
            {dealerVehicles.map((vehicle) => {
              const vehicleKey = toVehicleKey(vehicle)
              const existing = discountMap.get(vehicleKey)
              const isSelected = vehicleKey === drawerVehicleKey

              return (
                <tr
                  key={vehicleKey}
                  className={isSelected ? 'dealer-row-selected' : undefined}
                  onClick={() => setSelectedVehicleKey(vehicleKey)}
                >
                  <td>{vehicle.maker_name}</td>
                  <td>{vehicle.model_name}</td>
                  <td>{vehicle.detail_model_name}</td>
                  <td>{existing ? Number(existing.discount_amount).toLocaleString() : '-'}</td>
                  <td>{existing ? formatDateTime(existing.updated_at) : '-'}</td>
                  <td>
                    <button
                      type="button"
                      className={isSelected ? 'ghost-btn dealer-expand-btn active' : 'ghost-btn dealer-expand-btn'}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedVehicleKey(vehicleKey)
                      }}
                    >
                      열기
                    </button>
                  </td>
                </tr>
              )
            })}
            {dealerVehicles.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">조건에 맞는 차량 데이터가 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div
        className={isDrawerOpen ? 'dealer-drawer-backdrop active' : 'dealer-drawer-backdrop'}
        onClick={handleCloseDrawer}
      />
      <aside className={isDrawerOpen ? 'dealer-expand-pane active' : 'dealer-expand-pane'}>
        {selectedVehicle ? (
          <div className="dealer-expand-card">
            <div className="dealer-expand-topbar">
              <div className="dealer-expand-head">
                <p className="dealer-expand-kicker">할인 정보 편집</p>
                <h3>{selectedVehicle.detail_model_name}</h3>
                <span>{selectedVehicle.maker_name} / {selectedVehicle.model_name}</span>
              </div>
              <button
                type="button"
                className="ghost-btn dealer-close-icon-btn"
                onClick={handleCloseDrawer}
                aria-label="편집 패널 닫기"
              >
                ×
              </button>
            </div>
            <div className="dealer-expand-form">
              <label className="dealer-expand-field">
                <span>제조사</span>
                <input value={selectedVehicle.maker_name} readOnly />
              </label>
              <label className="dealer-expand-field">
                <span>모델</span>
                <input value={selectedVehicle.model_name} readOnly />
              </label>
              <label className="dealer-expand-field">
                <span>세부모델</span>
                <input value={selectedVehicle.detail_model_name} readOnly />
              </label>
              <label className="dealer-expand-field">
                <span>기존 할인(원)</span>
                <input
                  value={selectedDiscount ? Number(selectedDiscount.discount_amount).toLocaleString() : '-'}
                  readOnly
                />
              </label>
              <label className="dealer-expand-field dealer-expand-field-wide">
                <span>할인 금액(원)</span>
                <input
                  className="dealer-amount-input dealer-amount-input-wide"
                  placeholder="할인 금액을 입력하세요"
                  value={selectedInputValue}
                  onChange={(e) => {
                    if (!selectedVehicleKeyValue) return
                    setDealerDraftAmounts((prev) => ({
                      ...prev,
                      [selectedVehicleKeyValue]: e.target.value,
                    }))
                  }}
                />
              </label>
              <div className="dealer-expand-meta">
                <span>딜러 코드: {dealerCode || '-'}</span>
                <span>수정시각: {selectedDiscount ? formatDateTime(selectedDiscount.updated_at) : '-'}</span>
              </div>
              <div className="dealer-expand-actions">
                <button
                  type="button"
                  className="tab dealer-action-btn dealer-close-action-btn"
                  onClick={handleCloseDrawer}
                  disabled={dealerLoading}
                >
                  닫기
                </button>
                <button
                  type="button"
                  className="tab dealer-save-btn dealer-action-btn"
                  onClick={() => void handleSaveSelectedVehicle()}
                  disabled={dealerLoading}
                >
                  {dealerLoading ? '처리중...' : '저장'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </aside>
      {!selectedVehicle && (
        <div className="dealer-expand-empty">
          <strong>차량을 선택하세요</strong>
          <p>목록에서 차량을 선택하면 오른쪽에서 편집 패널이 슬라이드 인됩니다.</p>
        </div>
      )}
    </>
  )
}

function statusToClass(status: UploadHistoryRow['status']) {
  if (status === 'completed') return 'completed'
  if (status === 'failed') return 'failed'
  return 'processing'
}

function StatusBadge({ status }: { status: UploadHistoryRow['status'] }) {
  return (
    <span className={`status-badge ${statusToClass(status)}`}>
      {toKoreanStatus(status)}
    </span>
  )
}

function UploadRow({
  row,
  onSelect,
}: {
  row: UploadHistoryRow
  onSelect: (id: string) => void
}) {
  return (
    <tr>
      <td>{row.source_file_name}</td>
      <td>{row.snapshot_month}</td>
      <td>{typeof row.total_rows === 'number' ? row.total_rows.toLocaleString() : '-'}</td>
      <td>{typeof row.invalid_rows === 'number' ? row.invalid_rows.toLocaleString() : '-'}</td>
      <td><StatusBadge status={row.status} /></td>
      <td>{formatDateTime(row.created_at)}</td>
      <td>
        <button type="button" className="ghost-btn" onClick={() => onSelect(row.id)}>
          보기
        </button>
      </td>
    </tr>
  )
}

function UploadRows({ rows, onSelect }: { rows: UploadHistoryRow[]; onSelect: (id: string) => void }) {
  return (
    <>
      {rows.map((row, idx) => (
        <UploadRow key={`${row.id}-${idx}`} row={row} onSelect={onSelect} />
      ))}
    </>
  )
}

function UploadTable({ rows, onSelect }: { rows: UploadHistoryRow[]; onSelect: (id: string) => void }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>파일명</th>
            <th>기준월</th>
            <th>총 행수</th>
            <th>오류 행수</th>
            <th>상태</th>
            <th>업로드 시각</th>
            <th>상세</th>
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? (
            <UploadRows rows={rows} onSelect={onSelect} />
          ) : (
            <tr>
              <td colSpan={7} className="empty">조건에 맞는 업로드 이력이 없습니다.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function KpiCard({ title, value, negative }: { title: string; value: string; negative?: boolean }) {
  return (
    <div className="kpi-card">
      <p>{title}</p>
      <strong className={negative ? 'neg' : ''}>{value}</strong>
    </div>
  )
}

function Pager({ page, totalPages, setPage }: { page: number; totalPages: number; setPage: (next: number | ((prev: number) => number)) => void }) {
  return (
    <div className="pager">
      <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>이전</button>
      <span>페이지 {page} / {totalPages}</span>
      <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>다음</button>
    </div>
  )
}

function getPageTitle(menu: MenuKey) {
  switch (menu) {
    case 'home':
      return '대시보드 개요'
    case 'explorer':
      return '잔존가치 데이터 탐색기'
    case 'best':
      return '세부모델 최고 잔존가치'
    case 'changes':
      return '월간 변동 리포트'
    case 'dealer-discounts':
      return '딜러 할인 입력'
    case 'invite-codes':
      return '가입 코드 관리'
    default:
      return '업로드 이력'
  }
}

function buildParams(filters: FilterState, page: number) {
  const params = new URLSearchParams()
  params.set('sourceType', filters.sourceType)
  params.set('page', String(page))
  params.set('pageSize', String(filters.pageSize))
  params.set('sortBy', filters.sortBy)
  params.set('sortOrder', filters.sortOrder)

  if (filters.q.trim()) params.set('q', filters.q.trim())
  if (filters.maker.trim()) params.set('maker', filters.maker.trim())
  if (filters.model.trim()) params.set('model', filters.model.trim())
  if (filters.finance.trim()) params.set('finance', filters.finance.trim())
  if (filters.snapshotMonth.trim()) params.set('snapshotMonth', filters.snapshotMonth.trim())
  if (filters.termMonths.trim()) params.set('termMonths', filters.termMonths.trim())
  if (filters.annualMileageKm.trim()) params.set('annualMileageKm', filters.annualMileageKm.trim())

  return params
}

function buildChangesParams(
  sourceType: SourceType,
  snapshotMonth: string,
  filters: ChangeFilterState,
  page: number,
) {
  const params = new URLSearchParams()
  params.set('sourceType', sourceType)
  params.set('page', String(page))
  params.set('pageSize', String(filters.pageSize))
  params.set('direction', filters.direction)
  params.set('sortBy', filters.sortBy)
  if (filters.minAbsDeltaPp.trim()) params.set('minAbsDeltaPp', filters.minAbsDeltaPp.trim())
  if (snapshotMonth.trim()) params.set('snapshotMonth', snapshotMonth.trim())
  return params
}

function getAverage(rows: ResidualValueRow[], type: SourceType) {
  const target = rows.filter((r) => r.source_type === type)
  if (target.length === 0) return 0
  return target.reduce((acc, row) => acc + Number(row.residual_value_percent), 0) / target.length
}

function getBiggestDrop(rows: ChangeRow[]) {
  if (rows.length === 0) return 0
  return Math.min(...rows.map((r) => r.delta_pp))
}

function formatPercent(value: number) {
  return `${Number(value).toFixed(2)}%`
}

function toKoreanStatus(status: UploadHistoryRow['status']) {
  if (status === 'completed') return '완료'
  if (status === 'failed') return '실패'
  return '처리중'
}

function getInviteStatusLabel(row: DealerInviteCodeRow) {
  if (row.used_at) return '사용 완료'
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return '만료'
  return '미사용'
}

function formatDateTime(input: string) {
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return input
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(
    d.getHours(),
  ).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function toVehicleKey(vehicle: DealerVehicleRow) {
  return `${vehicle.maker_name}|${vehicle.model_name}|${vehicle.detail_model_name}`
}

function formatCurrentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function toAuthEmail(loginId: string) {
  const normalized = loginId.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')
  return `${normalized}@mrcha.local`
}

export default App
