import { EVENT_COLUMNS } from '../js/store.js';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
// Stand-ins for what Supabase provides.
await db.exec(`
create role authenticated; create schema auth;
create table auth.ctx(email text, uid uuid);
insert into auth.ctx values ('mike@example.com','11111111-1111-1111-1111-111111111111');
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email', email) from auth.ctx $$;
create function auth.uid() returns uuid language sql stable as $$ select uid from auth.ctx $$;
create function auth.role() returns text language sql stable as $$ select case when current_setting('role', true) = 'authenticated' then 'authenticated' end $$;
create publication supabase_realtime;
grant usage on schema auth to authenticated; grant select on auth.ctx to authenticated;
`);
const sql = fs.readFileSync('sql/schema.sql','utf8');
await db.exec(sql); await db.exec(sql); // must be re-runnable
await db.exec(`insert into members values ('mike@example.com','Mike');
grant all on all tables in schema public to authenticated;`);
await db.exec(`set role authenticated;`);
const ins = await db.query(`insert into runs(route, delivery_date) values ('HOWICK06','2026-11-06') returning id`);
const id = ins.rows[0].id; console.log('run id', id);
await db.query(`insert into run_lines(run_id,line_key,seq,block,street,number,pub,qty,address_key) values ($1,'K|A|1|NZH',1,1,'A','1','NZH',1,'K|A|1')`, [id]);
await db.query(`insert into tap_events(id,run_id,line_key,address_key,route,done,device_time,lat,lng,accuracy_m) values (gen_random_uuid(),$1,'K|A|1|NZH','K|A|1','HOWICK06',true,now(),-36.9,174.9,8)`, [id]);
console.log('status', (await db.query('select done, user_name from line_status')).rows);
console.log('positions', (await db.query('select * from address_positions')).rows);
try { await db.query(`update tap_events set done=false`); const r = await db.query('select done from tap_events'); console.log('update blocked:', r.rows[0].done === true); } catch(e){ console.log('update error', e.message); }
try { await db.query(`insert into tap_events(id,run_id,line_key,address_key,route,done,device_time,user_id) values (gen_random_uuid(),$1,'x','x','x',true,now(),'22222222-2222-2222-2222-222222222222')`, [id]); console.log('FAIL spoof allowed'); } catch(e){ console.log('spoofed user blocked:', e.message.slice(0,60)); }
try { await db.query(`delete from runs where id=$1`, [id]); console.log('FAIL run with taps deleted'); } catch(e){ console.log('run with taps protected:', e.message.slice(0,60)); }
await db.query(`insert into route_sequences(route, address_keys, updated_by) values ('HOWICK06','["a","b"]','Mike') on conflict (route) do update set address_keys = excluded.address_keys, updated_by = excluded.updated_by, updated_at = now()`);
await db.query(`insert into route_sequences(route, address_keys, updated_by) values ('HOWICK06','["b","a"]','Lisa') on conflict (route) do update set address_keys = excluded.address_keys, updated_by = excluded.updated_by, updated_at = now()`);
await db.query(`delete from route_sequences where route='HOWICK06'`);
console.log('sequence history:', (await db.query('select address_keys, updated_by from route_sequence_history order by id')).rows.map((r) => `${r.updated_by}:${JSON.stringify(r.address_keys)}`).join(' | '));
await db.query(`insert into access_codes(route, section_id, code, updated_by) values ('HOWICK08','MONACO','1234#','Mike') on conflict (route, section_id) do update set code = excluded.code, updated_by = excluded.updated_by`);
await db.query(`insert into access_codes(route, section_id, code, updated_by) values ('HOWICK08','MONACO','3793#','Mike') on conflict (route, section_id) do update set code = excluded.code, updated_by = excluded.updated_by`);
console.log('code now:', (await db.query(`select code from access_codes`)).rows[0].code, '| history:', (await db.query('select code from access_code_history order by id')).rows.map((r) => r.code).join(' -> '));
await db.exec(`reset role; update auth.ctx set email='stranger@example.com'; set role authenticated;`);
console.log('non-member sees sequences:', (await db.query('select count(*)::int n from route_sequence_history')).rows[0].n);
console.log('non-member sees codes:', (await db.query('select count(*)::int n from access_codes')).rows[0].n);
console.log('non-member sees runs:', (await db.query('select count(*)::int n from runs')).rows[0].n);
try { await db.query(`insert into runs(route, delivery_date) values ('X','2026-11-07')`); console.log('FAIL stranger insert'); } catch(e){ console.log('stranger insert blocked'); }

