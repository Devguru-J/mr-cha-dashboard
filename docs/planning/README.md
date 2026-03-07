# MR CHA Dashboard Planning

## 1) Goal
- 운영자용 대시보드에서 `Lease`/`Rent` 잔존가치 데이터를 조회/검색한다.
- 세부모델 기준 최고 잔존가치(Top value)를 빠르게 확인한다.
- 업로드 버전 간 잔존가치 변동(상승/하락)을 추적한다.

## 2) Current Source (as-is)
- 입력 파일: `cartner_residual_values_report.xlsx`
- 확인된 시트:
  - `Lease Raw`
  - `Rent Raw`
  - `Trim Summary` (참고용)
  - `Finance Summary` (참고용)
- 현재 `Raw` 시트 기본 컬럼:
  - `A 제조사`
  - `B 모델`
  - `C 라인업`
  - `D 세부모델`
  - `E 기간(개월)`
  - `F 약정 거리`
  - `G 금융사`
  - `H 잔존가치%`

## 3) Target Stack
- Runtime: Bun
- Frontend: React
- API: Hono (Cloudflare Pages Functions)
- BaaS: Supabase (Postgres/Auth/Storage)
- Deploy: Cloudflare Pages + Functions

## 4) Phased Plan
1. Phase 0 - Specification Freeze
- 데이터 컬럼/타입/정규화 규칙 확정
- 업로드 시 중복 키 규칙 확정
- 변동 계산 기준(직전 업로드 대비) 확정

2. Phase 1 - MVP Ingestion + Query
- xlsx 업로드/파싱 (`Lease Raw`, `Rent Raw`)
- Supabase 적재
- 조회 API + 기본 검색/필터 UI

3. Phase 2 - Best Value + Change Tracking
- 세부모델별 최고 잔존가치 뷰
- 업로드 간 변화량 계산/저장
- 변동 리포트 UI(상승/하락/변동폭)

4. Phase 3 - Ops Hardening
- CSV 표준 업로드 전환
- 데이터 검증 리포트/실패 행 다운로드
- 관리자 권한/RLS/감사 로그 강화

## 5) Current Build Status (2026-03-07)
- 업로드: `.xlsx` 업로드/파싱/중복처리/DB 적재 동작
- 조회: `GET /api/residual-values` 필터/정렬/페이지네이션 동작
- 최고값: `GET /api/best-values` 동작
- 변동: `GET /api/changes` 월 자동 선택 + 서버 필터/정렬/페이지네이션 동작
- 자동완성: `GET /api/suggestions`(제조사/모델/금융사) 추가
- 성능: 인덱스 마이그레이션 적용 완료
- Drizzle: 기본 설정/스키마 파일 추가 완료(점진적 전환 시작)

## 6) Success Criteria
- Raw 업로드 후 1분 내 조회 가능
- 세부모델 최고 잔존가치 조회가 1초 내 응답
- 직전 버전 대비 변동 리포트 자동 생성
- Lease/Rent 모두 동일 UX로 조회 가능

## 7) Decision Log (initial)
- 초기 입력은 xlsx를 지원한다.
- 운영 표준 업로드 포맷은 CSV(UTF-8)로 전환한다.
- 변동 계산은 `직전 업로드 버전` 대비를 기본으로 한다.
- Supabase 미준비 기간에는 API가 mock dataset으로 fallback 동작한다.
- RLS Role은 ENUM 3단계로 고정한다: `super`(admin), `manager`(실무자), `dealer`(딜러사).
- `dealer`는 기본 read 권한 + 딜러 할인 데이터 페이지에 한해 write 권한을 가진다.

## 8) Next Action Order
1. Auth + RLS 정책 실제 적용 (`super/manager/dealer`)
2. `dealer_discounts` API/UI 구현 (dealer write 한정)
3. Drizzle 기반 DB 접근 점진 전환 (핵심 조회 API 우선)
4. CSV 업로드 경로 추가 + 운영 가이드 전환

## 9) Immediate Next Sprint (S5) Scope
1. 인증/권한
- Supabase Auth 로그인(운영자) 적용
- `user_roles` 기반 role 판별 미들웨어 추가
- 화면/API 접근 제어(`super`, `manager`, `dealer`)

2. RLS 정책
- `residual_values`, `uploads`: `super/manager` write, `dealer` read-only
- `dealer_discounts`: `dealer` scoped write 허용
- 정책 테스트 케이스(허용/거부) 문서화

3. 딜러 할인 기능
- `dealer_discounts` 목록/등록/수정 API
- 딜러 할인 페이지 UI(필터/등록 폼/이력)
- 변경 이력 컬럼(`created_at`, `updated_at`, 작성자`) 노출

4. 배포 파이프라인 정리
- GitHub 연동 Cloudflare Pages 기준 설정 확정
- Root: repo root, Build output: `dist`, Functions: `functions`
- Preview/Production 브랜치 전략 문서화
