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
drop policy if exists pings_read on public.pings;
create policy pings_read on public.pings for select to authenticated using (public.is_dispatcher() or target_name = public.my_name());
drop policy if exists pings_ask on public.pings;
create policy pings_ask on public.pings for insert to authenticated with check (public.is_dispatcher() and state = 'asked' and lat is null);
drop policy if exists pings_answer on public.pings;
create policy pings_answer on public.pings for update to authenticated using (target_name = public.my_name() and state = 'asked') with check (target_name = public.my_name());
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pings') then
    alter publication supabase_realtime add table public.pings;
  end if;
exception when undefined_object then null; end $$;

-- ---- Morning watch (Mike, 13 Nov 2026; docs/decisions/0028-morning-watch.md) ----
-- When each run's app ticks started and ended: how long a route usually takes, and whether it made its deadline.
create or replace view public.run_times with (security_invoker = true) as
select run_id, min(device_time) as first_tick, max(device_time) as last_tick, count(*)::int as ticks
from public.tap_events where done and method is distinct from 'paper' group by run_id;

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
