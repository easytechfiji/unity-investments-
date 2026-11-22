-- Extensions, shared types and helpers used by the later migrations.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- A slug is lowercase words joined by single hyphens, for example "office-chairs".
-- Same rule as SLUG_PATTERN in packages/shared.
create domain public.slug as text
  check (value ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(value) <= 200);

-- Money is always exact decimal, never float, and never negative.
create domain public.amount as numeric(12, 2)
  check (value >= 0);

-- Keeps updated_at current on every update.
create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
