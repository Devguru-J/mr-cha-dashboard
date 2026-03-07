# Implementation Backlog

## Sprint 1 - Project Bootstrap
- [ ] Bun + React + Hono + Cloudflare Pages Functions 초기 프로젝트 생성
- [ ] Supabase 프로젝트 연결 (`env`/키 관리)
- [ ] 공통 타입 정의 (`source_type`, canonical record)
- [ ] 기본 라우트 헬스체크 (`/api/health`)

## Sprint 2 - Upload Pipeline (xlsx first)
- [ ] 파일 업로드 API (`POST /api/uploads`)
- [ ] xlsx 파서 구현 (`Lease Raw`, `Rent Raw`)
- [ ] 컬럼 매핑/정규화/검증 로직 구현
- [ ] `uploads`, `residual_values` 적재 트랜잭션
- [ ] 실패 행 리포트(JSON) 저장

## Sprint 3 - Dashboard Query
- [ ] 조회 API (`GET /api/residual-values`)
- [ ] 필터: source_type, 제조사, 모델, 기간, 거리, 금융사, snapshot_month
- [ ] 검색: 세부모델 텍스트 검색
- [ ] 정렬/페이지네이션
- [ ] React 테이블 UI + 탭(Lease/Rent)

## Sprint 4 - Best Value / Change Report
- [ ] 최고 잔존가치 API (`GET /api/best-values`)
- [ ] 변동 계산 배치 (`POST /api/uploads/:id/compute-changes`)
- [ ] 변동 리포트 API (`GET /api/changes`)
- [ ] 변동 UI: 상승/하락 필터, 변동폭 정렬

## Sprint 5 - Auth / RLS / Ops
- [ ] Supabase Auth 관리자 로그인
- [ ] Role ENUM 생성: `super`, `manager`, `dealer`
- [ ] `user_roles` 테이블 및 사용자-역할 매핑
- [ ] RLS 정책 적용
- [ ] `super(admin)`: 전체 read/write + 권한관리
- [ ] `manager(실무자)`: 전체 read + 업로드
- [ ] `dealer(딜러사)`: 기본 read + `dealer_discounts` 페이지 한정 write + scope 제한
- [ ] `dealer_discounts` 테이블/폼/API/RLS 구현
- [ ] 업로드 이력 화면
- [ ] 에러 로깅/모니터링 기초 연결

## Sprint 6 - CSV Migration
- [ ] CSV 업로드 엔드포인트 추가
- [ ] xlsx/csv 동시 지원 기간 운영
- [ ] 운영 가이드에서 CSV-only 전환

## API Draft
1. `POST /api/uploads`
- multipart file 업로드
- response: `upload_id`, row counts, invalid counts

2. `GET /api/uploads`
- 업로드 이력 조회

3. `GET /api/residual-values`
- 리스트 조회 + 필터/검색/정렬/페이징

4. `GET /api/best-values`
- 세부모델별 최고 잔존가치

5. `GET /api/changes`
- 기준월 대비 변동 목록

## UI Draft
1. `Dashboard > Raw Data`
- Lease/Rent 탭
- 필터 패널 + 결과 테이블

2. `Dashboard > Best Residual`
- 세부모델 최고값 카드/테이블

3. `Dashboard > Changes`
- 월 선택
- 변동 상위 리스트 (`53 -> 50`, `-3.0%p`)

4. `Dashboard > Upload History`
- 업로드 상태/행 수/실패 수

## Risks & Mitigations
- 리스크: 엑셀 원본 포맷 변경
- 대응: 헤더명 기반 매핑 + unknown 컬럼 경고

- 리스크: 기간/거리 포맷 불일치
- 대응: 파싱 실패 행 분리 저장 + 업로드 리포트 노출

- 리스크: 대량 데이터로 쿼리 지연
- 대응: snapshot/source_type 중심 인덱스 + 집계 뷰

## Definition of Done (MVP)
- 관리자 로그인 후 파일 업로드 가능
- Lease/Rent 모두 검색/조회 가능
- 세부모델 최고 잔존가치 확인 가능
- 직전 버전 대비 변동 리포트 확인 가능
