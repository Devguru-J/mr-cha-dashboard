alter table if exists user_roles
  add column if not exists login_id text;

create unique index if not exists uq_user_roles_login_id
  on user_roles (login_id)
  where login_id is not null;
