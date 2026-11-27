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

-- ---- Delivery outcomes. A tap still says done (the driver has dealt with the stop);
-- outcome says how. Nothing is overwritten: a problem is a new entry after the tick.
--   delivered  normal tick (older entries have no outcome and mean this)
--   short      delivered fewer than the sheet says (qty_delivered of qty)
--   futile     went there, couldn't deliver (reason: gate locked, dog…)
--   undone     untick
alter table public.tap_events add column if not exists outcome text;
alter table public.tap_events add column if not exists reason text;
alter table public.tap_events add column if not exists qty_delivered int;
-- How it was recorded: null = ticked in the app; 'paper' = entered in Dispatch from a paper run sheet.
alter table public.tap_events add column if not exists method text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tap_events_outcome_check') then
    alter table public.tap_events add constraint tap_events_outcome_check
      check (outcome is null or outcome in ('delivered', 'short', 'futile', 'undone'));
  end if;
end $$;

-- Current state of each line: its latest tap.
create or replace view public.line_status with (security_invoker = true) as
select distinct on (run_id, line_key)
  run_id, line_key, done, user_name, device_time, lat, lng, accuracy_m,
  coalesce(outcome, case when done then 'delivered' else 'undone' end) as outcome, reason, qty_delivered, method
from public.tap_events
order by run_id, line_key, device_time desc, server_time desc;


-- Where each letterbox actually is, learned from the GPS on real delivery ticks (decision 0039).
-- Stan guides to this point when Dispatch hasn't set a stop; it's also the groundwork for learned sequencing.
--  - Only ticks made in the app at the time (not paper, photo or corrected records), delivered, with a fix good to 40 m.
--  - The middle (median) of an address's ticks is found first, then only the ticks within 30 m of it are averaged,
--    so a tick made from further up the road, or by mistake somewhere else, can't drag the point away.
--  - At least two ticks must agree, and they must be at least half of all the ticks at that address.
--    Otherwise there is no learned point and the app falls back to looking the street address up.
create or replace view public.address_positions with (security_invoker = true) as
with good as (
  select address_key, lat, lng, accuracy_m, device_time
  from public.tap_events
  where done and lat is not null and accuracy_m <= 40 and method is null and coalesce(outcome, 'delivered') <> 'futile'
), mid as (
  select address_key,
         percentile_cont(0.5) within group (order by lat) as mlat,
         percentile_cont(0.5) within group (order by lng) as mlng,
         count(*) as n
  from good group by address_key
), agree as (
  select g.address_key, g.lat, g.lng, g.accuracy_m, g.device_time, m.n
  from good g join mid m using (address_key)
  where 111320 * sqrt(power(g.lat - m.mlat, 2) + power((g.lng - m.mlng) * cos(radians(m.mlat)), 2)) <= 30
)
select
  address_key,
  count(*)                          as taps,          -- the ticks that agree
  avg(lat)                          as lat,
  avg(lng)                          as lng,
  percentile_cont(0.5) within group (order by accuracy_m) as median_accuracy_m,
  max(device_time)                  as last_tap,
  max(n)                            as all_taps        -- every good tick at the address, agreeing or not
from agree
group by address_key
having count(*) >= 2 and count(*) * 2 >= max(n);

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
-- A photo added afterwards (from the gallery, or for an address ticked earlier): no GPS, no tick.
alter table public.photos add column if not exists added_later boolean not null default false;
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

-- ===============================================================
-- Complaints register (docs/business-rules.md#complaints-register).
-- Every complaint on a key report, kept once even when the same complaint is on several
-- sheets, with who ticked that delivery (from the taps), photos that day, and the
-- customer's (address's) complaint history. Filled automatically as sheets load.
-- ===============================================================
create table if not exists public.complaints (
  id            uuid primary key default gen_random_uuid(),
  address_key   text not null,
  route         text,
  number        text,
  street        text,
  kind          text,              -- MISSED, WET, DAMAGED, LATE, WRONG… (from the key report)
  happened_on   date,              -- the delivery the complaint is about
  publication   text,
  service       text,              -- e.g. WKLY7 (7-day subscriber)
  description   text,              -- "Missed delivery on Sat 7 Nov (NZH, 7-day subscriber)"
  raw           text,              -- the report's comment, e.g. 0711
  reported_on   date not null,     -- delivery day of the first sheet that listed it
  last_seen_on  date not null,     -- delivery day of the latest sheet that listed it
  first_run_id  text,
  status        text not null default 'open',  -- open, disputed (we delivered), accepted (our miss), closed
  notes         text,
  updated_at    timestamptz not null default now(),
  updated_by    text
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'complaints_status_check') then
    alter table public.complaints add constraint complaints_status_check check (status in ('open', 'disputed', 'accepted', 'closed'));
  end if;
end $$;
create unique index if not exists complaints_identity on public.complaints
  (address_key, coalesce(publication, ''), coalesce(kind, ''), coalesce(happened_on, reported_on));
create index if not exists complaints_address_idx on public.complaints (address_key);

-- "Missed delivery on Sat 7 Nov (…)" -> the date, for complaints loaded before the parser stored it.
create or replace function public.complaint_date_from_text(t text, ref date) returns date
language plpgsql immutable as $$
declare m text[]; d date;
begin
  m := regexp_match(coalesce(t, ''), ' on \w+ (\d{1,2}) (\w{3})');
  if m is null then return null; end if;
  d := to_date(m[1] || ' ' || m[2] || ' ' || extract(year from ref)::int, 'DD Mon YYYY');
  if d > ref then d := d - interval '1 year'; end if;
  return d;
exception when others then return null;
end $$;

create or replace function public.register_complaints() returns trigger
language plpgsql security definer set search_path = public as $$
declare f jsonb; r record; k text; d date;
begin
  if new.flags is null or new.flags::text not like '%complaint%' then return new; end if;
  select id, route, delivery_date into r from public.runs where id = new.run_id;
  if not found then return new; end if;
  for f in select * from jsonb_array_elements(new.flags) loop
    continue when f ->> 'type' <> 'complaint';
    k := coalesce(f ->> 'kind', case
      when f ->> 'text' ilike 'Missed delivery%' then 'MISSED' when f ->> 'text' ilike 'Wet paper%' then 'WET'
      when f ->> 'text' ilike 'Damaged paper%' then 'DAMAGED' when f ->> 'text' ilike 'Late delivery%' then 'LATE'
      when f ->> 'text' ilike 'Wrong paper%' then 'WRONG' end);
    d := coalesce((f ->> 'on')::date, public.complaint_date_from_text(f ->> 'text', r.delivery_date));
    insert into public.complaints as c (address_key, route, number, street, kind, happened_on, publication, service, description, raw, reported_on, last_seen_on, first_run_id)
    values (new.address_key, r.route, new.number, new.street, k, d,
            coalesce(f ->> 'pub', substring(f ->> 'text' from '\((\w+)[,)]')), f ->> 'service', f ->> 'text', f ->> 'raw',
            r.delivery_date, r.delivery_date, r.id)
    on conflict (address_key, coalesce(publication, ''), coalesce(kind, ''), coalesce(happened_on, reported_on)) do update set
      reported_on  = least(c.reported_on, excluded.reported_on),
      last_seen_on = greatest(c.last_seen_on, excluded.last_seen_on),
      description  = excluded.description,
      service      = coalesce(excluded.service, c.service);
  end loop;
  return new;
end $$;
drop trigger if exists run_lines_complaints on public.run_lines;
create trigger run_lines_complaints after insert or update of flags on public.run_lines
  for each row execute function public.register_complaints();

-- Register complaints already on loaded sheets (safe to repeat: it only re-saves the flags).
update public.run_lines set flags = flags where flags::text like '%complaint%';

-- The register as the dashboard shows it: who ticked that delivery, photos that day,
-- and the customer's history (count and the complaint before this one).
create or replace view public.complaint_register with (security_invoker = true) as
select c.*,
       d.user_name  as delivered_by,
       d.device_time as delivered_at,
       d.done       as delivered,
       d.accuracy_m as delivered_accuracy_m,
       (select count(*) from public.photos p
         where p.address_key = c.address_key
           and (p.taken_at at time zone 'Pacific/Auckland')::date = c.happened_on) as photos_that_day,
       count(*) over (partition by c.address_key) as customer_complaints,
       row_number() over (partition by c.address_key order by coalesce(c.happened_on, c.reported_on), c.reported_on) as customer_complaint_no,
       lag(coalesce(c.happened_on, c.reported_on)) over (partition by c.address_key order by coalesce(c.happened_on, c.reported_on), c.reported_on) as previous_complaint_on,
       d.outcome    as delivered_outcome,
       d.reason     as delivered_reason,
       d.method     as delivered_method
