import { EVENT_COLUMNS, DUTY_COLUMNS, SupabaseStore } from '../js/store.js';
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
const as = async (email) => db.exec(`reset role; update auth.ctx set email='${email}', uid=md5('${email}')::uuid; set role authenticated;`);
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
blocked = false; try { await db.query(`insert into tap_events(id,run_id,line_key,address_key,route,done,device_time,user_id,method) values (gen_random_uuid(),$1,'K|C|3','K|C|3','HOWICK10',true,now(),auth.uid(),'paper')`, [run2]); } catch { blocked = true; }
check('a driver cannot enter paper ticks', blocked);
await db.query(`insert into tap_events(id,run_id,line_key,address_key,route,done,device_time,user_id,user_name,method) values (gen_random_uuid(),$1,'K|C|9','K|C|9','HOWICK10',true,'2026-11-01T16:46:56Z',auth.uid(),'Lenny','photo')`, [run2]);
check('a driver can record a delivery at the time on its photo', (await db.query(`select method from line_status where run_id=$1 and line_key='K|C|9'`, [run2])).rows[0]?.method === 'photo');
await as('mike@example.com');
await db.query(`insert into tap_events(id,run_id,line_key,address_key,route,done,device_time,user_name,outcome,method,device) values (gen_random_uuid(),$1,'K|C|3','K|C|3','HOWICK10',true,'2026-11-08T18:05:00Z','Lisa','delivered','paper','Dispatch: paper run sheet')`, [run2]);
await db.query(`update runs set driver='Lisa', closed_at='2026-11-08T18:05:00Z', closed_by='Mike', close_method='paper' where id=$1`, [run2]);
check('a dispatcher closes a run on paper, ticks show as paper', (await db.query(`select method, user_name from line_status where run_id=$1 and line_key='K|C|3'`, [run2])).rows[0].method === 'paper');
check('closing is in the dispatch history', (await db.query(`select count(*)::int n from dispatch_history where entity='runs' and action='close' and entity_id=$1`, [run2])).rows[0].n === 1);
await db.query(`update runs set closed_at=null, closed_by=null, close_method=null where id=$1`, [run2]);
check('reopening is in the dispatch history', (await db.query(`select count(*)::int n from dispatch_history where entity='runs' and action='reopen'`)).rows[0].n === 1);

// ---- progress per run ----
const rp = (await db.query(`select * from run_progress where run_id=$1`, [run2])).rows[0];
check('run progress counts done stops in the database', rp && Number(rp.done) >= 1 && 'not_delivered' in rp && 'paper' in rp);

// ---- directions: the stop's GPS beats a learned letterbox position ----
await db.query(`update operating_locations set lat=-36.9, lng=174.9 where id=$1`, [o]);
const dest = (await db.query(`select source, lat from address_destinations where address_key='K|A|1'`)).rows[0];
check('directions go to the stop set in Dispatch when it has GPS', dest?.source === 'stop' && Number(dest.lat) === -36.9);

// ---- the letterbox learned from real ticks (decision 0039) ----
const lp = async (key, pts, extra = '') => { for (const [la, ln] of pts) await db.query(`insert into tap_events(id,run_id,line_key,address_key,route,done,device_time,lat,lng,accuracy_m,user_id${extra ? ',method' : ''}) values (gen_random_uuid(),$1,$2,$2,'HOWICK06',true,now(),$3,$4,6,auth.uid()${extra ? `,'${extra}'` : ''})`, [id, key, la, ln]); };
const learned = async (key) => (await db.query(`select taps, all_taps, lat, lng from address_positions where address_key=$1`, [key])).rows[0];
await lp('K|L|1', [[-36.9100, 174.9100]]);
check('one tick alone is not enough to learn where a letterbox is', !(await learned('K|L|1')));
await lp('K|L|2', [[-36.92000, 174.92000], [-36.92003, 174.92002], [-36.92001, 174.91998], [-36.93500, 174.94000]]);
{ const p = await learned('K|L|2'); check('a tick made somewhere else can’t drag the learned point away', p && Number(p.taps) === 3 && Number(p.all_taps) === 4 && Math.abs(Number(p.lat) + 36.92001) < 0.00003 && Math.abs(Number(p.lng) - 174.92) < 0.00003, JSON.stringify(p)); }
await lp('K|L|3', [[-36.9300, 174.9300], [-36.9340, 174.9340], [-36.9380, 174.9380], [-36.9420, 174.9420]]);
check('ticks that don’t agree teach nothing', !(await learned('K|L|3')));
await lp('K|L|4', [[-36.9500, 174.9500], [-36.9500, 174.9500]], 'correction');
check('corrected and photo records don’t teach positions', !(await learned('K|L|4')));

