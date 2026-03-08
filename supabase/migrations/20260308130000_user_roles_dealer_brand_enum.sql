do $$
begin
  if not exists (select 1 from pg_type where typname = 'dealer_brand') then
    create type dealer_brand as enum (
      'BMW',
      'BENZ',
      'AUDI',
      'HYUNDAI',
      'KIA',
      'GENESIS',
      'ETC'
    );
  end if;
end $$;

alter table if exists user_roles
  add column if not exists dealer_brand dealer_brand;

alter table if exists user_roles
  add column if not exists dealer_code text;

alter table if exists user_roles
  drop constraint if exists user_roles_dealer_required_check;

alter table if exists user_roles
  add constraint user_roles_dealer_required_check
  check (
    (role = 'dealer' and dealer_brand is not null and coalesce(dealer_code, '') <> '')
    or
    (role <> 'dealer' and dealer_brand is null)
  );

create index if not exists idx_user_roles_role_brand
  on user_roles (role, dealer_brand);