from public.complaints c
left join lateral (
  select t.user_name, t.device_time, t.done, t.accuracy_m,
         coalesce(t.outcome, case when t.done then 'delivered' else 'undone' end) as outcome, t.reason, t.method
  from public.tap_events t join public.runs r on r.id = t.run_id
  where t.address_key = c.address_key and r.delivery_date = c.happened_on
  order by t.device_time desc limit 1
) d on true;

alter table public.complaints enable row level security;
drop policy if exists complaints_read on public.complaints;
create policy complaints_read on public.complaints for select to authenticated using (public.is_member());
drop policy if exists complaints_write on public.complaints;
create policy complaints_write on public.complaints for update to authenticated using (public.is_dispatcher()) with check (public.is_dispatcher());
do $$ begin
  execute 'drop trigger if exists complaints_log on public.complaints';
  execute 'create trigger complaints_log after update on public.complaints for each row execute function public.log_dispatch_change()';
end $$;

-- ===============================================================
-- Governance baseline v0.5 (docs/decisions/0014-governance-baseline.md).
-- ===============================================================

-- ---- Sheet fingerprint: which exact PDF a run came from (SHA-256 of its bytes).
alter table public.runs add column if not exists source_hash text;

-- ---- Policies have dates, and clashing policies are refused (never resolved by a hidden
-- "most specific wins"). Two active policies clash when they are the same kind, set
-- different values, cover at least one address in common, and overlap in days and dates.
-- Notes and restrictions add up, so they never clash.
alter table public.location_policies add column if not exists valid_from date;
alter table public.location_policies add column if not exists valid_to date;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'location_policies_dates_check') then
    alter table public.location_policies add constraint location_policies_dates_check
      check (valid_to is null or valid_from is null or valid_to >= valid_from);
  end if;
end $$;

-- Every address a policy target covers: the address, or everything under a service
-- location, an operating location, or a group and its sub-groups.
create or replace function public.policy_addresses(g uuid, o uuid, s uuid, a text)
returns table (address_key text)
language sql stable security definer set search_path = public as $$
  with recursive tree(id) as (
    select g where g is not null
    union
    select lg.id from public.location_groups lg join tree t on lg.parent_id = t.id
  )
  select a where a is not null
  union select ad.address_key from public.addresses ad where s is not null and ad.service_location_id = s
  union select ad.address_key from public.addresses ad
        where o is not null and (ad.operating_location_id = o
          or ad.service_location_id in (select sl.id from public.service_locations sl where sl.operating_location_id = o))
  union select ad.address_key from public.addresses ad
        join public.operating_locations op on op.id = ad.operating_location_id
        join tree t on t.id = op.group_id;
$$;

create or replace function public.policies_clash(p public.location_policies, q public.location_policies)
returns boolean language sql stable security definer set search_path = public as $$
  select p.id <> q.id and p.active and q.active and p.kind = q.kind
    and p.kind in ('entry_point', 'not_before', 'time_window', 'speed_limit')
    and (cardinality(p.days) = 0 or cardinality(q.days) = 0 or p.days && q.days)
    and daterange(coalesce(p.valid_from, '-infinity'::date), coalesce(p.valid_to, 'infinity'::date), '[]')
     && daterange(coalesce(q.valid_from, '-infinity'::date), coalesce(q.valid_to, 'infinity'::date), '[]')
    and (
      -- the same target: any second rule of these kinds is a clash, even with the same value
      (p.group_id is not distinct from q.group_id and p.operating_location_id is not distinct from q.operating_location_id
        and p.service_location_id is not distinct from q.service_location_id and p.address_key is not distinct from q.address_key)
      or (
        -- different levels: a clash when the values differ and they share an address
        (p.time_from, p.time_to, p.speed_kmh, p.lat, p.lng, coalesce(p.note, ''))
          is distinct from (q.time_from, q.time_to, q.speed_kmh, q.lat, q.lng, coalesce(q.note, ''))
        and exists (
          select 1 from public.policy_addresses(p.group_id, p.operating_location_id, p.service_location_id, p.address_key) x
          join public.policy_addresses(q.group_id, q.operating_location_id, q.service_location_id, q.address_key) y using (address_key))
      ));
$$;

create or replace function public.policy_label(p public.location_policies) returns text
language sql stable security definer set search_path = public as $$
  select case p.kind
      when 'not_before' then 'No service before ' || to_char(p.time_from, 'HH24:MI')
      when 'time_window' then 'Deliver between ' || to_char(p.time_from, 'HH24:MI') || ' and ' || to_char(p.time_to, 'HH24:MI')
      when 'speed_limit' then 'Speed limit ' || p.speed_kmh || ' km/h'
      when 'entry_point' then 'Entry point' || coalesce(': ' || p.note, '')
      else p.kind end
    || ' on ' || coalesce(
      (select name || ' (group)' from public.location_groups where id = p.group_id),
      (select name || ' (stop)' from public.operating_locations where id = p.operating_location_id),
      (select name || ' (service location)' from public.service_locations where id = p.service_location_id),
      (select number || ' ' || initcap(street) from public.addresses where address_key = p.address_key),
      '?');
$$;

create or replace function public.location_policies_no_clash() returns trigger
language plpgsql security definer set search_path = public as $$
declare other public.location_policies;
begin
  if new.valid_to < new.valid_from then raise exception 'The end date is before the start date.' using errcode = 'P0001'; end if;
  if not new.active then return new; end if;
  select * into other from public.location_policies q where public.policies_clash(new, q) limit 1;
  if found then
    raise exception 'This clashes with an existing policy: %. Switch that one off, give the two different dates or days, or change it instead.',
      public.policy_label(other) using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists location_policies_no_clash on public.location_policies;
create trigger location_policies_no_clash before insert or update on public.location_policies
  for each row execute function public.location_policies_no_clash();

-- Clashes that appear later (an address moved under a stop with a different rule).
create or replace view public.policy_clashes with (security_invoker = true) as
select p.id as policy_id, q.id as other_id, public.policy_label(p) as policy, public.policy_label(q) as other
from public.location_policies p join public.location_policies q on p.id < q.id
where public.policies_clash(p, q);

-- Policies in force on a day (drivers will see these; expired ones stay for the record).
create or replace view public.current_policies with (security_invoker = true) as
select * from public.location_policies
where active
  and (valid_from is null or valid_from <= (now() at time zone 'Pacific/Auckland')::date)
  and (valid_to is null or valid_to >= (now() at time zone 'Pacific/Auckland')::date);

-- ===============================================================
-- Closing a run in Dispatch (docs/business-rules.md#closing-a-run), e.g. a run done on the
-- paper sheet while drivers are still getting used to the app. Closing records the driver and
-- when the run finished; stops not ticked in the app get a 'paper' tick from Dispatch (new
-- entries, never edits). Reopening adds 'undone' entries for those paper ticks.
-- Only dispatchers can close, reopen or set the driver.
-- ===============================================================
alter table public.runs add column if not exists driver text;          -- who did the run
alter table public.runs add column if not exists closed_at timestamptz; -- when it finished (null = open)
alter table public.runs add column if not exists closed_by text;        -- the dispatcher who closed it
alter table public.runs add column if not exists close_method text;     -- 'paper' or 'app'
alter table public.runs add column if not exists close_note text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'runs_close_method_check') then
    alter table public.runs add constraint runs_close_method_check check (close_method is null or close_method in ('paper', 'app'));
  end if;
end $$;

create or replace function public.runs_close_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.driver, new.closed_at, new.closed_by, new.close_method, new.close_note)
     is distinct from (old.driver, old.closed_at, old.closed_by, old.close_method, old.close_note) then
    if coalesce(auth.role(), '') = 'authenticated' and not public.is_dispatcher() then
      raise exception 'Only a dispatcher can close or reopen a run, or set its driver.' using errcode = 'P0001';
    end if;
    insert into public.dispatch_history (entity, entity_id, action, data)
    values ('runs', new.id, case when new.closed_at is not null and old.closed_at is null then 'close'
                                 when new.closed_at is null and old.closed_at is not null then 'reopen' else 'update' end,
            jsonb_build_object('route', new.route, 'delivery_date', new.delivery_date, 'driver', new.driver,
                               'closed_at', new.closed_at, 'close_method', new.close_method, 'close_note', new.close_note));
  end if;
  return new;
end $$;
drop trigger if exists runs_close_guard on public.runs;
create trigger runs_close_guard before update on public.runs
  for each row execute function public.runs_close_guard();

-- Paper ticks can only be entered by a dispatcher. Anyone on the list can add a 'photo' tick:
-- a delivery recorded afterwards at the time read from the delivery photo (decision 0030).
drop policy if exists tap_events_add on public.tap_events;
create policy tap_events_add on public.tap_events for insert to authenticated
  with check (public.is_member() and user_id = auth.uid() and (method is null or method = 'photo' or public.is_dispatcher()));

