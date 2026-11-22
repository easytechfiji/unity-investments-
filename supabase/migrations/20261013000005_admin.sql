-- Admin users are Supabase Auth users with a row here. No row, no admin access.

create table public.admin_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  role text not null default 'staff' check (role in ('owner', 'staff')),
  permissions text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Every admin action. Insert only: nobody, including the API, can change history.
create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  admin_id uuid not null,           -- not a foreign key, so entries survive if the admin is removed
  action text not null,
  entity text not null,
  entity_id text,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index admin_audit_log_created_at_idx on public.admin_audit_log (created_at desc);

create function public.prevent_audit_log_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'admin_audit_log is insert only';
end;
$$;

create trigger admin_audit_log_no_update before update or delete on public.admin_audit_log
  for each row execute function public.prevent_audit_log_change();
create trigger admin_audit_log_no_truncate before truncate on public.admin_audit_log
  for each statement execute function public.prevent_audit_log_change();
