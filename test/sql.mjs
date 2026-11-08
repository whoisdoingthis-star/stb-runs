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