-- ---- Progress per run, counted in the database (the app used to count from up to 1000 tick
-- rows, which undercounts once there are weeks of runs). A run is complete when it is closed
-- in Dispatch or every stop is dealt with; complete runs move to History (docs/business-rules.md#current-and-history).
create or replace view public.run_progress with (security_invoker = true) as
select run_id,
       count(*) filter (where done)                         as done,
       count(*) filter (where done and outcome = 'futile')  as not_delivered,
       count(*) filter (where done and method = 'paper')    as paper,
       max(device_time) filter (where done)                 as last_tick,
       string_agg(distinct user_name, ', ') filter (where done) as ticked_by
from public.line_status
group by run_id;

-- ---- Where to send Google Maps for each address (docs/business-rules.md#directions):
-- the stop set in Dispatch (where the vehicle parks: villages, buildings) first, then the
-- letterbox position learned from GPS ticks. Null = the app falls back to the street address.
create or replace view public.address_destinations with (security_invoker = true) as
select a.address_key,
       coalesce(o.lat, p.lat) as lat,
       coalesce(o.lng, p.lng) as lng,
       case when o.lat is not null then 'stop' when p.lat is not null then 'learned' end as source,
       o.name as stop_name
from public.addresses a
left join public.operating_locations o on o.id = a.operating_location_id
left join public.address_positions p on p.address_key = a.address_key;

-- ---- Each person's own delivery order (Mike, 11 Nov 2026): Lisa does Run 6 in a different
-- order from Mike's, which stays the usual one. A driver's drags save here; a dispatcher's drags
-- change route_sequences (the usual order). No row = use the usual order.
create table if not exists public.person_sequences (
  route        text not null,
  user_id      uuid not null default auth.uid(),
  address_keys jsonb not null,
  updated_by   text,
  updated_at   timestamptz not null default now(),
  primary key (route, user_id)
);
alter table public.person_sequences enable row level security;
drop policy if exists person_sequences_read on public.person_sequences;
create policy person_sequences_read on public.person_sequences for select to authenticated using (public.is_member());
drop policy if exists person_sequences_own on public.person_sequences;
create policy person_sequences_own on public.person_sequences for all to authenticated
  using (public.is_member() and user_id = auth.uid()) with check (public.is_member() and user_id = auth.uid());

-- ---- On Duty (Mike, 12 Nov 2026; docs/decisions/0020-on-duty-and-shifts.md) ----
-- Each change of a person's duty status, never edited: on_duty (tapped at the depot),
-- on_run (drove off / moved on to a run, with run_id), between, off_duty.
create table if not exists public.duty_events (
  id          uuid primary key,
  user_id     uuid not null default auth.uid(),
  user_name   text,
  state       text not null check (state in ('on_duty', 'depot', 'on_run', 'between', 'off_duty')),
  run_id      text references public.runs (id) on delete set null,
  source      text not null default 'tap' check (source in ('tap', 'auto', 'tick', 'move_on', 'dispatch')),
  device_time timestamptz not null,
  server_time timestamptz not null default now(),
  lat double precision, lng double precision, accuracy_m double precision
);
create index if not exists duty_events_day on public.duty_events (device_time);
alter table public.duty_events enable row level security;
drop policy if exists duty_events_read on public.duty_events;
create policy duty_events_read on public.duty_events for select to authenticated using (public.is_member());
drop policy if exists duty_events_add on public.duty_events;
create policy duty_events_add on public.duty_events for insert to authenticated
  with check (public.is_member() and (user_id = auth.uid() or public.is_dispatcher()));
-- No update or delete policy: like ticks, duty changes are only ever added.

-- ---- App settings (dispatchers set, everyone reads): the depot's location for now.
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings for select to authenticated using (public.is_member());
drop policy if exists app_settings_write on public.app_settings;
create policy app_settings_write on public.app_settings for all to authenticated using (public.is_dispatcher()) with check (public.is_dispatcher());

-- ---- Chat with Stan: the ideas register (Mike, 12 Nov 2026; docs/decisions/0024-chat-with-stan.md) ----
-- What the family tells Stan: ideas, tweaks, niggles. Dispatchers review them and set a status.
create table if not exists public.ideas (
  id          uuid primary key,
  user_id     uuid not null default auth.uid(),
  user_name   text,
  text        text not null check (char_length(text) between 1 and 2000),
  topic       text,
  screen      text,
  app_version text,
  device_time timestamptz not null,
  server_time timestamptz not null default now(),
  status      text not null default 'new' check (status in ('new', 'planned', 'done', 'declined')),
  note        text,
  updated_by  text,
  updated_at  timestamptz
);
alter table public.ideas enable row level security;
drop policy if exists ideas_read on public.ideas;
create policy ideas_read on public.ideas for select to authenticated using (public.is_member());
drop policy if exists ideas_add on public.ideas;
create policy ideas_add on public.ideas for insert to authenticated
  with check (public.is_member() and user_id = auth.uid() and status = 'new' and note is null);
drop policy if exists ideas_review on public.ideas;
create policy ideas_review on public.ideas for update to authenticated using (public.is_dispatcher()) with check (public.is_dispatcher());

-- ---- People's icons (Mike, 13 Nov 2026, via Chat with Stan; docs/decisions/0025-avatars.md) ----
-- One row per person: a ready-made icon's name, or a small photo (96x96 JPEG as a data URL, made on the phone).
create table if not exists public.avatars (
  user_id    uuid primary key default auth.uid(),
  user_name  text not null,
  kind       text not null check (kind in ('icon', 'photo')),
  value      text not null check (char_length(value) < 60000),
  updated_at timestamptz not null default now(),
  check (kind <> 'photo' or value ~ '^data:image/(jpeg|png);base64,[A-Za-z0-9+/=]+$'),
  check (kind <> 'icon' or value ~ '^[a-z]{2,20}$')
);
alter table public.avatars enable row level security;
drop policy if exists avatars_read on public.avatars;
create policy avatars_read on public.avatars for select to authenticated using (public.is_member());
drop policy if exists avatars_mine_add on public.avatars;
create policy avatars_mine_add on public.avatars for insert to authenticated with check (public.is_member() and user_id = auth.uid());
drop policy if exists avatars_mine_change on public.avatars;
create policy avatars_mine_change on public.avatars for update to authenticated using (user_id = auth.uid()) with check (public.is_member() and user_id = auth.uid());

-- ---- Ping (Mike, 13 Nov 2026, via Chat with Stan; docs/decisions/0026-run-map-and-ping.md) ----
-- A dispatcher asks where an on-duty driver is; that driver's phone answers once, if STB is open on it.
-- Every ask is kept, and the driver is told each time.
create or replace function public.my_name() returns text
language sql stable security definer set search_path = public as $$
  select display_name from public.members where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) limit 1;
$$;
create table if not exists public.pings (
  id          uuid primary key default gen_random_uuid(),
  target_name text not null,
  asked_by    text,
  asked_at    timestamptz not null default now(),
  state       text not null default 'asked' check (state in ('asked', 'answered', 'off_duty', 'no_gps')),
  answered_at timestamptz,
  lat double precision, lng double precision, accuracy_m double precision
);
alter table public.pings enable row level security;
-- Ping from the driver screen (Mike, 28 Nov 2026; decision 0071): anyone on duty can also ask, about someone else,
-- in their own name, and can read the answers to their own asks.
create or replace function public.on_duty_now(who text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select state <> 'off_duty' from public.duty_events
    where user_name = who and device_time > now() - interval '20 hours' order by device_time desc limit 1), false);
$$;
drop policy if exists pings_read on public.pings;
create policy pings_read on public.pings for select to authenticated
  using (public.is_dispatcher() or target_name = public.my_name() or asked_by = public.my_name());
drop policy if exists pings_ask on public.pings;
create policy pings_ask on public.pings for insert to authenticated with check (state = 'asked' and lat is null and (
  public.is_dispatcher()
  or (public.is_member() and asked_by = public.my_name() and target_name <> public.my_name() and public.on_duty_now(public.my_name()))));
drop policy if exists pings_answer on public.pings;
create policy pings_answer on public.pings for update to authenticated using (target_name = public.my_name() and state = 'asked') with check (target_name = public.my_name());
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pings') then
    alter publication supabase_realtime add table public.pings;
  end if;
exception when undefined_object then null; end $$;

-- ---- Morning watch (Mike, 13 Nov 2026; docs/decisions/0028-morning-watch.md) ----
-- When each run's app ticks started and ended: how long a route usually takes, and whether it made its deadline.
-- A tick undone afterwards (same stop, later untick) doesn't count (Zaph's idea, 17 Nov 2026; decision 0075).
create or replace view public.run_times with (security_invoker = true) as
select t.run_id, min(t.device_time) as first_tick, max(t.device_time) as last_tick, count(*)::int as ticks
from public.tap_events t
where t.done and t.method is distinct from 'paper'
  and not exists (select 1 from public.tap_events u where u.run_id = t.run_id and u.line_key = t.line_key and not u.done and u.device_time >= t.device_time)
group by t.run_id;

