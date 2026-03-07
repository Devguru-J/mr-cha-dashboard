create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type app_role as enum ('super', 'manager', 'dealer');
  end if;
end $$;

create table if not exists user_roles (
  user_id uuid primary key,
  role app_role not null,
  dealer_scope text[] null,
  created_at timestamptz not null default now()
);

create table if not exists dealer_discounts (
  id bigserial primary key,
  dealer_user_id uuid not null,
  dealer_code text not null,
  maker_name text not null,
  model_name text not null,
  detail_model_name text not null,
  discount_amount numeric(14,0) null,
  discount_percent numeric(5,2) null,
  start_date date null,
  end_date date null,
  note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists uploads (
  id uuid primary key default gen_random_uuid(),
  source_file_name text not null,
  snapshot_month date not null,
  status text not null default 'processing',
  created_at timestamptz not null default now()
);

create table if not exists residual_values (
  id bigserial primary key,
  upload_id uuid not null references uploads(id) on delete cascade,
  source_type text not null check (source_type in ('lease', 'rent')),
  maker_name text not null,
  model_name text not null,
  lineup_name text not null,
  detail_model_name text not null,
  term_months integer not null,
  annual_mileage_km integer not null,
  finance_name text not null,
  residual_value_percent numeric(5,2) not null,
  snapshot_month date not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_residual_values_source_snapshot
  on residual_values (source_type, snapshot_month);

create index if not exists idx_residual_values_detail_model
  on residual_values (detail_model_name, source_type, snapshot_month);

create index if not exists idx_residual_values_maker_model
  on residual_values (maker_name, model_name, source_type, snapshot_month);
