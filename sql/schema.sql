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
alter table public.runs add column if not exists last_changes jsonb; -- what changed the last time the sheet was replaced

-- Delivery photos (for disputed non-delivery complaints) and the addresses to photo every time.
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  run_id text references public.runs(id) on delete set null,
  route text not null, line_key text, address_key text not null, path text not null,
  taken_at timestamptz not null default now(), lat double precision, lng double precision, user_name text);
create table if not exists public.photo_watch (
  route text not null, address_key text not null, added_by text, added_at timestamptz not null default now(),
  primary key (route, address_key));
alter table public.photos enable row level security;
alter table public.photo_watch enable row level security;
drop policy if exists photos_read on public.photos;
create policy photos_read on public.photos for select to authenticated using (public.is_member());
drop policy if exists photos_add on public.photos;
create policy photos_add on public.photos for insert to authenticated with check (public.is_member());
drop policy if exists photo_watch_rw on public.photo_watch;
create policy photo_watch_rw on public.photo_watch for all to authenticated using (public.is_member()) with check (public.is_member());
-- Private bucket for delivery photos; only family members can add or view them.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('delivery-photos', 'delivery-photos', false) on conflict (id) do nothing;
    drop policy if exists delivery_photos_read on storage.objects;
    create policy delivery_photos_read on storage.objects for select to authenticated using (bucket_id = 'delivery-photos' and public.is_member());
    drop policy if exists delivery_photos_add on storage.objects;
    create policy delivery_photos_add on storage.objects for insert to authenticated with check (bucket_id = 'delivery-photos' and public.is_member());
  end if;
end $$;

-- ===============================================================
-- Dispatch: roles, the address register, locations and policies.
-- Model (docs/business-rules.md#locations): a location group (e.g. Bruce McLaren Village)
-- holds operating locations (where the vehicle stops), which hold service locations
-- (where the work is done on foot: a letterbox, Bank 1, reception). Every address on a
-- run sheet is registered automatically and can be tied to an operating and a service location.
-- Policies (entry point, access notes, time windows, speed limits) attach at any level.
-- Members can read all of it; only dispatchers can change it.
-- ===============================================================

-- Roles: 'driver' = app only, 'dispatcher' = app + dispatch dashboard. Inactive members are locked out.
alter table public.members add column if not exists role text not null default 'driver';
alter table public.members add column if not exists active boolean not null default true;
alter table public.members add column if not exists added_at timestamptz not null default now();
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'members_role_check') then
    alter table public.members add constraint members_role_check check (role in ('driver', 'dispatcher'));
  end if;
end $$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.members
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) and active
  );
$$;

create or replace function public.is_dispatcher() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.members
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) and active and role = 'dispatcher'
  );
$$;

drop policy if exists members_add on public.members;
create policy members_add on public.members for insert to authenticated with check (public.is_dispatcher());
drop policy if exists members_change on public.members;
create policy members_change on public.members for update to authenticated using (public.is_dispatcher()) with check (public.is_dispatcher());

-- Never lock everyone out: there must always be an active dispatcher.
create or replace function public.members_keep_a_dispatcher() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'dispatcher' and old.active
     and (tg_op = 'DELETE' or new.role <> 'dispatcher' or not new.active)
     and not exists (select 1 from public.members where role = 'dispatcher' and active and email <> old.email) then
    raise exception 'There must always be at least one active dispatcher.';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists members_keep_a_dispatcher on public.members;
create trigger members_keep_a_dispatcher before update or delete on public.members
  for each row execute function public.members_keep_a_dispatcher();

-- Location groups: a village, a building, a street or an area. Groups can sit inside groups.
create table if not exists public.location_groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  kind       text not null default 'area',          -- village, building, street, area
  parent_id  uuid references public.location_groups(id) on delete set null,
  route      text,                                  -- optional: the run it belongs to
  notes      text,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Operating locations: where the vehicle stops (a GPS point), in order along a route.
