import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import './App.css'

type SourceType = 'lease' | 'rent'
type MenuKey = 'home' | 'explorer' | 'best' | 'changes' | 'uploads'

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

type UploadHistoryRow = {
  id: string
  source_file_name: string
  snapshot_month: string
  total_rows?: number
  invalid_rows?: number
  status: 'completed' | 'failed' | 'processing'
  created_at: string
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
}

const MENU: Array<{ key: MenuKey; label: string }> = [
  { key: 'home', label: '대시보드' },
  { key: 'explorer', label: '데이터 탐색기' },
  { key: 'best', label: '최고 잔존가치' },
  { key: 'changes', label: '변동 리포트' },
  { key: 'uploads', label: '업로드 이력' },
]

function App() {
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
  const [uploadRows, setUploadRows] = useState<UploadHistoryRow[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalPages = useMemo(() => {
    const raw = Math.ceil(total / appliedFilters.pageSize)
    return raw > 0 ? raw : 1
  }, [total, appliedFilters.pageSize])

  const averageLease = useMemo(() => getAverage(rows, 'lease'), [rows])
  const averageRent = useMemo(() => getAverage(rows, 'rent'), [rows])
  const biggestDrop = useMemo(() => getBiggestDrop(changeRows), [changeRows])

  useEffect(() => {
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
          fetch(`/api/changes?sourceType=${appliedFilters.sourceType}&limit=50`),
          fetch('/api/uploads?limit=20'),
        ])
        if (changesRes.ok) {
          const changesData = (await changesRes.json()) as { items?: ChangeRow[] }
          setChangeRows(changesData.items ?? [])
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
  }, [appliedFilters, page])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setPage(1)
    setAppliedFilters({ ...filters })
  }

  const onSourceChange = (sourceType: SourceType) => {
    const next = { ...filters, sourceType }
    setFilters(next)
    setPage(1)
    setAppliedFilters(next)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">MR CHA 운영자</div>
        <nav className="menu">
          {MENU.map((item) => (
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
      </aside>

      <main className="content">
        <header className="topbar">
          <h1>{getPageTitle(menu)}</h1>
          {isMockMode && <span className="badge">Mock 데이터 모드</span>}
        </header>

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
            <input placeholder="제조사" value={filters.maker} onChange={(e) => setFilters({ ...filters, maker: e.target.value })} />
            <input placeholder="모델" value={filters.model} onChange={(e) => setFilters({ ...filters, model: e.target.value })} />
            <input placeholder="금융사" value={filters.finance} onChange={(e) => setFilters({ ...filters, finance: e.target.value })} />
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
            <button type="submit">조회</button>
          </form>
        </section>

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
          uploadRows,
        })}
      </main>
    </div>
  )
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
    uploadRows: UploadHistoryRow[]
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
        <p className="section-sub">월간 비교 기준 변동폭(%p)을 보여줍니다.</p>
        <ChangesTable rows={state.changeRows} />
      </section>
    )
  }

  return (
    <section className="panel">
      <h2>업로드 이력</h2>
      <p className="section-sub">최근 업로드 상태를 확인할 수 있습니다.</p>
      <UploadHistoryTable rows={state.uploadRows} />
    </section>
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

function ChangesTable({ rows }: { rows: ChangeRow[] }) {
  const [direction, setDirection] = useState<'all' | 'up' | 'down'>('all')
  const [sortBy, setSortBy] = useState<'abs' | 'delta_desc' | 'delta_asc'>('abs')

  const filteredRows = useMemo(() => {
    let next = [...rows]
    if (direction === 'up') next = next.filter((r) => r.delta_pp > 0)
    if (direction === 'down') next = next.filter((r) => r.delta_pp < 0)

    if (sortBy === 'abs') {
      next.sort((a, b) => Math.abs(b.delta_pp) - Math.abs(a.delta_pp))
    } else if (sortBy === 'delta_desc') {
      next.sort((a, b) => b.delta_pp - a.delta_pp)
    } else {
      next.sort((a, b) => a.delta_pp - b.delta_pp)
    }
    return next
  }, [rows, direction, sortBy])

  return (
    <>
      <div className="sub-toolbar">
        <div className="segmented">
          <button type="button" className={direction === 'all' ? 'seg active' : 'seg'} onClick={() => setDirection('all')}>
            전체
          </button>
          <button type="button" className={direction === 'up' ? 'seg active' : 'seg'} onClick={() => setDirection('up')}>
            상승
          </button>
          <button type="button" className={direction === 'down' ? 'seg active' : 'seg'} onClick={() => setDirection('down')}>
            하락
          </button>
        </div>
        <div className="sub-toolbar-right">
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'abs' | 'delta_desc' | 'delta_asc')}>
            <option value="abs">변동폭 순(절대값)</option>
            <option value="delta_desc">증가 순</option>
            <option value="delta_asc">감소 순</option>
          </select>
          <span className="meta-count">{filteredRows.length}건</span>
        </div>
      </div>
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
          {filteredRows.map((row, idx) => (
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
          {filteredRows.length === 0 && (
            <tr>
              <td colSpan={8} className="empty">조건에 맞는 변동 데이터가 없습니다.</td>
            </tr>
          )}
        </tbody>
        </table>
      </div>
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
    default:
      return '업로드 이력'
  }
}

function buildParams(filters: FilterState, page: number) {
  const params = new URLSearchParams()
  params.set('sourceType', filters.sourceType)
  params.set('page', String(page))
  params.set('pageSize', String(filters.pageSize))
  params.set('sortBy', 'residual_value_percent')
  params.set('sortOrder', 'desc')

  if (filters.q.trim()) params.set('q', filters.q.trim())
  if (filters.maker.trim()) params.set('maker', filters.maker.trim())
  if (filters.model.trim()) params.set('model', filters.model.trim())
  if (filters.finance.trim()) params.set('finance', filters.finance.trim())
  if (filters.snapshotMonth.trim()) params.set('snapshotMonth', filters.snapshotMonth.trim())
  if (filters.termMonths.trim()) params.set('termMonths', filters.termMonths.trim())
  if (filters.annualMileageKm.trim()) params.set('annualMileageKm', filters.annualMileageKm.trim())

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

function formatDateTime(input: string) {
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return input
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(
    d.getHours(),
  ).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default App