-- ---- Stan's Paper Run (Mike, 14 Nov 2026; docs/decisions/0034-stans-paper-run.md) ----
-- Scores from the little game Stan offers when there are no runs to do. One row per finished game;
-- the family board shows each person's best. Nothing here touches runs, ticks or shifts.
create table if not exists public.game_scores (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid(),
  user_name   text not null,
  score       integer not null check (score between 0 and 100000),
  streets     integer not null default 0 check (streets between 0 and 1000),
  delivered   integer not null default 0 check (delivered between 0 and 10000),
  best_streak integer not null default 0 check (best_streak between 0 and 10000),
  ended       text check (ended in ('complaints', 'battery', 'quit')),
  device_time timestamptz,
  server_time timestamptz not null default now()
);
create index if not exists game_scores_top on public.game_scores (score desc);
alter table public.game_scores enable row level security;
drop policy if exists game_scores_read on public.game_scores;
create policy game_scores_read on public.game_scores for select to authenticated using (public.is_member());
drop policy if exists game_scores_add on public.game_scores;
create policy game_scores_add on public.game_scores for insert to authenticated
  with check (public.is_member() and user_id = auth.uid() and user_name = public.my_name());

-- ---- Drivers and helpers, and Stan's day plan (Mike, 19 Nov 2026; docs/decisions/0040-day-plan.md) ----
-- crew: a driver takes runs; a helper rides with a driver (folds, bags, takes the passenger-side letterboxes).
alter table public.members add column if not exists crew text not null default 'driver';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'members_crew_check') then
    alter table public.members add constraint members_crew_check check (crew in ('driver', 'helper'));
  end if;
end $$;
-- Who was helping, noted when a driver goes on duty (empty = on their own; null = not asked).
alter table public.duty_events add column if not exists helpers text[];
-- One plan per delivery day: who drives which runs, in what order, and the times, as worked out in Dispatch.
create table if not exists public.day_plans (
  delivery_date date primary key,
  plan          jsonb not null,
  note          text,
  updated_by    text,
  updated_at    timestamptz not null default now()
);
alter table public.day_plans enable row level security;
drop policy if exists day_plans_read on public.day_plans;
create policy day_plans_read on public.day_plans for select to authenticated using (public.is_member());
drop policy if exists day_plans_add on public.day_plans;
create policy day_plans_add on public.day_plans for insert to authenticated with check (public.is_dispatcher());
drop policy if exists day_plans_change on public.day_plans;
create policy day_plans_change on public.day_plans for update to authenticated using (public.is_dispatcher()) with check (public.is_dispatcher());

-- ---- Crew check and the notice board (Mike, 19 Nov 2026; docs/decisions/0041-crew-check-and-notice-board.md) ----
-- A helper going on duty says who is driving. The driver's own answer (helpers) is the one that counts.
alter table public.duty_events add column if not exists driver text;
-- Helpers with no login, typed under "Other…" on "Who's with you?", so they are a button next time.
create table if not exists public.helper_names (
  name     text primary key check (char_length(name) between 1 and 30),
  added_by text,
  added_at timestamptz not null default now()
);
alter table public.helper_names enable row level security;
drop policy if exists helper_names_read on public.helper_names;
create policy helper_names_read on public.helper_names for select to authenticated using (public.is_member());
drop policy if exists helper_names_add on public.helper_names;
create policy helper_names_add on public.helper_names for insert to authenticated with check (public.is_member());
drop policy if exists helper_names_remove on public.helper_names;
create policy helper_names_remove on public.helper_names for delete to authenticated using (public.is_dispatcher());
-- Notes anyone leaves for the family. to_names null = everyone. Never deleted: taken down with removed_at.
create table if not exists public.notices (
  id         uuid primary key,
  user_id    uuid not null default auth.uid(),
  from_name  text not null,
  body       text not null check (char_length(body) between 1 and 500),
  to_names   text[],
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  removed_at timestamptz,
  removed_by text
);
alter table public.notices enable row level security;
drop policy if exists notices_read on public.notices;
create policy notices_read on public.notices for select to authenticated using (public.is_member());
drop policy if exists notices_add on public.notices;
create policy notices_add on public.notices for insert to authenticated with check (public.is_member() and user_id = auth.uid() and from_name = public.my_name());
drop policy if exists notices_remove on public.notices;
create policy notices_remove on public.notices for update to authenticated using (user_id = auth.uid() or public.is_dispatcher()) with check (user_id = auth.uid() or public.is_dispatcher());
-- Who has tapped Got it on a note.
create table if not exists public.notice_seen (
  notice_id uuid not null references public.notices (id) on delete cascade,
  user_name text not null,
  user_id   uuid not null default auth.uid(),
  seen_at   timestamptz not null default now(),
  primary key (notice_id, user_name)
);
alter table public.notice_seen enable row level security;
drop policy if exists notice_seen_read on public.notice_seen;
create policy notice_seen_read on public.notice_seen for select to authenticated using (public.is_member());
drop policy if exists notice_seen_add on public.notice_seen;
create policy notice_seen_add on public.notice_seen for insert to authenticated with check (public.is_member() and user_id = auth.uid() and user_name = public.my_name());

-- ---- Spare papers and pinned rules (Mike, 20 Nov 2026; docs/decisions/0042-spares-and-pinned-rules.md) ----
-- A pinned notice is a standing rule ("How we do things"): it has no end date and sits at the top of the board.
alter table public.notices add column if not exists pinned boolean not null default false;
-- A driver's count of spare papers at the start of the run and at the end, and who any spares went to.
-- counts: { "NZH": 3, "SST": 12 }   given: [{ "to": "name", "n": 1 }]   Added, never changed: the latest answer counts.
create table if not exists public.spare_counts (
  id            uuid primary key,
  delivery_date date not null,
  user_id       uuid not null default auth.uid(),
  user_name     text not null,
  moment        text not null check (moment in ('start', 'end')),
  counts        jsonb not null default '{}'::jsonb,
  given         jsonb not null default '[]'::jsonb,
  device_time   timestamptz not null,
  created_at    timestamptz not null default now()
);
create index if not exists spare_counts_day on public.spare_counts (delivery_date);
alter table public.spare_counts enable row level security;
drop policy if exists spare_counts_read on public.spare_counts;
create policy spare_counts_read on public.spare_counts for select to authenticated using (public.is_member());
drop policy if exists spare_counts_add on public.spare_counts;
create policy spare_counts_add on public.spare_counts for insert to authenticated with check (public.is_member() and user_id = auth.uid() and user_name = public.my_name());
-- People who regularly get a spare, so they are a button. Names are added in the app, never in this file.
create table if not exists public.spare_people (
  name     text primary key check (char_length(name) between 1 and 30),
  added_by text,
  added_at timestamptz not null default now()
);
alter table public.spare_people enable row level security;
drop policy if exists spare_people_read on public.spare_people;
create policy spare_people_read on public.spare_people for select to authenticated using (public.is_member());
drop policy if exists spare_people_add on public.spare_people;
create policy spare_people_add on public.spare_people for insert to authenticated with check (public.is_member());
drop policy if exists spare_people_remove on public.spare_people;
create policy spare_people_remove on public.spare_people for delete to authenticated using (public.is_dispatcher());

-- ---- Stan's recorded voice (Mike, 21 Nov 2026; docs/decisions/0043-stan-recorded-voice.md) ----
-- One row per line that has been recorded. The clips are in the public "stan-voice" bucket as <key>.mp3.
-- Only the stan-voice Edge Function writes here (with the service key), so there is no insert policy.
create table if not exists public.stan_lines (
  key         text primary key,
  text        text not null,
  voice_id    text,
  model       text,
  bytes       integer,
  recorded_by text,
  recorded_at timestamptz not null default now()
);
alter table public.stan_lines enable row level security;
drop policy if exists stan_lines_read on public.stan_lines;
create policy stan_lines_read on public.stan_lines for select to authenticated using (public.is_member());
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('stan-voice', 'stan-voice', true) on conflict (id) do nothing;
  end if;
end $$;

-- ---- Kilometres on a run, and the odometer (Mike, 21 Nov 2026; docs/decisions/0045-kilometres.md) ----
-- The odometer reading rides with the spare count: one answer when leaving the depot, one when going off duty.
alter table public.spare_counts add column if not exists odometer_km integer;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'spare_counts_odometer_km_check') then
    alter table public.spare_counts add constraint spare_counts_odometer_km_check check (odometer_km is null or (odometer_km >= 0 and odometer_km < 2000000));
  end if;
end $$;
-- How far a run was, from where its ticks were made: straight lines (line_km) and along the roads (road_km, when the map answered).
create table if not exists public.run_km (
  run_id      text primary key,
  line_km     numeric(7,2) not null,
  road_km     numeric(7,2),
  points      integer not null,
  computed_by text,
  computed_at timestamptz not null default now()
);
alter table public.run_km enable row level security;
drop policy if exists run_km_read on public.run_km;
create policy run_km_read on public.run_km for select to authenticated using (public.is_member());
drop policy if exists run_km_add on public.run_km;
create policy run_km_add on public.run_km for insert to authenticated with check (public.is_member());
drop policy if exists run_km_change on public.run_km;
create policy run_km_change on public.run_km for update to authenticated using (public.is_member()) with check (public.is_member());