create table if not exists public.operating_locations (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid references public.location_groups(id) on delete set null,
  name       text not null,
  route      text,
  seq        int,
  lat        double precision,
  lng        double precision,
  notes      text,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Service locations: where the driver does the work from that stop (letterbox, bank, reception…).
create table if not exists public.service_locations (
  id                    uuid primary key default gen_random_uuid(),
  operating_location_id uuid not null references public.operating_locations(id) on delete cascade,
  name                  text not null,
  kind                  text not null default 'letterbox', -- letterbox, bank, reception, lobby, door, other
  seq                   int,
  lat                   double precision,
  lng                   double precision,
  notes                 text,
  validated_at          timestamptz,               -- someone checked it on the ground
  validated_by          text,
  updated_at            timestamptz not null default now(),
  updated_by            text
);

-- The address register: every address ever seen on a run sheet, filled automatically.
create table if not exists public.addresses (
  address_key           text primary key,          -- HOWICK|UXBRIDGE ROAD|1/71, as on run_lines
  area                  text,
  street                text not null,
  number                text not null,
  routes                text[] not null default '{}',
  first_seen            date,
  last_seen             date,
  last_run_id           text,
  operating_location_id uuid references public.operating_locations(id) on delete set null,
  service_location_id   uuid references public.service_locations(id) on delete set null,
  validated_at          timestamptz,               -- the assignment was checked on the ground
  validated_by          text,
  notes                 text,
  updated_at            timestamptz not null default now(),
  updated_by            text
);
create index if not exists addresses_operating_idx on public.addresses (operating_location_id);
create index if not exists addresses_service_idx on public.addresses (service_location_id);

-- Policies: rules attached to a group, an operating location, a service location or one address.
-- kind: entry_point (lat/lng + note), access_note (note), not_before (time_from),
--       time_window (time_from–time_to), speed_limit (speed_kmh), restriction (note).
-- days: which weekdays it applies to (Mon..Sun); empty = every day.
create table if not exists public.location_policies (
  id                    uuid primary key default gen_random_uuid(),
  group_id              uuid references public.location_groups(id) on delete cascade,
  operating_location_id uuid references public.operating_locations(id) on delete cascade,
  service_location_id   uuid references public.service_locations(id) on delete cascade,
  address_key           text references public.addresses(address_key) on delete cascade,
  kind                  text not null,
  note                  text,
  lat                   double precision,
  lng                   double precision,
  time_from             time,
  time_to               time,
  speed_kmh             int,
  days                  text[] not null default '{}',
  active                boolean not null default true,
  updated_at            timestamptz not null default now(),
  updated_by            text,
  constraint location_policies_kind_check check (kind in ('entry_point', 'access_note', 'not_before', 'time_window', 'speed_limit', 'restriction')),
  constraint location_policies_one_target check (num_nonnulls(group_id, operating_location_id, service_location_id, address_key) = 1)
);

-- Every change to people, locations, addresses and policies is logged.
create table if not exists public.dispatch_history (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  by_email  text default (auth.jwt() ->> 'email'),
  entity    text not null,
  entity_id text,
  action    text not null,
  data      jsonb
);
create or replace function public.log_dispatch_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare rec jsonb := to_jsonb(coalesce(new, old));
begin
  -- The register filling itself as sheets load is not logged (it would be hundreds of rows a day);
  -- only a person's changes to an address (assignment, validation, notes) are.
  if tg_table_name = 'addresses' and (tg_op = 'INSERT' or (tg_op = 'UPDATE'
     and jsonb_build_array(rec -> 'operating_location_id', rec -> 'service_location_id', rec -> 'validated_at', rec -> 'notes')
       = jsonb_build_array(to_jsonb(old) -> 'operating_location_id', to_jsonb(old) -> 'service_location_id', to_jsonb(old) -> 'validated_at', to_jsonb(old) -> 'notes'))) then
    return new;
  end if;
  insert into public.dispatch_history (entity, entity_id, action, data)
  values (tg_table_name, coalesce(rec ->> 'id', rec ->> 'address_key', rec ->> 'email'), lower(tg_op), rec);
  return coalesce(new, old);
end $$;
do $$ declare t text; begin
  foreach t in array array['members', 'location_groups', 'operating_locations', 'service_locations', 'addresses', 'location_policies'] loop
    execute format('drop trigger if exists %I_log on public.%I', t, t);
    execute format('create trigger %I_log after insert or update or delete on public.%I for each row execute function public.log_dispatch_change()', t, t);
  end loop;
end $$;

-- Fill the register as sheets are loaded (from the app or the evening fetch).
create or replace function public.register_address() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.addresses as a (address_key, area, street, number, routes, first_seen, last_seen, last_run_id)
  select new.address_key, split_part(new.address_key, '|', 1), new.street, new.number, array[r.route], r.delivery_date, r.delivery_date, r.id
  from public.runs r where r.id = new.run_id
  on conflict (address_key) do update set
    street      = excluded.street,
    number      = excluded.number,
    routes      = (select array(select distinct x from unnest(a.routes || excluded.routes) x order by 1)),
    first_seen  = least(a.first_seen, excluded.first_seen),
    last_seen   = greatest(a.last_seen, excluded.last_seen),
    last_run_id = case when excluded.last_seen >= coalesce(a.last_seen, excluded.last_seen) then excluded.last_run_id else a.last_run_id end;
  return new;
end $$;
drop trigger if exists run_lines_register on public.run_lines;
create trigger run_lines_register after insert on public.run_lines
  for each row execute function public.register_address();

-- Register everything already loaded (safe to repeat).
insert into public.addresses as a (address_key, area, street, number, routes, first_seen, last_seen, last_run_id)
select distinct on (l.address_key) l.address_key, split_part(l.address_key, '|', 1), l.street, l.number,
       (select array(select distinct r2.route from public.run_lines l2 join public.runs r2 on r2.id = l2.run_id where l2.address_key = l.address_key order by 1)),
       (select min(r2.delivery_date) from public.run_lines l2 join public.runs r2 on r2.id = l2.run_id where l2.address_key = l.address_key),
       r.delivery_date, r.id
from public.run_lines l join public.runs r on r.id = l.run_id
order by l.address_key, r.delivery_date desc
on conflict (address_key) do nothing;

-- The register as the dashboard shows it: with the GPS learned from deliveries.
create or replace view public.address_register with (security_invoker = true) as
select a.*, p.taps as gps_taps, p.lat as gps_lat, p.lng as gps_lng, p.median_accuracy_m as gps_accuracy_m,
       o.name as operating_name, s.name as service_name, o.group_id
from public.addresses a
left join public.address_positions p on p.address_key = a.address_key
left join public.operating_locations o on o.id = a.operating_location_id
left join public.service_locations s on s.id = a.service_location_id;

do $$ declare t text; begin
  foreach t in array array['location_groups', 'operating_locations', 'service_locations', 'addresses', 'location_policies', 'dispatch_history'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select to authenticated using (public.is_member())', t, t);
    if t <> 'dispatch_history' then
      execute format('drop policy if exists %I_write on public.%I', t, t);
      execute format('create policy %I_write on public.%I for all to authenticated using (public.is_dispatcher()) with check (public.is_dispatcher())', t, t);
    end if;
  end loop;
end $$;
