// When and where a photo was really taken, read from the photo file itself (decision 0030).
// Cameras write this into every JPEG ("EXIF"). Pictures passed through WhatsApp or Messenger lose it.
// Pure: bytes in, facts out. Never throws: a file it can't read just has no facts.

/** bytes: Uint8Array of the start of a JPEG. Returns { taken: 'YYYY-MM-DDTHH:MM:SS', offset: '+13:00' | null, lat, lng } or null. */
export function readExif(bytes) {
  try {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (v.getUint16(0) !== 0xFFD8) return null;
    let p = 2;
    while (p + 4 <= v.byteLength) {
      const marker = v.getUint16(p); const size = v.getUint16(p + 2);
      if (marker === 0xFFE1 && v.getUint32(p + 4) === 0x45786966) return tiff(v, p + 10, Math.min(v.byteLength, p + 2 + size));
      if ((marker & 0xFF00) !== 0xFF00 || marker === 0xFFDA) break;
      p += 2 + size;
    }
  } catch { /* not a photo we can read */ }
  return null;
}

function tiff(v, base, end) {
  const le = v.getUint16(base) === 0x4949;
  const u16 = (o) => v.getUint16(o, le); const u32 = (o) => v.getUint32(o, le);
  const entries = (ifd) => {
    const out = new Map(); if (!ifd || base + ifd + 2 > end) return out;
    const n = u16(base + ifd);
    for (let i = 0; i < n; i++) { const e = base + ifd + 2 + i * 12; if (e + 12 > end) break; out.set(u16(e), { type: u16(e + 2), count: u32(e + 4), at: e + 8 }); }
    return out;
  };
  const text = (e) => { if (!e || e.type !== 2) return null; const o = e.count > 4 ? base + u32(e.at) : e.at; if (o + e.count > end) return null; let s = ''; for (let i = 0; i < e.count; i++) { const c = v.getUint8(o + i); if (!c) break; s += String.fromCharCode(c); } return s.trim(); };
  const rationals = (e) => { if (!e || e.type !== 5 || e.count < 3) return null; const o = base + u32(e.at); if (o + 24 > end) return null; return [0, 1, 2].map((i) => u32(o + i * 8) / (u32(o + i * 8 + 4) || 1)); };
  const ifd0 = entries(u32(base + 4));
  const exif = ifd0.has(0x8769) ? entries(u32(ifd0.get(0x8769).at)) : new Map();
  const raw = text(exif.get(0x9003)) || text(exif.get(0x9004)); // DateTimeOriginal, else DateTimeDigitized (not "last changed")
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(raw || '');
  if (!m || m[1] < '2000') return null;
  const off = text(exif.get(0x9011)) || text(exif.get(0x9012));
  const out = { taken: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`, offset: /^[+-]\d{2}:\d{2}$/.test(off || '') ? off : null, lat: null, lng: null };
  if (ifd0.has(0x8825)) {
    const g = entries(u32(ifd0.get(0x8825).at)); const la = rationals(g.get(2)); const lo = rationals(g.get(4));
    const deg = (r, ref, neg) => (r[0] + r[1] / 60 + r[2] / 3600) * (ref === neg ? -1 : 1);
    if (la && lo) { const lat = deg(la, text(g.get(1)), 'S'); const lng = deg(lo, text(g.get(3)), 'W'); if ((lat || lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) { out.lat = +lat.toFixed(6); out.lng = +lng.toFixed(6); } }
  }
  return out;
}

/** The moment the photo was taken, as a Date. A camera that doesn't say its time zone is taken to be on New Zealand time. */
export function photoTime(exif, tz = 'Pacific/Auckland') {
  if (!exif?.taken) return null;
  if (exif.offset) { const d = new Date(`${exif.taken}${exif.offset}`); return Number.isNaN(+d) ? null : d; }
  const wall = Date.parse(`${exif.taken}Z`); if (Number.isNaN(wall)) return null;
  const shown = (t) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t)).map((x) => [x.type, x.value])); return Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`); };
  let t = wall; for (let i = 0; i < 3; i++) t += wall - shown(t);
  return new Date(t);
}

/**
 * Can this photo stand as the delivery record? Only when the photo itself says when it was taken,
 * that was on the run's delivery day (NZ), and it isn't in the future.
 * Returns { ok, at, why }.
 */
export function photoProof(exif, deliveryDate, now = Date.now(), tz = 'Pacific/Auckland') {
  const at = photoTime(exif, tz);
  if (!at) return { ok: false, at: null, why: 'The photo doesn’t say when it was taken (pictures sent through WhatsApp lose this).' };
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(at);
  if (+at > now + 5 * 60e3) return { ok: false, at, why: 'The photo’s time is in the future, so the phone’s clock was wrong.' };
  if (day !== deliveryDate) return { ok: false, at, why: 'The photo was taken on a different day from this run.' };
  return { ok: true, at, why: '' };
}