// ---- each person's own order ----
await as('lisa@example.com');
await db.query(`insert into person_sequences(route, user_id, address_keys, updated_by) values ('HOWICK06', auth.uid(), '["K|B|2","K|A|1"]', 'Lisa')`);
check('a driver saves their own order', (await db.query(`select count(*)::int n from person_sequences where route='HOWICK06'`)).rows[0].n === 1);
blocked = false; try { await db.query(`insert into person_sequences(route, user_id, address_keys) values ('HOWICK06', '22222222-2222-2222-2222-222222222222', '[]')`); } catch { blocked = true; }
check('nobody can save an order in someone else’s name', blocked);

// ---- On Duty ----
await as('lisa@example.com');
await db.query(`insert into duty_events(id, user_name, state, device_time) values (gen_random_uuid(), 'Lisa', 'on_duty', now())`);
check('a driver goes on duty', (await db.query(`select count(*)::int n from duty_events where user_name='Lisa'`)).rows[0].n === 1);
blocked = false; try { await db.query(`update duty_events set state='off_duty'`); const n = (await db.query(`select count(*)::int n from duty_events where state='off_duty'`)).rows[0].n; blocked = n === 0; } catch { blocked = true; }
check('duty changes are never edited', blocked);
blocked = false; try { await db.query(`insert into app_settings(key, value) values ('depot', '{"lat":-36.9,"lng":174.9}')`); } catch { blocked = true; }
check('only a dispatcher sets the depot', blocked);
await as('mike@example.com');
await db.query(`insert into app_settings(key, value, updated_by) values ('depot', '{"lat":-36.9,"lng":174.9,"radius_m":150}', 'Mike')`);
check('a dispatcher sets the depot', (await db.query(`select value->>'radius_m' r from app_settings where key='depot'`)).rows[0].r === '150');
const dutyCols = (await db.query(`select column_name c from information_schema.columns where table_name='duty_events'`)).rows.map((r) => r.c);
check('every duty field the app sends is a duty_events column', DUTY_COLUMNS.every((c) => dutyCols.includes(c)));

// ---- Chat with Stan: the ideas register ----
await as('lisa@example.com');
await db.query(`insert into ideas(id, user_name, text, device_time) values (gen_random_uuid(), 'Lisa', 'Rain colours on the tiles', now())`);
check('anyone in the family can tell Stan an idea', (await db.query(`select count(*)::int n from ideas`)).rows[0].n === 1);
blocked = false; try { await db.query(`update ideas set status='done'`); blocked = (await db.query(`select count(*)::int n from ideas where status='done'`)).rows[0].n === 0; } catch { blocked = true; }
check('only a dispatcher reviews ideas', blocked);
blocked = false; try { await db.query(`insert into ideas(id, text, device_time, status) values (gen_random_uuid(), 'x', now(), 'done')`); } catch { blocked = true; }
check('a new idea always starts as new', blocked);
await as('mike@example.com');
await db.query(`update ideas set status='planned', note='With the weekly report', updated_by='Mike'`);
check('a dispatcher sets an idea to planned', (await db.query(`select status from ideas`)).rows[0].status === 'planned');
{
  const { IDEA_COLUMNS } = await import('../js/store.js');
  const cols = (await db.query(`select column_name c from information_schema.columns where table_name='ideas'`)).rows.map((r) => r.c);
  check('every idea field the app sends is an ideas column', IDEA_COLUMNS.every((c) => cols.includes(c)));
}

// ---- Stan's Paper Run: scores ----
await as('lisa@example.com');
await db.query(`insert into game_scores(user_name, score, streets, delivered, best_streak, ended) values ('Lisa', 120, 1, 9, 4, 'complaints')`);
check('someone saves their own game score', (await db.query(`select score from game_scores where user_name='Lisa'`)).rows[0]?.score === 120);
blocked = false; try { await db.query(`insert into game_scores(user_name, score) values ('Mike', 99999)`); } catch { blocked = true; }
check('nobody can post a score under someone else’s name', blocked);
blocked = false; try { await db.query(`insert into game_scores(user_name, score) values ('Lisa', 5000000)`); } catch { blocked = true; }
check('a score has to be a believable number', blocked);
await as('mike@example.com');
check('everyone in the family can see the scores', (await db.query(`select count(*)::int n from game_scores`)).rows[0].n === 1);

