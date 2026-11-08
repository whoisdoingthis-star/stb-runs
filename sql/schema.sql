-- Send The Boy: Runs
-- Run once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to re-run: it only creates what is missing.

-- ---------------------------------------------------------------
-- Who is allowed in. Sign-ups are switched off in Supabase Auth;
-- this list is a second lock: a signed-in user who is not listed
-- here still sees nothing.
-- ---------------------------------------------------------------
create table if not exists public.members (
  email        text primary key,
  display_name text not null
);

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.members
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------------------------------------------------------------
-- A run = one route on one delivery date, loaded from a run sheet PDF.
-- The id is a short random code used in the shareable link.
-- ---------------------------------------------------------------
create table if not exists public.runs (
  id               text primary key default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  route            text not null,
  delivery_date    date not null,
  weekday_name     text,
  data_processed   text,
  report_requested text,
  source_filename  text,
  summary          jsonb not null default '{}',
  checks           jsonb not null default '[]',
  warnings         jsonb not null default '[]',
  key_report       jsonb,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (route, delivery_date)
);

-- Where a run came from: 'upload' (loaded in the app) or 'auto' (the evening fetch).
alter table public.runs add column if not exists source text not null default 'upload';

-- One delivery line on a run, in sheet order.
-- One tile per address: line_key is the address key (HOWICK|UXBRIDGE ROAD|1/71), so taps never attach to the wrong tile
-- even if a corrected sheet is loaded again.
create table if not exists public.run_lines (
  run_id      text not null references public.runs(id) on delete cascade,
  line_key    text not null,
  seq         int  not null,
  block       int  not null,
  street      text not null,
  number      text not null,
  side        text,              -- 'left' (odd column) or 'indent' (even column) on the sheet
  pub         text not null,     -- all publications joined, e.g. NZH+WW
  qty         int  not null,
  note        text,
  flags       jsonb not null default '[]',
  address_key text not null,     -- HOWICK|UXBRIDGE ROAD|1/71 : same letterbox every day
  sources     jsonb not null default '[]', -- the sheet line(s) this tile came from
  parts       jsonb not null default '[]', -- publications at this address: [{pub, qty, lines}]
  primary key (run_id, line_key)
);
alter table public.run_lines add column if not exists sources jsonb not null default '[]';
alter table public.run_lines add column if not exists parts   jsonb not null default '[]';
create index if not exists run_lines_address_idx on public.run_lines (address_key);

-- ---------------------------------------------------------------
-- Every tap and untap, never edited or deleted.
-- This is the history used later to learn the real delivery order.
-- id is made on the phone so an entry sent twice (patchy signal) is stored once.
-- Runs that have taps cannot be deleted, so the history is kept.
-- ---------------------------------------------------------------
create table if not exists public.tap_events (
  id          uuid primary key,
  run_id      text not null references public.runs(id),
  line_key    text not null,
  address_key text not null,
  route       text not null,
  done        boolean not null,
  user_id     uuid not null default auth.uid(),
  user_name   text,
  device_time timestamptz not null,           -- phone clock at the moment of the tap
  server_time timestamptz not null default now(),
  lat         double precision,
  lng         double precision,
  accuracy_m  real,                           -- GPS accuracy radius in metres
  fix_age_ms  int,                            -- how old the GPS fix was at the tap
  device      text
);
create index if not exists tap_events_run_idx on public.tap_events (run_id, device_time);
create index if not exists tap_events_address_idx on public.tap_events (address_key);

-- Current state of each line: its latest tap.
create or replace view public.line_status with (security_invoker = true) as
select distinct on (run_id, line_key)
  run_id, line_key, done, user_name, device_time, lat, lng, accuracy_m
from public.tap_events
order by run_id, line_key, device_time desc, server_time desc;

-- Where each letterbox actually is, from good GPS fixes on completed taps.
-- Groundwork for learned sequencing.
create or replace view public.address_positions with (security_invoker = true) as
select
  address_key,
  count(*)                          as taps,
  avg(lat)                          as lat,
  avg(lng)                          as lng,
  percentile_cont(0.5) within group (order by accuracy_m) as median_accuracy_m,
  max(device_time)                  as last_tap
from public.tap_events
where done and lat is not null and accuracy_m <= 40
group by address_key;

-- ---------------------------------------------------------------
-- Your own delivery order for a route, set by holding and dragging tiles.
-- One row per route; it carries forward to every future sheet for that route.
-- Every change is also logged, for learning the real sequence later.
-- ---------------------------------------------------------------
create table if not exists public.route_sequences (
  route        text primary key,
  address_keys jsonb not null,          -- ordered list of address keys
  updated_by   text,
  updated_at   timestamptz not null default now()
);

