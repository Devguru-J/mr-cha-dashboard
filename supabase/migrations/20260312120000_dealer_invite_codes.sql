create table if not exists dealer_invite_codes (
  id uuid primary key default gen_random_uuid(),
  role app_role not null,
  dealer_brand dealer_brand,
  dealer_code text,
  code_hash text not null,
  expires_at timestamptz,
  used_at timestamptz,
  used_by_user_id uuid,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  constraint dealer_invite_codes_dealer_scope_check check (
    (role = 'dealer' and dealer_brand is not null)
    or (role <> 'dealer')
  )
);

create unique index if not exists uq_dealer_invite_codes_code_hash
  on dealer_invite_codes (code_hash);

create index if not exists idx_dealer_invite_codes_status
  on dealer_invite_codes (dealer_brand, dealer_code, used_at, expires_at);