// ---- people's icons ----
await as('lisa@example.com');
await db.query(`insert into avatars(user_name, kind, value) values ('Lisa', 'icon', 'rose')`);
check('someone picks their own icon', (await db.query(`select value from avatars where user_name='Lisa'`)).rows[0].value === 'rose');
blocked = false; try { await db.query(`insert into avatars(user_name, kind, value) values ('Lisa2', 'photo', 'javascript:alert(1)')`); } catch { blocked = true; }
check('a photo must be a small image made by the app, nothing else', blocked);
await as('mike@example.com');
await db.query(`update avatars set value='storm' where user_name='Lisa'`);
check('nobody changes someone else’s icon, not even a dispatcher', (await db.query(`select value from avatars where user_name='Lisa'`)).rows[0].value === 'rose');

// ---- Ping ----
await as('lisa@example.com');
blocked = false; try { await db.query(`insert into pings(target_name, asked_by) values ('Mike', 'Moana')`); } catch { blocked = true; }
check('a driver can’t ping in someone else’s name', blocked);
blocked = false; try { await db.query(`insert into pings(target_name, asked_by) values ('Lisa', 'Lisa')`); } catch { blocked = true; }
check('a driver can’t ping themselves', blocked);
await db.query(`insert into duty_events(id, user_name, state, device_time) values (gen_random_uuid(), 'Lisa', 'off_duty', now() + interval '1 second')`);
blocked = false; try { await db.query(`insert into pings(target_name, asked_by) values ('Mike', 'Lisa')`); } catch { blocked = true; }
check('off duty, a driver can’t ping (decision 0071)', blocked);
await db.query(`insert into duty_events(id, user_name, state, device_time) values (gen_random_uuid(), 'Lisa', 'on_duty', now() + interval '2 seconds')`);
await db.query(`insert into pings(target_name, asked_by) values ('Mike', 'Lisa')`);
check('on duty, a driver can ping someone else and read the answer (decision 0071)', (await db.query(`select count(*)::int n from pings where asked_by='Lisa'`)).rows[0].n === 1);
await db.exec(`reset role; delete from pings;`); await as('mike@example.com');
await as('mike@example.com');
await db.query(`insert into pings(target_name, asked_by) values ('Lisa', 'Mike')`);
await db.query(`update pings set state='answered', lat=-36.9, lng=174.9`);
check('a dispatcher can’t answer a ping for someone else', (await db.query(`select state from pings`)).rows[0].state === 'asked');
await as('lisa@example.com');
await db.query(`update pings set state='answered', lat=-36.9, lng=174.9, answered_at=now()`);
check('the pinged driver’s phone answers with where it is', (await db.query(`select state from pings`)).rows[0].state === 'answered');

