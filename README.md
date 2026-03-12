# MR CHA Dashboard

운영자용 자동차 잔존가치 대시보드 프로젝트입니다.

- Runtime: Bun
- Frontend: React + Vite
- API: Hono (Cloudflare Pages Functions)
- BaaS: Supabase (준비 전에는 mock fallback 동작)
- Deploy: Cloudflare Pages + Functions

## 주요 기능

- 엑셀 업로드 API (`Lease Raw`, `Rent Raw`) 파싱/정규화
- 잔존가치 데이터 조회/검색/필터/페이지네이션
- 세부모델별 최고 잔존가치 조회
- 월간 변동 리포트 조회
- 업로드 이력 조회
- 딜러용 1회성 가입 코드 발급/소진
- Supabase 미연결 환경에서 mock 데이터 모드 지원

## 프로젝트 구조

```txt
.
├── apps/web                # React 프론트엔드
├── functions/api           # Hono API (Cloudflare Pages Functions)
├── docs/planning           # 기획/스키마/백로그 문서
├── stitch                  # Stitch 디자인 산출물 (참고용)
└── wrangler.toml           # Cloudflare 설정
```

## 로컬 실행

1. 전체 실행 (권장)

```bash
bun run dev
```

2. 개별 실행

```bash
bun run dev:api
bun run dev:web
```

3. 접속

- `http://localhost:5173`

## 스크립트

- `bun run dev` : web/api 동시 실행
- `bun run dev:web` : 프론트 개발 서버
- `bun run dev:api` : API 개발 서버
- `bun run build:web` : 프론트 빌드
- `bun run check:api` : API 타입체크
- `bun run deploy` : 웹 빌드 후 Cloudflare Pages 배포
- `bun run db:generate` : Drizzle 마이그레이션 생성
- `bun run db:push` : Drizzle로 DB 반영 (DATABASE_URL 필요)

## 환경 변수

루트 `.env.example`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `DATABASE_URL` (Drizzle migration용)

API 개발용 루트 `.dev.vars`:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_SIGNUP_TOKEN`

## Drizzle Migration Workflow
1. `drizzle/schema.ts` 수정
2. `bun run db:generate`
3. 생성 SQL 검토
4. `bun run db:push`

Supabase를 아직 연결하지 않으면 API가 자동으로 mock 데이터 모드로 동작합니다.

## API 엔드포인트

- `GET /api/health`
- `GET /api/config-check`
- `GET /api/residual-values`
- `GET /api/best-values`
- `GET /api/changes`
- `GET /api/uploads`
- `POST /api/uploads`
- `GET /api/dealer-invite-codes`
- `POST /api/dealer-invite-codes`
- `POST /api/signup`

## Supabase 스키마

초기 테이블 SQL:

- `docs/planning/supabase-schema.sql`
- 성능 인덱스 SQL:
- `docs/planning/supabase-performance.sql`

적용 순서:
1. `supabase-schema.sql`
2. `supabase-performance.sql`

CLI 적용 (선택):
1. `supabase login` 또는 `SUPABASE_ACCESS_TOKEN` 설정
2. `supabase link --project-ref opvisqqcwcpgyvscecjg`
3. `supabase db push`

## 데이터 업로드 규칙

- 초기: `.xlsx` 업로드 지원
- 운영 권장: `CSV(UTF-8)` 전환

상세 매핑/검증 규칙:

- `docs/planning/data-spec.md`
