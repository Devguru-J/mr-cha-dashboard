# Data Spec (Ingestion / Query / Diff)

## 1) Canonical Record
모든 업로드 데이터는 아래 단일 레코드 형태로 정규화한다.

- `source_type`: `lease` | `rent`
- `maker_name`: string
- `model_name`: string
- `lineup_name`: string
- `detail_model_name`: string
- `term_months`: integer
- `annual_mileage_km`: integer
- `finance_name`: string
- `residual_value_percent`: numeric(5,2)
- `residual_value_amount`: numeric(14,0), nullable (현재 파일에는 없음)
- `snapshot_month`: date (`YYYY-MM-01`)
- `upload_id`: uuid

## 2) Excel Mapping (Current File)
- `A 제조사` -> `maker_name`
- `B 모델` -> `model_name`
- `C 라인업` -> `lineup_name`
- `D 세부모델` -> `detail_model_name`
- `E 기간(개월)` -> `term_months`
- `F 약정 거리` -> `annual_mileage_km`
- `G 금융사` -> `finance_name`
- `H 잔존가치%` -> `residual_value_percent`

`source_type`는 시트명에서 결정:
- `Lease Raw` -> `lease`
- `Rent Raw` -> `rent`

## 3) Normalization Rules
- 공백 trim + 연속 공백 1칸으로 축약
- 숫자 파싱 실패 시 해당 행 reject
- `약정 거리` 값 `2만km` 같은 표현은 정수 km로 변환
  - 예: `2만km` -> `20000`
- `잔존가치%`는 `%` 제거 후 numeric으로 저장
- 업로드 시점 월(`snapshot_month`)은 기본적으로 업로드 월 사용
  - 필요 시 업로드 UI에서 명시 입력 가능하도록 설계

## 4) Duplicate Key Policy
동일 업로드 내 유니크 키:
- (`source_type`, `maker_name`, `model_name`, `lineup_name`, `detail_model_name`, `term_months`, `annual_mileage_km`, `finance_name`, `snapshot_month`)

중복 발생 시 정책:
- 기본: 마지막 행 우선(last write wins) + 경고 카운트 기록

## 5) Diff Policy (Change Tracking)
비교 기준:
- 같은 `source_type` + 같은 엔티티 키(제조사/모델/라인업/세부모델/기간/거리/금융사)
- `현재 snapshot_month` vs `직전 snapshot_month`

계산:
- `change_pp = current_percent - previous_percent`
- 상태:
  - `up` (`change_pp > 0`)
  - `down` (`change_pp < 0`)
  - `same` (`change_pp = 0`)
  - `new` (이전 없음)
  - `removed` (이번 업로드에 없음, 선택 기록)

## 6) Supabase Tables (Draft)
1. `uploads`
- `id uuid pk`
- `source_file_name text`
- `snapshot_month date`
- `uploaded_by uuid`
- `created_at timestamptz`
- `status text` (`processing`/`completed`/`failed`)

2. `residual_values`
- `id bigserial pk`
- `upload_id uuid fk -> uploads.id`
- Canonical record fields
- indexes:
  - `(source_type, snapshot_month)`
  - `(detail_model_name, source_type, snapshot_month)`
  - `(maker_name, model_name, source_type, snapshot_month)`

3. `residual_value_changes`
- `id bigserial pk`
- `source_type text`
- 엔티티 키 필드
- `snapshot_month date`
- `previous_snapshot_month date`
- `previous_percent numeric(5,2)`
- `current_percent numeric(5,2)`
- `change_pp numeric(6,2)`
- `change_status text`

## 7) Views (Draft)
- `v_latest_residual_values`: source_type별 최신 snapshot 기준 전체
- `v_best_residual_by_detail_model`: 세부모델 기준 최고 잔존가치
- `v_residual_value_change_latest`: 최신 변동 리포트

## 8) Auth / Role / RLS (Draft)
역할은 ENUM으로 고정:

- `super` = admin
- `manager` = 실무자
- `dealer` = 딜러사

권한 초안:

- `super`: 전체 데이터 read/write, 업로드/정정/권한관리 가능
- `manager`: 전체 데이터 read, 업로드 가능, 권한관리 불가
- `dealer`: 기본 조회(read) + `딜러 할인 데이터 페이지` 한정 write 가능

권장 테이블:

- `user_roles (user_id uuid pk, role app_role not null, dealer_scope text[] null)`
- `dealer_discounts` (딜러 입력 할인 데이터 저장용, dealer scope 기반 RLS 적용)

## 9) Future CSV Standard
운영 전환 후에는 아래 CSV 헤더를 표준으로 사용:

`source_type,maker_name,model_name,lineup_name,detail_model_name,term_months,annual_mileage_km,finance_name,residual_value_percent,residual_value_amount,snapshot_month`

- 인코딩: UTF-8
- 날짜: `YYYY-MM`
- 숫자 필드에는 단위 문자(`%`, `km`, `만`) 금지

## 10) Query/API Spec (Current)
1. `GET /api/residual-values`
- filters: `sourceType`, `snapshotMonth`, `maker`, `model`, `finance`, `termMonths`, `annualMileageKm`, `q`
- paging: `page`, `pageSize`
- sorting: `sortBy`, `sortOrder`

2. `GET /api/changes`
- filters: `sourceType`, `snapshotMonth`, `previousSnapshotMonth`
- server filter: `direction=all|up|down`, `minAbsDeltaPp`
- paging: `page`, `pageSize`
- sorting: `sortBy=abs|delta_desc|delta_asc`

3. `GET /api/suggestions`
- purpose: 필터 입력 자동완성
- fields: `field=maker_name|model_name|finance_name`
- filters: `sourceType`, `snapshotMonth`, `q`, `limit`

## 11) Planned API Spec (Next)
1. Auth
- `GET /api/me`
- response: `user_id`, `email`, `role`, `dealer_scope`

2. Dealer Discounts
- `GET /api/dealer-discounts`
- `POST /api/dealer-discounts`
- `PATCH /api/dealer-discounts/:id`
- `DELETE /api/dealer-discounts/:id` (soft-delete 여부는 추후 결정)

3. Upload / Change Ops
- `POST /api/uploads/:id/compute-changes`
- 목적: 업로드 완료 후 변경분 materialize(선계산)

## 12) Deployment Config Plan (GitHub -> Cloudflare Pages)
- Root directory: repository root
- Build command: `bun run build`
- Build output directory: `dist`
- Functions directory: `functions`
- Branch strategy:
  - Production: `main`
  - Preview: `feature/*`, `chore/*`, `fix/*`
