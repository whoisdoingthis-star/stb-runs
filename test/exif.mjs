import assert from 'node:assert/strict';
import { readExif, photoTime, photoProof } from '../js/exif.js';
let failed = 0;
const t = (name, fn) => { try { fn(); console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n ', e.message); } };
// A tiny JPEG with EXIF, built by hand: date, optional zone, optional GPS (south, east).
function jpeg({ date = '2026:11:14 05:46:56', offset = null, gps = null, le = true } = {}) {
  const b = []; const w16 = (a, n) => (le ? a.push(n & 255, n >> 8) : a.push(n >> 8, n & 255)); const w32 = (a, n) => (le ? a.push(n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24) : a.push(n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255));
  const T = []; T.push(...(le ? [0x49, 0x49] : [0x4D, 0x4D])); w16(T, 42); w32(T, 8);
  const ifd0n = gps ? 2 : 1; const exifAt = 8 + 2 + ifd0n * 12 + 4; const exifN = offset ? 2 : 1; const dateAt = exifAt + 2 + exifN * 12 + 4; const offAt = dateAt + 20; const gpsAt = offAt + 8; const ratAt = gpsAt + 2 + 4 * 12 + 4;
  w16(T, ifd0n); w16(T, 0x8769); w16(T, 4); w32(T, 1); w32(T, exifAt);
  if (gps) { w16(T, 0x8825); w16(T, 4); w32(T, 1); w32(T, gpsAt); }
  w32(T, 0);
  w16(T, exifN); w16(T, 0x9003); w16(T, 2); w32(T, 20); w32(T, dateAt);
  if (offset) { w16(T, 0x9011); w16(T, 2); w32(T, 7); w32(T, offAt); }
  w32(T, 0);
  for (const c of date.padEnd(20, '\0')) T.push(c.charCodeAt(0));
  for (const c of (offset || '').padEnd(8, '\0')) T.push(c.charCodeAt(0));
  if (gps) {
    w16(T, 4); const asc = (tag, ch) => { w16(T, tag); w16(T, 2); w32(T, 2); T.push(ch.charCodeAt(0), 0, 0, 0); };
    asc(1, 'S'); w16(T, 2); w16(T, 5); w32(T, 3); w32(T, ratAt); asc(3, 'E'); w16(T, 4); w16(T, 5); w32(T, 3); w32(T, ratAt + 24); w32(T, 0);
    for (const x of gps) { const d = Math.floor(x); const m = Math.floor((x - d) * 60); const s = Math.round(((x - d) * 60 - m) * 60 * 1000); w32(T, d); w32(T, 1); w32(T, m); w32(T, 1); w32(T, s); w32(T, 1000); }
  }
  b.push(0xFF, 0xD8, 0xFF, 0xE0, 0, 4, 0, 0, 0xFF, 0xE1, (T.length + 8) >> 8, (T.length + 8) & 255, 0x45, 0x78, 0x69, 0x66, 0, 0, ...T, 0xFF, 0xDA, 0, 2);
  return new Uint8Array(b);
}
t('the time the photo was taken is read from the photo itself', () => assert.equal(readExif(jpeg()).taken, '2026-11-14T05:46:56'));
t('a camera with no time zone is taken as New Zealand time', () => assert.equal(photoTime(readExif(jpeg())).toISOString(), '2026-11-13T16:46:56.000Z'));
t('winter photos use winter time', () => assert.equal(photoTime(readExif(jpeg({ date: '2026:07:01 05:00:00' }))).toISOString(), '2026-06-30T17:00:00.000Z'));
t('a camera that states its zone is believed', () => assert.equal(photoTime(readExif(jpeg({ offset: '+10:00', le: false }))).toISOString(), '2026-11-13T19:46:56.000Z'));
t('where it was taken is read when the photo has it', () => { const e = readExif(jpeg({ gps: [36.91579, 174.92425] })); assert.ok(Math.abs(e.lat + 36.91579) < 1e-4 && Math.abs(e.lng - 174.92425) < 1e-4); });
t('a picture with no camera details has no time (WhatsApp strips them)', () => { assert.equal(readExif(new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 4, 0, 0, 0xFF, 0xDA, 0, 2])), null); assert.equal(readExif(new Uint8Array([1, 2, 3])), null); assert.equal(photoTime(null), null); });
t('a photo taken on the run’s day stands as the delivery record', () => { const p = photoProof(readExif(jpeg()), '2026-11-14', Date.parse('2026-11-13T22:00:00Z')); assert.ok(p.ok); assert.equal(p.at.toISOString(), '2026-11-13T16:46:56.000Z'); });
t('a photo from another day, the future, or with no time does not', () => {
  assert.equal(photoProof(readExif(jpeg()), '2026-11-13', Date.parse('2026-11-14T22:00:00Z')).ok, false);
  assert.equal(photoProof(readExif(jpeg()), '2026-11-14', Date.parse('2026-11-13T10:00:00Z')).ok, false);
  assert.match(photoProof(null, '2026-11-14').why, /WhatsApp/); });
console.log(failed ? `${failed} failed` : 'all passed'); process.exit(failed ? 1 : 0);
