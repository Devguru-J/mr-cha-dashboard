# MR CHA Dashboard

운영자용 자동차 잔존가치 대시보드 프로젝트입니다.

- Runtime: Bun (현재 로컬은 npm 기반으로 부트스트랩)
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

1. API 실행

```bash
npm run dev:api
```

2. Web 실행 (새 터미널)

```bash
npm run dev:web
```

3. 접속

- `http://localhost:5173`

## 스크립트

- `npm run dev:web` : 프론트 개발 서버
- `npm run dev:api` : Cloudflare Functions 로컬 서버
- `npm run build:web` : 프론트 빌드
- `npm run check:api` : API 타입체크
- `npm run deploy` : 웹 빌드 후 Cloudflare Pages 배포

## 환경 변수

루트 `.env.example`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

API 개발용 `functions/api/.dev.vars`:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Supabase를 아직 연결하지 않으면 API가 자동으로 mock 데이터 모드로 동작합니다.

## API 엔드포인트

- `GET /api/health`
- `GET /api/config-check`
- `GET /api/residual-values`
- `GET /api/best-values`
- `GET /api/changes`
- `GET /api/uploads`
- `POST /api/uploads`

## Supabase 스키마

초기 테이블 SQL:

- `docs/planning/supabase-schema.sql`

## 데이터 업로드 규칙

- 초기: `.xlsx` 업로드 지원
- 운영 권장: `CSV(UTF-8)` 전환

상세 매핑/검증 규칙:

- `docs/planning/data-spec.md`