create table if not exists public.route_sequence_history (
  id           bigserial primary key,
  route        text not null,
  address_keys jsonb,                   -- null = reset to sheet order
  updated_by   text,
  changed_at   timestamptz not null default now()
);

create or replace function public.log_route_sequence() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    insert into public.route_sequence_history (route, address_keys, updated_by) values (old.route, null, old.updated_by);
    return old;
  end if;
  insert into public.route_sequence_history (route, address_keys, updated_by) values (new.route, new.address_keys, new.updated_by);
  return new;
end $$;

drop trigger if exists route_sequences_log on public.route_sequences;
create trigger route_sequences_log after insert or update or delete on public.route_sequences
  for each row execute function public.log_route_sequence();

-- ---------------------------------------------------------------
-- Door / access codes for route sections (e.g. Run 8 village buildings).
-- Kept here, behind the login, never in the app's files (which are public).
-- Every change is logged so an old code can be traced, never silently restored.
-- ---------------------------------------------------------------
create table if not exists public.access_codes (
  route      text not null,
  section_id text not null,           -- e.g. AMON, HULME, MONACO, AUSTIN
  code       text not null default '',
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (route, section_id)
);

create table if not exists public.access_code_history (
  id         bigserial primary key,
  route      text not null,
  section_id text not null,
  code       text,
  updated_by text,
  changed_at timestamptz not null default now()
);

create or replace function public.log_access_code() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.code is not distinct from old.code then return new; end if;
  insert into public.access_code_history (route, section_id, code, updated_by) values (new.route, new.section_id, new.code, new.updated_by);
  return new;
end $$;

drop trigger if exists access_codes_log on public.access_codes;
create trigger access_codes_log after insert or update on public.access_codes
  for each row execute function public.log_access_code();

-- ---------------------------------------------------------------
-- Security: only listed family members can read or write anything.
-- Tap history can be added to, never changed.
-- ---------------------------------------------------------------
alter table public.members    enable row level security;
alter table public.runs       enable row level security;
alter table public.run_lines  enable row level security;
alter table public.tap_events enable row level security;
alter table public.route_sequences enable row level security;
alter table public.route_sequence_history enable row level security;
alter table public.access_codes enable row level security;
alter table public.access_code_history enable row level security;

drop policy if exists access_codes_rw on public.access_codes;
create policy access_codes_rw on public.access_codes for all to authenticated using (public.is_member()) with check (public.is_member());

drop policy if exists access_code_history_read on public.access_code_history;
create policy access_code_history_read on public.access_code_history for select to authenticated using (public.is_member());

drop policy if exists route_sequences_rw on public.route_sequences;
create policy route_sequences_rw on public.route_sequences for all to authenticated using (public.is_member()) with check (public.is_member());

drop policy if exists route_sequence_history_read on public.route_sequence_history;
create policy route_sequence_history_read on public.route_sequence_history for select to authenticated using (public.is_member());

drop policy if exists members_read on public.members;
create policy members_read on public.members for select to authenticated using (public.is_member());

drop policy if exists runs_rw on public.runs;
create policy runs_rw on public.runs for all to authenticated using (public.is_member()) with check (public.is_member());

drop policy if exists run_lines_rw on public.run_lines;
create policy run_lines_rw on public.run_lines for all to authenticated using (public.is_member()) with check (public.is_member());

drop policy if exists tap_events_read on public.tap_events;
create policy tap_events_read on public.tap_events for select to authenticated using (public.is_member());

drop policy if exists tap_events_add on public.tap_events;
create policy tap_events_add on public.tap_events for insert to authenticated
  with check (public.is_member() and user_id = auth.uid());

-- Live updates: phones see each other's taps and order changes as they happen.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tap_events'
  ) then
    alter publication supabase_realtime add table public.tap_events;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'route_sequences'
  ) then
    alter publication supabase_realtime add table public.route_sequences;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'runs'
  ) then
    alter publication supabase_realtime add table public.runs;
  end if;
end $$;

-- A private bucket for the PDFs the evening fetch downloads (kept for the record).
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('run-sheets', 'run-sheets', false) on conflict (id) do nothing;
  end if;
end $$;

-- ---------------------------------------------------------------
-- Add the family. Use the same emails you create the logins with
-- (Authentication -> Users -> Add user).
-- ---------------------------------------------------------------
-- insert into public.members (email, display_name) values
--   ('mike@example.com', 'Mike'),
--   ('lisa@example.com', 'Lisa'),
--   ('mum@example.com',  'Mum')
-- on conflict (email) do update set display_name = excluded.display_name;