// ---- dispatch: roles, register, locations (assertions fail the run) ----
const check = (name, ok) => { console.log(ok ? '✓' : '✗', name); if (!ok) process.exitCode = 1; };
const as = async (email) => db.exec(`reset role; update auth.ctx set email='${email}'; set role authenticated;`);
await db.exec(`reset role; insert into members (email, display_name, role) values ('lisa@example.com','Lisa','driver') on conflict do nothing; update members set role='dispatcher' where email='mike@example.com';`);
check('existing address registered by backfill or trigger', (await db.query(`select routes from addresses where address_key='K|A|1'`)).rows[0]?.routes?.includes('HOWICK06'));
await as('lisa@example.com');
const run2 = (await db.query(`insert into runs(route, delivery_date) values ('HOWICK10','2026-11-09') returning id`)).rows[0].id;
await db.query(`insert into run_lines(run_id,line_key,seq,block,street,number,pub,qty,address_key) values ($1,'K|A|1',1,1,'A','1','NZH',1,'K|A|1'),($1,'K|B|2',2,1,'B','2','NZH',1,'K|B|2')`, [run2]);
const reg = (await db.query(`select address_key, routes, first_seen::text, last_seen::text from addresses order by 1`)).rows;
check('a driver loading a sheet registers its addresses', reg.length === 2 && reg[0].routes.join() === 'HOWICK06,HOWICK10' && reg[0].first_seen === '2026-11-06' && reg[0].last_seen === '2026-11-09');
let blocked = false; try { await db.query(`insert into location_groups(name) values ('X')`); } catch { blocked = true; }
check('a driver cannot create locations', blocked);
await db.query(`update addresses set notes='hack' where address_key='K|B|2'`);
check('a driver cannot change the register', (await db.query(`select notes from addresses where address_key='K|B|2'`)).rows[0].notes === null);
await db.query(`update members set role='dispatcher' where email='lisa@example.com'`);
check('a driver cannot promote themselves', (await db.query(`select role from members where email='lisa@example.com'`)).rows[0].role === 'driver');
await as('mike@example.com');
const g = (await db.query(`insert into location_groups(name, kind) values ('Bruce McLaren Village','village') returning id`)).rows[0].id;
const o = (await db.query(`insert into operating_locations(group_id, name, lat, lng) values ($1,'Monaco car park',-36.9,174.9) returning id`, [g])).rows[0].id;
const s = (await db.query(`insert into service_locations(operating_location_id, name, kind) values ($1,'Monaco Bank 1','bank') returning id`, [o])).rows[0].id;
await db.query(`update addresses set operating_location_id=$1, service_location_id=$2, validated_at=now(), validated_by='Mike' where address_key='K|B|2'`, [o, s]);
check('a dispatcher assigns an address', (await db.query(`select operating_name, service_name from address_register where address_key='K|B|2'`)).rows[0].service_name === 'Monaco Bank 1');
await db.query(`insert into location_policies(group_id, kind, note, lat, lng) values ($1,'entry_point','Enter from Bruce McLaren Rd',-36.9,174.9)`, [g]);
await db.query(`insert into location_policies(group_id, kind, time_from, time_to) values ($1,'time_window','05:00','07:00')`, [g]);
blocked = false; try { await db.query(`insert into location_policies(group_id, operating_location_id, kind) values ($1,$2,'access_note')`, [g, o]); } catch { blocked = true; }
check('a policy has exactly one target', blocked);
check('changes are logged', (await db.query(`select count(*)::int n from dispatch_history where entity in ('location_groups','addresses','location_policies')`)).rows[0].n >= 4);
blocked = false; try { await db.query(`update members set role='driver' where email='mike@example.com'`); } catch (e) { blocked = /at least one active dispatcher/.test(e.message); }
check('the last dispatcher cannot be removed', blocked);
await db.query(`update members set active=false where email='lisa@example.com'`);
await as('lisa@example.com');
check('a deactivated member sees nothing', (await db.query('select count(*)::int n from runs')).rows[0].n === 0);