// ---- Morning watch: run times ----
{
  const rt = (await db.query(`select count(*)::int n, bool_and(first_tick <= last_tick) ok from run_times`)).rows[0];
  check('run_times gives the first and last app tick of each run', rt.n >= 1 && rt.ok);
  check('paper ticks don’t count towards a run’s time', (await db.query(`select count(*)::int n from run_times t where not exists (select 1 from tap_events e where e.run_id = t.run_id and e.done and e.method is distinct from 'paper')`)).rows[0].n === 0);
}
// ---- The shared store's fallbacks exist (20 Nov 2026: Got it was silently lost because super.markNoticesSeen wasn't there) ----
{
  const src = fs.readFileSync(new URL('../js/store.js', import.meta.url), 'utf8');
  const shared = src.slice(src.indexOf('export class SupabaseStore'));
  const parent = Object.getPrototypeOf(SupabaseStore.prototype);
  const missing = [...new Set([...shared.matchAll(/super\.(\w+)\(/g)].map((m) => m[1]))].filter((m) => typeof parent[m] !== 'function');
  const own = [...new Set([...shared.matchAll(/this\.(my\w+)\(/g)].map((m) => m[1]))].filter((m) => typeof SupabaseStore.prototype[m] !== 'function');
  check('every fallback the shared store calls on its parent exists', missing.length === 0 && own.length === 0);
  // Lesson L-011 (22 Nov 2026): the app called store methods that only the demo store had. Every call the app makes must exist live.
  const { LocalStore } = await import('../js/store.js');
  const appSrc = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const called = [...new Set([...appSrc.matchAll(/app\.store\.(\w+)\(/g)].map((m) => m[1]))];
  const notLive = called.filter((m) => typeof SupabaseStore.prototype[m] !== 'function');
  const LIVE_ONLY = ['changePassword'];   // only offered when signed in
  const notDemo = called.filter((m) => typeof LocalStore.prototype[m] !== 'function' && !LIVE_ONLY.includes(m));
  check(`every store method the app calls exists in the live app and in demo mode${notLive.length || notDemo.length ? ` (missing live: ${notLive.join(', ') || 'none'}; demo: ${notDemo.join(', ') || 'none'})` : ''}`, called.length > 40 && notLive.length === 0 && notDemo.length === 0);
  if (missing.length || own.length) console.log('  missing:', [...missing, ...own].join(', '));
}

// ---- Voice-to-Laptop Bridge, phase 3 (decision 0073): caps, checkpoints, pause-with-Allow, big builds ----
{
  // The test database has no pgcrypto: a stand-in crypt() that accepts the secret 's'.
  await db.exec(`reset role; create schema if not exists extensions;
    create or replace function extensions.crypt(p text, h text) returns text language sql as $$ select case when p = 's' then h else 'no' end $$;
    insert into bridge_devices(device, label, secret_hash) values ('lap', 'Laptop', 'h') on conflict do nothing;
    delete from bridge_jobs; delete from bridge_job_log; update bridge_control set paused = false, max_jobs_per_day = 20, max_minutes_per_day = 300;`);
  const one = async (q, p) => (await db.query(q, p)).rows[0];
  const claim = async () => (await db.query(`select id, code, resume_count, checkpoint from bridge_claim_job('lap','s')`)).rows[0];
  const code1 = (await one(`select bridge_enqueue(null, 'ping', 'ping') c`)).c;
  const j1 = await claim();
  check('bridge: the laptop claims a queued job', j1?.code === code1);
  check('bridge: a checkpoint is recorded for the running job', (await one(`select bridge_checkpoint('lap','s',$1,'step 1: schema','tables made','abc123') ok`, [j1.id])).ok === true);
  await db.query(`select bridge_finish_job('lap','s',$1,'timed_out', null, 'out of turns')`, [j1.id]);
  const p1 = await one(`select status, held_reason from bridge_jobs where id=$1`, [j1.id]);
  check('bridge: out of time after a checkpoint pauses the job instead of killing it', p1.status === 'paused' && /step 1: schema/.test(p1.held_reason));
  const allowed = (await one(`select bridge_allow($1, 90) a`, [code1])).a;
  const j1b = await claim();
  check('bridge: Allow carries a paused job on from its checkpoint, with more minutes', /carries on from "step 1: schema"/.test(allowed) && /90 minutes/.test(allowed) && j1b?.resume_count === 1 && j1b.checkpoint.step === 'step 1: schema');
  await db.query(`select bridge_finish_job('lap','s',$1,'done','built')`, [j1b.id]);
  const code2 = (await one(`select bridge_enqueue(null, 'ping', 'ping') c`)).c; const j2 = await claim();
  await db.query(`select bridge_finish_job('lap','s',$1,'timed_out')`, [j2.id]);
  check('bridge: out of time with no checkpoint is still timed out', (await one(`select status from bridge_jobs where id=$1`, [j2.id])).status === 'timed_out');
  const big = (await one(`select bridge_enqueue(null, 'a big build', 'ping', 'voice', false, 'Mike', 45, 80, true, 120) c`)).c;
  check('bridge: a big build waits for Mike to approve its budget', (await one(`select status, max_minutes from bridge_jobs where code=$1`, [big])).status === 'awaiting_allow');
  let bad = false; try { await db.query(`select bridge_enqueue(null, 'big', 'ping', 'voice', false, 'Mike', 45, 80, true, null)`); } catch { bad = true; }
  check('bridge: a big build has to say how long it will take', bad);
  await db.query(`select bridge_caps(2, 300)`);
  const code3 = (await one(`select bridge_enqueue(null, 'ping', 'ping') c`)).c;
  check('bridge: over the daily job cap, a new job waits', !(await claim()) && (await one(`select over_cap from bridge_status()`)).over_cap === true);
  await db.query(`select bridge_allow($1)`, [big]);
  const jb = await claim();
  check('bridge: a big build Mike approved still goes when over the cap', jb?.code === big);
  await db.query(`select bridge_finish_job('lap','s',$1,'done')`, [jb.id]);
  check('bridge: the rest waits until tomorrow, and the status says why', !(await claim()) && (await one(`select status from bridge_jobs where code=$1`, [code3])).status === 'queued');
  check('bridge: the wrong secret can’t checkpoint', (await one(`select bridge_checkpoint('lap','x',$1,'step') ok`, [jb.id])).ok === false);
  // ---- Phase 4: shared notes (decision 0076) ----
  const n1 = (await one(`select bridge_note('decision', array['STB',' stb '], 'Caps stay at 20 jobs and 300 minutes a day', 'voice') id`)).id;
  await one(`select bridge_note('status', array['cars'], 'Watching three EVs on Trade Me', 'schedule') id`);
  check('bridge: a note is stored with tidy topics', (await one(`select topics from bridge_notes where id=$1`, [n1])).topics.join() === 'stb');
  check('bridge: status notes expire on their own; decisions stay', (await one(`select count(*)::int n from bridge_notes where kind='status' and expires_at is not null`)).n === 1 && (await one(`select expires_at from bridge_notes where id=$1`, [n1])).expires_at === null);
  check('bridge: reading by topic gives only that topic', (await db.query(`select * from bridge_notes_for(array['STB'])`)).rows.length === 1);
  const n2 = (await one(`select bridge_note('decision', array['stb'], 'Caps now 25 jobs a day', 'chat', 'Mike', null, $1::uuid) id`, [n1])).id;
  check('bridge: a newer note retires the one it supersedes', (await db.query(`select id from bridge_notes_for(array['stb'])`)).rows.map((r) => r.id).join() === n2);
  await db.query(`select bridge_caps(20, 300)`); await db.exec(`delete from bridge_jobs where status in ('queued', 'awaiting_allow')`);
  const jn = (await one(`select bridge_enqueue('sandbox', 'make a file', 'claude') c`)).c; const jj = await claim();
  await db.query(`select bridge_finish_job('lap','s',$1,'done','Made hello.md')`, [jj.id]);
  check('bridge: a laptop job’s result becomes a note everyone can read', (await db.query(`select body, ref from bridge_notes_for(array['sandbox'])`)).rows[0]?.ref === jn);
  await db.query(`select bridge_caps(50, 5000)`);
  const jp = (await one(`select bridge_enqueue('sandbox', 'two steps', 'claude') c`)).c; const jq = await claim();
  await db.query(`select bridge_checkpoint('lap','s',$1,'Step 1')`, [jq.id]); await db.query(`select bridge_finish_job('lap','s',$1,'timed_out','Got to step 1')`, [jq.id]);
  await db.query(`select bridge_allow($1)`, [jp]); const jr = await claim(); await db.query(`select bridge_finish_job('lap','s',$1,'done','Both steps done')`, [jr.id]);
  check('bridge: a job paused then finished leaves one live note, its latest', (await db.query(`select body from bridge_notes_for(array['sandbox']) where ref = $1`, [jp])).rows.map((r) => r.body).join() === 'done: Both steps done');
  // ---- Phase 5: tidy-up and weighting (decision 0077) ----
  await db.exec(`delete from bridge_notes`);
  const st = async (body, src, at) => { const id = (await one(`select bridge_note('status', array['cars'], $1, $2) id`, [body, src])).id; if (at) await db.query(`update bridge_notes set created_at = $2 where id = $1`, [id, at]); return id; };
  await st('Watching three electric cars on Trade Me under budget', 'schedule', new Date(Date.now() - 2 * 864e5).toISOString());
  const s2 = await st('Watching three electric cars on Trade Me under budget today', 'voice');
  const live = (await db.query(`select * from bridge_notes_for(array['cars'])`)).rows;
  check('bridge: a near-duplicate replaces the older note instead of piling up (0077)', live.length === 1 && live[0].id === s2 && live[0].repeats === 1);
  check('bridge: a repeat on another day reinforces its weight', Number(live[0].weight) > 1.9);
  await st('Watching three electric cars on Trade Me under budget today again', 'voice');
  const w = Number((await db.query(`select * from bridge_notes_for(array['cars'])`)).rows[0].weight);
  check('bridge: the same session the same day doesn’t add weight (a burst isn’t priority)', w > 1.9 && w < 2.1);
  await st('Simon stage three is next after the bridge', 'chat');
  check('bridge: a different note on the same topic stays separate', (await db.query(`select * from bridge_notes_for(array['cars'])`)).rows.length === 2);
  const d1 = (await one(`select bridge_note('decision', array['bridge'], 'Caps stay at twenty jobs a day', 'chat') id`)).id;
  const d2 = (await one(`select bridge_note('decision', array['bridge'], 'Caps stay at twenty jobs a day', 'voice') id`)).id;
  check('bridge: decisions are never merged or weighted', (await db.query(`select * from bridge_notes_for(array['bridge']) where kind = 'decision'`)).rows.length === 2);
  await db.query(`select bridge_note_flag($1, $2, 'same rule twice')`, [d1, d2]);
  check('bridge: a clash is flagged on both and read first, for Mike', (await db.query(`select flag from bridge_notes_for(array['bridge'])`)).rows.slice(0, 2).every((r) => /Clashes with/.test(r.flag)));
  await db.query(`update bridge_notes set created_at = now() - interval '28 days', reinforced_at = null where kind = 'status'`);
  check('bridge: weight fades by half every 14 days unless repeated', (await db.query(`select weight from bridge_notes_for(array['cars']) order by weight desc limit 1`)).rows[0].weight < 0.6);
  await db.exec(`delete from bridge_notes; delete from bridge_jobs; delete from bridge_job_log; delete from bridge_devices; update bridge_control set max_jobs_per_day = 20, max_minutes_per_day = 300; set role authenticated;`);
}

// ---- From the ideas book (decision 0075) ----
{
  await as('lisa@example.com');
  await db.query(`insert into route_setups(name, routes, created_by) values ('Mum''s Route', '{HOWICK06,HOWICK10}', 'Lisa')`);
  let blocked = false; try { await db.query(`insert into route_setups(name, routes, created_by) values ('X', '{HOWICK06}', 'Mike')`); } catch { blocked = true; }
  check('a named route is saved in your own name, not someone else’s (0075)', blocked && (await db.query(`select count(*)::int n from route_setups`)).rows[0].n === 1);
  await as('mike@example.com');
  await db.query(`insert into route_setups(name, routes, created_by) values ('Dad''s Route', '{HOWICK06}', 'Mike')`);
  await as('lisa@example.com');
  await db.query(`delete from route_setups where name = 'Dad''s Route'`);
  check('you can’t delete someone else’s named route (a dispatcher can)', (await db.query(`select count(*)::int n from route_setups where name = 'Dad''s Route'`)).rows[0].n === 1);
  await db.query(`insert into tile_notes(address_key, note, updated_by) values ('K|A|1', 'Side gate', 'Lisa')`);
  await as('mike@example.com');
  await db.query(`update tile_notes set note = 'Side gate, mind the dog', updated_by = 'Mike', updated_at = now() where address_key = 'K|A|1'`);
  check('anyone in the family can add or change a tile note, in their own name (0075)', (await db.query(`select note, updated_by from tile_notes`)).rows[0].updated_by === 'Mike');
  await db.exec(`reset role;`);
  check('tile note changes are kept in the history', (await db.query(`select count(*)::int n from dispatch_history where entity = 'tile_notes'`)).rows[0].n >= 2);
  const rid = (await db.query(`select id from runs limit 1`)).rows[0].id;
  await db.query(`delete from tap_events where run_id = $1 and line_key like 'T%'`, [rid]).catch(() => {});
  await db.query(`insert into tap_events(id,run_id,line_key,address_key,route,done,device_time) values
    (gen_random_uuid(),$1,'Tz','Tz','HOWICK06',true,'2026-01-01T03:00:00Z'), (gen_random_uuid(),$1,'Tz','Tz','HOWICK06',false,'2026-01-01T03:00:05Z')`, [rid]);
  const rt = (await db.query(`select first_tick from run_times where run_id = $1`, [rid])).rows[0];
  check('a tick undone afterwards doesn’t start the run’s clock (Zaph’s idea, 0075)', !rt || new Date(rt.first_tick) > new Date('2026-01-01T03:00:05Z'));
  await db.exec(`set role authenticated;`);
}