-- ---- The route as delivered (Mike, 21 Nov 2026; docs/decisions/0046-route-as-delivered.md) ----
-- The road the map says was driven between a run's ticks: one line per vehicle, each a list of [lat, lng].
alter table public.run_km add column if not exists trace jsonb;

-- ---- Duty hard lines (Mike, 22 Nov 2026; docs/decisions/0057-duty-hard-lines.md) ----
-- Going off duty with stops still to do is a hand-over: who is finishing them, or why the driver can't carry on.
alter table public.duty_events add column if not exists handover_to text;
alter table public.duty_events add column if not exists reason text;
-- When a driver goes off duty, so do their helpers: the ones the driver named when going on duty, and anyone who said
-- they were helping that driver. A helper who has since gone on duty with someone else is left alone. Rows are only added.
create or replace function public.duty_off_helpers() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  since timestamptz := new.device_time - interval '20 hours';
  h record;
begin
  if new.state <> 'off_duty' or pg_trigger_depth() > 1 then return new; end if;
  for h in
    with named as (
      select unnest(coalesce(d.helpers, '{}')) as name
      from (select helpers from public.duty_events where user_id = new.user_id and state = 'on_duty' and device_time >= since and device_time <= new.device_time order by device_time desc limit 1) d
    ), latest as (
      select distinct on (e.user_id) e.user_id, e.user_name, e.state, e.device_time
      from public.duty_events e where e.device_time >= since and e.user_id <> new.user_id order by e.user_id, e.device_time desc
    ), last_on as (
      select distinct on (e.user_id) e.user_id, e.driver
      from public.duty_events e where e.device_time >= since and e.state = 'on_duty' and e.user_id <> new.user_id order by e.user_id, e.device_time desc
    )
    select l.user_id, l.user_name from latest l left join last_on o on o.user_id = l.user_id
    where l.state <> 'off_duty' and l.device_time <= new.device_time
      and ((l.user_name in (select name from named) and (o.driver is null or o.driver = new.user_name)) or o.driver = new.user_name)
  loop
    insert into public.duty_events (id, user_id, user_name, state, source, device_time)
    values (gen_random_uuid(), h.user_id, h.user_name, 'off_duty', 'auto', new.device_time);
  end loop;
  return new;
end $$;
drop trigger if exists duty_off_helpers on public.duty_events;
create trigger duty_off_helpers after insert on public.duty_events for each row execute function public.duty_off_helpers();

-- ---- Spares that can be delivered, and papers put aside (Mike, 22 Nov 2026; docs/decisions/0058-location-and-counted-spares.md) ----
-- counts = spares good enough to deliver. damaged = extras put aside for damage or poor quality: { "NZH": 2 }. Never added to counts.
alter table public.spare_counts add column if not exists damaged jsonb not null default '{}'::jsonb;

-- ---- What's new: who has seen which card (Mike, 22 Nov 2026; docs/decisions/0059-whats-new.md) ----
-- The cards themselves are in js/whatsnew.js. This only remembers that a person tapped through one, so it doesn't
-- pop up again on another phone, and so Dispatch can see who is up to date. Rows are only added.
create table if not exists public.update_seen (
  update_id text not null,
  user_name text not null,
  user_id   uuid not null default auth.uid(),
  seen_at   timestamptz not null default now(),
  primary key (update_id, user_name)
);
alter table public.update_seen enable row level security;
drop policy if exists update_seen_read on public.update_seen;
create policy update_seen_read on public.update_seen for select to authenticated using (public.is_member());
drop policy if exists update_seen_add on public.update_seen;
create policy update_seen_add on public.update_seen for insert to authenticated with check (public.is_member() and user_id = auth.uid() and user_name = public.my_name());

-- ---- Stan's School: training progress, new drivers, end-of-day emails (Mike, 23 Nov 2026; docs/decisions/0065-stans-school.md) ----
-- needs_training: a new driver can go on duty as a helper but not as a driver until the driver course and its practice
-- are done. On by default for people added from now on; everyone already on the list knows the job, so they start off.
-- Only a dispatcher can change it (members_change policy).
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'members' and column_name = 'needs_training') then
    alter table public.members add column needs_training boolean not null default false;   -- existing people: off
    alter table public.members alter column needs_training set default true;                -- people added from now on: on
  end if;
end $$;
-- What each person has finished: 'course:<id>' (reached the end of a course) or 'task:<id>' (a Sandbox Stan practice
-- task, checked from what the practice app saved). Rows are only added, by the person themselves.
create table if not exists public.training_progress (
  user_name text not null,
  item      text not null,
  user_id   uuid not null default auth.uid(),
  done_at   timestamptz not null default now(),
  primary key (user_name, item)
);
alter table public.training_progress enable row level security;
drop policy if exists training_progress_read on public.training_progress;
create policy training_progress_read on public.training_progress for select to authenticated using (public.is_member());
drop policy if exists training_progress_add on public.training_progress;
create policy training_progress_add on public.training_progress for insert to authenticated with check (public.is_member() and user_id = auth.uid() and user_name = public.my_name());
-- Which What's new cards have been emailed to whom (the end-of-day email, tools/training-digest.mjs). Written only by
-- the server job with the server key; nobody signed in can read or change it.
create table if not exists public.training_emails (
  email     text not null,
  update_id text not null,
  sent_at   timestamptz not null default now(),
  primary key (email, update_id)
);
alter table public.training_emails enable row level security;

-- ---- Voice builds: the queue (Mike, 23 Nov 2026; docs/decisions/0065-voice-builds.md) ----
-- A change Mike asks for on a voice call is added here; a job on GitHub picks it up, builds, checks, reviews and
-- publishes it, and writes back how it went. Only the server may add or change rows; dispatchers may read them.
create table if not exists public.build_requests (
  id           uuid primary key default gen_random_uuid(),
  request      text not null check (char_length(request) between 10 and 6000),
  requested_by text not null default 'Mike',
  status       text not null default 'queued' check (status in ('queued', 'running', 'done', 'held', 'failed')),
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz,
  summary      text,          -- what was built, or why not, in words to read out
  held_reason  text,          -- why it was held or failed
  commit_sha   text,          -- the published commit, when it was published
  branch       text,          -- where held work was kept
  run_url      text           -- the job on GitHub
);
comment on table public.build_requests is 'Voice builds queue (decision 0065). To ask for a build: insert into build_requests (request) values (''what Mike asked for, in his words, with enough context to build from''). Read status, summary and held_reason to report back. Never add a request that changes live records or spends money: those need Mike in the chat.';
alter table public.build_requests enable row level security;
drop policy if exists build_requests_read on public.build_requests;
create policy build_requests_read on public.build_requests for select to authenticated using (public.is_dispatcher());

-- ---- Voice-to-Laptop Bridge (Mike, 26 Nov 2026; docs/decisions/0070-laptop-bridge.md) ----
-- Lets any Claude session (voice, chat, scheduled tasks) see whether Mike's home laptop is up, and hand it jobs.
-- STB code builds do NOT come here: they stay on build_requests and the GitHub job (0065). This is for work that needs
-- the laptop itself. The laptop's own scripts live on the laptop (Projects\bridge), not in this public repository.
-- Devices are registered by hand with only a bcrypt hash of their secret; the secret never leaves the laptop.
do $$ begin
  create extension if not exists pgcrypto with schema extensions;
exception when others then null; -- not available in the local test database
end $$;