// ---- complaints register ----
await db.exec(`reset role; update auth.ctx set email='mike@example.com'; set role authenticated;`);
const r9 = (await db.query(`insert into runs(route, delivery_date) values ('HOWICK13','2026-11-09') returning id`)).rows[0].id;
const r10 = (await db.query(`insert into runs(route, delivery_date) values ('HOWICK13','2026-11-10') returning id`)).rows[0].id;
const r7 = (await db.query(`insert into runs(route, delivery_date) values ('HOWICK13','2026-11-07') returning id`)).rows[0].id;
// Lisa ticked 70 Broomfields on Sat 7 Nov
await db.query(`insert into tap_events(id,run_id,line_key,address_key,route,done,device_time,user_name,lat,lng,accuracy_m) values (gen_random_uuid(),$1,'K|BROOMFIELDS ROAD|70','K|BROOMFIELDS ROAD|70','HOWICK13',true,'2026-11-07T17:42:00Z','Lisa',-36.9,174.9,6)`, [r7]);
const flag = (on, raw) => JSON.stringify([{ type: 'complaint', text: `Missed delivery on Sat ${on.slice(8) * 1} Nov (NZH, 7-day subscriber)`, kind: 'MISSED', on, pub: 'NZH', service: 'WKLY7', raw }]);
for (const rid of [r9, r10]) await db.query(`insert into run_lines(run_id,line_key,seq,block,street,number,pub,qty,address_key,flags) values ($1,'K|BROOMFIELDS ROAD|70',1,1,'BROOMFIELDS ROAD','70','NZH',1,'K|BROOMFIELDS ROAD|70',$2)`, [rid, flag('2026-11-07', '0711')]);
let creg = (await db.query(`select * from complaint_register`)).rows;
check('a complaint on two sheets is registered once', creg.length === 1 && creg[0].reported_on.toISOString().slice(0, 10) === '2026-11-09');
check('it knows who ticked that delivery', creg[0].delivered_by === 'Lisa' && creg[0].delivered === true);
// a later complaint from the same customer, loaded the old way (text only)
const r12 = (await db.query(`insert into runs(route, delivery_date) values ('HOWICK13','2026-11-12') returning id`)).rows[0].id;
await db.query(`insert into run_lines(run_id,line_key,seq,block,street,number,pub,qty,address_key,flags) values ($1,'K|BROOMFIELDS ROAD|70',1,1,'BROOMFIELDS ROAD','70','NZH',1,'K|BROOMFIELDS ROAD|70','[{"type":"complaint","text":"Missed delivery on Wed 11 Nov (NZH, 7-day subscriber)"}]')`, [r12]);
creg = (await db.query(`select happened_on::text, kind, publication, customer_complaints::int, customer_complaint_no::int, previous_complaint_on::text, delivered_by from complaint_register order by happened_on`)).rows;
check('older text-only complaints are understood', creg.length === 2 && creg[1].happened_on === '2026-11-11' && creg[1].kind === 'MISSED' && creg[1].publication === 'NZH', JSON.stringify(creg[1]));
check('customer history: 2nd complaint, previous 7 Nov', creg[1].customer_complaints === 2 && creg[1].customer_complaint_no === 2 && creg[1].previous_complaint_on === '2026-11-07');
check('no tick recorded for 11 Nov', creg[1].delivered_by === null);
await db.query(`update complaints set status='disputed', notes='Photo shows paper in box' where happened_on='2026-11-07'`);
check('a dispatcher can mark a complaint disputed', (await db.query(`select status from complaints where happened_on='2026-11-07'`)).rows[0].status === 'disputed');
await db.exec(`reset role; update members set active=true where email='lisa@example.com'; update auth.ctx set email='lisa@example.com'; set role authenticated;`);
await db.query(`update complaints set status='closed'`);
check('a driver cannot change complaint status', (await db.query(`select count(*)::int n from complaints where status='closed'`)).rows[0].n === 0);

