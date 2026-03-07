-- Run after base schema is created.
-- 목적: 조회/검색/변동 비교 API의 인덱스 최적화

create extension if not exists pg_trgm;

-- 공통 필터 + 정렬 기준
create index if not exists idx_residual_values_source_snapshot_term_km
  on residual_values (source_type, snapshot_month, term_months, annual_mileage_km);

-- 변경 리포트 비교 키 최적화
create index if not exists idx_residual_values_changes_key
  on residual_values (
    source_type,
    snapshot_month,
    maker_name,
    model_name,
    lineup_name,
    detail_model_name,
    term_months,
    annual_mileage_km,
    finance_name
  );

-- 최고 잔가 조회(내림차순) 최적화
create index if not exists idx_residual_values_best_order
  on residual_values (
    source_type,
    snapshot_month,
    residual_value_percent desc,
    maker_name,
    model_name,
    lineup_name,
    detail_model_name,
    term_months,
    annual_mileage_km
  );

-- 부분 검색(ilike) 최적화
create index if not exists idx_residual_values_maker_trgm
  on residual_values using gin (maker_name gin_trgm_ops);

create index if not exists idx_residual_values_model_trgm
  on residual_values using gin (model_name gin_trgm_ops);

create index if not exists idx_residual_values_lineup_trgm
  on residual_values using gin (lineup_name gin_trgm_ops);

create index if not exists idx_residual_values_detail_trgm
  on residual_values using gin (detail_model_name gin_trgm_ops);

create index if not exists idx_residual_values_finance_trgm
  on residual_values using gin (finance_name gin_trgm_ops);

-- 업로드 이력 정렬 최적화
create index if not exists idx_uploads_created_at_desc
  on uploads (created_at desc);