create table if not exists public.bridge_devices (
  device        text primary key,
  label         text not null,
  secret_hash   text not null,
  last_seen     timestamptz,                    -- heartbeat, every minute
  listener_seen timestamptz,                    -- the listener checking the queue, every 5 seconds
  info          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
alter table public.bridge_devices add column if not exists listener_seen timestamptz;

create table if not exists public.bridge_control (
  id            int primary key default 1 check (id = 1),
  paused        boolean not null default false, -- the kill switch
  paused_reason text,
  updated_at    timestamptz not null default now()
);
insert into public.bridge_control (id) values (1) on conflict do nothing;

create table if not exists public.bridge_jobs (
  id           uuid primary key default gen_random_uuid(),
  code         text generated always as (upper(left(replace(id::text,'-',''),6))) stored,
  job_type     text not null default 'claude' check (job_type in ('ping','claude')),
  target       text,
  request      text not null check (char_length(request) between 2 and 8000),
  requested_by text not null default 'Mike',
  source       text not null default 'chat' check (source in ('voice','chat','schedule','code','other')),
  status       text not null default 'queued'
               check (status in ('awaiting_allow','queued','running','done','held','failed','timed_out','cancelled')),
  max_minutes  int  not null default 45 check (max_minutes between 1 and 240),
  max_turns    int  not null default 80 check (max_turns between 1 and 300),
  device       text,
  created_at   timestamptz not null default now(),
  allowed_at   timestamptz,
  started_at   timestamptz,
  finished_at  timestamptz,
  summary      text,
  held_reason  text,
  output_tail  text,
  result       jsonb,
  branch       text,
  commit_sha   text,
  check (job_type <> 'claude' or target is not null)
);
create index if not exists bridge_jobs_queue_idx on public.bridge_jobs (status, created_at);

create table if not exists public.bridge_job_log (
  id      bigint generated always as identity primary key,
  job_id  uuid references public.bridge_jobs(id) on delete cascade,
  at      timestamptz not null default now(),
  actor   text not null,
  event   text not null,
  detail  text
);
create index if not exists bridge_job_log_job_idx on public.bridge_job_log (job_id, at);

comment on table public.bridge_devices is 'Voice-to-Laptop Bridge (0070). Is the laptop up? select * from bridge_status();';
comment on table public.bridge_jobs is
  'Voice-to-Laptop Bridge job queue (laptop work only; STB code builds go to build_requests). Add a job with select bridge_enqueue(target, request); targets are listed by bridge_status(). Check with select * from bridge_queue(); Allow with bridge_allow(code); stop with bridge_cancel(code) or bridge_pause(true). Anything iffy: enqueue with p_needs_allow => true. Never queue work that changes or deletes live database records or spends money: that needs Mike in the chat.';

-- Nobody reads or writes these tables directly: everything goes through the functions below.
alter table public.bridge_devices enable row level security;
alter table public.bridge_control enable row level security;
alter table public.bridge_jobs    enable row level security;
alter table public.bridge_job_log enable row level security;

create or replace function public.bridge__auth(p_device text, p_secret text)
returns boolean language plpgsql stable security definer set search_path = public, extensions as $$
begin
  return exists (select 1 from public.bridge_devices
                  where device = p_device and secret_hash = extensions.crypt(p_secret, secret_hash));
end $$;

create or replace function public.bridge__job(p_ref text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.bridge_jobs where id::text = p_ref or code = upper(p_ref) order by created_at desc limit 1;
$$;

-- The laptop's side: called with the public key plus the device's secret.
create or replace function public.bridge_heartbeat(p_device text, p_secret text, p_info jsonb default '{}'::jsonb)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean;
begin
  update public.bridge_devices set last_seen = now(), info = info || coalesce(p_info, '{}'::jsonb)
   where device = p_device and secret_hash = extensions.crypt(p_secret, secret_hash);
  get diagnostics ok = row_count;
  return ok;
end $$;

create or replace function public.bridge_job_should_stop(p_device text, p_secret text, p_job uuid)
returns text language plpgsql security definer set search_path = public as $$
declare s text;
begin
  if not public.bridge__auth(p_device, p_secret) then return 'unauthorised'; end if;
  update public.bridge_devices set listener_seen = now() where device = p_device;
  select status into s from public.bridge_jobs where id = p_job and device = p_device;
  if s is null then return 'missing'; end if;
  if s = 'cancelled' then return 'cancelled'; end if;
  if (select paused from public.bridge_control where id = 1) then return 'paused'; end if;
  return '';
end $$;

-- The sessions' side: server only (the Supabase connector or the server key). Phase 3 below has the rest.
create or replace function public.bridge_pause(p_paused boolean, p_reason text default null)
returns text language plpgsql security definer set search_path = public as $$
begin
  update public.bridge_control set paused = p_paused, paused_reason = p_reason, updated_at = now() where id = 1;
  insert into public.bridge_job_log (actor, event, detail) values ('Mike', case when p_paused then 'paused' else 'resumed' end, p_reason);
  return case when p_paused then 'Paused: the laptop takes no new jobs and stops the running one' else 'Resumed' end;
end $$;

-- ---- Phase 3: chunked builds and caps (Mike's Voice-to-Laptop Bridge doc, "Handling big builds"; decision 0073) ----
-- Daily caps catch a runaway loop; a big build is declared up front with an estimate and Mike approves its budget;
-- a job that runs out of time at a checkpoint is paused, not killed, and Allow carries it on from there.
alter table public.bridge_control add column if not exists max_jobs_per_day    int not null default 20;
alter table public.bridge_control add column if not exists max_minutes_per_day int not null default 300;
alter table public.bridge_jobs add column if not exists big              boolean not null default false;
alter table public.bridge_jobs add column if not exists estimate_minutes int;
alter table public.bridge_jobs add column if not exists resume_count     int not null default 0;
alter table public.bridge_jobs add column if not exists checkpoint       jsonb;
alter table public.bridge_jobs drop constraint if exists bridge_jobs_status_check;
alter table public.bridge_jobs add constraint bridge_jobs_status_check
  check (status in ('awaiting_allow','queued','running','paused','done','held','failed','timed_out','cancelled'));

-- Today's use (NZ day): each claim, a resume included, reserves its time budget.
create or replace function public.bridge__today()
returns table(jobs int, minutes int) language sql stable security definer set search_path = public as $$
  select count(*)::int, coalesce(sum(j.max_minutes), 0)::int
    from public.bridge_job_log l join public.bridge_jobs j on j.id = l.job_id
   where l.event = 'claimed' and l.at >= (date_trunc('day', now() at time zone 'Pacific/Auckland') at time zone 'Pacific/Auckland');
$$;

create or replace function public.bridge_claim_job(p_device text, p_secret text, p_info jsonb default '{}'::jsonb)
returns setof public.bridge_jobs language plpgsql security definer set search_path = public as $$
declare j public.bridge_jobs; c public.bridge_control; t record;
begin
  if not public.bridge__auth(p_device, p_secret) then return; end if;
  update public.bridge_devices set listener_seen = now(), info = info || coalesce(p_info, '{}'::jsonb)
   where device = p_device;
  -- A running job whose listener went quiet: paused if it reached a checkpoint (Allow carries on), else timed out.
  with stale as (
    update public.bridge_jobs
       set status = case when checkpoint is not null then 'paused' else 'timed_out' end,
           finished_at = now(),
           held_reason = case when checkpoint is not null
             then 'Stopped after ' || max_minutes || ' minutes at checkpoint "' || coalesce(checkpoint->>'step', '?') || '". Allow to carry on.'
             else 'No result within ' || max_minutes || ' minutes' end
     where status = 'running' and started_at < now() - make_interval(mins => max_minutes + 5)
    returning id, status)
  insert into public.bridge_job_log (job_id, actor, event, detail)
  select id, 'database', status, 'listener did not report back' from stale;
  select * into c from public.bridge_control where id = 1;
  if c.paused then return; end if;
  if exists (select 1 from public.bridge_jobs where status = 'running') then return; end if; -- one at a time
  select * into j from public.bridge_jobs where status = 'queued' order by created_at for update skip locked limit 1;
  if not found then return; end if;
  select * into t from public.bridge__today();
  if t.jobs >= c.max_jobs_per_day or t.minutes + j.max_minutes > c.max_minutes_per_day then
    -- Over today's cap: it waits (bridge_status says so). A job Mike approved as a big build is his call, so it goes.
    if not (j.big and j.allowed_at is not null) then return; end if;
  end if;
  update public.bridge_jobs set status = 'running', started_at = now(), finished_at = null, device = p_device
   where id = j.id returning * into j;
  insert into public.bridge_job_log (job_id, actor, event, detail)
  values (j.id, p_device, 'claimed', case when j.resume_count > 0 then 'resume ' || j.resume_count || ' from ' || coalesce(j.checkpoint->>'step', '?') end);
  return next j;
end $$;

-- The laptop marks a step done (after committing it), so a pause loses nothing.
create or replace function public.bridge_checkpoint(p_device text, p_secret text, p_job uuid, p_step text,
  p_note text default null, p_commit_sha text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.bridge__auth(p_device, p_secret) then return false; end if;
  update public.bridge_jobs
     set checkpoint = jsonb_build_object('step', left(p_step, 200), 'note', left(p_note, 1000), 'commit_sha', p_commit_sha,
                                         'at', now(), 'steps', coalesce((checkpoint->>'steps')::int, 0) + 1),
         commit_sha = coalesce(p_commit_sha, commit_sha)
   where id = p_job and device = p_device and status = 'running';
  if not found then return false; end if;
  insert into public.bridge_job_log (job_id, actor, event, detail) values (p_job, p_device, 'checkpoint', left(p_step, 300));
  return true;
end $$;

create or replace function public.bridge_finish_job(
  p_device text, p_secret text, p_job uuid, p_status text,
  p_summary text default null, p_held_reason text default null, p_output_tail text default null,
  p_result jsonb default null, p_branch text default null, p_commit_sha text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare s text;
begin
  if not public.bridge__auth(p_device, p_secret) then return false; end if;
  if p_status not in ('done','held','failed','timed_out','cancelled','paused') then return false; end if;
  update public.bridge_jobs
     set status = case when status = 'cancelled' then 'cancelled'
                       -- out of time or turns after a checkpoint: pause, don't kill
                       when p_status in ('timed_out','paused') and checkpoint is not null then 'paused'
                       when p_status = 'paused' then 'timed_out'
                       else p_status end,
         finished_at = now(),
         summary = left(p_summary, 4000),
         held_reason = left(case when p_status in ('timed_out','paused') and checkpoint is not null
           then coalesce(p_held_reason || ' ', '') || 'Paused at checkpoint "' || coalesce(checkpoint->>'step', '?') || '". Allow to carry on.'
           else p_held_reason end, 2000),
         output_tail = left(p_output_tail, 8000),
         result = p_result, branch = coalesce(p_branch, branch), commit_sha = coalesce(p_commit_sha, commit_sha)
   where id = p_job and device = p_device and status in ('running','cancelled')
  returning status into s;
  if not found then return false; end if;
  insert into public.bridge_job_log (job_id, actor, event, detail)
  values (p_job, p_device, s, left(coalesce(p_held_reason, p_summary), 500));
  return true;
end $$;

-- Sessions: a big build is declared with an estimate and waits for Mike to approve its budget.
drop function if exists public.bridge_enqueue(text,text,text,text,boolean,text,int,int);
create or replace function public.bridge_enqueue(
  p_target text, p_request text, p_job_type text default 'claude', p_source text default 'chat',
  p_needs_allow boolean default false, p_requested_by text default 'Mike',
  p_max_minutes int default 45, p_max_turns int default 80,
  p_big boolean default false, p_estimate_minutes int default null)
returns text language plpgsql security definer set search_path = public as $$
declare j public.bridge_jobs; known jsonb;
begin
  if p_job_type = 'claude' then
    select info->'targets' into known from public.bridge_devices where info ? 'targets' limit 1;
    if known is not null and not known ? p_target then
      raise exception 'Unknown target %. Known targets: %', p_target, known;
    end if;
  end if;
  if p_big and p_estimate_minutes is null then raise exception 'A big build needs p_estimate_minutes'; end if;
  insert into public.bridge_jobs (job_type, target, request, requested_by, source, status, max_minutes, max_turns, big, estimate_minutes)
  values (p_job_type, p_target, p_request, p_requested_by, p_source,
          case when p_needs_allow or p_big then 'awaiting_allow' else 'queued' end,
          case when p_big then least(240, greatest(p_estimate_minutes, 1)) else p_max_minutes end,
          case when p_big then 300 else p_max_turns end, p_big, p_estimate_minutes)
  returning * into j;
  insert into public.bridge_job_log (job_id, actor, event, detail)
  values (j.id, p_source, j.status, case when p_big then 'big build, about ' || p_estimate_minutes || ' min: ' else '' end || left(p_request, 300));
  return j.code;
end $$;

-- Allow: starts a held job, approves a big build's budget, or carries a paused job on from its checkpoint
-- (optionally with more minutes for that job only).
drop function if exists public.bridge_allow(text);
create or replace function public.bridge_allow(p_ref text, p_minutes int default null)
returns text language plpgsql security definer set search_path = public as $$
declare jid uuid := public.bridge__job(p_ref); j public.bridge_jobs;
begin
  update public.bridge_jobs
     set status = 'queued', allowed_at = now(),
         resume_count = resume_count + case when status = 'paused' then 1 else 0 end,
         max_minutes = coalesce(least(240, greatest(p_minutes, 1)), max_minutes)
   where id = jid and status in ('awaiting_allow', 'paused')
  returning * into j;
  if not found then return 'Nothing waiting for Allow with that code'; end if;
  insert into public.bridge_job_log (job_id, actor, event, detail)
  values (jid, 'Mike', 'allowed', case when j.resume_count > 0 then 'carry on from ' || coalesce(j.checkpoint->>'step', '?') end
                                  || case when p_minutes is not null then ' (' || j.max_minutes || ' min)' else '' end);
  return case when j.resume_count > 0 then 'Allowed: it carries on from "' || coalesce(j.checkpoint->>'step', 'the last checkpoint') || '"'
              else 'Allowed' end || ', with ' || j.max_minutes || ' minutes';
end $$;

create or replace function public.bridge_cancel(p_ref text)
returns text language plpgsql security definer set search_path = public as $$
declare jid uuid := public.bridge__job(p_ref);
begin
  update public.bridge_jobs set status = 'cancelled', finished_at = case when status = 'running' then finished_at else now() end
   where id = jid and status in ('awaiting_allow','queued','running','paused');
  if not found then return 'Nothing to cancel with that code'; end if;
  insert into public.bridge_job_log (job_id, actor, event) values (jid, 'Mike', 'cancelled');
  return 'Cancelled';
end $$;

-- Mike sets the daily caps.
create or replace function public.bridge_caps(p_jobs int default null, p_minutes int default null)
returns text language plpgsql security definer set search_path = public as $$
declare c public.bridge_control;
begin
  update public.bridge_control set max_jobs_per_day = coalesce(p_jobs, max_jobs_per_day),
         max_minutes_per_day = coalesce(p_minutes, max_minutes_per_day), updated_at = now() where id = 1 returning * into c;
  insert into public.bridge_job_log (actor, event, detail) values ('Mike', 'caps', c.max_jobs_per_day || ' jobs, ' || c.max_minutes_per_day || ' min a day');
  return 'Caps: ' || c.max_jobs_per_day || ' jobs and ' || c.max_minutes_per_day || ' minutes a day';
end $$;

drop function if exists public.bridge_queue(int);
create function public.bridge_queue(p_limit int default 10)
returns table(code text, status text, job_type text, target text, request text, source text,
              created_at timestamptz, started_at timestamptz, finished_at timestamptz,
              waiting_minutes int, summary text, held_reason text,
              big boolean, estimate_minutes int, max_minutes int, resume_count int, checkpoint text)
language sql stable security definer set search_path = public as $$
  select code, status, job_type, target, left(request, 200), source, created_at, started_at, finished_at,
         case when status in ('queued','awaiting_allow','paused') then floor(extract(epoch from now() - coalesce(finished_at, created_at))/60)::int end,
         summary, held_reason, big, estimate_minutes, max_minutes, resume_count,
         case when checkpoint is not null then (checkpoint->>'steps') || ' step(s), last: ' || (checkpoint->>'step') end
    from public.bridge_jobs order by created_at desc limit p_limit;
$$;

drop function if exists public.bridge_status();
create function public.bridge_status()
returns table(device text, label text, online boolean, last_seen timestamptz, minutes_ago int,
              listener_online boolean, listener_seen timestamptz, paused boolean,
              queued int, awaiting_allow int, running int, paused_jobs int, stuck_queued int,
              jobs_today int, max_jobs_per_day int, minutes_today int, max_minutes_per_day int, over_cap boolean,
              targets jsonb, info jsonb)
language sql stable security definer set search_path = public as $$
  select d.device, d.label, coalesce(d.last_seen > now() - interval '3 minutes', false), d.last_seen,
         floor(extract(epoch from now() - d.last_seen)/60)::int,
         coalesce(d.listener_seen > now() - interval '2 minutes', false), d.listener_seen, c.paused,
         (select count(*) from public.bridge_jobs where status = 'queued')::int,
         (select count(*) from public.bridge_jobs where status = 'awaiting_allow')::int,
         (select count(*) from public.bridge_jobs where status = 'running')::int,
         (select count(*) from public.bridge_jobs where status = 'paused')::int,
         (select count(*) from public.bridge_jobs where status = 'queued' and created_at < now() - interval '10 minutes')::int,
         t.jobs, c.max_jobs_per_day, t.minutes, c.max_minutes_per_day,
         t.jobs >= c.max_jobs_per_day or t.minutes >= c.max_minutes_per_day,
         d.info->'targets', d.info - 'targets'
    from public.bridge_devices d cross join public.bridge_control c cross join public.bridge__today() t order by d.device;
$$;

-- ---- Phase 4: shared notes (the Voice-to-Laptop Bridge doc, "Shared context table"; decision 0076) ----
-- One place every session reads and writes: voice, chat, Claude Code, the laptop and scheduled tasks. Typed entries only,
-- each with a topic, a source and a date, and short; status and results expire, decisions stay (against context bloat).
create table if not exists public.bridge_notes (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('decision', 'result', 'status', 'fact')),
  topics      text[] not null check (cardinality(topics) between 1 and 5),
  body        text not null check (char_length(body) between 3 and 1000),
  source      text not null check (source in ('voice', 'chat', 'code', 'laptop', 'schedule', 'other')),
  stated_by   text not null default 'Mike',
  ref         text,                                   -- a job code, decision number, link or thread
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,                            -- null: stays (decisions and facts)
  supersedes  uuid references public.bridge_notes(id) on delete set null,
  retired_at  timestamptz,
  retired_why text
);
create index if not exists bridge_notes_topics_idx on public.bridge_notes using gin (topics);
create index if not exists bridge_notes_live_idx on public.bridge_notes (created_at desc) where retired_at is null;
alter table public.bridge_notes enable row level security;

-- Write a note. Topics are lower-case words (stb, ollie, cars, bridge...). A newer note can supersede an older one.
create or replace function public.bridge_note(p_kind text, p_topics text[], p_body text, p_source text default 'chat',
  p_stated_by text default 'Mike', p_ref text default null, p_supersedes uuid default null, p_days int default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare n uuid; t text[];
begin
  select array_agg(distinct lower(trim(x))) into t from unnest(p_topics) x where trim(x) <> '';
  insert into public.bridge_notes (kind, topics, body, source, stated_by, ref, supersedes, expires_at)
  values (p_kind, t, trim(p_body), p_source, p_stated_by, p_ref, p_supersedes,
          now() + make_interval(days => coalesce(p_days, case p_kind when 'status' then 3 when 'result' then 14 end)))
  returning id into n;
  if p_supersedes is not null then
    update public.bridge_notes set retired_at = now(), retired_why = 'superseded by ' || n where id = p_supersedes and retired_at is null;
  end if;
  return n;
end $$;

-- Read the live notes, by topic (any of them), newest first; decisions and facts before status and results.
create or replace function public.bridge_notes_for(p_topics text[] default null, p_limit int default 30)
returns table(id uuid, kind text, topics text[], body text, source text, stated_by text, ref text, created_at timestamptz, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select id, kind, topics, body, source, stated_by, ref, created_at, expires_at from public.bridge_notes
   where retired_at is null and (expires_at is null or expires_at > now())
     and (p_topics is null or topics && (select array_agg(lower(x)) from unnest(p_topics) x))
   order by case when kind in ('decision', 'fact') then 0 else 1 end, created_at desc
   limit least(greatest(p_limit, 1), 200);
$$;

create or replace function public.bridge_note_retire(p_id uuid, p_why text default null)
returns text language plpgsql security definer set search_path = public as $$
begin
  update public.bridge_notes set retired_at = now(), retired_why = coalesce(p_why, 'retired') where id = p_id and retired_at is null;
  return case when found then 'Retired' else 'No live note with that id' end;
end $$;

-- A laptop job's result becomes a note by itself, under its folder's name, so every session sees what the laptop did.
create or replace function public.bridge__job_note() returns trigger
language plpgsql security definer set search_path = public as $$
declare n uuid;
begin
  if new.status in ('done', 'held', 'failed', 'paused') and new.status is distinct from old.status
     and new.job_type = 'claude' and coalesce(new.summary, new.held_reason) is not null then
    insert into public.bridge_notes (kind, topics, body, source, stated_by, ref, expires_at)
    values ('result', array['bridge', lower(coalesce(new.target, 'laptop'))],
            left(new.status || ': ' || coalesce(new.summary, new.held_reason), 1000), 'laptop', 'laptop', new.code, now() + interval '14 days')
    returning id into n;
    -- one live note per job: its latest outcome replaces an earlier one (paused, then done)
    update public.bridge_notes set retired_at = now(), retired_why = 'superseded by ' || n
     where ref = new.code and source = 'laptop' and id <> n and retired_at is null;
  end if;
  return new;
end $$;
drop trigger if exists bridge_jobs_note on public.bridge_jobs;
create trigger bridge_jobs_note after update of status on public.bridge_jobs for each row execute function public.bridge__job_note();

-- Who may call what: the laptop's four functions with the public key (they check the device secret);
-- everything else only from the server.
revoke all on function public.bridge__auth(text,text), public.bridge__job(text), public.bridge__today(),
  public.bridge_enqueue(text,text,text,text,boolean,text,int,int,boolean,int), public.bridge_allow(text,int), public.bridge_cancel(text),
  public.bridge_pause(boolean,text), public.bridge_caps(int,int), public.bridge_queue(int), public.bridge_status(),
  public.bridge_heartbeat(text,text,jsonb), public.bridge_claim_job(text,text,jsonb),
  public.bridge_job_should_stop(text,text,uuid), public.bridge_finish_job(text,text,uuid,text,text,text,text,jsonb,text,text),
  public.bridge_checkpoint(text,text,uuid,text,text,text),
  public.bridge_note(text,text[],text,text,text,text,uuid,int), public.bridge_notes_for(text[],int),
  public.bridge_note_retire(uuid,text), public.bridge__job_note()
  from public;
do $$ begin
  -- Supabase grants new functions to anon and authenticated directly, so revoking from public isn't enough (lesson L-015).
  if exists (select 1 from pg_roles where rolname = 'anon') and exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.bridge__today(), public.bridge_enqueue(text,text,text,text,boolean,text,int,int,boolean,int),
      public.bridge_allow(text,int), public.bridge_cancel(text), public.bridge_pause(boolean,text), public.bridge_caps(int,int),
      public.bridge_queue(int), public.bridge_status(), public.bridge__auth(text,text), public.bridge__job(text),
      public.bridge_note(text,text[],text,text,text,text,uuid,int), public.bridge_notes_for(text[],int),
      public.bridge_note_retire(uuid,text), public.bridge__job_note()
      from anon, authenticated;
    revoke execute on function public.bridge_heartbeat(text,text,jsonb), public.bridge_claim_job(text,text,jsonb),
      public.bridge_job_should_stop(text,text,uuid), public.bridge_finish_job(text,text,uuid,text,text,text,text,jsonb,text,text),
      public.bridge_checkpoint(text,text,uuid,text,text,text) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.bridge_devices, public.bridge_control, public.bridge_jobs, public.bridge_job_log, public.bridge_notes from anon;
    grant execute on function public.bridge_heartbeat(text,text,jsonb), public.bridge_claim_job(text,text,jsonb),
      public.bridge_job_should_stop(text,text,uuid),
      public.bridge_finish_job(text,text,uuid,text,text,text,text,jsonb,text,text),
      public.bridge_checkpoint(text,text,uuid,text,text,text) to anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.bridge_devices, public.bridge_control, public.bridge_jobs, public.bridge_job_log, public.bridge_notes from authenticated;
    revoke execute on function public.bridge_heartbeat(text,text,jsonb), public.bridge_status() from authenticated;
  end if;
end $$;

-- ---- From the ideas book (decision 0075) ----
-- Named route setups (Zaph, 17 Nov 2026): a named set of runs in the order they're done ("Dad's Route": 6 then 10),
-- picked with one tap in My runs. Shared with the family; anyone can add one; the maker or a dispatcher changes it.
create table if not exists public.route_setups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (char_length(name) between 1 and 40),
  routes     text[] not null check (cardinality(routes) between 1 and 20),
  created_by text not null,
  created_at timestamptz not null default now()
);
alter table public.route_setups enable row level security;
drop policy if exists route_setups_read on public.route_setups;
create policy route_setups_read on public.route_setups for select to authenticated using (public.is_member());
drop policy if exists route_setups_add on public.route_setups;
create policy route_setups_add on public.route_setups for insert to authenticated with check (public.is_member() and created_by = public.my_name());
drop policy if exists route_setups_change on public.route_setups;
create policy route_setups_change on public.route_setups for update to authenticated
  using (created_by = public.my_name() or public.is_dispatcher()) with check (public.is_member());
drop policy if exists route_setups_drop on public.route_setups;
create policy route_setups_drop on public.route_setups for delete to authenticated using (created_by = public.my_name() or public.is_dispatcher());

-- Notes on tiles (Lisa, 19 Nov 2026): one family note per address, shown on its tile ("leave by the side gate").
-- Anyone in the family can add, change or clear one; every change is kept in dispatch_history.
create table if not exists public.tile_notes (
  address_key text primary key,
  note        text not null check (char_length(note) between 1 and 200),
  updated_by  text not null,
  updated_at  timestamptz not null default now()
);
alter table public.tile_notes enable row level security;
drop policy if exists tile_notes_read on public.tile_notes;
create policy tile_notes_read on public.tile_notes for select to authenticated using (public.is_member());
drop policy if exists tile_notes_add on public.tile_notes;
create policy tile_notes_add on public.tile_notes for insert to authenticated with check (public.is_member() and updated_by = public.my_name());
drop policy if exists tile_notes_change on public.tile_notes;
create policy tile_notes_change on public.tile_notes for update to authenticated using (public.is_member()) with check (updated_by = public.my_name());
drop policy if exists tile_notes_drop on public.tile_notes;
create policy tile_notes_drop on public.tile_notes for delete to authenticated using (public.is_member());
drop trigger if exists tile_notes_log on public.tile_notes;
create trigger tile_notes_log after insert or update or delete on public.tile_notes for each row execute function public.log_dispatch_change();