// ---- governance baseline: policy dates and clashes, delivery outcomes ----
await as('mike@example.com');
await db.query(`update addresses set operating_location_id=$1, service_location_id=$2 where address_key='K|A|1'`, [o, s]);
const addPol = (row) => db.query(`insert into location_policies(${Object.keys(row).join(',')}) values (${Object.keys(row).map((_, i) => `$${i + 1}`).join(',')}) returning id`, Object.values(row));
const refused = async (row) => { try { await addPol(row); return null; } catch (e) { return e.message; } };
const p1 = (await addPol({ group_id: g, kind: 'not_before', time_from: '05:30' })).rows[0].id;
let msg = await refused({ group_id: g, kind: 'not_before', time_from: '06:00' });
check('a second "no service before" on the same group is refused', /clashes with an existing policy: No service before 05:30 on Bruce McLaren Village/.test(msg || ''), msg);
msg = await refused({ address_key: 'K|A|1', kind: 'not_before', time_from: '06:00' });
check('a different rule on an address inside the group is refused (no hidden precedence)', !!msg && /05:30/.test(msg), msg);
check('the same rule on that address is not a clash', !(await refused({ address_key: 'K|A|1', kind: 'not_before', time_from: '05:30' })));
check('notes never clash', !(await refused({ group_id: g, kind: 'access_note', note: 'Gate code at reception' })) && !(await refused({ group_id: g, kind: 'access_note', note: 'Watch for residents walking' })));
check('different days do not clash', !(await refused({ operating_location_id: o, kind: 'speed_limit', speed_kmh: 10, days: ['Sat'] })) && !(await refused({ operating_location_id: o, kind: 'speed_limit', speed_kmh: 20, days: ['Mon', 'Tue'] })));
await db.query(`update location_policies set valid_to='2026-11-30' where kind='not_before'`);
check('non-overlapping dates do not clash', !(await refused({ group_id: g, kind: 'not_before', time_from: '06:00', valid_from: '2026-12-01' })));
msg = await refused({ group_id: g, kind: 'time_window', time_from: '06:00', time_to: '05:00', valid_from: '2026-12-02', valid_to: '2026-12-01' });
check('an end date before the start date is refused', /end date is before/.test(msg || ''));
await db.query(`update location_policies set active=false where id=$1`, [p1]);
check('a switched-off policy is not current', !(await db.query(`select 1 from current_policies where id=$1`, [p1])).rows.length);
check('no clashes left over', (await db.query(`select count(*)::int n from policy_clashes`)).rows[0].n === 0);
// tap outcomes: a tick, then "couldn't deliver" as a new entry; history kept
await db.query(`insert into tap_events(id,run_id,line_key,address_key,route,done,device_time,user_name) values (gen_random_uuid(),$1,'K|B|2','K|B|2','HOWICK10',true,'2026-11-08T17:00:00Z','Mike')`, [run2]);
await db.query(`insert into tap_events(id,run_id,line_key,address_key,route,done,device_time,user_name,outcome,reason,qty_delivered) values (gen_random_uuid(),$1,'K|B|2','K|B|2','HOWICK10',true,'2026-11-08T17:00:05Z','Mike','futile','Gate locked',0)`, [run2]);
let ls = (await db.query(`select outcome, reason, done from line_status where run_id=$1 and line_key='K|B|2'`, [run2])).rows[0];
check('latest entry is the outcome: couldn\'t deliver, gate locked', ls.outcome === 'futile' && ls.reason === 'Gate locked' && ls.done === true);
check('the original tick is still in the history', (await db.query(`select count(*)::int n from tap_events where line_key='K|B|2'`)).rows[0].n === 2);
check('older ticks read as delivered', (await db.query(`select outcome from line_status where run_id=$1 and line_key='K|A|1|NZH'`, [id])).rows[0].outcome === 'delivered');
blocked = false; try { await db.query(`insert into tap_events(id,run_id,line_key,address_key,route,done,device_time,outcome) values (gen_random_uuid(),$1,'x','x','x',true,now(),'lost')`, [run2]); } catch { blocked = true; }
check('unknown outcomes are refused', blocked);
check('runs keep a sheet fingerprint', (await db.query(`select source_hash from runs limit 1`)).fields.some((f) => f.name === 'source_hash'));

// ---- the app's sync sends exactly the tap columns the database has ----
const tapCols = (await db.query(`select column_name from information_schema.columns where table_name='tap_events'`)).rows.map((r) => r.column_name);
check('every field the app sends is a tap_events column', EVENT_COLUMNS.every((c) => tapCols.includes(c)));
check('every tap_events column (bar user and server time) is sent by the app', tapCols.filter((c) => !['user_id', 'server_time'].includes(c)).every((c) => EVENT_COLUMNS.includes(c)));

// ---- closing a run in Dispatch ----
await as('lisa@example.com');
blocked = false; try { await db.query(`update runs set driver='Lisa' where id=$1`, [run2]); } catch { blocked = true; }
check('a driver cannot close a run or set its driver', blocked);
blocked = false; try { await db.query(`insert into tap_events(id,run_id,line_key,address_key,route,done,device_time,user_id,method) values (gen_random_uuid(),$1,'K|C|3','K|C|3','HOWICK10',true,now(),'11111111-1111-1111-1111-111111111111','paper')`, [run2]); } catch { blocked = true; }
check('a driver cannot enter paper ticks', blocked);
await as('mike@example.com');
await db.query(`insert into tap_events(id,run_id,line_key,address_key,route,done,device_time,user_name,outcome,method,device) values (gen_random_uuid(),$1,'K|C|3','K|C|3','HOWICK10',true,'2026-11-08T18:05:00Z','Lisa','delivered','paper','Dispatch: paper run sheet')`, [run2]);
await db.query(`update runs set driver='Lisa', closed_at='2026-11-08T18:05:00Z', closed_by='Mike', close_method='paper' where id=$1`, [run2]);
check('a dispatcher closes a run on paper, ticks show as paper', (await db.query(`select method, user_name from line_status where run_id=$1 and line_key='K|C|3'`, [run2])).rows[0].method === 'paper');
check('closing is in the dispatch history', (await db.query(`select count(*)::int n from dispatch_history where entity='runs' and action='close' and entity_id=$1`, [run2])).rows[0].n === 1);
await db.query(`update runs set closed_at=null, closed_by=null, close_method=null where id=$1`, [run2]);
check('reopening is in the dispatch history', (await db.query(`select count(*)::int n from dispatch_history where entity='runs' and action='reopen'`)).rows[0].n === 1);
