alter table if exists dealer_discounts
  add column if not exists source_type text;

alter table if exists dealer_discounts
  add column if not exists snapshot_month date;

update dealer_discounts
set source_type = coalesce(source_type, 'lease')
where source_type is null;

update dealer_discounts
set snapshot_month = coalesce(snapshot_month, current_date)
where snapshot_month is null;

alter table if exists dealer_discounts
  alter column source_type set not null;

alter table if exists dealer_discounts
  alter column snapshot_month set not null;

alter table if exists dealer_discounts
  drop constraint if exists dealer_discounts_source_type_check;

alter table if exists dealer_discounts
  add constraint dealer_discounts_source_type_check
  check (source_type in ('lease', 'rent'));

create unique index if not exists uq_dealer_discounts_target
  on dealer_discounts (
    dealer_code,
    source_type,
    snapshot_month,
    maker_name,
    model_name,
    detail_model_name
  );

create index if not exists idx_dealer_discounts_brand_snapshot
  on dealer_discounts (maker_name, source_type, snapshot_month, updated_at desc);
